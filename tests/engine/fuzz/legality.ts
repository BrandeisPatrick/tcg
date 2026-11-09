/**
 * Legality probes: at a decision point of a live game, ask the engine (through
 * direct move calls on clones) whether it agrees with the other sources of
 * "what may I do" — the AI's legal-move list, the UI's `skillBlocked`, the
 * engine's own `legalActions`, and an independent rules oracle (oracle.ts) for
 * targets, items, the hand, the choices owed, hero moves and who the attack
 * may name.
 *
 * A probe move the engine accepts is also held to the transition rules and the
 * state invariants (invariants.ts) — so a card played onto a hero the AI would
 * not pick, a soul short, or an upgrade named wrong, is checked as closely as a
 * live move.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import type { Ctx } from 'boardgame.io';
import { CARDS_BY_ID, ITEMS } from '@/cards';
import { enumerateAIMoves } from '@/ai/heuristic';
import { legalActions, skillBlocked } from '@/engine/legality';
import type { Action } from '@/engine/engine';
import { attackPower, checkWinner, isRespawning, liveBoardCards, otherPlayer } from '@/engine/query';
import type { TargetFilter } from '@/abilities';
import type { Snapshot, StepInfo } from './driver';
import { chaosMove } from './driver';
import { moveTags, signatureOf, type Hit } from './hits';
import { collectInvariantViolations, collectTransitionViolations } from './invariants';
import {
  activateBlockedOracle, attackOpenFor, attackTargetsOracle, boardOf, boardUnits, callMove, chooseActiveBlockedOracle, diffPaths,
  discardBlockedOracle, discardList, filterForItem, filterForSkill, firstSkillOf, handOf, isHeroCard, isMergedRem, itemData, other,
  placeHeroBlockedOracle, playBlockedOracle, playCostOracle, retreatCostOracle, skillCooling, skillExcludesSelf, skillIdsOf,
  targetLegal, ultLocked, upgradesOfOracle, wornItemsOf,
} from './oracle';

export interface ProbeOpts {
  /** Chaos moves tried per decision point for the validate-before-mutate check. */
  chaosPerStep: number;
  /** (source x target) combinations — skills and worn items — tried per decision point of the act step. */
  targetCombos: number;
  /** Chance that a decision point also gets the full moveHero sweep. */
  moveHeroSweep: number;
  /** (card x hero) item plays tried per decision point. */
  playCombos: number;
  /** Heroes from the hand placed (the lane or the bench) per decision point. */
  placeCombos: number;
}

export const DEFAULT_PROBE: ProbeOpts = { chaosPerStep: 3, targetCombos: 8, moveHeroSweep: 0.2, playCombos: 5, placeCombos: 2 };

const pickOne = <T,>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)];
const isBenchOnly = (c: CardInstance) => !!(CARDS_BY_ID[c.cardId] as { flags?: { benchOnly?: boolean } }).flags?.benchOnly;
const isRooted = (c: CardInstance) => c.statuses.some((s) => s.id === 'rooted');

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

  // While a promotion is owed the engine refuses everything else (section F), and so it does
  // while the opening's first Active (F2) or a draw card's discard (F3) is owed; the rest of
  // the probes ask about moves in an ordinary position. Once the turn's attack is made the Act
  // is over and only ending the turn is left: B and E check that refusal, D skips it.
  const owed = G.pendingPromotion !== undefined;
  const actOver = G.attackUsed;
  const choice = G.pendingActive !== undefined || G.pendingDiscard !== undefined || !!G.triggers?.length;

  // ---------------------------------------------------------------- B: skillBlocked <=> useSkill
  // Each kit ability of each hero on its own (its skill, its ultimate).
  // The move is useSkill(hero, target?, skill?): the hero's first skill is the default and
  // goes unnamed, any other ability is named. (skillBlocked leaves the step to its caller:
  // it is asked in the act step.)
  const enemy = G.players[foe];
  const liveTargets = [...liveBoardCards(enemy), ...liveBoardCards(me)];
  for (const hero of owed || choice ? [] : boardOf(me)) {
    const skillIds = skillIdsOf(hero);
    for (const skillId of skillIds) {
      const named = (args: unknown[]) => (skillId === firstSkillOf(hero) ? args : [args[0], args[1], skillId]);
      const ui = skillBlocked(G, pid, hero, undefined, skillId) === null;
      const filter = filterForSkill(hero, skillId, G, pid);
      let candidates: unknown[][] = [];
      if (filter === 'noTarget') candidates = [[hero.iid]];
      else if (filter === 'self') candidates = [[hero.iid, hero.iid]];
      else if (filter) candidates = liveTargets.filter((t) => targetLegal(filter, t, hero, pid, G) && !(skillExcludesSelf(hero, skillId, G, pid) && t.iid === hero.iid)).map((t) => [hero.iid, t.iid]);
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
      if (filterForSkill(h, skillId, G, pid) && b === null) sources.push({ kind: 'skill', card: h, skillId });
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
  for (let n = 0; n < opts.targetCombos && sources.length && !owed && !actOver && !choice; n++) {
    const src = pickOne(sources, rnd);
    const tgt = pickOne(targets, rnd);
    const tCard = tgt === 'ghost' ? undefined : tgt;
    const tIid = tgt === 'ghost' ? 'ghost-iid' : tCard?.iid;
    if (src.kind === 'skill') {
      const filter = filterForSkill(src.card, src.skillId, G, pid)!;
      if (filter === 'noTarget' && tgt !== undefined) continue; // an unused extra target is harmless
      const legal = targetLegal(filter, tCard, src.card, pid, G) && !(skillExcludesSelf(src.card, src.skillId, G, pid) && tCard?.iid === src.card.iid);
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
        else if (choice) reason = 'choice-owed'; // the first Active, a discard: owed first
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
    const probes: { name: string; args: unknown[] }[] = [{ name: 'endTurn', args: [] }, { name: 'attack', args: [] }];
    const active = boardOf(me).flatMap((h) => wornItemsOf(h)).find((it) => itemData(it.cardId)?.type === 'spell');
    if (active) probes.push({ name: 'activate', args: [active.iid] });
    const hero = boardOf(me)[0];
    const held = handOf(G, pid).find((c) => !!itemData(c.cardId));
    if (held && hero) probes.push({ name: 'playCard', args: [held.iid, hero.iid] });
    const heroCard = handOf(G, pid).find(isHeroCard);
    if (heroCard) probes.push({ name: 'placeHero', args: [heroCard.iid] });
    if (handOf(G, pid)[0]) probes.push({ name: 'discard', args: [[handOf(G, pid)[0].iid]] });
    for (const p of probes) {
      const r = callMove(G, ctx, pid, p.name, p.args, (g) => { g.players[pid].souls = 40; });
      if (r.outcome === 'accepted') add('owed-promotion-skippable', p.name, p.args, `P${pid} owes a promotion (pendingPromotion) yet ${p.name} is accepted`);
    }
  }

  // ---------------------------------------------------------------- F2 / F3: the other choices owed
  if (!owed && G.pendingActive) probeOpening(G, ctx, pid, rnd, { add, checkAccepted, checkRefused });
  if (!owed && G.pendingDiscard) probeDiscard(G, ctx, pid, rnd, { add, checkAccepted, checkRefused });

  // ---------------------------------------------------------------- F4: a trigger prompt owed
  // Its answers — each offer, and the pass — are accepted from either seat; nothing else is
  // (engine/prompts.ts), the end of the turn included.
  const prompt = G.triggers?.[G.triggers.length - 1];
  if (prompt) {
    const answers: { name: string; args: unknown[] }[] = [
      ...prompt.offers.map((o) => ({ name: 'useTrigger', args: [o.heroIid, o.abilityId] })),
      { name: 'passTrigger', args: [] },
    ];
    for (const seat of [pid, foe]) {
      for (const a of answers) {
        const r = callMove(G, ctx, seat, a.name, a.args);
        if (r.outcome !== 'accepted') add('trigger-answer-refused', a.name, a.args, `P${prompt.pid} owes an answer to a trigger prompt, yet ${a.name}(${JSON.stringify(a.args)}) from P${seat} is ${r.outcome}`);
        else checkAccepted(G, r.G, a.name, a.args);
      }
    }
    for (const m of [{ name: 'endTurn', args: [] as unknown[] }, chaosMove(G, pid, rnd)]) {
      if (m.name === 'useTrigger' || m.name === 'passTrigger' || m.name === 'completeAction') continue;
      const r = callMove(G, ctx, pid, m.name, m.args);
      if (r.outcome === 'accepted') add('trigger-prompt-skippable', m.name, m.args, `P${prompt.pid} owes an answer to a trigger prompt, yet ${m.name}(${JSON.stringify(m.args)}) is accepted`);
      else if (r.outcome === 'rejected') checkRefused(G, r.G, m.name, m.args);
    }
  }

  // ---------------------------------------------------------------- G: who the attack may name
  // With the attack open, `attack(targetIid)` is accepted exactly for the units the rules oracle
  // lists — the enemy heroes it may reach, then the Mid-Boss while it stands (a bare `attack`
  // when it lists any) — a refusal leaves the state as it was, and `legalActions` offers one
  // attack per listed unit, the first of them as the bare action.
  const attacker = me.active;
  if (!owed && !prompt && attacker && attackOpenFor(G, pid)) {
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

  // ---------------------------------------------------------------- H: the hand
  if (!owed && !prompt && !G.pendingActive && !G.pendingDiscard) probeHand(G, ctx, pid, rnd, opts, { add, checkAccepted, checkRefused });
}

interface Report {
  add: (check: string, move: string, args: unknown[], message: string, extraTags?: string[]) => void;
  checkAccepted: (before: GameState, after: GameState, name: string, args: unknown[]) => void;
  checkRefused: (before: GameState, after: GameState, name: string, args: unknown[]) => void;
}

/** A legalActions entry as a comparable key. */
function actionKey(a: Action): string {
  switch (a.type) {
    case 'playCard': return `playCard ${a.cardIid} -> ${a.heroIid}${a.upgradeId ? ` [${a.upgradeId}]` : ''}`;
    case 'placeHero': return `placeHero ${a.cardIid} ${a.toActive ? 'lane' : 'bench'}`;
    case 'discard': return `discard ${a.cardIids.join('+')}`;
    case 'chooseActive': return `chooseActive ${a.cardIid}`;
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

/** Try `name(args)` as `seat` on a clone (souls set to `souls` when given) and compare with the
 *  oracle's `reason` (null: legal); what is accepted is held to the transition rules, what is
 *  refused must leave the state untouched. */
function prober(G: GameState, ctx: Ctx, pid: PlayerID, rep: Report) {
  return (seat: PlayerID, name: string, args: unknown[], reason: string | null, check: string, souls?: number) => {
    const before = souls === undefined ? G : withSouls(G, seat, souls);
    const r = callMove(G, ctx, seat, name, args, souls === undefined ? undefined : (g) => { g.players[seat].souls = souls; });
    const accepted = r.outcome === 'accepted';
    if (r.outcome === 'threw') rep.add('move-threw', name, args, `${name}(${JSON.stringify(args)}) threw: ${String(r.error).slice(0, 140)}`);
    else if (accepted && reason !== null) rep.add(`${check}-accepts-illegal:${reason}`, name, args, `${name}(${JSON.stringify(args)}) by P${seat} was accepted; the rules refuse it (${reason})`);
    else if (!accepted && reason === null) rep.add(`${check}-rejects-legal`, name, args, `${name}(${JSON.stringify(args)}) by P${seat} is legal by the rules but the engine rejected it`);
    else if (accepted && seat === pid) rep.checkAccepted(before, r.G, name, args);
    else if (!accepted) rep.checkRefused(before, r.G, name, args);
    return accepted;
  };
}

/** The plays from the hand the rules allow `pid` now, as `actionKey`s: each item onto each hero
 *  of its side in a slot (one per upgrade the item could make, when it could make several), each
 *  hero into an empty lane and onto the bench. */
function handPlaysOracle(G: GameState, pid: PlayerID): string[] {
  const out: string[] = [];
  const heroes = boardOf(G.players[pid]);
  for (const c of handOf(G, pid)) {
    if (itemData(c.cardId)) {
      const ups = upgradesOfOracle(c.cardId);
      for (const h of heroes) {
        if (ups.length > 1) { for (const u of ups) if (playBlockedOracle(G, pid, c.iid, h.iid, u) === null) out.push(`playCard ${c.iid} -> ${h.iid} [${u}]`); }
        else if (playBlockedOracle(G, pid, c.iid, h.iid) === null) out.push(`playCard ${c.iid} -> ${h.iid}`);
      }
    } else {
      if (placeHeroBlockedOracle(G, pid, c.iid, true) === null) out.push(`placeHero ${c.iid} lane`);
      if (placeHeroBlockedOracle(G, pid, c.iid, false) === null) out.push(`placeHero ${c.iid} bench`);
    }
  }
  return out;
}

/**
 * H — the hand, at a decision point with no choice owed (and after the attack, when nothing
 * but ending the turn is left):
 *  - `legalActions` lists exactly the plays the oracle allows (`handPlaysOracle`) — none after
 *    the attack, none for the seat not on turn;
 *  - sampled item plays (the player's hand mostly — a hero card, a rival's card, a worn item,
 *    junk now and then — onto its heroes, a rival's, a merged Rem, an item, junk; an upgrade
 *    named or not, a wrong one, junk; real souls, plenty, or a soul short of the cost) and
 *    hero placements (its hero cards mostly; the lane or the bench) are accepted exactly when
 *    the oracle allows them;
 *  - a discard or a first Active nobody owes is refused;
 * each on a clone; what the engine accepts is held to the transition rules (the card leaves
 * the hand for the hero, its price paid, the component it evolves to the discard pile, the
 * upgrade it makes into the deck, its cooldown, charges, bonus and experience; never over the
 * slot cap), what it refuses must leave the state untouched.
 */
function probeHand(G: GameState, ctx: Ctx, pid: PlayerID, rnd: () => number, opts: ProbeOpts, rep: Report) {
  const { add } = rep;
  const probe = prober(G, ctx, pid, rep);
  const foe = otherPlayer(pid);
  const me = G.players[pid];
  const mine = boardOf(me);
  const held = handOf(G, pid);
  const listed = legalActions(G, pid).filter((a) => a.type === 'playCard' || a.type === 'placeHero').map(actionKey);
  const oracle = handPlaysOracle(G, pid);
  if (JSON.stringify([...listed].sort()) !== JSON.stringify([...oracle].sort())) {
    add('hand-offers', 'playCard', [], `legalActions' plays from the hand differ from the rules${G.attackUsed ? ' (after the attack)' : ''}: ${setDiff(listed, oracle)}`);
  }

  const theirHand = handOf(G, foe);
  const theirs = boardOf(G.players[foe]);
  const myItems = mine.flatMap((h) => wornItemsOf(h));
  const mergedRems = boardUnits(G).flatMap((h) => (h.attached ?? []).filter(isMergedRem));
  const items = held.filter((c) => !!itemData(c.cardId));
  const heroCards = held.filter(isHeroCard);
  const cardPool = (preferHeroes: boolean) => {
    const x = rnd();
    const first = preferHeroes ? heroCards : items;
    if (x < 0.7 && first.length) return pickOne(first, rnd).iid;
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
    const cardIid = cardPool(false);
    const heroIid = heroPool();
    const card = held.find((c) => c.iid === cardIid);
    const args: unknown[] = [cardIid, heroIid];
    const u = rnd();
    if (u < 0.35 && card) {
      const ups = upgradesOfOracle(card.cardId);
      args.push(ups.length && rnd() < 0.7 ? pickOne(ups, rnd) : rnd() < 0.5 ? pickOne(ITEMS, rnd).id : pickOne(['nope', '', 7], rnd));
    }
    const x = rnd();
    const hero = mine.find((h) => h.iid === heroIid);
    const cost = card && hero && itemData(card.cardId) ? playCostOracle(hero, card.cardId) : 0;
    const souls = x < 0.4 ? undefined : x < 0.8 ? Math.max(me.souls, 40) : Math.max(0, cost - 1);
    probe(pid, 'playCard', args, playBlockedOracle(G, pid, args[0], args[1], args[2], souls ?? me.souls), 'playCard', souls);
  }
  for (let n = 0; n < Math.max(1, opts.placeCombos); n++) {
    const cardIid = cardPool(true);
    const toActive = rnd() < 0.5;
    probe(pid, 'placeHero', toActive ? [cardIid, true] : [cardIid], placeHeroBlockedOracle(G, pid, cardIid, toActive), 'placeHero');
  }
  // Nobody owes a discard or a first Active here: both are refused.
  if (held.length) probe(pid, 'discard', [[held[0].iid]], discardBlockedOracle(G, pid, [held[0].iid]), 'discard');
  if (heroCards.length) probe(pid, 'chooseActive', [heroCards[0].iid], chooseActiveBlockedOracle(G, heroCards[0].iid), 'chooseActive');

  // The seat not on turn plays nothing from its hand.
  const offTurn = legalActions(G, foe).filter((a) => a.type === 'playCard' || a.type === 'placeHero');
  if (offTurn.length) add('off-turn-offers-play', offTurn[0].type, [], `legalActions offers P${foe} (not on turn) ${offTurn.map(actionKey).join(', ')}`);
  const theirCard = theirHand[0];
  if (theirCard) {
    if (itemData(theirCard.cardId) && theirs[0]) probe(foe, 'playCard', [theirCard.iid, theirs[0].iid], 'not-your-turn', 'play-off-turn', Math.max(G.players[foe].souls, 40));
    else if (isHeroCard(theirCard)) probe(foe, 'placeHero', [theirCard.iid], 'not-your-turn', 'place-off-turn');
  }
}

/**
 * F2 — the opening owes a seat its first Active (`G.pendingActive`): `legalActions`, for either
 * seat, lists exactly a `chooseActive` per hero of the owing hand that may stand in the lane;
 * sampled choices (the owing seat's hand — heroes, a bench-only one, items —, the other seat's
 * cards, junk) are accepted exactly when the oracle allows them, made from either seat; every
 * other move is refused.
 */
function probeOpening(G: GameState, ctx: Ctx, pid: PlayerID, rnd: () => number, rep: Report) {
  const { add } = rep;
  const probe = prober(G, ctx, pid, rep);
  const owing = G.pendingActive!;
  const hand = handOf(G, owing);
  const want = hand.filter((c) => chooseActiveBlockedOracle(G, c.iid) === null).map((c) => `chooseActive ${c.iid}`);
  for (const seat of ['0', '1'] as PlayerID[]) {
    const listed = legalActions(G, seat).map(actionKey);
    if (JSON.stringify([...listed].sort()) !== JSON.stringify([...want].sort())) add('opening-offers', 'chooseActive', [], `legalActions(P${seat}) with P${owing}'s first Active owed: ${setDiff(listed, want)}`);
  }
  const pool = [...hand, ...handOf(G, other(owing)), ...boardUnits(G)].map((c) => c.iid);
  for (let n = 0; n < 3; n++) {
    const iid = pool.length && rnd() < 0.9 ? pickOne(pool, rnd) : 'ghost-iid';
    const seat = rnd() < 0.5 ? pid : otherPlayer(pid);
    probe(seat, 'chooseActive', [iid], chooseActiveBlockedOracle(G, iid), 'chooseActive');
  }
  const others: { name: string; args: unknown[] }[] = [{ name: 'endTurn', args: [] }, { name: 'attack', args: [] }];
  const myHand = handOf(G, pid);
  const heroCard = myHand.find(isHeroCard);
  if (heroCard) others.push({ name: 'placeHero', args: [heroCard.iid, true] });
  const item = myHand.find((c) => !!itemData(c.cardId));
  const hero = boardOf(G.players[pid])[0];
  if (item && hero) others.push({ name: 'playCard', args: [item.iid, hero.iid] });
  for (const m of others) probe(pid, m.name, m.args, 'active-owed', 'opening-skippable', 40);
}

/**
 * F3 — a draw card's discard is owed (`G.pendingDiscard`): `legalActions` lists exactly a
 * one-card `discard` per card of the owing hand (for the owing seat; nothing for the other);
 * sampled discards — the right number of hand cards, fewer, too many, a card twice, a rival's
 * card, junk, a bare iid — are accepted exactly when the oracle allows them, and what is
 * accepted pays that much of what is owed; every other move (the end of the turn included) is
 * refused.
 */
function probeDiscard(G: GameState, ctx: Ctx, pid: PlayerID, rnd: () => number, rep: Report) {
  const { add } = rep;
  const probe = prober(G, ctx, pid, rep);
  const owed = G.pendingDiscard!;
  const hand = handOf(G, owed.pid).map((c) => c.iid);
  for (const seat of ['0', '1'] as PlayerID[]) {
    const want = seat === owed.pid ? hand.map((iid) => `discard ${iid}`) : [];
    const listed = legalActions(G, seat).filter((a) => a.type !== 'promoteToActive').map(actionKey);
    if (JSON.stringify([...listed].sort()) !== JSON.stringify([...want].sort())) add('discard-offers', 'discard', [], `legalActions(P${seat}) with P${owed.pid}'s discard of ${owed.count} owed: ${setDiff(listed, want)}`);
  }
  const shuffled = () => [...hand].sort(() => rnd() - 0.5);
  const tries: unknown[] = [
    shuffled().slice(0, owed.count),
    shuffled().slice(0, Math.max(1, owed.count - 1)),
    shuffled().slice(0, owed.count + 1),
    hand.length ? [hand[0], hand[0]] : [],
    [...shuffled().slice(0, 1), ...(handOf(G, other(owed.pid))[0] ? [handOf(G, other(owed.pid))[0].iid] : ['ghost-iid'])],
    [],
    hand[0] ?? 'ghost-iid',
    'ghost-iid',
  ];
  for (let n = 0; n < 3; n++) {
    const arg = pickOne(tries, rnd);
    probe(pid, 'discard', [arg], discardBlockedOracle(G, pid, discardList(arg)), 'discard');
  }
  const others: { name: string; args: unknown[] }[] = [{ name: 'endTurn', args: [] }, { name: 'attack', args: [] }];
  const myHand = handOf(G, pid);
  const heroCard = myHand.find(isHeroCard);
  if (heroCard) others.push({ name: 'placeHero', args: [heroCard.iid] });
  const item = myHand.find((c) => !!itemData(c.cardId));
  const hero = boardOf(G.players[pid])[0];
  if (item && hero) others.push({ name: 'playCard', args: [item.iid, hero.iid] });
  for (const h of liveBoardCards(G.players[pid])) for (const skillId of skillIdsOf(h)) others.push({ name: 'useSkill', args: [h.iid, undefined, skillId] });
  for (let n = 0; n < 3 && others.length; n++) {
    const m = pickOne(others, rnd);
    probe(pid, m.name, m.args, 'discard-owed', 'discard-skippable', 40);
  }
}
