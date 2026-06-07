import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { buildPlayer } from '@/engine/game';
import { STARTER_DECK_PLAYER, STARTER_DECK_AI } from '@/decks/starter';
import { AI_DECKS_BY_NAME } from '@/decks/aiDecks';
import { resetIid, nextIid } from '@/engine/util';
import { CARDS_BY_ID } from '@/cards';
import { setMatchConfig } from '@/storage/matchConfig';

/**
 * Battle-ready GameState with both rosters already on the board (no draft).
 *
 * Reproduces the historical default the engine tests were written against:
 *   P0 = starter Aggro — Haze (active), Vindicta / Lash / Paige (bench)
 *   P1 = starter Control — Abrams (active), Dynamo / Kelvin / Seven (bench)
 *
 * `setup()` itself returns empty players + a pending draft, so tests that read
 * `players['0'].active` must build a ready state via this helper instead.
 */
export function freshReadyGame(): GameState {
  resetIid();
  return {
    players: {
      '0': buildPlayer('0', STARTER_DECK_PLAYER.heroes, AI_DECKS_BY_NAME.aggro),
      '1': buildPlayer('1', STARTER_DECK_AI.heroes, AI_DECKS_BY_NAME.control),
    },
    // Turn 2 so P0's attack phase resolves (P0 forgoes first strike on turn 1).
    turnNumber: 2,
    selector: null,
    resolveQueue: [],
    log: [{ turn: 1, text: 'Battle begins.' }],
    draft: null,
    draftTurnsOffset: 0,
    mulliganPending: false,
    action: null,
    damageFx: [],
    shop: null,
  } as unknown as GameState;
}

/**
 * Make the engine's `setup()` build a battle-ready match (no draft) so a
 * boardgame.io Client boots straight into turn 1 with both boards populated.
 * Uses the story branch (which bypasses the draft) with a zero stat buff so it
 * behaves like a normal match. Call in beforeAll for Client-based specs.
 */
export function configureReadyMatch(): void {
  setMatchConfig({
    playerDeck: [],
    heroPreferences: [null, null, null, null],
    story: {
      playerHeroes: STARTER_DECK_PLAYER.heroes,
      playerDeck: AI_DECKS_BY_NAME.aggro,
      enemyHeroes: STARTER_DECK_AI.heroes,
      enemyDeck: AI_DECKS_BY_NAME.control,
      enemyBuff: { atk: 0, hp: 0 },
    },
  });
}

/** Build a single hero instance directly (for tests that want a specific hero). */
export function makeHero(
  cardId: string,
  ownerId: PlayerID,
  zone: CardInstance['zone'] = 'active',
  slot: 0 | 1 | 2 | 3 = 0,
): CardInstance {
  const data = CARDS_BY_ID[cardId] as any;
  return {
    iid: nextIid(),
    cardId,
    ownerId,
    zone,
    slot,
    hp: data?.hp ?? 10,
    hpMax: data?.hp ?? 10,
    atkMod: 0,
    spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: false,
    level: 1,
    exp: 0,
  };
}
