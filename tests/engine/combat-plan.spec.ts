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
    // 4 atk - 2 armor = 2 damage predicted.
    const step = plan.steps[0];
    expect(step.finalDamage).toBe(2);
    const before = G.players['1'].active!.hp;
    resolveAttackPhase(G, '0');
    expect(before - G.players['1'].active!.hp).toBe(2);
  });

  it('plan correctly predicts invincibility (zero damage)', () => {
    const G = freshG();
    addStatus(G, G.players['1'].active!, 'invincibility', 1, 99);
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
    expect(step?.finalDamage).toBeGreaterThanOrEqual(4 + 2);
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
