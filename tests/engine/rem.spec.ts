/**
 * Rem (docs/hero-design.md §8, Patrick's call of 2026-11-09): no longer
 * bench-only. She stands in the lane like any hero — she can open the match,
 * be put straight into an empty lane, step up when the Active falls and be
 * retreated to (her Retreat is 0).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { CardInstance, GameState } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { INVALID, perform } from '@/engine/engine';
import { legalActions, openingCandidates, placeHeroBlocked, promoteBlocked, retreatCost } from '@/engine/legality';
import { resolve } from '@/engine/death';
import { stepInCandidates } from '@/engine/query';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { freshReadyGame, giveCard, makeHero } from './_helpers';

const saved = getMatchConfig();
afterEach(() => setMatchConfig(saved));

/** Perform `a` for `pid`, failing the test if the engine refuses it. */
function act(G: GameState, pid: '0' | '1', a: Parameters<typeof perform>[2]) {
  expect(perform(G, pid, a), JSON.stringify(a)).not.toBe(INVALID);
}

/** A drafted match whose seat 0 drafted Rem first, held at the opening: seat 0
 *  still owes its first Active. */
function draftedWithRem(): GameState {
  setMatchConfig({ heroPreferences: [null, null, null, null], seed: 77, humanSeat: '0' });
  const client = Client({ game: DeadlockGame, numPlayers: 2 });
  client.start();
  // Snake: P0 at 0, 3, 4, 7 (Rem, Vindicta, Lash, Paige); P1 at 1, 2, 5, 6.
  for (const id of ['hero_rem', 'hero_abrams', 'hero_dynamo', 'hero_vindicta', 'hero_lash', 'hero_kelvin', 'hero_seven', 'hero_paige']) {
    client.moves.draftPick(id);
  }
  const G = structuredClone(client.getState()!.G) as GameState;
  client.stop();
  return G;
}

describe('Rem stands in the lane', () => {
  it('opens the match: the opening offers her, and the lane takes her', () => {
    const G = draftedWithRem();
    expect(G.pendingActive).toBe('0');
    const rem = openingCandidates(G, '0').find((c) => c.cardId === 'hero_rem');
    expect(rem).toBeDefined();
    expect(legalActions(G, '0')).toContainEqual({ type: 'chooseActive', cardIid: rem!.iid });
    act(G, '0', { type: 'chooseActive', cardIid: rem!.iid });
    expect(G.players['0'].active?.cardId).toBe('hero_rem');
    expect(G.players['0'].active).toMatchObject({ zone: 'active', slot: 0 });
  });

  it('goes straight from the hand into an empty lane', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.active = null;
    me.bench = [null, null, null];
    const rem = giveCard(G, '0', 'hero_rem');
    expect(placeHeroBlocked(G, '0', rem.iid, true)).toBeNull();
    expect(legalActions(G, '0')).toContainEqual({ type: 'placeHero', cardIid: rem.iid, toActive: true });
    act(G, '0', { type: 'placeHero', cardIid: rem.iid, toActive: true });
    expect(me.active).toBe(rem);
    expect(rem).toMatchObject({ zone: 'active', slot: 0 });
  });

  it('steps up when the Active falls: the human seat is asked, an AI seat promotes her at once', () => {
    // The human seat (0): her Active down, Rem the only one who can step up.
    const G = freshReadyGame();
    const me = G.players['0'];
    const rem = makeHero('hero_rem', '0', 'bench', 2);
    me.bench = [null, rem, null];
    me.active!.hp = 0;
    resolve(G);
    expect(G.pendingPromotion).toBe('0');
    expect(stepInCandidates(me)).toEqual([rem]);
    expect(promoteBlocked(G, rem.iid)).toBeNull();
    act(G, '0', { type: 'promoteToActive', benchIid: rem.iid });
    expect(me.active).toBe(rem);
    expect(G.pendingPromotion).toBeUndefined();

    // An AI seat (1): promoted on the spot, no question asked.
    const H = freshReadyGame();
    const foe = H.players['1'];
    const theirRem = makeHero('hero_rem', '1', 'bench', 1);
    foe.bench = [theirRem, null, null];
    foe.active!.hp = 0;
    resolve(H);
    expect(foe.active).toBe(theirRem);
    expect(H.pendingPromotion).toBeUndefined();
  });

  it('can be retreated to, and retreats out of the lane for her printed 0', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const haze = me.active!;
    const rem: CardInstance = makeHero('hero_rem', '0', 'bench', 2);
    me.bench[1] = rem;
    me.souls = 5;
    expect(legalActions(G, '0')).toContainEqual({ type: 'moveHero', fromSlot: 2, toSlot: 0 });
    act(G, '0', { type: 'moveHero', fromSlot: 2, toSlot: 0 });
    expect(me.active).toBe(rem);
    expect(me.bench[1]).toBe(haze);
    expect(me.souls).toBe(5 - 1); // Haze's Retreat 1
    // Next turn, out again: Rem's Retreat is 0.
    G.retreatUsed = false;
    expect(retreatCost(G, '0')).toBe(0);
    act(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: 2 });
    expect(me.active).toBe(haze);
    expect(me.souls).toBe(4);
  });
});
