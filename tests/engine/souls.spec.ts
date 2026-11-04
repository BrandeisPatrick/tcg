import { describe, it, expect, beforeAll } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import type { CardId, GameState, PlayerID } from '@/engine/types';
import type { Ctx } from 'boardgame.io';
import { damageUnit } from '@/engine/damage';
import { reapDead } from '@/engine/death';
import { CARDS_BY_ID } from '@/cards';
import { LANE_INCOME, PRICE, RETREAT_COST } from '@/engine/constants';
import { buyBlocked, buyPrice, playBlocked } from '@/engine/legality';
import { itemPrice, netWorth } from '@/engine/query';
import { freshReadyGame, configureReadyMatch, giveCard, giveItem, readyClient } from './_helpers';

// Boot the boardgame.io Client straight into a playable match (skip the draft).
// Every turn opens in its shop step: `readyClient()` stands past turn 1's.
beforeAll(configureReadyMatch);

function snap(c: ReturnType<typeof readyClient>) {
  const s = c.getState();
  if (!s) throw new Error('no state');
  return { G: s.G as GameState, ctx: s.ctx as Ctx };
}

function runMove(name: string, G: GameState, pid: PlayerID, ...args: any[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}

function freshG(): GameState {
  return freshReadyGame();
}

describe('souls economy', () => {
  it('the income: the player on turn 1 has LANE_INCOME souls; the other has none until its turn', () => {
    const c = readyClient({ shop: true });
    const { G } = snap(c);
    expect(G.players['0'].souls).toBe(LANE_INCOME);
    expect(G.players['1'].souls).toBe(0);
  });

  it('buying an item deducts its price; one it cannot afford is refused and costs nothing', () => {
    const G = freshReadyGame({ step: 'shop' }); // P0's turn, its shop open
    const me = G.players['0'];
    me.souls = 5;
    // Extended Magazine: a tier 1 passive item, +1 Bullet Power, at its tier's price.
    expect(itemPrice('extended_magazine')).toBe(PRICE[1]);
    const r = runMove('buy', G, '0', 'extended_magazine');
    expect(r).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(5 - PRICE[1]);
    expect(me.hand.map((c) => c.cardId)).toEqual(['extended_magazine']);
    // Toxic Bullets is tier 3 (8 souls): 3 left is not enough.
    expect(itemPrice('toxic_bullets')).toBe(PRICE[3]);
    expect(runMove('buy', G, '0', 'toxic_bullets')).toBe('INVALID_MOVE');
    expect(buyBlocked(G, '0', 'toxic_bullets')).toBe('souls');
    expect(me.souls).toBe(5 - PRICE[1]);
    expect(me.hand).toHaveLength(1);
  });

  it('souls are paid at the shop, not at play: a card played from the hand costs nothing, with no souls left too', () => {
    const G = freshReadyGame({ step: 'shop' });
    const me = G.players['0'];
    me.souls = PRICE[1];
    expect(runMove('buy', G, '0', 'extended_magazine')).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(0);
    const [card] = me.hand;
    expect(playBlocked(G, '0', card.iid, me.active!.iid)).toBeNull();
    expect(runMove('playCard', G, '0', card.iid, me.active!.iid)).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(0);
    expect(me.active!.attached!.map((it) => it.cardId)).toEqual(['extended_magazine']);
    // A free card (a Story reward) is played the same way, in the act step too.
    G.step = 'act';
    const reward = giveCard(G, '0', 'toxic_bullets');
    expect(runMove('playCard', G, '0', reward.iid, me.bench[0]!.iid)).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(0);
  });

  it('the AI never offers a buy it cannot afford: with nothing affordable it closes the shop', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshReadyGame({ step: 'shop' }); // P0's turn, its shop open
    const ctx: any = { currentPlayer: '0', turn: 2, numPlayers: 2 };
    for (const souls of [0, 1, 2, 3, 4, 7, 8, 12, 20]) {
      G.players['0'].souls = souls;
      for (const lookahead of [false, true]) {
        const moves = enumerateAIMoves(G, ctx, lookahead);
        expect(moves, `${souls} souls`).toHaveLength(1);
        const [m] = moves;
        if (m.move !== 'buy') {
          expect(m.move, `${souls} souls`).toBe('closeShop');
          continue;
        }
        expect(m.args, `${souls} souls`).toHaveLength(1);
        expect(buyPrice(G, '0', m.args[0]), `${souls} souls`).toBeLessThanOrEqual(souls);
        expect(buyBlocked(G, '0', m.args[0]), `${souls} souls`).toBeNull();
      }
    }
    G.players['0'].souls = 1; // nothing in the market costs less than PRICE[1]
    expect(enumerateAIMoves(G, ctx)[0].move).toBe('closeShop');
  });

  it('the AI with no souls still plays a card it holds — the play is free — before it closes the shop', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshReadyGame({ step: 'shop' });
    const ctx: any = { currentPlayer: '0', turn: 2, numPlayers: 2 };
    G.players['0'].souls = 0;
    const card = giveCard(G, '0', 'active_reload'); // Haze's first build item
    const [m] = enumerateAIMoves(G, ctx);
    expect(m).toMatchObject({ move: 'playCard', args: [card.iid, G.players['0'].active!.iid] });
    expect(runMove(m.move, G, '0', ...m.args)).not.toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(0);
    expect(enumerateAIMoves(G, ctx)[0].move).toBe('closeShop');
  });

  it('souls accumulate: what a turn does not spend carries over, and each own turn adds the income', () => {
    const c = readyClient();
    // P0 T1: 4. Don't spend. End → P1 T2. End → P0 T3.
    c.moves.endTurn?.();
    c.moves.endTurn?.();
    const { G } = snap(c);
    expect(G.players['0'].souls).toBe(2 * LANE_INCOME);
  });

  it('souls have no ceiling', () => {
    const c = readyClient();
    // Nobody acts, so nobody falls: each own turn banks the income on top.
    for (let i = 0; i < 6; i++) c.moves.endTurn?.();
    const { G } = snap(c);
    expect(snap(c).ctx.gameover).toBeUndefined();
    expect(G.players['0'].souls).toBe(4 * LANE_INCOME);
    expect(G.players['0'].souls).toBeGreaterThan(10);
  });

  it('the comeback: a side 8 behind on net worth gets 1 more with its income, 16 behind 2 more', () => {
    for (const [ahead, bonus] of [[7, 0], [8, 1], [15, 1], [16, 2]] as const) {
      const c = readyClient();
      c.moves.endTurn?.(); // → P1, turn 2
      const s = c.getState()!;
      const G = structuredClone(s.G) as GameState;
      G.players['1'].souls = ahead; // P1 banks a lead; P0 holds 4 from its first turn
      G.players['0'].souls = 0;
      (c as any).store.dispatch({ type: 'SYNC', state: { ...s, G } });
      c.moves.endTurn?.(); // → P0, turn 3: P0 trails by `ahead`
      expect(snap(c).G.players['0'].souls, `${ahead} behind`).toBe(LANE_INCOME + bonus);
    }
  });

  it('net worth counts worn items at their price (PRICE by tier, actives and passives alike): a side whose heroes wear 8 souls of items is 8 ahead', () => {
    const cases: [CardId[], number, number][] = [
      [['toxic_bullets'], PRICE[3], 1],                                  // one tier 3 passive: 8
      [['titanic_magazine', 'cold_front'], 2 * PRICE[2], 1],             // a tier 2 passive and a tier 2 active: 8
      [['extended_magazine', 'grit', 'extra_health'], 3 * PRICE[1], 0], // three tier 1s: 6, not far enough behind
      [['glass_cannon'], PRICE[4], 2],                                   // one tier 4: 16
    ];
    for (const [items, worth, bonus] of cases) {
      const c = readyClient();
      c.moves.endTurn?.(); // → P1
      const s = c.getState()!;
      const G = structuredClone(s.G) as GameState;
      G.players['0'].souls = 0;
      G.players['1'].souls = 0;
      const bearer = G.players['1'].active!;
      for (const id of items) giveItem(G, bearer, id);
      expect(items.reduce((n, id) => n + itemPrice(id), 0)).toBe(worth);
      expect(netWorth(G, '1') - netWorth(G, '0'), items.join(' + ')).toBe(worth);
      (c as any).store.dispatch({ type: 'SYNC', state: { ...s, G } });
      c.moves.endTurn?.(); // → P0, `worth` behind
      expect(snap(c).G.players['0'].souls, items.join(' + ')).toBe(LANE_INCOME + bonus);
    }
  });

  it('net worth counts the hand at list price too: a side holding 8 souls of cards is 8 ahead', () => {
    for (const [cards, bonus] of [[['toxic_bullets'], 1], [['extended_magazine', 'extra_health'], 0], [['glass_cannon'], 2]] as [CardId[], number][]) {
      const c = readyClient();
      c.moves.endTurn?.(); // → P1
      const s = c.getState()!;
      const G = structuredClone(s.G) as GameState;
      G.players['0'].souls = 0;
      G.players['1'].souls = 0;
      for (const id of cards) giveCard(G, '1', id);
      const worth = cards.reduce((n, id) => n + itemPrice(id), 0);
      expect(netWorth(G, '1') - netWorth(G, '0'), cards.join(' + ')).toBe(worth);
      (c as any).store.dispatch({ type: 'SYNC', state: { ...s, G } });
      c.moves.endTurn?.(); // → P0, `worth` behind
      expect(snap(c).G.players['0'].souls, cards.join(' + ')).toBe(LANE_INCOME + bonus);
    }
  });

  it('a kill pays the victim\'s level + 1 to its opponent', () => {
    const G = freshG();
    const victim = G.players['1'].active!;
    victim.level = 2;
    const killerPid: PlayerID = '0';
    const before = G.players[killerPid].souls;
    // Drop victim to 0 HP with pure damage then reap
    damageUnit(G, victim, victim.hp + 99, 'pure');
    reapDead(G, G.players['1']);
    expect(G.players[killerPid].souls).toBe(before + 3);
  });

  it('a kill of the strictly richest hero on the board pays 2 more; a tie for richest does not', () => {
    const gear = (G: GameState, pid: PlayerID, hero: 'active' | 0, id: string) => {
      giveItem(G, hero === 'active' ? G.players[pid].active! : G.players[pid].bench[hero]!, id);
    };
    const kill = (G: GameState) => {
      const victim = G.players['1'].active!;
      damageUnit(G, victim, victim.hp + 99, 'pure');
      reapDead(G, G.players['1']);
      return G.players['0'].souls;
    };
    const richest = freshG();
    gear(richest, '1', 'active', 'extended_magazine'); // 2 souls of gear, nobody else wears any
    giveCard(richest, '0', 'glass_cannon'); // a card in a hand is no hero's: it makes nobody richer
    expect(kill(richest)).toBe(1 + 1 + 2);
    const tied = freshG();
    gear(tied, '1', 'active', 'extended_magazine');
    gear(tied, '0', 0, 'extra_spirit'); // a hero on the other side wears as much
    expect(kill(tied)).toBe(1 + 1);
    const tiedByAnActive = freshG();
    gear(tiedByAnActive, '1', 'active', 'extended_magazine');
    gear(tiedByAnActive, '0', 0, 'healing_rite'); // an active item counts at its price too
    expect(kill(tiedByAnActive)).toBe(1 + 1);
  });

  it('no bounty when an ally hero is reaped on the killer side (own-board death credits the opponent, not you)', () => {
    const G = freshG();
    // Killing OWN active credits opponent — verify it does not credit self.
    const victim = G.players['0'].active!;
    const selfBefore = G.players['0'].souls;
    const oppBefore = G.players['1'].souls;
    damageUnit(G, victim, victim.hp + 99, 'pure');
    reapDead(G, G.players['0']);
    expect(G.players['0'].souls).toBe(selfBefore); // self unchanged
    expect(G.players['1'].souls).toBe(oppBefore + 2); // opp gets bounty (level 1 + 1)
  });

  it('retreat (swap Active with bench hero) costs RETREAT_COST (1 soul), once a turn', () => {
    const G = freshG();
    G.players['0'].souls = 5;
    const before = G.players['0'].souls;
    const r = runMove('moveHero', G, '0', 1, 0);
    expect(r).not.toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(before - RETREAT_COST);
    expect(runMove('moveHero', G, '0', 2, 0)).toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(before - RETREAT_COST);
  });

  it('retreat is rejected with no soul to pay', () => {
    const G = freshG();
    G.players['0'].souls = 0;
    const r = runMove('moveHero', G, '0', 1, 0);
    expect(r).toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(0); // unchanged
  });

  it('retreat needs two living heroes — a fallen bench hero cannot be sent in', () => {
    const G = freshG();
    G.players['0'].souls = 5;
    G.players['0'].bench[0]!.respawnTurnsLeft = 2; // a corpse on the bench
    expect(runMove('moveHero', G, '0', 1, 0)).toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(5); // nothing charged
    // The living bench hero beside it can still go in.
    expect(runMove('moveHero', G, '0', 2, 0)).not.toBe('INVALID_MOVE');
  });

  it('a fallen Active cannot retreat — promotion replaces it instead', () => {
    const G = freshG();
    G.players['0'].souls = 5;
    G.players['0'].active!.respawnTurnsLeft = 2;
    expect(runMove('moveHero', G, '0', 1, 0)).toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(5);
  });

  it('bench-to-bench reorganization is free', () => {
    const c = readyClient(); // past the shop: a swap is an act-step move
    const before = snap(c).G.players['0'];
    const [first, second] = [before.bench[0]!.iid, before.bench[1]!.iid];
    (c.moves as any).moveHero(1, 2); // bench 1 <-> bench 2
    const after = snap(c).G.players['0'];
    expect([after.bench[0]!.iid, after.bench[1]!.iid]).toEqual([second, first]); // the swap was made
    expect(after.souls).toBe(before.souls); // no soul cost for pure bench swaps
  });

  it('AI enumerates a tactical retreat when its Active is on death\'s door', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    // Set up AI side: low-HP active, healthy bench, 3 souls available.
    G.players['1'].souls = 3;
    G.players['1'].active!.hp = 1;     // critical
    G.players['1'].active!.hpMax = 10;
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx, false);
    // At least one moveHero option from bench (1|2|3) into slot 0 should appear.
    const retreats = moves.filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBeGreaterThan(0);
    // And it should score well enough to be competitive (not the lowest fallback).
    const bestRetreat = retreats.reduce((a, b) => (a.score > b.score ? a : b));
    expect(bestRetreat.score).toBeGreaterThanOrEqual(30);
  });

  it('AI offers a retreat when its Active is healthy and bench is similar, but ranks it behind every other move', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    G.players['1'].souls = 3; // nobody wears an item: a short list, nothing is cut from it
    // Active is full HP, no debuffs, and nobody on the bench hits harder — no reason to
    // retreat. The engine allows it, so it is listed.
    for (const b of G.players['1'].bench) if (b) b.atkMod = (CARDS_BY_ID['hero_abrams'] as { atk: number }).atk - (CARDS_BY_ID[b.cardId] as { atk: number }).atk;
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    for (const lookahead of [false, true]) {
      const moves = enumerateAIMoves(G, ctx, lookahead);
      const isRetreat = (m: { move: string; args: any[] }) => m.move === 'moveHero' && m.args[1] === 0;
      const retreats = moves.filter(isRetreat);
      const rest = moves.filter((m) => !isRetreat(m));
      expect(retreats.length, `lookahead ${lookahead}`).toBeGreaterThan(0);
      // Behind passing and everything else: never the AI's pick, never ahead of a real play.
      expect(Math.max(...retreats.map((m) => m.score))).toBeLessThan(Math.min(...rest.map((m) => m.score)));
      expect(moves.indexOf(retreats[0])).toBeGreaterThan(moves.findIndex((m) => m.move === 'endTurn'));
    }
  });

  it('AI retreats when its Active is hard-CC\'d (stunned/disarmed/silenced)', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    G.players['1'].souls = 3;
    // Stunned active — dead weight even if HP is fine.
    G.players['1'].active!.statuses.push({ id: 'stun', value: 1, duration: 2 });
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx, false);
    const retreats = moves.filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBeGreaterThan(0);
  });

  it('AI retreats when its Active is asleep (any hard crowd control is dead weight, not only a listed few)', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    G.players['1'].souls = 3;
    G.players['1'].active!.statuses.push({ id: 'sleep', value: 1, duration: 2 });
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const retreats = enumerateAIMoves(G, ctx, false).filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBeGreaterThan(0);
    expect(Math.max(...retreats.map((m) => m.score))).toBeGreaterThanOrEqual(28);
  });

  it('AI never retreats into a fallen or bench-only hero', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const { makeHero } = await import('./_helpers');
    const G = freshG();
    G.players['1'].souls = 3;
    G.players['1'].active!.statuses.push({ id: 'stun', value: 1, duration: 2 }); // wants out
    G.players['1'].bench[0]!.respawnTurnsLeft = 2;                // slot 1: a corpse
    G.players['1'].bench[1] = makeHero('hero_rem', '1', 'bench', 2); // slot 2: bench-only
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const retreats = enumerateAIMoves(G, ctx, false).filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.map((m) => m.args[0])).toEqual([3]);
  });

  it('AI cannot retreat when it lacks souls (cost-filtered out)', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    G.players['1'].souls = RETREAT_COST - 1; // below RETREAT_COST
    G.players['1'].active!.hp = 1;     // would want to retreat
    G.players['1'].active!.hpMax = 10;
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx, false);
    const retreats = moves.filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBe(0);
  });

  // ----- Spirit scaling on hero skills (use Lady Geist as representative — Life Drain, 3 spirit) -----
  it('hero skill at 0 SPI deals base damage (Lady Geist: 3 + 0 = 3 spirit)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_lady_geist'];
    expect(skill.scalesSpirit).toBe(true);
    expect(skill.base).toBe(3);
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 0;
    const target = G.players['1'].active!;
    target.hpMax = 20; target.hp = 20;
    const hpBefore = target.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster, target });
    expect(hpBefore - target.hp).toBe(3);
  });

  it('hero skill at +3 SPI deals base + spirit (Lady Geist: 3 + 3 = 6 spirit)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_lady_geist'];
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 3;
    const target = G.players['1'].active!;
    target.hpMax = 20; target.hp = 20; // soak the full damage to measure it
    const hpBefore = target.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster, target });
    expect(hpBefore - target.hp).toBe(6); // base 3 + 3 spirit
  });

  it('heal is flat — Spirit does NOT scale heals (Dynamo heal 2)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_dynamo'];
    const G = freshG();
    const healer = G.players['0'].active!;
    healer.spiritMod = 2; // spirit should be ignored for heals
    const ally = G.players['0'].bench[0]!;
    ally.hpMax = 20;
    ally.hp = 1;
    const hpBefore = ally.hp;
    skill.run(G, { movingPlayer: '0' }, { source: healer, target: ally });
    expect(ally.hp - hpBefore).toBe(2); // flat 2, no spirit
  });

  it('shield magnitude is flat — Spirit does NOT scale shields (Paige shield 2)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_paige'];
    const G = freshG();
    const paige = G.players['0'].active!;
    paige.spiritMod = 4; // spirit should be ignored for shields
    const ally = G.players['0'].bench[0]!;
    skill.run(G, { movingPlayer: '0' }, { source: paige, target: ally });
    const sh = ally.statuses.find((s) => s.id === 'shield');
    expect(sh?.value).toBe(2); // flat 2, no spirit
  });

  it('no skill has bullet scaling — all damage scaling goes through Spirit', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skillIds = Object.keys(ABILITIES_BY_ID).filter((id) => id.startsWith('skill_'));
    for (const id of skillIds) {
      const a = ABILITIES_BY_ID[id];
      // After the spirit-only redesign, scalesBullet should not exist on any skill.
      expect((a as any).scalesBullet).toBeUndefined();
    }
  });
});
