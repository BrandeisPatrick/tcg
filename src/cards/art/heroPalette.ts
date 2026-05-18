// Per-hero color identity + role. Drives portrait shape and frame accent.

export type HeroRole = 'tank' | 'marksman' | 'caster' | 'healer' | 'bruiser';

export interface HeroIdentity {
  primary: string;     // dominant color
  accent: string;      // secondary
  role: HeroRole;
  glyph: 'shield' | 'crosshair' | 'orb' | 'cross' | 'fang' | 'bolt' | 'flame' | 'gear' | 'eye';
  initial: string;     // for fallback / corner mark
}

export const HERO_IDENTITY: Record<string, HeroIdentity> = {
  hero_abrams:    { primary: '#5fb7ff', accent: '#1c3856', role: 'tank',    glyph: 'shield',    initial: 'A' },
  hero_dynamo:    { primary: '#ffce5c', accent: '#5b3e15', role: 'healer',  glyph: 'cross',     initial: 'D' },
  hero_haze:      { primary: '#f0a04b', accent: '#4a2710', role: 'marksman', glyph: 'crosshair', initial: 'H' },
  hero_kelvin:    { primary: '#7af1ff', accent: '#163945', role: 'tank',    glyph: 'shield',    initial: 'K' },
  hero_lady_geist: { primary: '#c08bff', accent: '#3b2255', role: 'caster',  glyph: 'orb',       initial: 'L' },
  hero_lash:      { primary: '#ff6b6b', accent: '#4a1313', role: 'bruiser', glyph: 'fang',      initial: 'L' },
  hero_mo_krill:  { primary: '#e0a96d', accent: '#3a230c', role: 'bruiser', glyph: 'fang',      initial: 'M' },
  hero_paige:     { primary: '#ffe6a0', accent: '#5a4416', role: 'healer',  glyph: 'cross',     initial: 'P' },
  hero_rem:       { primary: '#a0e6ff', accent: '#1f3d4d', role: 'healer',  glyph: 'cross',     initial: 'R' },
  hero_seven:     { primary: '#9bb0ff', accent: '#1a224a', role: 'caster',  glyph: 'bolt',      initial: 'S' },
  hero_shiv:      { primary: '#ff7a3d', accent: '#4a1f0f', role: 'bruiser', glyph: 'fang',      initial: 'S' },
  hero_sinclair:  { primary: '#d96fa3', accent: '#4a1d36', role: 'caster',  glyph: 'gear',      initial: 'S' },
  hero_vindicta:  { primary: '#ffd166', accent: '#4a3814', role: 'marksman', glyph: 'crosshair', initial: 'V' },
  hero_viscous:   { primary: '#62cc6e', accent: '#1c3a20', role: 'tank',    glyph: 'shield',    initial: 'V' },
  hero_yamato:    { primary: '#ff5a8c', accent: '#4a162a', role: 'bruiser', glyph: 'flame',     initial: 'Y' },
  hero_wraith:    { primary: '#9d8aff', accent: '#241a4a', role: 'caster',  glyph: 'eye',       initial: 'W' },
};

export function getHeroIdentity(cardId: string): HeroIdentity {
  return HERO_IDENTITY[cardId] ?? {
    primary: '#7a8aa8',
    accent: '#1f2a44',
    role: 'bruiser',
    glyph: 'eye',
    initial: cardId[0]?.toUpperCase() ?? '?',
  };
}
