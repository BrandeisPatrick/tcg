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

  it('every hero has the one skill or passive the icon is for — Lash two (2026-11-17)', () => {
    // Lash prints two rows (Patrick, 2026-11-17): Grapple, the skill, and Ground Strike, its
    // landing, a passive. Each row's icon ships (`skillIconSrc(heroId, abilityId)`), and
    // the two are not the same picture.
    const TWO_ROWS = new Set(['hero_lash']);
    for (const h of HEROES) {
      const own = heroAbilities(h as never).filter((k: { kind: string }) => k.kind === 'skill' || k.kind === 'passive');
      expect(own.length, h.id).toBe(TWO_ROWS.has(h.id) ? 2 : 1);
      const icons = own.map((k: { ability: { id: string } }) => skillIconSrc(h.id, k.ability.id));
      for (const src of icons) expect(existsSync(pub(src)), `${h.id} ${src}`).toBe(true);
      expect(new Set(icons).size, h.id).toBe(own.length);
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
