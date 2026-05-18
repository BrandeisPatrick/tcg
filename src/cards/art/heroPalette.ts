// Per-hero color identity + role keywords. Drives portrait accents and the
// card-banner "Hero · X · Y · Z" subtitle.
//
// The three-tag keyword set matches Valve's in-game hero-select cards —
// each Deadlock hero in canon gets a triplet of descriptive flavor tags
// (e.g. Abrams: "Tank · Brawler · Bull-Headed"). For our TCG we surface
// the same triplet so the player can read each hero's identity at a glance.
//
// Heroes outside the canon Deadlock roster (TCG-original Rem) get a hand-
// picked triplet that fits their mechanics in this game.

export interface HeroIdentity {
  primary: string;     // dominant color
  accent: string;      // secondary
  /** 1–3 short keyword tags. First entry is the "primary" archetype and is
   *  the one shown on small/in-game tiles where space is limited. The full
   *  card view renders all three joined by `·`. */
  keywords: string[];
  initial: string;     // for fallback / corner mark
}

export const HERO_IDENTITY: Record<string, HeroIdentity> = {
  hero_abrams:    { primary: '#5fb7ff', accent: '#1c3856', keywords: ['Tank', 'Brawler', 'Bull-Headed'],         initial: 'A' },
  hero_dynamo:    { primary: '#ffce5c', accent: '#5b3e15', keywords: ['Teamplay', 'Initiator', 'Clutch'],        initial: 'D' },
  hero_haze:      { primary: '#f0a04b', accent: '#4a2710', keywords: ['Assassin', 'Stealthy', 'Lethal'],         initial: 'H' },
  hero_kelvin:    { primary: '#7af1ff', accent: '#163945', keywords: ['Protector', 'Explorer', 'Ice Cold'],      initial: 'K' },
  hero_lady_geist: { primary: '#c08bff', accent: '#3b2255', keywords: ['Lifesteal', 'Self Damage', 'Fatale'],    initial: 'L' },
  hero_lash:      { primary: '#ff6b6b', accent: '#4a1313', keywords: ['Initiator', 'High Flying', 'Arrogant'],   initial: 'L' },
  hero_mo_krill:  { primary: '#e0a96d', accent: '#3a230c', keywords: ['Tag-Team', 'Initiator', 'Burrower'],      initial: 'M' },
  hero_paige:     { primary: '#ffe6a0', accent: '#5a4416', keywords: ['Helpful', 'Protector', 'Booksmart'],      initial: 'P' },
  hero_rem:       { primary: '#a0e6ff', accent: '#1f3d4d', keywords: ['Caretaker', 'Bench Healer', 'Lullaby'],   initial: 'R' },
  hero_seven:     { primary: '#9bb0ff', accent: '#1a224a', keywords: ['High Voltage', 'Merciless', 'Area Denial'], initial: 'S' },
  hero_shiv:      { primary: '#ff7a3d', accent: '#4a1f0f', keywords: ['Rage', 'Bleed', 'Repeat'],                initial: 'S' },
  hero_sinclair:  { primary: '#d96fa3', accent: '#4a1d36', keywords: ['Trickster', 'Copycat', 'Versatile'],      initial: 'S' },
  hero_vindicta:  { primary: '#ffd166', accent: '#4a3814', keywords: ['Sniper', 'Soaring', 'One Shot Kill'],     initial: 'V' },
  hero_viscous:   { primary: '#62cc6e', accent: '#1c3a20', keywords: ['Evasive', 'Disruptor', 'Gooey'],          initial: 'V' },
  hero_yamato:    { primary: '#ff5a8c', accent: '#4a162a', keywords: ['Relentless', 'Acrobatics', 'Pursuer'],    initial: 'Y' },
  hero_wraith:    { primary: '#9d8aff', accent: '#241a4a', keywords: ['Duelist', 'Isolator', 'Telekinetic'],     initial: 'W' },
  hero_warden:    { primary: '#7be0bf', accent: '#143a30', keywords: ['Initiator', 'Fearless', 'One Man Army'],  initial: 'W' },
  hero_mirage:    { primary: '#e6a861', accent: '#43230d', keywords: ['Bodyguard', 'Traveller', 'Focused'],      initial: 'M' },
  hero_drifter:   { primary: '#a5b4c8', accent: '#1b212d', keywords: ['Stalker', 'Bloodthirsty', 'Cruel'],       initial: 'D' },
};

export function getHeroIdentity(cardId: string): HeroIdentity {
  return HERO_IDENTITY[cardId] ?? {
    primary: '#7a8aa8',
    accent: '#1f2a44',
    keywords: ['Hero'],
    initial: cardId[0]?.toUpperCase() ?? '?',
  };
}
