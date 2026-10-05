/**
 * Violation bookkeeping shared by the fuzz specs: a `Hit` is one violation with
 * the seed / step / move that produced it, a stable `signature`, and `tags`
 * naming the context (played card, merged Rem, hole on the bench…) so a KNOWN
 * allowlist entry can be as narrow as the bug it documents.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { isRespawning } from '@/engine/query';
import type { Snapshot } from './driver';
import { boardOf, boardUnits } from './oracle';

export interface Hit {
  /** `<invariant or check>@<move name>` plus `#chaos` when the move was made up by the chaos generator. */
  signature: string;
  mix: string;
  seed: number;
  step: number;
  move: string;
  args: unknown[];
  chaos: boolean;
  tags: string[];
  message: string;
}

/** One entry of a spec's allowlist: a violation known to exist today. Delete
 *  the entry once the engine is fixed. `when` narrows an entry to one cause. */
export interface Known {
  id: string;
  why: string;
  when?: (h: Hit) => boolean;
}

export const signatureOf = (check: string, move: string, chaos: boolean) => `${check}@${move}${chaos ? '#chaos' : ''}`;

export function describeHit(h: Hit): string {
  return `[${h.mix}] seed ${h.seed} step ${h.step} ${h.move}(${JSON.stringify(h.args)})${h.chaos ? ' (chaos)' : ''} -> ${h.signature} :: ${h.message}  tags=${h.tags.join(',')}`;
}

/** `*` in a Known id matches any run of characters (one entry can cover a family of signatures). */
const idMatches = (pattern: string, signature: string) =>
  pattern === signature
  || (pattern.includes('*') && new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(signature));

export function splitKnown(hits: Hit[], known: Known[]) {
  const matched = (h: Hit) => known.some((k) => idMatches(k.id, h.signature) && (!k.when || k.when(h)));
  return { unexpected: hits.filter((h) => !matched(h)), expected: hits.filter(matched) };
}

/** Group hits by signature, keeping the first example of each. */
export function summarise(hits: Hit[]): { signature: string; count: number; first: Hit }[] {
  const m = new Map<string, { signature: string; count: number; first: Hit }>();
  for (const h of hits) {
    const e = m.get(h.signature);
    if (e) e.count++;
    else m.set(h.signature, { signature: h.signature, count: 1, first: h });
  }
  return [...m.values()].sort((a, b) => a.signature.localeCompare(b.signature));
}

const isMergedRem = (c: CardInstance) => c.cardId === 'hero_rem' && c.remMergeTurnsLeft != null;

/** Context tags for a move about to be made from `snap`. */
export function moveTags(snap: Snapshot, name: string, args: unknown[]): string[] {
  const G: GameState = snap.G;
  const pid = snap.ctx.currentPlayer as PlayerID;
  const me = G.players[pid];
  const tags: string[] = [];
  const hand = new Map(me.hand.map((c) => [c.iid, c]));
  const units = new Map(boardUnits(G).map((c) => [c.iid, c]));
  const find = (iid: unknown) => (typeof iid === 'string' ? units.get(iid) : undefined);

  if (name === 'playCard') {
    const card = typeof args[0] === 'string' ? hand.get(args[0]) : undefined;
    if (card) tags.push(`card:${card.cardId}`, `type:${CARDS_BY_ID[card.cardId]?.type}`);
    else tags.push('card:unknown');
    const target = find(args[1]);
    if (target && isRespawning(target)) tags.push('target:corpse');
    if (target && target.ownerId !== pid) tags.push('target:enemy');
    if (args[2] !== undefined) {
      const bearer = target;
      const dropped = bearer?.attached?.find((a) => a.iid === args[2]);
      if (dropped && isMergedRem(dropped)) tags.push('discard:merged-rem');
    }
  } else if (name === 'useSkill') {
    const hero = find(args[0]);
    tags.push(hero ? `hero:${hero.cardId}` : 'hero:unknown');
    const target = find(args[1]);
    if (target && isRespawning(target)) tags.push('target:corpse');
    if (target && target.ownerId !== pid) tags.push('target:enemy');
  } else if (name === 'moveHero') {
    tags.push(`from:${String(args[0])}`, `to:${String(args[1])}`);
  }
  if (boardOf(me).some(isMergedRem) || boardOf(me).some((c) => (c.attached ?? []).some(isMergedRem))) tags.push('rem:merged');
  if (me.bench.some((b) => b == null)) tags.push('bench:hole');
  if (me.active && isRespawning(me.active)) tags.push('active:corpse');
  if (me.active && CARDS_BY_ID[me.active.cardId]?.type === 'hero' && (CARDS_BY_ID[me.active.cardId] as { flags?: { benchOnly?: boolean } }).flags?.benchOnly) tags.push('active:bench-only');
  return tags;
}
