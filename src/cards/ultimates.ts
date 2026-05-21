import type { UltimateCard } from '@/engine/types';

// Ultimates are linked to their hero. Played from a separate slot when the hero's ult is unlocked.
// For MVP we treat them as cards that get summoned to hand when a hero meets the unlock condition (TBD).
// Costs sit at 5-7 souls: single-target ults at 5, board-wide at 6, full team buff/save at 7.
export const ULTIMATES: UltimateCard[] = [
  { id: 'ult_abrams',     name: 'Seismic Impact',  type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_abrams',     abilities: ['eff_ult_abrams'],     text: '4 spirit + Splash 2 to all enemy board.' },
  { id: 'ult_dynamo',     name: 'Singularity',     type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_dynamo',     abilities: ['eff_ult_dynamo'],     text: 'Stun all enemy bench for 2.' },
  { id: 'ult_haze',       name: 'Bullet Dance',    type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_haze',       abilities: ['eff_ult_haze'],       text: 'Deal 2 bullet dmg to every enemy.' },
  { id: 'ult_kelvin',     name: 'Frozen Shelter',  type: 'ultimate', rarity: 4, cost: 7, linkedHero: 'hero_kelvin',     abilities: ['eff_ult_kelvin'],     text: 'All allies gain Unstoppable 1.' },
  { id: 'ult_lady_geist', name: 'Soul Exchange',   type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_lady_geist', abilities: ['eff_ult_lady_geist'], text: 'Swap HP totals with enemy Active.' },
  { id: 'ult_lash',       name: 'Death Slam',      type: 'ultimate', rarity: 4, cost: 5, linkedHero: 'hero_lash',       abilities: ['eff_ult_lash'],       text: '6 bullet dmg to enemy Active.' },
  { id: 'ult_mo_krill',   name: 'Combo',           type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_mo_krill',   abilities: ['eff_ult_mo_krill'],   text: 'Channel: drain 2 HP from enemy Active for 3 turns.' },
  { id: 'ult_paige',      name: 'Rallying Charge', type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_paige',      abilities: ['eff_ult_paige'],      text: 'All allies +2 ATK for 2 turns.' },
  { id: 'ult_rem',        name: 'Naptime',         type: 'ultimate', rarity: 4, cost: 7, linkedHero: 'hero_rem',        abilities: ['eff_ult_rem'],        text: 'Heal all allies for 4.' },
  { id: 'ult_seven',      name: 'Storm Cloud',     type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_seven',      abilities: ['eff_ult_seven'],      text: '3 spirit to all enemies.' },
  { id: 'ult_shiv',       name: 'Killing Blow',            type: 'ultimate', rarity: 4, cost: 5, linkedHero: 'hero_shiv',       abilities: ['eff_ult_shiv'],       text: 'Apply Bleed 3 to enemy Active.' },
  { id: 'ult_sinclair',   name: 'Audience Participation',  type: 'ultimate', rarity: 4, cost: 5, linkedHero: 'hero_sinclair',   abilities: ['eff_ult_sinclair'],   text: 'Refresh all ally hero skills.' },
  { id: 'ult_vindicta',   name: 'Assassinate',     type: 'ultimate', rarity: 4, cost: 5, linkedHero: 'hero_vindicta',   abilities: ['eff_ult_vindicta'],   text: '5 bullet dmg to any enemy.' },
  { id: 'ult_viscous',    name: 'Goo Ball',        type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_viscous',    abilities: ['eff_ult_viscous'],    text: 'Bearer Unstoppable 2 + 3 bullet dmg to enemy Active.' },
  { id: 'ult_yamato',     name: 'Shadow Transformation', type: 'ultimate', rarity: 4, cost: 5, linkedHero: 'hero_yamato', abilities: ['eff_ult_yamato'],  text: 'Bearer gains +3 ATK and Unstoppable for 2 turns.' },
  { id: 'ult_wraith',     name: 'Telekinesis',     type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_wraith',     abilities: ['eff_ult_wraith'],     text: 'Lift enemy Active. 4 spirit dmg + Stun 2 turns.' },
  { id: 'ult_warden',     name: 'Last Stand',       type: 'ultimate', rarity: 4, cost: 6, linkedHero: 'hero_warden',     abilities: ['eff_ult_warden'],     text: '3 spirit dmg to every enemy. Warden heals half the damage dealt.' },
  { id: 'ult_mirage',     name: 'Traveler',         type: 'ultimate', rarity: 4, cost: 2, linkedHero: 'hero_mirage',     abilities: ['eff_ult_mirage'],     text: 'Instantly respawn one fallen ally hero (restore full HP).' },
  { id: 'ult_drifter',    name: 'Eternal Night',    type: 'ultimate', rarity: 4, cost: 5, linkedHero: 'hero_drifter',    abilities: ['eff_ult_drifter'],    text: 'Silences all enemy bench heroes for 2 turns.' },
];

export const ULTIMATES_BY_ID = Object.fromEntries(ULTIMATES.map((u) => [u.id, u])) as Record<string, UltimateCard>;
