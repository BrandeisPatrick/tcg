/**
 * State invariants for the Deadlock TCG engine. `checkInvariants` looks at ONE
 * state; `checkTransition` looks at a state pair (before / after one move).
 *
 * Every violation has a stable `id` (kebab-case invariant name) and a `key`
 * (id + the thing it is about) so a driver can report a violation once, when it
 * first appears, instead of on every later step of a corrupted game.
 *
 * The rules they hold the engine to are rules.md §2–§5 (souls, the turn's shop
 * and act steps, items, abilities) and the hand's (a card bought goes to the
 * hand and is played from it onto a hero), read through the oracles in
 * oracle.ts — written from the rules and the card texts, never from the
 * engine's own functions. The four the user named: `hand-owner` (a card in a
 * hand is its player's), `hand-bought-turn` (a hand card's `boughtOnTurn` is a
 * turn already played), `net-worth-hand` (net worth — the engine's, and the
 * one the income's comeback reads — counts the hand at list price) and
 * `play-slot-cap` (a card played never leaves a hero over its slot cap). The
 * map's (rules.md §6): each side's track and its order (`structures-*`), what a
 * push takes (`structure-delta`: a kill's level + 1, an empty lane's bullet
 * power, doubled from round 9), the flex slot (`flex-slot-walker`), the
 * Mid-Boss (`boss-*`), the Rejuvenator (`revive-*`), the respawn timer by the
 * round (`respawn-timer-start`) and the round cap (`round-cap`,
 * `game-over-winner`).
 *
 * Nothing here mutates G (it is frozen by immer in a live client).
 */
import type { Ctx } from 'boardgame.io';
import type { CardInstance, FxEvent, GameState, PlayerID, PlayerState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { STATUSES_BY_ID } from '@/statuses';
import { getAbility } from '@/abilities';
import {
  ACTIVE_COOLDOWN, BOSS_CARD_ID, BOSS_HP, BOSS_SOULS, BOSS_SPAWN_ROUND, COMEBACK_STEPS, EXP_ON_EQUIP, GUARDIAN_BOUNTY,
  HARD_CC_CHARGES, LANE_INCOME, LEVEL_ATK_BONUS, LEVEL_HP_BONUS, LEVEL_SPIRIT_BONUS, LEVEL_THRESHOLDS, MAX_LEVEL, PRICE,
  REVIVE_CREDITS, ROUND_CAP, SECOND_MOVER_FIRST_INCOME_BONUS, SKILL_COOLDOWN,
} from '@/engine/constants';
import { attackPower, isRespawning, netWorth, stepInCandidates } from '@/engine/query';
import {
  MAX_TOTAL_EXP, PIDS, activateBlockedOracle, activeCooldownOracle, boardOf, bountyOracle, buyBlockedOracle, buyPriceOracle,
  closeShopBlockedOracle, describeUnit, everyCard, handCardOf, handOf, hasSpikeOracle, heroesOfSide, isHeroCard, isMergedRem, itemData,
  killPushOracle, moveItemBlockedOracle, netWorthOracle, netWorthOracleWithoutHand, other, patronOf, playBlockedOracle,
  playConsumesOracle, pushMultiplierOracle, respawnTimerOracle, restoredBySaleOracle, retreatCostOracle, roundOracle,
  sellBlockedOracle, sellRefundOracle, slotCapOracle, slottedHeroOf, standingWinnerOracle, structureHpOracle, totalExp,
  ultCooldownOracle, ultLocked, wornItemOf, wornItemsOf, type ConsumedOracle, type RestoredOracle,
} from './oracle';

interface Violation {
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

/** The seat a person plays (seat 0 unless the state says otherwise; null: none). */
const humanOf = (G: GameState): PlayerID | null => (G.humanSeat === undefined ? '0' : G.humanSeat);
/** Who moves first, by the state (seat 0 when a hand-built state says nothing). */
const firstOf = (G: GameState): PlayerID => G.firstMover ?? '0';

/** Souls an active item pays out to whoever uses it, as its text says (Golden
 *  Goose Egg: "Gain 2 souls"). Written from the cards, not read off the engine. */
export const SOULS_ON_USE: Readonly<Record<string, number>> = { golden_goose_egg: 2 };

/** The moves of the shop step (rules.md §3). */
const SHOP_MOVES = ['buy', 'sell', 'moveItem', 'closeShop'];
/** Everything the shop step accepts: its own moves, a card played from the hand
 *  (legal in either step), ending the turn, an owed promotion and the board's
 *  reveal bookkeeping. */
const SHOP_STEP_MOVES = [...SHOP_MOVES, 'playCard', 'endTurn', 'promoteToActive', 'completeAction'];
/** The moves that put items on and take them off heroes: the shop's and a card played. */
const ITEM_MOVES = [...SHOP_MOVES, 'playCard'];

/** The full cooldown an active item of `tier` starts on (before any Cooldown item). */
const fullItemCooldown = (tier: number) => (tier <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high);

/** Invariants of a single state. */
export function collectInvariantViolations(G: GameState, ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  const add = (id: string, subject: string, message: string) =>
    out.push({ id, key: `${id}|${subject}`, message: `${id}: ${message}` });
  const over = !!ctx.gameover;
  const current = ctx.currentPlayer as PlayerID;

  // ---- uniqueness + ownership over every card anywhere (the hands included) ----
  const seen = new Map<string, string>();
  for (const { card, place, pid } of everyCard(G)) {
    const prev = seen.get(card.iid);
    if (prev) add('iid-unique', card.iid, `iid ${card.iid} (${card.cardId}) is in both ${prev} and ${place} (P${pid})`);
    else seen.set(card.iid, place);
    // A card in a hand is its player's (`hand-owner`); one on the board, its side's.
    if (card.ownerId !== pid) add(place === 'hand' ? 'hand-owner' : 'owner-matches', card.iid, `${card.cardId}#${card.iid} sits in P${pid}'s ${place} but ownerId is ${card.ownerId}`);
  }

  // ---- the hands: items bought (or given) and not yet played ----
  for (const pid of PIDS) {
    for (const c of handOf(G, pid)) {
      const d = itemData(c.cardId);
      const label = `${c.cardId}#${c.iid} in P${pid}'s hand`;
      // An item, in zone 'hand', worn by nobody, carrying nothing, set going by nothing yet:
      // its cooldown starts when it is played; no component is held for it. Only a hard
      // crowd-control item put back by a same-turn sale carries charges: the ones it had left.
      const wrong: string[] = [];
      if (!d) wrong.push('no item');
      if (c.zone !== 'hand') wrong.push(`zone '${c.zone}'`);
      if (c.attachedTo !== undefined) wrong.push(`attachedTo ${c.attachedTo}`);
      if ((c.attached ?? []).length) wrong.push(`carries ${c.attached!.map((a) => a.cardId).join('+')}`);
      if (Object.keys(c.cooldowns ?? {}).length) wrong.push(`cooldowns ${JSON.stringify(c.cooldowns)}`);
      const hardCC = d?.type === 'spell' && !!d.hardCC;
      if (c.charges !== undefined && (!hardCC || !Number.isInteger(c.charges) || c.charges < 0 || c.charges > HARD_CC_CHARGES)) wrong.push(`charges ${c.charges}`);
      if (c.replaced || c.replacedFrom !== undefined) wrong.push(`holds the ${c.replaced?.cardId ?? '?'} it replaced`);
      if (wrong.length) add('hand-card-state', c.iid, `${label}: ${wrong.join('; ')}`);
      // What a purchase records: an engine turn already played, and a price the tier allows.
      if (c.boughtOnTurn !== undefined && (!Number.isInteger(c.boughtOnTurn) || c.boughtOnTurn < 1 || c.boughtOnTurn > G.turnNumber)) {
        add('hand-bought-turn', c.iid, `${label} was bought on turn ${c.boughtOnTurn} (it is turn ${G.turnNumber})`);
      }
      if (d && c.paid !== undefined && (!Number.isInteger(c.paid) || c.paid < 0 || c.paid > PRICE[d.tier])) {
        add('hand-purchase-record', c.iid, `${label} records ${c.paid} souls paid (tier ${d.tier} lists at ${PRICE[d.tier]})`);
      }
    }
    // Net worth counts the hand: the engine's reading is the rules' — souls, worn items and
    // hand cards at list price.
    if (!G.draft && netWorth(G, pid) !== netWorthOracle(G, pid)) {
      add('net-worth-hand', pid, `P${pid}'s net worth reads ${netWorth(G, pid)}; souls, worn items and the hand at list price make ${netWorthOracle(G, pid)} (${netWorthOracleWithoutHand(G, pid)} without the hand)`);
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
  if (!G.draft) {
    // A drafted match has eight different heroes on the two boards (the driver only plays
    // drafted matches; the hand-built test boards hold two different rosters too).
    const roster = PIDS.flatMap((p) => boardOf(G.players[p]).flatMap((c) => [c, ...(c.attached ?? []).filter(isMergedRem)])).map((c) => c.cardId);
    const dupHero = roster.find((x, i) => roster.indexOf(x) !== i);
    if (dupHero) add('roster-duplicate', dupHero, `${dupHero} appears twice across the two rosters`);
  }

  // ---- the turn's step (rules.md §3) ----
  if (G.step !== 'shop' && G.step !== 'act') add('step-value', 'step', `G.step is ${JSON.stringify(G.step)}, neither 'shop' nor 'act'`);
  if (!G.draft && !over && G.step === 'shop') {
    // The shop step comes before everything the act step does: no attack, no Retreat, no
    // ability has been used yet this turn.
    if (G.attackUsed) add('shop-step-flags', 'attackUsed', 'the turn is in its shop step but G.attackUsed is set');
    if (G.retreatUsed) add('shop-step-flags', 'retreatUsed', 'the turn is in its shop step but G.retreatUsed is set');
    for (const c of boardOf(G.players[current]).flatMap((h) => [h, ...(h.attached ?? []).filter(isMergedRem)])) {
      if (c.skillUsedThisTurn) add('shop-step-flags', c.iid, `P${current}'s ${describeUnit(c)} has used its ability in the shop step`);
    }
  }

  for (const pid of PIDS) {
    const ps: PlayerState = G.players[pid];

    // ---- player scalars ----
    // Souls accumulate with no ceiling, but never go negative or fractional.
    if (!Number.isFinite(ps.souls) || ps.souls < 0 || !Number.isInteger(ps.souls)) {
      add('souls-range', pid, `P${pid} souls ${ps.souls} is not a whole number of 0 or more`);
    }

    // ---- the structures (rules.md §6): Guardian → Walker → Patron, pushed front first ----
    const track = ps.structures ?? [];
    if (track.map((s) => s.kind).join(',') !== 'guardian,walker,patron') {
      add('structures-shape', pid, `P${pid}'s track is [${track.map((s) => s.kind).join(', ')}], not Guardian, Walker, Patron`);
    }
    for (const s of track) {
      if (!Number.isInteger(s.hp) || !Number.isInteger(s.max) || s.hp < 0 || s.max < 0 || s.hp > s.max) {
        add('structure-range', `${pid}-${s.kind}`, `P${pid}'s ${s.kind} has ${s.hp} of ${s.max} HP`);
      }
    }
    // A push takes the front standing structure first: none behind a standing one is scratched.
    const firstStanding = track.findIndex((s) => s.hp > 0);
    track.forEach((s, i) => {
      if (firstStanding >= 0 && i > firstStanding && s.hp < s.max) add('structure-order', `${pid}-${s.kind}`, `P${pid}'s ${s.kind} lost HP (${s.hp}/${s.max}) behind its standing ${track[firstStanding].kind}`);
    });
    const patron = patronOf(ps);
    if (!patron || patron.max < 1) add('structures-shape', `${pid}-patron`, `P${pid}'s track has no Patron`);
    if (!G.draft && patron && patron.hp <= 0 && !over) add('patron-dead-no-gameover', pid, `P${pid}'s Patron has fallen but the game is not over`);
    // The flex slot is a felled enemy Walker's — and a track with no Walker never gives it.
    if (!G.draft) {
      const walker = (G.players[other(pid)].structures ?? []).find((s) => s.kind === 'walker');
      const felled = !!walker && walker.max > 0 && walker.hp <= 0;
      if (!!ps.flexSlot !== felled) add('flex-slot-walker', pid, `P${pid} has flexSlot=${!!ps.flexSlot} but the enemy Walker ${felled ? 'has fallen' : 'stands (or is not on the track)'}`);
    }
    // The Rejuvenator: 0..REVIVE_CREDITS revives, gone once the round they were good through is over.
    if (!Number.isInteger(ps.reviveCredits) || ps.reviveCredits < 0 || ps.reviveCredits > REVIVE_CREDITS) {
      add('revive-credits', pid, `P${pid} holds ${ps.reviveCredits} revive credits (0..${REVIVE_CREDITS})`);
    }
    if (!G.draft && !over && ps.reviveCredits > 0 && roundOracle(G) > ps.reviveUntilRound) {
      add('revive-lapsed', pid, `P${pid} still holds ${ps.reviveCredits} revive credits in round ${roundOracle(G)}; they were good through round ${ps.reviveUntilRound}`);
    }

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
          // Every seat the AI plays is promoted on the spot; the human seat is asked.
          const owes = G.pendingPromotion === pid;
          if (pid !== humanOf(G)) add('active-corpse-unresolved', pid, `P${pid} (an AI seat) has a corpse Active with ${candidates} step-in candidate(s); resolve() should have auto-promoted`);
          else if (!owes) add('active-corpse-unresolved', pid, `P${pid} (the human seat) has a corpse Active with ${candidates} step-in candidate(s) but G.pendingPromotion is ${G.pendingPromotion}`);
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
      checkWearer(c, pid, true);
    }

    // ---- turn flags ----
    for (const { c } of units) {
      if (isRespawning(c)) continue;
      if (pid !== current && c.skillUsedThisTurn) {
        add('stale-turn-flag', c.iid, `P${pid} is not on turn but ${describeUnit(c)} has skillUsed=${c.skillUsedThisTurn}`);
      }
    }
  }

  // ---- the Mid-Boss (rules.md §6) ----
  if (!G.draft && G.turnNumber >= 1) {
    const boss = G.boss;
    const r = roundOracle(G);
    if (boss) {
      const wrong: string[] = [];
      if (boss.zone !== 'pit') wrong.push(`zone '${boss.zone}'`);
      if (boss.cardId !== BOSS_CARD_ID) wrong.push(`cardId ${boss.cardId}`);
      if (boss.ownerId !== 'none') wrong.push(`owned by P${boss.ownerId}`);
      if (boss.hpMax !== BOSS_HP || !Number.isInteger(boss.hp) || boss.hp < 0 || boss.hp > boss.hpMax) wrong.push(`hp ${boss.hp}/${boss.hpMax}`);
      if (boss.hp <= 0 && !over) wrong.push('at 0 HP and not taken');
      if (boss.statuses.length) wrong.push(`carries ${boss.statuses.map((s) => s.id).join('+')}`);
      if ((boss.attached ?? []).length) wrong.push('carries cards');
      if (wrong.length) add('boss-state', boss.iid, `the Mid-Boss: ${wrong.join('; ')}`);
      if (r < BOSS_SPAWN_ROUND) add('boss-early', boss.iid, `the Mid-Boss stands in round ${r}, before round ${BOSS_SPAWN_ROUND}`);
      // Only swings hurt it, and each swing's HP is tallied for its side: the tallies are what it lost.
      const lost = boss.hpMax - boss.hp;
      if (G.bossDamage['0'] + G.bossDamage['1'] !== lost) add('boss-tally', 'sum', `the Mid-Boss has lost ${lost} HP but the tallies read ${G.bossDamage['0']}–${G.bossDamage['1']}`);
    } else if (!over && r >= G.bossRespawnRound) {
      add('boss-due', 'pit', `round ${r} has begun but the Mid-Boss, due in round ${G.bossRespawnRound}, is not up`);
    }
    for (const pid of PIDS) {
      const d = G.bossDamage[pid];
      if (!Number.isInteger(d) || d < 0) add('boss-tally', pid, `P${pid}'s damage to the Mid-Boss reads ${d}`);
    }
  }

  // ---- the round cap (rules.md §6) and who won ----
  if (!G.draft && !over && (G.turnNumber > 2 * ROUND_CAP || G.capped)) {
    add('round-cap', 'turn', `engine turn ${G.turnNumber} (capped=${G.capped}) and the match is still on: round ${ROUND_CAP} is the last`);
  }
  if (!G.draft && over) {
    const fallen = PIDS.filter((pid) => (patronOf(G.players[pid])?.hp ?? 1) <= 0);
    const want = fallen.length === 1 ? other(fallen[0]) : fallen.length === 2 || G.capped ? standingWinnerOracle(G) : undefined;
    const got = (ctx.gameover as { winner?: PlayerID } | undefined)?.winner;
    if (want === undefined) add('game-over-winner', 'reason', `the match is over with no Patron fallen and no cap reached (winner P${got})`);
    else if (got !== want) add('game-over-winner', 'winner', `P${got} won; the rules give P${want} (${fallen.length ? `fallen Patron: P${fallen.join(', P')}` : 'the round cap'})`);
  }

  // ---- the turn: its number, and whose it is (the pie rule) ----
  // A board with every hero down is no loss any more (the rival pushes into the
  // empty lane at the end of its turn), so there is no wipe check.
  if (!G.draft && !over) {
    if (G.turnNumber !== ctx.turn - G.draftTurnsOffset) {
      add('turn-number-sync', 'turn', `G.turnNumber ${G.turnNumber} != ctx.turn ${ctx.turn} - offset ${G.draftTurnsOffset}`);
    }
    // Engine turn T is the first mover's when odd, the second mover's when even.
    const owner = G.turnNumber % 2 === 1 ? firstOf(G) : other(firstOf(G));
    if (G.turnNumber >= 1 && current !== owner) {
      add('turn-owner-parity', 'turn', `engine turn ${G.turnNumber} belongs to P${owner} (first mover P${firstOf(G)}) but P${current} is on turn`);
    }
  }

  return out;

  /** hp / corpse / status / level / cooldown checks for one hero instance. */
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
    // A cooldown counts the owner's turns: a whole number of 0 or more.
    for (const [k, v] of Object.entries(c.cooldowns ?? {})) {
      if (!Number.isInteger(v) || (v as number) < 0) add('cooldown-range', `${c.iid}-${k}`, `${k} cooldown ${v} on ${label}`);
    }
  }

  /** What a hero carries: its items (a slot each, MAX_ITEMS — FLEX_SLOT more with the flex
   *  slot — never two of one), and, on a hero in a slot, a merged Rem (a hero, not an item:
   *  she takes no slot). */
  function checkWearer(c: CardInstance, pid: PlayerID, slotted: boolean) {
    const att = c.attached ?? [];
    const items = att.filter((a) => !!itemData(a.cardId));
    const cap = slotCapOracle(G, pid);
    if (items.length > cap) add('item-slot-cap', c.iid, `${describeUnit(c)} wears ${items.length} items (> ${cap})`);
    const ids = items.map((a) => a.cardId);
    const dup = ids.find((x, i) => ids.indexOf(x) !== i);
    if (dup) add('item-duplicate', c.iid, `${describeUnit(c)} wears two ${dup}`);
    // The Vitality category spike's +1 max HP sits on the hero exactly while it wears 3+ Vitality items.
    if (isHeroCard(c) && !!c.vitalitySpike !== hasSpikeOracle(c, 'vitality')) {
      add('vitality-spike-sync', c.iid, `${describeUnit(c)} has vitalitySpike=${!!c.vitalitySpike} but ${hasSpikeOracle(c, 'vitality') ? 'wears' : 'does not wear'} 3+ Vitality items`);
    }
    for (const a of att) {
      if (itemData(a.cardId)) {
        if (a.zone !== 'equipment' || a.attachedTo !== c.iid) add('zone-slot-match', a.iid, `item ${a.cardId}#${a.iid} on ${c.cardId}#${c.iid} has zone '${a.zone}' attachedTo ${a.attachedTo}`);
        if ((a.attached ?? []).length > 0) add('attached-foreign', `${a.iid}-carries`, `item ${a.cardId}#${a.iid} carries ${a.attached!.map((x) => x.cardId).join('+')}`);
        checkItem(a, pid);
      } else if (slotted && isMergedRem(a)) {
        if (a.zone !== 'equipment' || a.attachedTo !== c.iid) add('zone-slot-match', a.iid, `merged Rem on ${c.cardId}#${c.iid} has zone '${a.zone}' attachedTo ${a.attachedTo}`);
        if ((a.remMergeTurnsLeft ?? 0) <= 0) add('rem-merge-turns', a.iid, `merged Rem has remMergeTurnsLeft ${a.remMergeTurnsLeft}`);
        if (isRespawning(c)) add('rem-on-corpse', a.iid, `Rem is still merged into the corpse ${describeUnit(c)}`);
        checkUnit(a, 'merged ');
        checkWearer(a, pid, false);
      } else {
        const t = CARDS_BY_ID[a.cardId]?.type;
        add('attached-foreign', a.iid, `${a.cardId}#${a.iid} (${t}) is in ${c.cardId}#${c.iid}'s attached list but is neither an item nor a Rem merged into a hero in a slot`);
      }
    }
  }

  /** One worn item: its charges, its cooldown and its purchase record. */
  function checkItem(a: CardInstance, pid: PlayerID) {
    const d = itemData(a.cardId)!;
    const hardCC = d.type === 'spell' && !!d.hardCC;
    // Hard crowd control: HARD_CC_CHARGES uses a match and no cooldown; nothing else has charges.
    if (hardCC) {
      if (!Number.isInteger(a.charges) || a.charges! < 0 || a.charges! > HARD_CC_CHARGES) add('item-charges', a.iid, `hard crowd control ${a.cardId}#${a.iid} has charges ${a.charges} (0..${HARD_CC_CHARGES})`);
    } else if (a.charges !== undefined) add('item-charges', a.iid, `${a.cardId}#${a.iid} is no hard crowd control but has charges ${a.charges}`);
    // An active's cooldown is its own (keyed by its id), from 0 to its tier's full
    // cooldown; a passive and a hard crowd-control item have none.
    for (const [k, v] of Object.entries(a.cooldowns ?? {})) {
      if (d.type !== 'spell' || hardCC || k !== a.cardId) add('item-cooldown-key', `${a.iid}-${k}`, `${d.type === 'spell' ? (hardCC ? 'hard crowd control' : 'active') : 'passive'} ${a.cardId}#${a.iid} has a cooldown entry ${k}=${v}`);
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > fullItemCooldown(d.tier)) add('cooldown-range', `${a.iid}-${k}`, `${a.cardId}#${a.iid} cooldown ${v} (tier ${d.tier}: 0..${fullItemCooldown(d.tier)})`);
    }
    // What a purchase records: an engine turn already played, a price the tier allows, and
    // the component an upgrade replaced — only on the turn it was bought, its owner's.
    if (a.boughtOnTurn !== undefined && (!Number.isInteger(a.boughtOnTurn) || a.boughtOnTurn < 1 || a.boughtOnTurn > G.turnNumber)) {
      add('item-purchase-record', `${a.iid}-turn`, `${a.cardId}#${a.iid} was bought on turn ${a.boughtOnTurn} (it is turn ${G.turnNumber})`);
    }
    if (a.paid !== undefined && (!Number.isInteger(a.paid) || a.paid < 0 || a.paid > PRICE[d.tier])) {
      add('item-purchase-record', `${a.iid}-paid`, `${a.cardId}#${a.iid} records ${a.paid} souls paid (tier ${d.tier} lists at ${PRICE[d.tier]})`);
    }
    if (a.replaced && (a.boughtOnTurn !== G.turnNumber || pid !== current || a.replaced.cardId !== d.upgradesFrom)) {
      add('item-purchase-record', `${a.iid}-replaced`, `${a.cardId}#${a.iid} (bought on turn ${a.boughtOnTurn}, P${pid}) still holds the ${a.replaced.cardId} it replaced on turn ${G.turnNumber} (P${current} on turn; it upgrades ${d.upgradesFrom})`);
    }
    // The hero a held component came from rides with it, and is one of the side's own (a Rem
    // who has merged since included: the component then goes back to the hand).
    if (a.replacedFrom !== undefined && (!a.replaced || !heroesOfSide(G.players[pid]).some((h) => h.iid === a.replacedFrom))) {
      add('item-purchase-record', `${a.iid}-replacedFrom`, `${a.cardId}#${a.iid} names ${a.replacedFrom} as where its component came from, ${a.replaced ? 'no hero of its side' : 'but holds no component'}`);
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

/** Every hero of both sides by iid. */
const allHeroes = (G: GameState) => new Map([...heroesByIid(G.players['0']), ...heroesByIid(G.players['1'])]);

/** What the move pushed onto the FX stream: everything past `before`'s last event —
 *  or, a turn handed over (its end flushes the stream first), all of `after`'s. */
function freshEvents(before: GameState, after: GameState, handOver: boolean): FxEvent[] {
  if (handOver) return after.fx ?? [];
  const seen = (before.fx ?? []).reduce((m, e) => Math.max(m, e.seq), 0);
  return (after.fx ?? []).filter((e) => e.seq > seen);
}

/** One fall of a hero during a move: the hero (as the move left it), the levels it may
 *  have fallen at (the one it had before the move, or a level gained in it — a kill's exp
 *  on a hero that fell to Return Fire), and whether it paid — a fall to the Mid-Boss's
 *  blow pays no bounty and pushes nothing. */
interface Fall { hero: CardInstance; levels: number[]; paid: boolean }

/** The falls of `pid`'s heroes during a move: every hero standing before it that ends it a
 *  corpse, and every 'revive' the move pushed for a hero standing before it (the
 *  Rejuvenator's revive in place, or a fall and a respawn inside one hand-over) — each
 *  revive is a fall that came back. A boss's knockout hit marks one of them unpaid. */
function fallsDuring(before: GameState, after: GameState, pid: PlayerID, fresh: FxEvent[]): Fall[] {
  const was = heroesByIid(before.players[pid]);
  const bossIid = before.boss?.iid;
  const count = (pred: (e: FxEvent) => string | undefined) => {
    const m = new Map<string, number>();
    for (const e of fresh) { const iid = pred(e); if (iid) m.set(iid, (m.get(iid) ?? 0) + 1); }
    return m;
  };
  const revives = count((e) => (e.kind === 'revive' ? e.iid : undefined));
  const bossBlows = count((e) => (e.kind === 'hit' && e.ko && !!bossIid && e.source?.iid === bossIid ? e.iid : undefined));
  const out: Fall[] = [];
  for (const [iid, h] of heroesByIid(after.players[pid])) {
    const prev = was.get(iid);
    if (!prev || isRespawning(prev)) continue; // a corpse that respawns is no fall
    const n = (revives.get(iid) ?? 0) + (isRespawning(h) ? 1 : 0);
    let unpaid = bossBlows.get(iid) ?? 0;
    const levels = [...new Set([prev.level ?? 1, h.level ?? 1])];
    for (let k = 0; k < n; k++) out.push({ hero: h, levels, paid: unpaid-- <= 0 });
  }
  return out;
}

/** True when `pid`'s Guardian stood before the move and has fallen after it. */
function guardianFell(before: GameState, after: GameState, pid: PlayerID): boolean {
  const g0 = before.players[pid].structures.find((s) => s.kind === 'guardian');
  const g1 = after.players[pid].structures.find((s) => s.kind === 'guardian');
  return !!g0 && !!g1 && g0.hp > 0 && g1.hp <= 0;
}

/** Who may have taken a Mid-Boss that fell during the move, by the rules: the side
 *  that dealt it more damage (its tallies stay until the next one rises); on a tie, the
 *  side behind on net worth as it fell (before its reward), then the last hit's — both
 *  sides are returned when the tie leaves it open to this oracle. Empty: none fell. */
function bossTakersOracle(before: GameState, after: GameState): PlayerID[] {
  if (!before.boss || after.boss) return [];
  const d0 = after.bossDamage['0'];
  const d1 = after.bossDamage['1'];
  if (d0 !== d1) return [d0 > d1 ? '0' : '1'];
  return ['0', '1'];
}

function hasDuplicateIids(G: GameState): boolean {
  const seen = new Set<string>();
  for (const { card } of everyCard(G)) {
    if (seen.has(card.iid)) return true;
    seen.add(card.iid);
  }
  return false;
}

/** Every cooldown entry on a side — its heroes' (merged Rem included) and their worn
 *  items' — keyed `owner iid|ability or item id`. */
function cooldownEntries(G: GameState, pid: PlayerID): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of heroesByIid(G.players[pid]).values()) {
    for (const c of [h, ...wornItemsOf(h)]) {
      for (const [k, v] of Object.entries(c.cooldowns ?? {})) m.set(`${c.iid}|${k}`, v as number);
    }
  }
  return m;
}

/** A card's printed stat bonus (passive items only carry one). */
function bonusOf(cardId: string | undefined): { atk: number; spirit: number; hp: number } {
  const d = itemData(cardId);
  const b = d?.type === 'equipment' ? d.bonus : undefined;
  return { atk: b?.atk ?? 0, spirit: b?.spirit ?? 0, hp: b?.hp ?? 0 };
}

interface MoveInfo { name: string; args: unknown[] }

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

  const args = move.args;
  const mover = before.ctx.currentPlayer as PlayerID;
  const foe = other(mover);
  const switched = before.ctx.currentPlayer !== after.ctx.currentPlayer;
  const newTurn = move.name === 'endTurn' && switched && !after.ctx.gameover;

  // ---- the turn's two steps (rules.md §3) ----
  // Every turn opens on the shop; closing it is the one way into the act step, and
  // nothing goes back. The shop step takes the shop's moves (plus ending the turn, an owed
  // promotion and the board's bookkeeping); the act step never takes a shop move.
  if (before.G.step === 'shop' && !SHOP_STEP_MOVES.includes(move.name)) {
    add('step-shop-moves', move.name, `${move.name} was accepted in the shop step`);
  }
  if (before.G.step === 'act' && SHOP_MOVES.includes(move.name)) {
    add('step-act-moves', move.name, `${move.name} was accepted in the act step`);
  }
  if (move.name === 'closeShop' && after.G.step !== 'act') add('step-close-shop', 'closeShop', `closeShop was accepted but the step is ${after.G.step}`);
  if (newTurn && after.G.step !== 'shop') add('step-new-turn', 'endTurn', `P${after.ctx.currentPlayer}'s turn ${after.G.turnNumber} opens on the ${after.G.step} step, not the shop`);
  if (!(move.name === 'endTurn' && switched) && before.G.step !== after.G.step && !(move.name === 'closeShop' && before.G.step === 'shop')) {
    add('step-change', move.name, `${move.name} moved the step from ${before.G.step} to ${after.G.step} within the turn`);
  }

  // ---- what the rules allow: an accepted shop move, card play or item use the oracle refuses ----
  {
    const B = before.G;
    const why = move.name === 'buy' ? buyBlockedOracle(B, mover, args[0])
      : move.name === 'sell' ? sellBlockedOracle(B, mover, args[0])
      : move.name === 'moveItem' ? moveItemBlockedOracle(B, mover, args[0], args[1])
      : move.name === 'playCard' ? playBlockedOracle(B, mover, args[0], args[1])
      : move.name === 'closeShop' ? closeShopBlockedOracle(B, mover)
      : move.name === 'activate' ? activateBlockedOracle(B, mover, args[0], args[1])
      : null;
    if (why) add('accepted-illegal', move.name, `${move.name}(${JSON.stringify(args)}) by P${mover} was accepted but the rules refuse it: ${why}`);
  }

  // The structures (rules.md §6) only lose HP to pushes: each hero of the side that
  // fell during the move pushes its level + 1 (doubled from round 9) — a fall to the
  // Mid-Boss's blow excepted — and, at the end of a turn, the ending player's standing
  // Active pushes its bullet power into a lane its rival left empty. Front first; what
  // is left past the Patron is lost. They never gain any. An end of turn spans the
  // End step and the next turn's start, which can be two rounds: either round's
  // multiplier is the rule's for a fall in it. (Skipped once an iid is duplicated:
  // hero identity is the iid, and a clone of a card — already reported as `iid-unique`
  // — would make the count meaningless.)
  const duplicated = hasDuplicateIids(before.G) || hasDuplicateIids(after.G);
  // (A push that ends the match leaves the turn with the player who made it.)
  const ending = move.name === 'endTurn' ? before.ctx.currentPlayer as PlayerID : undefined;
  const handOver = move.name === 'endTurn' && switched;
  const fresh = freshEvents(before.G, after.G, handOver);
  const falls = (pid: PlayerID) => fallsDuring(before.G, after.G, pid, fresh);
  const rounds = [...new Set([roundOracle(before.G), roundOracle(after.G)])];
  for (const pid of duplicated ? [] : PIDS) {
    const was = structureHpOracle(before.G.players[pid]);
    const now = structureHpOracle(after.G.players[pid]);
    const drop = was - now;
    const paid = falls(pid).filter((f) => f.paid);
    let sums = new Set([0]);
    for (const f of paid) {
      const next = new Set<number>();
      for (const s of sums) for (const r of rounds) for (const lv of f.levels) next.add(s + killPushOracle(lv, r));
      sums = next;
    }
    const pusher = ending !== undefined && pid === other(ending) ? before.G.players[ending].active : null;
    const lane = pusher && !isRespawning(pusher) ? attackPower(pusher).total * pushMultiplierOracle(roundOracle(before.G)) : 0;
    const options = [...new Set([...sums].flatMap((s) => (lane > 0 ? [s, s + lane] : [s])).map((s) => Math.min(s, was)))];
    if (!options.includes(drop)) {
      add('structure-delta', pid, `P${pid}'s structures ${was} -> ${now} (drop ${drop}) after ${move.name}; its falls [${paid.map((f) => `${f.hero.cardId} Lv${f.levels.join('/')}`).join(', ')}]${lane > 0 ? ` and an empty-lane push of ${lane}` : ''} give ${options.sort((x, y) => x - y).join(' or ')}`);
    }
  }

  // The record counts up only, and in a move the kills it counts are the falls that paid.
  for (const pid of duplicated ? [] : PIDS) {
    const r0 = before.G.record[pid];
    const r1 = after.G.record[pid];
    for (const k of Object.keys(r0) as (keyof typeof r0)[]) {
      if (r1[k] < r0[k]) add('record-monotonic', `${pid}-${k}`, `P${pid}'s record ${k} went ${r0[k]} -> ${r1[k]}`);
    }
    const paidKills = falls(other(pid)).filter((f) => f.paid).length;
    if (r1.kills - r0.kills !== paidKills) add('record-kills', pid, `P${pid}'s kills went ${r0.kills} -> ${r1.kills} after ${move.name}; ${paidKills} enemy heroes fell to it`);
  }

  // A fallen hero waits by the round it fell in (rules.md §6): 1 own turn in rounds 1–4, 2 in
  // 5–8, 3 from 9, one more for the strictly richest hero. A side with a live Rejuvenator
  // spends a credit instead and the hero is back in place at full HP; a side whose credits
  // outlast the move had none of its heroes end the move as a corpse. (An end of turn is
  // left out: the next turn's start ticks its own timers.)
  if (!duplicated && !handOver) {
    for (const pid of PIDS) {
      const ps0 = before.G.players[pid];
      const ps1 = after.G.players[pid];
      const fallen = falls(pid);
      const took = !!before.G.boss && !after.G.boss && after.G.record[pid].bossKills > before.G.record[pid].bossKills;
      const credited = fresh.filter((e) => e.kind === 'revive' && e.credit && heroesByIid(ps1).has(e.iid)).length;
      const live = ps0.reviveCredits > 0 && roundOracle(before.G) <= ps0.reviveUntilRound;
      if (credited > 0 && !live) add('revive-spend', pid, `P${pid}'s Rejuvenator revived ${credited} hero(es) with no live credit (${ps0.reviveCredits}, through round ${ps0.reviveUntilRound})`);
      const want = took ? REVIVE_CREDITS : ps0.reviveCredits - credited;
      if (ps1.reviveCredits !== want) add('revive-spend', `${pid}-count`, `P${pid}'s revive credits ${ps0.reviveCredits} -> ${ps1.reviveCredits} after ${credited} revive(s)${took ? ' and the Mid-Boss taken' : ''}; the rules give ${want}`);
      for (const f of fallen) {
        if (!isRespawning(f.hero)) continue;
        const timer = respawnTimerOracle(after.G, f.hero, roundOracle(before.G));
        if (f.hero.respawnTurnsLeft !== timer) add('respawn-timer-start', f.hero.iid, `${describeUnit(f.hero)} fell in round ${roundOracle(before.G)} with a timer of ${f.hero.respawnTurnsLeft}; the rules give ${timer}`);
        if (live && ps0.reviveCredits - credited > 0) add('revive-owed', f.hero.iid, `${describeUnit(f.hero)} fell while P${pid} held ${ps0.reviveCredits - credited} live revive credit(s) after the others, and stayed down`);
      }
    }
  }

  // ---- what an item move does to the cards (worked out on the board before it) ----
  const B = before.G;
  /** A purchase: the item bought — a card for the hand, no hero named. */
  const boughtId = move.name === 'buy' && itemData(args[0]) ? String(args[0]) : undefined;
  /** A play: the card from the hand, the hero it goes on, and what it consumes. */
  const playedCard = move.name === 'playCard' ? handCardOf(B, mover, args[0]) : undefined;
  const playedOn = playedCard ? slottedHeroOf(B, mover, args[1]) : undefined;
  const consumed: ConsumedOracle[] = playedCard && playedOn ? playConsumesOracle(B, mover, playedCard, playedOn) : [];
  /** A sale: a card from the hand, or a worn item and its bearer — and what a same-turn
   *  upgrade's sale puts back, and where. */
  const soldHand = move.name === 'sell' ? handCardOf(B, mover, args[0]) : undefined;
  const sold = move.name === 'sell' && !soldHand ? wornItemOf(B, mover, args[0]) : undefined;
  const restored: RestoredOracle[] = sold ? restoredBySaleOracle(B, mover, sold.item, sold.bearer) : [];
  const moved = move.name === 'moveItem' ? wornItemOf(B, mover, args[0]) : undefined;
  const movedTo = moved ? slottedHeroOf(B, mover, args[1]) : undefined;

  // Cards do not vanish: every card anywhere before (the hands included) is still somewhere
  // after — but for the card a sale takes, the components a play consumes and a Mid-Boss
  // that falls. And none appears from nowhere: a purchase brings its one card into the
  // buyer's hand, a same-turn upgrade's sale the components it puts back, a round's start
  // the Mid-Boss.
  {
    const beforeIids = new Map(everyCard(before.G).map((x) => [x.card.iid, x]));
    const afterCards = everyCard(after.G);
    const afterIids = new Set(afterCards.map((x) => x.card.iid));
    const fellBoss = before.G.boss && !after.G.boss ? before.G.boss.iid : undefined;
    const mayGo = new Set([...consumed.map((c) => c.item.iid), sold?.item.iid, soldHand?.iid, fellBoss].filter((x): x is string => !!x));
    for (const [iid, x] of beforeIids) {
      if (!afterIids.has(iid) && !mayGo.has(iid)) add('card-vanished', iid, `${x.card.cardId}#${iid} (${x.place}) of P${x.pid} is nowhere after ${move.name}`);
    }
    const fresh = afterCards.filter((x) => !beforeIids.has(x.card.iid));
    const purchase = boughtId ? fresh.find((x) => x.card.cardId === boughtId && x.place === 'hand' && x.pid === mover) : undefined;
    const back = new Set(restored.map((r) => r.item.iid));
    for (const x of fresh) {
      if (x === purchase || back.has(x.card.iid)) continue;
      if (x.place === 'pit' && handOver) continue;
      add('card-appeared', x.card.iid, `${x.card.cardId}#${x.card.iid} (${x.place}) of P${x.pid} appeared after ${move.name}(${JSON.stringify(args)})`);
    }
  }

  // Turn ownership: only endTurn (or the last draft pick) hands the turn over.
  if (!after.ctx.gameover) {
    if (move.name === 'endTurn' && !switched) add('turn-owner', 'endTurn', `endTurn was accepted but P${after.ctx.currentPlayer} is still on turn`);
    if (move.name !== 'endTurn' && switched) add('turn-owner', move.name, `${move.name} changed the player on turn from P${before.ctx.currentPlayer} to P${after.ctx.currentPlayer}`);
  }

  // Hand-over: the hero flags of the player whose turn ended are cleared.
  if (newTurn) {
    const ended = before.ctx.currentPlayer as PlayerID;
    for (const c of boardOf(after.G.players[ended])) {
      if (!isRespawning(c) && c.skillUsedThisTurn) {
        add('end-turn-flags', c.iid, `${describeUnit(c)} kept its turn flags after P${ended} ended the turn`);
      }
    }
    if (after.G.attackUsed) add('end-turn-flags', 'attackUsed', 'G.attackUsed is still set at the start of the next turn');
    if (after.G.retreatUsed) add('end-turn-flags', 'retreatUsed', 'G.retreatUsed is still set at the start of the next turn');
  }

  // The Act: once the turn's attack is made, nothing but ending the turn (and an
  // owed promotion, and the board's reveal bookkeeping) is accepted.
  if (before.G.attackUsed && !['endTurn', 'promoteToActive', 'completeAction'].includes(move.name)) {
    add('act-over', move.name, `${move.name} was accepted after the turn's attack had ended the Act`);
  }
  // One Retreat a turn.
  if (move.name === 'moveHero' && before.G.retreatUsed) {
    const [f, t] = args as [number, number];
    if (f === 0 || t === 0) add('retreat-once', 'moveHero', `a second Retreat was accepted in one turn`);
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
  /** What the falls of `pid`'s heroes during the move pay their opponent: each paid fall's
   *  bounty (`bountyOracle`), and the Guardian's bounty should the pushes fell `pid`'s. */
  const bountyOf = (pid: PlayerID) =>
    falls(pid).filter((f) => f.paid).reduce((n, f) => n + bountyOracle(after.G, f.hero), 0)
    + (guardianFell(before.G, after.G, pid) ? GUARDIAN_BOUNTY : 0);
  const takers = bossTakersOracle(before.G, after.G);

  if (!duplicated && move.name !== 'endTurn' && takers.length < 2) {
    // Souls: only the move's price (an item's — the difference for an upgrade whose
    // component has a free copy on the side —, a Retreat's; abilities are free), what a sale
    // refunds, what an item used pays out (SOULS_ON_USE), the bounty of each enemy hero
    // that fell (its level + 1, + 2 for the richest hero on the board), the Guardian's
    // bounty when a push fells the rival's, and the Mid-Boss's souls to the side that takes
    // it. Playing a card, moving an item and closing the shop are free. No ceiling. (A
    // Mid-Boss whose tallies tie is settled by net worth as it falls: left out.)
    const boss = (pid: PlayerID) => (takers[0] === pid ? BOSS_SOULS : 0);
    let cost = 0;
    let payout = 0;
    if (move.name === 'buy' && boughtId) cost = buyPriceOracle(B, mover, boughtId);
    else if (move.name === 'sell' && (soldHand || sold)) payout = sellRefundOracle(B, soldHand ?? sold!.item);
    else if (move.name === 'activate') {
      const used = wornItemOf(B, mover, args[0]);
      payout = used ? SOULS_ON_USE[used.item.cardId] ?? 0 : 0;
    } else if (move.name === 'moveHero') {
      const [f, t] = args as [number, number];
      const ps = B.players[mover];
      const get = (s: number) => (s === 0 ? ps.active : ps.bench[s - 1]);
      if ((f === 0 || t === 0) && get(f) && get(t)) cost = retreatCostOracle(B, mover);
    }
    const wantMover = B.players[mover].souls - cost + payout + bountyOf(foe) + boss(mover);
    if (after.G.players[mover].souls !== wantMover) {
      add('souls-delta', mover, `P${mover} souls ${B.players[mover].souls} -> ${after.G.players[mover].souls} after ${move.name}(${JSON.stringify(args)}); price ${cost}, payout ${payout}, ${bountyOf(foe)} in bounties and ${boss(mover)} for the Mid-Boss give ${wantMover}`);
    }
    const wantFoe = B.players[foe].souls + bountyOf(mover) + boss(foe);
    if (after.G.players[foe].souls !== wantFoe) {
      add('souls-delta', foe, `P${foe} souls ${B.players[foe].souls} -> ${after.G.players[foe].souls} after P${mover}'s ${move.name}; expected ${wantFoe}`);
    }
  }

  // A kit ability, used: the hero is spent for the turn, and its cooldown is armed — a skill's
  // own (SKILL_COOLDOWN unless its data names one), an ultimate's ULT_COOLDOWN less the
  // Cooldown family it wears (never under 1) — or a borrowed ultimate is gone. A locked
  // ultimate (below the unlock level) is never used.
  if (!duplicated && move.name === 'useSkill' && typeof args[0] === 'string') {
    const hero0 = heroesByIid(B.players[mover]).get(args[0] as string);
    const hero1 = heroesByIid(after.G.players[mover]).get(args[0] as string);
    const d = hero0 && CARDS_BY_ID[hero0.cardId];
    if (hero0 && hero1 && d?.type === 'hero') {
      const id = typeof args[2] === 'string' ? (args[2] as string) : d.skills[0];
      if (ultLocked(hero0, id)) add('ult-locked', hero0.iid, `${describeUnit(hero0)} used its ultimate below the unlock level`);
      const borrowed = hero0.borrowedUlt === id && d.ult !== id && !d.skills.includes(id);
      if (borrowed) {
        if (hero1.borrowedUlt === id) add('ability-cooldown', hero1.iid, `${describeUnit(hero1)} used its borrowed ultimate and still holds it`);
      } else {
        const want = d.ult === id ? ultCooldownOracle(hero0) : getAbility(id)?.cooldown ?? SKILL_COOLDOWN;
        if ((hero1.cooldowns?.[id] ?? 0) !== want) add('ability-cooldown', hero1.iid, `${describeUnit(hero1)} used ${id}; its cooldown is ${hero1.cooldowns?.[id]}, the rules say ${want}`);
      }
    }
  }

  // A Retreat spends the Swift of the hero that leaves the Active slot (its free Retreat is that one).
  if (!duplicated && move.name === 'moveHero') {
    const [f, t] = args as [number, number];
    const leaving = B.players[mover].active;
    const swapped = leaving && (f === 0 || t === 0) && after.G.players[mover].active?.iid !== leaving.iid;
    const now = swapped ? boardOf(after.G.players[mover]).find((c) => c.iid === leaving!.iid) : undefined;
    if (now && leaving!.statuses.some((s) => s.id === 'swift') && now.statuses.some((s) => s.id === 'swift')) {
      add('swift-spent', now.iid, `${describeUnit(now)} retreated while Swift and is Swift still`);
    }
  }

  // ---- the shop's items (rules.md §4) ----
  const heroes0 = allHeroes(B);
  const heroes1 = allHeroes(after.G);
  /** The item with this iid wherever it is worn after the move, and its bearer. */
  const wornAfter = (iid: string) => {
    for (const h of heroes1.values()) {
      const item = wornItemsOf(h).find((a) => a.iid === iid);
      if (item) return { item, bearer: h };
    }
    return undefined;
  };

  // A purchase: exactly one card joins the buyer's hand, at its end — the item bought, its
  // owner's, recording the engine turn and what was paid (the oracle's price). The rest of
  // the hand is as it was, and no hero is touched (the `equip-bonus` rule sees to that).
  if (!duplicated && boughtId) {
    const hand0 = handOf(B, mover);
    const hand1 = handOf(after.G, mover);
    const fresh = hand1.slice(hand0.length);
    const problems: string[] = [];
    if (hand1.slice(0, hand0.length).map((c) => c.iid).join() !== hand0.map((c) => c.iid).join() || fresh.length !== 1) {
      problems.push(`the hand went [${hand0.map((c) => c.cardId).join(', ')}] -> [${hand1.map((c) => c.cardId).join(', ')}]`);
    } else {
      const card = fresh[0];
      const price = buyPriceOracle(B, mover, boughtId);
      if (card.cardId !== boughtId) problems.push(`the new card is ${card.cardId}`);
      if (card.ownerId !== mover) problems.push(`owned by P${card.ownerId}`);
      if (card.boughtOnTurn !== B.turnNumber) problems.push(`boughtOnTurn ${card.boughtOnTurn} (turn ${B.turnNumber})`);
      if (card.paid !== price) problems.push(`paid ${card.paid} (price ${price})`);
    }
    if (problems.length) add('bought-card-state', `${mover}-${boughtId}`, `buy(${JSON.stringify(args)}) by P${mover}: ${problems.join('; ')}`);
  }

  // A play: the card leaves the hand and is worn by the hero named, its purchase record with
  // it; an active starts on its full cooldown (its bearer's Cooldown family taken off, never
  // under 1, read once the component has left) or, hard crowd control, with HARD_CC_CHARGES
  // charges (or those it carried back into the hand); a passive has neither. What it consumes (the oracle's) is out of play — in no
  // hand, on no hero — and, the card bought this turn, held on it for a same-turn sale, each
  // settled component on the copy that settled it. A play never leaves a hero over its cap.
  if (!duplicated && playedCard && playedOn) {
    const hero1 = heroes1.get(playedOn.iid);
    const now = wornAfter(playedCard.iid);
    const d = itemData(playedCard.cardId);
    const problems: string[] = [];
    if (handCardOf(after.G, mover, playedCard.iid)) problems.push('it is still in the hand');
    if (!now || now.bearer.iid !== playedOn.iid || !d || !hero1) {
      problems.push(now ? `it is worn by ${now.bearer.cardId}#${now.bearer.iid}` : 'it is worn by nobody');
    } else {
      const it = now.item;
      const cd = it.cooldowns?.[d.id];
      const keys = Object.keys(it.cooldowns ?? {});
      if (d.type === 'spell' && d.hardCC) {
        const want = playedCard.charges ?? HARD_CC_CHARGES;
        if (it.charges !== want || keys.length) problems.push(`hard crowd control with charges ${it.charges} and cooldowns ${JSON.stringify(it.cooldowns)} (${want} charges, no cooldown)`);
      } else if (d.type === 'spell') {
        const want = activeCooldownOracle(hero1, d.tier);
        if (cd !== want || keys.length !== 1 || it.charges !== undefined) problems.push(`an active on cooldowns ${JSON.stringify(it.cooldowns)}${it.charges !== undefined ? ` with charges ${it.charges}` : ''} (its full cooldown here is ${want})`);
      } else if (keys.length || it.charges !== undefined) {
        problems.push(`a passive with cooldowns ${JSON.stringify(it.cooldowns)} / charges ${it.charges}`);
      }
      if (it.boughtOnTurn !== playedCard.boughtOnTurn || it.paid !== playedCard.paid) problems.push(`purchase record ${playedCard.boughtOnTurn}/${playedCard.paid} -> ${it.boughtOnTurn}/${it.paid}`);
      const held = playedCard.boughtOnTurn === B.turnNumber ? consumed[0] : undefined;
      if (held ? it.replaced?.iid !== held.item.iid || it.replacedFrom !== held.from?.iid : it.replaced !== undefined || it.replacedFrom !== undefined) {
        problems.push(`holds ${it.replaced ? `${it.replaced.cardId}#${it.replaced.iid} from ${it.replacedFrom ?? 'the hand'}` : 'nothing'} (the rules: ${held ? `${held.item.cardId}#${held.item.iid} from ${held.from ? `${held.from.cardId}#${held.from.iid}` : 'the hand'}` : 'nothing'})`);
      } else if (held) {
        let link = it.replaced;
        for (const next of consumed.slice(1)) {
          if (!link || link.replaced?.iid !== next.item.iid || link.replacedFrom !== next.from?.iid) {
            problems.push(`the ${link?.cardId ?? '?'} it consumed does not hold the ${next.item.cardId}#${next.item.iid} it settled`);
            break;
          }
          link = link.replaced;
        }
      }
    }
    for (const c of consumed) {
      const still = everyCard(after.G).find((x) => x.card.iid === c.item.iid);
      if (still) problems.push(`the consumed ${c.item.cardId}#${c.item.iid} is still in ${still.place}`);
    }
    if (problems.length) add('played-card-state', playedCard.iid, `${playedCard.cardId}#${playedCard.iid} played on ${playedOn.cardId}#${playedOn.iid}: ${problems.join('; ')}`);
    if (hero1 && wornItemsOf(hero1).length > slotCapOracle(after.G, mover)) {
      add('play-slot-cap', playedOn.iid, `${describeUnit(hero1)} wears ${wornItemsOf(hero1).length} items after playCard(${JSON.stringify(args)}) (cap ${slotCapOracle(after.G, mover)})`);
    }
  }

  // A move: the item goes to the hero named, its cooldown, charges and purchase record with
  // it; a moved upgrade no longer undoes (the component it replaced is let go).
  if (!duplicated && moved && movedTo) {
    const now = wornAfter(moved.item.iid);
    if (!now || now.bearer.iid !== movedTo.iid) {
      add('moved-item-state', moved.item.iid, `${moved.item.cardId}#${moved.item.iid} was moved to ${movedTo.cardId}#${movedTo.iid} but is ${now ? `on ${now.bearer.cardId}#${now.bearer.iid}` : 'worn by nobody'}`);
    } else {
      const was = moved.item;
      const it = now.item;
      const problems: string[] = [];
      if (JSON.stringify(it.cooldowns ?? {}) !== JSON.stringify(was.cooldowns ?? {})) problems.push(`cooldowns ${JSON.stringify(was.cooldowns ?? {})} -> ${JSON.stringify(it.cooldowns ?? {})}`);
      if (it.charges !== was.charges) problems.push(`charges ${was.charges} -> ${it.charges}`);
      if (it.boughtOnTurn !== was.boughtOnTurn || it.paid !== was.paid) problems.push(`purchase record ${was.boughtOnTurn}/${was.paid} -> ${it.boughtOnTurn}/${it.paid}`);
      if (it.replaced || it.replacedFrom !== undefined) problems.push(`still holds the ${it.replaced?.cardId ?? '?'} it replaced`);
      if (problems.length) add('moved-item-state', it.iid, `${it.cardId}#${it.iid} moved ${moved.bearer.cardId} -> ${movedTo.cardId}: ${problems.join('; ')}`);
    }
  }

  // A sale: the card is gone — out of the hand, off the board — and a same-turn upgrade's
  // components are back where the rules put them: each on the hero it came from while that
  // hero has room and wears no copy, else in the hand; none still holds a component.
  if (!duplicated && (soldHand || sold)) {
    const card = soldHand ?? sold!.item;
    const after1 = everyCard(after.G);
    const still = after1.find((x) => x.card.iid === card.iid);
    if (still) add('sold-item-gone', card.iid, `${card.cardId}#${card.iid} was sold but is still in ${still.place}`);
    for (const r of restored) {
      const where = after1.find((x) => x.card.iid === r.item.iid);
      const want = r.to === 'hand' ? 'hand' : `attached:${r.to.iid}`;
      if (where?.place !== want) {
        add('sold-item-gone', `${card.iid}-${r.item.iid}`, `${card.cardId} was sold on the turn it was bought but the ${r.item.cardId} it consumed is ${where ? `in ${where.place}` : 'nowhere'}, not ${r.to === 'hand' ? 'back in the hand' : `back on ${r.to.cardId}#${r.to.iid}`}`);
      } else if (where.card.replaced || where.card.replacedFrom !== undefined) {
        add('sold-item-gone', `${card.iid}-${r.item.iid}-held`, `the ${r.item.cardId} put back by ${card.cardId}'s sale still holds the ${where.card.replaced?.cardId ?? '?'} it consumed`);
      }
    }
  }

  // What items give (rules.md §4): a passive's printed bonus sits on its bearer while it is
  // worn — on with a play (and off the hero each component it consumes came from), off with a
  // sale (each component back on its hero, for a same-turn upgrade), across with a move —
  // and the Vitality spike's +1 max HP while the hero wears 3+ Vitality items; a level the
  // play's exp earns adds its own. Current HP moves with the max on the way on (never below
  // 1, and a corpse stays at 0) and is clamped to the new max on the way off. A purchase
  // touches no hero (the card goes to the hand), and no item move touches any other hero.
  if (!duplicated && ITEM_MOVES.includes(move.name)) {
    type Bonus = { atk: number; spirit: number; hp: number };
    const gains = new Map<string, { bonus: Bonus; on: boolean; off: boolean }>();
    const change = (iid: string | undefined, cardId: string | undefined, sign: 1 | -1) => {
      if (!iid || !cardId) return;
      const g = gains.get(iid) ?? { bonus: { atk: 0, spirit: 0, hp: 0 }, on: false, off: false };
      const b = bonusOf(cardId);
      g.bonus = { atk: g.bonus.atk + sign * b.atk, spirit: g.bonus.spirit + sign * b.spirit, hp: g.bonus.hp + sign * b.hp };
      if (sign > 0) g.on = true; else g.off = true;
      gains.set(iid, g);
    };
    if (playedCard && playedOn) {
      change(playedOn.iid, playedCard.cardId, 1);
      for (const c of consumed) if (c.from) change(c.from.iid, c.item.cardId, -1);
    }
    if (sold) {
      change(sold.bearer.iid, sold.item.cardId, -1);
      for (const r of restored) if (r.to !== 'hand') change(r.to.iid, r.item.cardId, 1);
    }
    if (moved && movedTo) { change(moved.bearer.iid, moved.item.cardId, -1); change(movedTo.iid, moved.item.cardId, 1); }
    for (const [iid, h0] of heroes0) {
      const h1 = heroes1.get(iid);
      if (!h1) continue;
      const g = gains.get(iid);
      const lv = (h1.level ?? 1) - (h0.level ?? 1);
      const spike = (hasSpikeOracle(h1, 'vitality') ? 1 : 0) - (hasSpikeOracle(h0, 'vitality') ? 1 : 0);
      const bonus = g?.bonus ?? { atk: 0, spirit: 0, hp: 0 };
      const want = {
        atkMod: bonus.atk + lv * LEVEL_ATK_BONUS,
        spiritMod: bonus.spirit + lv * LEVEL_SPIRIT_BONUS,
        hpMax: bonus.hp + spike + lv * LEVEL_HP_BONUS,
      };
      for (const k of ['atkMod', 'hpMax', 'spiritMod'] as const) {
        if (h1[k] - h0[k] !== want[k]) add('equip-bonus', `${iid}-${k}`, `${h1.cardId}#${iid} ${k} ${h0[k]} -> ${h1[k]} after ${move.name}(${JSON.stringify(args)}); the items' bonuses${spike ? `, the Vitality spike` : ''} and ${lv} level-up(s) give ${want[k] >= 0 ? '+' : ''}${want[k]}`);
      }
      let hp: number | undefined;
      if (!g) hp = h0.hp; // untouched
      else if (g.off && !g.on) hp = Math.min(h0.hp, h1.hpMax); // only lost an item: clamped, never healed
      else if (g.on && !g.off) hp = h0.hp <= 0 ? 0 : Math.max(1, h0.hp + bonus.hp) + Math.max(0, spike) + lv * LEVEL_HP_BONUS;
      if (hp !== undefined && h1.hp !== hp) add('equip-bonus', `${iid}-hp`, `${h1.cardId}#${iid} hp ${h0.hp}/${h0.hpMax} -> ${h1.hp}/${h1.hpMax} after ${move.name}(${JSON.stringify(args)}); the rules give ${hp}`);
    }
  }

  // Exp for wearing (rules.md §4): EXP_ON_EQUIP the first time a hero wears an item played
  // onto it — never for a corpse, a re-play (`equippedIds` remembers what it has worn) or a
  // move; a purchase, a sale and the close earn none. A hero never forgets what it has worn.
  if (!duplicated && ITEM_MOVES.includes(move.name)) {
    for (const [iid, h0] of heroes0) {
      const h1 = heroes1.get(iid);
      if (!h1) continue;
      const first = !!playedCard && playedOn?.iid === iid && !isRespawning(h0) && !(h0.equippedIds ?? []).includes(playedCard.cardId);
      const want = first ? Math.min(MAX_TOTAL_EXP, totalExp(h0) + EXP_ON_EQUIP) - totalExp(h0) : 0;
      if (totalExp(h1) - totalExp(h0) !== want) add('equip-exp', iid, `${h1.cardId}#${iid} exp ${totalExp(h0)} -> ${totalExp(h1)} (Lv${h0.level ?? 1} -> Lv${h1.level ?? 1}) after ${move.name}(${JSON.stringify(args)}); the rules give ${want >= 0 ? '+' : ''}${want}`);
      if (first && !(h1.equippedIds ?? []).includes(playedCard!.cardId)) add('equip-exp', `${iid}-ids`, `${h1.cardId}#${iid} wore ${playedCard!.cardId} for the first time but does not remember it`);
    }
  }
  if (!duplicated) {
    for (const [iid, h0] of heroes0) {
      const h1 = heroes1.get(iid);
      const lost = (h0.equippedIds ?? []).filter((x) => !(h1?.equippedIds ?? []).includes(x));
      if (h1 && lost.length) add('equip-exp', `${iid}-forgot`, `${h1.cardId}#${iid} forgot it had worn ${lost.join(', ')} after ${move.name}`);
    }
  }

  // An active item used (rules.md §5): its bearer has used its one ability this turn, and the
  // item cools down for its tier (less the bearer's Cooldown family, never under 1) — or,
  // hard crowd control, spends one charge.
  if (!duplicated && move.name === 'activate') {
    const used = wornItemOf(B, mover, args[0]);
    const d = used && itemData(used.item.cardId);
    if (used && d?.type === 'spell') {
      const now = wornAfter(used.item.iid);
      const bearer1 = heroes1.get(used.bearer.iid);
      if (bearer1 && !isRespawning(bearer1) && !bearer1.skillUsedThisTurn) add('activate-spends', `${used.bearer.iid}-used`, `${describeUnit(bearer1)} used ${d.id} but is not marked as having used its ability`);
      if (!now) add('activate-spends', used.item.iid, `${d.id}#${used.item.iid} is worn by nobody after it was used`);
      else if (d.hardCC) {
        if (now.item.charges !== (used.item.charges ?? 0) - 1) add('activate-spends', used.item.iid, `hard crowd control ${d.id} had ${used.item.charges} charges and has ${now.item.charges} after its use`);
      } else {
        const want = activeCooldownOracle(now.bearer, d.tier);
        if (now.item.cooldowns?.[d.id] !== want) add('activate-spends', used.item.iid, `${d.id} cools down ${now.item.cooldowns?.[d.id]} after its use; the rules say ${want}`);
      }
    }
  }

  // Cooldowns count their owner's turns (rules.md §5): at the start of a player's turn each of
  // its heroes' and items' cooldowns comes down by one (gone at 0), on a corpse and a merged
  // Rem too; nothing else moves a cooldown but the ability or item that starts it — a skill
  // or ultimate used (the `ability-cooldown` rule), an item played or used (the
  // `played-card-state` / `activate-spends` rules), and Refresher, which takes the player's
  // Active and the items it wears off cooldown. A card that comes or goes is left out.
  if (!duplicated) {
    // (A turn handed over has begun even when its start ends the match — a Bleed tick that
    // fells a hero and the patron with it: its ticks have run.)
    const started = move.name === 'endTurn' && switched ? (after.ctx.currentPlayer as PlayerID) : undefined;
    const usedSkill = move.name === 'useSkill' && typeof args[0] === 'string'
      ? `${args[0]}|${typeof args[2] === 'string' ? args[2] : firstSkillId(heroes0.get(args[0] as string))}` : undefined;
    const usedItem = move.name === 'activate' ? wornItemOf(B, mover, args[0]) : undefined;
    const refreshed = new Set<string>();
    if (usedItem?.item.cardId === 'refresher') {
      const active = B.players[mover].active;
      if (active) for (const c of [active, ...wornItemsOf(active)]) refreshed.add(c.iid);
    }
    const present0 = new Set(everyCard(B).map((x) => x.card.iid));
    const present1 = new Set(everyCard(after.G).map((x) => x.card.iid));
    for (const pid of PIDS) {
      const was = cooldownEntries(B, pid);
      const now = cooldownEntries(after.G, pid);
      const keys = new Set([...was.keys(), ...now.keys()]);
      for (const key of keys) {
        const owner = key.split('|')[0];
        if (!present0.has(owner) || !present1.has(owner)) continue;
        const v0 = was.get(key);
        const v1 = now.get(key);
        let want: number | undefined | 'any' = v0;
        if (started === pid) want = v0 === undefined || v0 - 1 <= 0 ? undefined : v0 - 1;
        else if (key === usedSkill || (usedItem && owner === usedItem.item.iid) || (playedCard && owner === playedCard.iid)) want = 'any';
        else if (refreshed.has(owner) && v1 === undefined) want = undefined;
        if (want !== 'any' && v1 !== want) add('cooldown-bookkeeping', key, `cooldown ${key} ${v0 ?? '-'} -> ${v1 ?? '-'} after ${move.name}(${JSON.stringify(args)}); the rules give ${want ?? '-'}`);
      }
    }
  }

  // Respawn timers: -1 on their owner's turn start, untouched otherwise; back at full HP on 0.
  if (!duplicated && !after.ctx.gameover) {
    const started = newTurn ? (after.ctx.currentPlayer as PlayerID) : undefined;
    for (const pid of PIDS) {
      const now = heroesByIid(after.G.players[pid]);
      for (const [iid, h0] of heroesByIid(B.players[pid])) {
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

  // A new turn: the turn counter steps by one, and the income lands on top of what was banked
  // (LANE_INCOME, the comeback a side trailing on net worth — souls plus the list price of
  // every worn item and every card in the hand — is owed, and the second mover's bonus on
  // its first turn). An income that only adds up with the hands left out of net worth is
  // `net-worth-hand`'s.
  if (newTurn) {
    const cur = after.ctx.currentPlayer as PlayerID;
    const ended = other(cur);
    if (after.G.turnNumber !== B.turnNumber + 1) add('turn-number-step', 'turn', `turnNumber ${B.turnNumber} -> ${after.G.turnNumber} after endTurn`);
    // A hero of the side that ended its turn that falls in the hand-over (a Naptime burst at
    // the end of its turn) pays the new player its bounty too, and so does its Guardian should
    // the push fell it.
    const bounty = bountyOf(ended);
    // The comeback reads the net worths at the income: what the End step paid either side
    // (bounties, a felled Guardian's bounty) is paid before it, what the new turn's start ticks
    // fell after it — so any of those readings is the rule's.
    const comeback = (gap: number) => COMEBACK_STEPS.reduce((n, [by, bonus]) => (gap >= by ? Math.max(n, bonus) : n), 0);
    const seat = cur !== firstOf(after.G) && after.G.turnNumber === 2 ? SECOND_MOVER_FIRST_INCOME_BONUS : 0;
    const shifts = [0, bountyOf(cur)].flatMap((up) => [0, bountyOf(ended)].map((down) => up - down));
    const incomes = (gap: number) => [...new Set(shifts.map((d) => B.players[cur].souls + LANE_INCOME + comeback(gap + d) + seat + bounty))];
    const choices = incomes(netWorthOracle(B, ended) - netWorthOracle(B, cur));
    const got = after.G.players[cur].souls;
    if (!choices.includes(got)) {
      const handless = incomes(netWorthOracleWithoutHand(B, ended) - netWorthOracleWithoutHand(B, cur));
      if (handless.includes(got)) add('net-worth-hand', `${cur}-income`, `P${cur} starts turn ${after.G.turnNumber} with ${got} souls: the comeback left the hands out of net worth (counted, the income says ${choices.join(' or ')})`);
      else add('souls-income', cur, `P${cur} starts turn ${after.G.turnNumber} with ${got} souls; banked ${B.players[cur].souls}, the income (+${bounty} in bounties) says ${choices.join(' or ')}`);
    }
  }
  return out;
}

/** The skill a bare `useSkill` names on `hero`: the first its card lists. */
function firstSkillId(hero: CardInstance | undefined): string | undefined {
  const d = hero && CARDS_BY_ID[hero.cardId];
  return d?.type === 'hero' ? d.skills[0] : undefined;
}

export function checkTransition(
  before: { G: GameState; ctx: Ctx },
  after: { G: GameState; ctx: Ctx },
  move: MoveInfo,
  accepted: boolean,
): string[] {
  return collectTransitionViolations(before, after, move, accepted).map((v) => v.message);
}
