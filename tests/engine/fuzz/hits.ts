/**
 * Violation bookkeeping shared by the fuzz specs: a `Hit` is one violation with
 * the seed / step / move that produced it, a stable `signature`, and `tags`
 * naming the context (the card played or used, an evolving upgrade, a hero from
 * the hand, a choice owed, a merged Rem, a hole on the bench…) so a KNOWN
 * allowlist entry can be as narrow as the bug it documents.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { isRespawning } from '@/engine/query';
import type { Snapshot } from './driver';
import {
  boardOf, boardUnits, deckOf, handCardOf, handOf, isHeroCard, isMergedRem, itemData, slottedHeroOf, slotCapOracle, upgradeComponentOracle,
  upgradesOfOracle, wornItemOf, wornItemsOf,
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

  if (name === 'playCard') {
    const card = handCardOf(G, pid, args[0]);
    tags.push(...(card ? (isHeroCard(card) ? ['card:hero'] : itemTags(card.cardId)) : ['card:not-in-hand']));
    if (card && upgradesOfOracle(card.cardId).length > 1) tags.push('play:upgrade-choice');
    if (card && upgradesOfOracle(card.cardId).length === 1) tags.push('play:makes-upgrade');
    if (args[2] !== undefined) tags.push('play:names-upgrade');
    const hero = slottedHeroOf(G, pid, args[1]);
    if (!hero) tags.push('hero:unknown');
    else {
      tags.push(`hero:${hero.cardId}`);
      if (isRespawning(hero)) tags.push('hero:corpse');
      if ((hero.attached ?? []).some(isMergedRem)) tags.push('hero:rem-merged-in');
      if (card) {
        if (upgradeComponentOracle(hero, card.cardId)) tags.push('play:evolves');
        if (wornItemsOf(hero).some((a) => a.cardId === card.cardId)) tags.push('play:duplicate');
        if (wornItemsOf(hero).length >= slotCapOracle(G, pid)) tags.push('play:full');
      }
    }
  } else if (name === 'placeHero' || name === 'chooseActive') {
    const owner = name === 'chooseActive' ? G.pendingActive ?? pid : pid;
    const card = name === 'chooseActive' ? deckOf(G, owner).find((c) => c.iid === args[0]) : handCardOf(G, owner, args[0]);
    tags.push(card ? `card:${card.cardId}` : name === 'chooseActive' ? 'card:not-in-deck' : 'card:not-in-hand', args[1] === true ? 'place:lane' : args[2] === undefined ? 'place:bench' : 'place:slot');
    if (!me.active) tags.push('active:empty');
  } else if (name === 'discard') {
    tags.push(`discard:owed-${G.pendingDiscard?.count ?? 0}`);
  } else if (name === 'activate') {
    const worn = wornItemOf(G, pid, args[0]);
    tags.push(...(worn ? itemTags(worn.item.cardId) : ['item:not-worn']));
    if (worn) {
      tags.push(`bearer:${worn.bearer.cardId}`, `bearer:${worn.bearer.zone}`);
      if (isRespawning(worn.bearer)) tags.push('bearer:corpse');
    }
    targetTags(find(args[1]));
  } else if (name === 'useSkill') {
    const hero = find(args[0]);
    tags.push(hero ? `hero:${hero.cardId}` : 'hero:unknown');
    targetTags(find(args[1]));
  } else if (name === 'moveHero') {
    tags.push(`from:${String(args[0])}`, `to:${String(args[1])}`);
  }
  if (G.pendingActive) tags.push('owed:first-active');
  if (G.pendingDiscard) tags.push('owed:discard');
  if (G.pendingPromotion) tags.push('owed:promotion');
  if (G.triggers?.length) tags.push('owed:trigger');
  if (handOf(G, pid).length) tags.push('hand:holding');
  if (handOf(G, pid).some(isHeroCard)) tags.push('hand:hero');
  if (boardOf(me).some(isMergedRem) || boardOf(me).some((c) => (c.attached ?? []).some(isMergedRem))) tags.push('rem:merged');
  if (me.bench.some((b) => b == null)) tags.push('bench:hole');
  if (me.active && isRespawning(me.active)) tags.push('active:corpse');
  if (me.active && CARDS_BY_ID[me.active.cardId]?.type === 'hero' && (CARDS_BY_ID[me.active.cardId] as { flags?: { benchOnly?: boolean } }).flags?.benchOnly) tags.push('active:bench-only');
  return tags;
}
