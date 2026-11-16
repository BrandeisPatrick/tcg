/**
 * The skill's own icon (Patrick, 2026-11-16): a hero's skill or passive on its
 * sheet wears the game's icon of the Deadlock ability it is named for, as the
 * ultimate wears its own — never a generic sword, flame or shield.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import '@/abilities';
import { HEROES } from '@/cards/heroes';
import { heroAbilities } from '@/engine/query';
import { ATTACK_ICON_SRC, skillIconSrc, ultIconSrc, SKILL_IMG_BASE } from '@/art/assets';

const pub = (src: string) => resolve(__dirname, '../../public', src.replace(/^.*?\/(skill|ult)\//, '$1/'));

describe('skill icons', () => {
  it('every hero has one, beside its ultimate icon', () => {
    for (const h of HEROES) {
      expect(existsSync(pub(skillIconSrc(h.id))), `${h.id} skill`).toBe(true);
      expect(existsSync(pub(ultIconSrc(h.id))), `${h.id} ult`).toBe(true);
    }
  });

  it('every hero has the one skill or passive the icon is for', () => {
    for (const h of HEROES) {
      const own = heroAbilities(h as never).filter((k: { kind: string }) => k.kind === 'skill' || k.kind === 'passive');
      expect(own.length, h.id).toBe(1);
    }
  });

  it('is named as the ultimates are: the hero id without its prefix', () => {
    expect(skillIconSrc('hero_mo_krill')).toBe(`${SKILL_IMG_BASE}mo_krill.webp`);
  });

  it("the Attack row wears Deadlock's weapon-damage icon (2026-11-16), and it ships", () => {
    expect(ATTACK_ICON_SRC.endsWith('hud/weapon_damage.webp')).toBe(true);
    expect(existsSync(resolve(__dirname, '../../public/hud/weapon_damage.webp'))).toBe(true);
  });
});
