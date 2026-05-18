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
  { id: 'weapon_power',  title: 'Weapon Power',  desc: '+<value> ATK on basic attacks.',                           hvalue:  1 },
  { id: 'spirit_power',  title: 'Spirit Power',  desc: '+<value> to skill / ultimate scaling.',                    hvalue:  1 },
  { id: 'unstoppable',   title: 'Unstoppable',   desc: 'Immune to all crowd control. Cleanses CC on apply.',       hvalue:  2 },

  // ----- Hard CC -----
  { id: 'stun',          title: 'Stun',          desc: 'Cannot act, attack, or use skills.',                       hvalue: -2 },
  { id: 'silenced',      title: 'Silenced',      desc: 'Cannot use skills or ultimates.',                          hvalue: -1 },
  { id: 'disarm',        title: 'Disarm',        desc: 'Cannot make basic attacks.',                               hvalue: -2 },
  { id: 'sleep',         title: 'Sleep',         desc: 'Cannot act. Wakes up on damage.',                          hvalue: -1 },

  // ----- DOT -----
  { id: 'bleed',         title: 'Bleed',         desc: 'Take <value> Pure dmg at start of turn (stacks, max 3).',  hvalue: -1 },

  // ----- Delayed CC -----
  { id: 'charged',       title: 'Charged',       desc: 'On expiry: Stun for 2 turns.',                             hvalue: -1 },

  // ----- Other debuff -----
  { id: 'vulnerable',    title: 'Vulnerable',    desc: 'Take +2 damage from all sources.',                         hvalue: -2 },

  // ----- Passive flags -----
  { id: 'long_range',    title: 'Long Range',    desc: 'Attacks from the Bench.',                                  hvalue:  1 },
];

export const STATUSES_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s])) as Record<string, StatusDef>;

export const DEBUFF_IDS = new Set(STATUSES.filter((s) => s.hvalue < 0).map((s) => s.id));

/** Hard crowd control — blocked by Unstoppable. */
export const CC_STATUSES: Set<StatusId> = new Set(['stun', 'silenced', 'disarm', 'sleep']);
