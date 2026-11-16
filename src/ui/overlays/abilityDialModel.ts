/**
 * What an ability's picture tile says about its wait, read off the hero the
 * way the engine reads it, and the arithmetic of the marks that say it
 * (AbilityDial.tsx draws them). Nothing here draws.
 *
 *   wait     a skill or an ultimate that waits on own turns: the turns left
 *            of its full wait; a charged skill adds the charges it holds, the
 *            wait then being its next charge's
 *   charge   a charged ultimate: the damage counted toward what it needs
 *
 * An ultimate below its unlock level has no dial: its row says "Level 2".
 */
import type { AbilityId, CardInstance } from '@/engine/types';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { kitCharges, resolveSkill, skillWait, ultCharge, ultimateCard, ultWait } from '@/engine/query';

export type DialModel =
  | {
    kind: 'wait';
    /** Own turns left: 0 when nothing is cooling. */
    left: number;
    /** The full wait, in own turns. */
    full: number;
    /** A charged skill's charges; `left` turns is then its next charge's wait. */
    charges?: { left: number; max: number };
  }
  | { kind: 'charge'; have: number; need: number };

const turns = (n: number) => `${n} turn${n === 1 ? '' : 's'}`;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** The dial of one of `hero`'s kit abilities, or undefined for an ability it
 *  does not have and for an ultimate still locked. */
export function abilityDial(hero: CardInstance, abilityId: AbilityId): DialModel | undefined {
  const skill = resolveSkill(hero, abilityId);
  if (!skill) return undefined;
  const cooling = Math.max(0, hero.cooldowns?.[skill.id] ?? 0);
  if (skill.kind === 'ult') {
    if ((hero.level ?? 1) < ULT_UNLOCK_LEVEL) return undefined;
    const charge = ultCharge(hero);
    if (charge) return { kind: 'charge', have: charge.have, need: charge.need };
    const face = ultimateCard(skill.id);
    if (!face) return undefined;
    return { kind: 'wait', left: cooling, full: Math.max(ultWait(face, hero), cooling, 1) };
  }
  const charges = kitCharges(hero, skill.id);
  // A charged skill holding every charge has nothing coming back.
  const left = charges && charges.left >= charges.max ? 0 : cooling;
  return { kind: 'wait', left, full: Math.max(skillWait(skill.ability, hero), left, 1), ...(charges ? { charges } : {}) };
}

/** The share of the icon the dial shades (0 lit … 1 dark): the wait still to
 *  run, or the charge still to count. A charged skill with a charge in hand
 *  is lit whatever its next charge's wait reads. */
export function dialShade(m: DialModel): number {
  if (m.kind === 'charge') return m.need > 0 ? clamp01(1 - m.have / m.need) : 0;
  if (m.charges && m.charges.left > 0) return 0;
  return clamp01(m.left / m.full);
}

/** The frame's segments: one a turn of the wait (one a point of a charged
 *  ultimate's need), and how many of them are in. */
export function dialSegments(m: DialModel): { total: number; done: number } {
  if (m.kind === 'charge') return { total: Math.max(1, m.need), done: Math.max(0, Math.min(m.need, m.have)) };
  return { total: m.full, done: Math.max(0, m.full - m.left) };
}

/** How ready the ability is, as a number that only rises when something came
 *  back: a charge, the end of a wait, a full count. The dial plays its
 *  "ready" moment when this is higher than the last time it was looked at. */
export function dialReadiness(m: DialModel): number {
  if (m.kind === 'charge') return m.have >= m.need ? 1 : 0;
  if (m.charges) return m.charges.left;
  return m.left > 0 ? 0 : 1;
}

/** The dial in words, for a screen reader and a mouse: "Ready in 2 turns ·
 *  waits 3". */
export function dialLabel(m: DialModel): string {
  if (m.kind === 'charge') return m.have >= m.need ? `Charged · ${m.have} of ${m.need}` : `Charge ${m.have} of ${m.need} · needs ${m.need - m.have} more damage`;
  if (m.charges) {
    const held = m.charges.left > 0 ? `${m.charges.left} of ${m.charges.max} charges` : `No charges of ${m.charges.max}`;
    return m.left > 0 ? `${held} · next charge in ${turns(m.left)}` : held;
  }
  return m.left > 0 ? `Ready in ${turns(m.left)} · waits ${m.full}` : `Ready · waits ${m.full}`;
}

/** What the row says at its right while the dial is what holds the ability
 *  (the tile carries the picture, so the words only name the unit): "2 turns
 *  left". Undefined when the dial holds nothing. */
export function dialSaid(m: DialModel): string | undefined {
  if (dialShade(m) <= 0) return undefined;
  if (m.kind === 'charge') return `${m.have} / ${m.need}`;
  return `${turns(m.left)} left`;
}

/** True for a reason the dial already shows: a wait, a charge still counting. */
export const dialReason = (reason?: string): boolean =>
  !!reason && /^(Ready in \d|Next charge in \d|Needs \d+ more damage|Not charged)/.test(reason);

// ---- The marks' arithmetic ----

/** A rounded square's outline as one path that starts at the middle of its
 *  top edge and runs clockwise, as a clock's hand does, and its length. */
export function framePath(size: number, inset: number, radius: number): { d: string; length: number } {
  const a = inset;
  const b = size - inset;
  const r = Math.max(0, Math.min(radius, (b - a) / 2));
  const mid = size / 2;
  const d = [
    `M${mid} ${a}`, `H${b - r}`, `A${r} ${r} 0 0 1 ${b} ${a + r}`,
    `V${b - r}`, `A${r} ${r} 0 0 1 ${b - r} ${b}`,
    `H${a + r}`, `A${r} ${r} 0 0 1 ${a} ${b - r}`,
    `V${a + r}`, `A${r} ${r} 0 0 1 ${a + r} ${a}`, 'Z',
  ].join('');
  return { d, length: 4 * (b - a - 2 * r) + 2 * Math.PI * r };
}

/** Segment `i` of `total` along a path `length` long, a `gap` apart: the
 *  stroke-dasharray and stroke-dashoffset that draw it alone. One segment is
 *  the whole path, unbroken. */
export function segmentDash(i: number, total: number, length: number, gap: number): { array: string; offset: number } {
  if (total <= 1) return { array: `${length} 0`, offset: 0 };
  const step = length / total;
  const g = Math.min(gap, step / 2);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { array: `${round(step - g)} ${round(length - step + g)}`, offset: round(-(i * step + g / 2)) };
}
