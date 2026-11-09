/**
 * Death and the state-based pass that follows every change to the board: a
 * hero at 0 HP falls in place (the push into its side's structures, then the
 * Rejuvenator's revive or the wait before it goes back to the hand), the
 * Mid-Boss at 0 HP falls (map.ts), and a fallen Active is replaced. `resolve`
 * is the one entry point; call it after ANY mutation (combat, ability, status
 * tick, turn start, promotion).
 */
import type { CardInstance, GameState, PlayerID, PlayerState } from './types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { pushLog } from './log';
import { pushFx } from './fx';
import {
  fallPending, findCardOnBoard, isRespawning, killPush, laneOpen, otherPlayer, promptOwed, respawnTimer, reviveReady, stepInCandidates,
} from './query';
import { fireTriggers } from './triggers';
import { grantExp } from './expSystem';
import { EXP_ON_KILL } from './constants';
import { leaveActive } from './lane';
import { awardSouls } from './souls';
import { pushStructures, reapBoss } from './map';
import { heroToHand } from './deck';

export { awardSouls };

/**
 * Process a hero's death in place: the push into its side's structures and
 * the kill on the record (to and for the victim's opponent, whatever dealt
 * the blow: a status tick's source is theirs, Return Fire is theirs — and
 * neither for a fall to the Mid-Boss's blow, `unpaid`). A kill pays no souls.
 * Then the statuses are wiped, and either the hero is revived on the spot
 * (its side's Rejuvenator, a credit spent) or it waits RESPAWN_TURNS of its
 * owner's turns in its slot as a corpse (`respawnTimer`) before it goes back
 * to the hand — straight there when the wait is 0. Level / exp / equipment /
 * atkMod / spiritMod / hpMax and the cooldowns (timers of the owner's turns,
 * not of the hero's life) all persist — only the live combat state (hp,
 * statuses, turn flags) resets. `tickRespawn` sends it to the hand when the
 * wait is over.
 */
export function killInPlace(G: GameState, ps: PlayerState, hero: CardInstance, opts: { unpaid?: boolean } = {}) {
  pushLog(G, `${cardName(hero.cardId)} fell.`);
  payHeldExp(G, hero);
  const oppId: PlayerID = otherPlayer(ps.id);
  if (!opts.unpaid) {
    // The push: the victim's level plus one (doubled in the late game) into
    // the victim's side's front structure. No souls: the lane's income is all.
    G.record[oppId].kills++;
    pushStructures(G, ps.id, killPush(G, hero), 'kill');
    // A knockout while a hero stands in the other side's lane: its passive
    // may feed on it (Drifter's Bloodscent).
    const rival = G.players[oppId].active;
    if (rival && !isRespawning(rival) && rival.hp > 0) fireTriggers(G, rival, 'onRivalFall', { only: 'passives', target: hero, movingPlayer: oppId });
  }
  const timer = respawnTimer(G, hero);
  // The rescue: a riding Rem (Tag Along) jumps back to the bench instead of
  // falling with her bearer — to the hand when the bench has no room — and any
  // max HP a ride granted is taken back here too. (A riding hero is the only
  // attached card that carries a ride timer.)
  const rem = hero.attached?.find((a) => a.remMergeTurnsLeft != null);
  if (rem) returnRemToBench(G, ps, hero, rem, { bearerFalls: true });
  // Revert any temporary Siphon Bullets max-HP swing before statuses are wiped,
  // so the hero comes back with its true max HP.
  const sDrain = hero.statuses.find((s) => s.id === 'siphon_drain');
  if (sDrain) hero.hpMax += sDrain.value;
  const sGain = hero.statuses.find((s) => s.id === 'siphon_gain');
  if (sGain) hero.hpMax -= sGain.value;
  hero.statuses = [];
  hero.skillUsedThisTurn = false;
  if (hero.lastSkillUsed !== undefined) hero.lastSkillUsed = undefined;
  // The Rejuvenator: a credit brings the hero straight back where it fell, at
  // full HP with its items and level (the kill above has pushed).
  if (reviveReady(G, ps.id)) {
    ps.reviveCredits--;
    hero.hp = hero.hpMax;
    hero.exhausted = false;
    G.record[ps.id].revives++;
    pushLog(G, `${cardName(hero.cardId)} is revived by the Rejuvenator (${ps.reviveCredits} left).`);
    pushFx(G, { kind: 'revive', iid: hero.iid, credit: true });
    return;
  }
  hero.exhausted = true;
  hero.hp = 0;
  // No wait: the hero goes straight to the hand, its slot left empty.
  if (timer <= 0) {
    heroToHand(G, ps, hero);
    return;
  }
  hero.respawnTurnsLeft = timer;
  // Level + exp + stat mods INTENTIONALLY persist — the hero comes back to the
  // hand with its rank intact (see leveling.spec).
  pushLog(G, `${cardName(hero.cardId)} goes back to the hand in ${timer} turn${timer === 1 ? '' : 's'}.`);
}

/** The kill exp a hero that may cancel its own fall held back (`downedBy`,
 *  damageUnit), paid now that the fall goes ahead: to the hero whose blow it
 *  was, if it still stands. */
function payHeldExp(G: GameState, hero: CardInstance) {
  const killerIid = hero.downedBy;
  if (killerIid === undefined) return;
  hero.downedBy = undefined;
  const killer = findCardOnBoard(G, killerIid)?.card;
  if (killer && killer !== hero && killer.hp > 0 && !isRespawning(killer)) grantExp(G, killer, EXP_ON_KILL);
}

/** The moment `hero` of `ps` falls (its HP at 0). The optional triggers its
 *  player can use at it are asked first (`fireTriggers` → prompts.ts): then
 *  the fall waits on the answer, the hero at 0 HP where it stood, and the
 *  answer settles it. With nothing to ask, it falls now (`killInPlace`). */
function fall(G: GameState, ps: PlayerState, hero: CardInstance, opts: { unpaid?: boolean } = {}) {
  if (fireTriggers(G, hero, 'onFall', { movingPlayer: ps.id, prompt: opts.unpaid ? { unpaid: true } : {} })) return;
  killInPlace(G, ps, hero, opts);
}

/** `hero` of `ps` has fallen to the Mid-Boss's blow (`hp` 0, the End step):
 *  it falls as any hero does — a trigger may still answer its fall, the
 *  Rejuvenator still revives it — but the boss pays no bounty and pushes
 *  nothing. */
export function fallToBoss(G: GameState, ps: PlayerState, hero: CardInstance) {
  if (hero.hp > 0 || hero.respawnTurnsLeft != null || fallPending(G, hero)) return;
  fall(G, ps, hero, { unpaid: true });
}

/**
 * `rider`, a hero of `ps` standing in a slot, rides on `bearer`, another of
 * `ps`'s standing heroes, as equipment for `turns` of her owner's turns (Rem's
 * Tag Along): out of her slot and into the bearer's `attached` list. While she
 * rides nothing can hit or aim at her and she uses nothing — the board's
 * sweeps, `findCardOnBoard` and the targets read the slots only — and she
 * takes no item slot (`wornItems`). From the bench, her slot is kept for her
 * (`freeBenchSlots`: her `slot` still names it); from the lane, she leaves it
 * empty (`slot` 0: she takes the first free bench slot when she comes back),
 * and the state-based pass that follows the ability has her side fill it as
 * when an Active falls — the human seat is asked (`pendingPromotion`), an AI
 * seat promotes at once. `tickRemMerges` counts the ride down at her owner's
 * turn start and `returnRemToBench` ends it.
 */
export function rideOn(G: GameState, ps: PlayerState, rider: CardInstance, bearer: CardInstance, turns: number) {
  if (ps.active === rider) {
    leaveActive(G, rider);
    ps.active = null;
  } else {
    const idx = ps.bench.indexOf(rider);
    if (idx < 0) return;
    ps.bench[idx] = null;
  }
  rider.zone = 'equipment';
  rider.attachedTo = bearer.iid;
  rider.remMergeTurnsLeft = turns;
  (bearer.attached ??= []).push(rider);
  pushLog(G, `${cardName(rider.cardId)} rides on ${cardName(bearer.cardId)} for ${turns} turn${turns === 1 ? '' : 's'}.`);
}

/**
 * End a ride: detach the riding Rem from `bearer` and put her back in a real
 * bench slot — the one she rode from the bench out of (kept for her: nothing
 * writes into it while she rides), or, having ridden from the lane, the first
 * free one — with her `slot` saying where she landed; any max HP a ride
 * granted (`remMergeHpBuff`; Tag Along grants none) is taken back. Shared by
 * the ride's countdown (`tickRemMerges`) and the bearer's fall
 * (`killInPlace`).
 *
 * With no free slot (she rode from the lane and the bench has filled since)
 * she is never dropped. At the countdown she rides on one more turn, with a
 * log line saying so, and tries again at her owner's next turn start; when
 * her bearer falls (`bearerFalls`) she cannot stay on a corpse, and goes back
 * to the hand instead, as a fallen hero does (`heroToHand`).
 */
export function returnRemToBench(G: GameState, ps: PlayerState, bearer: CardInstance, rem: CardInstance, opts: { bearerFalls?: boolean } = {}) {
  const own = (rem.slot ?? 1) - 1;
  const slotIdx = own >= 0 && own < ps.bench.length && ps.bench[own] == null ? own : ps.bench.findIndex((b) => b == null);
  if (slotIdx < 0 && !opts.bearerFalls) {
    pushLog(G, `${cardName(rem.cardId)} has no free bench slot and rides on one more turn.`);
    rem.remMergeTurnsLeft = 1;
    return;
  }
  const buff = rem.remMergeHpBuff ?? 0;
  bearer.hpMax = Math.max(1, bearer.hpMax - buff);
  if (bearer.hp > bearer.hpMax) bearer.hp = bearer.hpMax;
  if (bearer.attached) bearer.attached = bearer.attached.filter((a) => a !== rem);
  rem.remMergeTurnsLeft = undefined;
  rem.remMergeHpBuff = undefined;
  rem.attachedTo = undefined;
  if (slotIdx < 0) {
    pushLog(G, `${cardName(rem.cardId)} has no free bench slot and jumps back to the hand.`);
    heroToHand(G, ps, rem);
    return;
  }
  rem.zone = 'bench';
  rem.slot = (slotIdx + 1) as 1 | 2 | 3;
  ps.bench[slotIdx] = rem;
  pushLog(G, `${cardName(rem.cardId)} returns to the bench.`);
}

/**
 * Sweep a player's board for heroes that just hit 0 HP. The hero stays in its
 * slot — `killInPlace` arms the respawn timer instead of moving them out.
 * (`resolve` then promotes a bench hero into a fallen Active's slot.)
 */
export function reapDead(G: GameState, ps: PlayerState) {
  // A hero whose fall waits on a trigger prompt is left where it is.
  if (ps.active && ps.active.hp <= 0 && ps.active.respawnTurnsLeft == null && !fallPending(G, ps.active)) {
    fall(G, ps, ps.active);
  }
  for (const b of ps.bench) {
    if (b && b.hp <= 0 && b.respawnTurnsLeft == null && !fallPending(G, b)) {
      fall(G, ps, b);
    }
  }
}

/** Does this player owe a forced promotion — its Active slot is empty or a
 *  corpse (`laneOpen`) AND an eligible (alive, non-bench-only) bench hero can
 *  step up? */
function needsPromotion(ps: PlayerState): boolean {
  return laneOpen(ps) && stepInCandidates(ps).length > 0;
}

/**
 * The single state-based-actions pass. Run this after ANY board mutation
 * (combat, ability, status tick, turn start, promotion) — it resolves the
 * board to a stable state in ONE fixed, linear order so no caller can forget a
 * step or leave a half-resolved board:
 *
 *   1. Reap dead heroes (both players) — the bounty and the push, then a
 *      revive or the respawn timer — and a Mid-Boss at 0 HP (map.ts). A
 *      hero's fall may first be asked about (a trigger prompt): then it
 *      waits, and while a prompt is owed the pass stops here.
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
  reapBoss(G);
  // A trigger prompt owed comes first: the promotions wait for its answer,
  // which runs this pass again (prompts.ts).
  if (promptOwed(G)) { G.pendingPromotion = undefined; return; }
  const human = G.humanSeat === undefined ? '0' : G.humanSeat;
  for (const pid of ['0', '1'] as PlayerID[]) if (pid !== human) autoPromoteAi(G, G.players[pid]);
  G.pendingPromotion = human !== null && needsPromotion(G.players[human]) ? human : undefined;
}

/**
 * If an AI seat's Active slot is empty or a corpse and there's an alive bench
 * hero, put the strongest bench hero in it. Heuristic: highest current HP. A
 * corpse takes the bench slot the new Active vacated and continues its wait
 * there; an empty Active slot leaves that bench slot empty.
 */
export function autoPromoteAi(G: GameState, ps: PlayerState) {
  if (!laneOpen(ps)) return;
  const candidates = stepInCandidates(ps);
  if (candidates.length === 0) return;
  // Highest HP steps up; on a tie, the earliest bench slot.
  const benchHero = candidates.reduce((best, b) => (b.hp > best.hp ? b : best));
  promoteFromBench(G, ps, benchHero);
}

/** `benchHero`, on `ps`'s bench, takes the Active slot (empty, or a corpse's):
 *  the corpse, if there is one, takes the bench slot it leaves. Free, and no
 *  step-in (a forced replacement, not a move its player chose). */
export function promoteFromBench(G: GameState, ps: PlayerState, benchHero: CardInstance) {
  const idx = ps.bench.indexOf(benchHero);
  const corpse = ps.active;
  if (corpse) leaveActive(G, corpse);
  ps.active = benchHero;
  benchHero.zone = 'active';
  benchHero.slot = 0;
  ps.bench[idx] = corpse;
  if (corpse) {
    corpse.zone = 'bench';
    corpse.slot = (idx + 1) as 1 | 2 | 3;
  }
  const data = CARDS_BY_ID[benchHero.cardId];
  pushLog(G, `P${ps.id} promoted ${data?.name ?? benchHero.cardId} to Active.`);
}
