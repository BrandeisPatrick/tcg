import type { StatusId } from '@/engine/types';
import { BLEED_CAP, DJINN_CAP, FIXATION_CAP } from '@/engine/constants';

/** What a status stops its bearer doing. The only place a lockout is written:
 *  `isBlocked` (engine/query.ts) reads it, and the attack gate, `useSkill`,
 *  the channel pulse, the retreat gate, the AI and the board all ask that. */
export type Blockable = 'attack' | 'skill' | 'pulse' | 'move';

/** What a status stops anyone doing TO its bearer. The only one so far is a
 *  basic attack aimed at it (Dome). */
export type Untargetable = 'attack';

export interface StatusDef {
  id: StatusId;
  title: string;
  desc: string;
  hvalue: number; // AI heuristic: positive = buff, negative = debuff
  /** Actions this status stops: a basic attack, a hero skill, the end-of-turn
   *  pulse of a channeled ultimate, or a move — a Retreat, or being swapped
   *  into the Active slot (Rooted). */
  blocks?: Blockable[];
  /** What the bearer cannot be the target of. A basic attack is the one so far
   *  (Dome): `attackTargets` (engine/legality.ts) leaves the bearer out, and the
   *  attack gate, the forecast, the AI and the board all read that list. */
  untargetable?: Untargetable[];
  /** The status ends the moment its bearer leaves the Active slot — a Retreat, a
   *  promotion, a swap-in or a pull (`leaveActive`, engine/statusOps.ts). For
   *  what only means something while the bearer stands in the lane (Fixation). */
  clearOnLeaveActive?: true;
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
  // Not crowd control, so it ticks at the start of its owner's turn like any buff: put up
  // for 1 turn on your own turn it covers the rival's turn and is gone when yours begins.
  { id: 'dome',          title: 'Dome',          desc: 'Cannot be the target of an attack.',                       hvalue:  2, untargetable: ['attack'] },

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
  { id: 'rooted',        title: 'Rooted',        desc: 'Cannot retreat or be swapped.',                            hvalue: -1, blocks: ['move'], cc: true },
  { id: 'rabbit',        title: 'Rabbit',        desc: 'Hexed into a rabbit: cannot attack or use skills.',        hvalue: -2, blocks: ['attack', 'skill', 'pulse'], cc: true },

  // ----- DOT -----
  { id: 'bleed',         title: 'Bleed',         desc: 'Take <value> Pure dmg at start of turn (stacks, max 3).',  hvalue: -1, stack: { add: true, cap: BLEED_CAP, duration: 'max' } },

  // ----- Delayed CC -----
  // Mirage's mark refreshes its full 3-turn timer on every new stack: the
  // active rebuilds the timer (stack.duration 'reset').
  { id: 'charged',       title: 'Charged',       desc: 'On expiry: Stun for 1 turn.',                              hvalue: -1 },
  { id: 'djinns_mark',   title: "Djinn's Mark",  desc: 'Detonates at 4 stacks or on expiry for 3 spirit dmg per stack.', hvalue: -1, stack: { add: true, cap: DJINN_CAP, duration: 'reset' } },
  { id: 'reverb',        title: 'Reverb',        desc: 'Detonates at the start of your turn for <value> spirit damage.', hvalue: -1 },
  // Last Stand is a delayed strike: at the start of its bearer's owner's turn, when it is
  // about to expire, it deals <value> + the bearer's Spirit to every enemy hero, then the
  // bearer heals what the status carries (tickStartOfTurn).
  { id: 'last_stand',    title: 'Last Stand',    desc: 'Goes off at the start of your turn: <value> spirit to all enemies.', hvalue: 1 },

  // ----- Temporary max-HP transfer (Siphon Bullets); hvalue 0 so cleanse can't
  // strip them without reverting the maxHP (revert lives in tickStartOfTurn). -----
  { id: 'siphon_drain',  title: 'Siphoned',      desc: 'Max HP reduced by <value>; restored when it expires.',          hvalue: 0 },
  { id: 'siphon_gain',   title: 'Siphon',        desc: 'Max HP increased by <value>; reverts when it expires.',          hvalue: 0 },

  // ----- Fixation: the mark an attacker fixed on its target leaves -----
  // A stack count on the TARGET; the fixed attacker's swing reads it through its
  // `attackBonus(self, target)` hook. It lasts while the target stays in the lane
  // (it ends when the target leaves the Active slot), so it is applied with duration
  // 99, and every new stack starts the timer over.
  { id: 'fixation',      title: 'Fixation',      desc: `When Haze attacks this hero, it takes +<value> damage. Up to ${FIXATION_CAP}; it falls off when the hero leaves the Active slot.`, hvalue: -1, stack: { add: true, cap: FIXATION_CAP, duration: 'reset' }, clearOnLeaveActive: true },

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
