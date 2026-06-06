import type { CardId } from '@/engine/types';
import type { StoryNode, NodeKind, StoryRun } from './types';
import type { StorySetup } from '@/storage/matchConfig';
import { HEROES, SPELLS, EQUIPMENT } from '@/cards';

// ---- seeded PRNG (mulberry32) ------------------------------------------------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Fisher-Yates with a seeded rng; returns a new array. */
export function shuffled<T>(arr: T[], r: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function pickN<T>(arr: T[], n: number, r: () => number): T[] {
  return shuffled(arr, r).slice(0, n);
}

// ---- content pools -----------------------------------------------------------
export const ALL_HERO_IDS: CardId[] = HEROES.map((h) => h.id);
/** Buyable / collectible cards that can join a deck (spells + equipment). */
export const SUPPLY_POOL: CardId[] = [...SPELLS, ...EQUIPMENT].map((c) => c.id);

/** Three random heroes offered at the start of a run (re-rolled each run). */
export function randomStartingHeroes(): CardId[] {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  return pickN(ALL_HERO_IDS, 3, rng(seed));
}

/** Small opening deck; grows as the player clears supply nodes. */
export const STARTING_DECK: CardId[] = [
  'healing_rite', 'rusted_barrel', 'extra_health',
  'extended_magazine', 'cold_front', 'restorative_shot',
];

// ---- opponent scaling --------------------------------------------------------
/** How many heroes the opponent fields at a node (grows with depth / kind). */
export function enemyRosterSize(depth: number, kind: NodeKind): number {
  if (kind === 'boss') return 4;
  if (depth <= 0) return 1;       // the opening 1v1
  if (depth <= 2) return 2;
  if (depth <= 4) return 3;
  return 4;
}
/** Flat stat buff applied to EVERY enemy hero at a node. */
export function enemyBuff(depth: number, kind: NodeKind): { atk: number; hp: number } {
  let atk = Math.floor(depth / 2);
  let hp = depth;
  if (kind === 'elite') { atk += 1; hp += 2; }
  if (kind === 'boss') { atk += 2; hp += 4; }
  return { atk, hp };
}
/** Enemy deck size — more cards (more itemization / spells) the deeper you go. */
export function enemyDeckSize(depth: number, kind: NodeKind): number {
  let n = 4 + depth;
  if (kind === 'elite') n += 2;
  if (kind === 'boss') n += 4;
  return Math.min(n, 16);
}
/** Battle patron HP scales with depth: quick early skirmishes (a 1v1 opener
 *  shouldn't grind), epic late fights. Both sides share the value so the duel
 *  stays symmetric. */
export function patronHpForDepth(depth: number): number {
  return Math.min(8, 2 + depth);
}

// ---- choice generation -------------------------------------------------------
/** Three heroes the player can recruit at a recruit node (none already owned). */
export function recruitChoices(run: StoryRun, node: StoryNode): CardId[] {
  const r = rng(run.seed ^ hashStr(node.id) ^ 0x5eed);
  const pool = ALL_HERO_IDS.filter((id) => !run.heroes.includes(id));
  return pickN(pool, 3, r);
}
/** Three cards the player can add to their deck at a supply node. */
export function supplyChoices(run: StoryRun, node: StoryNode): CardId[] {
  const r = rng(run.seed ^ hashStr(node.id) ^ 0xca5d);
  return pickN(SUPPLY_POOL, 3, r);
}

// ---- battle setup ------------------------------------------------------------
/** Build the StorySetup payload for a battle node (player roster/deck vs a
 *  scaled, deterministically-generated opponent). */
export function buildStoryMatch(run: StoryRun, node: StoryNode): StorySetup {
  const r = rng(run.seed ^ hashStr(node.id) ^ 0xb47713);
  const size = enemyRosterSize(node.depth, node.kind);
  // Themed location: the named hero leads the enemy roster; fill the rest.
  const enemyHeroes = node.enemy
    ? [node.enemy, ...pickN(ALL_HERO_IDS.filter((id) => id !== node.enemy), size - 1, r)]
    : pickN(ALL_HERO_IDS, size, r);
  const deckSize = enemyDeckSize(node.depth, node.kind);
  const enemyDeck: CardId[] = [];
  for (let i = 0; i < deckSize; i++) enemyDeck.push(SUPPLY_POOL[Math.floor(r() * SUPPLY_POOL.length)]);
  return {
    playerHeroes: run.heroes,
    playerDeck: run.deck.length ? run.deck : [...STARTING_DECK],
    enemyHeroes,
    enemyDeck,
    enemyBuff: enemyBuff(node.depth, node.kind),
    patronHp: patronHpForDepth(node.depth),
  };
}

export function nodeLabel(kind: NodeKind): string {
  switch (kind) {
    case 'battle': return 'Skirmish';
    case 'elite': return 'Enforcer';
    case 'recruit': return 'Recruit';
    case 'supply': return 'Supply Cache';
    case 'boss': return 'Patron';
  }
}
