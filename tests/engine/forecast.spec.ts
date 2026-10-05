import { describe, it, expect } from 'vitest';
import { forecastAttack, simulate, type AttackStep } from '@/engine/forecast';
import { INVALID, perform } from '@/engine/engine';
import { attackBlocked } from '@/engine/legality';
import { addStatus } from '@/engine/statusOps';
import type { CardInstance, GameState } from '@/engine/types';
import { freshReadyGame, makeHero } from './_helpers';

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

/** P0's Active becomes `hero` (as the lone attacker); P1's is Abrams at 40 HP with nothing on the bench. */
function board(hero: string) {
  const G = freshReadyGame();
  const attacker = G.players['0'].active = makeHero(hero, '0', 'active', 0);
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
  patronDamage: number;
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
    damageToActive: 9, patronDamage: 0, ko: false,
  },
  {
    name: 'Haze: Fixation grants one follow-up swing after her primary',
    build: () => board('hero_haze').G,
    steps: [
      { rawDamage: 3, finalDamage: 3, predictedHpAfter: 37, bonusLabel: undefined },
      { rawDamage: 3, finalDamage: 3, predictedHpAfter: 34, bonusLabel: 'Extra Attack' },
    ],
    damageToActive: 6, patronDamage: 0, ko: false,
  },
  {
    name: 'Haze at the Extra Attack cap: Fixation cannot raise it, so she swings 7 times, not 8',
    build: () => { const { G, attacker } = board('hero_haze'); extraAttacks(attacker, 6); return G; },
    steps: Array.from({ length: 7 }, (_, i) => ({
      rawDamage: 3, finalDamage: 3, predictedHpAfter: 37 - 3 * i, bonusLabel: i === 0 ? undefined : 'Extra Attack',
    })),
    damageToActive: 21, patronDamage: 0, ko: false,
    oldPlanner: 'added Fixation\'s +1 on top of the cap: 8 swings, 24 damage',
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
    damageToActive: 4, patronDamage: 0, ko: false,
  },
  {
    name: 'an Unstoppable target shrugs off every swing',
    build: () => {
      const { G, attacker, defender } = board('hero_dynamo');
      addStatus(G, defender, 'unstoppable', 1, 1); extraAttacks(attacker, 1);
      return G;
    },
    steps: [
      { rawDamage: 3, finalDamage: 0, predictedHpAfter: 40, predictedKO: false },
      { rawDamage: 3, finalDamage: 0, predictedHpAfter: 40, predictedKO: false },
    ],
    damageToActive: 0, patronDamage: 0, ko: false,
  },
  {
    name: "Wraith's Mixed Bullets rider (her Spirit as a second hit) finishes the target after the bullet",
    build: () => {
      const { G, attacker, defender } = board('hero_wraith');
      attacker.spiritMod = 3; defender.hpMax = defender.hp = 4;
      return G;
    },
    // The bullet itself does not drop her (predictedKO false: the choreographer
    // does not break the card on it) — the rider does, and the FX layer plays
    // that knockout. The plan still says she fell.
    steps: [{ rawDamage: 2, finalDamage: 2, predictedHpAfter: 0, predictedKO: false }],
    damageToActive: 4, patronDamage: 1, ko: true,
    oldPlanner: 'saw only the 2-damage bullet: 2 HP left, no patron life, 2 damage',
  },
  {
    name: "Mirage's Djinn's Mark detonates when the swing makes the 4th stack: the target takes 12 more",
    build: () => { const { G, defender } = board('hero_mirage'); addStatus(G, defender, 'djinns_mark', 3, 3); return G; },
    steps: [{ rawDamage: 3, finalDamage: 3, predictedHpAfter: 25, predictedKO: false }],
    damageToActive: 15, patronDamage: 0, ko: false,
    oldPlanner: 'saw only the 3-damage bullet: 37 HP left, 3 damage',
  },
  {
    name: 'Ricochet drops the last bench hero as the swing drops the Active: the patron pays two lives',
    build: () => {
      const { G, attacker, defender } = board('hero_dynamo');
      wear(attacker, 'ricochet');
      defender.hpMax = defender.hp = 3;
      const bench = G.players['1'].bench[0] = makeHero('hero_dynamo', '1', 'bench', 1);
      bench.hp = 2;
      return G;
    },
    steps: [{ rawDamage: 3, finalDamage: 3, predictedHpAfter: 0, predictedKO: true }],
    damageToActive: 3, patronDamage: 2, ko: true,
    oldPlanner: 'charged the patron for the Active only: 1 life',
  },
  {
    name: "Crippling Headshot's Bullet Resist −1 lands after the first swing, so the second takes 1 more",
    build: () => { const { G, attacker } = board('hero_dynamo'); wear(attacker, 'crippling_headshot'); extraAttacks(attacker, 1); return G; },
    steps: [
      { rawDamage: 3, finalDamage: 3, predictedHpAfter: 37 },
      { rawDamage: 3, finalDamage: 4, predictedHpAfter: 33 },
    ],
    damageToActive: 7, patronDamage: 0, ko: false,
    oldPlanner: 'held the target\'s resist fixed across the swings: 6 damage',
  },
  {
    name: "Vindicta's flight takes 1 off the bullet",
    build: () => {
      const { G } = board('hero_dynamo');
      const vindicta = G.players['1'].active = makeHero('hero_vindicta', '1', 'active', 0);
      vindicta.hpMax = vindicta.hp = 40;
      return G;
    },
    steps: [{ rawDamage: 3, finalDamage: 2, predictedHpAfter: 38 }],
    damageToActive: 2, patronDamage: 0, ko: false,
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

    expect(plan).toMatchObject({ attackerId: '0', defenderId: '1', damageToActive: c.damageToActive, patronDamage: c.patronDamage });
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
    expect(plan.patronDamage).toBe(G.players['1'].hp - real.players['1'].hp);
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
    ['the turn\'s attack already made', () => { const G = board('hero_dynamo').G; G.attackUsed = true; return G; }, 'used'],
    ['an Active that used its skill', () => { const { G, attacker } = board('hero_dynamo'); attacker.skillUsedThisTurn = true; return G; }, 'skill'],
    ['no rival Active', () => { const G = board('hero_dynamo').G; G.players['1'].active = null; return G; }, 'noTarget'],
    ['a rival corpse in the lane', () => { const { G, defender } = board('hero_dynamo'); defender.hp = 0; defender.respawnTurnsLeft = 2; return G; }, 'noTarget'],
  ];
  it.each(blocks)('%s: empty plan, nothing simulated, nothing changed', (_name, build, why) => {
    const G = build();
    const snapshot = structuredClone(G);
    expect(attackBlocked(G, '0')).toBe(why);
    const plan = forecastAttack(G, '0');
    expect(plan).toEqual({ attackerId: '0', defenderId: '1', steps: [], damageToActive: 0, patronDamage: 0, defenderActiveKO: null });
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

    const refused = simulate(G, '0', { type: 'playCard', cardIid: 'not-a-card' });
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
