/**
 * The one dispatcher for what cards do on their own. A hero carries abilities
 * from two places — its own passives and the equipment it wears — and several
 * engine moments ask "does anything here react?": a hit landing, a status
 * sticking, a skill resolving, a swing following through, a turn starting.
 * Every one asks here, so a card's reaction is found, ordered and run the same
 * way each time (`abilitySources` gives the order: passives, then worn
 * equipment in worn order).
 *
 * The moments differ in two ways, and `Firing` names both:
 *  - `reaction`: the engine is reacting to something that just happened (a
 *    hit, a status, a cast), from inside that effect. Only worn equipment
 *    reacts that way, and each ability runs in a 'proc' cast frame so what it
 *    does (a Mystic Burst hit, a Reverb) is attributed to the bearer and cannot
 *    set off another reaction — it would recurse.
 *  - `only`: a moment may ask just the hero's passives or just its equipment.
 *    The swing's equipment procs fire inside the damage (the HP is already
 *    off); its passives fire after the damage call returns, with how much got
 *    through. Each is a separate moment, so each asks for its own half.
 *
 * Optional triggers ("you may", `optional` on the ability) are found here too
 * but never run here: they are handed to the trigger prompt system
 * (prompts.ts), which asks their player whether to use them and pauses the
 * moment until it is answered. `fireTriggers` says so by returning true.
 */
import type { CardInstance, GameState, PlayerID } from './types';
import type { AbilityDef } from '@/abilities';
import { abilitySources } from './query';
import { withCast } from './castContext';
import { offerTriggers, type MomentDetails } from './prompts';

export type Trigger = AbilityDef['trigger'];

interface Firing {
  /** Whose turn the engine is working in — the abilities' `ctx.movingPlayer`.
   *  Defaults to the bearer's owner, which is who it is in every real case. */
  movingPlayer?: PlayerID;
  /** The other unit involved: the one struck, the one that inflicted the CC. */
  target?: CardInstance;
  /** Damage dealt, for procs that scale off it (Mystic Reverb's echo). */
  amount?: number;
  /** Extra parameters for the abilities. A swing's passives get `primary`
   *  (a passive that fires on the main swing only) and `dealt` (how much the
   *  swing got through); a Ricochet bounce's get `bounce` instead of `primary`, and so does
   *  the gear that reacts to it (a heal or a chain sits a bounce out). Worn
   *  equipment also gets itself as `equip` and `amount`. */
  params?: Record<string, unknown>;
  /** Fire as a reaction: worn equipment only, each ability in a 'proc' frame. */
  reaction?: boolean;
  /** Ask only the hero's passives, or only its worn equipment. */
  only?: 'passives' | 'equipment';
  /** What a prompt opened at this moment carries (a fall that pays nothing). */
  prompt?: MomentDetails;
}

/** Run every ability on `bearer` that listens for `trigger`, and ask its
 *  player about the optional ones it can use (prompts.ts). Returns true when a
 *  prompt is now owed: the moment's outcome waits on the answer. The Mid-Boss
 *  (owned by nobody) carries none. */
export function fireTriggers(G: GameState, bearer: CardInstance, trigger: Trigger, firing: Firing = {}): boolean {
  if (bearer.ownerId === 'none') return false;
  const { target, amount, params, reaction } = firing;
  const only = reaction ? 'equipment' : firing.only;
  const ctx = { movingPlayer: firing.movingPlayer ?? bearer.ownerId };
  // abilitySources builds a fresh list, so a proc that detaches its own item
  // (a spent cooldown→draw piece) cannot make this loop skip a sibling.
  for (const { ability, equip } of abilitySources(bearer)) {
    if (ability.trigger !== trigger || ability.optional) continue;
    if (only === 'passives' && equip) continue;
    if (only === 'equipment' && !equip) continue;
    const run = () => ability.run(G, ctx, { source: bearer, target, params: { ...params, equip, amount } });
    if (reaction) withCast(bearer, 'proc', run);
    else run();
  }
  // The "may"s are asked, not run — never as a reaction inside another effect.
  return !reaction && only === undefined && offerTriggers(G, bearer, trigger, firing.prompt);
}
