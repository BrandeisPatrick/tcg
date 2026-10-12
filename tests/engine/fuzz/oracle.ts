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

/** The skills a hero card lists, in order: one or two, none for a passive-only
 *  hero (or a card that is no hero). The first is what a bare `useSkill` names. */
export function skillIdsOf(hero: CardInstance): string[] {
  const d = CARDS_BY_ID[hero.cardId];
  return d?.type === 'hero' ? d.skills : [];
}

/** The TargetFilter that governs one of a hero's skills (`skillId`; left out,
 *  its first), or null when the hero has no such skill. */
export function filterForSkill(hero: CardInstance, skillId?: string): TargetFilter | null {
  const ids = skillIdsOf(hero);
  const id = skillId ?? ids[0];
  if (id === undefined || !ids.includes(id)) return null;
  return getAbility(id)?.target ?? null;
}

/** A skill that is never aimed at its own caster (Rem's merge), whatever its filter says. */
export function skillExcludesSelf(hero: CardInstance, skillId?: string): boolean {
  const ids = skillIdsOf(hero);
  const id = skillId ?? ids[0];
  return id !== undefined && ids.includes(id) && !!getAbility(id)?.excludeSelf;
}

/** A skill that is still cooling down: its entry in the owner's-turn timer
 *  (`cooldowns`, docs/stats-model.md §1) is above 0. Written from that rule, not
 *  from `skillBlocked`, so the probes can tell the gate it is wrong. */
export function skillCooling(hero: CardInstance, skillId: string): boolean {
  return (hero.cooldowns?.[skillId] ?? 0) > 0;
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
// Rules oracle: the basic attack. Written from the rules, not copied from
// `attackTargets` / `attackBlocked`: the attack is open when it is not Turn 1,
// not yet made this turn, and the Active is standing and has not used its skill;
// it may be aimed at the rival's living Active — or, if a passive of the hero's or
// a piece of gear it wears has `reach`, at any living enemy hero — and never at a
// hero under a Dome.
// ---------------------------------------------------------------------------

/** Does a passive of the hero's, or gear it wears, give its attack reach? */
export function carriesReach(hero: CardInstance): boolean {
  const data = CARDS_BY_ID[hero.cardId];
  const worn = (hero.attached ?? []).flatMap((a) => {
    const d = CARDS_BY_ID[a.cardId];
    return d?.type === 'equipment' ? d.abilities ?? [] : [];
  });
  const ids = [...(data?.type === 'hero' ? data.passives ?? [] : []), ...worn];
  return ids.some((id) => !!getAbility(id)?.reach);
}

/** Is the turn's attack open to `pid`'s Active at all (whoever it might aim at,
 *  and whatever the swing would deal)? */
export function attackOpenFor(G: GameState, pid: PlayerID): boolean {
  const active = G.players[pid].active;
  return G.turnNumber > 1 && !G.attackUsed && !!active && !isRespawning(active) && !active.skillUsedThisTurn;
}

/** The heroes `pid`'s Active may aim its attack at, in board order (the rival's
 *  Active, then its bench). Silent on whether the attack is open and whether the
 *  swing would deal anything: those are asked on their own. */
export function attackTargetsOracle(G: GameState, pid: PlayerID): CardInstance[] {
  const active = G.players[pid].active;
  const foe = G.players[other(pid)];
  if (!active) return [];
  const alive = boardOf(foe).filter((c) => isHeroCard(c) && !isRespawning(c));
  const reachable = carriesReach(active) ? alive : alive.filter((c) => c.iid === foe.active?.iid);
  return reachable.filter((c) => !c.statuses.some((s) => s.id === 'dome'));
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
