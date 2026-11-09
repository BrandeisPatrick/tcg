import type { UltimateCard } from '@/engine/types';

// Ultimates are buttons printed on the hero card (docs/hero-design.md §2): each
// hero's `ult` names the ability id here (`abilities[0]`), usable from Level 2
// (ULT_UNLOCK_LEVEL) for its size's souls (ULT_COST: small 4, medium 8, large
// 12), then on ULT_COOLDOWN. These cards are the ultimate's face — its name,
// text, size and icon (the hero's Deadlock ultimate icon, public/ult) — and are
// never dealt or held. Each is one or two effects in 15 words or fewer, as
// written in the hero doc (§8).
export const ULTIMATES: UltimateCard[] = [
  { id: 'ult_abrams',     name: 'Seismic Impact',         type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_abrams',     abilities: ['eff_ult_abrams'],     text: 'Deal {sp:6} spirit damage to the enemy Active. Stun it 1 turn.' },
  { id: 'ult_dynamo',     name: 'Singularity',            type: 'ultimate', rarity: 4, size: 'large',  linkedHero: 'hero_dynamo',     abilities: ['eff_ult_dynamo'],     text: 'Stun every enemy 1 turn. Deal {sp:2} spirit damage to each.' },
  { id: 'ult_haze',       name: 'Bullet Dance',           type: 'ultimate', rarity: 4, size: 'large',  linkedHero: 'hero_haze',       abilities: ['eff_ult_haze'],       text: "Deal Haze's Attack as bullet damage to every enemy." },
  { id: 'ult_kelvin',     name: 'Frozen Shelter',         type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_kelvin',     abilities: ['eff_ult_kelvin'],     text: 'Heal your heroes {sp:4}. Root the enemy Active 2 turns.' },
  { id: 'ult_lady_geist', name: 'Soul Exchange',          type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_lady_geist', abilities: ['eff_ult_lady_geist'], text: 'Swap HP with the enemy Active. Deal {sp:3} spirit damage to it.' },
  { id: 'ult_lash',       name: 'Death Slam',             type: 'ultimate', rarity: 4, size: 'large',  linkedHero: 'hero_lash',       abilities: ['eff_ult_lash'],       text: 'Deal {sp:3} spirit damage to every enemy. Stun each 1 turn.' },
  { id: 'ult_mo_krill',   name: 'Combo',                  type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_mo_krill',   abilities: ['eff_ult_mo_krill'],   text: 'Deal {sp:4} spirit damage to the enemy Active, healing that much. Stun it 1 turn.' },
  { id: 'ult_paige',      name: 'Rallying Charge',        type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_paige',      abilities: ['eff_ult_paige'],      text: 'Heal your heroes {sp:3}. Deal {sp:2} spirit damage to every enemy.' },
  { id: 'ult_rem',        name: 'Naptime',                type: 'ultimate', rarity: 4, size: 'small',  linkedHero: 'hero_rem',        abilities: ['eff_ult_rem'],        text: 'Sleep the enemy Active 2 turns.' },
  { id: 'ult_seven',      name: 'Storm Cloud',            type: 'ultimate', rarity: 4, size: 'large',  linkedHero: 'hero_seven',      abilities: ['eff_ult_seven'],      text: 'Deal {sp:5} spirit damage to every enemy.' },
  { id: 'ult_shiv',       name: 'Killing Blow',           type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_shiv',       abilities: ['eff_ult_shiv'],       text: 'Deal {sp:5} spirit damage to the enemy Active. Knock it out if below half HP.' },
  { id: 'ult_sinclair',   name: 'Audience Participation', type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_sinclair',   abilities: ['eff_ult_sinclair'],   text: "Cast the enemy Active's ultimate as Sinclair's own." },
  { id: 'ult_vindicta',   name: 'Assassinate',            type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_vindicta',   abilities: ['eff_ult_vindicta'],   text: 'Deal {sp:8} spirit damage to any enemy.' },
  { id: 'ult_viscous',    name: 'Goo Ball',               type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_viscous',    abilities: ['eff_ult_viscous'],    text: 'Deal {sp:2} spirit damage to every enemy. Stun the enemy Active 1 turn.' },
  { id: 'ult_yamato',     name: 'Shadow Transformation',  type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_yamato',     abilities: ['eff_ult_yamato'],     text: 'For 2 turns: +3 Attack and Unstoppable.' },
  { id: 'ult_wraith',     name: 'Telekinesis',            type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_wraith',     abilities: ['eff_ult_wraith'],     text: 'Deal {sp:5} spirit damage to the enemy Active. Stun it 1 turn.' },
  { id: 'ult_warden',     name: 'Last Stand',             type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_warden',     abilities: ['eff_ult_warden'],     text: 'Deal {sp:6} spirit damage to the enemy Active. Warden heals that much.' },
  { id: 'ult_mirage',     name: 'Traveler',               type: 'ultimate', rarity: 4, size: 'small',  linkedHero: 'hero_mirage',     abilities: ['eff_ult_mirage'],     text: 'Swap Mirage with a bench ally. Both get Shield 2.' },
  { id: 'ult_drifter',    name: 'Eternal Night',          type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_drifter',    abilities: ['eff_ult_drifter'],    text: 'Deal {sp:5} spirit damage to the enemy Active. It takes +1 damage for 3 turns.' },
];

export const ULTIMATES_BY_ID = Object.fromEntries(ULTIMATES.map((u) => [u.id, u])) as Record<string, UltimateCard>;
