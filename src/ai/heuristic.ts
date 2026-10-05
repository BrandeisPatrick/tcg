/**
 * The AI. It knows no rules: the moves it considers are the engine's own
 * `legalActions` (legality.ts), so everything it offers is something the engine
 * has already said yes to, and it never has to be taught a new rule. What is
 * left here is judgement — how good a move, or the position it leaves, is.
 *
 * With lookahead (the default) every candidate is made on a copy through the
 * engine (`simulate`), and the resulting position is scored by `evalState`.
 * That captures target choice, lethal and the value of gear and skills without
 * hand-tuning each case. A turn is the player's to spend on cards, skills and a
 * retreat in any order, with at most one attack among them — and ending the turn
 * never attacks, so the AI has to choose `attack` itself. The Active either
 * attacks or uses its skill, so every line is valued with the attack it leaves
 * on the table.
 *
 * Without lookahead (the eval framework's random agent, the MCTS bot's rollouts)
 * the moves are only listed, ranked by cheap per-move scores.
 */
import type { Ctx } from 'boardgame.io';
import type { GameState, PlayerID, CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { CC_STATUSES } from '@/statuses';
import { checkWinner, effectiveAtk, effectiveSpirit, findCardOnBoard, liveBoardCards, otherPlayer } from '@/engine/query';
import { getAbility } from '@/abilities';
import { perform, type Action } from '@/engine/engine';
import { attackBlocked, cardCost, legalActions } from '@/engine/legality';
import { forecastAttack, simulate } from '@/engine/forecast';

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

/** What a won game is worth, in the units of `evalState`: more than any position. */
const DECISIVE = 1_000_000;

/** Position value from `pid`'s perspective (higher = better for pid). */
function evalState(g: GameState, pid: PlayerID): number {
  // A match that is over is not "a good position": it is the one that must
  // rank first (or, lost, last). The engine's own win check says which.
  const won = checkWinner(g)?.winner;
  if (won) return won === pid ? DECISIVE : -DECISIVE;
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

interface MoveOption {
  move: 'playCard' | 'useSkill' | 'attack' | 'endTurn' | 'moveHero' | 'promoteToActive' | 'draftPick';
  args: any[];
  score: number;
}

/** An engine action in the form the callers dispatch: the boardgame.io move and
 *  its arguments (playCard [card, target?, discard?], useSkill [hero, target?],
 *  moveHero [from, to], promoteToActive [iid], attack [], endTurn []). */
function toMove(a: Action): Pick<MoveOption, 'move' | 'args'> {
  const present = (...xs: (string | undefined)[]) => xs.filter((x): x is string => x !== undefined);
  switch (a.type) {
    case 'playCard': return { move: 'playCard', args: present(a.cardIid, a.targetIid, a.discardIid) };
    case 'useSkill': return { move: 'useSkill', args: present(a.heroIid, a.targetIid) };
    case 'moveHero': return { move: 'moveHero', args: [a.fromSlot, a.toSlot] };
    case 'promoteToActive': return { move: 'promoteToActive', args: [a.benchIid] };
    case 'attack': return { move: 'attack', args: [] };
    case 'endTurn': return { move: 'endTurn', args: [] };
  }
}

// ----- the crude per-move scores ---------------------------------------------
// What ranks the plain list (no lookahead), fed by the action: cards and skills
// above passing, the attack by the damage it would land.

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
  // Cost-efficiency: penalize plays that would empty the pool of a big spend.
  // Encourages chaining cheap plays before dumping a mythic.
  if (cost >= 7 && ps.souls - cost < 1) s -= 6;
  return s;
}

function scoreSkill(pid: PlayerID, target?: CardInstance): number {
  let s = 12;
  if (target && target.ownerId !== pid) {
    s += 8;
    if (target.hp <= 3) s += 20;
  }
  if (target && target.ownerId === pid && target.hp < target.hpMax / 2) s += 14;
  return s;
}

/** What the attack is worth to the crude list: a win outranks everything; else
 *  the damage it would land on the rival Active, plus a premium for a KO. With
 *  lookahead a win is `evalState`'s verdict instead. Both are read off the
 *  engine's own run of the attack — "wins" means what the rules mean: the
 *  knockout's patron life, a board wipe, a Ricochet that drops the last bench
 *  hero, a merged Rem who walks off the fallen bearer, and a mutual wipe that
 *  goes to P0. */
function scoreAttack(G: GameState, pid: PlayerID): number {
  if (checkWinner(simulate(G, pid, { type: 'attack' }).G)?.winner === pid) return DECISIVE;
  const plan = forecastAttack(G, pid);
  return 15 + plan.damageToActive * 3 + (plan.defenderActiveKO ? 25 : 0);
}

/** A retreat's score, or null when the swap is not worth its souls. It is worth
 *  them when the hero stepping in is much fresher, or when the Active is
 *  crowd-controlled (dead weight whatever its HP). The AI still offers a retreat
 *  that is not worth it — the engine allows it — but ranks it behind everything. */
function retreatPoints(active: CardInstance, incoming: CardInstance): number | null {
  const activeFrac = active.hp / Math.max(1, active.hpMax);
  const gain = incoming.hp / Math.max(1, incoming.hpMax) - activeFrac;
  const deadWeight = active.statuses.some((s) => CC_STATUSES.has(s.id));
  if (gain < 0.25 && !deadWeight) return null;
  let s = 10;
  if (activeFrac < 0.35) s += 30; // about to die
  if (deadWeight) s += 18;
  return s + Math.round(gain * 20);
}

/** Where a retreat that is not worth it ranks: behind passing, behind every
 *  real play, but still in the list. */
const NOT_WORTH_IT = -1000;

/** The retreat `a` makes: who leaves the Active slot and who takes it. */
function retreatPair(G: GameState, pid: PlayerID, a: Extract<Action, { type: 'moveHero' }>) {
  const ps = G.players[pid];
  return { active: ps.active!, incoming: ps.bench[a.fromSlot - 1]! };
}

function crudeScore(G: GameState, pid: PlayerID, a: Action): number {
  switch (a.type) {
    case 'attack': return scoreAttack(G, pid);
    case 'playCard': {
      const card = G.players[pid].hand.find((c) => c.iid === a.cardIid)!;
      const target = a.targetIid ? findCardOnBoard(G, a.targetIid)?.card : undefined;
      // Gear named to go is weighed as the play it would be: the better the piece, the less this is worth.
      const gone = a.discardIid ? target?.attached?.find((e) => e.iid === a.discardIid) : undefined;
      return scorePlayCard(G, pid, card, target) - (gone ? scorePlayCard(G, pid, gone, target) : 0);
    }
    case 'useSkill': return scoreSkill(pid, a.targetIid ? findCardOnBoard(G, a.targetIid)?.card : undefined);
    case 'moveHero': {
      const { active, incoming } = retreatPair(G, pid, a);
      return retreatPoints(active, incoming) ?? NOT_WORTH_IT;
    }
    // A promotion owed comes before everything: the healthiest hero steps up.
    case 'promoteToActive': return 50_000 + findCardOnBoard(G, a.benchIid)!.card.hp;
    case 'endTurn': return 1;
  }
}

// ----- the lookahead ----------------------------------------------------------

/** The position after `a`, on a copy. While the turn's attack is still available
 *  after it, the line is played through the attack too — "this move, then the
 *  attack" — so a buff, a bench skill or a retreat is valued by the attack it
 *  improves, and sees lethal; the Active's own skill, which forfeits the attack,
 *  is weighed honestly against attacking. `endTurn` is scored as the position
 *  stands: ending the turn forfeits the attack. */
function lineAfter(G: GameState, pid: PlayerID, a: Action): GameState {
  if (a.type === 'endTurn') return G;
  const { G: g } = simulate(G, pid, a);
  if (attackBlocked(g, pid) === null) perform(g, pid, { type: 'attack' });
  return g;
}

/** The lookahead's score for `a`: the value of the position it leads to. A tiny
 *  bias toward acting (vs. passing) breaks ties so the AI takes value-neutral
 *  tempo plays instead of idling. A retreat that is not worth its souls is
 *  marked down so it ranks behind real plays — unless it wins the match. */
function lookaheadScore(G: GameState, pid: PlayerID, a: Action): number {
  let s = evalState(lineAfter(G, pid, a), pid) + (a.type === 'endTurn' ? 0 : 0.1);
  if (a.type === 'moveHero') {
    const { active, incoming } = retreatPair(G, pid, a);
    if (retreatPoints(active, incoming) === null) s += NOT_WORTH_IT;
  }
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

  // Everything the engine allows, in its order: the attack, cards, skills,
  // retreats, promotions, and ending the turn last. While a promotion is owed
  // that is the promotion alone — for whichever seat owes it, made from either
  // (on the board the local player answers the prompt themselves and the AI
  // loop waits rather than ask, unless auto-play is driving their seat).
  const actions = legalActions(G, pid);

  // A promotion needs no weighing: the healthiest hero steps up.
  if (G.pendingPromotion) {
    return actions
      .map((a): MoveOption => ({ ...toMove(a), score: crudeScore(G, pid, a) }))
      .sort((a, b) => b.score - a.score);
  }

  const options = actions.map((a): MoveOption => ({
    ...toMove(a),
    score: lookahead ? lookaheadScore(G, pid, a) : crudeScore(G, pid, a),
  }));
  return options.sort((a, b) => b.score - a.score).slice(0, 12);
}
