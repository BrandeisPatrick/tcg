/**
 * The boardgame.io adapter and nothing more: it hands setup, the turn hooks and
 * each move to the engine, and maps an illegal action to INVALID_MOVE. Every
 * rule is in the modules it calls (`perform` in engine.ts, the turn edges in
 * actions/turn.ts, the opening in actions/setup.ts).
 *
 * A move stays callable on its own with `{ G, ctx, playerID, events, random }`
 * (the AI's lookahead and the tests do) and touches `events` only to end a turn.
 */
import type { Ctx, Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { GameState, PlayerID } from './types';
import { INVALID, perform, type Action } from './engine';
import { checkWinner, promptOwed } from './query';
import { draftPickBlocked } from './legality';
import { beginTurn, endTurnEffects } from './actions/turn';
import { draftPick, setupGame } from './actions/setup';

/** Who is moving: the client's seat, or whoever's turn it is. */
const mover = (ctx: { currentPlayer: string }, playerID?: string | null) => (playerID ?? ctx.currentPlayer) as PlayerID;

/** The stage a seat answers a trigger prompt in (engine/prompts.ts). */
export const RESPOND_STAGE = 'respond';

/** What a move or a turn hook is handed that the adapter needs. `events` may be
 *  a stand-in without `setActivePlayers` (the tests call the moves bare). */
interface MoveContext {
  G: GameState;
  ctx: Ctx;
  events?: { setActivePlayers?: (arg: { value: Record<string, string> }) => void; endTurn?: () => void };
}

/**
 * Keep boardgame.io's active players in step with the trigger prompt: while
 * one is owed, the asked seat is in the respond stage, whoever's turn it is —
 * and so is the seat on turn, because the local client sends every move as
 * the player whose turn it is (boardgame.io's `assumedPlayerID`). Who answers
 * is the engine's to say (the prompt's `pid`; `answerBlocked`), as with a
 * promotion. Once nothing is owed the stage is let go. A prompt opened in the
 * End step is held into the next turn, whose start opens the stage.
 */
function syncPrompt({ G, ctx, events }: MoveContext) {
  const set = events?.setActivePlayers;
  if (!set) return;
  const owed = promptOwed(G);
  if (owed) set({ value: { [owed.pid]: RESPOND_STAGE, [ctx.currentPlayer]: RESPOND_STAGE } });
  else if (ctx.activePlayers) set({ value: {} });
}

/** Perform `a`; an illegal action is INVALID_MOVE, a legal one returns nothing
 *  (a move that returns a value would replace the state). A move that opens or
 *  answers a trigger prompt moves the respond stage with it. */
function move(mc: MoveContext, pid: PlayerID, a: Action) {
  if (perform(mc.G, pid, a) === INVALID) return INVALID_MOVE;
  syncPrompt(mc);
  return undefined;
}

/** UI-side callback: the reveal animation for the previous action has
 *  finished playing. Flips `G.action.state` begin → done. The dispatcher
 *  (player input / AI loop) treats anything other than `begin` as
 *  not-locked. Engine resolution doesn't gate itself on this — only the UI/AI
 *  input layer does. The next activate / useSkill overwrites `G.action` with
 *  a fresh `begin` state. Open in the respond stage too: a skill that opens a
 *  prompt still has its reveal to finish. */
function completeAction({ G }: { G: GameState }) {
  if (G.action) G.action.state = 'done';
}

/** A trigger prompt's yes: the offer `abilityId` of `heroIid` (prompts.ts). */
function useTrigger(mc: MoveContext & { playerID?: string | null }, heroIid: string, abilityId: string) {
  return move(mc, mover(mc.ctx, mc.playerID), { type: 'useTrigger', heroIid, abilityId });
}

/** A trigger prompt's no: the moment goes on. */
function passTrigger(mc: MoveContext & { playerID?: string | null }) {
  return move(mc, mover(mc.ctx, mc.playerID), { type: 'passTrigger' });
}

export const DeadlockGame: Game<GameState> = {
  name: 'deadlock-tcg',
  setup: () => setupGame(),

  turn: {
    // Round robin from seat 0: a drafted match opens on seat 0's first pick
    // (the last pick hands the first turn to seat 1, `draftPick`); a scripted
    // one opens on seat 0's turn.
    // A trigger prompt the turn's start opened (Victor's own Aura can fell
    // him), or the last turn's End step held over, is asked now.
    onBegin: ({ G, ctx, events }) => {
      beginTurn(G, ctx.currentPlayer as PlayerID, ctx.turn);
      syncPrompt({ G, ctx, events });
    },
    onEnd: ({ G, ctx }) => endTurnEffects(G, ctx.currentPlayer as PlayerID),
    stages: {
      /** A trigger prompt owed: use one of its offers, or pass. Nothing else. */
      [RESPOND_STAGE]: { moves: { useTrigger, passTrigger, completeAction } },
    },
  },

  moves: {
    completeAction,

    /** Put an item from your hand on one of your heroes (bench and corpses
     *  included), for its price — an upgrade onto the hero wearing its
     *  component evolves it for the difference. `upgradeId` picks the upgrade
     *  the play shuffles into the deck when it could make several. Not the
     *  hero's ability for the turn. */
    playCard: ({ G, ctx, playerID, events }, cardIid: string, heroIid: string, upgradeId?: string) =>
      move({ G, ctx, events }, mover(ctx, playerID), upgradeId === undefined ? { type: 'playCard', cardIid, heroIid } : { type: 'playCard', cardIid, heroIid, upgradeId }),

    /** Put a hero from your hand on the bench — the slot `slot` (1-3), or
     *  your first free one — or, `toActive`, into your empty Active slot. Free. */
    placeHero: ({ G, ctx, playerID, events }, cardIid: string, toActive?: boolean, slot?: 1 | 2 | 3) =>
      move({ G, ctx, events }, mover(ctx, playerID), slot === undefined
        ? { type: 'placeHero', cardIid, toActive: toActive === true }
        : { type: 'placeHero', cardIid, toActive: toActive === true, slot }),

    /** A draw card's discard: these cards from your hand to the discard pile. */
    discard: ({ G, ctx, playerID, events }, cardIids: string[]) =>
      move({ G, ctx, events }, mover(ctx, playerID), { type: 'discard', cardIids: Array.isArray(cardIids) ? cardIids : [cardIids as unknown as string] }),

    /** The opening: the drafted hero from the deck that takes the lane as its
     *  side's first Active. Made from either seat (whose it is comes from the
     *  card). The draft's turn held for the choice (`draftPick`): it ends now,
     *  and the match's first turn begins on a dealt board. */
    chooseActive: ({ G, ctx, playerID, events }, cardIid: string) => {
      const r = move({ G, ctx, events }, mover(ctx, playerID), { type: 'chooseActive', cardIid });
      if (r === INVALID_MOVE) return r;
      if (G.turnNumber < 1 && !G.pendingActive) events?.endTurn?.();
      return undefined;
    },

    /** Use an active item a hero wears (that hero's one ability this turn). */
    activate: ({ G, ctx, playerID, events }, itemIid: string, targetIid?: string) =>
      move({ G, ctx, events }, mover(ctx, playerID), { type: 'activate', itemIid, targetIid }),

    /** A kit ability: the hero's skill or its ultimate, named by `skillId`
     *  (left off for the hero's first skill), paid for in souls. */
    useSkill: ({ G, ctx, playerID, events }, heroIid: string, targetIid?: string, skillId?: string) =>
      move({ G, ctx, events }, mover(ctx, playerID), { type: 'useSkill', heroIid, targetIid, skillId }),

    moveHero: ({ G, ctx, playerID, events }, fromSlot: 0 | 1 | 2 | 3, toSlot: 0 | 1 | 2 | 3) =>
      move({ G, ctx, events }, mover(ctx, playerID), { type: 'moveHero', fromSlot, toSlot }),

    promoteToActive: ({ G, ctx, playerID, events }, benchIid: string) =>
      move({ G, ctx, events }, mover(ctx, playerID), { type: 'promoteToActive', benchIid }),

    /** The turn's attack (one a turn; it ends the Act). Always the player whose
     *  turn it is. `targetIid` is left off for the default target (the rival
     *  Active, unless the hero has reach). */
    attack: ({ G, ctx, events }, targetIid?: string) => move({ G, ctx, events }, ctx.currentPlayer as PlayerID, { type: 'attack', targetIid }),

    /** End the turn — unless a promotion is owed, which comes first. */
    endTurn: ({ G, ctx, playerID, events }) => {
      if (move({ G, ctx }, mover(ctx, playerID), { type: 'endTurn' }) === INVALID_MOVE) return INVALID_MOVE;
      events.endTurn();
    },

    /** A trigger prompt's answer (prompts.ts), from either seat: here for the
     *  callers that make moves bare; the client makes them in the respond stage. */
    useTrigger,
    passTrigger,

    /** Pre-match hero draft pick; the last pick finalizes both rosters and
     *  ends the draft's turn, handing the first turn to the first mover. */
    draftPick: ({ G, ctx, events }, heroId: string) => {
      if (draftPickBlocked(G, ctx.currentPlayer as PlayerID, heroId)) return INVALID_MOVE;
      if (draftPick(G, ctx, heroId).endTurn) events.endTurn();
    },
  },

  endIf: ({ G }) => checkWinner(G),
};
