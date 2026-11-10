import { describe, it, expect, beforeAll, onTestFinished } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import type { CardId, GameState, PlayerID } from '@/engine/types';
import type { Ctx } from 'boardgame.io';
import { damageUnit } from '@/engine/damage';
import { reapDead } from '@/engine/death';
import { CARDS_BY_ID } from '@/cards';
import { LANE_INCOME, PRICE } from '@/engine/constants';
import { playBlocked, playCost, retreatCost } from '@/engine/legality';
import { heroRetreat, itemPrice, netWorth } from '@/engine/query';
import { freshReadyGame, configureReadyMatch, giveCard, giveItem, makeHero, readyClient } from './_helpers';

// Boot the boardgame.io Client straight into a playable match (skip the draft).
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
  it('the income: the player on turn 1 has LANE_INCOME (5) souls; the other has none until its turn', () => {
    const c = readyClient();
    const { G } = snap(c);
    expect(LANE_INCOME).toBe(5);
    expect(G.players['0'].souls).toBe(LANE_INCOME);
    expect(G.players['1'].souls).toBe(0);
  });

  it('putting an item on a hero costs its price; one it cannot afford is refused, costs nothing and stays in the hand', () => {
    const G = freshReadyGame(); // P0's turn
    const me = G.players['0'];
    me.souls = 5;
    // Extended Magazine: a tier 1 passive item, +1 Bullet Power, at its tier's price.
    expect(itemPrice('extended_magazine')).toBe(PRICE[1]);
    const mag = giveCard(G, '0', 'extended_magazine');
    expect(runMove('playCard', G, '0', mag.iid, me.active!.iid)).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(5 - PRICE[1]);
    // Sharpshooter is tier 3 (8 souls): 3 left is not enough.
    const sharp = giveCard(G, '0', 'sharpshooter');
    expect(itemPrice('sharpshooter')).toBe(PRICE[3]);
    expect(playBlocked(G, '0', sharp.iid, me.bench[0]!.iid)).toBe('souls');
    expect(runMove('playCard', G, '0', sharp.iid, me.bench[0]!.iid)).toBe('INVALID_MOVE');
    expect(me.souls).toBe(5 - PRICE[1]);
    expect(me.hand).toEqual([sharp]);
  });

  it('souls are paid at the play, not at the draw: a card in the hand costs nothing to hold; an upgrade onto the hero wearing its part costs the difference, onto another its price', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 0;
    const held = giveCard(G, '0', 'titanic_magazine');
    expect(me.souls).toBe(0);
    expect(playBlocked(G, '0', held.iid, me.active!.iid)).toBe('souls');
    // Haze wears Extended Magazine (tier 1): Titanic Magazine (tier 2) on him costs 4 - 2.
    giveItem(G, me.active!, 'extended_magazine');
    expect(playCost(me.active!, 'titanic_magazine')).toBe(PRICE[2] - PRICE[1]);
    expect(playCost(me.bench[0]!, 'titanic_magazine')).toBe(PRICE[2]);
    me.souls = PRICE[2] - PRICE[1];
    expect(playBlocked(G, '0', held.iid, me.bench[0]!.iid)).toBe('souls');
    expect(runMove('playCard', G, '0', held.iid, me.active!.iid)).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(0);
    expect(me.active!.attached!.map((it) => it.cardId)).toEqual(['titanic_magazine']);
    // A hero card goes to the bench for nothing.
    G.players['0'].bench[2] = null;
    const hero = giveCard(G, '0', 'hero_kelvin');
    expect(runMove('placeHero', G, '0', hero.iid)).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(0);
    expect(me.bench[2]).toBe(hero);
  });

  it('the AI never offers a play it cannot afford', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshReadyGame(); // P0's turn
    const ctx: any = { currentPlayer: '0', turn: 2, numPlayers: 2 };
    for (const id of ['extended_magazine', 'titanic_magazine', 'toxic_bullets', 'glass_cannon']) giveCard(G, '0', id);
    for (const souls of [0, 1, 2, 3, 4, 7, 8, 12, 20]) {
      G.players['0'].souls = souls;
      for (const lookahead of [false, true]) {
        const plays = enumerateAIMoves(G, ctx, lookahead).filter((m) => m.move === 'playCard');
        for (const m of plays) {
          const hero = [G.players['0'].active!, ...G.players['0'].bench].find((h) => h?.iid === m.args[1])!;
          const card = G.players['0'].hand.find((c) => c.iid === m.args[0])!;
          expect(playCost(hero, card.cardId), `${souls} souls`).toBeLessThanOrEqual(souls);
          expect(playBlocked(G, '0', m.args[0], m.args[1]), `${souls} souls`).toBeNull();
        }
        if (souls < PRICE[1]) expect(plays, `${souls} souls`).toEqual([]);
      }
    }
  });

  it('the AI with no souls still benches a hero from its hand — free — and plays no item', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshReadyGame();
    const ctx: any = { currentPlayer: '0', turn: 2, numPlayers: 2 };
    G.players['0'].souls = 0;
    G.players['0'].bench[2] = null;
    const hero = giveCard(G, '0', 'hero_kelvin');
    giveCard(G, '0', 'active_reload'); // Haze's first build item, unaffordable
    // The AI's turn, move by move, up to its end.
    for (let i = 0; i < 20; i++) {
      const [m] = enumerateAIMoves(G, ctx);
      expect(m.move).not.toBe('playCard');
      if (m.move === 'endTurn' || m.move === 'attack') break;
      expect(runMove(m.move, G, '0', ...m.args)).not.toBe('INVALID_MOVE');
    }
    expect(G.players['0'].bench[2]).toBe(hero);
    expect(G.players['0'].souls).toBe(0);
    expect(G.players['0'].hand.map((c) => c.cardId)).toEqual(['active_reload']);
  });

  it('souls accumulate: what a turn does not spend carries over, and each own turn adds the income', () => {
    const c = readyClient();
    // P0 T1: 5. Don't spend. End → P1 T2. End → P0 T3.
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

  it('no comeback: a side far behind on net worth gets the lane\'s income and nothing more', () => {
    for (const ahead of [7, 8, 16, 40]) {
      const c = readyClient();
      c.moves.endTurn?.(); // → P1, turn 2
      const s = c.getState()!;
      const G = structuredClone(s.G) as GameState;
      G.players['1'].souls = ahead; // P1 banks a lead
      G.players['0'].souls = 0;
      (c as any).store.dispatch({ type: 'SYNC', state: { ...s, G } });
      c.moves.endTurn?.(); // → P0, turn 3: P0 trails by `ahead`
      expect(snap(c).G.players['0'].souls, `${ahead} behind`).toBe(LANE_INCOME);
    }
  });

  it('net worth counts worn items at their price (PRICE by tier, actives and passives alike): a side whose heroes wear 8 souls of items is 8 ahead — and its rival\'s income stays the lane\'s', () => {
    const cases: [CardId[], number, number][] = [
      [['toxic_bullets'], PRICE[3], 0],                                  // one tier 3 passive: 8
      [['titanic_magazine', 'cold_front'], 2 * PRICE[2], 0],             // a tier 2 passive and a tier 2 active: 8
      [['extended_magazine', 'grit', 'extra_health'], 3 * PRICE[1], 0], // three tier 1s: 6
      [['glass_cannon'], PRICE[4], 0],                                   // one tier 4: 16
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

  it('net worth counts the hand\'s items at list price too (a hero card at nothing): a side holding 8 souls of cards is 8 ahead', () => {
    for (const [cards, bonus] of [[['toxic_bullets'], 0], [['extended_magazine', 'extra_health', 'hero_kelvin'], 0], [['glass_cannon'], 0]] as [CardId[], number][]) {
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

  it('a kill pays no souls: knockouts push the map and give exp, nothing more', () => {
    const G = freshG();
    const victim = G.players['1'].active!;
    victim.level = 2;
    const before = G.players['0'].souls;
    // Drop victim to 0 HP with pure damage then reap
    damageUnit(G, victim, victim.hp + 99, 'pure');
    reapDead(G, G.players['1']);
    expect(G.players['0'].souls).toBe(before);
  });

  it('a kill of the richest hero on the board pays no souls either', () => {
    const G = freshG();
    giveItem(G, G.players['1'].active!, 'glass_cannon');
    const victim = G.players['1'].active!;
    damageUnit(G, victim, victim.hp + 99, 'pure');
    reapDead(G, G.players['1']);
    expect(G.players['0'].souls).toBe(0);
  });

  it('a hero reaped on either side pays nobody', () => {
    const G = freshG();
    const victim = G.players['0'].active!;
    const selfBefore = G.players['0'].souls;
    const oppBefore = G.players['1'].souls;
    damageUnit(G, victim, victim.hp + 99, 'pure');
    reapDead(G, G.players['0']);
    expect(G.players['0'].souls).toBe(selfBefore);
    expect(G.players['1'].souls).toBe(oppBefore);
  });

  it("retreat (swap Active with bench hero) costs the leaving hero's printed retreat (Haze's), once a turn", () => {
    const G = freshG();
    G.players['0'].souls = 5;
    const before = G.players['0'].souls;
    const price = heroRetreat(G.players['0'].active!);
    expect(price).toBeGreaterThan(0);
    const r = runMove('moveHero', G, '0', 1, 0);
    expect(r).not.toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(before - price);
    expect(runMove('moveHero', G, '0', 2, 0)).toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(before - price);
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
    const c = readyClient();
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
    G.turnNumber = 3; // P1's turn (it moves first)
    const ctx: any = { currentPlayer: '1', turn: 3, numPlayers: 2 };
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
    G.turnNumber = 3; // P1's turn (it moves first)
    const ctx: any = { currentPlayer: '1', turn: 3, numPlayers: 2 };
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
    G.turnNumber = 3; // P1's turn (it moves first)
    const ctx: any = { currentPlayer: '1', turn: 3, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx, false);
    const retreats = moves.filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBeGreaterThan(0);
  });

  it('AI retreats when its Active is asleep (any hard crowd control is dead weight, not only a listed few)', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    G.players['1'].souls = 3;
    G.players['1'].active!.statuses.push({ id: 'sleep', value: 1, duration: 2 });
    G.turnNumber = 3; // P1's turn (it moves first)
    const ctx: any = { currentPlayer: '1', turn: 3, numPlayers: 2 };
    const retreats = enumerateAIMoves(G, ctx, false).filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBeGreaterThan(0);
    expect(Math.max(...retreats.map((m) => m.score))).toBeGreaterThanOrEqual(28);
  });

  it('AI never retreats into a fallen or bench-only hero (no card is bench-only now: Rem flagged by hand)', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const { makeHero, flagBenchOnly } = await import('./_helpers');
    const undo = flagBenchOnly('hero_rem');
    onTestFinished(undo);
    const G = freshG();
    G.players['1'].souls = 3;
    G.players['1'].active!.statuses.push({ id: 'stun', value: 1, duration: 2 }); // wants out
    G.players['1'].bench[0]!.respawnTurnsLeft = 2;                // slot 1: a corpse
    G.players['1'].bench[1] = makeHero('hero_rem', '1', 'bench', 2); // slot 2: bench-only
    G.turnNumber = 3; // P1's turn (it moves first)
    const ctx: any = { currentPlayer: '1', turn: 3, numPlayers: 2 };
    const retreats = enumerateAIMoves(G, ctx, false).filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.map((m) => m.args[0])).toEqual([3]);
  });

  it('AI cannot retreat when it lacks souls (cost-filtered out)', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    G.players['1'].souls = retreatCost(G, '1') - 1; // a soul short of Abrams' retreat
    G.players['1'].active!.hp = 1;     // would want to retreat
    G.players['1'].active!.hpMax = 10;
    G.turnNumber = 3; // P1's turn (it moves first)
    const ctx: any = { currentPlayer: '1', turn: 3, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx, false);
    const retreats = moves.filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBe(0);
  });

  // ----- Spirit scaling on hero skills (use Lady Geist as representative — Essence Bomb, {sp:1} spirit to every enemy) -----
  it("hero skill at 0 SPI deals base damage (Lady Geist's Essence Bomb: 1 + 0 = 1 spirit to each enemy)", async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_lady_geist'];
    expect(skill.scalesSpirit).toBe(true);
    expect(skill.base).toBe(1);
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 0;
    const target = G.players['1'].active!;
    target.hpMax = 20; target.hp = 20;
    const hpBefore = target.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster, target });
    expect(hpBefore - target.hp).toBe(1);
  });

  it("hero skill at +3 SPI deals base + spirit (Lady Geist's Essence Bomb: 1 + 3 = 4 spirit to each enemy)", async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_lady_geist'];
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 3;
    const target = G.players['1'].active!;
    target.hpMax = 20; target.hp = 20; // soak the full damage to measure it
    const hpBefore = target.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster, target });
    expect(hpBefore - target.hp).toBe(4); // base 1 + 3 spirit
  });

  it("a flat heal is flat — Spirit does NOT scale it (Healing Rite's 2); Rem's Tag Along prints {sp:4} and does", async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const G = freshG();
    const rem = makeHero('hero_rem', '0', 'bench', 1);
    G.players['0'].bench[0] = rem;
    rem.spiritMod = 2;
    const ally = G.players['0'].active!;
    ally.hpMax = 20;
    ally.hp = 1;
    // A flat heal: the caster's Spirit is ignored.
    ABILITIES_BY_ID['eff_healing_rite'].run(G, { movingPlayer: '0' }, { source: rem, target: ally });
    expect(ally.hp - 1).toBe(2);
    ally.hp = 1;
    ABILITIES_BY_ID['skill_rem'].run(G, { movingPlayer: '0' }, { source: rem, target: ally });
    expect(ally.hp - 1).toBe(4 + 2); // {sp:4}
  });

  it("a flat shield is flat — Spirit does NOT scale it (Warden's Willpower: Shield 3); Paige's Plot Armor prints {sp:2} and does", async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const G = freshG();
    const warden = makeHero('hero_warden', '0', 'active', 0);
    G.players['0'].active = warden;
    warden.spiritMod = 4; // spirit is ignored for Willpower's shield
    ABILITIES_BY_ID['skill_warden'].run(G, { movingPlayer: '0' }, { source: warden, target: warden });
    expect(warden.statuses.find((s) => s.id === 'shield')?.value).toBe(3); // flat 3, no spirit
    const paige = G.players['0'].bench[2]!;
    expect(paige.cardId).toBe('hero_paige');
    paige.spiritMod = 4;
    const ally = G.players['0'].bench[0]!;
    ABILITIES_BY_ID['skill_paige'].run(G, { movingPlayer: '0' }, { source: paige, target: ally });
    expect(ally.statuses.find((s) => s.id === 'shield')?.value).toBe(2 + 4);
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
