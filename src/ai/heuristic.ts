import type { Ctx } from 'boardgame.io';
import type { GameState, PlayerID, CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { otherPlayer, liveBoardCards, effectiveAtk, effectiveSpirit } from '@/engine/util';
import { getAbility, type TargetFilter } from '@/abilities';
import { MAX_EQUIPMENT_PER_HERO, DeadlockGame } from '@/engine/game';
import { resolveAttackPhase } from '@/engine/combat';

// ----- 1-ply lookahead -------------------------------------------------------
// The crude per-move scores below only generate the LEGAL move list; the actual
// ranking comes from simulating each move on a cloned state and scoring the
// resulting position with evalState. This is what lifts the AI from ~random to
// actually-playing: it captures target selection, lethal, and resource value
// without hand-tuning every case.

/** A hero's offensive potential: bullet attack PLUS its damaging skill's output
 *  (base + Spirit if it scales). This is what makes the lookahead ITEMIZE — a
 *  Spirit item raises a caster's threat (its skill), a Weapon item raises an
 *  attacker's, so the AI routes each build axis onto the hero that wants it. */
function heroThreat(c: CardInstance): number {
  const data = CARDS_BY_ID[c.cardId];
  let t = effectiveAtk(c);
  if (data?.type === 'hero' && data.skill) {
    const ab = getAbility(data.skill);
    if (ab && ab.base != null) t += ab.base + (ab.scalesSpirit ? effectiveSpirit(c) : 0);
  }
  return t;
}

/** Position value from `pid`'s perspective (higher = better for pid). */
function evalState(g: GameState, pid: PlayerID): number {
  const en = otherPlayer(pid);
  const me = g.players[pid];
  const foe = g.players[en];
  // Patron HP is the win condition — weight it heavily.
  let s = (me.hp - foe.hp) * 12;
  const tally = (ps: typeof me, sign: number) => {
    for (const c of liveBoardCards(ps)) {
      // Shield absorbs damage before HP and stops overflow reaching the patron,
      // so a point of shield is worth a point of HP — weight it like HP (×2),
      // not ×1 (which made the bot under-value/under-cast shielders like Warden).
      const shield = c.statuses.find((x) => x.id === 'shield')?.value ?? 0;
      s += sign * (3 + c.hp * 2 + heroThreat(c) * 1.5 + shield * 2);
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

/** Apply one candidate move to a cloned state. endTurn is simulated as "resolve
 *  my attack phase" so the AI can see combat / lethal outcomes. */
function simulateMove(G: GameState, pid: PlayerID, move: string, args: any[]): GameState {
  const g = cloneForSim(G);
  try {
    if (move === 'endTurn') {
      resolveAttackPhase(g, pid);
    } else {
      const fn = (DeadlockGame as any).moves[move];
      if (fn) fn({ G: g, ctx: SIM_CTX(pid), playerID: pid, events: {} }, ...args);
    }
  } catch { /* invalid sim → unchanged clone scores like a no-op */ }
  return g;
}

interface MoveOption {
  move: 'playCard' | 'useSkill' | 'endTurn' | 'moveHero' | 'promoteToActive' | 'draftPick';
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

  // If our Active is a corpse and we have an alive bench hero, the ONLY legal
  // move is to promote — return immediately so the AI doesn't try to play cards
  // through a dead Active.
  const activeIsCorpse = !!ps.active && (ps.active.respawnTurnsLeft ?? 0) > 0;
  if (activeIsCorpse) {
    for (let i = 0; i < ps.bench.length; i++) {
      const b = ps.bench[i];
      if (!b || (b.respawnTurnsLeft ?? 0) > 0) continue;
      const d = CARDS_BY_ID[b.cardId];
      if (d?.type !== 'hero' || d.flags?.benchOnly) continue;
      // Prefer the highest-HP candidate.
      out.push({ move: 'promoteToActive', args: [b.iid], score: 50_000 + b.hp });
    }
    if (out.length > 0) return out;
  }

  const enemyTargets = liveBoardCards(enemy);
  const allyTargets = liveBoardCards(ps);

  // --- Lethal short-circuit ---
  // If our Active alone can kill the enemy player (their Active dies and their HP hits 0), prioritize endTurn.
  // (Combat resolves at end of turn.)
  // Sum of our attackers vs their Active first, then face dmg.
  const ourAttackers = [...allyTargets].filter((c) => effectiveAtk(c) > 0);
  let totalDmg = ourAttackers.reduce((acc, c) => acc + effectiveAtk(c), 0);
  if (enemy.active && totalDmg >= enemy.active.hp + enemy.hp) {
    out.push({ move: 'endTurn', args: [], score: 1_000_000 });
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
        const slotsTaken = (t.attached ?? []).length;
        if (slotsTaken < MAX_EQUIPMENT_PER_HERO) {
          out.push({ move: 'playCard', args: [c.iid, t.iid], score: scorePlayCard(G, pid, c, t) });
        } else {
          // Hero is full — discard the lowest-priority existing item to
          // make room. Use the same scorePlayCard heuristic to pick the
          // worst current piece (lowest score = least valuable to keep).
          const attached = t.attached!;
          let worst = attached[0];
          let worstScore = scorePlayCard(G, pid, worst, t);
          for (const eq of attached.slice(1)) {
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

  // Use skills — only one skill per player per turn, and each skill costs
  // 1 soul (matches game.ts useSkill). Skip the whole branch if either rule
  // would reject every candidate up front.
  if (!ps.skillUsedThisTurn && ps.souls >= 1) for (const hero of allyTargets) {
    if (hero.skillUsedThisTurn) continue;
    const data = CARDS_BY_ID[hero.cardId];
    if (data?.type !== 'hero' || !data.skill) continue;
    // Stun / Silence / Sleep all suppress skill use — engine enforces this, the
    // AI must respect it too or it'll burn a heuristic round on an invalid move.
    if (hero.statuses.some((s) => s.id === 'silenced' || s.id === 'stun' || s.id === 'sleep')) continue;
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

  // Retreat: swap Active with a fresh bench hero (costs 2 souls).
  // Score positively when Active is in serious trouble and bench has a healthier option.
  const RETREAT_COST = 2;
  if (ps.active && ps.souls >= RETREAT_COST) {
    const activeHpFrac = ps.active.hp / Math.max(1, ps.active.hpMax);
    const activeStunned = ps.active.statuses.some(
      (s) => s.id === 'stun' || s.id === 'silenced' || s.id === 'disarm',
    );
    for (let i = 0; i < ps.bench.length; i++) {
      const benchHero = ps.bench[i];
      if (!benchHero) continue;
      const benchData = CARDS_BY_ID[benchHero.cardId];
      if (benchData?.type !== 'hero') continue;
      if (benchData.flags?.benchOnly) continue;
      const benchHpFrac = benchHero.hp / Math.max(1, benchHero.hpMax);
      // Only retreat if the bench replacement is meaningfully fresher.
      if (benchHpFrac - activeHpFrac < 0.25 && !activeStunned) continue;
      let s = 10;
      if (activeHpFrac < 0.35) s += 30; // about to die
      if (activeStunned) s += 18;       // CC'd active is dead weight
      s += Math.round((benchHpFrac - activeHpFrac) * 20);
      out.push({ move: 'moveHero', args: [(i + 1) as 1 | 2 | 3, 0], score: s });
    }
  }

  // Always offer endTurn as fallback
  out.push({ move: 'endTurn', args: [], score: 1 });

  // Re-rank every legal move by 1-ply lookahead: simulate it and score the
  // resulting position. A tiny bias toward acting (vs. passing) breaks ties so
  // the AI takes value-neutral tempo plays instead of idling. Skipped when used
  // as a plain legal-move enumerator (e.g. inside the MCTS bot's rollouts).
  if (lookahead) {
    for (const opt of out) {
      const g2 = simulateMove(G, pid, opt.move, opt.args);
      opt.score = evalState(g2, pid) + (opt.move === 'endTurn' ? 0 : 0.1);
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}
