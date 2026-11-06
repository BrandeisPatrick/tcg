/**
 * Card instances, and items going on and off heroes. Shared by the opening
 * (actions/setup.ts) and the shop (actions/shop.ts), and kept in a leaf of its
 * own so neither imports the other.
 */
import type { CardInstance, PlayerID } from './types';
import { getCard, itemCard } from '@/cards';
import type { IidAllocator } from './ids';
import { hasSpike } from './query';

/** A fresh card of `cardId`, named by `ids` (see ids.ts). */
export function makeInstance(ids: IidAllocator, cardId: string, ownerId: PlayerID, zone: CardInstance['zone'], slot?: 0|1|2|3): CardInstance {
  const data = getCard(cardId);
  const hp = data.type === 'hero' ? data.hp : 0;
  const isHero = data.type === 'hero';
  return {
    iid: ids(),
    cardId,
    ownerId,
    zone,
    slot,
    attachedTo: undefined,
    attached: [],
    hp,
    hpMax: hp,
    atkMod: 0,
    spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: false,
    // Hero leveling: start at Lv1 with 0 exp.
    ...(isHero ? { exp: 0, level: 1 as const } : {}),
  };
}

/**
 * Put `item` on `hero`: it joins the hero's worn items and its printed stat
 * bonus (attack, spirit, max HP — current HP rises with it) goes onto the
 * hero's modifiers. The item's own state (a cooldown, charges) comes with it.
 * The caller syncs the Vitality spike (`syncVitalitySpike`) once the hero's
 * items are settled.
 */
export function attachItem(hero: CardInstance, item: CardInstance): void {
  item.zone = 'equipment';
  item.attachedTo = hero.iid;
  item.slot = undefined;
  (hero.attached ??= []).push(item);
  const data = itemCard(item.cardId);
  const bonus = data?.type === 'equipment' ? data.bonus : undefined;
  if (!bonus) return;
  hero.atkMod += bonus.atk ?? 0;
  hero.spiritMod += bonus.spirit ?? 0;
  if (bonus.hp) {
    hero.hpMax = Math.max(1, hero.hpMax + bonus.hp);
    // A corpse stays at 0; it comes back at its full max HP.
    if (hero.hp > 0) hero.hp = Math.max(1, Math.min(hero.hpMax, hero.hp + bonus.hp));
  }
}

/**
 * Take a worn item off its bearer, and take back what it gave: its printed
 * stat bonus leaves with it, and HP the bearer no longer has room for goes too.
 * The item keeps its own state (a cooldown, charges) for wherever it goes next.
 * The caller syncs the Vitality spike.
 */
export function detachItem(hero: CardInstance, item: CardInstance): void {
  hero.attached = (hero.attached ?? []).filter((a) => a.iid !== item.iid);
  item.attachedTo = undefined;
  const data = itemCard(item.cardId);
  const bonus = data?.type === 'equipment' ? data.bonus : undefined;
  if (!bonus) return;
  hero.atkMod -= bonus.atk ?? 0;
  hero.spiritMod -= bonus.spirit ?? 0;
  if (bonus.hp) {
    hero.hpMax = Math.max(1, hero.hpMax - bonus.hp);
    if (hero.hp > hero.hpMax) hero.hp = hero.hpMax;
  }
}

/**
 * The Vitality category spike, kept true to what `hero` wears: with 3+
 * Vitality items it has +1 max HP (and +1 current HP as the spike arrives);
 * when the spike is lost the point comes off and current HP is clamped to the
 * new max. Call after every change to a hero's items. (The Weapon and Spirit
 * spikes need nothing stored: `attackPower` and `effectiveSpirit` read them.)
 */
export function syncVitalitySpike(hero: CardInstance): void {
  const want = hasSpike(hero, 'vitality');
  if (want && !hero.vitalitySpike) {
    hero.vitalitySpike = true;
    hero.hpMax += 1;
    if (hero.hp > 0) hero.hp += 1;
  } else if (!want && hero.vitalitySpike) {
    hero.vitalitySpike = undefined;
    hero.hpMax = Math.max(1, hero.hpMax - 1);
    if (hero.hp > hero.hpMax) hero.hp = hero.hpMax;
  }
}
