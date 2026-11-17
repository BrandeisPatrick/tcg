/**
 * Patrick, 2026-11-16: "Dynamo skill should be the healing aura, which should
 * heal a lot … but still an AoE heal. Healing Tempo should make a hero healed
 * this turn have bonus attack and zero retreat cost, so Dynamo with Healing
 * Tempo can rearrange and attack. Also the turn should not end with the
 * attack: attack, retreat, attack."
 *
 * Rejuvenating Aurora heals every hero of Dynamo's side 5 + his Spirit, waits
 * 4 and holds no charges. Healing Tempo is Deadlock's: the bearer's heals
 * grant their target bonus fire rate and move speed — here +2 Bullet Power and
 * Swift for the turn — from a skill, an ultimate or a spell, never from regen,
 * lifesteal or a worn item.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState } from '@/engine/types';
import { INVALID, perform } from '@/engine/engine';
import { attackBlocked, moveBlocked, skillBlocked } from '@/engine/legality';
import { effectiveAtk, effectiveSpirit } from '@/engine/query';
import { healUnit } from '@/engine/damage';
import { CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { freshReadyGame, giveItem, makeHero } from './_helpers';

/** P0 with Dynamo on the bench (slot 3, Paige's), Haze in the lane. */
function withDynamo(): { G: GameState; dynamo: CardInstance; haze: CardInstance; vindicta: CardInstance } {
  const G = freshReadyGame();
  const me = G.players['0'];
  const dynamo = makeHero('hero_dynamo', '0', 'bench', 3);
  me.bench[2] = dynamo;
  // A rival that lives through two swings.
  const rival = G.players['1'].active!;
  rival.hpMax = rival.hp = 40;
  return { G, dynamo, haze: me.active!, vindicta: me.bench[0]! };
}

const aurora = (dynamo: CardInstance) => ({ type: 'useSkill' as const, heroIid: dynamo.iid, skillId: 'skill_dynamo' });

describe('Rejuvenating Aurora', () => {
  it('heals every hero of his side 5 + his Spirit, a lot on the hurt Active and the bench as well', () => {
    const { G, dynamo, haze, vindicta } = withDynamo();
    haze.hpMax = 20; haze.hp = 5;
    vindicta.hp = vindicta.hpMax - 1;
    const heal = 5 + effectiveSpirit(dynamo);
    expect(perform(G, '0', aurora(dynamo))).not.toBe(INVALID);
    expect(haze.hp).toBe(5 + heal);
    expect(vindicta.hp).toBe(vindicta.hpMax); // never past full
  });

  it('waits 4 turns and holds no charges', () => {
    const { G, dynamo } = withDynamo();
    expect(perform(G, '0', aurora(dynamo))).not.toBe(INVALID);
    dynamo.skillUsedThisTurn = false; // a later turn of the same wait
    expect(skillBlocked(G, '0', dynamo, undefined, 'skill_dynamo')).toBe('cooldown');
    expect(dynamo.cooldowns?.skill_dynamo).toBe(4);
  });

  it('is Deadlock\'s own name, and the card says the heal grows with Spirit', () => {
    const skill = getAbility('skill_dynamo') as { name?: string; text?: string; charges?: number };
    expect([skill.name, skill.text, skill.charges]).toEqual(['Rejuvenating Aurora', 'Your heroes heal {sp:5} each and get +1 Attack for 2 turns.', undefined]);
  });
});

describe('Healing Tempo', () => {
  it('a hero its bearer heals gets +2 Bullet Power and Swift for the turn', () => {
    const { G, dynamo, haze } = withDynamo();
    giveItem(G, dynamo, 'healing_tempo');
    haze.hp = haze.hpMax - 3;
    const atk = effectiveAtk(haze);
    expect(perform(G, '0', aurora(dynamo))).not.toBe(INVALID);
    // Aurora's own +1 for 2 turns merges with it as any repeated status does: the larger value, the longer wait.
    expect(haze.statuses).toContainEqual(expect.objectContaining({ id: 'weapon_power', value: 2, duration: 2 }));
    expect(haze.statuses).toContainEqual(expect.objectContaining({ id: 'swift', duration: 1 }));
    expect(effectiveAtk(haze)).toBe(atk + 2);
    // The bearer healed itself too only if it was hurt: Dynamo was at full HP.
    expect(dynamo.statuses.some((s) => s.id === 'swift')).toBe(false);
  });

  it('heal, attack, a free Retreat, attack: Dynamo with Healing Tempo rearranges the lane and both heroes swing', () => {
    const { G, dynamo, haze, vindicta } = withDynamo();
    giveItem(G, dynamo, 'healing_tempo');
    const me = G.players['0'];
    const rival = G.players['1'].active!;
    haze.hp = haze.hpMax - 3;
    me.souls = 0; // Haze's Retreat costs 1: only Swift pays for it
    expect(moveBlocked(G, '0', 1, 0)).toBe('souls');
    expect(perform(G, '0', aurora(dynamo))).not.toBe(INVALID);
    const before = rival.hp;
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(rival.hp).toBeLessThan(before);
    expect(moveBlocked(G, '0', 1, 0)).toBeNull(); // Swift: free
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 1, toSlot: 0 })).not.toBe(INVALID);
    expect(me.active).toBe(vindicta);
    expect(me.souls).toBe(0);
    expect(attackBlocked(G, '0')).toBeNull();
    const mid = rival.hp;
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(rival.hp).toBeLessThan(mid);
  });

  it('only the bearer\'s own cast heals: not a heal from no cast (regen), not another hero\'s heal, not a heal that restores nothing', () => {
    const { G, dynamo, haze } = withDynamo();
    giveItem(G, dynamo, 'healing_tempo');
    haze.hp = haze.hpMax - 3;
    healUnit(G, haze, 2, 'Regen'); // no cast: regen
    expect(haze.statuses.some((s) => s.id === 'swift')).toBe(false);
    // Dynamo without the item: his heal grants nothing.
    const other = withDynamo();
    other.haze.hp = other.haze.hpMax - 3;
    expect(perform(other.G, '0', aurora(other.dynamo))).not.toBe(INVALID);
    expect(other.haze.statuses.some((s) => s.id === 'swift')).toBe(false);
    expect(other.haze.statuses.find((s) => s.id === 'weapon_power')?.value).toBe(1); // Aurora's own +1, not the +2
    // A hero at full HP is not healed, so it gets nothing.
    const full = withDynamo();
    giveItem(full.G, full.dynamo, 'healing_tempo');
    expect(perform(full.G, '0', aurora(full.dynamo))).not.toBe(INVALID);
    expect(full.haze.statuses.some((s) => s.id === 'swift')).toBe(false);
  });

  it('keeps its stat line and says what it does', () => {
    const card = CARDS_BY_ID.healing_tempo as { text: string; tier: number; slot: string; upgradesFrom?: string };
    expect([card.tier, card.slot, card.upgradesFrom]).toEqual([4, 'vitality', 'healing_booster']);
    expect(card.text).toBe("+3 Bullet Power. Healing Boost 4. A hero the bearer's skill, ultimate or spell heals gets +2 Bullet Power and Swift this turn.");
  });
});
