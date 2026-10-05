/**
 * Death and the state-based pass that follows every change to the board: a
 * hero at 0 HP falls in place (respawn timer, patron tax, KO bounty), and a
 * fallen Active is replaced. `resolve` is the one entry point; call it after
 * ANY mutation (combat, ability, status tick, turn start, promotion).
 */
import type { CardInstance, GameState, PlayerID, PlayerState } from './types';
import { CARDS_BY_ID } from '@/cards';
import { pushLog } from './log';
import { damagePlayer } from './damage';
import { isRespawning, stepInCandidates } from './query';
import { KO_PATRON_DAMAGE, RESPAWN_TURNS, SOULS_MAX } from './constants';

/**
 * Process a hero's death in place: wipe active statuses, arm the respawn
 * timer, charge the death cost. Level / exp / equipment / atkMod / spiritMod /
 * hpMax all persist — only the live combat state (hp, statuses, turn flags)
 * resets. `tickRespawn` brings the hero back at full hp when the timer ticks down.
 */
export function killInPlace(G: GameState, ps: PlayerState, hero: CardInstance) {
  pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} fell.`);
  // Cap the KO bounty at the soul ceiling. Using a lower cap would *reduce* a
  // player's souls when they scored a kill while holding 8–10 — the bounty
  // must never subtract.
  const oppId: PlayerID = ps.id === '0' ? '1' : '0';
  const before = G.players[oppId].souls;
  G.players[oppId].souls = Math.min(SOULS_MAX, before + 1);
  if (G.players[oppId].souls > before) pushLog(G, `P${oppId} +1 Souls (KO bounty).`);
  damagePlayer(G, ps.id, KO_PATRON_DAMAGE);
  // Rem rescue: a merged Rem detaches to safety (back to the bench) instead of
  // dying with the body — and her granted max-HP is reverted here too. (A
  // merged Rem is the only attached card that carries a merge timer.)
  const rem = hero.attached?.find((a) => a.remMergeTurnsLeft != null);
  if (rem) returnRemToBench(G, ps, hero, rem);
  // Revert any temporary Siphon Bullets max-HP swing before statuses are wiped,
  // so the hero respawns with its true max HP.
  const sDrain = hero.statuses.find((s) => s.id === 'siphon_drain');
  if (sDrain) hero.hpMax += sDrain.value;
  const sGain = hero.statuses.find((s) => s.id === 'siphon_gain');
  if (sGain) hero.hpMax -= sGain.value;
  hero.statuses = [];
  hero.skillUsedThisTurn = false;
  hero.attackedThisTurn = false;
  hero.exhausted = true;
  hero.hp = 0;
  hero.respawnTurnsLeft = RESPAWN_TURNS;
  // Level + exp + stat mods INTENTIONALLY persist through respawn — the
  // hero comes back at full hp with their rank intact (see leveling.spec).
  pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} respawning in (${RESPAWN_TURNS}).`);
}

/**
 * Detach a merged Rem from `bearer` and return her to her bench slot: reverts
 * the temporary max-HP she granted, pulls her out of `bearer.attached`, and
 * drops her back into her original bench slot (or the first free one). Shared
 * by the merge-countdown expiry (tickRemMerges) and the bearer-death rescue.
 */
export function returnRemToBench(G: GameState, ps: PlayerState, bearer: CardInstance, rem: CardInstance) {
  const buff = rem.remMergeHpBuff ?? 0;
  bearer.hpMax = Math.max(1, bearer.hpMax - buff);
  if (bearer.hp > bearer.hpMax) bearer.hp = bearer.hpMax;
  if (bearer.attached) bearer.attached = bearer.attached.filter((a) => a !== rem);
  rem.remMergeTurnsLeft = undefined;
  rem.remMergeHpBuff = undefined;
  rem.zone = 'bench';
  rem.attachedTo = undefined;
  const slotIdx = (rem.slot ?? 1) - 1;
  if (slotIdx >= 0 && slotIdx < ps.bench.length && ps.bench[slotIdx] == null) {
    ps.bench[slotIdx] = rem;
  } else {
    const free = ps.bench.findIndex((b) => b == null);
    if (free >= 0) ps.bench[free] = rem;
  }
  pushLog(G, `Rem returns to the bench.`);
}

/**
 * Sweep a player's board for heroes that just hit 0 HP. The hero stays in its
 * slot — `killInPlace` arms the respawn timer instead of moving them out.
 * Then, for AI (player '1'), immediately auto-promote a bench hero into the
 * vacated Active slot so the engine never sits idle waiting on AI's turn to
 * pick a replacement. Player '0' (the human) keeps the manual choice via the
 * PromotionOverlay.
 */
export function reapDead(G: GameState, ps: PlayerState) {
  if (ps.active && ps.active.hp <= 0 && ps.active.respawnTurnsLeft == null) {
    killInPlace(G, ps, ps.active);
  }
  for (const b of ps.bench) {
    if (b && b.hp <= 0 && b.respawnTurnsLeft == null) {
      killInPlace(G, ps, b);
    }
  }
}

/** Does this player owe a forced promotion — Active is a corpse AND an eligible
 *  (alive, non-bench-only) bench hero can step up? */
export function needsPromotion(ps: PlayerState): boolean {
  if (!ps.active || !isRespawning(ps.active)) return false;
  return stepInCandidates(ps).length > 0;
}

/**
 * The single state-based-actions pass. Run this after ANY board mutation
 * (combat, ability, status tick, turn start, promotion) — it resolves the
 * board to a stable state in ONE fixed, linear order so no caller can forget a
 * step or leave a half-resolved board:
 *
 *   1. Reap dead heroes (both players) — arm respawn timers + the patron tax.
 *   2. Forced promotions — the AI side ('1') auto-promotes its strongest bench
 *      hero immediately; the local side ('0') is surfaced via `pendingPromotion`
 *      for the UI (human modal) or the auto-play loop to resolve.
 *
 * The win check is intentionally NOT here — boardgame.io's `endIf` is the
 * canonical gate and runs after every move on the already-resolved state.
 */
export function resolve(G: GameState) {
  reapDead(G, G.players['0']);
  reapDead(G, G.players['1']);
  autoPromoteAi(G, G.players['1']);
  G.pendingPromotion = needsPromotion(G.players['0']) ? '0' : undefined;
}

/**
 * If AI's Active is a corpse and there's an alive bench hero, swap the
 * strongest bench hero into Active. Heuristic: highest current HP. The dying
 * corpse takes the bench slot the new Active vacated and continues its
 * respawn countdown there.
 */
export function autoPromoteAi(G: GameState, ps: PlayerState) {
  if (!ps.active || !isRespawning(ps.active)) return;
  const candidates = stepInCandidates(ps);
  if (candidates.length === 0) return;
  // Highest HP steps up; on a tie, the earliest bench slot.
  const benchHero = candidates.reduce((best, b) => (b.hp > best.hp ? b : best));
  const bestIdx = ps.bench.indexOf(benchHero);
  const corpse = ps.active;
  ps.active = benchHero;
  benchHero.zone = 'active';
  benchHero.slot = 0;
  ps.bench[bestIdx] = corpse;
  corpse.zone = 'bench';
  corpse.slot = (bestIdx + 1) as 1 | 2 | 3;
  const data = CARDS_BY_ID[benchHero.cardId];
  pushLog(G, `P${ps.id} promoted ${data?.name ?? benchHero.cardId} to Active.`);
}
