import { describe, it, expect } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { planAttackPhase, resolveAttackPhase } from '@/engine/combat';
import { addStatus } from '@/engine/statusOps';
import type { GameState, PlayerID } from '@/engine/types';

function freshG(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  return JSON.parse(JSON.stringify(setup)) as GameState;
}

/**
 * Strip bench attackers so tests can isolate behavior of the Active hero alone.
 * Some starter heroes (Vindicta) have `longRange` and would attack from the bench too.
 */
function soloAttacker(G: GameState, pid: PlayerID) {
  G.players[pid].bench = [null, null, null];
}

describe('combat plan invariant', () => {
  it('plan damageToActive matches the HP delta resolveAttackPhase causes', () => {
    const G = freshG();
    const plan = planAttackPhase(G, '0');
    const target = G.players['1'].active!;
    const hpBefore = target.hp;
    resolveAttackPhase(G, '0');
    const hpAfter = G.players['1'].active!.hp;
    expect(hpBefore - hpAfter).toBe(plan.damageToActive);
  });

  it('plan correctly predicts shield absorption', () => {
    const G = freshG();
    soloAttacker(G, '0'); // only Active attacks
    // Slap a shield 5 on the defender Active. P0 Active (Haze ATK 4) attacks.
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
    soloAttacker(G, '0');
    addStatus(G, G.players['1'].active!, 'bullet_resist', 2, 999);
    const plan = planAttackPhase(G, '0');
    // V1: Haze ATK 3 - 2 armor = 1 damage predicted.
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

  it('plan predicts Haze "+2 vs Stun" passive', () => {
    const G = freshG();
    // Force P0 active to be Haze
    const haze = G.players['0'].active!;
    // Stun the defender Active so Haze's passive applies.
    addStatus(G, G.players['1'].active!, 'stun', 1, 99);
    if (haze.cardId !== 'hero_haze') {
      // Smoke decks put Haze active for P0; skip if test fixture changes.
      return;
    }
    const plan = planAttackPhase(G, '0');
    const step = plan.steps.find((s) => s.attackerIid === haze.iid);
    expect(step?.bonusLabel).toContain('Haze');
    // V1: Haze ATK 3 + 2 (Fixation vs Stunned) = 5
    expect(step?.finalDamage).toBeGreaterThanOrEqual(3 + 2);
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

describe('mutual-damage retaliation', () => {
  it('plan predicts retaliation against the rival\'s active attacker', () => {
    const G = freshG();
    soloAttacker(G, '0'); // only Active swings
    const plan = planAttackPhase(G, '0');
    const activeStep = plan.steps.find((s) => s.attackerIid === G.players['0'].active!.iid);
    expect(activeStep).toBeDefined();
    // Defender's Active retaliates with their full effective ATK.
    expect(activeStep!.retaliationDamage).toBeGreaterThan(0);
    expect(activeStep!.attackerHpAfter).toBe(G.players['0'].active!.hp - activeStep!.retaliationDamage);
  });

  it('active attack actually damages BOTH heroes on resolve', () => {
    const G = freshG();
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    const atkHpBefore = atk.hp;
    const defHpBefore = def.hp;
    resolveAttackPhase(G, '0');
    expect(def.hp).toBeLessThan(defHpBefore); // attacker hit
    expect(atk.hp).toBeLessThan(atkHpBefore); // retaliation hit
  });

  it('bench attacker (Mystic Expansion) does NOT trigger retaliation', () => {
    const G = freshG();
    const bench = G.players['0'].bench[0]!;
    // Equip Mystic Expansion onto a bench hero so they can swing from the bench.
    bench.attached = [{ iid: 'me1', cardId: 'mystic_expansion', ownerId: '0', zone: 'attached', statuses: [], atkMod: 0, spiritMod: 0, hpMax: 0, hp: 0 } as any];
    G.players['0'].active = null; // remove the active so only bench attacks
    const plan = planAttackPhase(G, '0');
    const benchStep = plan.steps.find((s) => s.attackerIid === bench.iid);
    expect(benchStep).toBeDefined();
    expect(benchStep!.retaliationDamage).toBe(0); // no retaliation for bench attackers
    expect(benchStep!.attackerHpAfter).toBeNull();
  });

  it('face attack does NOT trigger retaliation (no defender to retaliate)', () => {
    const G = freshG();
    soloAttacker(G, '0');
    G.players['1'].active = null;
    const plan = planAttackPhase(G, '0');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.every((s) => s.retaliationDamage === 0)).toBe(true);
  });

  it('retaliation respects attacker shield (mitigation pipeline runs both ways)', () => {
    const G = freshG();
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    // Shield the attacker so retaliation is absorbed.
    addStatus(G, atk, 'shield', 99, 999);
    const atkHpBefore = atk.hp;
    resolveAttackPhase(G, '0');
    expect(atk.hp).toBe(atkHpBefore); // shield fully absorbed retaliation
  });

  it('attacker retaliation does not change because attack KO\'d the defender (simultaneous resolution)', () => {
    const G = freshG();
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    // Make defender 1 HP so attack KOs in one swing; defender still retaliates.
    def.hp = 1;
    const defAtk = def.atkMod + (def as any).hpMax * 0; // just a sanity hold
    void defAtk; // (kept inert for symmetry)
    const atkHpBefore = atk.hp;
    const plan = planAttackPhase(G, '0');
    const step = plan.steps.find((s) => s.attackerIid === atk.iid)!;
    expect(step.predictedKO).toBe(true);
    // Even though defender is KO'd, retaliation lands.
    expect(step.retaliationDamage).toBeGreaterThan(0);
    resolveAttackPhase(G, '0');
    expect(atkHpBefore - atk.hp).toBe(step.retaliationDamage);
  });

  it('defender passive (Shiv Bleed) fires on retaliation', async () => {
    const G = freshG();
    soloAttacker(G, '0');
    // Force defender's Active to be Shiv so their onAttack passive applies Bleed on retaliation.
    (G.players['1'].active as any).cardId = 'hero_shiv';
    const atk = G.players['0'].active!;
    resolveAttackPhase(G, '0');
    // Atk should now carry Bleed from Shiv's retaliation.
    const bleed = atk.statuses.find((s) => s.id === 'bleed');
    expect(bleed).toBeDefined();
    expect(bleed!.value).toBeGreaterThan(0);
  });
});
