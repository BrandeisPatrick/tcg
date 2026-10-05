import type { Ctx } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { GameState, PlayerID, CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { otherPlayer, liveBoardCards, baseAttack, effectiveSpirit, isBlocked, isRespawning, stepInCandidates, wornEquipment } from '@/engine/query';
import { getAbility, type TargetFilter } from '@/abilities';
import { MAX_EQUIPMENT_PER_HERO, RETREAT_COST, SKILL_COST } from '@/engine/constants';
import { DeadlockGame } from '@/engine/game';
import { attackBlocked } from '@/engine/legality';
import { forecastAttack } from '@/engine/forecast';

// ----- 1-ply lookahead -------------------------------------------------------
// The crude per-move scores below only generate the LEGAL move list; the actual
// ranking comes from simulating each move on a cloned state and scoring the
// resulting position with evalState. This is what lifts the AI from ~random to
// actually-playing: it captures target selection, lethal, and resource value
// without hand-tuning every case.
//
// A turn is the player's to spend on cards, skills and a retreat in any order,
// with at most one attack among them — and ending the turn never attacks, so
// the AI has to choose `attack` itself. The Active either attacks or uses its
// skill, so every line is valued with the attack it leaves on the table.

/** A hero's offensive potential: bullet attack PLUS its damaging skill's output
 *  (base + Spirit if it scales). This is what makes the lookahead ITEMIZE — a
 *  Spirit item raises a caster's threat (its skill), a Weapon item raises an
 *  attacker's, so the AI routes each build axis onto the hero that wants it. */
function heroThreat(c: CardInstance): number {
  const data = CARDS_BY_ID[c.cardId];
  // The hero's stat attack, before Weaken and conditional bonuses: the number
  // this heuristic was tuned on (a swing's real damage is `attackPower`).
  let t = baseAttack(c);
  if (data?.type === 'hero' && data.skill) {
    const ab = getAbility(data.skill);
    if (ab && ab.base != null) t += ab.base + (ab.scalesSpirit ? effectiveSpirit(c) : 0);
  }
  return t;
}

/** Position value from `pid`'s perspective (higher = better for pid). */
// Value of a hero's attached equipment's ABILITY procs (lifesteal, burst,
// resist, draw, etc.). Stat-stick bonuses (+atk/+spirit/+hp) are already
// reflected via heroThreat/hp, so this only scores the proc gear the bot was
// previously blind to — without it the 1-ply lookahead sees no benefit to
// equipping a proc item (attaching changes nothing on the board *this* turn).
function equipValue(c: CardInstance): number {
  if (!c.attached) return 0;
  let v = 0;
  for (const eq of c.attached) {
    const data = CARDS_BY_ID[eq.cardId];
    if (data?.type !== 'equipment' || !data.abilities) continue;
    for (const aid of data.abilities) {
      const ab = getAbility(aid);
      v += ab?.base ?? 3; // magnitude proxy; non-magnitude procs get a flat 3
    }
    if (eq.charges != null) v += eq.charges; // card-draw fuses
  }
  return v;
}

function evalState(g: GameState, pid: PlayerID): number {
  const en = otherPlayer(pid);
  const me = g.players[pid];
  const foe = g.players[en];
  // Patron HP is the win condition — weight it heavily.
  let s = (me.hp - foe.hp) * 12;
  const tally = (ps: typeof me, sign: number) => {
    for (const c of liveBoardCards(ps)) {
      // Shield absorbs damage before HP, so a point of shield is worth a
      // point of HP — weight it like HP (×2), not ×1 (which made the bot
      // under-value/under-cast shielders like Warden).
      const shield = c.statuses.find((x) => x.id === 'shield')?.value ?? 0;
      s += sign * (3 + c.hp * 2 + heroThreat(c) * 1.5 + shield * 2 + equipValue(c) * 2);
    }
    for (const c of [ps.active, ...ps.bench]) {
      if (c && (c.respawnTurnsLeft ?? 0) > 0) s -= sign * 5; // corpse = lost presence
    }
  };
  tally(me, 1);
  tally(foe, -1);
  return s;
}

const SIM_CTX = (pid: PlayerID) => ({ currentPlayer: pid, numPlayers: 2, turn: 1 } as any);

/** Deep-clone G for safe simulation. Shallow-copy first with an empty log so we
 *  don't mutate the (frozen) live state and don't pay to clone the growing log. */
function cloneForSim(G: GameState): GameState {
  return structuredClone({ ...G, log: [] }) as GameState;
}

/** Apply one candidate move to a cloned state through the engine's own move.
 *  While the turn's attack is still available after it, the line is played
 *  through the attack too — "this move, then the attack" — so a buff, a bench
 *  skill or a retreat is valued by the attack it improves, and sees lethal;
 *  the Active's own skill, which forfeits the attack, is weighed honestly
 *  against attacking. `endTurn` is scored as the position stands: ending the
 *  turn forfeits the attack.
 *  Returns null for a move the engine rejects (or that throws): it changes
 *  nothing, so left in the ranking it would tie with passing and, with the
 *  bias toward acting, be picked over it — a turn spent on an invalid move. */
function simulateMove(G: GameState, pid: PlayerID, move: string, args: any[]): GameState | null {
  const g = cloneForSim(G);
  try {
    if (move !== 'endTurn') {
      const moves = (DeadlockGame as any).moves;
      const call = (name: string, ...a: any[]) =>
        moves[name]({ G: g, ctx: SIM_CTX(pid), playerID: pid, events: {} }, ...a);
      if (!moves[move] || call(move, ...args) === INVALID_MOVE) return null;
      if (attackBlocked(g, pid) === null) call('attack');
    }
  } catch {
    return null;
  }
  return g;
}

interface MoveOption {
  move: 'playCard' | 'useSkill' | 'attack' | 'endTurn' | 'moveHero' | 'promoteToActive' | 'draftPick';
  args: any[];
  score: number;
}

function isValidTarget(filter: TargetFilter, target: CardInstance | undefined, source: CardInstance | undefined, pid: PlayerID): boolean {
  if (filter === 'noTarget') return target === undefined;
  if (target === undefined) return false;
  const isAlly = target.ownerId === pid;
  switch (filter) {
    case 'self': return source !== undefined && target.iid === source.iid;
    case 'allyAny': return isAlly;
    case 'allyHero': return isAlly && CARDS_BY_ID[target.cardId]?.type === 'hero';
    case 'enemyAny': return !isAlly;
    case 'enemyHero': return !isAlly && CARDS_BY_ID[target.cardId]?.type === 'hero';
    case 'enemyActive': return !isAlly && target.zone === 'active';
    case 'anyBoard': return true;
  }
}

function abilityFiltersForCard(card: CardInstance): TargetFilter | null {
  const data = CARDS_BY_ID[card.cardId];
  if (!data) return null;
  if (data.type === 'spell' || data.type === 'ultimate') {
    const aid = data.abilities[0];
    return getAbility(aid)?.target ?? null;
  }
  if (data.type === 'equipment') {
    return 'allyHero';
  }
  return null;
}

function cardCost(card: CardInstance): number {
  const data = CARDS_BY_ID[card.cardId];
  if (!data) return 0;
  if (data.type === 'spell' || data.type === 'equipment' || data.type === 'ultimate') {
    return (data as any).cost ?? 0;
  }
  return 0;
}

function scorePlayCard(G: GameState, pid: PlayerID, card: CardInstance, target?: CardInstance): number {
  const data = CARDS_BY_ID[card.cardId];
  if (!data) return 0;
  const cost = cardCost(card);
  const ps = G.players[pid];
  let s = 5;
  if (data.type === 'spell') s += 20;
  if (data.type === 'equipment') {
    s += 10;
    if (data.bonus?.atk) s += data.bonus.atk * 6;
    if (data.bonus?.spirit) s += data.bonus.spirit * 6;  // Spirit gear was ignored — casters never built
    if (data.bonus?.hp) s += data.bonus.hp * 3;
  }
  if (data.type === 'ultimate') s += 30;
  if (target && target.ownerId !== pid) {
    s += 5;
    // Prefer targets we can kill outright
    if (data.type === 'spell' && target.hp <= 3) s += 25;
  }
  if (target && target.ownerId === pid && target.hp < target.hpMax / 2) s += 8;
  // Cost-efficiency: penalize plays that consume most of the pool with little overflow.
  // Encourages chaining cheap plays before dumping a mythic.
  if (cost >= 7) {
    const overflow = ps.souls - cost;
    if (overflow < 0) s -= 1000; // unaffordable; will be filtered, just in case
    else if (overflow < 1) s -= 6; // would empty our pool — still play if value is high
  }
  return s;
}

function scoreSkill(G: GameState, pid: PlayerID, hero: CardInstance, target?: CardInstance): number {
  const data = CARDS_BY_ID[hero.cardId];
  if (data?.type !== 'hero') return 0;
  let s = 12;
  if (target && target.ownerId !== pid) {
    s += 8;
    if (target.hp <= 3) s += 20;
  }
  if (target && target.ownerId === pid && target.hp < target.hpMax / 2) s += 14;
  return s;
}

/** Crude score for the turn's attack: the damage it would land on the rival
 *  Active, plus a premium for a KO. Without lookahead this is what keeps the
 *  attack near the top of the list next to the cards and skills. */
function scoreAttack(G: GameState, pid: PlayerID): number {
  const plan = forecastAttack(G, pid);
  return 15 + plan.damageToActive * 3 + (plan.defenderActiveKO ? 25 : 0);
}

/** True when the turn's attack, made now, wins the match. The attack is made
 *  on a copy through the engine's own move and the engine's own win check
 *  reads the result, so "lethal" means what the rules mean: the knockout's
 *  patron life, a board wipe, a Ricochet that drops the last bench hero, a
 *  merged Rem who walks off the fallen bearer — and a mutual wipe that goes
 *  to P0. */
function attackWins(G: GameState, pid: PlayerID): boolean {
  const g = simulateMove(G, pid, 'attack', []);
  return !!g && DeadlockGame.endIf?.({ G: g } as any)?.winner === pid;
}

export function enumerateAIMoves(G: GameState, ctx: Ctx, lookahead = true): MoveOption[] {
  const pid = ctx.currentPlayer as PlayerID;

  // Pre-match draft: only one move kind is legal. Score by stat sum +
  // rarity, with a small diversity nudge so the AI doesn't pick four glass
  // cannons. Returns sorted; the top option is the AI's pick.
  if (G.draft && G.draft.order[G.draft.currentIndex] === pid) {
    const myPicks = G.draft.picks[pid];
    const taken = myPicks.map((id) => CARDS_BY_ID[id]).filter((c) => c?.type === 'hero') as any[];
    const myAtk = taken.reduce((a, h) => a + (h.atk ?? 0), 0);
    const myHp = taken.reduce((a, h) => a + (h.hp ?? 0), 0);
    const opts: MoveOption[] = [];
    for (const id of G.draft.pool) {
      const h = CARDS_BY_ID[id];
      if (!h || h.type !== 'hero') continue;
      // Stat sum + rarity weight (rarer heroes are usually statlines + skill).
      let s = (h.atk ?? 0) + (h.hp ?? 0) + (h.rarity ?? 1) * 1.5;
      // Diversity nudge: if I'm already heavy on ATK, prefer HP; vice versa.
      if (myAtk > myHp + 3 && (h.hp ?? 0) > (h.atk ?? 0)) s += 2;
      if (myHp > myAtk + 3 && (h.atk ?? 0) > (h.hp ?? 0)) s += 2;
      // Tiny jitter so identical scores don't always tie the same way (boardgame.io's RNG isn't seeded here).
      s += Math.random() * 0.4;
      opts.push({ move: 'draftPick', args: [id], score: s });
    }
    return opts.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  const ps = G.players[pid];
  const out: MoveOption[] = [];
  const enemy = G.players[otherPlayer(pid)];

  // A promotion owed comes before anything else at the table — return it
  // alone. Owed by this seat, it is the only legal move (no playing cards
  // through a dead Active). Owed by the other seat, whose Active this seat's
  // attack or skill has just dropped, nobody moves on until that lane is
  // refilled: `promoteToActive` finds its owner from the bench hero, so it can
  // be made from whichever seat is asked. (On the board the local player
  // answers the prompt themselves and the AI loop waits rather than ask —
  // unless auto-play is driving their seat.)
  // Gated on the engine's pendingPromotion flag (set by `resolve`) — outside
  // that window the move is invalid. Highest HP first.
  if (G.pendingPromotion) {
    const owed = stepInCandidates(G.players[G.pendingPromotion])
      .map((b): MoveOption => ({ move: 'promoteToActive', args: [b.iid], score: 50_000 + b.hp }))
      .sort((a, b) => b.score - a.score);
    if (owed.length > 0) return owed;
  }

  const enemyTargets = liveBoardCards(enemy);
  const allyTargets = liveBoardCards(ps);

  // The attack is offered exactly while the engine's gate is open — the same
  // `attackBlocked` the `attack` move checks.
  const attackOpen = attackBlocked(G, pid) === null;

  // --- Lethal short-circuit ---
  // An attack that wins the match goes first. Only our Active swings, and its
  // swings never reach the rival patron: the attack wins when its knockout
  // costs the last patron life, or leaves the rival with no hero standing.
  if (attackOpen) {
    out.push({ move: 'attack', args: [], score: attackWins(G, pid) ? 1_000_000 : scoreAttack(G, pid) });
  }

  // Play cards (cost-gated)
  for (const c of ps.hand) {
    const data = CARDS_BY_ID[c.cardId];
    if (!data) continue;
    if (cardCost(c) > ps.souls) continue; // unaffordable

    const filter = abilityFiltersForCard(c);

    if (data.type === 'spell' || data.type === 'ultimate') {
      if (filter === 'noTarget' || filter === null) {
        out.push({ move: 'playCard', args: [c.iid], score: scorePlayCard(G, pid, c) });
      } else {
        for (const t of [...enemyTargets, ...allyTargets]) {
          if (filter && isValidTarget(filter, t, undefined, pid)) {
            out.push({ move: 'playCard', args: [c.iid, t.iid], score: scorePlayCard(G, pid, c, t) });
          }
        }
      }
    }

    if (data.type === 'equipment') {
      for (const t of allyTargets) {
        // A hero cannot wear two of the same item. (A merged Rem is not equipment:
        // she takes no slot and is never the piece to discard.)
        const worn = wornEquipment(t);
        if (worn.some((eq) => eq.cardId === c.cardId)) continue;
        if (worn.length < MAX_EQUIPMENT_PER_HERO) {
          out.push({ move: 'playCard', args: [c.iid, t.iid], score: scorePlayCard(G, pid, c, t) });
        } else {
          // Hero is full — discard the lowest-priority existing item to
          // make room. Use the same scorePlayCard heuristic to pick the
          // worst current piece (lowest score = least valuable to keep).
          let worst = worn[0];
          let worstScore = scorePlayCard(G, pid, worst, t);
          for (const eq of worn.slice(1)) {
            const s = scorePlayCard(G, pid, eq, t);
            if (s < worstScore) { worst = eq; worstScore = s; }
          }
          out.push({
            move: 'playCard',
            args: [c.iid, t.iid, worst.iid],
            score: scorePlayCard(G, pid, c, t) - worstScore,
          });
        }
      }
    }
  }

  // Use skills — each hero once a turn, SKILL_COST souls each (matches
  // game.ts useSkill). A hero that made the turn's attack has spent its
  // action; the Active's skill forfeits the attack, which the lookahead weighs.
  if (ps.souls >= SKILL_COST) for (const hero of allyTargets) {
    if (hero.skillUsedThisTurn || hero.attackedThisTurn) continue;
    const data = CARDS_BY_ID[hero.cardId];
    if (data?.type !== 'hero' || !data.skill) continue;
    // Stun / Silence / Sleep and a heavy channel all suppress skill use — engine
    // enforces this, the AI must respect it too or it'll burn a heuristic round
    // on an invalid move.
    if (isBlocked(hero, 'skill')) continue;
    const ability = getAbility(data.skill);
    if (!ability) continue;
    const filter = ability.target;

    if (filter === 'noTarget') {
      out.push({ move: 'useSkill', args: [hero.iid], score: scoreSkill(G, pid, hero) });
      continue;
    }
    if (filter === 'self') {
      out.push({ move: 'useSkill', args: [hero.iid, hero.iid], score: scoreSkill(G, pid, hero, hero) });
      continue;
    }
    for (const t of [...enemyTargets, ...allyTargets]) {
      if (isValidTarget(filter, t, hero, pid)) {
        out.push({ move: 'useSkill', args: [hero.iid, t.iid], score: scoreSkill(G, pid, hero, t) });
      }
    }
  }

  // Retreat: swap Active with a fresh bench hero (costs RETREAT_COST souls).
  // Score positively when Active is in serious trouble and bench has a healthier option.
  if (ps.active && !isRespawning(ps.active) && ps.souls >= RETREAT_COST) {
    const activeHpFrac = ps.active.hp / Math.max(1, ps.active.hpMax);
    const activeStunned = ps.active.statuses.some(
      (s) => s.id === 'stun' || s.id === 'silenced' || s.id === 'disarm',
    );
    for (const benchHero of stepInCandidates(ps)) {
      const benchHpFrac = benchHero.hp / Math.max(1, benchHero.hpMax);
      // Only retreat if the bench replacement is meaningfully fresher.
      if (benchHpFrac - activeHpFrac < 0.25 && !activeStunned) continue;
      let s = 10;
      if (activeHpFrac < 0.35) s += 30; // about to die
      if (activeStunned) s += 18;       // CC'd active is dead weight
      s += Math.round((benchHpFrac - activeHpFrac) * 20);
      out.push({ move: 'moveHero', args: [ps.bench.indexOf(benchHero) + 1, 0], score: s });
    }
  }

  // Always offer the pass move as fallback: ending the turn, which gives up
  // an attack not yet made.
  out.push({ move: 'endTurn', args: [], score: 1 });

  // Re-rank every legal move by 1-ply lookahead: simulate it and score the
  // resulting position. A tiny bias toward acting (vs. passing) breaks ties so
  // the AI takes value-neutral tempo plays instead of idling. Skipped when used
  // as a plain legal-move enumerator (e.g. inside the MCTS bot's rollouts).
  if (lookahead) {
    const ranked: MoveOption[] = [];
    for (const opt of out) {
      const g2 = simulateMove(G, pid, opt.move, opt.args);
      if (!g2) continue;
      opt.score = evalState(g2, pid) + (opt.move === 'endTurn' ? 0 : 0.1);
      ranked.push(opt);
    }
    return ranked.sort((a, b) => b.score - a.score).slice(0, 12);
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}
