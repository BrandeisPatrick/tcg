/**
 * State invariants for the Deadlock TCG engine. `checkInvariants` looks at ONE
 * state; `checkTransition` looks at a state pair (before / after one move).
 *
 * Every violation has a stable `id` (kebab-case invariant name) and a `key`
 * (id + the thing it is about) so a driver can report a violation once, when it
 * first appears, instead of on every later step of a corrupted game.
 *
 * The rules they hold the engine to are rules.md §2–§5 (souls, the turn's shop
 * and act steps, items, abilities), read through the oracles in oracle.ts —
 * written from the rules and the card texts, never from the engine's own
 * functions.
 *
 * Nothing here mutates G (it is frozen by immer in a live client).
 */
import type { Ctx } from 'boardgame.io';
import type { CardInstance, GameState, PlayerID, PlayerState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { STATUSES_BY_ID } from '@/statuses';
import { getAbility } from '@/abilities';
import {
  ACTIVE_COOLDOWN, COMEBACK_STEPS, EXP_ON_EQUIP, HARD_CC_CHARGES, LANE_INCOME, LEVEL_ATK_BONUS, LEVEL_HP_BONUS,
  LEVEL_SPIRIT_BONUS, LEVEL_THRESHOLDS, MAX_LEVEL, PRICE, SECOND_MOVER_FIRST_INCOME_BONUS, SKILL_COOLDOWN,
} from '@/engine/constants';
import { attackPower, isRespawning, koPatronDamage, stepInCandidates } from '@/engine/query';
import {
  MAX_TOTAL_EXP, PIDS, activateBlockedOracle, activeCooldownOracle, boardOf, bountyOracle, buyBlockedOracle, buyPriceOracle,
  closeShopBlockedOracle, describeUnit, everyCard, hasSpikeOracle, isHeroCard, isMergedRem, itemData, moveItemBlockedOracle,
  netWorthOracle, other, retreatCostOracle, sellBlockedOracle, sellRefundOracle, slotCapOracle, slottedHeroOf, totalExp,
  ultCooldownOracle, ultLocked, upgradeComponentOracle, wornItemOf, wornItemsOf,
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
/** Everything the shop step accepts: its own moves, ending the turn, an owed
 *  promotion and the board's reveal bookkeeping. */
const SHOP_STEP_MOVES = [...SHOP_MOVES, 'endTurn', 'promoteToActive', 'completeAction'];

/** The full cooldown an active item of `tier` starts on (before any Cooldown item). */
const fullItemCooldown = (tier: number) => (tier <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high);

/** Invariants of a single state. */
export function collectInvariantViolations(G: GameState, ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  const add = (id: string, subject: string, message: string) =>
    out.push({ id, key: `${id}|${subject}`, message: `${id}: ${message}` });
  const over = !!ctx.gameover;
  const current = ctx.currentPlayer as PlayerID;

  // ---- uniqueness + ownership over every card anywhere ----
  const seen = new Map<string, string>();
  for (const { card, place, pid } of everyCard(G)) {
    const prev = seen.get(card.iid);
    if (prev) add('iid-unique', card.iid, `iid ${card.iid} (${card.cardId}) is in both ${prev} and ${place} (P${pid})`);
    else seen.set(card.iid, place);
    if (card.ownerId !== pid) add('owner-matches', card.iid, `${card.cardId}#${card.iid} sits in P${pid}'s ${place} but ownerId is ${card.ownerId}`);
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
    if (!Number.isFinite(ps.hp) || ps.hp > ps.hpMax) add('patron-range', pid, `P${pid} patron hp ${ps.hp} > hpMax ${ps.hpMax}`);
    if (!G.draft && ps.hp <= 0 && !over) add('patron-dead-no-gameover', pid, `P${pid} patron hp ${ps.hp} but the game is not over`);

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

  // ---- what the rules allow: an accepted shop move or item use the oracle refuses ----
  {
    const B = before.G;
    const why = move.name === 'buy' ? buyBlockedOracle(B, mover, args[0], args[1])
      : move.name === 'sell' ? sellBlockedOracle(B, mover, args[0])
      : move.name === 'moveItem' ? moveItemBlockedOracle(B, mover, args[0], args[1])
      : move.name === 'closeShop' ? closeShopBlockedOracle(B, mover)
      : move.name === 'activate' ? activateBlockedOracle(B, mover, args[0], args[1])
      : null;
    if (why) add('accepted-illegal', move.name, `${move.name}(${JSON.stringify(args)}) by P${mover} was accepted but the rules refuse it: ${why}`);
  }

  // The patron only loses HP when one of its heroes falls — the level of each
  // hero that went from alive to a corpse during this move (the level it fell
  // at: a level persists through death) — and, at the end of a turn, when the
  // ending player's Active pushes into a lane its rival has left empty: then
  // the rival's patron loses that Active's bullet power. It never gains any.
  // (Skipped once an iid is duplicated: hero identity is the iid, and a clone of
  // a card — already reported as `iid-unique` — would make the count meaningless.)
  const duplicated = hasDuplicateIids(before.G) || hasDuplicateIids(after.G);
  // (A push that ends the match leaves the turn with the player who made it.)
  const ending = move.name === 'endTurn' ? before.ctx.currentPlayer as PlayerID : undefined;
  for (const pid of duplicated ? [] : PIDS) {
    const b = before.G.players[pid];
    const a = after.G.players[pid];
    const was = heroesByIid(b);
    let owed = 0;
    const names: string[] = [];
    for (const [iid, h] of heroesByIid(a)) {
      const prev = was.get(iid);
      if (prev && !isRespawning(prev) && isRespawning(h)) { owed += koPatronDamage(h); names.push(`${h.cardId} Lv${h.level ?? 1}`); }
    }
    const drop = b.hp - a.hp;
    const pusher = ending !== undefined && pid === other(ending) ? before.G.players[ending].active : null;
    const push = pusher && !isRespawning(pusher) ? attackPower(pusher).total : 0;
    if (drop !== owed && !(push > 0 && drop === owed + push)) {
      add('patron-delta', pid, `P${pid} patron hp ${b.hp} -> ${a.hp} (drop ${drop}) but its fallen heroes owe ${owed} [${names.join(',')}]${push > 0 ? ` (or ${owed + push} with the empty-lane push)` : ''}`);
    }
  }

  // ---- what a shop move does to the cards (worked out on the board before it) ----
  const B = before.G;
  const bought = move.name === 'buy' ? slottedHeroOf(B, mover, args[1]) : undefined;
  const component = bought ? upgradeComponentOracle(bought, args[0]) : undefined;
  const sold = move.name === 'sell' ? wornItemOf(B, mover, args[0]) : undefined;
  /** A same-turn upgrade's sale gives back the component it replaced (one moved since has let it go). */
  const restored = sold && sold.item.boughtOnTurn === B.turnNumber ? sold.item.replaced : undefined;
  const moved = move.name === 'moveItem' ? wornItemOf(B, mover, args[0]) : undefined;
  const movedTo = moved ? slottedHeroOf(B, mover, args[1]) : undefined;

  // Cards do not vanish: every card anywhere before is still somewhere after — but for
  // the item a sale takes off and the component an upgrade replaces. And none appears
  // from nowhere: a purchase brings its one item, a same-turn upgrade's sale its component.
  {
    const beforeIids = new Map(everyCard(before.G).map((x) => [x.card.iid, x]));
    const afterCards = everyCard(after.G);
    const afterIids = new Set(afterCards.map((x) => x.card.iid));
    const mayGo = new Set([component?.iid, sold?.item.iid].filter((x): x is string => !!x));
    for (const [iid, x] of beforeIids) {
      if (!afterIids.has(iid) && !mayGo.has(iid)) add('card-vanished', iid, `${x.card.cardId}#${iid} (${x.place}) of P${x.pid} is nowhere after ${move.name}`);
    }
    const fresh = afterCards.filter((x) => !beforeIids.has(x.card.iid));
    const purchase = bought ? fresh.find((x) => x.card.cardId === args[0] && x.place === `attached:${bought.iid}`) : undefined;
    for (const x of fresh) {
      if (x === purchase || (restored && x.card.iid === restored.iid)) continue;
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
  /** The bounties the heroes of `pid` that fell during the move pay their opponent (`bountyOracle`). */
  const bountyOf = (pid: PlayerID) => {
    const was = heroesByIid(before.G.players[pid]);
    let n = 0;
    for (const [iid, h] of heroesByIid(after.G.players[pid])) {
      const prev = was.get(iid);
      if (prev && !isRespawning(prev) && isRespawning(h)) n += bountyOracle(after.G, h);
    }
    return n;
  };

  if (!duplicated && move.name !== 'endTurn') {
    // Souls: only the move's price (an item's — the difference for an upgrade —, a
    // Retreat's; abilities are free), what a sale refunds, what an item used pays out
    // (SOULS_ON_USE) and the bounty of each enemy hero that fell (its level + 1, + 2 for
    // the richest hero on the board). Moving an item or closing the shop is free. No ceiling.
    let cost = 0;
    let payout = 0;
    if (move.name === 'buy' && bought) cost = buyPriceOracle(bought, args[0]);
    else if (move.name === 'sell' && sold) payout = sellRefundOracle(B, sold.item);
    else if (move.name === 'activate') {
      const used = wornItemOf(B, mover, args[0]);
      payout = used ? SOULS_ON_USE[used.item.cardId] ?? 0 : 0;
    } else if (move.name === 'moveHero') {
      const [f, t] = args as [number, number];
      const ps = B.players[mover];
      const get = (s: number) => (s === 0 ? ps.active : ps.bench[s - 1]);
      if ((f === 0 || t === 0) && get(f) && get(t)) cost = retreatCostOracle(B, mover);
    }
    const wantMover = B.players[mover].souls - cost + payout + bountyOf(foe);
    if (after.G.players[mover].souls !== wantMover) {
      add('souls-delta', mover, `P${mover} souls ${B.players[mover].souls} -> ${after.G.players[mover].souls} after ${move.name}(${JSON.stringify(args)}); price ${cost}, payout ${payout} and ${bountyOf(foe)} in bounties give ${wantMover}`);
    }
    const wantFoe = B.players[foe].souls + bountyOf(mover);
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

  // A purchase: the item goes on at once, recording the engine turn and what was paid; an
  // active starts on its full cooldown (less the bearer's Cooldown family, never under 1)
  // or, hard crowd control, with HARD_CC_CHARGES charges; a passive has neither; an
  // upgrade keeps the component it replaced aside for the turn.
  if (!duplicated && bought) {
    const hero1 = heroes1.get(bought.iid);
    const fresh = hero1 ? wornItemsOf(hero1).filter((a) => a.cardId === args[0] && !wornItemsOf(bought).some((x) => x.iid === a.iid)) : [];
    const d = itemData(args[0]);
    if (!hero1 || !d || fresh.length !== 1) {
      add('bought-item-state', bought.iid, `buy(${JSON.stringify(args)}) was accepted but ${describeUnit(hero1)} wears ${fresh.length} new ${String(args[0])}`);
    } else {
      const it = fresh[0];
      const problems: string[] = [];
      const price = buyPriceOracle(bought, d.id);
      if (it.boughtOnTurn !== B.turnNumber) problems.push(`boughtOnTurn ${it.boughtOnTurn} (turn ${B.turnNumber})`);
      if (it.paid !== price) problems.push(`paid ${it.paid} (price ${price})`);
      const cd = it.cooldowns?.[d.id];
      if (d.type === 'spell' && d.hardCC) {
        if (it.charges !== HARD_CC_CHARGES || cd !== undefined) problems.push(`hard crowd control with charges ${it.charges} and cooldown ${cd} (${HARD_CC_CHARGES} charges, no cooldown)`);
      } else if (d.type === 'spell') {
        const want = activeCooldownOracle(hero1, d.tier);
        if (cd !== want || it.charges !== undefined) problems.push(`an active on cooldown ${cd}${it.charges !== undefined ? ` with charges ${it.charges}` : ''} (its full cooldown here is ${want})`);
      } else if (Object.keys(it.cooldowns ?? {}).length || it.charges !== undefined) {
        problems.push(`a passive with cooldowns ${JSON.stringify(it.cooldowns)} / charges ${it.charges}`);
      }
      if (component ? it.replaced?.iid !== component.iid : it.replaced !== undefined) problems.push(`replaced ${it.replaced?.cardId}#${it.replaced?.iid} (the component it upgrades is ${component ? `${component.cardId}#${component.iid}` : 'not worn'})`);
      if (component && wornItemsOf(hero1).some((a) => a.iid === component.iid)) problems.push(`the component ${component.cardId} is still worn`);
      if (problems.length) add('bought-item-state', it.iid, `${d.id} bought for ${hero1.cardId}#${hero1.iid}: ${problems.join('; ')}`);
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
      if (it.replaced) problems.push(`still holds the ${it.replaced.cardId} it replaced`);
      if (problems.length) add('moved-item-state', it.iid, `${it.cardId}#${it.iid} moved ${moved.bearer.cardId} -> ${movedTo.cardId}: ${problems.join('; ')}`);
    }
  }

  // A sale: the item is gone from the board, and a same-turn upgrade's component is back on its bearer.
  if (!duplicated && sold) {
    const still = everyCard(after.G).find((x) => x.card.iid === sold.item.iid);
    if (still) add('sold-item-gone', sold.item.iid, `${sold.item.cardId}#${sold.item.iid} was sold but is still in ${still.place}`);
    if (restored) {
      const bearer1 = heroes1.get(sold.bearer.iid);
      if (!bearer1 || !wornItemsOf(bearer1).some((a) => a.iid === restored.iid)) {
        add('sold-item-gone', `${sold.item.iid}-component`, `${sold.item.cardId} was sold on the turn it was bought but the ${restored.cardId} it replaced is not back on ${sold.bearer.cardId}`);
      }
    }
  }

  // What items give (rules.md §4): a passive's printed bonus sits on its bearer while it is
  // worn — on with a purchase (less the component an upgrade replaces), off with a sale (the
  // component back, for a same-turn upgrade), across with a move — and the Vitality spike's
  // +1 max HP while the hero wears 3+ Vitality items; a level the purchase's exp earns adds
  // its own. Current HP moves with the max on the way on (never below 1, and a corpse stays
  // at 0) and is clamped to the new max on the way off. A shop move touches no other hero.
  if (!duplicated && SHOP_MOVES.includes(move.name)) {
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
    if (bought) { change(bought.iid, String(args[0]), 1); change(bought.iid, component?.cardId, -1); }
    if (sold) { change(sold.bearer.iid, sold.item.cardId, -1); change(sold.bearer.iid, restored?.cardId, 1); }
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

  // Exp for wearing (rules.md §4): EXP_ON_EQUIP the first time a hero wears an item it
  // buys — never for a corpse, a rebuy (`equippedIds` remembers what it has worn) or a
  // move; nothing else a shop move does earns any. A hero never forgets what it has worn.
  if (!duplicated && SHOP_MOVES.includes(move.name)) {
    for (const [iid, h0] of heroes0) {
      const h1 = heroes1.get(iid);
      if (!h1) continue;
      const first = !!bought && bought.iid === iid && !isRespawning(h0) && !(h0.equippedIds ?? []).includes(String(args[0]));
      const want = first ? Math.min(MAX_TOTAL_EXP, totalExp(h0) + EXP_ON_EQUIP) - totalExp(h0) : 0;
      if (totalExp(h1) - totalExp(h0) !== want) add('equip-exp', iid, `${h1.cardId}#${iid} exp ${totalExp(h0)} -> ${totalExp(h1)} (Lv${h0.level ?? 1} -> Lv${h1.level ?? 1}) after ${move.name}(${JSON.stringify(args)}); the rules give ${want >= 0 ? '+' : ''}${want}`);
      if (first && !(h1.equippedIds ?? []).includes(String(args[0]))) add('equip-exp', `${iid}-ids`, `${h1.cardId}#${iid} wore ${String(args[0])} for the first time but does not remember it`);
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
  // or ultimate used (the `ability-cooldown` rule), an item bought or used (the
  // `bought-item-state` / `activate-spends` rules), and Refresher, which takes the player's
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
        else if (key === usedSkill || (usedItem && owner === usedItem.item.iid)) want = 'any';
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
  // every worn item — is owed, and the second mover's bonus on its first turn).
  if (newTurn) {
    const cur = after.ctx.currentPlayer as PlayerID;
    const ended = other(cur);
    if (after.G.turnNumber !== B.turnNumber + 1) add('turn-number-step', 'turn', `turnNumber ${B.turnNumber} -> ${after.G.turnNumber} after endTurn`);
    // A hero of the side that ended its turn that falls in the hand-over (a Naptime burst at
    // the end of its turn, reaped by the new turn's resolve) pays the new player its bounty too.
    const bounty = bountyOf(ended);
    // The comeback reads the net worths at the income: the ender may have banked the bounties
    // of the new player's heroes its channel pulses felled at the end of its turn (they are
    // paid before the income), so either reading is the rule's.
    const comeback = (gap: number) => COMEBACK_STEPS.reduce((n, [by, bonus]) => (gap >= by ? Math.max(n, bonus) : n), 0);
    const gap = netWorthOracle(B, ended) - netWorthOracle(B, cur);
    const seat = cur !== firstOf(after.G) && after.G.turnNumber === 2 ? SECOND_MOVER_FIRST_INCOME_BONUS : 0;
    const choices = [...new Set([gap, gap + bountyOf(cur)].map((g) => B.players[cur].souls + LANE_INCOME + comeback(g) + seat + bounty))];
    if (!choices.includes(after.G.players[cur].souls)) add('souls-income', cur, `P${cur} starts turn ${after.G.turnNumber} with ${after.G.players[cur].souls} souls; banked ${B.players[cur].souls}, the income (+${bounty} in bounties) says ${choices.join(' or ')}`);
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
