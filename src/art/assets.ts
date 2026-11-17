/**
 * Where the game is served from, and where its pictures live under it. Every
 * path starts from Vite's BASE_URL, so it resolves under "/" in local dev and
 * under the GitHub Pages path in the production build.
 */
export const BASE = import.meta.env.BASE_URL ?? '/';
/** Posters, wordmarks and paper (public/art). */
export const ART_BASE = `${BASE}art/`;
/** Hero card art, splashes and medallions (public/heroes). */
export const HERO_IMG_BASE = `${BASE}heroes/`;
/** Equipment art (public/items). */
export const ITEM_IMG_BASE = `${BASE}items/`;
/** Spell art (public/spells). */
export const SPELL_IMG_BASE = `${BASE}spells/`;
/** The heroes' ultimate icons (public/ult): each hero's own Deadlock ultimate
 *  icon, the deadlock-api's `signature4` ability image, named by the hero id
 *  without its `hero_` prefix (`hero_mo_krill` → `mo_krill.webp`). */
export const ULT_IMG_BASE = `${BASE}ult/`;

/** The heroes' skill icons (public/skill): the game's own icon of the Deadlock
 *  ability each hero's one skill or passive is named for (Willpower, Fixation,
 *  Grasping Hands…), the deadlock-api's ability image, named as the ultimates'
 *  are (`hero_mo_krill` → `mo_krill.webp`). */
export const SKILL_IMG_BASE = `${BASE}skill/`;

/** The kit abilities that wear an icon of their own, not their hero's: Lash,
 *  the one hero with a skill and a passive (2026-11-17), whose Grapple wears
 *  Deadlock's Grapple icon (`lash_grapple.webp`) beside Ground Strike's. */
const OWN_SKILL_ICON: Record<string, string> = { skill_lash: 'lash_grapple' };

/** The icon of the hero `heroId`'s own skill or passive (Patrick, 2026-11-16:
 *  the in-game icon, not a generic sword, flame or shield); `abilityId` names
 *  the row when the hero has two (`OWN_SKILL_ICON`). */
export function skillIconSrc(heroId: string, abilityId?: string): string {
  const own = abilityId ? OWN_SKILL_ICON[abilityId] : undefined;
  return `${SKILL_IMG_BASE}${own ?? heroId.replace(/^hero_/, '')}.webp`;
}

/** The Attack row's icon (Patrick, 2026-11-16: "Attack needs a better icon
 *  image"): Deadlock's own weapon-damage icon, the deadlock-api's
 *  `images/abilities/weapon_damage.webp` (the icon every hero's weapon item
 *  carries), white bullets in the skills' style. */
export const ATTACK_ICON_SRC = `${BASE}hud/weapon_damage.webp`;

/** The ultimate icon of the hero `heroId` (the button printed on its card). */
export function ultIconSrc(heroId: string): string {
  return `${ULT_IMG_BASE}${heroId.replace(/^hero_/, '')}.webp`;
}
