/**
 * What happens at the edges of a turn. boardgame.io's turn hooks call these:
 * `beginTurn` runs for the player whose turn is starting, `endTurnEffects` for
 * the one whose turn is ending. During the draft, turns only decide who picks
 * next — the match's start- and end-of-turn pipeline must not fire on empty
 * boards and decks — so both do nothing until the draft is over, and the end
 * of the draft's last turn (engine turn 0) is no match turn either.
 */
import type { CardInstance, GameState, PlayerID } from '../types';
import { cardName } from '@/cards';
import { tickStartOfTurn, tickEndOfTurnCC, clearTurnFlags, tickCastingPulses, tickRemMerges, tickCooldowns } from '../statusOps';
import { fallToBoss, resolve } from '../death';
import {
  attackPower, findCardOnBoard, heroData, isRespawning, liveBoardCards, otherPlayer, standingBoss,
  standingVerdict, structureHp,
} from '../query';
import { endsLastRound, ownTurn, pushMultiplier, round, secondMover } from '../rounds';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { fireTriggers, type Trigger } from '../triggers';
import { grantExp } from '../expSystem';
import { damageUnit } from '../damage';
import { lapseRevives, pushStructures, riseBoss } from '../map';
import { drawCards, heroToHand } from '../deck';
import {
  BOSS_RETALIATION, DRAW_PER_TURN, EXP_PER_TURN_ACTIVE, EXP_PER_TURN_BENCH, LANE_INCOME, ROUND_CAP, SECOND_MOVER_FIRST_INCOME_BONUS,
} from '../constants';

/** Fire a turn-edge trigger for every living hero of `pid`: the hero's own
 *  passives, then what it wears (Extra Regen heals 1 each start of turn). */
function fireBoardTriggers(G: GameState, pid: PlayerID, trigger: Trigger) {
  for (const c of liveBoardCards(G.players[pid])) {
    if (!heroData(c)) continue;
    fireTriggers(G, c, trigger, { movingPlayer: pid });
  }
}

/** Souls `pid` collects at the start of its own turn: the lane's income (the
 *  only souls there are) and the second mover's bonus on its first turn. */
function income(G: GameState, pid: PlayerID): { total: number; seat: number } {
  const seat = pid === secondMover(G) && ownTurn(G, pid) === 1 ? SECOND_MOVER_FIRST_INCOME_BONUS : 0;
  return { total: LANE_INCOME + seat, seat };
}

/**
 * Tick down the wait of `pid`'s heroes that are corpses in their slots. On
 * reaching 0 the hero leaves the board for the hand, at full HP, its level and
 * its items intact (`heroToHand`), and its slot is left empty — the state-based
 * pass then fills an empty Active slot from the bench.
 */
function tickRespawn(G: GameState, pid: PlayerID) {
  const ps = G.players[pid];
  const corpses: CardInstance[] = [];
  if (ps.active && isRespawning(ps.active)) corpses.push(ps.active);
  for (const b of ps.bench) if (b && isRespawning(b)) corpses.push(b);

  for (const hero of corpses) {
    hero.respawnTurnsLeft = (hero.respawnTurnsLeft ?? 0) - 1;
    if (hero.respawnTurnsLeft <= 0) heroToHand(G, ps, hero);
  }
}

/** The start of `pid`'s turn — its Income and its draw. `ctxTurn` is
 *  boardgame.io's turn count, which includes the draft's turns; the engine
 *  turn is that minus the offset captured when the draft finished. In order:
 *  the turn's flags reset, the Mid-Boss rises if its round has come, the
 *  start-of-turn ticks, cooldowns (heroes' and items') and Rem's merge, the
 *  income, fallen heroes whose wait is over going back to the hand, the draw
 *  (DRAW_PER_TURN; skipped into a full hand, nothing from an empty deck), the
 *  start-of-turn passives and gear, and the state-based pass. */
export function beginTurn(G: GameState, pid: PlayerID, ctxTurn: number) {
  if (G.draft) return;
  const ps = G.players[pid];
  const realTurn = ctxTurn - G.draftTurnsOffset;
  G.turnNumber = realTurn;
  G.attackUsed = false;
  G.retreatUsed = false;
  G.bossAttacker = null;
  riseBoss(G);
  tickStartOfTurn(G, ps);
  // Cooldowns count the owner's turns, so they come down here too (on a corpse as well).
  tickCooldowns(ps);
  // Count down Rem's "Lil Helpers" merges; expired ones return her to bench.
  tickRemMerges(G, ps);
  // Income: souls accumulate — nothing banked is lost, and the lane pays on
  // top of it every own turn, the first included.
  const paid = income(G, pid);
  ps.souls += paid.total;
  pushLog(G, `P${pid} +${paid.total} Souls (income${paid.seat ? `, +${paid.seat} second mover` : ''}).`);
  // The wait ticks ONLY for the player whose turn is starting, so a corpse
  // counts down once per round (on its owner's turn): a timer of N is N of the
  // owner's turns of downtime (RESPAWN_TURNS).
  tickRespawn(G, pid);
  drawCards(G, pid, DRAW_PER_TURN);
  fireBoardTriggers(G, pid, 'startOfTurn');
  resolve(G);
  pushLog(G, `--- Turn ${realTurn}, player ${pid} ---`);
}

/** The end of `pid`'s turn — its End step. In order: the end-of-turn
 *  passives, the channels' pulses, the state-based pass (what they felled pays
 *  and pushes now), the push into an empty lane, the Mid-Boss's blow at the
 *  hero that attacked it, exp for standing the turn, the CC that ran its
 *  course, the turn flags, and a last state-based pass; then, as a round ends,
 *  a Rejuvenator past its last round lapses, and after round ROUND_CAP the
 *  match is decided on what stands (`G.capped`). */
export function endTurnEffects(G: GameState, pid: PlayerID) {
  // The draft's turns, and the last one (which hands the first turn over), are no match turns.
  if (G.draft || G.turnNumber < 1) return;
  // The board-FX stream is flushed here, ahead of everything the turn's end does
  // (and so ahead of the next turn's start, which follows in the same reducer
  // call). What the board sees after `endTurn` is then one batch: the end-of-turn
  // pulses, wake-ups and level-ups, and the next turn's start ticks.
  G.fx = [];
  // Ending the turn never attacks: a turn that ends without the `attack`
  // move simply forgoes it.
  fireBoardTriggers(G, pid, 'endOfTurn');
  // Channeled ultimates (Dynamo / Seven / Warden) pulse their AoE at the
  // end of the turn, after everything the player did in it.
  tickCastingPulses(G, G.players[pid]);
  resolve(G);
  // A lane the rival has left empty is pushed into, at the Active's power as
  // the turn left it.
  pushIntoEmptyLane(G, pid);
  // The Mid-Boss hits back at the hero that attacked it this turn.
  bossStrikesBack(G, pid);
  // Hero leveling: the lane is where a hero grows. The Active earns more for
  // standing the turn than a bench hero does.
  const ps = G.players[pid];
  for (const c of liveBoardCards(ps)) {
    if (heroData(c)) grantExp(G, c, c === ps.active ? EXP_PER_TURN_ACTIVE : EXP_PER_TURN_BENCH);
  }
  // Strip action-denying CC now that this player has spent their turn under
  // it — so "Stun N turns" denies exactly N turns (docs/stats-model.md).
  tickEndOfTurnCC(G, G.players[pid]);
  clearTurnFlags(G.players[pid]);
  // What the End step felled (a Naptime wake-up burst) pays and pushes now.
  resolve(G);
  lapseRevives(G, pid);
  if (endsLastRound(G, pid)) {
    G.capped = true;
    const v = standingVerdict(G);
    const why = v.by === 'structures' ? 'more structure HP' : v.by === 'netWorth' ? 'structure HP tied, more net worth' : 'all tied, the second mover';
    pushLog(G, `Round ${ROUND_CAP} is over: structures ${structureHp(G.players['0'])}–${structureHp(G.players['1'])}. P${v.winner} wins (${why}).`);
  }
}

/**
 * The push into an empty lane: when the turn ends with every hero of the
 * rival down, the ending player's standing Active pushes its bullet power
 * (doubled in the late game) into the rival's front structure. (A board wipe
 * is no loss by itself: this is how an empty lane costs its side.)
 */
function pushIntoEmptyLane(G: GameState, pid: PlayerID) {
  const rival = otherPlayer(pid);
  const standing = (c: CardInstance) => !isRespawning(c) && c.hp > 0;
  if (liveBoardCards(G.players[rival]).some(standing)) return;
  const active = G.players[pid].active;
  if (!active || !standing(active)) return;
  const power = attackPower(active).total;
  if (power <= 0) return;
  pushLog(G, `${cardName(active.cardId)} pushes into the empty lane (round ${round(G)}).`);
  pushStructures(G, rival, power * pushMultiplier(G), 'lane');
}

/**
 * The Mid-Boss's blow: the hero of `pid` that attacked it this turn takes
 * BOSS_RETALIATION pure damage from it (Unstoppable shrugs it off, nothing
 * else stops it). A hero it fells falls in place — the Rejuvenator still
 * revives it — but the boss pays no bounty and pushes nothing.
 */
function bossStrikesBack(G: GameState, pid: PlayerID) {
  const boss = standingBoss(G);
  const iid = G.bossAttacker;
  G.bossAttacker = null;
  if (!boss || !iid) return;
  const found = findCardOnBoard(G, iid);
  if (!found || found.owner !== pid || isRespawning(found.card) || found.card.hp <= 0) return;
  const hero = found.card;
  pushLog(G, `The Mid-Boss strikes back at ${cardName(hero.cardId)}.`);
  damageUnit(G, hero, BOSS_RETALIATION, 'pure', 'Mid-Boss', { source: boss });
  if (hero.hp <= 0) {
    fallToBoss(G, G.players[pid], hero);
    resolve(G);
  }
}
