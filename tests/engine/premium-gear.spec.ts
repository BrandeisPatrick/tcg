import { describe, it, expect } from 'vitest';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { ABILITIES_BY_ID } from '@/abilities';
import { fireEquipmentTriggers } from '@/engine/equipmentDispatch';
import { addStatus, tickStartOfTurn } from '@/engine/statusOps';
import { resolveAttackPhase } from '@/engine/combat';
import { reapDead } from '@/engine/damage';
import { effectiveAtk } from '@/engine/util';
import { EQUIPMENT_BY_ID } from '@/cards/equipment';
import { freshReadyGame, makeHero } from './_helpers';

function attach(bearer: CardInstance, cardId: string): CardInstance {
  const eq: CardInstance = {
    iid: `eq-${cardId}`, cardId, ownerId: bearer.ownerId, zone: 'equipment',
    attachedTo: bearer.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
  };
  (bearer.attached ??= []).push(eq);
  return eq;
}
const val = (c: CardInstance, id: string) => c.statuses.find((s) => s.id === id)?.value;
const dur = (c: CardInstance, id: string) => c.statuses.find((s) => s.id === id)?.duration;

describe('Escalating Exposure', () => {
  it('stacks Spirit Resist − on skill damage, capped at 3', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attach(hero, 'escalating_exposure');
    for (let i = 0; i < 4; i++) fireEquipmentTriggers(G, hero, 'onBearerSkillDamage', { movingPlayer: '0' }, enemy);
    expect(val(enemy, 'spirit_resist_down')).toBe(3); // capped
  });
});

describe('Inhibitor', () => {
  it('attacks suppress both Bullet Power and Spirit Power (2t)', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attach(hero, 'inhibitor');
    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(val(enemy, 'weapon_power_down')).toBe(1);
    expect(val(enemy, 'spirit_power_down')).toBe(1);
    expect(dur(enemy, 'weapon_power_down')).toBe(2);
  });
});

describe('Crippling Headshot', () => {
  it('attacks apply Bullet + Spirit Resist − (2t)', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attach(hero, 'crippling_headshot');
    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(val(enemy, 'bullet_resist_down')).toBe(1);
    expect(val(enemy, 'spirit_resist_down')).toBe(1);
  });
});

describe('Berserker', () => {
  it('gains +1 Bullet Power per bullet hit, capped at +4', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    attach(hero, 'berserker');
    for (let i = 0; i < 6; i++) fireEquipmentTriggers(G, hero, 'onBearerDamagedByBullet', { movingPlayer: '0' });
    expect(val(hero, 'weapon_power')).toBe(4); // capped
  });
});

describe('Colossus', () => {
  it('card grants +5 HP and the ability grants Bullet Resist 2', () => {
    expect(EQUIPMENT_BY_ID['colossus'].bonus?.hp).toBe(5);
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    ABILITIES_BY_ID['eff_colossus'].run(G, { movingPlayer: '0' }, { source: hero });
    expect(val(hero, 'bullet_resist')).toBe(2);
  });
});

describe('Improved Armor', () => {
  it('grants Bullet/Spirit Resist 4', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    ABILITIES_BY_ID['eff_improved_bullet_armor'].run(G, { movingPlayer: '0' }, { source: hero });
    ABILITIES_BY_ID['eff_improved_spirit_armor'].run(G, { movingPlayer: '0' }, { source: hero });
    expect(val(hero, 'bullet_resist')).toBe(4);
    expect(val(hero, 'spirit_resist')).toBe(4);
  });
});

describe('Frenzy', () => {
  it('heals 2 on attack only while below half HP', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attach(hero, 'frenzy');
    hero.hpMax = 10; hero.hp = 10; // full → no heal
    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(hero.hp).toBe(10);
    hero.hp = 3; // below half
    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(hero.hp).toBe(5); // +2
  });

  it('+3 Bullet Power while below half HP (in the attack phase)', () => {
    const G = freshReadyGame();
    const attacker = G.players['0'].active!;
    const defender = G.players['1'].active!;
    attach(attacker, 'frenzy');
    attacker.hpMax = 10; attacker.hp = 2; // below half
    defender.hpMax = 40; defender.hp = 40;
    const base = effectiveAtk(attacker);
    resolveAttackPhase(G, '0');
    expect(40 - defender.hp).toBe(base + 3);
  });
});

describe('Siphon Bullets', () => {
  it('temporarily steals 1 max HP and reverts after 2 turns', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    hero.hpMax = 10; hero.hp = 10;
    enemy.hpMax = 20; enemy.hp = 20;
    attach(hero, 'siphon_bullets');

    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(enemy.hpMax).toBe(19);
    expect(hero.hpMax).toBe(11);
    expect(hero.hp).toBe(11); // filled the stolen HP

    // Enemy's drain reverts after two of its turn-starts.
    tickStartOfTurn(G, G.players['1']);
    tickStartOfTurn(G, G.players['1']);
    expect(enemy.hpMax).toBe(20);
  });

  it('reverts the bearer max-HP gain on death', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    hero.hpMax = 10; hero.hp = 10;
    attach(hero, 'siphon_bullets');
    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(hero.hpMax).toBe(11);
    hero.hp = 0;
    reapDead(G, G.players['0']);
    expect(hero.hpMax).toBe(10); // gain reverted before respawn
  });
});

describe('Superior Duration', () => {
  it("extends the bearer's own buffs by 1 turn (debuffs unaffected)", () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    attach(hero, 'superior_duration');
    addStatus(G, hero, 'weapon_power', 2, 2); // buff → 2 + 1 = 3
    expect(dur(hero, 'weapon_power')).toBe(3);
    addStatus(G, hero, 'bleed', 2, 2); // debuff → unchanged
    expect(dur(hero, 'bleed')).toBe(2);
  });
});
