/**
 * Shared helpers for the fuzz harness: card enumeration, a rules oracle for
 * "is this target legal for this ability", direct (non-client) move calls on a
 * cloned state, and a structural diff. Nothing here mutates the live G — every
 * helper that runs the engine does it on a structuredClone.
 */
import { INVALID_MOVE } from 'boardgame.io/core';
import type { Ctx } from 'boardgame.io';
import type { CardInstance, GameState, PlayerID, PlayerState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { DeadlockGame } from '@/engine/game';
import { getAbility, type TargetFilter } from '@/abilities';
import { isRespawning } from '@/engine/query';

export const PIDS: PlayerID[] = ['0', '1'];
export const other = (p: PlayerID): PlayerID => (p === '0' ? '1' : '0');

export const isHeroCard = (c: CardInstance | null | undefined): boolean =>
  !!c && CARDS_BY_ID[c.cardId]?.type === 'hero';

/** Active + bench, nulls dropped (corpses included). */
export function boardOf(ps: PlayerState): CardInstance[] {
  return [ps.active, ...ps.bench].filter((c): c is CardInstance => !!c);
}

/** Every card instance anywhere in G, with a label for where it sits. */
export function everyCard(G: GameState): { card: CardInstance; place: string; pid: PlayerID }[] {
  const out: { card: CardInstance; place: string; pid: PlayerID }[] = [];
  for (const pid of PIDS) {
    const ps = G.players[pid];
    ps.hand.forEach((c) => out.push({ card: c, place: 'hand', pid }));
    ps.deck.forEach((c) => out.push({ card: c, place: 'deck', pid }));
    ps.discard.forEach((c) => out.push({ card: c, place: 'discard', pid }));
    const board: [string, CardInstance | null][] = [['active', ps.active]];
    ps.bench.forEach((b, i) => board.push([`bench${i}`, b]));
    for (const [place, c] of board) {
      if (!c) continue;
      out.push({ card: c, place, pid });
      for (const a of c.attached ?? []) {
        out.push({ card: a, place: `attached:${c.iid}`, pid });
        // A bench Rem can wear gear and carries it along when she merges.
        for (const n of a.attached ?? []) out.push({ card: n, place: `attached:${a.iid}`, pid });
      }
    }
  }
  return out;
}

export function allIids(G: GameState): string[] {
  return everyCard(G).map((x) => x.card.iid);
}

/** Cards a player could aim at: the board (corpses included), not attachments. */
export function boardUnits(G: GameState): CardInstance[] {
  return PIDS.flatMap((pid) => boardOf(G.players[pid]));
}

export function describeUnit(c: CardInstance | null | undefined): string {
  if (!c) return 'none';
  const eq = (c.attached ?? []).map((a) => a.cardId).join('+') || '-';
  const st = c.statuses.map((s) => `${s.id}:${s.value}/${s.duration}`).join(',') || '-';
  const dead = isRespawning(c) ? ` CORPSE(${c.respawnTurnsLeft})` : '';
  return `${c.cardId}#${c.iid} hp ${c.hp}/${c.hpMax} lv${c.level ?? '?'} spirit+${c.spiritMod} atk+${c.atkMod} eq[${eq}] st[${st}]${dead}`;
}

// ---------------------------------------------------------------------------
// Rules oracle: which targets are legal for an ability. Written from the
// TargetFilter doc in abilities/index.ts, NOT copied from the engine or the AI.
// ---------------------------------------------------------------------------

/** The TargetFilter that governs a hand card (spell / ultimate: its first
 *  ability; equipment: an own hero). */
export function filterForHandCard(card: CardInstance): TargetFilter | 'equipment' | null {
  const d = CARDS_BY_ID[card.cardId];
  if (!d) return null;
  if (d.type === 'equipment') return 'equipment';
  if (d.type === 'spell' || d.type === 'ultimate') return getAbility(d.abilities[0])?.target ?? null;
  return null;
}

export function filterForSkill(hero: CardInstance): TargetFilter | null {
  const d = CARDS_BY_ID[hero.cardId];
  if (d?.type !== 'hero' || !d.skill) return null;
  return getAbility(d.skill)?.target ?? null;
}

/** A skill that is never aimed at its own caster (Rem's merge), whatever its filter says. */
export function skillExcludesSelf(hero: CardInstance): boolean {
  const d = CARDS_BY_ID[hero.cardId];
  return d?.type === 'hero' && !!d.skill && !!getAbility(d.skill)?.excludeSelf;
}

/** Is `target` a legal choice for `filter`, cast by `pid` from `source`?
 *  A target must be on the board and alive (a corpse "can't be targeted"). */
export function targetLegal(
  filter: TargetFilter | 'equipment',
  target: CardInstance | undefined,
  source: CardInstance | undefined,
  pid: PlayerID,
): boolean {
  if (filter === 'noTarget') return target === undefined;
  if (!target) return false;
  if (isRespawning(target)) return false;
  const ally = target.ownerId === pid;
  const hero = isHeroCard(target);
  switch (filter) {
    case 'equipment': return ally && hero;
    case 'self': return !!source && target.iid === source.iid;
    case 'allyAny': return ally;
    case 'allyHero': return ally && hero;
    case 'enemyAny': return !ally;
    case 'enemyHero': return !ally && hero;
    case 'enemyActive': return !ally && target.zone === 'active';
    case 'anyBoard': return true;
  }
}

// ---------------------------------------------------------------------------
// Direct move calls on a clone (what heuristic.ts simulateMove does).
// ---------------------------------------------------------------------------

export type Outcome = 'accepted' | 'rejected' | 'threw';
export interface CallResult { outcome: Outcome; G: GameState; error?: unknown }

const SWALLOW_EVENTS = new Proxy({}, { get: () => () => undefined });

export function cloneG(G: GameState): GameState {
  return structuredClone(G) as GameState;
}

/** Run `DeadlockGame.moves[name]` straight on a structuredClone of G, as the
 *  AI's simulateMove and the turn-actions spec do. The clone is returned so a
 *  caller can inspect what the move did (or failed to undo). */
export function callMove(
  G: GameState,
  ctx: Ctx,
  pid: PlayerID,
  name: string,
  args: unknown[],
  /** Adjust the clone before the move runs (give souls, force a flag…). */
  prep?: (g: GameState) => void,
): CallResult {
  const g = cloneG(G);
  prep?.(g);
  const fn = (DeadlockGame.moves as Record<string, any>)[name];
  if (!fn) return { outcome: 'rejected', G: g };
  try {
    const r = fn({ G: g, ctx, playerID: pid, events: SWALLOW_EVENTS, random: {} }, ...args);
    return { outcome: r === INVALID_MOVE ? 'rejected' : 'accepted', G: g };
  } catch (error) {
    return { outcome: 'threw', G: g, error };
  }
}

// ---------------------------------------------------------------------------
// Structural diff (undefined == missing, like JSON), returns differing paths.
// ---------------------------------------------------------------------------

export function diffPaths(a: unknown, b: unknown, limit = 20): string[] {
  const out: string[] = [];
  const walk = (x: any, y: any, path: string) => {
    if (out.length >= limit) return;
    if (x === y) return;
    const xo = x !== null && typeof x === 'object';
    const yo = y !== null && typeof y === 'object';
    if (!xo || !yo) {
      if (!(Number.isNaN(x) && Number.isNaN(y))) out.push(`${path}: ${JSON.stringify(x)} != ${JSON.stringify(y)}`);
      return;
    }
    if (Array.isArray(x) !== Array.isArray(y)) { out.push(`${path}: array/object mismatch`); return; }
    if (Array.isArray(x)) {
      if (x.length !== y.length) { out.push(`${path}.length: ${x.length} != ${y.length}`); }
      const n = Math.max(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], `${path}[${i}]`);
      return;
    }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) walk(x[k], y[k], path ? `${path}.${k}` : k);
  };
  walk(a, b, '');
  return out;
}

// ---------------------------------------------------------------------------
// Misc spec helpers.
// ---------------------------------------------------------------------------

/** Number of games a spec plays per policy mix (FUZZ_GAMES overrides). */
export function fuzzGames(fallback: number): number {
  const n = Number(process.env.FUZZ_GAMES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** A readable block for a failed expectation. */
export function formatList(title: string, lines: string[], max = 25): string {
  const shown = lines.slice(0, max);
  const more = lines.length > max ? `\n  … and ${lines.length - max} more` : '';
  return `${title} (${lines.length}):\n  ${shown.join('\n  ')}${more}`;
}
