import { describe, it, expect } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { planAttackPhase, resolveAttackPhase } from '@/engine/combat';
import { effectiveAtk } from '@/engine/util';
import { addStatus } from '@/engine/statusOps';
import type { GameState, PlayerID } from '@/engine/types';
import { freshReadyGame, makeHero } from './_helpers';

function freshG(): GameState {
  return freshReadyGame();
}

/** Swap P0's Active to a hero with no onAttack passive (Dynamo, ATK 3) so
 *  mitigation/invariant tests see exactly one swing — the default fixture
 *  Active is Haze, whose Fixation adds a follow-up swing. */
function plainActive(G: GameState) {
  G.players['0'].active = makeHero('hero_dynamo', '0', 'active', 0);
}

/** Clear the bench so a test reads cleanly as just the Active hero (bench
 *  heroes don't attack, so this only affects bench-targeting passives). */
function soloAttacker(G: GameState, pid: PlayerID) {
  G.players[pid].bench = [null, null, null];
}

describe('combat plan invariant', () => {
  it('plan damageToActive matches the HP delta resolveAttackPhase causes', () => {
    const G = freshG();
    plainActive(G);
    const plan = planAttackPhase(G, '0');
    const target = G.players['1'].active!;
    const hpBefore = target.hp;
    resolveAttackPhase(G, '0');
    const hpAfter = G.players['1'].active!.hp;
    expect(hpBefore - hpAfter).toBe(plan.damageToActive);
  });

  it('plan correctly predicts shield absorption', () => {
    const G = freshG();
    plainActive(G);
    soloAttacker(G, '0'); // only Active attacks
    // Shield 5 on the defender Active vs P0 Active (Dynamo ATK 3).
    addStatus(G, G.players['1'].active!, 'shield', 5, 999);
    const plan = planAttackPhase(G, '0');
    // First step: 4 attack absorbed entirely by shield → final 0 → no HP change predicted.
    const step = plan.steps[0];
    expect(step.finalDamage).toBe(0);
    expect(plan.damageToActive).toBe(0);
    // Apply and verify.
    const before = G.players['1'].active!.hp;
    resolveAttackPhase(G, '0');
    expect(G.players['1'].active!.hp).toBe(before); // shield ate it
  });

  it('plan correctly predicts armor reduction', () => {
    const G = freshG();
    plainActive(G);
    soloAttacker(G, '0');
    addStatus(G, G.players['1'].active!, 'bullet_resist', 2, 999);
    const plan = planAttackPhase(G, '0');
    // Dynamo ATK 3 - 2 armor = 1 damage predicted.
    const step = plan.steps[0];
    expect(step.finalDamage).toBe(1);
    const before = G.players['1'].active!.hp;
    resolveAttackPhase(G, '0');
    expect(before - G.players['1'].active!.hp).toBe(1);
  });

  it('plan correctly predicts unstoppable (zero damage)', () => {
    const G = freshG();
    addStatus(G, G.players['1'].active!, 'unstoppable', 1, 99);
    const plan = planAttackPhase(G, '0');
    expect(plan.damageToActive).toBe(0);
    expect(plan.steps.every((s) => s.finalDamage === 0)).toBe(true);
    const before = G.players['1'].active!.hp;
    resolveAttackPhase(G, '0');
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
    const plan = planAttackPhase(G, '0');
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
    const plan = planAttackPhase(G, '0');
    expect(plan.defenderActiveKO).toBe(target.iid);
    expect(plan.steps.some((s) => s.predictedKO)).toBe(true);
  });

  it('plan returns face damage when defender Active is null', () => {
    const G = freshG();
    G.players['1'].active = null; // no active
    const plan = planAttackPhase(G, '0');
    expect(plan.damageToActive).toBe(0);
    expect(plan.damageToFace).toBeGreaterThan(0);
    expect(plan.steps.every((s) => s.targetIid === null)).toBe(true);
  });

  it('plan does NOT mutate game state', () => {
    const G = freshG();
    const snapshotBefore = JSON.stringify(G);
    planAttackPhase(G, '0');
    const snapshotAfter = JSON.stringify(G);
    expect(snapshotAfter).toBe(snapshotBefore);
  });

  it('total predicted final damage equals actual HP delta after resolve', () => {
    const G = freshG();
    // Sprinkle some shield/armor for a more interesting test.
    addStatus(G, G.players['1'].active!, 'shield', 2, 999);
    addStatus(G, G.players['1'].active!, 'bullet_resist', 1, 999);
    const plan = planAttackPhase(G, '0');
    const before = G.players['1'].active!.hp;
    resolveAttackPhase(G, '0');
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
    const plan = planAttackPhase(G, '0');
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
    resolveAttackPhase(G, '0');
    expect(def.hp).toBeLessThan(defHpBefore); // attacker hit
    expect(atk.hp).toBe(atkHpBefore);         // nothing came back
  });

  it('bench heroes never attack (only the Active swings)', () => {
    const G = freshG();
    const plan = planAttackPhase(G, '0');
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
    resolveAttackPhase(G, '0');
    expect(atk.statuses.find((s) => s.id === 'shield')?.value).toBe(5);
  });

  it('a KO swing is predicted and lands, and the attacker takes nothing back', () => {
    const G = freshG();
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    def.hp = 1; // one swing KOs
    const atkHpBefore = atk.hp;
    const plan = planAttackPhase(G, '0');
    const step = plan.steps.find((s) => s.attackerIid === atk.iid)!;
    expect(step.predictedKO).toBe(true);
    resolveAttackPhase(G, '0');
    expect(def.hp).toBe(0);
    expect(atk.hp).toBe(atkHpBefore);
  });

  it("the defender's onAttack passive (Shiv's Bleed) does not fire", () => {
    const G = freshG();
    soloAttacker(G, '0');
    // A Shiv defender: under a two-way trade her passive would Bleed the attacker.
    (G.players['1'].active as any).cardId = 'hero_shiv';
    const atk = G.players['0'].active!;
    resolveAttackPhase(G, '0');
    expect(atk.statuses.find((s) => s.id === 'bleed')).toBeUndefined();
  });

  it("the attacker's own onAttack passive still fires (Shiv's Bleed on the defender)", () => {
    const G = freshG();
    soloAttacker(G, '0');
    G.players['0'].active = makeHero('hero_shiv', '0', 'active', 0);
    const def = G.players['1'].active!;
    def.hp = def.hpMax = 30;
    resolveAttackPhase(G, '0');
    expect(def.statuses.find((s) => s.id === 'bleed')?.value).toBeGreaterThan(0);
  });
});
