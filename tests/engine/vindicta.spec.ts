/**
 * Vindicta (Patrick, 2026-11-16; docs/hero-design.md): Assassinate is her skill
 * — a snipe that holds 2 charges and takes long to come back — and Flight her
 * ultimate: for 3 turns 1 hit in 3 on her misses, and her attacks add spirit
 * damage.
 *
 * The miss is a roll on the match's own seeded stream, so a game replays. A
 * preview and the AI's look roll nothing (engine/chance.ts): nobody sees a
 * dodge before the hit is made.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { ULTIMATES } from '@/cards/ultimates';
import { ABILITIES_BY_ID } from '@/abilities';
import { enumerateAIMoves } from '@/ai/heuristic';
import { INVALID, perform, type Action } from '@/engine/engine';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { withBlindRolls } from '@/engine/chance';
import { damageUnit } from '@/engine/damage';
import { forecastAttack } from '@/engine/forecast';
import { skillBlocked } from '@/engine/legality';
import { heroAbilities, heroesOf, kitCharges } from '@/engine/query';
import { addStatus } from '@/engine/statusOps';
import { FLIGHT_DODGE_IN, FLIGHT_TURNS, ULT_WAIT } from '@/engine/constants';
import { freshReadyGame, giveItem } from './_helpers';

function nextTurn(G: GameState, pid: PlayerID): PlayerID {
  const next: PlayerID = pid === '0' ? '1' : '0';
  endTurnEffects(G, pid);
  beginTurn(G, next, G.turnNumber + 1 + G.draftTurnsOffset);
  return next;
}
const round = (G: GameState) => { nextTurn(G, '0'); nextTurn(G, '1'); };
const act = (G: GameState, pid: PlayerID, a: Action) => expect(perform(G, pid, a), JSON.stringify(a)).not.toBe(INVALID);
const flying = (c: CardInstance) => c.statuses.find((s) => s.id === 'flying');
const rolls = (G: GameState) => G.counters?.rng ?? 0;

/** P0's turn; Vindicta on its bench (slot 1), Level `level`, every hero of both sides tough. */
function board(level: 1 | 2 = 1): { G: GameState; vindicta: CardInstance; foes: CardInstance[] } {
  const G = freshReadyGame();
  const vindicta = G.players['0'].bench[0]!;
  expect(vindicta.cardId).toBe('hero_vindicta');
  vindicta.level = level;
  vindicta.cooldowns = undefined;
  for (const pid of ['0', '1'] as const) for (const h of heroesOf(G.players[pid])) { h.hpMax = 60; h.hp = 60; }
  return { G, vindicta, foes: heroesOf(G.players['1']) };
}

describe('her card', () => {
  it('a skill and an ultimate, no passive: Assassinate (2 charges, 5 turns each) and Flight (small, 15 words or fewer)', () => {
    const card = CARDS_BY_ID.hero_vindicta;
    expect(card).toMatchObject({ skills: ['skill_vindicta'], ult: 'eff_ult_vindicta' });
    expect(card.type === 'hero' && card.passives).toBeFalsy();
    expect(card.type === 'hero' ? heroAbilities(card).map((a) => [a.kind, a.ability.name]) : []).toEqual([['skill', 'Assassinate']]);
    const snipe = ABILITIES_BY_ID.skill_vindicta as { cooldown?: number; charges?: number; target: string };
    expect([snipe.charges, snipe.cooldown, snipe.target]).toEqual([2, 5, 'enemyHero']);
    const ult = ULTIMATES.find((u) => u.id === 'ult_vindicta')!;
    expect([ult.name, ult.size]).toEqual(['Flight', 'small']);
    expect((ult.text ?? '').split(/\s+/).length).toBeLessThanOrEqual(15);
    expect([FLIGHT_TURNS, FLIGHT_DODGE_IN]).toEqual([3, 3]);
  });
});

describe('Assassinate: a snipe that holds 2 charges and takes 5 turns to come back', () => {
  it('4 + her Spirit to any enemy, a bench hero too', () => {
    const { G, vindicta, foes } = board();
    vindicta.spiritMod = 2;
    const benched = G.players['1'].bench[1]!;
    act(G, '0', { type: 'useSkill', heroIid: vindicta.iid, targetIid: benched.iid });
    expect(benched.hp).toBe(60 - 6);
    expect(foes.filter((f) => f !== benched).every((f) => f.hp === 60)).toBe(true);
  });

  it('two turns running, then none; a charge comes back on her fifth turn after the first shot', () => {
    const { G, vindicta } = board();
    const target = G.players['1'].active!.iid;
    const snipe: Action = { type: 'useSkill', heroIid: vindicta.iid, targetIid: target };
    expect(kitCharges(vindicta)).toEqual({ max: 2, left: 2 });
    act(G, '0', snipe);
    expect(vindicta.cooldowns?.skill_vindicta).toBe(5);
    round(G);
    act(G, '0', snipe);
    expect(kitCharges(vindicta)).toEqual({ max: 2, left: 0 });
    round(G);
    expect(skillBlocked(G, '0', vindicta, target)).toBe('cooldown');
    expect(perform(G, '0', snipe)).toBe(INVALID);
    round(G); round(G);                                // her third and fourth turns after the first shot
    expect(skillBlocked(G, '0', vindicta, target)).toBe('cooldown');
    round(G);                                          // the fifth: one charge is back
    expect(kitCharges(vindicta)).toEqual({ max: 2, left: 1 });
    expect(skillBlocked(G, '0', vindicta, target)).toBeNull();
  });

  it('the charge items reach it: Extra Charge makes it 3', () => {
    const { G, vindicta } = board();
    giveItem(G, vindicta, 'extra_charge');
    expect(kitCharges(vindicta)).toEqual({ max: 3, left: 3 });
  });
});

describe('Flight: for 3 turns she flies', () => {
  const fly = (v: CardInstance): Action => ({ type: 'useSkill', heroIid: v.iid, skillId: 'eff_ult_vindicta' });

  it('her ultimate, from Level 2, for no souls: the Flying status for 3 of her turns, then a small ultimate\'s wait', () => {
    const { G, vindicta } = board(2);
    G.players['0'].souls = 0;
    act(G, '0', fly(vindicta));
    expect(flying(vindicta)).toMatchObject({ duration: FLIGHT_TURNS });
    expect(vindicta.cooldowns?.eff_ult_vindicta).toBe(ULT_WAIT.small);
    expect(G.players['0'].souls).toBe(0);
    round(G); round(G);
    expect(flying(vindicta)).toBeDefined();            // through the rival's third turn
    nextTurn(G, '0');
    expect(flying(vindicta)).toBeDefined();
    nextTurn(G, '1');                                  // her third turn after begins: she lands
    expect(flying(vindicta)).toBeUndefined();
  });

  it('while she flies her attack adds 1 + her Spirit as spirit damage; on the ground it does not', () => {
    for (const up of [false, true]) {
      const G = freshReadyGame();
      const me = G.players['0'];
      const vindicta = me.bench[0]!;
      [me.active, me.bench[0]] = [vindicta, me.active];
      vindicta.zone = 'active'; vindicta.slot = undefined;
      me.bench[0]!.zone = 'bench'; me.bench[0]!.slot = 1;
      vindicta.spiritMod = 1;
      const foe = G.players['1'].active!;
      foe.hpMax = 40; foe.hp = 40;
      if (up) addStatus(G, vindicta, 'flying', 1, FLIGHT_TURNS);
      act(G, '0', { type: 'attack' });
      expect(40 - foe.hp, up ? 'flying' : 'on the ground').toBe(2 + (up ? 2 : 0)); // her 2 Attack; Flight's 1 + 1 Spirit
    }
  });
});

describe('a flying hero is missed 1 time in 3', () => {
  /** `n` hits of 1 on a flying Vindicta under `seed`: how many missed. */
  function misses(seed: number, n: number): { missed: number; G: GameState; vindicta: CardInstance } {
    const { G, vindicta } = board();
    G.seed = seed;
    vindicta.hpMax = 1000; vindicta.hp = 1000;
    addStatus(G, vindicta, 'flying', 1, 99);
    for (let i = 0; i < n; i++) damageUnit(G, vindicta, 1, i % 3 === 0 ? 'attack' : i % 3 === 1 ? 'spirit' : 'pure', 'test');
    return { missed: n - (1000 - vindicta.hp), G, vindicta };
  }

  it('about a third of hits miss, whatever their type — and a miss takes nothing', () => {
    let total = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { missed } = misses(seed, 300);
      expect(missed, `seed ${seed}`).toBeGreaterThan(70);
      expect(missed, `seed ${seed}`).toBeLessThan(130);
      total += missed;
    }
    expect(total / 1800).toBeGreaterThan(0.29);
    expect(total / 1800).toBeLessThan(0.38);
  });

  it('the roll is the match\'s own: the same game misses the same hits, and each hit on a flier draws one number', () => {
    const a = misses(42, 60);
    const b = misses(42, 60);
    expect(a.missed).toBe(b.missed);
    expect(a.vindicta.hp).toBe(b.vindicta.hp);
    const { G, vindicta } = board();
    addStatus(G, vindicta, 'flying', 1, 99);
    const before = rolls(G);
    damageUnit(G, vindicta, 1, 'attack', 'test');
    expect(rolls(G)).toBe(before + 1);
    expect(G.fx.some((e) => e.kind === 'immune' && e.what === 'flying') || vindicta.hp === 59).toBe(true);
  });

  it('a hero on the ground is never missed and no number is drawn for it', () => {
    const { G, vindicta } = board();
    const before = rolls(G);
    for (let i = 0; i < 30; i++) damageUnit(G, vindicta, 1, 'attack', 'test');
    expect(vindicta.hp).toBe(30);
    expect(rolls(G)).toBe(before);
  });
});

describe('nobody sees the roll before the hit is made', () => {
  /** P1's turn: its Active is about to swing at a flying Vindicta in P0's lane. */
  function aimed(seed: number): { G: GameState; vindicta: CardInstance } {
    const G = freshReadyGame();
    G.seed = seed;
    const me = G.players['0'];
    const vindicta = me.bench[0]!;
    [me.active, me.bench[0]] = [vindicta, me.active];
    vindicta.zone = 'active'; vindicta.slot = undefined;
    me.bench[0]!.zone = 'bench'; me.bench[0]!.slot = 1;
    vindicta.hpMax = 40; vindicta.hp = 40;
    addStatus(G, vindicta, 'flying', 1, 99);
    G.turnNumber = 3;                                  // P1's turn
    return { G, vindicta };
  }

  it('a preview is blind: it shows the hit landing and draws no number, whatever the roll will be', () => {
    let dodged = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const { G, vindicta } = aimed(seed);
      const before = rolls(G);
      const preview = withBlindRolls(() => forecastAttack(G, '1'));
      expect(preview.damageToActive, `seed ${seed}`).toBeGreaterThan(0);
      expect(rolls(G)).toBe(before);
      // The attack made rolls for real — and the forecast taken as it is committed says the same.
      const committed = forecastAttack(G, '1');
      act(G, '1', { type: 'attack' });
      expect(40 - vindicta.hp, `seed ${seed}`).toBe(committed.damageToActive);
      if (vindicta.hp === 40) dodged++;
    }
    expect(dodged).toBeGreaterThan(0);                 // some of those swings did miss…
    expect(dodged).toBeLessThan(24);                   // …and some landed
  });

  it('the AI\'s look is blind too: it draws no number, and it values the swing as landing', () => {
    const { G } = aimed(7);
    const before = rolls(G);
    const top = enumerateAIMoves(G, { currentPlayer: '1', turn: 3, numPlayers: 2 } as never);
    expect(rolls(G)).toBe(before);
    expect(top.some((o) => o.move === 'attack')).toBe(true);
  });
});
