/**
 * Legality probes: at a decision point of a live game, ask the engine (through
 * direct move calls on clones) whether it agrees with the other sources of
 * "what may I do" — the AI's legal-move list, the UI's `skillBlocked`, the
 * engine's own `legalActions`, and an independent rules oracle (oracle.ts) for
 * targets, items, the shop, hero moves and who the attack may name.
 *
 * A probe move the engine accepts is also held to the transition rules and the
 * state invariants (invariants.ts) — so a sale or a move of an item, or a card
 * played onto a hero the AI would not pick, which the AI's rule-based shop never
 * makes, is checked as closely as a live move.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import type { Ctx } from 'boardgame.io';
import { CARDS_BY_ID, ITEMS } from '@/cards';
import { enumerateAIMoves } from '@/ai/heuristic';
import { legalActions, skillBlocked } from '@/engine/legality';
import { attackPower, checkWinner, isRespawning, liveBoardCards, otherPlayer } from '@/engine/query';
import type { TargetFilter } from '@/abilities';
import type { Snapshot, StepInfo } from './driver';
import { chaosMove } from './driver';
import { moveTags, signatureOf, type Hit } from './hits';
import { collectInvariantViolations, collectTransitionViolations } from './invariants';
import {
  activateBlockedOracle, activateTargetsOracle, attackOpenFor, attackTargetsOracle, boardOf, boardUnits, buyBlockedOracle,
  buyPriceOracle, callMove, closeShopBlockedOracle, diffPaths, filterForItem, filterForSkill, firstSkillOf, handOf, isMergedRem,
  itemData, moveItemBlockedOracle, playBlockedOracle, retreatCostOracle, seatOnTurn, sellBlockedOracle, skillCooling,
  skillExcludesSelf, skillIdsOf, targetLegal, ultLocked, wornItemsOf,
} from './oracle';

export interface ProbeOpts {
  /** Chaos moves tried per decision point for the validate-before-mutate check. */
  chaosPerStep: number;
  /** (source x target) combinations — skills and worn items — tried per decision point of the act step. */
  targetCombos: number;
  /** Chance that a decision point also gets the full moveHero sweep. */
  moveHeroSweep: number;
  /** Purchases tried per decision point of the shop step (sales and moves: a third as many). */
  shopCombos: number;
  /** (card x hero) plays tried per decision point, in either step. */
  playCombos: number;
}

export const DEFAULT_PROBE: ProbeOpts = { chaosPerStep: 3, targetCombos: 8, moveHeroSweep: 0.2, shopCombos: 6, playCombos: 4 };

const pickOne = <T,>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)];
const isBenchOnly = (c: CardInstance) => !!(CARDS_BY_ID[c.cardId] as { flags?: { benchOnly?: boolean } }).flags?.benchOnly;
const isRooted = (c: CardInstance) => c.statuses.some((s) => s.id === 'rooted');

/** The shop's moves, and the act step's. (A card played from the hand is either step's.) */
const SHOP_TYPES = new Set(['buy', 'sell', 'moveItem', 'closeShop']);
const ACT_TYPES = new Set(['attack', 'useSkill', 'activate', 'moveHero']);

type Ghost = 'ghost';

function why(filter: TargetFilter, tgt: CardInstance | undefined | Ghost, pid: PlayerID): string {
  if (tgt === undefined) return 'missing-target';
  if (tgt === 'ghost') return 'unknown-iid';
  if (isRespawning(tgt)) return 'corpse';
  const ally = tgt.ownerId === pid;
  const hero = CARDS_BY_ID[tgt.cardId]?.type === 'hero';
  switch (filter) {
    case 'self': return 'not-self';
    case 'allyAny': return 'wrong-side';
    case 'allyHero': return !ally ? 'wrong-side' : !hero ? 'not-hero' : 'other';
    case 'enemyAny': return 'wrong-side';
    case 'enemyHero': return ally ? 'wrong-side' : !hero ? 'not-hero' : 'other';
    case 'enemyActive': return ally ? 'wrong-side' : 'wrong-zone';
    default: return 'other';
  }
}

/** `G` with `pid` holding `souls`: a shallow copy for the oracles and the transition rules
 *  (callMove gives the engine its own clone with the same souls). */
function withSouls(G: GameState, pid: PlayerID, souls: number): GameState {
  if (G.players[pid].souls === souls) return G;
  return { ...G, players: { ...G.players, [pid]: { ...G.players[pid], souls } } } as GameState;
}

export function probeLegality(
  snap: Snapshot,
  info: StepInfo,
  rnd: () => number,
  hits: Hit[],
  mix: string,
  opts: ProbeOpts = DEFAULT_PROBE,
) {
  const { G, ctx } = snap;
  if (G.draft || ctx.gameover) return;
  const pid = ctx.currentPlayer as PlayerID;
  const foe = otherPlayer(pid);
  const me = G.players[pid];

  const add = (check: string, move: string, args: unknown[], message: string, extraTags: string[] = []) => {
    hits.push({
      signature: signatureOf(check, move, false),
      mix, seed: info.seed, step: info.step, move, args, chaos: false,
      tags: [...moveTags(snap, move, args), ...extraTags], message,
    });
  };

  // A probe move the engine accepted: held to the transition rules, and to every state
  // invariant the position did not already break (the live run reports those).
  let standing: Set<string> | undefined;
  const checkAccepted = (before: GameState, after: GameState, name: string, args: unknown[]) => {
    standing ??= new Set(collectInvariantViolations(G, ctx).map((v) => v.key));
    // A move made on a clone runs no `endIf`: one that ends the match is judged as the client
    // would see it, game over (a patron at 0 is then no breach).
    const over = checkWinner(after);
    const ctxAfter = over ? ({ ...ctx, gameover: over } as Ctx) : ctx;
    const vs = [
      ...collectTransitionViolations({ G: before, ctx }, { G: after, ctx: ctxAfter }, { name, args }, true),
      ...collectInvariantViolations(after, ctxAfter).filter((v) => !standing!.has(v.key)),
    ];
    for (const v of vs) add(`probe:${v.id}`, name, args, `${name}(${JSON.stringify(args)}) on a clone: ${v.message}`);
  };
  /** A probe the engine refused: it must leave the state as it was. */
  const checkRefused = (before: GameState, after: GameState, name: string, args: unknown[]) => {
    const d = diffPaths(before, after, 4);
    if (d.length) add('rejected-move-mutates', name, args, `${name}(${JSON.stringify(args)}) was rejected but changed the state: ${d.join(' ; ')}`);
  };

  // ---------------------------------------------------------------- A: the AI's list
  for (const o of enumerateAIMoves(G, ctx, false)) {
    const r = callMove(G, ctx, pid, o.move, o.args);
    if (r.outcome !== 'accepted') {
      add('ai-move-rejected', o.move, o.args, `enumerateAIMoves offered ${o.move}(${JSON.stringify(o.args)}) and the engine ${r.outcome} it${r.error ? `: ${String(r.error).slice(0, 120)}` : ''}`);
    }
  }

  // While a promotion is owed the engine refuses everything else (section F); the rest of
  // the probes ask about moves in an ordinary position. The shop step takes the shop's moves
  // only (section H); abilities, items, Retreats and the attack belong to the act step. Once
  // the turn's attack is made the Act is over and only ending the turn is left: B and E check
  // that refusal, D skips it.
  const owed = G.pendingPromotion !== undefined;
  const actOver = G.attackUsed;
  const shop = G.step === 'shop';

  // ---------------------------------------------------------------- B: skillBlocked <=> useSkill
  // Each kit ability of each hero on its own (its skills, its ultimate, a borrowed ultimate).
  // The move is useSkill(hero, target?, skill?): the hero's first skill is the default and
  // goes unnamed, any other ability is named. (skillBlocked leaves the step to its caller:
  // it is asked in the act step.)
  const enemy = G.players[foe];
  const liveTargets = [...liveBoardCards(enemy), ...liveBoardCards(me)];
  for (const hero of owed || shop ? [] : boardOf(me)) {
    const skillIds = skillIdsOf(hero);
    for (const skillId of skillIds) {
      const named = (args: unknown[]) => (skillId === firstSkillOf(hero) ? args : [args[0], args[1], skillId]);
      const ui = skillBlocked(G, pid, hero, undefined, skillId) === null;
      const filter = filterForSkill(hero, skillId);
      let candidates: unknown[][] = [];
      if (filter === 'noTarget') candidates = [[hero.iid]];
      else if (filter === 'self') candidates = [[hero.iid, hero.iid]];
      else if (filter) candidates = liveTargets.filter((t) => targetLegal(filter, t, hero, pid, G) && !(skillExcludesSelf(hero, skillId) && t.iid === hero.iid)).map((t) => [hero.iid, t.iid]);
      let eng = false;
      for (const args of candidates) {
        if (callMove(G, ctx, pid, 'useSkill', named(args)).outcome === 'accepted') { eng = true; break; }
      }
      if (ui && !eng) {
        add('skill-gate', 'useSkill', named([hero.iid]),
          `skillBlocked says ${hero.cardId}#${hero.iid} can cast ${skillId} but useSkill fails for ${candidates.length} candidate target(s)`,
          [candidates.length === 0 ? 'reason:no-legal-target' : 'reason:engine-rejects']);
      } else if (!ui && eng) {
        const why = skillBlocked(G, pid, hero, undefined, skillId);
        add('skill-gate', 'useSkill', named([hero.iid]), `skillBlocked says ${hero.cardId}#${hero.iid} is blocked from ${skillId} (${why}) but useSkill succeeds`,
          [`reason:ui-blocks-${why}`]);
      }
      // An ability that is cooling down, a locked ultimate, or any ability once the Act is
      // over, is never usable, whatever else is open — the rules say so on their own, so
      // this holds even if the gate and the engine both forgot it.
      if (eng && skillCooling(hero, skillId)) {
        add('skill-cooldown', 'useSkill', named([hero.iid]), `${hero.cardId}#${hero.iid} has ${skillId} cooling down (${hero.cooldowns?.[skillId]}) but useSkill succeeds`);
      }
      if (eng && ultLocked(hero, skillId)) {
        add('ult-locked', 'useSkill', named([hero.iid]), `${hero.cardId}#${hero.iid} is level ${hero.level ?? 1} but its ultimate ${skillId} is accepted`);
      }
      if (eng && actOver) {
        add('act-over', 'useSkill', named([hero.iid]), `${hero.cardId}#${hero.iid}'s ${skillId} is accepted after the turn's attack`);
      }
    }
  }

  // ---------------------------------------------------------------- C: rejected => untouched
  for (let i = 0; i < opts.chaosPerStep; i++) {
    const m = chaosMove(G, pid, rnd);
    const r = callMove(G, ctx, pid, m.name, m.args);
    if (r.outcome === 'rejected') checkRefused(G, r.G, m.name, m.args);
    else if (r.outcome === 'threw') {
      add('move-threw', m.name, m.args, `${m.name}(${JSON.stringify(m.args)}) threw: ${String(r.error).slice(0, 140)}`);
    }
  }

  // ---------------------------------------------------------------- D: targets and item use
  // A skill (one skillBlocked lets through) aimed at a sampled target: accepted exactly when
  // its TargetFilter allows it. An item worn on either side — active or passive, ready or
  // not, its bearer spent or not — used on a sampled target: accepted exactly when the item
  // oracle (activateBlockedOracle) allows it; the ready ones are sampled twice as often.
  type Src = { kind: 'skill'; card: CardInstance; skillId: string } | { kind: 'item'; item: CardInstance };
  const sources: Src[] = [];
  for (const h of boardOf(me)) {
    for (const skillId of skillIdsOf(h)) {
      const b = skillBlocked(G, pid, h, undefined, skillId);
      if (filterForSkill(h, skillId) && b === null) sources.push({ kind: 'skill', card: h, skillId });
    }
  }
  for (const h of boardUnits(G)) {
    for (const item of wornItemsOf(h)) {
      sources.push({ kind: 'item', item });
      const gate = activateBlockedOracle(G, pid, item.iid);
      if (gate === null || gate === 'missing-target') sources.push({ kind: 'item', item });
    }
  }
  // The Mid-Boss is among the targets tried: no ability or item may ever be aimed at it.
  const targets: (CardInstance | Ghost | undefined)[] = [undefined, 'ghost', ...boardUnits(G), ...(G.boss ? [G.boss] : [])];
  for (let n = 0; n < opts.targetCombos && sources.length && !owed && !actOver && !shop; n++) {
    const src = pickOne(sources, rnd);
    const tgt = pickOne(targets, rnd);
    const tCard = tgt === 'ghost' ? undefined : tgt;
    const tIid = tgt === 'ghost' ? 'ghost-iid' : tCard?.iid;
    if (src.kind === 'skill') {
      const filter = filterForSkill(src.card, src.skillId)!;
      if (filter === 'noTarget' && tgt !== undefined) continue; // an unused extra target is harmless
      const legal = targetLegal(filter, tCard, src.card, pid, G) && !(skillExcludesSelf(src.card, src.skillId) && tCard?.iid === src.card.iid);
      const args: unknown[] = [src.card.iid, tIid];
      // An ability other than the hero's first skill is named in the move's third argument.
      if (src.skillId !== firstSkillOf(src.card)) args.push(src.skillId);
      const r = callMove(G, ctx, pid, 'useSkill', args);
      const accepted = r.outcome === 'accepted';
      if (accepted && !legal) {
        add(`accepts-illegal-target:${filter}:${why(filter, tgt, pid)}`, 'useSkill', args, `useSkill ${src.card.cardId}#${src.card.iid} -> ${tgt === 'ghost' ? 'unknown iid' : tCard ? `${tCard.cardId}#${tCard.iid}${isRespawning(tCard) ? ' (corpse)' : ''}` : 'no target'} was accepted; filter ${filter} forbids it`);
      } else if (!accepted && legal) {
        add(`rejects-legal-target:${filter}`, 'useSkill', args, `useSkill ${src.card.cardId}#${src.card.iid} -> ${tCard?.cardId}#${tCard?.iid} is legal for filter ${filter} but the engine ${r.outcome} it`);
      }
    } else {
      const filter = filterForItem(src.item);
      const reason = activateBlockedOracle(G, pid, src.item.iid, tIid);
      const args: unknown[] = tgt === undefined ? [src.item.iid] : [src.item.iid, tIid];
      const r = callMove(G, ctx, pid, 'activate', args);
      const accepted = r.outcome === 'accepted';
      const label = `activate ${src.item.cardId}#${src.item.iid} (${filter}) -> ${tgt === 'ghost' ? 'unknown iid' : tCard ? `${tCard.cardId}#${tCard.iid}${isRespawning(tCard) ? ' (corpse)' : ''}` : 'no target'}`;
      if (r.outcome === 'threw') add('move-threw', 'activate', args, `${label} threw: ${String(r.error).slice(0, 140)}`);
      else if (accepted && reason !== null) {
        const cause = reason === 'bad-target' && filter !== 'passive' && filter !== null ? `bad-target:${filter}:${why(filter, tgt, pid)}` : reason;
        add(`activate-accepts-illegal:${cause}`, 'activate', args, `${label} was accepted; the rules refuse it (${reason})`);
      } else if (!accepted && reason === null) {
        add(`activate-rejects-legal:${filter}`, 'activate', args, `${label} is legal by the rules but the engine rejected it`);
      } else if (accepted) checkAccepted(G, r.G, 'activate', args);
      else checkRefused(G, r.G, 'activate', args);
    }
  }

  // ---------------------------------------------------------------- E: moveHero
  if (!owed && rnd() < opts.moveHeroSweep) {
    const slots: unknown[] = [0, 1, 2, 3, -1, 4, 1.5, '2', undefined, null];
    const get = (s: number) => (s === 0 ? me.active : me.bench[s - 1]);
    const ok = (x: unknown): x is 0 | 1 | 2 | 3 => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 3;
    for (const from of slots) {
      for (const to of slots) {
        if (!(ok(from) && ok(to)) && rnd() < 0.7) continue; // thin out the junk-argument pairs
        let legal = false;
        let reason = 'valid';
        if (!ok(from) || !ok(to)) reason = 'bad-slot';
        else if (from === to) reason = 'same-slot';
        else if (shop) reason = 'shop-step'; // heroes move in the act step
        else if (actOver) reason = 'act-over'; // nothing moves once the turn's attack is made
        else {
          const a = get(from), b = get(to);
          if (!a) reason = 'no-hero-at-from';
          else if (!b) reason = 'hole'; // a swap trades two occupied slots
          else if (from === 0 || to === 0) {
            const incoming = from === 0 ? b : a;
            if (isRespawning(a) || isRespawning(b)) reason = 'corpse-swap';
            else if (isBenchOnly(incoming)) reason = 'bench-only-to-active';
            else if (isRooted(a) || isRooted(b)) reason = 'rooted'; // Rooted: no retreat, whichever side of the swap it is on
            else if (G.retreatUsed) reason = 'second-retreat'; // one Retreat a turn
            else legal = true;
          } else legal = true;
        }
        // The Retreat's price is the oracle's own (`retreatCostOracle`): enough souls are handed over…
        const price = retreatCostOracle(G, pid);
        const r = callMove(G, ctx, pid, 'moveHero', [from, to], (g) => { g.players[pid].souls = Math.max(g.players[pid].souls, price); });
        const accepted = r.outcome === 'accepted';
        if (accepted && !legal) add(`moveHero-accepts-illegal:${reason}`, 'moveHero', [from, to], `moveHero(${String(from)}, ${String(to)}) accepted; rules say ${reason}`);
        else if (!accepted && legal) add('moveHero-rejects-legal', 'moveHero', [from, to], `moveHero(${from}, ${to}) is a legal swap but the engine ${r.outcome} it`);
        // …and a soul short of it, a legal Retreat that costs anything is refused.
        if (legal && (from === 0 || to === 0) && price > 0) {
          const short = callMove(G, ctx, pid, 'moveHero', [from, to], (g) => { g.players[pid].souls = price - 1; });
          if (short.outcome === 'accepted') add('moveHero-accepts-illegal:souls', 'moveHero', [from, to], `moveHero(${from}, ${to}) accepted with ${price - 1} souls; the rules price the Retreat at ${price}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------- F: an owed promotion
  if (owed) {
    const probes: { name: string; args: unknown[] }[] = [{ name: 'endTurn', args: [] }, { name: 'attack', args: [] }, { name: 'closeShop', args: [] }];
    const active = boardOf(me).flatMap((h) => wornItemsOf(h)).find((it) => itemData(it.cardId)?.type === 'spell');
    if (active) probes.push({ name: 'activate', args: [active.iid] });
    const hero = boardOf(me)[0];
    const cheap = (G.market ?? []).find((id) => itemData(id)?.tier === 1);
    if (cheap) probes.push({ name: 'buy', args: [cheap] });
    const held = handOf(G, pid)[0];
    if (held && hero) probes.push({ name: 'playCard', args: [held.iid, hero.iid] });
    for (const p of probes) {
      const r = callMove(G, ctx, pid, p.name, p.args, (g) => { g.players[pid].souls = 40; });
      if (r.outcome === 'accepted') add('owed-promotion-skippable', p.name, p.args, `P${pid} owes a promotion (pendingPromotion) yet ${p.name} is accepted`);
    }
  }

  // ---------------------------------------------------------------- G: who the attack may name
  // With the attack open, `attack(targetIid)` is accepted exactly for the units the rules oracle
  // lists — the enemy heroes it may reach, then the Mid-Boss while it stands (a bare `attack`
  // when it lists any) — a refusal leaves the state as it was, and `legalActions` offers one
  // attack per listed unit, the first of them as the bare action.
  const attacker = me.active;
  if (!owed && attacker && attackOpenFor(G, pid)) {
    const units = [...boardUnits(G), ...(G.boss ? [G.boss] : [])];
    const want = attackTargetsOracle(G, pid).filter((t) => attackPower(attacker, t).total > 0);
    const wantIids = want.map((t) => t.iid);
    const tries: (string | undefined)[] = [undefined, 'ghost-iid', ...units.map((c) => c.iid)];
    for (const iid of tries) {
      const args = iid === undefined ? [] : [iid];
      const legal = iid === undefined ? want.length > 0 : wantIids.includes(iid);
      const unit = units.find((c) => c.iid === iid);
      const who = iid === undefined ? 'no target' : unit ? `${unit.cardId}#${unit.iid}${isRespawning(unit) ? ' (corpse)' : ''}` : 'an unknown iid';
      const kind = iid === undefined ? 'bare' : !unit ? 'ghost' : isRespawning(unit) ? 'corpse' : unit.zone === 'pit' ? 'boss' : unit.ownerId === pid ? 'ally' : unit.zone === 'active' ? 'active' : 'bench';
      const r = callMove(G, ctx, pid, 'attack', args);
      if (r.outcome === 'threw') {
        add('move-threw', 'attack', args, `attack(${JSON.stringify(args)}) threw: ${String(r.error).slice(0, 140)}`);
      } else if (r.outcome === 'accepted' && !legal) {
        add(`attack-accepts-illegal-target:${kind}`, 'attack', args, `attack at ${who} was accepted; the rules list [${wantIids.join(', ')}]`);
      } else if (r.outcome === 'rejected' && legal) {
        add(`attack-rejects-legal-target:${kind}`, 'attack', args, `attack at ${who} is legal by the rules but the engine rejected it`);
      } else if (r.outcome === 'rejected') {
        const d = diffPaths(G, r.G, 4);
        if (d.length) add('attack-refusal-mutates', 'attack', args, `attack at ${who} was rejected but changed the state: ${d.join(' ; ')}`);
      }
    }
    const offered = legalActions(G, pid).flatMap((a) => (a.type === 'attack' ? [a] : []));
    const named = offered.map((a, i) => (i === 0 ? a.targetIid ?? wantIids[0] : a.targetIid));
    const shaped = offered.slice(1).every((a) => a.targetIid !== undefined);
    if (!shaped || JSON.stringify(named) !== JSON.stringify(wantIids)) {
      add('attack-offers', 'attack', [], `legalActions offers attacks at [${named.join(', ')}] (bare first: ${shaped}); the rules list [${wantIids.join(', ')}]`);
    }
  }

  // ---------------------------------------------------------------- H: the shop and the step
  if (!owed) probeShop(G, ctx, pid, rnd, opts, shop, { add, checkAccepted, checkRefused });
  // ---------------------------------------------------------------- I: the hand, in either step
  if (!owed) probePlays(G, ctx, pid, rnd, opts, { add, checkAccepted, checkRefused });
}

interface Report {
  add: (check: string, move: string, args: unknown[], message: string, extraTags?: string[]) => void;
  checkAccepted: (before: GameState, after: GameState, name: string, args: unknown[]) => void;
  checkRefused: (before: GameState, after: GameState, name: string, args: unknown[]) => void;
}

/** A legalActions entry as a comparable key. */
function actionKey(a: { type: string } & Record<string, unknown>): string {
  switch (a.type) {
    case 'buy': return `buy ${a.itemId}`;
    case 'sell': return `sell ${a.itemIid}`;
    case 'playCard': return `playCard ${a.cardIid} -> ${a.heroIid}`;
    case 'moveItem': return `moveItem ${a.itemIid} -> ${a.toHeroIid}`;
    case 'activate': return `activate ${a.itemIid}${a.targetIid === undefined ? '' : ` -> ${a.targetIid}`}`;
    default: return a.type;
  }
}

/** Set difference both ways, for a readable mismatch. */
function setDiff(engine: string[], oracle: string[]): string {
  const e = new Set(engine);
  const o = new Set(oracle);
  const extra = [...e].filter((x) => !o.has(x));
  const missing = [...o].filter((x) => !e.has(x));
  return `${extra.length ? `listed but illegal [${extra.slice(0, 4).join(' | ')}${extra.length > 4 ? ` …+${extra.length - 4}` : ''}]` : ''}${extra.length && missing.length ? '; ' : ''}${missing.length ? `legal but not listed [${missing.slice(0, 4).join(' | ')}${missing.length > 4 ? ` …+${missing.length - 4}` : ''}]` : ''}`;
}

/**
 * H — the shop (rules.md §3–§4), at a decision point with no promotion owed:
 *  - `legalActions` lists exactly the shop moves the oracle allows in the shop step (a buy per
 *    item on sale the souls cover, a sale per hand card and per worn item no upgrade claims,
 *    the moves, the close), and no act move there; in the act step it lists no shop move, and
 *    exactly the item uses the oracle allows, one per target;
 *  - sampled purchases (market items, the upgrades of what is worn or held, others, junk; real
 *    souls or plenty), sales (hand cards, worn items, the rival's, heroes, junk), moves and the
 *    shop's close are accepted exactly when the oracle allows them — a purchase a soul short of
 *    its price never is;
 *  - an act move (an ability, an item, a Retreat, the attack) is refused in the shop step, a
 *    shop move in the act step, and the seat not on turn is refused every shop move and play;
 * each on a clone; what the engine accepts is held to the transition rules, what it refuses
 * must leave the state untouched.
 */
function probeShop(G: GameState, ctx: Ctx, pid: PlayerID, rnd: () => number, opts: ProbeOpts, shop: boolean, rep: Report) {
  const { add, checkAccepted, checkRefused } = rep;
  const foe = otherPlayer(pid);
  const me = G.players[pid];
  const mine = boardOf(me);
  const myItems = mine.flatMap((h) => wornItemsOf(h));
  const theirs = boardOf(G.players[foe]);
  const theirItems = theirs.flatMap((h) => wornItemsOf(h));
  const mergedRems = boardUnits(G).flatMap((h) => (h.attached ?? []).filter(isMergedRem));
  const onTurn = seatOnTurn(G) === pid;
  const listed = legalActions(G, pid);
  const shopListed = listed.filter((a) => SHOP_TYPES.has(a.type));

  /** Try `name(args)` as `seat` (souls topped up to `souls` when given) and compare with `legal`. */
  const probe = (seat: PlayerID, name: string, args: unknown[], reason: string | null, check: string, souls?: number) => {
    const before = souls === undefined ? G : withSouls(G, seat, souls);
    const r = callMove(G, ctx, seat, name, args, souls === undefined ? undefined : (g) => { g.players[seat].souls = souls; });
    const accepted = r.outcome === 'accepted';
    if (r.outcome === 'threw') add('move-threw', name, args, `${name}(${JSON.stringify(args)}) threw: ${String(r.error).slice(0, 140)}`);
    else if (accepted && reason !== null) add(`${check}-accepts-illegal:${reason}`, name, args, `${name}(${JSON.stringify(args)}) by P${seat} was accepted; the rules refuse it (${reason})`);
    else if (!accepted && reason === null) add(`${check}-rejects-legal`, name, args, `${name}(${JSON.stringify(args)}) by P${seat} is legal by the rules but the engine rejected it`);
    else if (accepted && seat === pid) checkAccepted(before, r.G, name, args);
    else if (!accepted) checkRefused(before, r.G, name, args);
    return accepted;
  };

  if (onTurn && shop) {
    // What the engine lists, against the oracle.
    const oracle: string[] = [];
    for (const itemId of G.market ?? []) if (buyBlockedOracle(G, pid, itemId) === null) oracle.push(`buy ${itemId}`);
    for (const c of handOf(G, pid)) if (sellBlockedOracle(G, pid, c.iid) === null) oracle.push(`sell ${c.iid}`);
    for (const h of mine) {
      for (const it of wornItemsOf(h)) {
        if (sellBlockedOracle(G, pid, it.iid) === null) oracle.push(`sell ${it.iid}`);
        for (const to of mine) if (moveItemBlockedOracle(G, pid, it.iid, to.iid) === null) oracle.push(`moveItem ${it.iid} -> ${to.iid}`);
      }
    }
    if (closeShopBlockedOracle(G, pid) === null) oracle.push('closeShop');
    const engine = shopListed.map((a) => actionKey(a as never));
    if (JSON.stringify([...engine].sort()) !== JSON.stringify([...oracle].sort())) {
      add('shop-offers', 'buy', [], `legalActions' shop moves differ from the rules: ${setDiff(engine, oracle)}`);
    }
    const act = listed.filter((a) => ACT_TYPES.has(a.type));
    if (act.length) add('shop-offers-act-move', act[0].type, [], `legalActions offers ${act.map((a) => actionKey(a as never)).join(', ')} in the shop step`);

    // Purchases: the market and beyond — an upgrade of something the player wears or holds now
    // and then — with real souls or plenty.
    const owned = [...myItems, ...handOf(G, pid)].map((c) => c.cardId);
    for (let n = 0; n < opts.shopCombos; n++) {
      const x = rnd();
      let itemId: unknown;
      if (x < 0.6 && G.market?.length) itemId = pickOne(G.market, rnd);
      else if (x < 0.75 && owned.length) {
        const ups = ITEMS.filter((i) => owned.includes(i.upgradesFrom ?? '')).map((i) => i.id);
        itemId = ups.length ? pickOne(ups, rnd) : pickOne(owned, rnd);
      } else if (x < 0.92) itemId = pickOne(ITEMS, rnd).id;
      else itemId = pickOne(['hero_haze', 'ult_lash', 'nope', undefined], rnd);
      const souls = rnd() < 0.5 ? undefined : Math.max(me.souls, 40);
      const reason = buyBlockedOracle(G, pid, itemId, souls ?? me.souls);
      const ok = probe(pid, 'buy', [itemId], reason, 'buy', souls);
      // A soul short of the price is never enough.
      if (ok && reason === null && rnd() < 0.5) {
        const price = buyPriceOracle(G, pid, itemId);
        if (price > 0) probe(pid, 'buy', [itemId], 'souls', 'buy', price - 1);
      }
    }
    // Sales and moves: the player's own cards mostly (held or worn), an enemy's, a hero, junk.
    const held = handOf(G, pid);
    const itemPool = () => {
      const x = rnd();
      if (x < 0.5 && myItems.length) return pickOne(myItems, rnd).iid;
      if (x < 0.75 && held.length) return pickOne(held, rnd).iid;
      if (x < 0.85 && theirItems.length) return pickOne(theirItems, rnd).iid;
      if (x < 0.95 && (mergedRems.length || mine.length)) return pickOne([...mergedRems, ...mine], rnd).iid;
      return 'ghost-iid';
    };
    const heroPool = () => {
      const x = rnd();
      if (x < 0.75 && mine.length) return pickOne(mine, rnd).iid;
      if (x < 0.85 && theirs.length) return pickOne(theirs, rnd).iid;
      if (x < 0.9 && mergedRems.length) return pickOne(mergedRems, rnd).iid;
      if (x < 0.95 && myItems.length) return pickOne(myItems, rnd).iid;
      return rnd() < 0.5 ? 'ghost-iid' : undefined;
    };
    const few = Math.max(1, Math.round(opts.shopCombos / 3));
    for (let n = 0; n < few; n++) {
      const itemIid = itemPool();
      probe(pid, 'sell', [itemIid], sellBlockedOracle(G, pid, itemIid), 'sell');
      const toIid = heroPool();
      const moveIid = itemPool();
      probe(pid, 'moveItem', [moveIid, toIid], moveItemBlockedOracle(G, pid, moveIid, toIid), 'moveItem');
    }
    probe(pid, 'closeShop', [], closeShopBlockedOracle(G, pid), 'closeShop');

    // The act step's moves are refused while the shop is open.
    const acts: { name: string; args: unknown[] }[] = [{ name: 'attack', args: [] }, { name: 'moveHero', args: [1, 0] }];
    for (const h of liveBoardCards(me)) {
      for (const skillId of skillIdsOf(h)) {
        if (skillBlocked(G, pid, h, undefined, skillId) !== null) continue;
        const filter = filterForSkill(h, skillId);
        const t = filter && filter !== 'noTarget' ? boardUnits(G).find((u) => targetLegal(filter, u, h, pid, G)) : undefined;
        acts.push({ name: 'useSkill', args: [h.iid, t?.iid, skillId] });
      }
    }
    for (const it of myItems) {
      const bearer = mine.find((h) => wornItemsOf(h).includes(it))!;
      const targets = activateTargetsOracle(G, pid, it, bearer);
      acts.push({ name: 'activate', args: targets === 'none' ? [it.iid] : [it.iid, targets[0]?.iid] });
    }
    for (let n = 0; n < 2; n++) {
      const a = pickOne(acts, rnd);
      probe(pid, a.name, a.args, 'shop-step', 'act-move-in-shop-step', Math.max(me.souls, 40));
    }
  }

  if (onTurn && !shop) {
    const wrong = shopListed;
    if (wrong.length) add('act-offers-shop-move', wrong[0].type, [], `legalActions offers ${wrong.map((a) => actionKey(a as never)).join(', ')} in the act step`);
    // The item uses the engine lists, against the oracle (one per target; 'none' for an untargeted one).
    const engine = listed.filter((a) => a.type === 'activate').map((a) => actionKey(a as never));
    const oracle: string[] = [];
    for (const h of liveBoardCards(me)) {
      for (const it of wornItemsOf(h)) {
        const gate = activateBlockedOracle(G, pid, it.iid);
        if (gate !== null && gate !== 'missing-target') continue;
        const targets = activateTargetsOracle(G, pid, it, h);
        if (targets === 'none') oracle.push(`activate ${it.iid}`);
        else for (const t of targets) oracle.push(`activate ${it.iid} -> ${t.iid}`);
      }
    }
    if (JSON.stringify([...engine].sort()) !== JSON.stringify([...oracle].sort())) {
      add('activate-offers', 'activate', [], `legalActions' item uses differ from the rules: ${setDiff(engine, oracle)}`);
    }
    // The shop's moves are refused in the act step (a card played is the act step's too).
    const shopMoves = shopProbes(G, pid, false);
    for (let n = 0; n < 2 && shopMoves.length; n++) {
      const m = pickOne(shopMoves, rnd);
      probe(pid, m.name, m.args, 'not-shop-step', 'shop-move-in-act-step', Math.max(me.souls, 40));
    }
  }

  // The seat not on turn has no shop and plays nothing, in either step.
  const offTurn = legalActions(G, foe).filter((a) => SHOP_TYPES.has(a.type) || a.type === 'playCard');
  if (offTurn.length) add('off-turn-offers-shop-move', offTurn[0].type, [], `legalActions offers P${foe} (not on turn) ${offTurn.map((a) => actionKey(a as never)).join(', ')}`);
  const theirMoves = shopProbes(G, foe, true);
  if (theirMoves.length) {
    const m = pickOne(theirMoves, rnd);
    probe(foe, m.name, m.args, 'not-your-turn', 'shop-move-off-turn', Math.max(G.players[foe].souls, 40));
  }
}

/** Shop moves for `seat` that would be legal were its shop open: the cheapest market item,
 *  a sale of a hand card and of a worn item, a move of a worn item, closing the shop — and,
 *  with `plays`, a hand card played onto a hero with room. */
function shopProbes(G: GameState, seat: PlayerID, plays: boolean): { name: string; args: unknown[] }[] {
  const heroes = boardOf(G.players[seat]);
  const out: { name: string; args: unknown[] }[] = [{ name: 'closeShop', args: [] }];
  const cheap = (G.market ?? []).find((id) => itemData(id)?.tier === 1);
  if (cheap) out.push({ name: 'buy', args: [cheap] });
  const held = handOf(G, seat)[0];
  if (held) {
    out.push({ name: 'sell', args: [held.iid] });
    const room = heroes.find((h) => wornItemsOf(h).length < 3 && !wornItemsOf(h).some((a) => a.cardId === held.cardId));
    if (plays && room) out.push({ name: 'playCard', args: [held.iid, room.iid] });
  }
  const worn = heroes.flatMap((h) => wornItemsOf(h).map((item) => ({ item, bearer: h })));
  if (worn.length) {
    const { item, bearer } = worn[0];
    out.push({ name: 'sell', args: [item.iid] });
    const to = heroes.find((h) => h !== bearer && !wornItemsOf(h).some((a) => a.cardId === item.cardId) && wornItemsOf(h).length < 3);
    if (to) out.push({ name: 'moveItem', args: [item.iid, to.iid] });
  }
  return out;
}

/**
 * I — the hand, at a decision point with no promotion owed, in either step of the turn
 * (and after the attack, when nothing but ending the turn is left):
 *  - `legalActions` lists exactly the plays the oracle allows: each hand card onto each of
 *    the player's heroes in a slot it may go on (none after the attack, none for the seat
 *    not on turn);
 *  - sampled plays (the player's hand cards mostly — a rival's card, a worn item, a hero,
 *    junk now and then — onto its heroes, a rival's, a merged Rem, an item, junk) are
 *    accepted exactly when the oracle allows them;
 * each on a clone; what the engine accepts is held to the transition rules (the card leaves
 * the hand for the hero, its component consumed, its cooldown, charges, bonus and
 * experience; never over the slot cap), what it refuses must leave the state untouched.
 */
function probePlays(G: GameState, ctx: Ctx, pid: PlayerID, rnd: () => number, opts: ProbeOpts, rep: Report) {
  const { add, checkAccepted, checkRefused } = rep;
  const foe = otherPlayer(pid);
  const me = G.players[pid];
  const mine = boardOf(me);
  const held = handOf(G, pid);

  const oracle: string[] = [];
  for (const c of held) for (const h of mine) if (playBlockedOracle(G, pid, c.iid, h.iid) === null) oracle.push(`playCard ${c.iid} -> ${h.iid}`);
  const engine = legalActions(G, pid).filter((a) => a.type === 'playCard').map((a) => actionKey(a as never));
  if (JSON.stringify([...engine].sort()) !== JSON.stringify([...oracle].sort())) {
    add('play-offers', 'playCard', [], `legalActions' card plays differ from the rules (${G.step} step${G.attackUsed ? ', after the attack' : ''}): ${setDiff(engine, oracle)}`);
  }

  const theirHand = handOf(G, foe);
  const theirs = boardOf(G.players[foe]);
  const myItems = mine.flatMap((h) => wornItemsOf(h));
  const mergedRems = boardUnits(G).flatMap((h) => (h.attached ?? []).filter(isMergedRem));
  const cardPool = () => {
    const x = rnd();
    if (x < 0.8 && held.length) return pickOne(held, rnd).iid;
    if (x < 0.86 && theirHand.length) return pickOne(theirHand, rnd).iid;
    if (x < 0.92 && myItems.length) return pickOne(myItems, rnd).iid;
    if (x < 0.96 && mine.length) return pickOne(mine, rnd).iid;
    return rnd() < 0.5 ? 'ghost-iid' : undefined;
  };
  const heroPool = () => {
    const x = rnd();
    if (x < 0.8 && mine.length) return pickOne(mine, rnd).iid;
    if (x < 0.88 && theirs.length) return pickOne(theirs, rnd).iid;
    if (x < 0.92 && mergedRems.length) return pickOne(mergedRems, rnd).iid;
    if (x < 0.96 && myItems.length) return pickOne(myItems, rnd).iid;
    return rnd() < 0.5 ? 'ghost-iid' : undefined;
  };
  // With nothing in the hand there is little to learn: a probe or two of junk.
  const tries = held.length ? opts.playCombos : 1;
  for (let n = 0; n < tries; n++) {
    const args = [cardPool(), heroPool()];
    const reason = playBlockedOracle(G, pid, args[0], args[1]);
    const r = callMove(G, ctx, pid, 'playCard', args);
    const accepted = r.outcome === 'accepted';
    if (r.outcome === 'threw') add('move-threw', 'playCard', args, `playCard(${JSON.stringify(args)}) threw: ${String(r.error).slice(0, 140)}`);
    else if (accepted && reason !== null) add(`playCard-accepts-illegal:${reason}`, 'playCard', args, `playCard(${JSON.stringify(args)}) by P${pid} was accepted; the rules refuse it (${reason})`);
    else if (!accepted && reason === null) add('playCard-rejects-legal', 'playCard', args, `playCard(${JSON.stringify(args)}) by P${pid} is legal by the rules but the engine rejected it`);
    else if (accepted) checkAccepted(G, r.G, 'playCard', args);
    else checkRefused(G, r.G, 'playCard', args);
  }
}
