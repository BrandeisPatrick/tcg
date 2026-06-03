import type { UltimateCard } from '@/engine/types';

// Ultimates are linked to their hero. Played from a separate slot when the hero's ult is unlocked.
// For MVP we treat them as cards that get summoned to hand when a hero meets the unlock condition (TBD).
// Ultimates are hero-locked finishers, so they get their own cost band (not the
// rarity-4 = 7+ rule). They spread 5–10 by power (single-target ~5-6, AoE/CC ~7-9,
// marquee 10), with Mirage's Traveler a cheap 2-cost escape outlier. Effects are
// anchored to each hero's canonical Deadlock ult — see docs/ultimate-design.md.
export const ULTIMATES: UltimateCard[] = [
  { id: 'ult_abrams',     name: 'Seismic Impact',  type: 'ultimate', rarity: 4, cost: 8, linkedHero: 'hero_abrams',     abilities: ['eff_ult_abrams'],     text: 'Deal 4 spirit to all enemies and Stun enemy Active 1 turn.' },
  { id: 'ult_dynamo',     name: 'Singularity',     type: 'ultimate', rarity: 4, cost: 9, linkedHero: 'hero_dynamo',     abilities: ['eff_ult_dynamo'],     text: 'Stun all enemies for 1 turn.' },
  { id: 'ult_haze',       name: 'Bullet Dance',    type: 'ultimate', rarity: 4, cost: 7, linkedHero: 'hero_haze',       abilities: ['eff_ult_haze'],       text: 'Deal 3 bullet to every enemy.' },
  { id: 'ult_kelvin',     name: 'Frozen Shelter',  type: 'ultimate', rarity: 4, cost: 8, linkedHero: 'hero_kelvin',     abilities: ['eff_ult_kelvin'],     text: 'Heal all allies 7.' },
  { id: 'ult_lady_geist', name: 'Soul Exchange',   type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_lady_geist', abilities: ['eff_ult_lady_geist'], text: 'Swap HP totals with enemy Active.' },
  { id: 'ult_lash',       name: 'Death Slam',      type: 'ultimate', rarity: 4, cost: 9, linkedHero: 'hero_lash',       abilities: ['eff_ult_lash'],       text: 'Deal 5 spirit to all enemies and Stun enemy Active 1 turn.' },
  { id: 'ult_mo_krill',   name: 'Combo',           type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_mo_krill',   abilities: ['eff_ult_mo_krill'],   text: 'Stun enemy Active 1 turn; Mo & Krill drains 6 HP (heals itself).' },
  { id: 'ult_paige',      name: 'Rallying Charge', type: 'ultimate', rarity: 4, cost: 10, linkedHero: 'hero_paige',     abilities: ['eff_ult_paige'],      text: 'Heal all allies 4 and deal 4 spirit to all enemies.' },
  { id: 'ult_rem',        name: 'Naptime',         type: 'ultimate', rarity: 4, cost: 7, linkedHero: 'hero_rem',        abilities: ['eff_ult_rem'],        text: 'Sleep enemy Active 2 turns; deal 6 spirit when it wakes.' },
  { id: 'ult_seven',      name: 'Storm Cloud',     type: 'ultimate', rarity: 4, cost: 7, linkedHero: 'hero_seven',      abilities: ['eff_ult_seven'],      text: 'Deal 3 spirit to all enemies.' },
  { id: 'ult_shiv',       name: 'Killing Blow',            type: 'ultimate', rarity: 4, cost: 5, linkedHero: 'hero_shiv',       abilities: ['eff_ult_shiv'],       text: 'Deal 5 spirit to enemy Active; execute it if below half HP.' },
  { id: 'ult_sinclair',   name: 'Audience Participation',  type: 'ultimate', rarity: 4, cost: 9, linkedHero: 'hero_sinclair',   abilities: ['eff_ult_sinclair'],   text: "Copy the enemy Active hero's ultimate into your hand (costs 0)." },
  { id: 'ult_vindicta',   name: 'Assassinate',     type: 'ultimate', rarity: 4, cost: 5, linkedHero: 'hero_vindicta',   abilities: ['eff_ult_vindicta'],   text: 'Deal 5 spirit to any enemy; 9 instead if it is below half HP.' },
  { id: 'ult_viscous',    name: 'Goo Ball',        type: 'ultimate', rarity: 4, cost: 8, linkedHero: 'hero_viscous',    abilities: ['eff_ult_viscous'],    text: 'Viscous gains Unstoppable 1 turn. Deal 3 spirit to all enemies + Stun enemy Active 1 turn.' },
  { id: 'ult_yamato',     name: 'Shadow Transformation', type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_yamato', abilities: ['eff_ult_yamato'],  text: 'Yamato gains +3 Bullet Power (2 turns) and Unstoppable (1 turn), and heals 5.' },
  { id: 'ult_wraith',     name: 'Telekinesis',     type: 'ultimate', rarity: 4, cost: 7, linkedHero: 'hero_wraith',     abilities: ['eff_ult_wraith'],     text: 'Lift enemy Active. 4 spirit dmg + Stun 1 turn.' },
  { id: 'ult_warden',     name: 'Last Stand',       type: 'ultimate', rarity: 4, cost: 9, linkedHero: 'hero_warden',     abilities: ['eff_ult_warden'],     text: '3 spirit to every enemy. Warden heals half the damage dealt.' },
  { id: 'ult_mirage',     name: 'Traveler',         type: 'ultimate', rarity: 4, cost: 2, linkedHero: 'hero_mirage',     abilities: ['eff_ult_mirage'],     text: 'Mirage retreats to the bench (free) and gains Shield 3.' },
  { id: 'ult_drifter',    name: 'Eternal Night',    type: 'ultimate', rarity: 4, cost: 8, linkedHero: 'hero_drifter',    abilities: ['eff_ult_drifter'],    text: 'Silence enemy Active and one bench hero for 2 turns.' },
];

export const ULTIMATES_BY_ID = Object.fromEntries(ULTIMATES.map((u) => [u.id, u])) as Record<string, UltimateCard>;
