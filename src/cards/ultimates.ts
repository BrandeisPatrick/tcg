import type { UltimateCard } from '@/engine/types';

// Ultimates are buttons printed on the hero card (docs/hero-design.md §2): each
// hero's `ult` names the ability id here (`abilities[0]`), usable from Level 3
// (ULT_UNLOCK_LEVEL) for no souls, one ultimate a turn for its side, then on
// its size's wait (ULT_WAIT: small 4, medium 6, large 8 turns), which it also
// starts the match on — a charged one waits on damage instead (`charged.need`).
// These cards are the ultimate's face — its name,
// text, size and icon (the hero's Deadlock ultimate icon, public/ult) — and are
// never dealt or held. Each is one or two effects in 15 words or fewer, as
// written in the hero doc (§8).
export const ULTIMATES: UltimateCard[] = [
  { id: 'ult_abrams',     name: 'Seismic Impact',         type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_abrams',     abilities: ['eff_ult_abrams'],     text: 'Deal {sp:6} spirit damage to the enemy Active. Stun it 1 turn.' },
  { id: 'ult_dynamo',     name: 'Singularity',            type: 'ultimate', rarity: 4, size: 'large',  linkedHero: 'hero_dynamo',     abilities: ['eff_ult_dynamo'],     text: 'Stun every enemy 1 turn. Deal {sp:2} spirit damage to each.' },
  { id: 'ult_haze',       name: 'Bullet Dance',           type: 'ultimate', rarity: 4, size: 'large',  linkedHero: 'hero_haze',       abilities: ['eff_ult_haze'],       text: 'Deal {bp:0} bullet damage to every enemy.' },
  { id: 'ult_kelvin',     name: 'Frozen Shelter',         type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_kelvin',     abilities: ['eff_ult_kelvin'],     text: 'Heal your heroes {sp:4}. Root the enemy Active 2 turns.' },
  { id: 'ult_lady_geist', name: 'Soul Exchange',          type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_lady_geist', abilities: ['eff_ult_lady_geist'], text: 'Swap HP with the enemy Active. Deal {sp:3} spirit damage to it.' },
  { id: 'ult_lash',       name: 'Death Slam',             type: 'ultimate', rarity: 4, size: 'large',  linkedHero: 'hero_lash',       abilities: ['eff_ult_lash'],       text: 'Return the enemy Active to hand, items to deck; others take {sp:1} spirit damage.' },
  { id: 'ult_mo_krill',   name: 'Combo',                  type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_mo_krill',   abilities: ['eff_ult_mo_krill'],   text: 'Deal {sp:4} spirit damage to the enemy Active, healing that much. Stun it 1 turn.' },
  { id: 'ult_paige',      name: 'Rallying Charge',        type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_paige',      abilities: ['eff_ult_paige'],      text: 'Heal your heroes {sp:3}. Deal {sp:2} spirit damage to every enemy.' },
  { id: 'ult_rem',        name: 'Naptime',                type: 'ultimate', rarity: 4, size: 'small',  linkedHero: 'hero_rem',        abilities: ['eff_ult_rem'],        text: 'Deal {sp:2} spirit damage to the enemy Active and Sleep it 2 turns.' },
  { id: 'ult_graves',     name: 'Borrowed Decree',        type: 'ultimate', rarity: 4, size: 'small',  linkedHero: 'hero_graves',     abilities: ['eff_ult_graves'],     text: 'Raise a Gravestone on your bench: each turn it shuffles {sp:0} Ghouls into your deck.' },
  { id: 'ult_seven',      name: 'Storm Cloud',            type: 'ultimate', rarity: 4, size: 'large',  linkedHero: 'hero_seven',      abilities: ['eff_ult_seven'],      text: "Channel 2 turns: at each turn's end, deal {sp:2} spirit damage to every enemy." },
  { id: 'ult_shiv',       name: 'Killing Blow',           type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_shiv',       abilities: ['eff_ult_shiv'],       text: 'Deal {sp:5} spirit damage to the enemy Active. Knock it out if below half HP.' },
  { id: 'ult_sinclair',   name: 'Audience Participation', type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_sinclair',   abilities: ['eff_ult_sinclair'],   text: "Cast the enemy Active's ultimate as Sinclair's own." },
  // Flight's second ability is what the Flying status carries (statuses/): the card prints its {sp:1}.
  { id: 'ult_vindicta',   name: 'Flight',                 type: 'ultimate', rarity: 4, size: 'small',  linkedHero: 'hero_vindicta',   abilities: ['eff_ult_vindicta', 'status_flying'], text: 'Fly 3 turns: 1 in 3 hits miss her; her attacks add {sp:1} spirit damage.' },
  { id: 'ult_viscous',    name: 'Goo Ball',               type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_viscous',    abilities: ['eff_ult_viscous'],    text: 'Deal {sp:2} spirit damage to every enemy. Stun the enemy Active 1 turn.' },
  { id: 'ult_yamato',     name: 'Shadow Transformation',  type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_yamato',     abilities: ['eff_ult_yamato'],     text: 'For 2 turns: +{sp:3} Bullet Power and Unstoppable.' },
  { id: 'ult_wraith',     name: 'Telekinesis',            type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_wraith',     abilities: ['eff_ult_wraith'],     text: 'Deal {sp:5} spirit damage to the enemy Active. Stun it 1 turn.' },
  { id: 'ult_warden',     name: 'Last Stand',             type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_warden',     abilities: ['eff_ult_warden'],     text: 'Deal {sp:6} spirit damage to the enemy Active. Warden heals that much.' },
  { id: 'ult_mirage',     name: 'Traveler',               type: 'ultimate', rarity: 4, size: 'small',  linkedHero: 'hero_mirage',     abilities: ['eff_ult_mirage'],     text: 'Swap Mirage with a bench ally. Both get Shield {sp:2}.' },
  { id: 'ult_drifter',    name: 'Eternal Night',          type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_drifter',    abilities: ['eff_ult_drifter'],    text: 'Silence every enemy hero but the Active 2 turns. Deal {sp:2} spirit damage to each.' },
  // The charged ultimates (hero-design §2, §5): ready once the hero has taken
  // or dealt `need` damage since the last use. The need is what the effect was
  // priced at when it cost souls (half its old 20 and 16): 10 and 8.
  {
    id: 'ult_victor', name: 'Shocking Reanimation', type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_victor', abilities: ['eff_ult_victor'],
    text: 'Falling, Victor may revive at half HP and deal {sp:1} spirit damage to every enemy.',
    charged: { need: 10, by: 'taken', text: 'Ready once Victor has taken 10 damage.' },
  },
  {
    id: 'ult_silver', name: 'Lycan Curse', type: 'ultimate', rarity: 4, size: 'medium', linkedHero: 'hero_silver', abilities: ['eff_ult_silver'],
    text: 'Silver turns into a wolf for 2 turns: +{bp:0} Bullet Power and Shield 6.',
    charged: { need: 8, by: 'dealt', text: 'Ready once Silver has dealt 8 damage.' },
  },
];

export const ULTIMATES_BY_ID = Object.fromEntries(ULTIMATES.map((u) => [u.id, u])) as Record<string, UltimateCard>;
