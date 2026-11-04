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
import { KILL_BOUNTY_BASE, RETREAT_COST, RICHEST_BOUNTY_BONUS, ULT_UNLOCK_LEVEL } from '@/engine/constants';
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

/** The TargetFilter that governs a hand card (a spell: its first ability;
 *  equipment: an own hero). An ultimate is never a card in hand. */
export function filterForHandCard(card: CardInstance): TargetFilter | 'equipment' | null {
  const d = CARDS_BY_ID[card.cardId];
  if (!d) return null;
  if (d.type === 'equipment') return 'equipment';
  if (d.type === 'spell') return getAbility(d.abilities[0])?.target ?? null;
  return null;
}

/** The kit abilities a hero may use, in order: the skills its card lists (one
 *  or two, none for a passive-only hero), its ultimate, then an ultimate it has
 *  borrowed (Sinclair's copy). The first skill (`firstSkillOf`) is what a bare
 *  `useSkill` names; every other is named. Read off the card and the instance,
 *  not the engine. */
export function skillIdsOf(hero: CardInstance): string[] {
  const d = CARDS_BY_ID[hero.cardId];
  if (d?.type !== 'hero') return [];
  const ids = [...d.skills];
  if (d.ult) ids.push(d.ult);
  if (hero.borrowedUlt && !ids.includes(hero.borrowedUlt)) ids.push(hero.borrowedUlt);
  return ids;
}

/** The skill a bare `useSkill` names: the first its card lists, if any. */
export function firstSkillOf(hero: CardInstance): string | undefined {
  const d = CARDS_BY_ID[hero.cardId];
  return d?.type === 'hero' ? d.skills[0] : undefined;
}

/** The TargetFilter that governs one of a hero's kit abilities (`skillId`;
 *  left out, its first skill), or null when the hero has no such ability. */
export function filterForSkill(hero: CardInstance, skillId?: string): TargetFilter | null {
  const ids = skillIdsOf(hero);
  const id = skillId ?? firstSkillOf(hero);
  if (id === undefined || !ids.includes(id)) return null;
  return getAbility(id)?.target ?? null;
}

/** An ability that is never aimed at its own caster (Rem's merge), whatever its filter says. */
export function skillExcludesSelf(hero: CardInstance, skillId?: string): boolean {
  const ids = skillIdsOf(hero);
  const id = skillId ?? firstSkillOf(hero);
  return id !== undefined && ids.includes(id) && !!getAbility(id)?.excludeSelf;
}

/** An ability that is still cooling down: its entry in the owner's-turn timer
 *  (`cooldowns`, docs/stats-model.md §1) is above 0. Written from that rule, not
 *  from `skillBlocked`, so the probes can tell the gate it is wrong. */
export function skillCooling(hero: CardInstance, skillId: string): boolean {
  return (hero.cooldowns?.[skillId] ?? 0) > 0;
}

/** The hero's own ultimate while it is below the unlock level: not usable. */
export function ultLocked(hero: CardInstance, skillId: string): boolean {
  const d = CARDS_BY_ID[hero.cardId];
  return d?.type === 'hero' && d.ult === skillId && (hero.level ?? 1) < ULT_UNLOCK_LEVEL;
}

/** Is `target` a legal choice for `filter`, cast by `pid` from `source`?
 *  A target must be on the board and alive (a corpse "can't be targeted"). */
export function targetLegal(
  filter: TargetFilter | 'equipment',
  target: CardInstance | undefined,
  source: CardInstance | undefined,
  pid: PlayerID,
  G?: GameState,
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
    // A bench hero who can take the front: not bench-only, not Rooted, with an
    // Active on its side to trade places with — and on your own side, an Active
    // that is alive and not Rooted itself.
    case 'allyBench': {
      const front = G?.players[pid].active;
      return ally && benchMover(target) && !!front && !isRespawning(front) && !rooted(front);
    }
    case 'enemyBench': return !ally && benchMover(target) && !!G?.players[target.ownerId].active;
    case 'anyBoard': return true;
  }
}

const rooted = (c: CardInstance) => c.statuses.some((s) => s.id === 'rooted');
function benchMover(c: CardInstance): boolean {
  const d = CARDS_BY_ID[c.cardId] as { type?: string; flags?: { benchOnly?: boolean } } | undefined;
  return c.zone === 'bench' && d?.type === 'hero' && !d.flags?.benchOnly && !rooted(c);
}

// ---------------------------------------------------------------------------
// Rules oracle: the basic attack. Written from the rules, not copied from
// `attackTargets` / `attackBlocked`: one attack a turn, so it is open when it
// is not Turn 1, the turn's attack has not been made, and the Active is
// standing (whatever abilities it used first); it may be aimed at the rival's
// living Active — or, if a passive of the hero's or a piece of gear it wears
// has `reach`, at any living enemy hero — and never at a hero under a Dome.
// ---------------------------------------------------------------------------

/** The ability ids a hero carries: its own passives, then its worn gear's. */
function carriedAbilityIds(hero: CardInstance): string[] {
  const data = CARDS_BY_ID[hero.cardId];
  const worn = (hero.attached ?? []).flatMap((a) => {
    const d = CARDS_BY_ID[a.cardId];
    return d?.type === 'equipment' ? d.abilities ?? [] : [];
  });
  return [...(data?.type === 'hero' ? data.passives ?? [] : []), ...worn];
}

/** Does a passive of the hero's, or gear it wears, give its attack reach? */
function carriesReach(hero: CardInstance): boolean {
  return carriedAbilityIds(hero).some((id) => !!getAbility(id)?.reach);
}

/** Is an attack open to `pid`'s Active at all (whoever it might aim at, and
 *  whatever the swing would deal)? */
export function attackOpenFor(G: GameState, pid: PlayerID): boolean {
  const active = G.players[pid].active;
  return G.turnNumber > 1 && !G.attackUsed && !!active && !isRespawning(active);
}

// ---------------------------------------------------------------------------
// Rules oracle: the Retreat's price. Written from the card text, not copied from
// `retreatCost`: 1 soul, a soul off for each "Retreat costs 1 less" the hero
// leaving the Active slot carries (Sprint Boots, Enduring Speed: their
// `retreatDiscount` hooks), nothing while that hero is Swift; never below 0.
// ---------------------------------------------------------------------------

/** What `pid`'s Retreat costs, by the rules. */
export function retreatCostOracle(G: GameState, pid: PlayerID): number {
  const leaving = G.players[pid].active;
  if (!leaving) return RETREAT_COST;
  if (leaving.statuses.some((s) => s.id === 'swift')) return 0;
  const off = carriedAbilityIds(leaving).reduce((n, id) => n + (getAbility(id)?.retreatDiscount?.(leaving) ?? 0), 0);
  return Math.max(0, RETREAT_COST - off);
}

// ---------------------------------------------------------------------------
// Rules oracle: what a kill pays. Written from rules.md §2, not copied from
// `killBounty`: the victim's level plus one, and two more when the victim was
// strictly the richest hero on the board — the highest list price (today the
// printed cost) of worn items among every hero of both sides; a tie pays no
// extra. Worn items survive a death, so the board after the move says it.
// ---------------------------------------------------------------------------

/** Every hero a side has: the slotted ones (corpses included) and a Rem merged into one of them. */
export function heroesOfSide(ps: PlayerState): CardInstance[] {
  const slotted = boardOf(ps).filter(isHeroCard);
  return [...slotted, ...slotted.flatMap((c) => (c.attached ?? []).filter(isHeroCard))];
}

/** The list price of what a hero wears: the printed cost of each worn item. */
export function wornWorth(hero: CardInstance): number {
  return (hero.attached ?? []).reduce((n, a) => {
    const d = CARDS_BY_ID[a.cardId];
    return n + (d?.type === 'equipment' ? d.cost ?? 0 : 0);
  }, 0);
}

/** What the fall of `hero` pays its opponent, by the rules, read on the board `G`. */
export function bountyOracle(G: GameState, hero: CardInstance): number {
  const mine = wornWorth(hero);
  const others = PIDS.flatMap((p) => heroesOfSide(G.players[p])).filter((h) => h.iid !== hero.iid);
  const richest = mine > 0 && others.every((h) => wornWorth(h) < mine);
  return (hero.level ?? 1) + KILL_BOUNTY_BASE + (richest ? RICHEST_BOUNTY_BONUS : 0);
}

/** A side's net worth by the rules: its souls plus what its heroes wear. */
export function netWorthOracle(G: GameState, pid: PlayerID): number {
  return G.players[pid].souls + heroesOfSide(G.players[pid]).reduce((n, h) => n + wornWorth(h), 0);
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

type Outcome = 'accepted' | 'rejected' | 'threw';
interface CallResult { outcome: Outcome; G: GameState; error?: unknown }

const SWALLOW_EVENTS = new Proxy({}, { get: () => () => undefined });

function cloneG(G: GameState): GameState {
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
