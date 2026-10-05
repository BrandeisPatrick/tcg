/**
 * What happens at the edges of a turn. boardgame.io's turn hooks call these:
 * `beginTurn` runs for the player whose turn is starting, `endTurnEffects` for
 * the one whose turn is ending. During the draft, turns only decide who picks
 * next — the match's start- and end-of-turn pipeline must not fire on empty
 * boards and decks — so both do nothing until the draft is over.
 */
import type { CardInstance, GameState, PlayerID, PlayerState } from '../types';
import { CARDS_BY_ID } from '@/cards';
import { tickStartOfTurn, tickEndOfTurnCC, clearTurnFlags, tickCastingPulses, tickRemMerges } from '../statusOps';
import { resolve } from '../death';
import { heroData, liveBoardCards } from '../query';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { allocatorOf } from '../ids';
import { fireTriggers, type Trigger } from '../triggers';
import { grantExp } from '../expSystem';
import { drawCards, makeInstance } from '../deckOps';
import { DRAW_PER_TURN, MAX_HAND, SOULS_REFILL_TABLE, ULT_UNLOCK_TURN } from '../constants';

/** Souls a player's pool is refilled to at the start of their turn. */
export function soulRefillForTurn(globalTurn: number): number {
  // globalTurn 1 → my turn 1 (idx 0), globalTurn 3 → my turn 2 (idx 1), ...
  const idx = Math.floor((globalTurn - 1) / 2);
  return SOULS_REFILL_TABLE[Math.min(idx, SOULS_REFILL_TABLE.length - 1)];
}

/** From ULT_UNLOCK_TURN on, each living hero's ultimate enters its owner's
 *  hand once per match (hand space permitting). */
export function unlockUltimates(G: GameState, ps: PlayerState) {
  if (G.turnNumber < ULT_UNLOCK_TURN) return;
  const ids = allocatorOf(G);
  for (const hero of liveBoardCards(ps)) {
    const data = CARDS_BY_ID[hero.cardId];
    if (data?.type !== 'hero' || !data.ult) continue;
    if (ps.ultsConsumed.includes(data.ult)) continue;
    if (ps.hand.length >= MAX_HAND) break;
    const ult = makeInstance(ids, data.ult, ps.id, 'hand');
    ps.hand.push(ult);
    ps.ultsConsumed.push(data.ult);
    pushLog(G, `P${ps.id} unlocked ${CARDS_BY_ID[data.ult]?.name ?? data.ult}.`);
  }
}

/** Fire a turn-edge trigger for every living hero of `pid`: the hero's own
 *  passives, then what it wears (Extra Regen heals 1 each start of turn). */
function fireBoardTriggers(G: GameState, pid: PlayerID, trigger: Trigger) {
  for (const c of liveBoardCards(G.players[pid])) {
    if (!heroData(c)) continue;
    fireTriggers(G, c, trigger, { movingPlayer: pid });
  }
}

/**
 * Tick down respawn timers on heroes that are currently corpses in their slots.
 * On reaching 0 the hero returns to full HP in the same slot.
 */
function tickRespawn(G: GameState, pid: PlayerID) {
  const ps = G.players[pid];
  const corpses: CardInstance[] = [];
  if (ps.active && (ps.active.respawnTurnsLeft ?? 0) > 0) corpses.push(ps.active);
  for (const b of ps.bench) if (b && (b.respawnTurnsLeft ?? 0) > 0) corpses.push(b);

  for (const hero of corpses) {
    hero.respawnTurnsLeft = (hero.respawnTurnsLeft ?? 0) - 1;
    if (hero.respawnTurnsLeft <= 0) {
      hero.respawnTurnsLeft = undefined;
      hero.hp = hero.hpMax;
      hero.exhausted = false;
      pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} respawned.`);
      pushFx(G, { kind: 'revive', iid: hero.iid });
    }
  }
}

/** The start of `pid`'s turn. `ctxTurn` is boardgame.io's turn count, which
 *  includes the draft's turns; the match's own turn number is that minus the
 *  offset captured when the draft finished. */
export function beginTurn(G: GameState, pid: PlayerID, ctxTurn: number) {
  if (G.draft) return;
  const ps = G.players[pid];
  const realTurn = ctxTurn - G.draftTurnsOffset;
  G.turnNumber = realTurn;
  G.attackUsed = false;
  tickStartOfTurn(G, ps);
  // Count down Rem's "Lil Helpers" merges; expired ones return her to bench.
  tickRemMerges(G, ps);
  // Refill (not add) — no hoarding across turns. KO bounty banked this turn IS preserved
  // until the NEXT refill, so a kill mid-turn still gives you something to spend right away.
  ps.souls = soulRefillForTurn(realTurn);
  // Draw from deck
  drawCards(G, pid, DRAW_PER_TURN);
  // Ultimate unlock
  unlockUltimates(G, ps);
  // Respawn ticks ONLY for the player whose turn is starting, so a corpse
  // decrements once per round (on its owner's turn) — RESPAWN_TURNS = 3 means
  // 3 of the owner's turns of downtime. (Ticking both players here was a bug:
  // it double-ticked corpses, halving respawn time so KOs felt near-instant.)
  tickRespawn(G, pid);
  fireBoardTriggers(G, pid, 'startOfTurn');
  resolve(G);
  pushLog(G, `--- Turn ${realTurn}, player ${pid} ---`);
}

/** The end of `pid`'s turn. */
export function endTurnEffects(G: GameState, pid: PlayerID) {
  if (G.draft) return;
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
  // Hero leveling: +1 exp to each alive hero on the player's board.
  for (const c of liveBoardCards(G.players[pid])) {
    if (heroData(c)) grantExp(G, c, 1);
  }
  // Strip action-denying CC now that this player has spent their turn under
  // it — so "Stun N turns" denies exactly N turns (docs/stats-model.md).
  tickEndOfTurnCC(G, G.players[pid]);
  clearTurnFlags(G.players[pid]);
}
