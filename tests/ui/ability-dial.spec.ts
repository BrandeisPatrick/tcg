import { describe, it, expect } from 'vitest';
import { HEROES } from '@/cards';
import { getAbility } from '@/abilities';
import { skillWait, ultCharge, ultimateCard, ultWait } from '@/engine/query';
import type { CardInstance } from '@/engine/types';
import {
  abilityDial, dialLabel, dialReadiness, dialReason, dialSaid, dialSegments, dialShade, framePath, segmentDash,
  type DialModel,
} from '@/ui/overlays/abilityDialModel';
import { skillBlockReason } from '@/ui/board/heroActions';
import { mockHeroInstance } from '@/ui/gallery/mock';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';

// The hero sheet's ability dial (AbilityDial.tsx) draws what this model says.
// These pin the model to the engine's own reading of a wait, a charge and a
// charged ultimate, and the arithmetic of its marks.

const hero = (id: string, over: Partial<CardInstance> = {}): CardInstance =>
  ({ ...mockHeroInstance(HEROES.find((h) => h.id === id)!), level: ULT_UNLOCK_LEVEL, ...over });

describe('abilityDial reads the hero as the engine does', () => {
  it('a skill: the turns left of its full wait, nothing when ready', () => {
    const full = skillWait(getAbility('skill_lash')!);
    expect(abilityDial(hero('hero_lash'), 'skill_lash')).toEqual({ kind: 'wait', left: 0, full });
    expect(abilityDial(hero('hero_lash', { cooldowns: { skill_lash: 2 } }), 'skill_lash')).toEqual({ kind: 'wait', left: 2, full });
  });

  it('a wait longer than the card says still fits its dial', () => {
    const m = abilityDial(hero('hero_lash', { cooldowns: { skill_lash: 9 } }), 'skill_lash')!;
    expect(m).toMatchObject({ left: 9, full: 9 });
    expect(dialShade(m)).toBe(1);
  });

  it('a charged skill: its charges, and the wait only while one is coming back', () => {
    const full = skillWait(getAbility('skill_kelvin')!);
    expect(abilityDial(hero('hero_kelvin'), 'skill_kelvin')).toEqual({ kind: 'wait', left: 0, full, charges: { left: 2, max: 2 } });
    const one = abilityDial(hero('hero_kelvin', { chargesSpent: { skill_kelvin: 1 }, cooldowns: { skill_kelvin: 3 } }), 'skill_kelvin')!;
    expect(one).toEqual({ kind: 'wait', left: 3, full, charges: { left: 1, max: 2 } });
    expect(dialShade(one)).toBe(0); // a charge in hand: the glyph stays lit
    const none = abilityDial(hero('hero_kelvin', { chargesSpent: { skill_kelvin: 2 }, cooldowns: { skill_kelvin: 3 } }), 'skill_kelvin')!;
    expect(dialShade(none)).toBe(3 / full);
  });

  it('an ultimate: its size\'s wait; none while it is locked', () => {
    const lash = HEROES.find((h) => h.id === 'hero_lash')!;
    const full = ultWait(ultimateCard(lash.ult)!);
    expect(abilityDial(hero('hero_lash', { cooldowns: { [lash.ult!]: 1 } }), lash.ult!)).toEqual({ kind: 'wait', left: 1, full });
    expect(abilityDial(hero('hero_lash', { level: 1, cooldowns: { [lash.ult!]: 1 } }), lash.ult!)).toBeUndefined();
  });

  it('a charged ultimate: the damage counted toward its need', () => {
    const victor = hero('hero_victor', { tally: { eff_ult_victor: 6 } });
    const need = ultCharge(victor)!.need;
    const m = abilityDial(victor, 'eff_ult_victor')!;
    expect(m).toEqual({ kind: 'charge', have: 6, need });
    expect(dialShade(m)).toBeCloseTo(1 - 6 / need);
    expect(dialSegments(m)).toEqual({ total: need, done: 6 });
    expect(dialSaid(m)).toBe(`6 / ${need}`);
  });

  it('an ability the hero does not have has no dial', () => {
    expect(abilityDial(hero('hero_lash'), 'skill_kelvin')).toBeUndefined();
  });
});

describe('what the dial says', () => {
  const wait = (left: number, full: number, charges?: { left: number; max: number }): DialModel => ({ kind: 'wait', left, full, ...(charges ? { charges } : {}) });

  it('one frame segment a turn: the turns served are in', () => {
    expect(dialSegments(wait(3, 3))).toEqual({ total: 3, done: 0 });
    expect(dialSegments(wait(1, 4))).toEqual({ total: 4, done: 3 });
    expect(dialSegments(wait(0, 3))).toEqual({ total: 3, done: 3 });
  });

  it('the shade is the wait left: full the turn it is used, none when ready', () => {
    expect([3, 2, 1, 0].map((l) => dialShade(wait(l, 3)))).toEqual([1, 2 / 3, 1 / 3, 0]);
  });

  it('names itself in full for a screen reader, and in the row\'s few words', () => {
    expect(dialLabel(wait(2, 3))).toBe('Ready in 2 turns · waits 3');
    expect(dialLabel(wait(1, 3))).toBe('Ready in 1 turn · waits 3');
    expect(dialLabel(wait(0, 3))).toBe('Ready · waits 3');
    expect(dialLabel(wait(2, 4, { left: 1, max: 2 }))).toBe('1 of 2 charges · next charge in 2 turns');
    expect(dialLabel(wait(2, 4, { left: 0, max: 2 }))).toBe('No charges of 2 · next charge in 2 turns');
    expect(dialLabel(wait(0, 4, { left: 2, max: 2 }))).toBe('2 of 2 charges');
    expect(dialLabel({ kind: 'charge', have: 7, need: 10 })).toBe('Charge 7 of 10 · needs 3 more damage');
    expect(dialLabel({ kind: 'charge', have: 10, need: 10 })).toBe('Charged · 10 of 10');
    expect(dialSaid(wait(2, 3))).toBe('2 turns left');
    expect(dialSaid(wait(1, 4, { left: 0, max: 2 }))).toBe('1 turn left');
    expect(dialSaid(wait(0, 3))).toBeUndefined();
    expect(dialSaid(wait(2, 4, { left: 1, max: 2 }))).toBeUndefined();
  });

  it('readiness only rises when something comes back', () => {
    expect(dialReadiness(wait(1, 3))).toBeLessThan(dialReadiness(wait(0, 3)));
    expect(dialReadiness(wait(2, 4, { left: 1, max: 2 }))).toBeLessThan(dialReadiness(wait(0, 4, { left: 2, max: 2 })));
    expect(dialReadiness(wait(3, 3))).toBe(dialReadiness(wait(1, 3)));
    expect(dialReadiness({ kind: 'charge', have: 9, need: 10 })).toBeLessThan(dialReadiness({ kind: 'charge', have: 10, need: 10 }));
  });

  it('knows the reasons it already shows, as heroActions words them', () => {
    const lash = hero('hero_lash', { cooldowns: { skill_lash: 2 } });
    const kelvin = hero('hero_kelvin', { chargesSpent: { skill_kelvin: 2 }, cooldowns: { skill_kelvin: 1 } });
    const victor = hero('hero_victor', { tally: { eff_ult_victor: 6 } });
    expect(dialReason(skillBlockReason('cooldown', lash, 'skill_lash'))).toBe(true);
    expect(dialReason(skillBlockReason('cooldown', kelvin, 'skill_kelvin'))).toBe(true);
    expect(dialReason(skillBlockReason('charge', victor, 'eff_ult_victor'))).toBe(true);
    expect(dialReason('Not your turn')).toBe(false);
    expect(dialReason(skillBlockReason('locked'))).toBe(false);
    expect(dialReason(undefined)).toBe(false);
  });
});

describe('the marks\' arithmetic', () => {
  it('the frame starts at the middle of its top edge, and its length is the outline\'s', () => {
    const { d, length } = framePath(44, 1, 6);
    expect(d.startsWith('M22 1H37')).toBe(true);
    expect(length).toBeCloseTo(4 * (42 - 12) + 2 * Math.PI * 6);
    // A square with no corner: four sides.
    expect(framePath(40, 0, 0).length).toBe(160);
  });

  it('segments tile the path: equal, a gap apart, none overlapping', () => {
    const length = 160;
    for (const total of [2, 3, 4, 8, 10]) {
      const step = length / total;
      for (let i = 0; i < total; i++) {
        const { array, offset } = segmentDash(i, total, length, 2);
        const [dash, rest] = array.split(' ').map(Number);
        expect(dash).toBeCloseTo(step - 2);
        expect(dash + rest).toBeCloseTo(length);       // one dash a lap
        expect(-offset).toBeCloseTo(i * step + 1);     // starts half a gap in
      }
    }
  });

  it('one segment is the whole path, unbroken', () => {
    expect(segmentDash(0, 1, 160, 2)).toEqual({ array: '160 0', offset: 0 });
  });
});
