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

/** The ultimate icon of the hero `heroId` (the button printed on its card). */
export function ultIconSrc(heroId: string): string {
  return `${ULT_IMG_BASE}${heroId.replace(/^hero_/, '')}.webp`;
}
