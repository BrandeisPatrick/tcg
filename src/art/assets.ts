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
