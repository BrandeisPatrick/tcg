/**
 * Engine-side dispatcher for equipment reactive triggers.
 *
 * Why this exists: `damage.ts` and `statusOps.ts` need to fire equipment
 * effects when a hero's skill damages a target / the hero is CC'd / etc.
 * But the equipment effect logic lives in `abilities/index.ts`, which
 * itself imports `damage.ts` (damageUnit) and `statusOps.ts` (addStatus).
 *
 * To avoid a circular import, abilities/index.ts registers a handler here
 * at module-load time. The engine modules call `fireEquipmentTriggers`
 * synchronously, which dispatches via the registered handler.
 */
import type { CardInstance, GameState, PlayerID } from './types';

export type EquipmentTriggerKind =
  | 'onBearerSkillDamage'    // bearer's skill (or spell/ult routed through) dealt damage to target
  | 'onBearerCCSuffered'     // bearer just gained Stun/Silence/Disarm/Sleep
  | 'onBearerSkillUsed'      // bearer used their skill (after the skill resolved)
  | 'onBearerUltCast'        // bearer (the linked hero of the ult) cast their ultimate
  | 'onAttack'               // bearer just attacked target with a basic attack
  | 'onBearerDamagedByBullet' // bearer just took bullet damage
  | 'onBearerDamagedBySpirit'; // bearer just took spirit damage

type Handler = (
  G: GameState,
  bearer: CardInstance,
  kind: EquipmentTriggerKind,
  ctx: { movingPlayer: PlayerID },
  target?: CardInstance,
) => void;

let handler: Handler | null = null;

export function setEquipmentDispatcher(h: Handler) { handler = h; }

export function fireEquipmentTriggers(
  G: GameState,
  bearer: CardInstance | null | undefined,
  kind: EquipmentTriggerKind,
  ctx: { movingPlayer: PlayerID },
  target?: CardInstance,
) {
  if (handler && bearer) handler(G, bearer, kind, ctx, target);
}
