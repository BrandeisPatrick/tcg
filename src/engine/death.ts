/**
 * Death and the state-based pass that follows every change to the board: a
 * hero at 0 HP falls in place (respawn timer, a patron tax of its level, the
 * kill bounty), and a fallen Active is replaced. `resolve` is the one entry
 * point; call it after ANY mutation (combat, ability, status tick, turn start,
 * promotion).
 */
import type { CardInstance, GameState, PlayerID, PlayerState } from './types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { pushLog } from './log';
import { damagePlayer } from './damage';
import { isRespawning, isRichestHero, killBounty, koPatronDamage, otherPlayer, stepInCandidates } from './query';
import { leaveActive } from './lane';
import { RESPAWN_TURNS } from './constants';

/**
 * Give `pid` `n` souls. Souls accumulate with no ceiling, and a payment never
 * subtracts (a negative `n` pays nothing). The log says what was gained
 * (nothing is logged when nothing was) and why. Returns the souls gained.
 */
export function awardSouls(G: GameState, pid: PlayerID, n: number, reason?: string): number {
  const gained = Math.max(0, Math.floor(n));
  G.players[pid].souls += gained;
  if (gained > 0) pushLog(G, `P${pid} +${gained} Souls${reason ? ` (${reason})` : ''}.`);
  return gained;
}

/**
 * Process a hero's death in place: pay the kill bounty, charge the patron,
 * wipe the statuses, arm the respawn timer. Level / exp / equipment / atkMod /
 * spiritMod / hpMax and the cooldowns (timers of the owner's turns, not of the
 * hero's life) all persist — only the live combat state (hp, statuses, turn
 * flags) resets. `tickRespawn` brings the hero back at full hp, its items
 * re-applied, when the timer ticks down.
 */
function killInPlace(G: GameState, ps: PlayerState, hero: CardInstance) {
  pushLog(G, `${cardName(hero.cardId)} fell.`);
  // The kill bounty goes to the victim's opponent, whatever dealt the blow (a
  // status tick's source is theirs, Return Fire is theirs): the victim's level
  // plus one, and two more for the richest hero on the board.
  const oppId: PlayerID = otherPlayer(ps.id);
  awardSouls(G, oppId, killBounty(G, hero), isRichestHero(G, hero) ? 'KO bounty, richest hero' : 'KO bounty');
  // The patron pays the fallen hero's level: a leveled carry is the costliest
  // loss on the board.
  damagePlayer(G, ps.id, koPatronDamage(hero));
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
  if (hero.lastSkillUsed !== undefined) hero.lastSkillUsed = undefined;
  hero.exhausted = true;
  hero.hp = 0;
  hero.respawnTurnsLeft = RESPAWN_TURNS;
  // Level + exp + stat mods INTENTIONALLY persist through respawn — the
  // hero comes back at full hp with their rank intact (see leveling.spec).
  pushLog(G, `${cardName(hero.cardId)} respawning in (${RESPAWN_TURNS}).`);
}

/**
 * Detach a merged Rem from `bearer` and return her to a real bench slot:
 * reverts the temporary max-HP she granted, pulls her out of `bearer.attached`,
 * and drops her back into the slot she left (or the first free one), with her
 * `slot` saying where she landed. Shared by the merge-countdown expiry
 * (tickRemMerges) and the bearer-death rescue.
 *
 * The slot she left is always free: she merged out of it, and nothing writes
 * into an empty bench slot (moveBlocked refuses a swap with a hole; the other
 * bench moves trade two occupied slots). If that ever stopped being true she
 * would have nowhere to go, and she is not dropped: she stays merged, with a
 * log line saying so, and tries again at her owner's next turn start.
 */
export function returnRemToBench(G: GameState, ps: PlayerState, bearer: CardInstance, rem: CardInstance) {
  const own = (rem.slot ?? 1) - 1;
  const slotIdx = own >= 0 && own < ps.bench.length && ps.bench[own] == null ? own : ps.bench.findIndex((b) => b == null);
  if (slotIdx < 0) {
    pushLog(G, `Rem has no free bench slot and stays merged.`);
    rem.remMergeTurnsLeft = 1;
    return;
  }
  const buff = rem.remMergeHpBuff ?? 0;
  bearer.hpMax = Math.max(1, bearer.hpMax - buff);
  if (bearer.hp > bearer.hpMax) bearer.hp = bearer.hpMax;
  if (bearer.attached) bearer.attached = bearer.attached.filter((a) => a !== rem);
  rem.remMergeTurnsLeft = undefined;
  rem.remMergeHpBuff = undefined;
  rem.zone = 'bench';
  rem.attachedTo = undefined;
  rem.slot = (slotIdx + 1) as 1 | 2 | 3;
  ps.bench[slotIdx] = rem;
  pushLog(G, `Rem returns to the bench.`);
}

/**
 * Sweep a player's board for heroes that just hit 0 HP. The hero stays in its
 * slot — `killInPlace` arms the respawn timer instead of moving them out.
 * (`resolve` then promotes a bench hero into a fallen Active's slot.)
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
function needsPromotion(ps: PlayerState): boolean {
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
 *   2. Forced promotions — every seat the AI plays (all but `G.humanSeat`)
 *      auto-promotes its strongest bench hero immediately; the human seat is
 *      surfaced via `pendingPromotion` for the UI (human modal) or the
 *      auto-play loop to resolve. With no human seat (a sim) both seats
 *      promote on the spot, by the same rule.
 *
 * The win check is intentionally NOT here — boardgame.io's `endIf` is the
 * canonical gate and runs after every move on the already-resolved state.
 */
export function resolve(G: GameState) {
  reapDead(G, G.players['0']);
  reapDead(G, G.players['1']);
  const human = G.humanSeat === undefined ? '0' : G.humanSeat;
  for (const pid of ['0', '1'] as PlayerID[]) if (pid !== human) autoPromoteAi(G, G.players[pid]);
  G.pendingPromotion = human !== null && needsPromotion(G.players[human]) ? human : undefined;
}

/**
 * If an AI seat's Active is a corpse and there's an alive bench hero, swap the
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
  leaveActive(G, corpse);
  ps.active = benchHero;
  benchHero.zone = 'active';
  benchHero.slot = 0;
  ps.bench[bestIdx] = corpse;
  corpse.zone = 'bench';
  corpse.slot = (bestIdx + 1) as 1 | 2 | 3;
  const data = CARDS_BY_ID[benchHero.cardId];
  pushLog(G, `P${ps.id} promoted ${data?.name ?? benchHero.cardId} to Active.`);
}
