import { describe, it, expect } from 'vitest';
import { INVALID_MOVE } from 'boardgame.io/core';
import { DeadlockGame } from '@/engine/game';
import { ULTIMATES, CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';

let seq = 0;
function makeHero(cardId: string, ownerId: PlayerID, zone: CardInstance['zone'], slot: 0 | 1 | 2 | 3): CardInstance {
  const d = CARDS_BY_ID[cardId] as any;
  return {
    iid: `h${seq++}`, cardId, ownerId, zone, slot,
    hp: d.hp, hpMax: d.hp, atkMod: 0, spiritMod: 0,
    statuses: [], attached: [], exhausted: false, skillUsedThisTurn: false,
    exp: 0, level: 1 as const,
  };
}
function makeCard(cardId: string, ownerId: PlayerID): CardInstance {
  return {
    iid: `c${seq++}`, cardId, ownerId, zone: 'hand',
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], attached: [], exhausted: false, skillUsedThisTurn: false,
  };
}

function freshG(casterHero: string, enemyHero = 'hero_abrams'): GameState {
  const G = JSON.parse(JSON.stringify(
    (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } }),
  )) as GameState;
  const p0 = G.players['0'], p1 = G.players['1'];
  p0.active = makeHero(casterHero, '0', 'active', 0);
  p0.bench = [makeHero('hero_kelvin', '0', 'bench', 1), null, null];
  p1.active = makeHero(enemyHero, '1', 'active', 0);
  p1.bench = [makeHero('hero_lash', '1', 'bench', 1), makeHero('hero_seven', '1', 'bench', 2), null];
  // Bump enemy HP so no ult lands a kill during the cost-deduction assertions
  // (a KO would refund a +1 soul bounty and skew the souls check).
  for (const e of [p1.active, ...p1.bench]) if (e) { e.hp = 99; e.hpMax = 99; }
  p0.souls = 10; p1.souls = 10;
  p0.hand = []; p0.discard = [];
  return G;
}

function play(G: GameState, iid: string, targetIid?: string) {
  return (DeadlockGame as any).moves.playCard(
    { G, ctx: { currentPlayer: '0', numPlayers: 2, turn: 1 }, playerID: '0' },
    iid, targetIid,
  );
}

function targetIid(G: GameState, t: string): string | undefined {
  if (t === 'self' || t === 'allyHero') return G.players['0'].active?.iid;
  if (t === 'enemyActive' || t === 'enemyAny' || t === 'anyBoard') return G.players['1'].active?.iid;
  return undefined;
}

describe('ultimates resolve through the real playCard flow', () => {
  for (const ult of ULTIMATES) {
    it(`${ult.id} (${ult.name}) — cost ${ult.cost}`, () => {
      const G = freshG(ult.linkedHero!);
      const card = makeCard(ult.id, '0');
      G.players['0'].hand.push(card);
      G.players['0'].souls = ult.cost ?? 0;
      const ability = getAbility(ult.abilities![0])!;

      const res = play(G, card.iid, targetIid(G, ability.target));

      expect(res).not.toBe(INVALID_MOVE);                 // move accepted
      expect(G.players['0'].souls).toBe(0);               // full cost deducted
      expect(G.players['0'].hand).not.toContain(card);    // left hand
      expect(G.players['0'].discard.some((c) => c.iid === card.iid)).toBe(true); // discarded
    });
  }

  it('Sinclair: the copied ult is playable for 0 souls', () => {
    const G = freshG('hero_sinclair', 'hero_dynamo');
    const sinclair = makeCard('ult_sinclair', '0');
    G.players['0'].hand.push(sinclair);
    G.players['0'].souls = 9;

    expect(play(G, sinclair.iid)).not.toBe(INVALID_MOVE);
    expect(G.players['0'].souls).toBe(0);

    // Copy landed in hand at 0 cost — play it with an empty pool.
    const copy = G.players['0'].hand.find((c) => c.cardId === 'ult_dynamo')!;
    expect(copy?.costOverride).toBe(0);
    const res = play(G, copy.iid);
    expect(res).not.toBe(INVALID_MOVE);
    expect(G.players['0'].souls).toBe(0);
    // Dynamo's copy stunned the whole enemy board.
    const enemies = [G.players['1'].active, ...G.players['1'].bench].filter(Boolean) as CardInstance[];
    expect(enemies.every((e) => e.statuses.some((s) => s.id === 'stun'))).toBe(true);
  });

  it('an ult you cannot afford is rejected', () => {
    const G = freshG('hero_paige');
    const card = makeCard('ult_paige', '0'); // cost 10
    G.players['0'].hand.push(card);
    G.players['0'].souls = 9;
    expect(play(G, card.iid)).toBe(INVALID_MOVE);
  });
});
