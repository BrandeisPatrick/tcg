import { describe, it, expect } from 'vitest';
import { forecastAttack, simulate, type AttackStep } from '@/engine/forecast';
import { INVALID, perform } from '@/engine/engine';
import { attackBlocked } from '@/engine/legality';
import { addStatus } from '@/engine/statusOps';
import type { CardInstance, GameState, HeroCard } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { freshReadyGame, makeHero } from './_helpers';
import { structureHp } from '@/engine/query';

/**
 * The forecast is the real attack run on a copy and read back, so it can never
 * disagree with the real attack. These boards are the ones a hand-written
 * mirror of the resolver gets wrong or has to special-case: each case states
 * what the attack does swing by swing, and every case is checked against the
 * real attack made through `perform` on a clone — the totals, the target's
 * fate, and the very events the attack appends to G.fx (same seqs).
 */

function wear(bearer: CardInstance, cardId: string) {
  (bearer.attached ??= []).push({
    iid: `eq-${cardId}`, cardId, ownerId: bearer.ownerId, zone: 'equipment',
    attachedTo: bearer.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
  });
}
const extraAttacks = (card: CardInstance, n: number) => card.statuses.push({ id: 'extra_attack', value: n, duration: 99 });

/** P0's Active becomes `hero` (as the lone attacker), its Attack 3 whatever its
 *  card prints; P1's is Abrams at 40 HP with nothing on the bench. */
function board(hero: string) {
  const G = freshReadyGame();
  const attacker = G.players['0'].active = makeHero(hero, '0', 'active', 0);
  attacker.atkMod = 3 - (CARDS_BY_ID[hero] as HeroCard).atk;
  const defender = G.players['1'].active!;
  defender.hpMax = defender.hp = 40;
  G.players['1'].bench = [null, null, null];
  return { G, attacker, defender };
}

interface Case {
  name: string;
  build: () => GameState;
  /** What each swing does, in order. */
  steps: Partial<AttackStep>[];
  damageToActive: number;
  pushDamage: number;
  /** The defender's Active falls. */
  ko: boolean;
  /** How a mirror of the resolver (the planner this forecast replaced) got this board wrong, if it did. */
  oldPlanner?: string;
}

const cases: Case[] = [
  {
    name: 'Frenzy below half HP with an Extra Attack and a lifesteal item: the +3 is gone by the second swing',
    build: () => {
      const { G, attacker } = board('hero_dynamo');
      wear(attacker, 'frenzy'); wear(attacker, 'bullet_lifesteal');
      attacker.hpMax = 10; attacker.hp = 2; // Frenzy's heal 2 + lifesteal 2 lift it over half
      extraAttacks(attacker, 1);
      return G;
    },
    steps: [
      { rawDamage: 6, finalDamage: 6, predictedHpAfter: 34, predictedKO: false, shieldAbsorbed: 0, bonusLabel: 'Frenzy: +3 <½ HP' },
      { rawDamage: 3, finalDamage: 3, predictedHpAfter: 31, predictedKO: false, shieldAbsorbed: 0, bonusLabel: 'Extra Attack' },
    ],
    damageToActive: 9, pushDamage: 0, ko: false,
  },
  {
    name: "Haze's Fixation: the target's stack adds to her swing, and the swing adds a stack the Extra Attack hits with",
    build: () => {
      const { G, attacker, defender } = board('hero_haze');
      addStatus(G, defender, 'fixation', 1, 99); extraAttacks(attacker, 1);
      return G;
    },
    steps: [
      { rawDamage: 4, finalDamage: 4, predictedHpAfter: 36, bonusLabel: 'Fixation +1' },
      { rawDamage: 5, finalDamage: 5, predictedHpAfter: 31, bonusLabel: 'Extra Attack' },
    ],
    damageToActive: 9, pushDamage: 0, ko: false,
  },
  {
    name: "Haze's Fixation stops at 2 stacks: seven swings at the Extra Attack cap hit for 3, 4, then 5 each",
    build: () => { const { G, attacker } = board('hero_haze'); extraAttacks(attacker, 6); return G; },
    steps: [3, 4, 5, 5, 5, 5, 5].map((dmg, i, all) => ({
      rawDamage: dmg, finalDamage: dmg,
      predictedHpAfter: 40 - all.slice(0, i + 1).reduce((a, b) => a + b, 0),
      bonusLabel: i === 0 ? undefined : 'Extra Attack',
    })),
    damageToActive: 32, pushDamage: 0, ko: false,
  },
  {
    name: 'a Shield eats part of the first swing and is gone for the second',
    build: () => {
      const { G, attacker, defender } = board('hero_dynamo');
      addStatus(G, defender, 'shield', 2, 999); extraAttacks(attacker, 1);
      return G;
    },
    steps: [
      { rawDamage: 3, finalDamage: 1, shieldAbsorbed: 2, predictedHpAfter: 39 },
      { rawDamage: 3, finalDamage: 3, shieldAbsorbed: 0, predictedHpAfter: 36 },
    ],
    damageToActive: 4, pushDamage: 0, ko: false,
  },
  {
    name: 'an Invulnerable target shrugs off every swing',
    build: () => {
      const { G, attacker, defender } = board('hero_dynamo');
      addStatus(G, defender, 'invulnerable', 1, 1); extraAttacks(attacker, 1);
      return G;
    },
    steps: [
      { rawDamage: 3, finalDamage: 0, predictedHpAfter: 40, predictedKO: false },
      { rawDamage: 3, finalDamage: 0, predictedHpAfter: 40, predictedKO: false },
    ],
    damageToActive: 0, pushDamage: 0, ko: false,
  },
  {
    name: "Vindicta's Flight rider (1 + her Spirit as a spirit hit) finishes the target after the bullet",
    build: () => {
      const { G, attacker, defender } = board('hero_vindicta');
      attacker.spiritMod = 3; defender.hpMax = defender.hp = 4;
      return G;
    },
    // The bullet itself does not drop it (predictedKO false: the choreographer
    // does not break the card on it) — the rider does, and the FX layer plays
    // that knockout. The plan still says it fell.
    steps: [{ rawDamage: 3, finalDamage: 3, predictedHpAfter: 0, predictedKO: false }],
    damageToActive: 4, pushDamage: 2, ko: true,
    oldPlanner: 'saw only the 3-damage bullet: 1 HP left, no push, 3 damage',
  },
  {
    name: "Mirage's Djinn's Mark detonates when the swing makes the 3rd stack: the target takes 4 + his Spirit more",
    build: () => {
      const { G, attacker, defender } = board('hero_mirage');
      attacker.spiritMod = 2; addStatus(G, defender, 'djinns_mark', 2, 3);
      return G;
    },
    steps: [{ rawDamage: 3, finalDamage: 3, predictedHpAfter: 31, predictedKO: false }],
    damageToActive: 9, pushDamage: 0, ko: false,
    oldPlanner: 'saw only the 3-damage bullet: 37 HP left, 3 damage',
  },
  {
    name: 'Ricochet drops the last bench hero as the swing drops the Active: both falls push (level + 1 each)',
    build: () => {
      const { G, attacker, defender } = board('hero_dynamo');
      wear(attacker, 'ricochet');
      defender.hpMax = defender.hp = 3;
      const bench = G.players['1'].bench[0] = makeHero('hero_dynamo', '1', 'bench', 1);
      bench.hp = 2;
      return G;
    },
    steps: [{ rawDamage: 3, finalDamage: 3, predictedHpAfter: 0, predictedKO: true }],
    damageToActive: 3, pushDamage: 4, ko: true,
    oldPlanner: 'charged the patron for the Active only: 1 life',
  },
  {
    name: "Crippling Headshot's Bullet Resist −2 lands after the first swing, so the second takes 2 more",
    build: () => { const { G, attacker } = board('hero_dynamo'); wear(attacker, 'crippling_headshot'); extraAttacks(attacker, 1); return G; },
    steps: [
      { rawDamage: 3, finalDamage: 3, predictedHpAfter: 37 },
      { rawDamage: 3, finalDamage: 5, predictedHpAfter: 32 },
    ],
    damageToActive: 8, pushDamage: 0, ko: false,
    oldPlanner: 'held the target\'s resist fixed across the swings: 6 damage',
  },
  {
    name: 'a Vindicta in the lane takes the whole bullet: her Flight no longer takes 1 off it',
    build: () => {
      const { G } = board('hero_dynamo');
      const vindicta = G.players['1'].active = makeHero('hero_vindicta', '1', 'active', 0);
      vindicta.hpMax = vindicta.hp = 40;
      return G;
    },
    steps: [{ rawDamage: 3, finalDamage: 3, predictedHpAfter: 37 }],
    damageToActive: 3, pushDamage: 0, ko: false,
  },
];

describe('forecastAttack reads the real attack', () => {
  it.each(cases)('$name', (c) => {
    const G = c.build();
    const snapshot = structuredClone(G);
    const target = G.players['1'].active!;
    const plan = forecastAttack(G, '0');

    // The forecast never touches the game it was asked about.
    expect(G).toEqual(snapshot);

    expect(plan).toMatchObject({ attackerId: '0', defenderId: '1', damageToActive: c.damageToActive, pushDamage: c.pushDamage });
    expect(plan.defenderActiveKO).toBe(c.ko ? target.iid : null);
    expect(plan.steps).toHaveLength(c.steps.length);
    c.steps.forEach((want, i) => {
      expect(plan.steps[i], `step ${i}`).toMatchObject({ attackerIid: G.players['0'].active!.iid, targetIid: target.iid, ...want });
    });

    // …and it equals what the real attack, made through perform on a clone, does.
    const real = structuredClone(G);
    expect(perform(real, '0', { type: 'attack' })).not.toBe(INVALID);
    const realTarget = [real.players['1'].active, ...real.players['1'].bench].find((x) => x?.iid === target.iid)!;
    expect(plan.damageToActive).toBe(Math.max(0, target.hp - realTarget.hp));
    expect(plan.pushDamage).toBe(structureHp(G.players['1']) - structureHp(real.players['1']));
    expect(plan.defenderActiveKO).toBe(realTarget.hp <= 0 ? target.iid : null);
    const last = plan.steps[plan.steps.length - 1];
    expect(last.predictedHpAfter).toBe(Math.max(0, realTarget.hp));
    const realHits = real.fx.slice(G.fx.length).filter((e) => e.kind === 'hit' && e.cast === 'attack' && e.iid === target.iid);
    // A swing's knockout is its own hit's: the real basic hits that killed.
    expect(plan.steps.filter((s) => s.predictedKO).length).toBe(realHits.filter((e) => e.kind === 'hit' && e.ko).length);
    expect(plan.steps.reduce((n, s) => n + s.finalDamage, 0)).toBe(realHits.reduce((n, e) => n + (e.kind === 'hit' ? e.amount : 0), 0));

    // The forecast's events are exactly the real attack's, seqs and all.
    expect(simulate(G, '0', { type: 'attack' }).events).toEqual(real.fx.slice(G.fx.length));
  });
});

describe('forecastAttack when there is no attack to make', () => {
  const stunnedFrenzy = () => {
    const { G, attacker } = board('hero_dynamo');
    wear(attacker, 'frenzy'); attacker.hpMax = 10; attacker.hp = 2; // below half: the +3 must not swing through
    addStatus(G, attacker, 'stun', 1, 2);
    return G;
  };
  const blocks: [string, () => GameState, string][] = [
    ['a stunned Frenzy bearer (the +3 rides on a swing, it does not make one)', stunnedFrenzy, 'cannot'],
    ['Turn 1', () => { const G = board('hero_dynamo').G; G.turnNumber = 1; return G; }, 'turn1'],
    ['a turn whose attack has been made', () => { const G = board('hero_dynamo').G; G.attackUsed = true; return G; }, 'used'],
    ['no rival Active', () => { const G = board('hero_dynamo').G; G.players['1'].active = null; return G; }, 'noTarget'],
    ['a rival corpse in the lane', () => { const { G, defender } = board('hero_dynamo'); defender.hp = 0; defender.respawnTurnsLeft = 2; return G; }, 'noTarget'],
  ];
  it.each(blocks)('%s: empty plan, nothing simulated, nothing changed', (_name, build, why) => {
    const G = build();
    const snapshot = structuredClone(G);
    expect(attackBlocked(G, '0')).toBe(why);
    const plan = forecastAttack(G, '0');
    expect(plan).toEqual({ attackerId: '0', defenderId: '1', steps: [], damageToActive: 0, pushDamage: 0, defenderActiveKO: null });
    expect(simulate(G, '0', { type: 'attack' })).toMatchObject({ invalid: true, events: [] });
    expect(G).toEqual(snapshot);
  });
});

describe('simulate', () => {
  it('runs an action on a copy: the input is untouched, the copy has moved, invalid actions are flagged', () => {
    const { G } = board('hero_dynamo');
    const snapshot = structuredClone(G);
    const ran = simulate(G, '0', { type: 'attack' });
    expect(ran.invalid).toBe(false);
    expect(ran.G).not.toBe(G);
    expect(ran.G.attackUsed).toBe(true);
    expect(G).toEqual(snapshot);

    const refused = simulate(G, '0', { type: 'activate', itemIid: 'not-an-item' });
    expect(refused.invalid).toBe(true);
    expect(refused.events).toEqual([]);
    expect(refused.G).toEqual({ ...G, log: [] }); // the copy, left as it was
  });

  it('leaves the match log behind unless asked to keep it', () => {
    const { G } = board('hero_dynamo');
    expect(G.log.length).toBeGreaterThan(0);
    const bare = simulate(G, '0', { type: 'attack' });
    expect(bare.G.log.map((l) => l.text).some((t) => t === 'Battle begins.')).toBe(false);
    const kept = simulate(G, '0', { type: 'attack' }, { keepLog: true });
    expect(kept.G.log.map((l) => l.text)).toContain('Battle begins.');
  });

  it("counts on its own copy of the counters: the live game's ids and seqs do not move", () => {
    const { G } = board('hero_dynamo');
    const counters = { ...G.counters };
    simulate(G, '0', { type: 'attack' });
    expect(G.counters).toEqual(counters);
  });
});
