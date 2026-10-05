/**
 * Legality probes: at a decision point of a live game, ask the engine (through
 * direct move calls on clones) whether it agrees with the other sources of
 * "what may I do" — the AI's legal-move list, the UI's `skillBlocked`, and an
 * independent rules oracle for targets and hero moves.
 */
import type { CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { enumerateAIMoves } from '@/ai/heuristic';
import { skillBlocked } from '@/engine/legality';
import { MAX_EQUIPMENT_PER_HERO, RETREAT_COST } from '@/engine/constants';
import { isRespawning, liveBoardCards, otherPlayer } from '@/engine/query';
import type { Snapshot, StepInfo } from './driver';
import { chaosMove } from './driver';
import { moveTags, signatureOf, type Hit } from './hits';
import {
  boardOf, boardUnits, callMove, diffPaths, filterForHandCard, filterForSkill, targetLegal,
} from './oracle';
import type { TargetFilter } from '@/abilities';

export interface ProbeOpts {
  /** Chaos moves tried per decision point for the validate-before-mutate check. */
  chaosPerStep: number;
  /** (source x target) combinations tried per decision point. */
  targetCombos: number;
  /** Chance that a decision point also gets the full moveHero sweep. */
  moveHeroSweep: number;
}

export const DEFAULT_PROBE: ProbeOpts = { chaosPerStep: 3, targetCombos: 8, moveHeroSweep: 0.2 };

const pickOne = <T,>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)];
const isBenchOnly = (c: CardInstance) => !!(CARDS_BY_ID[c.cardId] as { flags?: { benchOnly?: boolean } }).flags?.benchOnly;
const isMergedRem = (c: CardInstance) => c.cardId === 'hero_rem' && c.remMergeTurnsLeft != null;

type Ghost = 'ghost';

function why(filter: TargetFilter | 'equipment', tgt: CardInstance | undefined | Ghost, pid: PlayerID): string {
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
    case 'equipment': return !ally ? 'wrong-side' : 'not-hero';
    default: return 'other';
  }
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
  const me = G.players[pid];

  const add = (check: string, move: string, args: unknown[], message: string, extraTags: string[] = []) => {
    hits.push({
      signature: signatureOf(check, move, false),
      mix, seed: info.seed, step: info.step, move, args, chaos: false,
      tags: [...moveTags(snap, move, args), ...extraTags], message,
    });
  };

  // ---------------------------------------------------------------- A: the AI's list
  for (const o of enumerateAIMoves(G, ctx, false)) {
    const r = callMove(G, ctx, pid, o.move, o.args);
    if (r.outcome !== 'accepted') {
      add('ai-move-rejected', o.move, o.args, `enumerateAIMoves offered ${o.move}(${JSON.stringify(o.args)}) and the engine ${r.outcome} it${r.error ? `: ${String(r.error).slice(0, 120)}` : ''}`);
    }
  }

  // ---------------------------------------------------------------- B: skillBlocked <=> useSkill
  const enemy = G.players[otherPlayer(pid)];
  const liveTargets = [...liveBoardCards(enemy), ...liveBoardCards(me)];
  for (const hero of boardOf(me)) {
    const ui = skillBlocked(G, pid, hero) === null;
    const filter = filterForSkill(hero);
    let candidates: unknown[][] = [];
    if (filter === 'noTarget') candidates = [[hero.iid]];
    else if (filter === 'self') candidates = [[hero.iid, hero.iid]];
    else if (filter) candidates = liveTargets.filter((t) => targetLegal(filter, t, hero, pid)).map((t) => [hero.iid, t.iid]);
    let eng = false;
    for (const args of candidates) {
      if (callMove(G, ctx, pid, 'useSkill', args).outcome === 'accepted') { eng = true; break; }
    }
    if (ui && !eng) {
      add('skill-gate', 'useSkill', [hero.iid],
        `skillBlocked says ${hero.cardId}#${hero.iid} can cast but useSkill fails for ${candidates.length} candidate target(s)`,
        [candidates.length === 0 ? 'reason:no-legal-target' : 'reason:engine-rejects']);
    } else if (!ui && eng) {
      add('skill-gate', 'useSkill', [hero.iid], `skillBlocked says ${hero.cardId}#${hero.iid} is blocked (${skillBlocked(G, pid, hero)}) but useSkill succeeds`,
        [`reason:ui-blocks-${skillBlocked(G, pid, hero)}`]);
    }
  }

  // ---------------------------------------------------------------- C: rejected => untouched
  for (let i = 0; i < opts.chaosPerStep; i++) {
    const m = chaosMove(G, pid, rnd);
    const r = callMove(G, ctx, pid, m.name, m.args);
    if (r.outcome === 'rejected') {
      const d = diffPaths(G, r.G, 4);
      if (d.length) add('rejected-move-mutates', m.name, m.args, `${m.name}(${JSON.stringify(m.args)}) was rejected but changed the state: ${d.join(' ; ')}`);
    } else if (r.outcome === 'threw') {
      add('move-threw', m.name, m.args, `${m.name}(${JSON.stringify(m.args)}) threw: ${String(r.error).slice(0, 140)}`);
    }
  }

  // ---------------------------------------------------------------- D: target legality
  type Src = { kind: 'skill' | 'card'; card: CardInstance };
  const sources: Src[] = [];
  for (const h of boardOf(me)) {
    const b = skillBlocked(G, pid, h);
    if (filterForSkill(h) && (b === null || b === 'souls')) sources.push({ kind: 'skill', card: h });
  }
  for (const c of me.hand) if (filterForHandCard(c)) sources.push({ kind: 'card', card: c });
  const targets: (CardInstance | Ghost | undefined)[] = [undefined, 'ghost', ...boardUnits(G)];
  for (let n = 0; n < opts.targetCombos && sources.length; n++) {
    const src = pickOne(sources, rnd);
    const tgt = pickOne(targets, rnd);
    const filter = src.kind === 'skill' ? filterForSkill(src.card)! : filterForHandCard(src.card)!;
    if (filter === 'noTarget' && tgt !== undefined) continue; // an unused extra target is harmless
    const tCard = tgt === 'ghost' ? undefined : tgt;
    let legal: boolean;
    if (filter === 'equipment') {
      const bearer = tCard;
      legal = targetLegal('equipment', bearer, undefined, pid)
        && !!bearer
        && !(bearer.attached ?? []).some((a) => a.cardId === src.card.cardId)
        && (bearer.attached ?? []).filter((a) => CARDS_BY_ID[a.cardId]?.type === 'equipment').length < MAX_EQUIPMENT_PER_HERO;
    } else if (src.kind === 'card' && filter === 'self') {
      // Yamato's self-cast ultimate: aimed at nothing, it lands on its own living hero; aimed at
      // that hero it does the same. Nothing else is a legal target.
      const linkedId = (CARDS_BY_ID[src.card.cardId] as { linkedHero?: string }).linkedHero;
      const own = boardOf(me).find((c) => c.cardId === linkedId && !isRespawning(c));
      legal = !!own && (tgt === undefined || (tCard !== undefined && tCard.iid === own.iid));
    } else {
      legal = targetLegal(filter, tCard, src.kind === 'skill' ? src.card : undefined, pid);
    }
    const args = [src.card.iid, tgt === 'ghost' ? 'ghost-iid' : tCard?.iid];
    const name = src.kind === 'skill' ? 'useSkill' : 'playCard';
    const r = callMove(G, ctx, pid, name, args, (g) => { g.players[pid].souls = 10; });
    const accepted = r.outcome === 'accepted';
    const f = String(filter);
    if (accepted && !legal) {
      add(`accepts-illegal-target:${f}:${why(filter, tgt, pid)}`, name, args, `${name} ${src.card.cardId}#${src.card.iid} -> ${tgt === 'ghost' ? 'unknown iid' : tCard ? `${tCard.cardId}#${tCard.iid}${isRespawning(tCard) ? ' (corpse)' : ''}` : 'no target'} was accepted; filter ${f} forbids it`);
    } else if (!accepted && legal) {
      const remSlot = filter === 'equipment' && !!tCard && (tCard.attached ?? []).some(isMergedRem);
      add(`rejects-legal-target:${f}`, name, args, `${name} ${src.card.cardId}#${src.card.iid} -> ${tCard?.cardId}#${tCard?.iid} is legal for filter ${f} but the engine ${r.outcome} it`, remSlot ? ['reason:rem-counted-as-slot'] : []);
    }
  }

  // ---------------------------------------------------------------- E: moveHero
  if (rnd() < opts.moveHeroSweep) {
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
        else {
          const a = get(from), b = get(to);
          if (!a) reason = 'no-hero-at-from';
          else if (!b) reason = 'hole'; // a swap trades two occupied slots
          else if (from === 0 || to === 0) {
            const incoming = from === 0 ? b : a;
            if (isRespawning(a) || isRespawning(b)) reason = 'corpse-swap';
            else if (isBenchOnly(incoming)) reason = 'bench-only-to-active';
            else legal = true;
          } else legal = true;
        }
        const r = callMove(G, ctx, pid, 'moveHero', [from, to], (g) => { g.players[pid].souls = Math.max(g.players[pid].souls, RETREAT_COST); });
        const accepted = r.outcome === 'accepted';
        if (accepted && !legal) add(`moveHero-accepts-illegal:${reason}`, 'moveHero', [from, to], `moveHero(${String(from)}, ${String(to)}) accepted; rules say ${reason}`);
        else if (!accepted && legal) add('moveHero-rejects-legal', 'moveHero', [from, to], `moveHero(${from}, ${to}) is a legal swap but the engine ${r.outcome} it`);
      }
    }
  }

  // ---------------------------------------------------------------- F: an owed promotion
  if (G.pendingPromotion === pid) {
    const probes: { name: string; args: unknown[] }[] = [{ name: 'endTurn', args: [] }];
    const free = me.hand.find((c) => CARDS_BY_ID[c.cardId]?.type === 'spell' && filterForHandCard(c) === 'noTarget');
    if (free) probes.push({ name: 'playCard', args: [free.iid] });
    for (const p of probes) {
      const r = callMove(G, ctx, pid, p.name, p.args, (g) => { g.players[pid].souls = 10; });
      if (r.outcome === 'accepted') add('owed-promotion-skippable', p.name, p.args, `P${pid} owes a promotion (pendingPromotion) yet ${p.name} is accepted`);
    }
  }
}

