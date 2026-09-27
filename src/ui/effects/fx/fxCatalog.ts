/**
 * The FX layer's shared vocabulary: beat timings, and for every unique
 * effect tag its label, ink and how long its intro runs before the impact.
 * The timeline scheduler (fxTimeline.ts), the renderers (hits.tsx /
 * support.tsx) and the Gallery showroom all read from here, so a tag's
 * timing can never drift between the scheduler and what's drawn.
 */
import type { DamageType, FxTag } from '@/engine/types';
import { palette, damageFxColor } from '../../tokens';
import { poster } from '../../poster';

export const FX_TIMING = {
  /** Cast flare → bolt lands on the target. */
  castLead: 420,
  /** Effects the caster puts on itself land during the flare. */
  selfLead: 220,
  /** Ultimates wait for the screen-fill name plate before the strike lands. */
  ultLead: 600,
  /** Between impacts on different targets in one batch (an AoE ripples). */
  stagger: 90,
  /** A status stamp lands this long after the hit on the same card… */
  statusAfterHit: 200,
  /** …and each further stamp on that card queues behind the last. */
  statusStack: 240,
  /** Lifesteal motes travel from the victim to the healer. */
  streamTravel: 320,
  hitHold: 1150,
  koHold: 1650,
  healHold: 950,
  statusHold: 1050,
  shieldHold: 1000,
  immuneHold: 950,
  castHold: 850,
  reviveHold: 1300,
  levelHold: 1300,
  /** The KO shatter and the K.O. sticker play this long before the corpse
   *  look may land — the sticker has faded by then. */
  koSettle: 1450,
} as const;

export interface TagInfo {
  /** Sticker text at impact. */
  label: string;
  /** The effect's own ink (a hero's identity colour where it has one). */
  ink: string;
  /** Intro length before the impact (glyphs converging, an echo ringing in…). */
  lead: number;
}

export const TAG_INFO: Record<FxTag, TagInfo> = {
  djinns_mark:   { label: "Djinn's Mark",  ink: '#e6a861', lead: 460 },
  bleed:         { label: 'Bleed',         ink: poster.red, lead: 0 },
  reverb:        { label: 'Echo',          ink: palette.spirit, lead: 280 },
  naptime:       { label: 'Wakes',         ink: '#a0e6ff', lead: 360 },
  discharge:     { label: 'Discharge',     ink: '#9bb0ff', lead: 0 },
  execute:       { label: 'Executed',      ink: poster.red, lead: 300 },
  life_drain:    { label: 'Life Drain',    ink: '#c08bff', lead: 0 },
  lifesteal:     { label: 'Lifesteal',     ink: poster.red, lead: 0 },
  mixed_bullets: { label: 'Mixed Bullets', ink: '#9d8aff', lead: 0 },
  ricochet:      { label: 'Ricochet',      ink: poster.gold, lead: 260 },
  tesla:         { label: 'Tesla',         ink: '#9bb0ff', lead: 220 },
  burst:         { label: 'Mystic Burst',  ink: palette.spirit, lead: 0 },
  channel:       { label: 'Channel',       ink: palette.spirit, lead: 420 },
  regen:         { label: 'Regen',         ink: poster.green, lead: 0 },
  combo:         { label: 'Combo',         ink: '#e0a96d', lead: 0 },
  siphon:        { label: 'Siphon',        ink: poster.red, lead: 0 },
};

export function tagLead(tag?: FxTag): number {
  return tag ? TAG_INFO[tag].lead : 0;
}

/** Inks the amount prints in at an impact — a shade brighter than the wash
 *  of the same type, so the digits read on a dark portrait. */
export const NUMERAL_INK = {
  attack: '#ef5a3e',
  spirit: '#c98cf0',
  pure: '#7fd6d0',
  ko: poster.red,
  heal: poster.green,
} as const;

export function numeralInk(type: DamageType, ko = false): string {
  if (ko) return NUMERAL_INK.ko;
  return type === 'spirit' ? NUMERAL_INK.spirit : type === 'pure' ? NUMERAL_INK.pure : NUMERAL_INK.attack;
}

/** The damage-type ink: bullet vermillion, spirit plum, pure teal, KO wine. */
export function typeInk(type: DamageType, ko = false): string {
  return damageFxColor(type, ko);
}

/** Inks the FX layer uses beyond the damage types. */
export const FX_INK = {
  heal: poster.green,
  buff: poster.stat.atkBright,
  debuff: poster.red,
  gold: poster.gold,
  cream: poster.cream,
  paper: poster.paper,
  ink: poster.ink,
  frame: poster.frame,
  bullet: palette.hp,
  spirit: palette.spirit,
  pure: palette.pure,
  ko: palette.danger,
  lightning: '#e6ecff',
  smoke: 'rgba(120, 112, 100, 0.55)',
} as const;
