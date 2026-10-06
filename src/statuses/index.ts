import type { StatusId } from '@/engine/types';
import { BLEED_CAP, DJINN_CAP } from '@/engine/constants';

/** What a status stops its bearer doing. The only place a lockout is written:
 *  `isBlocked` (engine/query.ts) reads it, and the attack gate, `useSkill`,
 *  the channel pulse, the AI and the board all ask that. */
export type Blockable = 'attack' | 'skill' | 'pulse';

export interface StatusDef {
  id: StatusId;
  title: string;
  desc: string;
  hvalue: number; // AI heuristic: positive = buff, negative = debuff
  /** Actions this status stops: a basic attack, a hero skill, or the end-of-turn
   *  pulse of a channeled ultimate. */
  blocks?: Blockable[];
  /** Hard crowd control: Unstoppable blocks it and cleanses it, and the
   *  bearer suffering it fires Reactive Barrier. It also ticks at the END of
   *  the afflicted unit's turn rather than the start (see tickEndOfTurnCC). */
  cc?: true;
  /** How a second application combines with one already on the bearer. Absent
   *  = refresh to the larger value and the longer duration. `add` stacks the
   *  values up to `cap`; `duration` says whether the timer keeps the longer of
   *  the two ('max') or starts over ('reset'). */
  stack?: { add: true; cap: number; duration: 'max' | 'reset' };
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

  // ----- Multi-attack -----
  // Counts the bearer's extra full-power basic attacks this turn (stacks across
  // sources). Each extra swing rides on the turn's attack and re-fires onAttack
  // procs. Granted at turn start (Burst Fire), by a spell (Active Reload) or by
  // Haze's own swing (Fixation); consumed by the attack.
  { id: 'extra_attack',  title: 'Extra Attack',  desc: 'Makes <value> extra basic attack(s) this turn.',             hvalue:  1 },

  // ----- Channeled ultimate (board-wipe wincon) -----
  // Heavy channel: the caster is locked out of attacking and skills, but deals
  // <value> spirit AoE to all enemies at the end of each of their turns until
  // it expires. Mobile variant (casting_light) keeps the AoE drain but lets the
  // caster keep acting. Stun / Sleep interrupts a pulse.
  { id: 'casting',       title: 'Channeling',    desc: 'Locked in an ultimate: cannot attack or use skills. Deals <value> spirit to all enemies at end of turn.', hvalue: 1, blocks: ['attack', 'skill'] },
  { id: 'casting_light', title: 'Channeling',    desc: 'Deals <value> spirit to all enemies at end of turn and drains HP. Can still act.',                         hvalue: 1 },

  // ----- Hard CC -----
  { id: 'stun',          title: 'Stun',          desc: 'Cannot act, attack, or use skills.',                       hvalue: -2, blocks: ['attack', 'skill', 'pulse'], cc: true },
  { id: 'silenced',      title: 'Silenced',      desc: 'Cannot use skills.',                                         hvalue: -1, blocks: ['skill'], cc: true },
  { id: 'disarm',        title: 'Disarm',        desc: 'Cannot make basic attacks.',                               hvalue: -2, blocks: ['attack'], cc: true },
  { id: 'sleep',         title: 'Sleep',         desc: 'Cannot act, attack, or use skills. Any damage wakes it (triggering any wake-up effect).', hvalue: -2, blocks: ['attack', 'skill', 'pulse'], cc: true },

  // ----- DOT -----
  { id: 'bleed',         title: 'Bleed',         desc: 'Take <value> Pure dmg at start of turn (stacks, max 3).',  hvalue: -1, stack: { add: true, cap: BLEED_CAP, duration: 'max' } },

  // ----- Delayed CC -----
  // Mirage's mark refreshes its full 3-turn timer on every new stack: the
  // active rebuilds the timer (stack.duration 'reset').
  { id: 'charged',       title: 'Charged',       desc: 'On expiry: Stun for 1 turn.',                              hvalue: -1 },
  { id: 'djinns_mark',   title: "Djinn's Mark",  desc: 'Detonates at 4 stacks or on expiry for 3 spirit dmg per stack.', hvalue: -1, stack: { add: true, cap: DJINN_CAP, duration: 'reset' } },
  { id: 'reverb',        title: 'Reverb',        desc: 'Detonates at the start of your turn for <value> spirit damage.', hvalue: -1 },

  // ----- Temporary max-HP transfer (Siphon Bullets); hvalue 0 so cleanse can't
  // strip them without reverting the maxHP (revert lives in tickStartOfTurn). -----
  { id: 'siphon_drain',  title: 'Siphoned',      desc: 'Max HP reduced by <value>; restored when it expires.',          hvalue: 0 },
  { id: 'siphon_gain',   title: 'Siphon',        desc: 'Max HP increased by <value>; reverts when it expires.',          hvalue: 0 },

  // ----- Other debuff -----
  { id: 'weapon_power_down',   title: 'Bullet Power',  desc: 'Bullet Power −<value> on basic attacks.',                 hvalue: -1 },
  { id: 'spirit_power_down',   title: 'Spirit Power',  desc: 'Spirit Power −<value> on skills.',                           hvalue: -1 },
  { id: 'bullet_resist_down',  title: 'Bullet Resist', desc: 'Bullet Resist −<value>. Take +<value> bullet damage.',       hvalue: -1 },
  { id: 'spirit_resist_down',  title: 'Spirit Resist', desc: 'Spirit Resist −<value>. Take +<value> spirit damage.',       hvalue: -1 },
  { id: 'healing_boost_down',  title: 'Healing Boost', desc: 'Cannot be healed.',                                          hvalue: -1 },
];

export const STATUSES_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s])) as Record<string, StatusDef>;

export const DEBUFF_IDS = new Set(STATUSES.filter((s) => s.hvalue < 0).map((s) => s.id));

/** Hard crowd control — blocked by Unstoppable. Derived from `cc`. */
export const CC_STATUSES: Set<StatusId> = new Set(STATUSES.filter((s) => s.cc).map((s) => s.id));
