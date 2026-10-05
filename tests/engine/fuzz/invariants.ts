/**
 * State invariants for the Deadlock TCG engine. `checkInvariants` looks at ONE
 * state; `checkTransition` looks at a state pair (before / after one move).
 *
 * Every violation has a stable `id` (kebab-case invariant name) and a `key`
 * (id + the thing it is about) so a driver can report a violation once, when it
 * first appears, instead of on every later step of a corrupted game.
 *
 * Nothing here mutates G (it is frozen by immer in a live client).
 */
import type { Ctx } from 'boardgame.io';
import type { CardInstance, GameState, PlayerID, PlayerState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { STATUSES_BY_ID } from '@/statuses';
import {
  LEVEL_ATK_BONUS, LEVEL_HP_BONUS, LEVEL_SPIRIT_BONUS, LEVEL_THRESHOLDS, MAX_EQUIPMENT_PER_HERO, MAX_HAND, MAX_LEVEL,
  RETREAT_COST, SKILL_COST, SOULS_MAX,
} from '@/engine/constants';
import { isRespawning, stepInCandidates } from '@/engine/query';
import { PIDS, boardOf, describeUnit, everyCard, isHeroCard, other } from './oracle';

export interface Violation {
  /** Invariant name, e.g. `hero-hp-range`. */
  id: string;
  /** id + subject; the edge-trigger key. */
  key: string;
  message: string;
}

const isBenchOnly = (c: CardInstance): boolean => {
  const d = CARDS_BY_ID[c.cardId];
  return d?.type === 'hero' && !!d.flags?.benchOnly;
};
const isMergedRem = (c: CardInstance): boolean => c.cardId === 'hero_rem' && c.remMergeTurnsLeft != null;

/** Invariants of a single state. */
export function collectInvariantViolations(G: GameState, ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  const add = (id: string, subject: string, message: string) =>
    out.push({ id, key: `${id}|${subject}`, message: `${id}: ${message}` });
  const over = !!ctx.gameover;
  const current = ctx.currentPlayer as PlayerID;

  // ---- uniqueness + zone bookkeeping over every card anywhere ----
  const seen = new Map<string, string>();
  for (const { card, place, pid } of everyCard(G)) {
    const prev = seen.get(card.iid);
    if (prev) add('iid-unique', card.iid, `iid ${card.iid} (${card.cardId}) is in both ${prev} and ${place} (P${pid})`);
    else seen.set(card.iid, place);
    if (card.ownerId !== pid) add('owner-matches', card.iid, `${card.cardId}#${card.iid} sits in P${pid}'s ${place} but ownerId is ${card.ownerId}`);
    if (place === 'hand' || place === 'deck' || place === 'discard') {
      if (card.zone !== place) add('zone-slot-match', card.iid, `${card.cardId}#${card.iid} in ${place} has zone '${card.zone}'`);
      if (isHeroCard(card) && !isMergedRem(card)) add('hero-in-pile', card.iid, `hero card ${card.cardId}#${card.iid} sits in P${pid}'s ${place}`);
    }
  }

  // ---- the draft ----
  if (G.draft) {
    const picked = [...G.draft.picks['0'], ...G.draft.picks['1']];
    const everyone = [...picked, ...G.draft.pool];
    if (new Set(everyone).size !== everyone.length) add('draft-picks', 'dup', 'a hero is both picked and in the pool, or picked twice');
    if (G.draft.picks['0'].length > 4 || G.draft.picks['1'].length > 4) add('draft-picks', 'len', 'a player drafted more than 4 heroes');
    if (G.draft.currentIndex !== picked.length) add('draft-picks', 'index', `currentIndex ${G.draft.currentIndex} != picks made ${picked.length}`);
  }
  if (G.log.length > 200) add('log-cap', 'log', `log has ${G.log.length} entries (cap 200)`);
  {
    let last = -Infinity;
    for (const e of G.fx ?? []) {
      if (!(e.seq > last)) { add('fx-seq-monotonic', 'fx', `fx seq ${e.seq} follows ${last}`); break; }
      last = e.seq;
    }
  }
  if (!G.draft && G.players['0'].archetype !== 'story') {
    // A drafted match has eight different heroes on the two boards.
    const roster = PIDS.flatMap((p) => boardOf(G.players[p]).flatMap((c) => [c, ...(c.attached ?? []).filter(isMergedRem)])).map((c) => c.cardId);
    const dupHero = roster.find((x, i) => roster.indexOf(x) !== i);
    if (dupHero) add('roster-duplicate', dupHero, `${dupHero} appears twice across the two rosters`);
  }

  for (const pid of PIDS) {
    const ps: PlayerState = G.players[pid];

    // ---- player scalars ----
    if (!Number.isFinite(ps.souls) || ps.souls < 0 || ps.souls > SOULS_MAX || !Number.isInteger(ps.souls)) {
      add('souls-range', pid, `P${pid} souls ${ps.souls} outside 0..${SOULS_MAX}`);
    }
    if (!Number.isFinite(ps.hp) || ps.hp > ps.hpMax) add('patron-range', pid, `P${pid} patron hp ${ps.hp} > hpMax ${ps.hpMax}`);
    if (!G.draft && ps.hp <= 0 && !over) add('patron-dead-no-gameover', pid, `P${pid} patron hp ${ps.hp} but the game is not over`);
    if (ps.hand.length > MAX_HAND) add('hand-size', pid, `P${pid} hand has ${ps.hand.length} > ${MAX_HAND} cards`);

    if (G.draft) continue; // no boards yet

    // ---- bench shape ----
    if (ps.bench.length !== 3) add('bench-length', pid, `P${pid} bench length ${ps.bench.length}, must be 3`);
    ps.bench.forEach((b, i) => {
      if (b === undefined) add('bench-length', `${pid}-undef${i}`, `P${pid} bench[${i}] is undefined (not null)`);
    });

    // ---- active ----
    if (!ps.active) {
      if (!over) add('active-present', pid, `P${pid} has no Active (a fallen Active stays in its slot as a corpse)`);
    } else {
      if (!isRespawning(ps.active) && isBenchOnly(ps.active)) {
        add('active-not-bench-only', pid, `P${pid}'s living Active is the bench-only hero ${describeUnit(ps.active)}`);
      }
      if (isRespawning(ps.active) && !over) {
        const candidates = stepInCandidates(ps).length;
        if (candidates > 0) {
          const owes = G.pendingPromotion === pid;
          if (pid === '1') add('active-corpse-unresolved', pid, `P1's Active is a corpse with ${candidates} step-in candidate(s); resolve() should have auto-promoted`);
          else if (!owes) add('active-corpse-unresolved', pid, `P0's Active is a corpse with ${candidates} step-in candidate(s) but G.pendingPromotion is ${G.pendingPromotion}`);
        }
      }
    }
    if (G.pendingPromotion === pid) {
      const needs = !!ps.active && isRespawning(ps.active) && stepInCandidates(ps).length > 0;
      if (!needs) add('pending-promotion-stale', pid, `G.pendingPromotion is P${pid} but nothing is owed (active ${describeUnit(ps.active)})`);
    }

    // ---- board units ----
    const units: { c: CardInstance; place: string; slot: number }[] = [];
    if (ps.active) units.push({ c: ps.active, place: 'active', slot: 0 });
    ps.bench.forEach((b, i) => { if (b) units.push({ c: b, place: `bench${i}`, slot: i + 1 }); });

    for (const { c, place, slot } of units) {
      if (place === 'active') {
        if (c.zone !== 'active' || c.slot !== 0) add('zone-slot-match', c.iid, `Active ${c.cardId}#${c.iid} has zone '${c.zone}' slot ${c.slot}`);
      } else if (c.zone !== 'bench' || c.slot !== slot) {
        add('zone-slot-match', c.iid, `${place} ${c.cardId}#${c.iid} has zone '${c.zone}' slot ${c.slot} (expected bench/${slot})`);
      }
      checkUnit(c, `${place} `);

      // equipment
      const att = c.attached ?? [];
      const equip = att.filter((a) => CARDS_BY_ID[a.cardId]?.type === 'equipment');
      if (equip.length > MAX_EQUIPMENT_PER_HERO) add('equipment-cap', c.iid, `${describeUnit(c)} wears ${equip.length} equipment (> ${MAX_EQUIPMENT_PER_HERO})`);
      const ids = equip.map((a) => a.cardId);
      const dup = ids.find((x, i) => ids.indexOf(x) !== i);
      if (dup) add('equipment-duplicate', c.iid, `${describeUnit(c)} wears two ${dup}`);
      for (const a of att) {
        const t = CARDS_BY_ID[a.cardId]?.type;
        if (t === 'equipment') {
          if (a.zone !== 'equipment' || a.attachedTo !== c.iid) add('zone-slot-match', a.iid, `equipment ${a.cardId}#${a.iid} on ${c.cardId}#${c.iid} has zone '${a.zone}' attachedTo ${a.attachedTo}`);
        } else if (isMergedRem(a)) {
          if (a.zone !== 'equipment' || a.attachedTo !== c.iid) add('zone-slot-match', a.iid, `merged Rem on ${c.cardId}#${c.iid} has zone '${a.zone}' attachedTo ${a.attachedTo}`);
          if ((a.remMergeTurnsLeft ?? 0) <= 0) add('rem-merge-turns', a.iid, `merged Rem has remMergeTurnsLeft ${a.remMergeTurnsLeft}`);
          if (isRespawning(c)) add('rem-on-corpse', a.iid, `Rem is still merged into the corpse ${describeUnit(c)}`);
          checkUnit(a, 'merged ');
        } else {
          add('attached-foreign', a.iid, `${a.cardId}#${a.iid} (${t}) is in ${c.cardId}#${c.iid}'s attached list but is neither equipment nor a merged Rem`);
        }
      }
    }

    // ---- turn flags ----
    for (const { c } of units) {
      if (isRespawning(c)) continue;
      if (pid !== current && (c.skillUsedThisTurn || c.attackedThisTurn)) {
        add('stale-turn-flag', c.iid, `P${pid} is not on turn but ${describeUnit(c)} has skillUsed=${c.skillUsedThisTurn} attacked=${c.attackedThisTurn}`);
      }
    }
  }

  // ---- a wiped board ends the game ----
  if (!G.draft && !over) {
    for (const pid of PIDS) {
      const heroes = boardOf(G.players[pid]).filter(isHeroCard);
      if (heroes.length > 0 && heroes.every((c) => isRespawning(c) || c.hp <= 0)) {
        add('board-wiped-no-gameover', pid, `every hero of P${pid} is down but the game is not over`);
      }
    }
  }

  // ---- the turn's attack ----
  if (!G.draft && !over) {
    const mover = G.players[current];
    const flagged = boardOf(mover).filter((c) => c.attackedThisTurn && !isRespawning(c));
    if (G.attackUsed) {
      const attackerGone = boardOf(mover).some((c) => isRespawning(c));
      if (flagged.length === 0 && !attackerGone) add('attack-flag', current, `G.attackUsed is set but no hero of P${current} has attackedThisTurn and none has fallen`);
    } else if (flagged.length > 0) {
      add('attack-flag', current, `${describeUnit(flagged[0])} has attackedThisTurn but G.attackUsed is false`);
    }
    if (G.turnNumber !== ctx.turn - G.draftTurnsOffset) {
      add('turn-number-sync', 'turn', `G.turnNumber ${G.turnNumber} != ctx.turn ${ctx.turn} - offset ${G.draftTurnsOffset}`);
    }
  }

  return out;

  /** hp / corpse / status / level checks for one hero instance. */
  function checkUnit(c: CardInstance, where: string) {
    const label = `${where}${describeUnit(c)}`;
    if (!Number.isFinite(c.hp) || !Number.isFinite(c.hpMax) || !Number.isInteger(c.hp) || !Number.isInteger(c.hpMax)) {
      add('hero-hp-range', c.iid, `non-integer hp on ${label}`);
    } else if (c.hp < 0 || c.hp > c.hpMax || c.hpMax < 1) {
      add('hero-hp-range', c.iid, `hp outside 0..hpMax or hpMax<1 on ${label}`);
    }
    const corpse = isRespawning(c);
    if (corpse) {
      if (c.hp !== 0) add('corpse-state', c.iid, `corpse has hp ${c.hp}: ${label}`);
      if (c.statuses.length > 0) add('corpse-state', `${c.iid}-status`, `corpse carries statuses: ${label}`);
    } else {
      if (c.respawnTurnsLeft != null && c.respawnTurnsLeft !== 0) add('corpse-state', `${c.iid}-timer`, `living hero has respawnTurnsLeft ${c.respawnTurnsLeft}: ${label}`);
      if (c.hp <= 0 && !over) add('living-hero-zero-hp', c.iid, `living hero with hp ${c.hp} was not reaped: ${label}`);
    }
    const seenIds = new Set<string>();
    for (const s of c.statuses) {
      if (!STATUSES_BY_ID[s.id]) add('status-sanity', `${c.iid}-${s.id}`, `unknown status ${s.id} on ${label}`);
      if (!(s.value > 0) || !(s.duration > 0)) add('status-sanity', `${c.iid}-${s.id}`, `status ${s.id} value ${s.value} duration ${s.duration} on ${label}`);
      if (seenIds.has(s.id)) add('status-duplicate', `${c.iid}-${s.id}`, `two ${s.id} statuses on ${label}`);
      seenIds.add(s.id);
    }
    if (isHeroCard(c) && c.level != null && (c.level < 1 || c.level > MAX_LEVEL)) add('level-range', c.iid, `level ${c.level} on ${label}`);
    if (isHeroCard(c) && c.level != null && c.level >= 1 && c.level <= MAX_LEVEL) {
      // exp is the surplus toward the next level: below its threshold, and 0 once the cap is reached.
      const exp = c.exp ?? 0;
      const limit = c.level >= MAX_LEVEL ? 1 : LEVEL_THRESHOLDS[c.level - 1];
      if (exp < 0 || exp >= limit) add('level-exp', c.iid, `exp ${exp} at level ${c.level} (must be < ${limit}) on ${label}`);
    }
  }
}

/** String form, as the task statement asks for: `[id] message`. */
export function checkInvariants(G: GameState, ctx: Ctx): string[] {
  return collectInvariantViolations(G, ctx).map((v) => v.message);
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** Heroes by iid, wherever they stand on a side's board (merged Rem included). */
function heroesByIid(ps: PlayerState): Map<string, CardInstance> {
  const m = new Map<string, CardInstance>();
  for (const c of boardOf(ps)) {
    if (isHeroCard(c)) m.set(c.iid, c);
    for (const a of c.attached ?? []) if (isHeroCard(a)) m.set(a.iid, a);
  }
  return m;
}

function hasDuplicateIids(G: GameState): boolean {
  const seen = new Set<string>();
  for (const { card } of everyCard(G)) {
    if (seen.has(card.iid)) return true;
    seen.add(card.iid);
  }
  return false;
}

export interface MoveInfo { name: string; args: unknown[] }

/** Rules about how one move may change the state. `accepted` is whether the
 *  client's state id advanced. */
export function collectTransitionViolations(
  before: { G: GameState; ctx: Ctx },
  after: { G: GameState; ctx: Ctx },
  move: MoveInfo,
  accepted: boolean,
): Violation[] {
  const out: Violation[] = [];
  const add = (id: string, subject: string, message: string) =>
    out.push({ id, key: `${id}|${subject}`, message: `${id}: ${message}` });

  if (!accepted) {
    if (after.G !== before.G) add('rejected-move-changed-state', move.name, `a rejected ${move.name} replaced G`);
    return out;
  }
  if (before.G.draft || after.G.draft) return out;

  // The patron only loses HP when one of its heroes falls: exactly 1 per hero
  // that went from alive to a corpse during this move, and never gains any.
  // (Skipped once an iid is duplicated: hero identity is the iid, and a clone of
  // a card — already reported as `iid-unique` — would make the count meaningless.)
  const duplicated = hasDuplicateIids(before.G) || hasDuplicateIids(after.G);
  for (const pid of duplicated ? [] : PIDS) {
    const b = before.G.players[pid];
    const a = after.G.players[pid];
    const was = heroesByIid(b);
    let fell = 0;
    const names: string[] = [];
    for (const [iid, h] of heroesByIid(a)) {
      const prev = was.get(iid);
      if (prev && !isRespawning(prev) && isRespawning(h)) { fell++; names.push(h.cardId); }
    }
    const drop = b.hp - a.hp;
    if (drop !== fell) {
      add('patron-delta', pid, `P${pid} patron hp ${b.hp} -> ${a.hp} (drop ${drop}) but ${fell} of its heroes fell [${names.join(',')}]`);
    }
  }

  // Cards do not vanish: every card (hero, equipment, spell…) anywhere before is
  // still somewhere after.
  for (const pid of PIDS) {
    const set = new Set(everyCard(after.G).filter((x) => x.pid === pid).map((x) => x.card.iid));
    for (const x of everyCard(before.G).filter((y) => y.pid === pid)) {
      if (!set.has(x.card.iid)) add('card-vanished', x.card.iid, `${x.card.cardId}#${x.card.iid} (${x.place}) of P${pid} is nowhere after ${move.name}`);
    }
  }

  // Turn ownership: only endTurn (or the last draft pick) hands the turn over.
  const switched = before.ctx.currentPlayer !== after.ctx.currentPlayer;
  if (!after.ctx.gameover) {
    if (move.name === 'endTurn' && !switched) add('turn-owner', 'endTurn', `endTurn was accepted but P${after.ctx.currentPlayer} is still on turn`);
    if (move.name !== 'endTurn' && switched) add('turn-owner', move.name, `${move.name} changed the player on turn from P${before.ctx.currentPlayer} to P${after.ctx.currentPlayer}`);
  }

  // Hand-over: the hero flags of the player whose turn ended are cleared.
  if (move.name === 'endTurn' && switched && !after.ctx.gameover) {
    const ended = before.ctx.currentPlayer as PlayerID;
    for (const c of boardOf(after.G.players[ended])) {
      if (!isRespawning(c) && (c.skillUsedThisTurn || c.attackedThisTurn)) {
        add('end-turn-flags', c.iid, `${describeUnit(c)} kept its turn flags after P${ended} ended the turn`);
      }
    }
    if (after.G.attackUsed) add('end-turn-flags', 'attackUsed', 'G.attackUsed is still set at the start of the next turn');
  }

  // A hero's level only goes up (it persists through death and respawn).
  for (const pid of duplicated ? [] : PIDS) {
    const now = heroesByIid(after.G.players[pid]);
    for (const [iid, h0] of heroesByIid(before.G.players[pid])) {
      const h1 = now.get(iid);
      if (h1 && (h1.level ?? 1) < (h0.level ?? 1)) add('level-monotonic', iid, `${h1.cardId}#${iid} level ${h0.level} -> ${h1.level}`);
    }
  }

  // ---- bookkeeping of what a move costs and gives ----
  const mover = before.ctx.currentPlayer as PlayerID;
  const foe = other(mover);
  const fellOf = (pid: PlayerID) => {
    const was = heroesByIid(before.G.players[pid]);
    let n = 0;
    for (const [iid, h] of heroesByIid(after.G.players[pid])) {
      const prev = was.get(iid);
      if (prev && !isRespawning(prev) && isRespawning(h)) n++;
    }
    return n;
  };
  const beforeHand = new Map(before.G.players[mover].hand.map((c) => [c.iid, c]));
  const arg0 = typeof move.args[0] === 'string' ? (move.args[0] as string) : undefined;
  const played = move.name === 'playCard' && arg0 ? beforeHand.get(arg0) : undefined;

  if (!duplicated && move.name !== 'endTurn' && move.name !== 'completeAction' && move.name !== 'mulligan') {
    // Souls: only the move's price and the KO bounty (+1 per enemy hero that fell, capped at 10).
    let cost = 0;
    if (played) {
      const d = CARDS_BY_ID[played.cardId];
      if (d && (d.type === 'spell' || d.type === 'equipment' || d.type === 'ultimate')) cost = played.costOverride ?? d.cost ?? 0;
    } else if (move.name === 'useSkill') cost = SKILL_COST;
    else if (move.name === 'moveHero') {
      const [f, t] = move.args as [number, number];
      const ps = before.G.players[mover];
      const get = (s: number) => (s === 0 ? ps.active : ps.bench[s - 1]);
      if ((f === 0 || t === 0) && get(f) && get(t)) cost = RETREAT_COST;
    }
    const wantMover = Math.min(SOULS_MAX, before.G.players[mover].souls - cost + fellOf(foe));
    if (after.G.players[mover].souls !== wantMover) {
      add('souls-delta', mover, `P${mover} souls ${before.G.players[mover].souls} -> ${after.G.players[mover].souls} after ${move.name}; price ${cost} and ${fellOf(foe)} KO bounty give ${wantMover}`);
    }
    const wantFoe = Math.min(SOULS_MAX, before.G.players[foe].souls + fellOf(mover));
    if (after.G.players[foe].souls !== wantFoe) {
      add('souls-delta', foe, `P${foe} souls ${before.G.players[foe].souls} -> ${after.G.players[foe].souls} after P${mover}'s ${move.name}; expected ${wantFoe}`);
    }
  }

  // A card played leaves the hand and lands in the discard pile (spell, ultimate) or on its bearer.
  if (!duplicated && played && arg0) {
    const stillThere = after.G.players[mover].hand.some((c) => c.iid === arg0);
    if (stillThere) add('play-card-leaves-hand', arg0, `${played.cardId}#${arg0} is still in the hand after playCard was accepted`);
    const t = CARDS_BY_ID[played.cardId]?.type;
    const spot = everyCard(after.G).find((x) => x.card.iid === arg0)?.place;
    const okSpot = t === 'equipment' ? spot?.startsWith('attached:') : spot === 'discard';
    if (!okSpot) add('play-card-destination', arg0, `${played.cardId} (${t}) ended in ${spot ?? 'nowhere'} after playCard`);
    // Equipment adds exactly its bonus (plus whatever level the +1 exp earns the bearer), and a
    // piece discarded to make room takes its own bonus away.
    const d = CARDS_BY_ID[played.cardId];
    const bearerIid = typeof move.args[1] === 'string' ? (move.args[1] as string) : undefined;
    if (d?.type === 'equipment' && bearerIid) {
      const b0 = boardOf(before.G.players[mover]).find((c) => c.iid === bearerIid);
      const b1 = boardOf(after.G.players[mover]).find((c) => c.iid === bearerIid);
      if (b0 && b1 && !isRespawning(b0)) {
        const lv = (b1.level ?? 1) - (b0.level ?? 1);
        const droppedCard = typeof move.args[2] === 'string' ? (b0.attached ?? []).find((a) => a.iid === move.args[2]) : undefined;
        const droppedData = droppedCard && b0.attached && (b0.attached.filter((a) => CARDS_BY_ID[a.cardId]?.type === 'equipment').length >= MAX_EQUIPMENT_PER_HERO)
          ? CARDS_BY_ID[droppedCard.cardId]
          : undefined;
        const gone = droppedData?.type === 'equipment' ? droppedData.bonus : undefined;
        const want = {
          atkMod: (d.bonus?.atk ?? 0) - (gone?.atk ?? 0) + lv * LEVEL_ATK_BONUS,
          hpMax: (d.bonus?.hp ?? 0) - (gone?.hp ?? 0) + lv * LEVEL_HP_BONUS,
          spiritMod: (d.bonus?.spirit ?? 0) - (gone?.spirit ?? 0) + lv * LEVEL_SPIRIT_BONUS,
        };
        for (const k of ['atkMod', 'hpMax', 'spiritMod'] as const) {
          if (b1[k] - b0[k] !== want[k]) add('equip-bonus', `${bearerIid}-${k}`, `${b1.cardId}#${bearerIid} ${k} ${b0[k]} -> ${b1[k]} after wearing ${d.id}; its bonus and ${lv} level-up(s) give ${want[k]}`);
        }
      }
    }
  }

  // Respawn timers: -1 on their owner's turn start, untouched otherwise; back at full HP on 0.
  if (!duplicated && !after.ctx.gameover) {
    const started = move.name === 'endTurn' && switched ? (after.ctx.currentPlayer as PlayerID) : undefined;
    for (const pid of PIDS) {
      const now = heroesByIid(after.G.players[pid]);
      for (const [iid, h0] of heroesByIid(before.G.players[pid])) {
        if (!isRespawning(h0)) continue;
        const h1 = now.get(iid);
        if (!h1) continue;
        const want = started === pid ? (h0.respawnTurnsLeft ?? 0) - 1 : h0.respawnTurnsLeft ?? 0;
        if (want > 0) {
          if (h1.respawnTurnsLeft !== want) add('respawn-timer', iid, `${h1.cardId}#${iid} respawn ${h0.respawnTurnsLeft} -> ${h1.respawnTurnsLeft} after ${move.name}; expected ${want}`);
        } else if (isRespawning(h1) || h1.hp !== h1.hpMax) {
          add('respawn-timer', iid, `${h1.cardId}#${iid} should be back at full HP (hp ${h1.hp}/${h1.hpMax}, respawn ${h1.respawnTurnsLeft})`);
        }
      }
    }
  }

  // A new turn: the turn counter steps by one, the souls are REFILLED to the table value
  // (1, 2 ... 10 over the player's first ten turns), and one card is drawn if there is room.
  if (move.name === 'endTurn' && switched && !after.ctx.gameover) {
    const cur = after.ctx.currentPlayer as PlayerID;
    if (after.G.turnNumber !== before.G.turnNumber + 1) add('turn-number-step', 'turn', `turnNumber ${before.G.turnNumber} -> ${after.G.turnNumber} after endTurn`);
    // A rival hero that falls while the turn is handed over (a Naptime burst at the end of its own
    // turn, reaped by the new turn's resolve) still pays its bounty on top of the refill.
    const bounty = fellOf(other(cur));
    const wantSouls = Math.min(SOULS_MAX, Math.floor((after.G.turnNumber - 1) / 2) + 1 + bounty);
    if (after.G.players[cur].souls !== wantSouls) add('souls-refill', cur, `P${cur} starts turn ${after.G.turnNumber} with ${after.G.players[cur].souls} souls, the refill table (+${bounty} KO bounty) says ${wantSouls}`);
    const pb = before.G.players[cur];
    const pa = after.G.players[cur];
    if (pb.hand.length < 7 && pb.deck.length > 0 && pa.deck.length !== pb.deck.length - 1) {
      add('turn-draw', cur, `P${cur} had room (hand ${pb.hand.length}) and ${pb.deck.length} cards in the deck but the deck went to ${pa.deck.length}`);
    }
    if ((pb.hand.length >= 7 || pb.deck.length === 0) && pa.deck.length !== pb.deck.length) {
      add('turn-draw', `${cur}-nodraw`, `P${cur} drew with a full hand or empty deck (deck ${pb.deck.length} -> ${pa.deck.length})`);
    }
  }
  return out;
}

export function checkTransition(
  before: { G: GameState; ctx: Ctx },
  after: { G: GameState; ctx: Ctx },
  move: MoveInfo,
  accepted: boolean,
): string[] {
  return collectTransitionViolations(before, after, move, accepted).map((v) => v.message);
}
