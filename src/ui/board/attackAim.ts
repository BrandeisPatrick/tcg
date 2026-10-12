/**
 * The Attack plate and the attack's targeting, read off the engine. The Active's
 * attack is one swing a turn at the rival Active — unless the hero has reach
 * (`attackTargets`, legality.ts), when it may name any living enemy hero. With
 * one hero to hit, the plate attacks at once, as it always has; with more, the
 * sheet closes and the board lights the heroes the attack may name, the way a
 * skill's targeting does, and a tap on one makes the attack at it. This file only
 * decides what a tap means: who may be named, why a tap is refused and how the
 * attack is worded are all the engine's (`attackBlocked`, `attackTargets`,
 * `actionRefusal`), so the board can never offer a swing the engine would refuse.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { attackBlocked, attackTargets } from '@/engine/legality';
import { otherPlayer } from '@/engine/query';
import { forecastAttack } from '@/engine/forecast';
import type { PendingPlay } from '../helpers';
import type { AttackOffer } from '../overlays/HeroDetailSheet';
import { actionRefusal, attackBlockReason, attackLine, type Refusal } from './heroActions';

/** What the Active's sheet prints on its Attack plate: what the swing at the
 *  default target would do, or why it cannot be made (a Dome on the rival
 *  Active reads "Their Active cannot be attacked this turn"). The plate keeps to
 *  the default target — the first of `attackTargets` — whoever else the hero
 *  could name. */
export function attackOffer(G: GameState, me: PlayerID, hero: CardInstance, isMyTurn: boolean): Omit<AttackOffer, 'onAttack'> {
  const block = isMyTurn ? attackBlocked(G, me) : null;
  return {
    line: isMyTurn && block === null ? attackLine(forecastAttack(G, me)) : undefined,
    blockedReason: !isMyTurn ? 'Not your turn'
      : block ? attackBlockReason(block, hero, G.players[otherPlayer(me)].active)
      : undefined,
    made: !!hero.attackedThisTurn,
  };
}

/** What a tap on the Attack plate does. */
export type AttackPlateTap =
  /** The engine will not make the attack: say why. */
  | { do: 'refuse'; refusal: Refusal }
  /** One hero to hit: the attack goes at once, at the default target. */
  | { do: 'attack' }
  /** More than one: arm the attack, and wait for a tap on who it shoots. */
  | { do: 'choose'; pending: PendingPlay };

export function tapAttackPlate(G: GameState, me: PlayerID): AttackPlateTap {
  const refusal = actionRefusal(G, me, { type: 'attack' });
  if (refusal) return { do: 'refuse', refusal };
  const active = G.players[me].active;
  if (!active || attackTargets(G, me).length < 2) return { do: 'attack' };
  const name = CARDS_BY_ID[active.cardId]?.name ?? 'Your Active';
  return {
    do: 'choose',
    pending: {
      kind: 'attack', iid: active.iid,
      // The prompt leads the banner, so a phone's narrow plate still opens on
      // what to do; its chip says whom, and which heroes glow is the engine's.
      title: `Choose who ${name} shoots`,
      desc: '',
      filter: 'enemyHero',
    },
  };
}

/** What a tap on a hero does while the attack is armed. */
export type AttackAimTap =
  /** Not a hero the attack may name: the engine's reason, for the sticker. */
  | { do: 'refuse'; refusal: Refusal }
  /** Make the attack. `target` names who it shoots, and is left out for the
   *  default target (the first of `attackTargets`) — the bare `attack` the AI
   *  makes — so the same swing is the same move however it was chosen. */
  | { do: 'attack'; target?: string };

export function tapWhileAttackArmed(G: GameState, me: PlayerID, targetIid: string): AttackAimTap {
  const refusal = actionRefusal(G, me, { type: 'attack', targetIid });
  if (refusal) return { do: 'refuse', refusal };
  return attackTargets(G, me)[0]?.iid === targetIid ? { do: 'attack' } : { do: 'attack', target: targetIid };
}
