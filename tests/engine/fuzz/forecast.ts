/**
 * Forecast probe: when the attack is open, `forecastAttack` (what the board shows, what the
 * choreographer walks and what the AI scores) must equal the attack the `attack` move then
 * makes. The forecast IS that attack run on a copy, so this is the check that it stays so:
 * the move is made on a clone through the game's own move function and everything the forecast
 * claims is read back off the result — the target's HP and fate, the patron, and the very
 * events the attack appends to G.fx (same seqs).
 */
import type { Ctx } from 'boardgame.io';
import type { GameState, PlayerID } from '@/engine/types';
import { enumerateAIMoves } from '@/ai/heuristic';
import { attackBlocked } from '@/engine/legality';
import { forecastAttack, simulate, type AttackPlan } from '@/engine/forecast';
import { isRespawning, otherPlayer } from '@/engine/query';
import { DeadlockGame } from '@/engine/game';
import type { Snapshot, StepInfo } from './driver';
import { signatureOf, type Hit } from './hits';
import { boardOf, callMove, describeUnit, diffPaths } from './oracle';

interface Mismatch { check: string; message: string }

interface Evaluation {
  plan: AttackPlan;
  mismatches: Mismatch[];
  /** The game after the real attack. */
  after: GameState;
}

/** The forecast of the attack `pid` could make now, against the attack made on a clone. */
function evaluate(G: GameState, ctx: Ctx, pid: PlayerID):
  Evaluation | { kind: 'blocked' } | { kind: 'rejected'; how: string } | { kind: 'missing' } {
  if (attackBlocked(G, pid) !== null) return { kind: 'blocked' };
  const foe = otherPlayer(pid);
  const tgt = G.players[foe].active!;
  const plan = forecastAttack(G, pid);
  const r = callMove(G, ctx, pid, 'attack', []);
  if (r.outcome !== 'accepted') return { kind: 'rejected', how: r.outcome };
  const t2 = boardOf(r.G.players[foe]).find((c) => c.iid === tgt.iid);
  if (!t2) return { kind: 'missing' };

  const mismatches: Mismatch[] = [];
  const fell = isRespawning(t2) || t2.hp <= 0;
  const lost = Math.max(0, tgt.hp - t2.hp);
  const last = plan.steps[plan.steps.length - 1];
  if ((plan.defenderActiveKO !== null) !== fell || (fell && plan.defenderActiveKO !== tgt.iid)) {
    mismatches.push({ check: 'forecast-ko', message: `plan.defenderActiveKO=${plan.defenderActiveKO} but the target ${fell ? 'fell' : 'survived'} (hp ${tgt.hp} -> ${t2.hp})` });
  }
  if (plan.damageToActive !== lost) {
    mismatches.push({ check: 'forecast-damage', message: `plan.damageToActive ${plan.damageToActive} but the target went ${tgt.hp} -> ${t2.hp} (lost ${lost})` });
  }
  const patronLost = G.players[foe].hp - r.G.players[foe].hp;
  if (plan.patronDamage !== patronLost) {
    mismatches.push({ check: 'forecast-patron', message: `plan.patronDamage ${plan.patronDamage} but the defender's patron lost ${patronLost}` });
  }
  if (!last) mismatches.push({ check: 'forecast-no-steps', message: 'attackBlocked is null yet the plan has no step' });
  else if (last.predictedHpAfter !== Math.max(0, t2.hp)) {
    mismatches.push({ check: 'forecast-final-hp', message: `last step predicts hp ${last.predictedHpAfter} but the target ends on ${t2.hp}` });
  }
  // What each swing's own hit took is what the stream says the basic hits took.
  const realHits = r.G.fx.slice(G.fx.length).filter((e) => e.kind === 'hit' && e.cast === 'attack' && e.iid === tgt.iid);
  const hitTotal = realHits.reduce((n, e) => n + (e.kind === 'hit' ? e.amount : 0), 0);
  const stepTotal = plan.steps.reduce((n, s) => n + s.finalDamage, 0);
  if (stepTotal !== hitTotal) {
    mismatches.push({ check: 'forecast-hits', message: `the steps' finalDamage adds to ${stepTotal} but the attack's own hits took ${hitTotal}` });
  }
  const events = simulate(G, pid, { type: 'attack' }).events;
  const d = diffPaths(events, r.G.fx.slice(G.fx.length), 3);
  if (d.length) mismatches.push({ check: 'forecast-events', message: `simulate's events differ from the real attack's: ${d.join(' ; ')}` });
  return { plan, mismatches, after: r.G };
}

/** Forecast-vs-attack mismatches for the attack `pid` could make now; empty when they
 *  agree (or the attack is blocked). For hand-built states in a spec. */
export function forecastMismatches(G: GameState, ctx: Ctx, pid: PlayerID): string[] {
  const e = evaluate(G, ctx, pid);
  return 'mismatches' in e ? e.mismatches.map((m) => `${m.check}: ${m.message}`) : [];
}

function contextTags(atkId: string, tgtId: string): string[] {
  return [`atk:${atkId}`, `tgt:${tgtId}`];
}

/** Run the attack on a clone and compare it with the forecast. Returns how many
 *  forecasts were checked (0 when the attack is blocked). */
export function probeForecast(snap: Snapshot, info: StepInfo, hits: Hit[], mix: string): number {
  const { G, ctx } = snap;
  if (G.draft || ctx.gameover) return 0;
  const pid = ctx.currentPlayer as PlayerID;
  const foe = otherPlayer(pid);
  const base = { mix, seed: info.seed, step: info.step, move: 'attack', args: [] as unknown[], chaos: false };
  const e = evaluate(G, ctx, pid);
  if ('kind' in e) {
    if (e.kind === 'blocked') return 0;
    if (e.kind === 'rejected') {
      hits.push({ ...base, signature: signatureOf('forecast-attack-rejected', 'attack', false), tags: [], message: `attackBlocked is null but the engine ${e.how} attack` });
    } else {
      hits.push({ ...base, signature: signatureOf('forecast-target-missing', 'attack', false), tags: [], message: 'the target left the board during the attack' });
    }
    return 1;
  }
  const atk = G.players[pid].active!;
  const tgt = G.players[foe].active!;
  const tags = contextTags(atk.cardId, tgt.cardId);
  for (const m of e.mismatches) {
    hits.push({
      ...base,
      signature: signatureOf(m.check, 'attack', false),
      tags,
      message: `${m.message} | attacker ${describeUnit(atk)} | target ${describeUnit(tgt)} | steps ${e.plan.steps.map((s) => `${s.finalDamage}->${s.predictedHpAfter}`).join(',')}`,
    });
  }

  // The AI's verdict: an attack that wins the game on the engine's own clone must
  // lead the legal-move list (score 1_000_000), and nothing else may claim to.
  const wins = DeadlockGame.endIf?.({ G: e.after } as never) as { winner?: PlayerID } | undefined;
  const lethal = wins?.winner === pid;
  const top = enumerateAIMoves(G, ctx, false)[0];
  if (lethal && !(top && top.move === 'attack')) {
    hits.push({ ...base, signature: signatureOf('lethal-ordering', 'attack', false), tags, message: `the attack wins the match on a clone but enumerateAIMoves leads with ${top?.move}` });
  }
  if (lethal) {
    // With lookahead on, the score is the position value, not the 1_000_000 verdict: the best
    // move (then the attack, as simulateMove plays it) must still win the match.
    const best = enumerateAIMoves(G, ctx)[0];
    let wins = best?.move === 'attack';
    if (!wins && best) {
      const r1 = callMove(G, ctx, pid, best.move, best.args);
      const ended = (g: GameState) => (DeadlockGame.endIf?.({ G: g } as never) as { winner?: PlayerID } | undefined)?.winner === pid;
      if (r1.outcome === 'accepted') {
        wins = ended(r1.G);
        if (!wins) {
          const r2 = callMove(r1.G, ctx, pid, 'attack', []);
          wins = r2.outcome === 'accepted' && ended(r2.G);
        }
      }
    }
    if (!wins) {
      hits.push({ ...base, signature: signatureOf('lethal-missed-by-lookahead', 'attack', false), tags, message: `a winning attack is available but the heuristic (lookahead on) leads with ${best?.move}(${JSON.stringify(best?.args)})` });
    }
  }
  if (!lethal && top && top.score >= 1_000_000) {
    hits.push({ ...base, signature: signatureOf('lethal-false-positive', 'attack', false), tags, message: 'enumerateAIMoves flags the attack as lethal but the clone does not end the game' });
  }
  return 1;
}
