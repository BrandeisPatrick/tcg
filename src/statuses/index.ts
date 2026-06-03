import type { StatusId } from '@/engine/types';

export interface StatusDef {
  id: StatusId;
  title: string;
  desc: string;
  hvalue: number; // AI heuristic: positive = buff, negative = debuff
}

/**
 * The full status taxonomy. Named to match Deadlock canon where possible.
 *
 * Each status is granted by at least one card in the set; orphans are removed
 * to keep the surface area small and learnable.
 */
export const STATUSES: StatusDef[] = [
  // ----- Buffs -----
  { id: 'bullet_resist', title: 'Bullet Resist', desc: 'Reduce bullet (attack) damage by <value>.',                hvalue:  1 },
  { id: 'spirit_resist', title: 'Spirit Resist', desc: 'Reduce spirit (skill) damage by <value>.',                 hvalue:  1 },
  { id: 'shield',        title: 'Shield',        desc: 'Absorb <value> damage, then break.',                       hvalue:  1 },
  { id: 'weapon_power',  title: 'Bullet Power',  desc: '+<value> Bullet Power on basic attacks.',                  hvalue:  1 },
  { id: 'spirit_power',  title: 'Spirit Power',  desc: '+<value> to skill / ultimate scaling.',                    hvalue:  1 },
  { id: 'unstoppable',   title: 'Unstoppable',   desc: 'Immune to all damage and crowd control. Cleanses CC on apply.', hvalue: 2 },
  { id: 'healing_boost', title: 'Healing Boost', desc: '+<value> to all healing received.',                           hvalue:  1 },

  // ----- Hard CC -----
  { id: 'stun',          title: 'Stun',          desc: 'Cannot act, attack, or use skills.',                       hvalue: -2 },
  { id: 'silenced',      title: 'Silenced',      desc: 'Cannot use skills or ultimates.',                          hvalue: -1 },
  { id: 'disarm',        title: 'Disarm',        desc: 'Cannot make basic attacks.',                               hvalue: -2 },
  { id: 'sleep',         title: 'Sleep',         desc: 'Cannot act, attack, or use skills. Any damage wakes it (triggering any wake-up effect).', hvalue: -2 },

  // ----- DOT -----
  { id: 'bleed',         title: 'Bleed',         desc: 'Take <value> Pure dmg at start of turn (stacks, max 3).',  hvalue: -1 },

  // ----- Delayed CC -----
  { id: 'charged',       title: 'Charged',       desc: 'On expiry: Stun for 2 turns.',                             hvalue: -1 },
  { id: 'djinns_mark',   title: "Djinn's Mark",  desc: 'Detonates at 4 stacks or on expiry for 2 spirit dmg per stack.', hvalue: -1 },

  // ----- Other debuff -----
  { id: 'weapon_power_down',   title: 'Bullet Power',  desc: 'Bullet Power −<value> on basic attacks.',                 hvalue: -1 },
  { id: 'spirit_power_down',   title: 'Spirit Power',  desc: 'Spirit Power −<value> on skills.',                           hvalue: -1 },
  { id: 'bullet_resist_down',  title: 'Bullet Resist', desc: 'Bullet Resist −<value>. Take +<value> bullet damage.',       hvalue: -1 },
  { id: 'spirit_resist_down',  title: 'Spirit Resist', desc: 'Spirit Resist −<value>. Take +<value> spirit damage.',       hvalue: -1 },
  { id: 'healing_boost_down',  title: 'Healing Boost', desc: 'Cannot be healed.',                                          hvalue: -1 },
];

export const STATUSES_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s])) as Record<string, StatusDef>;

export const DEBUFF_IDS = new Set(STATUSES.filter((s) => s.hvalue < 0).map((s) => s.id));

/** Hard crowd control — blocked by Unstoppable. */
export const CC_STATUSES: Set<StatusId> = new Set(['stun', 'silenced', 'disarm', 'sleep']);
