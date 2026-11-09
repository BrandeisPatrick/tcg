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
import { draftPickBlocked } from './legality';
import { beginTurn, endTurnEffects } from './actions/turn';
import { draftPick, setupGame } from './actions/setup';

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
    // Round robin from seat 0: a drafted match opens on seat 0's first pick
    // (the last pick hands the first turn to seat 1, `draftPick`); a scripted
    // one opens on seat 0's turn.
    onBegin: ({ G, ctx }) => beginTurn(G, ctx.currentPlayer as PlayerID, ctx.turn),
    onEnd: ({ G, ctx }) => endTurnEffects(G, ctx.currentPlayer as PlayerID),
  },

  moves: {
    /**
     * UI-side callback: signals the reveal animation for the previous
     * action has finished playing. Flips `G.action.state` begin → done. The
     * dispatcher (player input / AI loop) treats anything other than `begin`
     * as not-locked. Engine resolution doesn't gate itself on this — only the
     * UI/AI input layer does. The next activate / useSkill overwrites
     * `G.action` with a fresh `begin` state.
     */
    completeAction: ({ G }) => {
      if (G.action) G.action.state = 'done';
    },

    /** Put an item from your hand on one of your heroes (bench and corpses
     *  included), for its price — an upgrade onto the hero wearing its
     *  component evolves it for the difference. `upgradeId` picks the upgrade
     *  the play shuffles into the deck when it could make several. Not the
     *  hero's ability for the turn. */
    playCard: ({ G, ctx, playerID }, cardIid: string, heroIid: string, upgradeId?: string) =>
      move(G, mover(ctx, playerID), upgradeId === undefined ? { type: 'playCard', cardIid, heroIid } : { type: 'playCard', cardIid, heroIid, upgradeId }),

    /** Put a hero from your hand on the bench — or, `toActive`, into your
     *  empty Active slot. Free. */
    placeHero: ({ G, ctx, playerID }, cardIid: string, toActive?: boolean) =>
      move(G, mover(ctx, playerID), { type: 'placeHero', cardIid, toActive: toActive === true }),

    /** A draw card's discard: these cards from your hand to the discard pile. */
    discard: ({ G, ctx, playerID }, cardIids: string[]) =>
      move(G, mover(ctx, playerID), { type: 'discard', cardIids: Array.isArray(cardIids) ? cardIids : [cardIids as unknown as string] }),

    /** The opening: the hero from the hand that takes the lane as its side's
     *  first Active. Made from either seat (whose it is comes from the card). */
    chooseActive: ({ G, ctx, playerID }, cardIid: string) =>
      move(G, mover(ctx, playerID), { type: 'chooseActive', cardIid }),

    /** Use an active item a hero wears (that hero's one ability this turn). */
    activate: ({ G, ctx, playerID }, itemIid: string, targetIid?: string) =>
      move(G, mover(ctx, playerID), { type: 'activate', itemIid, targetIid }),

    /** A kit ability: a skill, the hero's ultimate or a borrowed ultimate,
     *  named by `skillId` (left off for the hero's first skill). */
    useSkill: ({ G, ctx, playerID }, heroIid: string, targetIid?: string, skillId?: string) =>
      move(G, mover(ctx, playerID), { type: 'useSkill', heroIid, targetIid, skillId }),

    moveHero: ({ G, ctx, playerID }, fromSlot: 0 | 1 | 2 | 3, toSlot: 0 | 1 | 2 | 3) =>
      move(G, mover(ctx, playerID), { type: 'moveHero', fromSlot, toSlot }),

    promoteToActive: ({ G, ctx, playerID }, benchIid: string) =>
      move(G, mover(ctx, playerID), { type: 'promoteToActive', benchIid }),

    /** The turn's attack (one a turn; it ends the Act). Always the player whose
     *  turn it is. `targetIid` is left off for the default target (the rival
     *  Active, unless the hero has reach). */
    attack: ({ G, ctx }, targetIid?: string) => move(G, ctx.currentPlayer as PlayerID, { type: 'attack', targetIid }),

    /** End the turn — unless a promotion is owed, which comes first. */
    endTurn: ({ G, ctx, playerID, events }) => {
      if (move(G, mover(ctx, playerID), { type: 'endTurn' }) === INVALID_MOVE) return INVALID_MOVE;
      events.endTurn();
    },

    /** Pre-match hero draft pick; the last pick finalizes both rosters and
     *  ends the draft's turn, handing the first turn to the first mover. */
    draftPick: ({ G, ctx, events }, heroId: string) => {
      if (draftPickBlocked(G, ctx.currentPlayer as PlayerID, heroId)) return INVALID_MOVE;
      if (draftPick(G, ctx, heroId).endTurn) events.endTurn();
    },
  },

  endIf: ({ G }) => checkWinner(G),
};
