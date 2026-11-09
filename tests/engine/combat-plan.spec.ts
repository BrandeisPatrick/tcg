import { describe, it, expect } from 'vitest';
import { forecastAttack } from '@/engine/forecast';
import { effectiveAtk } from '@/engine/query';
import { addStatus } from '@/engine/statusOps';
import type { CardInstance, GameState, HeroCard, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { freshReadyGame, makeAttack, makeHero, structuresOf } from './_helpers';
import { INVALID, perform } from '@/engine/engine';

function freshG(): GameState {
  return freshReadyGame();
}

/** Give `hero` the Attack `atk` by its Bullet Power modifier, whatever its
 *  card prints at Level 1. */
function swingsFor(hero: CardInstance, atk: number): CardInstance {
  hero.atkMod = atk - (CARDS_BY_ID[hero.cardId] as HeroCard).atk;
  return hero;
}

/** Swap P0's Active to a hero with no onAttack passive (Dynamo, its Attack
 *  raised to 3) so mitigation/invariant tests see exactly the one plain swing —
 *  the default fixture Active is Haze, whose Fixation stacks on her target. */
function plainActive(G: GameState) {
  G.players['0'].active = swingsFor(makeHero('hero_dynamo', '0', 'active', 0), 3);
}

/** Clear the bench so a test reads cleanly as just the Active hero (bench
 *  heroes don't attack, so this only affects bench-targeting passives). */
function soloAttacker(G: GameState, pid: PlayerID) {
  G.players[pid].bench = [null, null, null];
}

/** Put a piece of gear on a hero as it would sit once played (no cost, no
 *  onPlay effect — the on-attack procs are what these tests are after). */
function wear(bearer: CardInstance, cardId: string) {
  (bearer.attached ??= []).push({
    iid: `eq-${cardId}`, cardId, ownerId: bearer.ownerId, zone: 'equipment',
    attachedTo: bearer.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
  });
}

describe('combat plan invariant', () => {
  it('plan damageToActive matches the HP delta the real attack causes', () => {
    const G = freshG();
    plainActive(G);
    const plan = forecastAttack(G, '0');
    const target = G.players['1'].active!;
    const hpBefore = target.hp;
    makeAttack(G, '0');
    const hpAfter = G.players['1'].active!.hp;
    expect(hpBefore - hpAfter).toBe(plan.damageToActive);
  });

  it('plan correctly predicts shield absorption', () => {
    const G = freshG();
    plainActive(G);
    soloAttacker(G, '0'); // only Active attacks
    // Shield 5 on the defender Active vs P0 Active (Dynamo ATK 3).
    addStatus(G, G.players['1'].active!, 'shield', 5, 999);
    const plan = forecastAttack(G, '0');
    // First step: 4 attack absorbed entirely by shield → final 0 → no HP change predicted.
    const step = plan.steps[0];
    expect(step.finalDamage).toBe(0);
    expect(plan.damageToActive).toBe(0);
    // Apply and verify.
    const before = G.players['1'].active!.hp;
    makeAttack(G, '0');
    expect(G.players['1'].active!.hp).toBe(before); // shield ate it
  });

  it('plan correctly predicts armor reduction', () => {
    const G = freshG();
    plainActive(G);
    soloAttacker(G, '0');
    addStatus(G, G.players['1'].active!, 'bullet_resist', 2, 999);
    const plan = forecastAttack(G, '0');
    // Dynamo ATK 3 - 2 armor = 1 damage predicted.
    const step = plan.steps[0];
    expect(step.finalDamage).toBe(1);
    const before = G.players['1'].active!.hp;
    makeAttack(G, '0');
    expect(before - G.players['1'].active!.hp).toBe(1);
  });

  it('plan correctly predicts invulnerable (zero damage)', () => {
    const G = freshG();
    addStatus(G, G.players['1'].active!, 'invulnerable', 1, 99);
    const plan = forecastAttack(G, '0');
    expect(plan.damageToActive).toBe(0);
    expect(plan.steps.every((s) => s.finalDamage === 0)).toBe(true);
    const before = G.players['1'].active!.hp;
    makeAttack(G, '0');
    expect(G.players['1'].active!.hp).toBe(before);
  });

  it('plan predicts a queued Extra Attack (full power)', () => {
    const G = freshG();
    plainActive(G);
    soloAttacker(G, '0');
    // Keep the defender alive through both swings so the bonus step is emitted.
    addStatus(G, G.players['1'].active!, 'shield', 50, 999);
    const attacker = G.players['0'].active!;
    const dmg = effectiveAtk(attacker);
    // Queue one Extra Attack (Active Reload / Burst Fire / Fixation).
    attacker.statuses.push({ id: 'extra_attack', value: 1, duration: 1 });
    const plan = forecastAttack(G, '0');
    const mine = plan.steps.filter((s) => s.attackerIid === attacker.iid);
    // Primary swing + one Extra Attack swing.
    expect(mine.length).toBe(2);
    const bonus = mine[1];
    expect(bonus.bonusLabel).toBe('Extra Attack');
    expect(bonus.rawDamage).toBe(dmg); // full power
  });

  it('plan flags KO when damage exceeds HP', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    target.hp = 1; // one shot
    const plan = forecastAttack(G, '0');
    expect(plan.defenderActiveKO).toBe(target.iid);
    expect(plan.steps.some((s) => s.predictedKO)).toBe(true);
  });

  it('with no living rival Active the plan is empty, and the attack is refused: no structure is hit', () => {
    const vacate: [string, (G: GameState) => void][] = [
      ['no Active', (G) => { G.players['1'].active = null; }],
      ['a corpse in the lane', (G) => { G.players['1'].active!.hp = 0; G.players['1'].active!.respawnTurnsLeft = 2; }],
    ];
    for (const [label, doctor] of vacate) {
      const G = freshG();
      doctor(G);
      const plan = forecastAttack(G, '0');
      expect(plan.steps, label).toEqual([]);
      expect(plan.damageToActive, label).toBe(0);
      expect(plan.pushDamage, label).toBe(0);
      expect(plan.defenderActiveKO, label).toBeNull();
      const structuresBefore = structuresOf(G, '1');
      expect(perform(G, '0', { type: 'attack' }), label).toBe(INVALID);
      expect(structuresOf(G, '1'), label).toBe(structuresBefore);
    }
  });

  it("a KO pushes the victim's level + 1 into the defender's structures — the overflow is not spilled", () => {
    const G = freshG();
    plainActive(G);
    soloAttacker(G, '0');
    const target = G.players['1'].active!;
    target.hp = 1; // Dynamo's 3 overshoots by 2
    const plan = forecastAttack(G, '0');
    expect(plan.defenderActiveKO).toBe(target.iid);
    expect(plan.steps[0].finalDamage).toBe(3);
    expect(plan.pushDamage).toBe(2); // Level 1: level + 1
    const structuresBefore = structuresOf(G, '1');
    makeAttack(G, '0');
    expect(structuresBefore - structuresOf(G, '1')).toBe(plan.pushDamage);
  });

  it('an attack the rival Active survives pushes nothing', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    target.hp = target.hpMax = 30;
    const plan = forecastAttack(G, '0');
    expect(plan.damageToActive).toBeGreaterThan(0);
    expect(plan.defenderActiveKO).toBeNull();
    expect(plan.pushDamage).toBe(0);
    const structuresBefore = structuresOf(G, '1');
    makeAttack(G, '0');
    expect(structuresOf(G, '1')).toBe(structuresBefore);
  });

  it('plan does NOT mutate game state', () => {
    const G = freshG();
    const snapshotBefore = JSON.stringify(G);
    forecastAttack(G, '0');
    const snapshotAfter = JSON.stringify(G);
    expect(snapshotAfter).toBe(snapshotBefore);
  });

  it('total predicted final damage equals actual HP delta after resolve', () => {
    const G = freshG();
    // Sprinkle some shield/armor for a more interesting test.
    addStatus(G, G.players['1'].active!, 'shield', 2, 999);
    addStatus(G, G.players['1'].active!, 'bullet_resist', 1, 999);
    const plan = forecastAttack(G, '0');
    const before = G.players['1'].active!.hp;
    makeAttack(G, '0');
    const after = G.players['1'].active!.hp;
    expect(before - after).toBe(plan.damageToActive);
  });
});

describe('the attack is one-way', () => {
  it('plan steps are all swings at the rival Active, none back at the attacker', () => {
    const G = freshG();
    soloAttacker(G, '0'); // only Active swings
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    const plan = forecastAttack(G, '0');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.every((s) => s.attackerIid === atk.iid && s.targetIid === def.iid)).toBe(true);
  });

  it('resolve damages the defender and leaves the attacker untouched', () => {
    const G = freshG();
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    const atkHpBefore = atk.hp;
    const defHpBefore = def.hp;
    makeAttack(G, '0');
    expect(def.hp).toBeLessThan(defHpBefore); // attacker hit
    expect(atk.hp).toBe(atkHpBefore);         // nothing came back
  });

  it('bench heroes never attack (only the Active swings)', () => {
    const G = freshG();
    const plan = forecastAttack(G, '0');
    // Exactly one attacker — the Active hero. Bench heroes are not attackers.
    const attackerIids = new Set(plan.steps.map((s) => s.attackerIid));
    expect(attackerIids.size).toBe(1);
    expect([...attackerIids][0]).toBe(G.players['0'].active!.iid);
  });

  it("the attacker's Shield is not spent: nothing comes back to absorb", () => {
    const G = freshG();
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    addStatus(G, atk, 'shield', 5, 999);
    makeAttack(G, '0');
    expect(atk.statuses.find((s) => s.id === 'shield')?.value).toBe(5);
  });

  it('a KO swing is predicted and lands, and the attacker takes nothing back', () => {
    const G = freshG();
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    def.hp = 1; // one swing KOs
    const atkHpBefore = atk.hp;
    const plan = forecastAttack(G, '0');
    const step = plan.steps.find((s) => s.attackerIid === atk.iid)!;
    expect(step.predictedKO).toBe(true);
    makeAttack(G, '0');
    expect(def.hp).toBe(0);
    expect(atk.hp).toBe(atkHpBefore);
  });

  it("the defender's onAttack passive (Mirage's Djinn's Mark) does not fire", () => {
    const G = freshG();
    soloAttacker(G, '0');
    // A Mirage defender: under a two-way trade his passive would mark the attacker.
    (G.players['1'].active as any).cardId = 'hero_mirage';
    G.players['1'].active!.hp = G.players['1'].active!.hpMax = 30;
    const atk = G.players['0'].active!;
    makeAttack(G, '0');
    expect(atk.statuses.find((s) => s.id === 'djinns_mark')).toBeUndefined();
  });

  it("the attacker's own onAttack passive still fires (Haze's Fixation on the defender)", () => {
    const G = freshG();
    soloAttacker(G, '0');
    expect(G.players['0'].active!.cardId).toBe('hero_haze');
    const def = G.players['1'].active!;
    def.hp = def.hpMax = 30;
    makeAttack(G, '0');
    expect(def.statuses.find((s) => s.id === 'fixation')?.value).toBe(1);
  });
});

// The attacker's own swings move its HP — Frenzy and lifesteal gear heal it,
// Siphon Bullets raises its max — and Frenzy's +3 is judged against that HP
// swing by swing. The plan has to carry the attacker's HP along, or an Extra
// Attack is predicted with a bonus the engine no longer gives. Every bearer
// here swings for 3 (its Attack set to 3), and for 6 while below half HP.
describe("Frenzy's bonus is planned swing by swing, as the resolver deals it", () => {
  interface Bearer {
    hero?: string;
    hp: number;
    hpMax?: number;
    gear: string[];
    /** Extra Attacks queued (default 1). */
    extra?: number;
    doctor?: (G: GameState, attacker: CardInstance, defender: CardInstance) => void;
    /** What each swing deals to the rival Active. */
    swings: number[];
  }
  const cases: [string, Bearer][] = [
    ['its own heal lifts the bearer over half HP, and the Extra Attack loses the +3',
      { hp: 4, gear: ['frenzy'], swings: [6, 3] }],
    ['a bearer still below half HP after the heal keeps the +3',
      { hp: 1, gear: ['frenzy'], swings: [6, 6] }],
    ['the bonus drops off on the swing after the heal that crosses half HP',
      { hp: 1, gear: ['frenzy'], extra: 2, swings: [6, 6, 3] }],
    ["Restorative Shot's 1 counts toward the threshold",
      { hp: 2, gear: ['frenzy', 'restorative_shot'], swings: [6, 3] }],
    ["Bullet Lifesteal's 2 counts toward the threshold",
      { hp: 1, gear: ['frenzy', 'bullet_lifesteal'], swings: [6, 3] }],
    ["Leech's on-attack 2 counts toward the threshold",
      { hp: 1, gear: ['leech', 'frenzy'], swings: [6, 3] }],
    ['Siphon Bullets moves the bearer along with its max HP',
      { hp: 3, hpMax: 11, gear: ['frenzy', 'siphon_bullets'], swings: [6, 3] }],
    // The other side of the trade: Drifter's Bloodscent reads the target's HP,
    // swing by swing too. His first swing heals him over half (Frenzy's +3 is
    // gone) and drops the rival Active below half (Bloodscent's +1 comes in).
    ["Drifter's Bloodscent comes in on the swing after the one that drops the target below half",
      { hero: 'hero_drifter', hp: 9, hpMax: 20, gear: ['frenzy'], doctor: (_G, _a, d) => { d.hp = 24; }, swings: [6, 4] }],
    ['Healing Boost adds to each heal',
      { hp: 2, gear: ['frenzy'], doctor: (G, a) => addStatus(G, a, 'healing_boost', 2, 999), swings: [6, 3] }],
    ['Healing Blocked stops the heal, so the +3 stays',
      { hp: 4, gear: ['frenzy'], doctor: (G, a) => addStatus(G, a, 'healing_boost_down', 1, 2), swings: [6, 6] }],
    ['a swing the Shield soaks up whole heals nothing, so the +3 stays',
      { hp: 4, gear: ['frenzy'], doctor: (G, _a, d) => addStatus(G, d, 'shield', 6, 999), swings: [0, 6] }],
  ];

  it.each(cases)('%s', (_name, c) => {
    const G = freshG();
    const attacker = G.players['0'].active = swingsFor(makeHero(c.hero ?? 'hero_dynamo', '0', 'active', 0), 3);
    attacker.hpMax = c.hpMax ?? 10;
    attacker.hp = c.hp;
    for (const cardId of c.gear) wear(attacker, cardId);
    attacker.statuses.push({ id: 'extra_attack', value: c.extra ?? 1, duration: 99 });
    const defender = G.players['1'].active!;
    defender.hpMax = defender.hp = 40;
    c.doctor?.(G, attacker, defender);
    const before = defender.hp;

    const plan = forecastAttack(G, '0');
    expect(plan.steps.map((s) => s.finalDamage)).toEqual(c.swings);
    makeAttack(G, '0');
    const dealt = before - defender.hp;
    expect(dealt).toBe(c.swings.reduce((a, b) => a + b, 0));
    expect(plan.damageToActive).toBe(dealt);
  });
});
