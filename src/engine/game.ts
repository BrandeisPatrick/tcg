/**
 * The boardgame.io adapter and nothing more: it hands setup, the turn hooks and
 * each move to the engine, and maps an illegal action to INVALID_MOVE. Every
 * rule is in the modules it calls (`perform` in engine.ts, the turn edges in
 * actions/turn.ts, the opening in actions/setup.ts).
 *
 * A move stays callable on its own with `{ G, ctx, playerID, events, random }`
 * (the AI's lookahead and the tests do) and touches `events` only to end a turn.
 */
import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { GameState, PlayerID } from './types';
import { INVALID, perform, type Action } from './engine';
import { checkWinner } from './query';
import { draftPickBlocked, mulliganBlocked } from './legality';
import { beginTurn, endTurnEffects } from './actions/turn';
import { draftPick, mulligan, setupGame } from './actions/setup';

/** Who is moving: the client's seat, or whoever's turn it is. */
const mover = (ctx: { currentPlayer: string }, playerID?: string | null) => (playerID ?? ctx.currentPlayer) as PlayerID;

/** Perform `a`; an illegal action is INVALID_MOVE, a legal one returns nothing
 *  (a move that returns a value would replace the state). */
function move(G: GameState, pid: PlayerID, a: Action) {
  return perform(G, pid, a) === INVALID ? INVALID_MOVE : undefined;
}

export const DeadlockGame: Game<GameState> = {
  name: 'deadlock-tcg',
  setup: () => setupGame(),

  turn: {
    onBegin: ({ G, ctx }) => beginTurn(G, ctx.currentPlayer as PlayerID, ctx.turn),
    onEnd: ({ G, ctx }) => endTurnEffects(G, ctx.currentPlayer as PlayerID),
  },

  moves: {
    /**
     * UI-side callback: signals the reveal animation for the previous
     * action has finished playing. Flips `G.action.state` begin → done. The
     * dispatcher (player input / AI loop) treats anything other than `begin`
     * as not-locked. Engine resolution doesn't gate itself on this — only the
     * UI/AI input layer does. The next playCard / useSkill overwrites
     * `G.action` with a fresh `begin` state.
     */
    completeAction: ({ G }) => {
      if (G.action) G.action.state = 'done';
    },

    playCard: ({ G, ctx, playerID }, cardIid: string, targetIid?: string, discardIid?: string) =>
      move(G, mover(ctx, playerID), { type: 'playCard', cardIid, targetIid, discardIid }),

    useSkill: ({ G, ctx, playerID }, heroIid: string, targetIid?: string) =>
      move(G, mover(ctx, playerID), { type: 'useSkill', heroIid, targetIid }),

    moveHero: ({ G, ctx, playerID }, fromSlot: 0 | 1 | 2 | 3, toSlot: 0 | 1 | 2 | 3) =>
      move(G, mover(ctx, playerID), { type: 'moveHero', fromSlot, toSlot }),

    promoteToActive: ({ G, ctx, playerID }, benchIid: string) =>
      move(G, mover(ctx, playerID), { type: 'promoteToActive', benchIid }),

    /** The turn's attack. Always the player whose turn it is. */
    attack: ({ G, ctx }) => move(G, ctx.currentPlayer as PlayerID, { type: 'attack' }),

    endTurn: ({ events }) => {
      events.endTurn();
    },

    /** Pre-match hero draft pick; the last pick finalizes both rosters and
     *  hands over to the opening mulligan. */
    draftPick: ({ G, ctx, events }, heroId: string) => {
      if (draftPickBlocked(G, ctx.currentPlayer as PlayerID, heroId)) return INVALID_MOVE;
      if (draftPick(G, ctx, heroId).endTurn) events.endTurn();
    },

    mulligan: ({ G }) => {
      if (mulliganBlocked(G)) return INVALID_MOVE;
      mulligan(G);
    },
  },

  endIf: ({ G }) => checkWinner(G),
};
