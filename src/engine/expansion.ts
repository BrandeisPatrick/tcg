/**
 * Mystic Expansion and Greater Expansion (Patrick, 2026-11-16): Deadlock's
 * items that widen an ability's range and radius. On the board the radius is
 * the board itself, so positioning is part of it:
 *
 * - Mystic Expansion (Spirit T1): when the bearer's skill deals damage to one
 *   enemy, each enemy next to it on the board takes 1 spirit damage.
 * - Greater Expansion (Spirit T3, built from it): every other enemy takes the
 *   same damage.
 *
 * "Next to" is the board as it is drawn: a side's three bench slots in a row
 * (slot 0, 1, 2 in the sheet's three columns), and its Active in the lane right
 * under or over one of them — the human seat's Active in the right column
 * (under its bench slot 2), the other seat's in the left (over its slot 0).
 * A hero's neighbours are the slots touching it: the bench slot beside it in
 * its row, and the Active and the bench slot in its column.
 *
 * Only a skill (not an ultimate, a spell or an item's proc) is widened, and
 * only one that dealt damage to exactly one enemy.
 */
import type { CardInstance, GameState, HitFx, PlayerID } from './types';
import { damageUnit } from './damage';
import { withCast } from './castContext';
import { isRespawning, otherPlayer, wornItems } from './query';

/** The lane column a side's Active stands in: under the human seat's bench
 *  slot 2, over the other seat's slot 0 (BoardTable's three columns). */
export function activeColumn(G: Pick<GameState, 'humanSeat'>, pid: PlayerID): 0 | 2 {
  return pid === (G.humanSeat ?? '0') ? 2 : 0;
}

/** The heroes next to `card` on its side's board (standing or not). */
export function boardNeighbours(G: GameState, pid: PlayerID, card: CardInstance): CardInstance[] {
  const ps = G.players[pid];
  const col = activeColumn(G, pid);
  const out: (CardInstance | null | undefined)[] = [];
  if (ps.active?.iid === card.iid) out.push(ps.bench[col]);
  else {
    const i = ps.bench.findIndex((b) => b?.iid === card.iid);
    if (i < 0) return [];
    out.push(ps.bench[i - 1], ps.bench[i + 1]);
    if (i === col) out.push(ps.active);
  }
  return out.filter((c): c is CardInstance => !!c);
}

const standing = (c: CardInstance) => c.hp > 0 && !isRespawning(c);

/** After `hero`'s skill (its effects from `G.fx[fx0]` on): widen a one-enemy
 *  hit by the Expansion item the hero wears. */
export function expandSkillHit(G: GameState, pid: PlayerID, hero: CardInstance, fx0: number): void {
  const items = wornItems(hero).map((it) => it.cardId);
  const greater = items.includes('greater_expansion');
  const mystic = items.includes('mystic_expansion');
  if (!greater && !mystic) return;
  const enemyPid = otherPlayer(pid);
  const enemy = G.players[enemyPid];
  const onBoard = new Map([enemy.active, ...enemy.bench].filter((c): c is CardInstance => !!c).map((c) => [c.iid, c]));
  const hits = G.fx.slice(fx0).filter((e): e is HitFx =>
    e.kind === 'hit' && e.cast === 'skill' && e.source?.iid === hero.iid && e.amount > 0 && onBoard.has(e.iid));
  const struck = new Set(hits.map((h) => h.iid));
  if (struck.size !== 1) return;
  const [targetIid] = struck;
  const target = onBoard.get(targetIid)!;
  const dealt = hits.reduce((n, h) => n + h.amount, 0);
  const type = hits[0].type === 'attack' ? 'attack' : 'spirit';
  withCast(hero, 'proc', () => {
    if (greater) {
      for (const c of onBoard.values()) if (c !== target && standing(c)) damageUnit(G, c, dealt, type, 'Greater Expansion');
    } else {
      for (const c of boardNeighbours(G, enemyPid, target)) if (standing(c)) damageUnit(G, c, 1, 'spirit', 'Mystic Expansion');
    }
  });
}
