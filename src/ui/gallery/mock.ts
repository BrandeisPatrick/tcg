/**
 * Stand-in board state for the Gallery: a CardInstance for a hero or a piece
 * of equipment, so the tabs can draw through the same HeroSlot and detail
 * sheet the match uses. Stats default to the printed values; nothing is
 * attached, levelled or afflicted unless a demo adds it.
 */
import type { CardInstance, HeroCard } from '@/engine/types';

export function mockHeroInstance(h: HeroCard): CardInstance {
  return {
    iid: `preview-${h.id}`,
    cardId: h.id,
    ownerId: '0',
    zone: 'active',
    hp: h.hp,
    hpMax: h.hp,
    atkMod: 0,
    spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: false,
    level: 1,
    exp: 0,
  };
}

export function mockEquipInstance(cardId: string, charges?: number): CardInstance {
  return {
    iid: `preview-eq-${cardId}`,
    cardId,
    ownerId: '0',
    zone: 'equipment',
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
    ...(charges != null ? { charges } : {}),
  };
}
