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
import { resolve } from '../death';
import { attackPower, comebackBonus, heroData, heroesOf, isRespawning, liveBoardCards, otherPlayer, wornItems } from '../query';
import { ownTurn, secondMover } from '../rounds';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { fireTriggers, type Trigger } from '../triggers';
import { grantExp } from '../expSystem';
import { damagePlayer } from '../damage';
import {
  EXP_PER_TURN_ACTIVE, EXP_PER_TURN_BENCH, LANE_INCOME, SECOND_MOVER_FIRST_INCOME_BONUS,
} from '../constants';

/** Fire a turn-edge trigger for every living hero of `pid`: the hero's own
 *  passives, then what it wears (Extra Regen heals 1 each start of turn). */
function fireBoardTriggers(G: GameState, pid: PlayerID, trigger: Trigger) {
  for (const c of liveBoardCards(G.players[pid])) {
    if (!heroData(c)) continue;
    fireTriggers(G, c, trigger, { movingPlayer: pid });
  }
}

/** Souls `pid` collects at the start of its own turn: the lane's income, the
 *  comeback a trailing side is owed (`comebackBonus`, read before the income
 *  lands), and the second mover's bonus on its first turn. */
function income(G: GameState, pid: PlayerID): { total: number; comeback: number; seat: number } {
  const comeback = comebackBonus(G, pid);
  const seat = pid === secondMover(G) && ownTurn(G, pid) === 1 ? SECOND_MOVER_FIRST_INCOME_BONUS : 0;
  return { total: LANE_INCOME + comeback + seat, comeback, seat };
}

/**
 * Tick down respawn timers on heroes that are currently corpses in their slots.
 * On reaching 0 the hero returns to full HP in the same slot, its level and
 * its items intact (what an item gives is read off it, or sits on the hero's
 * modifiers: nothing to put back).
 */
function tickRespawn(G: GameState, pid: PlayerID) {
  const ps = G.players[pid];
  const corpses: CardInstance[] = [];
  if (ps.active && isRespawning(ps.active)) corpses.push(ps.active);
  for (const b of ps.bench) if (b && isRespawning(b)) corpses.push(b);

  for (const hero of corpses) {
    hero.respawnTurnsLeft = (hero.respawnTurnsLeft ?? 0) - 1;
    if (hero.respawnTurnsLeft <= 0) {
      hero.respawnTurnsLeft = undefined;
      hero.hp = hero.hpMax;
      hero.exhausted = false;
      pushLog(G, `${cardName(hero.cardId)} respawned.`);
      pushFx(G, { kind: 'revive', iid: hero.iid });
    }
  }
}

/** The start of `pid`'s turn — its Income, before the shop opens. `ctxTurn` is
 *  boardgame.io's turn count, which includes the draft's turns; the engine turn
 *  is that minus the offset captured when the draft finished. In order: the
 *  turn's flags reset and the step is the shop, the start-of-turn ticks,
 *  cooldowns (heroes' and items') and Rem's merge, the income, respawns, the
 *  start-of-turn passives and gear, and the state-based pass. */
export function beginTurn(G: GameState, pid: PlayerID, ctxTurn: number) {
  if (G.draft) return;
  const ps = G.players[pid];
  const realTurn = ctxTurn - G.draftTurnsOffset;
  G.turnNumber = realTurn;
  G.step = 'shop';
  G.attackUsed = false;
  G.retreatUsed = false;
  tickStartOfTurn(G, ps);
  // Cooldowns count the owner's turns, so they come down here too (on a corpse as well).
  tickCooldowns(ps);
  // Count down Rem's "Lil Helpers" merges; expired ones return her to bench.
  tickRemMerges(G, ps);
  // Income: souls accumulate — nothing banked is lost, and the lane pays on
  // top of it every own turn, the first included.
  const paid = income(G, pid);
  ps.souls += paid.total;
  const extras = [paid.comeback ? `+${paid.comeback} comeback` : '', paid.seat ? `+${paid.seat} second mover` : ''].filter(Boolean);
  pushLog(G, `P${pid} +${paid.total} Souls (income${extras.length ? `, ${extras.join(', ')}` : ''}).`);
  // Respawn ticks ONLY for the player whose turn is starting, so a corpse
  // decrements once per round (on its owner's turn) — RESPAWN_TURNS = 3 means
  // 3 of the owner's turns of downtime.
  tickRespawn(G, pid);
  fireBoardTriggers(G, pid, 'startOfTurn');
  resolve(G);
  pushLog(G, `--- Turn ${realTurn}, player ${pid} ---`);
}

/** The end of `pid`'s turn. */
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
  // A lane the rival has left empty is pushed into, at the Active's power as
  // the turn left it.
  pushIntoEmptyLane(G, pid);
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
  // An upgrade bought this turn can no longer be sold back for its component.
  for (const hero of heroesOf(ps)) {
    for (const it of wornItems(hero)) {
      if (it.replaced) it.replaced = undefined;
      if (it.replacedFrom) it.replacedFrom = undefined;
    }
  }
}

/**
 * The push into an empty lane: when the turn ends with every hero of the
 * rival down, the ending player's standing Active deals its bullet power to
 * the rival's patron. (A board wipe is no loss by itself: this is how an empty
 * lane costs its side.)
 */
function pushIntoEmptyLane(G: GameState, pid: PlayerID) {
  const rival = otherPlayer(pid);
  const standing = (c: CardInstance) => !isRespawning(c) && c.hp > 0;
  if (liveBoardCards(G.players[rival]).some(standing)) return;
  const active = G.players[pid].active;
  if (!active || !standing(active)) return;
  const power = attackPower(active).total;
  if (power <= 0) return;
  pushLog(G, `${cardName(active.cardId)} pushes into the empty lane.`);
  damagePlayer(G, rival, power);
}
