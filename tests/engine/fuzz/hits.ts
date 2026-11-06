/**
 * Violation bookkeeping shared by the fuzz specs: a `Hit` is one violation with
 * the seed / step / move that produced it, a stable `signature`, and `tags`
 * naming the context (the item bought, played or used, a discount, what a play
 * consumes, a merged Rem, a hole on the bench, the turn's step…) so a KNOWN
 * allowlist entry can be as narrow as the bug it documents.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { isRespawning } from '@/engine/query';
import type { Snapshot } from './driver';
import {
  boardOf, boardUnits, boughtAtDiscountOracle, buyPriceOracle, handCardOf, handOf, isMergedRem, itemData, itemPriceOracle,
  playConsumesOracle, slottedHeroOf, slotCapOracle, wornItemOf, wornItemsOf,
} from './oracle';

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

/** Tags for an item named by a move: its id, kind and tier. */
function itemTags(cardId: string | undefined): string[] {
  const d = itemData(cardId);
  if (!d) return ['item:unknown'];
  return [`item:${d.id}`, `type:${d.type === 'spell' ? 'active' : 'passive'}`, `tier:${d.tier}`, ...(d.type === 'spell' && d.hardCC ? ['item:hard-cc'] : [])];
}

/** Context tags for a move about to be made from `snap`. */
export function moveTags(snap: Snapshot, name: string, args: unknown[]): string[] {
  const G: GameState = snap.G;
  const pid = snap.ctx.currentPlayer as PlayerID;
  const me = G.players[pid];
  const tags: string[] = [];
  const units = new Map(boardUnits(G).map((c) => [c.iid, c]));
  const find = (iid: unknown) => (typeof iid === 'string' ? units.get(iid) : undefined);
  const targetTags = (target: CardInstance | undefined) => {
    if (target && isRespawning(target)) tags.push('target:corpse');
    if (target && target.ownerId !== pid) tags.push('target:enemy');
  };

  if (name === 'buy') {
    tags.push(...itemTags(typeof args[0] === 'string' ? args[0] : undefined));
    if (typeof args[0] === 'string' && itemData(args[0]) && !(G.market ?? []).includes(args[0])) tags.push('item:off-market');
    if (itemData(args[0]) && buyPriceOracle(G, pid, args[0]) < itemPriceOracle(args[0])) tags.push('buy:discount');
    if (itemData(args[0])?.upgradesFrom) tags.push('buy:upgrade');
  } else if (name === 'playCard') {
    const card = handCardOf(G, pid, args[0]);
    tags.push(...(card ? itemTags(card.cardId) : ['card:not-in-hand']));
    if (card && boughtAtDiscountOracle(card)) tags.push('card:bought-at-discount');
    if (card && card.boughtOnTurn === undefined) tags.push('card:not-bought');
    if (card && card.boughtOnTurn !== undefined && card.boughtOnTurn !== G.turnNumber) tags.push('card:held-from-before');
    const hero = slottedHeroOf(G, pid, args[1]);
    if (!hero) tags.push('hero:unknown');
    else {
      tags.push(`hero:${hero.cardId}`);
      if (isRespawning(hero)) tags.push('hero:corpse');
      if ((hero.attached ?? []).some(isMergedRem)) tags.push('hero:rem-merged-in');
      if (card) {
        const taken = playConsumesOracle(G, pid, card, hero);
        if (taken.length) tags.push(`play:consumes-from-${!taken[0].from ? 'hand' : taken[0].from === hero ? 'hero' : 'other-hero'}`);
        if (taken.length > 1) tags.push('play:settles');
        if (wornItemsOf(hero).some((a) => a.cardId === card.cardId)) tags.push('play:duplicate');
        if (wornItemsOf(hero).length >= slotCapOracle(G, pid)) tags.push('play:full');
      }
    }
  } else if (name === 'sell' && handCardOf(G, pid, args[0])) {
    const held = handCardOf(G, pid, args[0])!;
    tags.push(...itemTags(held.cardId), 'sell:hand');
    if (held.boughtOnTurn === G.turnNumber) tags.push('item:bought-this-turn');
  } else if (name === 'sell' || name === 'moveItem' || name === 'activate') {
    const worn = wornItemOf(G, pid, args[0]);
    tags.push(...(worn ? itemTags(worn.item.cardId) : ['item:not-worn']));
    if (worn) {
      tags.push(`bearer:${worn.bearer.cardId}`, `bearer:${worn.bearer.zone}`);
      if (isRespawning(worn.bearer)) tags.push('bearer:corpse');
      if (worn.item.boughtOnTurn === G.turnNumber) tags.push('item:bought-this-turn');
      if (worn.item.replaced) tags.push('item:holds-component');
    }
    if (name === 'moveItem') {
      const to = slottedHeroOf(G, pid, args[1]);
      tags.push(to ? `to:${to.cardId}` : 'to:unknown');
      if (to && isRespawning(to)) tags.push('to:corpse');
    }
    if (name === 'activate') targetTags(find(args[1]));
  } else if (name === 'useSkill') {
    const hero = find(args[0]);
    tags.push(hero ? `hero:${hero.cardId}` : 'hero:unknown');
    targetTags(find(args[1]));
  } else if (name === 'moveHero') {
    tags.push(`from:${String(args[0])}`, `to:${String(args[1])}`);
  }
  tags.push(`step:${G.step}`);
  if (handOf(G, pid).length) tags.push('hand:holding');
  if (boardOf(me).some(isMergedRem) || boardOf(me).some((c) => (c.attached ?? []).some(isMergedRem))) tags.push('rem:merged');
  if (me.bench.some((b) => b == null)) tags.push('bench:hole');
  if (me.active && isRespawning(me.active)) tags.push('active:corpse');
  if (me.active && CARDS_BY_ID[me.active.cardId]?.type === 'hero' && (CARDS_BY_ID[me.active.cardId] as { flags?: { benchOnly?: boolean } }).flags?.benchOnly) tags.push('active:bench-only');
  return tags;
}
