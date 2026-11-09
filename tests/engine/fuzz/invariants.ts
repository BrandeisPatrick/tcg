/**
 * State invariants for the Deadlock TCG engine. `checkInvariants` looks at ONE
 * state; `checkTransition` looks at a state pair (before / after one move).
 *
 * Every violation has a stable `id` (kebab-case invariant name) and a `key`
 * (id + the thing it is about) so a driver can report a violation once, when it
 * first appears, instead of on every later step of a corrupted game.
 *
 * The rules they hold the engine to are docs/deck-plan.md's (the deck, the
 * draw, the hand: heroes onto the bench for free, items onto a hero for their
 * price — the difference for an evolving upgrade —, the upgrade an item makes
 * shuffled into the deck, the draw cards' discard, souls only from the
 * income, a fallen hero back in the hand after RESPAWN_TURNS) and rules.md
 * §2–§5 (abilities, items), read through the oracles in oracle.ts — written
 * from the rules and the card texts, never from the engine's own functions.
 * The deck's: every card in exactly one place (`iid-unique`, `card-vanished`,
 * `card-appeared`), the piles' card states (`deck-card-state`,
 * `hand-card-state`, `discard-card-state`), the hand's cap on draws
 * (`hand-cap`, `draw-per-turn`), the owed choices (`pending-active`,
 * `pending-discard`), a play (`played-card-state`, `play-slot-cap`), a draw
 * card (`draw-card`), a discard (`discard-move`), a hero from the hand
 * (`placed-hero`), and net worth counting the hand (`net-worth-hand`). The
 * map's (rules.md §6): each side's track and its order (`structures-*`), what a
 * push takes (`structure-delta`: a kill's level + 1, an empty lane's bullet
 * power, doubled from round 9), the flex slot (`flex-slot-walker`), the
 * Mid-Boss (`boss-*`), the Rejuvenator (`revive-*`), the wait of a fallen hero
 * (`respawn-timer-start`, `respawn-timer`) and the round cap (`round-cap`,
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
  ACTIVE_COOLDOWN, BOSS_CARD_ID, BOSS_HP, BOSS_SPAWN_ROUND, DRAW_PER_TURN, EXP_ON_EQUIP, HARD_CC_CHARGES, LANE_INCOME,
  LEVEL_THRESHOLDS, MAX_HAND, MAX_LEVEL, REVIVE_CREDITS, ROUND_CAP,
  SECOND_MOVER_FIRST_INCOME_BONUS, SKILL_COOLDOWN,
} from '@/engine/constants';
import type { ItemCard } from '@/engine/types';
import { attackPower, isRespawning, netWorth, stepInCandidates } from '@/engine/query';
import {
  DRAW_CARDS, MAX_TOTAL_EXP, PIDS, activateBlockedOracle, activeCooldownOracle, boardOf, chooseActiveBlockedOracle, deckOf,
  describeUnit, discardBlockedOracle, discardList, discardOf, everyCard, handCardOf, handOf, hasSpikeOracle, isHeroCard, kitSoulsOracle,
  isMergedRem, itemData, killPushOracle, netWorthOracle, netWorthOracleWithoutHand, other, patronOf, placeHeroBlockedOracle,
  playBlockedOracle, playCostOracle, pushMultiplierOracle, respawnTimerOracle, retreatCostOracle, roundOracle, seatOnTurn,
  slotCapOracle, slottedHeroOf, standingWinnerOracle, structureHpOracle, totalExp, ultCooldownOracle, ultLocked,
  upgradeComponentOracle, upgradeMadeOracle, wornItemOf, wornItemsOf,
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

/** The move that puts items on (and, an evolving upgrade, one off) heroes. */
const ITEM_MOVES = ['playCard'];

/** The full cooldown an active item starts on: its own (the draw cards' 2), else its tier's. */
const fullItemCooldown = (d: ItemCard) => (d.type === 'spell' && d.cooldown !== undefined ? d.cooldown : d.tier <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high);

/** The bench-only hero (Rem) never stands in the Active slot. */
const benchOnlyCard = (cardId: string) => !!(CARDS_BY_ID[cardId] as { flags?: { benchOnly?: boolean } } | undefined)?.flags?.benchOnly;

/** Invariants of a single state. */
export function collectInvariantViolations(G: GameState, ctx: Ctx): Violation[] {
  const out: Violation[] = [];
  const add = (id: string, subject: string, message: string) =>
    out.push({ id, key: `${id}|${subject}`, message: `${id}: ${message}` });
  const over = !!ctx.gameover;
  const current = ctx.currentPlayer as PlayerID;

  // ---- uniqueness + ownership over every card anywhere (the decks, hands and discard piles included) ----
  const seen = new Map<string, string>();
  for (const { card, place, pid } of everyCard(G)) {
    const prev = seen.get(card.iid);
    if (prev) add('iid-unique', card.iid, `iid ${card.iid} (${card.cardId}) is in both ${prev} and ${place} (P${pid})`);
    else seen.set(card.iid, place);
    // A card in a hand is its player's (`hand-owner`); one in a deck or a discard pile, or on the board, its side's.
    if (card.ownerId !== pid) add(place === 'hand' ? 'hand-owner' : 'owner-matches', card.iid, `${card.cardId}#${card.iid} sits in P${pid}'s ${place} but ownerId is ${card.ownerId}`);
  }

  // ---- the deck, the hand and the discard pile ----
  for (const pid of PIDS) {
    // The deck: face-down cards, set going by nothing — items, and heroes as they were drafted.
    for (const c of deckOf(G, pid)) {
      const wrong: string[] = [];
      if (c.zone !== 'deck') wrong.push(`zone '${c.zone}'`);
      if (c.attachedTo !== undefined) wrong.push(`attachedTo ${c.attachedTo}`);
      if ((c.attached ?? []).length) wrong.push(`carries ${c.attached!.map((a) => a.cardId).join('+')}`);
      if (Object.keys(c.cooldowns ?? {}).length) wrong.push(`cooldowns ${JSON.stringify(c.cooldowns)}`);
      if (c.charges !== undefined) wrong.push(`charges ${c.charges}`);
      if (isHeroCard(c)) {
        if (c.hp !== c.hpMax || c.statuses.length || c.respawnTurnsLeft !== undefined) wrong.push(`a hero at ${c.hp}/${c.hpMax} with ${c.statuses.length} status(es), timer ${c.respawnTurnsLeft}`);
      } else if (!itemData(c.cardId)) wrong.push('neither an item nor a hero');
      if (wrong.length) add('deck-card-state', c.iid, `${c.cardId}#${c.iid} in P${pid}'s deck: ${wrong.join('; ')}`);
    }
    // The hand: items drawn (or given), set going by nothing yet — their cooldown starts when they
    // are played; and heroes, drawn or back from a fall: clean, at full HP, out of any slot, carrying
    // the items they wore when they fell.
    let items = 0;
    for (const c of handOf(G, pid)) {
      const d = itemData(c.cardId);
      const label = `${c.cardId}#${c.iid} in P${pid}'s hand`;
      const wrong: string[] = [];
      if (c.zone !== 'hand') wrong.push(`zone '${c.zone}'`);
      if (c.attachedTo !== undefined) wrong.push(`attachedTo ${c.attachedTo}`);
      if (d) {
        items++;
        if ((c.attached ?? []).length) wrong.push(`carries ${c.attached!.map((a) => a.cardId).join('+')}`);
        if (Object.keys(c.cooldowns ?? {}).length) wrong.push(`cooldowns ${JSON.stringify(c.cooldowns)}`);
        if (c.charges !== undefined) wrong.push(`charges ${c.charges}`);
      } else if (isHeroCard(c)) {
        if (c.slot !== undefined) wrong.push(`slot ${c.slot}`);
        if (c.hp !== c.hpMax || c.hpMax < 1) wrong.push(`hp ${c.hp}/${c.hpMax}`);
        if (c.statuses.length) wrong.push(`statuses ${c.statuses.map((x) => x.id).join('+')}`);
        if (c.respawnTurnsLeft !== undefined) wrong.push(`respawn timer ${c.respawnTurnsLeft}`);
        if (c.skillUsedThisTurn) wrong.push('its ability spent');
        if ((c.attached ?? []).some((a) => !itemData(a.cardId))) wrong.push('carries a hero');
        checkWearer(c, pid, false);
      } else wrong.push('neither an item nor a hero');
      if (wrong.length) add('hand-card-state', c.iid, `${label}: ${wrong.join('; ')}`);
    }
    // A draw into a full hand is skipped: the items in a hand never pass MAX_HAND (a fallen
    // hero coming back is no draw, and may take the hand past it).
    if (items > MAX_HAND) add('hand-cap', pid, `P${pid} holds ${items} items in hand (MAX_HAND ${MAX_HAND})`);
    // The discard pile: cards out of play — what a draw card's discard sent there (a hero among
    // them, with what it wore), and the item an evolving upgrade replaced. Nothing cools down there.
    for (const c of discardOf(G, pid)) {
      const wrong: string[] = [];
      if (c.zone !== 'discard') wrong.push(`zone '${c.zone}'`);
      if (c.attachedTo !== undefined) wrong.push(`attachedTo ${c.attachedTo}`);
      if (Object.keys(c.cooldowns ?? {}).length) wrong.push(`cooldowns ${JSON.stringify(c.cooldowns)}`);
      if (itemData(c.cardId) && (c.attached ?? []).length) wrong.push(`carries ${c.attached!.map((a) => a.cardId).join('+')}`);
      if (!itemData(c.cardId) && !isHeroCard(c)) wrong.push('neither an item nor a hero');
      if (wrong.length) add('discard-card-state', c.iid, `${c.cardId}#${c.iid} in P${pid}'s discard pile: ${wrong.join('; ')}`);
    }
    // Net worth counts the hand: the engine's reading is the rules' — souls, worn items and the
    // items in the hand at list price.
    if (!G.draft && netWorth(G, pid) !== netWorthOracle(G, pid)) {
      add('net-worth-hand', pid, `P${pid}'s net worth reads ${netWorth(G, pid)}; souls, worn items and the hand at list price make ${netWorthOracle(G, pid)} (${netWorthOracleWithoutHand(G, pid)} without the hand)`);
    }
  }

  // ---- the choices owed ----
  if (G.pendingActive !== undefined) {
    // The opening: the human seat puts its first Active in the lane from the opening hand,
    // before any turn is played out.
    const pid = G.pendingActive;
    const ps = G.players[pid];
    const can = !!ps && handOf(G, pid).some((c) => isHeroCard(c) && !benchOnlyCard(c.cardId));
    if (G.draft || !ps || ps.active || !can || G.turnNumber > 1 || pid !== humanOf(G)) {
      add('pending-active', String(pid), `G.pendingActive is P${pid} (turn ${G.turnNumber}, human seat ${humanOf(G)}) but its Active is ${describeUnit(ps?.active)} and its hand ${can ? 'holds' : 'holds no'} hero that can stand there`);
    }
  }
  if (G.pendingDiscard !== undefined) {
    // A draw card's discard: owed by the player on turn, at least one card, no more than the hand holds.
    const d = G.pendingDiscard;
    const hand = G.players[d.pid] ? handOf(G, d.pid).length : -1;
    if (d.pid !== current || !Number.isInteger(d.count) || d.count < 1 || d.count > hand || !(d.cardId in DRAW_CARDS)) {
      add('pending-discard', String(d.pid), `G.pendingDiscard is ${JSON.stringify(d)} with P${current} on turn and ${hand} card(s) in P${d.pid}'s hand`);
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
    // A drafted match has eight different heroes, wherever they are — on a board, merged into an
    // ally, in a deck, a hand or a discard pile (the hand-built test boards hold two different
    // rosters too).
    const roster = everyCard(G).filter((x) => isHeroCard(x.card)).map((x) => x.card.cardId);
    const dupHero = roster.find((x, i) => roster.indexOf(x) !== i);
    if (dupHero) add('roster-duplicate', dupHero, `${dupHero} appears twice across the two sides`);
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

    // ---- the Active slot ----
    // It may be empty (a fallen Active gone back to the hand, the opening before the first
    // Active is put in) or a corpse; either way a bench hero who can step up does: an AI seat's
    // at once, the human seat's when it is asked (`pendingPromotion`).
    if (ps.active && !isRespawning(ps.active) && isBenchOnly(ps.active)) {
      add('active-not-bench-only', pid, `P${pid}'s living Active is the bench-only hero ${describeUnit(ps.active)}`);
    }
    const open = !ps.active || isRespawning(ps.active);
    // (A trigger prompt owed comes first: the promotion waits for its answer.)
    if (open && !over && !G.triggers?.length) {
      const candidates = stepInCandidates(ps).length;
      if (candidates > 0) {
        const owes = G.pendingPromotion === pid;
        if (pid !== humanOf(G)) add('active-corpse-unresolved', pid, `P${pid} (an AI seat) has ${ps.active ? 'a corpse' : 'no'} Active with ${candidates} step-in candidate(s); resolve() should have auto-promoted`);
        else if (!owes) add('active-corpse-unresolved', pid, `P${pid} (the human seat) has ${ps.active ? 'a corpse' : 'no'} Active with ${candidates} step-in candidate(s) but G.pendingPromotion is ${G.pendingPromotion}`);
      }
    }
    if (G.pendingPromotion === pid) {
      const needs = open && stepInCandidates(ps).length > 0;
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
      // (A hero whose fall waits on a trigger prompt is at 0 HP until it is answered.)
      const asked = !!G.triggers?.some((t) => t.moment === 'onFall' && t.subjectIid === c.iid);
      if (c.hp <= 0 && !over && !asked) add('living-hero-zero-hp', c.iid, `living hero with hp ${c.hp} was not reaped: ${label}`);
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

  /** One worn item: its charges and its cooldown. */
  function checkItem(a: CardInstance, _pid: PlayerID) {
    const d = itemData(a.cardId)!;
    const hardCC = d.type === 'spell' && !!d.hardCC;
    // Hard crowd control: HARD_CC_CHARGES uses a match and no cooldown; nothing else has charges.
    if (hardCC) {
      if (!Number.isInteger(a.charges) || a.charges! < 0 || a.charges! > HARD_CC_CHARGES) add('item-charges', a.iid, `hard crowd control ${a.cardId}#${a.iid} has charges ${a.charges} (0..${HARD_CC_CHARGES})`);
    } else if (a.charges !== undefined) add('item-charges', a.iid, `${a.cardId}#${a.iid} is no hard crowd control but has charges ${a.charges}`);
    // An active's cooldown is its own (keyed by its id), from 0 to its full cooldown (its own,
    // else its tier's); a passive and a hard crowd-control item have none.
    for (const [k, v] of Object.entries(a.cooldowns ?? {})) {
      if (d.type !== 'spell' || hardCC || k !== a.cardId) add('item-cooldown-key', `${a.iid}-${k}`, `${d.type === 'spell' ? (hardCC ? 'hard crowd control' : 'active') : 'passive'} ${a.cardId}#${a.iid} has a cooldown entry ${k}=${v}`);
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > fullItemCooldown(d)) add('cooldown-range', `${a.iid}-${k}`, `${a.cardId}#${a.iid} cooldown ${v} (0..${fullItemCooldown(d)})`);
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

/** One fall of a hero during a move: the hero (as the move left it — on the board, or back
 *  in the hand when it waits no turns), the levels it may have fallen at (the one it had
 *  before the move, or a level gained in it — a kill's exp on a hero that fell to Return
 *  Fire), and whether it paid — a fall to the Mid-Boss's blow pushes nothing. */
interface Fall { hero: CardInstance; levels: number[]; paid: boolean }

/** The falls of `pid`'s heroes during a move: every hero standing before it that ends it a
 *  corpse — or off the board and in the hand (a fall with no wait, RESPAWN_TURNS 0) — and
 *  every 'revive' the move pushed for a hero standing before it (the Rejuvenator's revive
 *  in place) — each revive is a fall that came back. A boss's knockout hit marks one of
 *  them unpaid. */
function fallsDuring(before: GameState, after: GameState, pid: PlayerID, fresh: FxEvent[]): Fall[] {
  const was = heroesByIid(before.players[pid]);
  const bossIid = before.boss?.iid;
  const count = (pred: (e: FxEvent) => string | undefined) => {
    const m = new Map<string, number>();
    for (const e of fresh) { const iid = pred(e); if (iid) m.set(iid, (m.get(iid) ?? 0) + 1); }
    return m;
  };
  // (A trigger that cancels a fall — Shocking Reanimation — is no fall at all: `cancelled`.)
  const revives = count((e) => (e.kind === 'revive' && !e.cancelled ? e.iid : undefined));
  const bossBlows = count((e) => (e.kind === 'hit' && e.ko && !!bossIid && e.source?.iid === bossIid ? e.iid : undefined));
  // A fall that waited on a trigger prompt carries whether it pays (the Mid-Boss's blow came
  // in an earlier move): passed, it goes ahead as it would have.
  for (const t of before.triggers ?? []) if (t.unpaid) bossBlows.set(t.subjectIid, (bossBlows.get(t.subjectIid) ?? 0) + 1);
  const now = heroesByIid(after.players[pid]);
  const backInHand = new Map(handOf(after, pid).filter(isHeroCard).map((h) => [h.iid, h]));
  const out: Fall[] = [];
  for (const [iid, prev] of was) {
    if (isRespawning(prev)) continue; // a corpse that goes back to the hand is no fall
    const h = now.get(iid) ?? backInHand.get(iid);
    if (!h) continue;
    const n = (revives.get(iid) ?? 0) + (isRespawning(h) || (!now.has(iid) && backInHand.has(iid)) ? 1 : 0);
    let unpaid = bossBlows.get(iid) ?? 0;
    const levels = [...new Set([prev.level ?? 1, h.level ?? 1])];
    for (let k = 0; k < n; k++) out.push({ hero: h, levels, paid: unpaid-- <= 0 });
  }
  return out;
}

function hasDuplicateIids(G: GameState): boolean {
  const seen = new Set<string>();
  for (const { card } of everyCard(G)) {
    if (seen.has(card.iid)) return true;
    seen.add(card.iid);
  }
  return false;
}

/** Every cooldown entry on a side's board — its heroes' (merged Rem included) and their worn
 *  items' — keyed `owner iid|ability or item id`. (A hero in the hand, and what it wears,
 *  is off the board: its cooldowns wait there.) */
function cooldownEntries(G: GameState, pid: PlayerID): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of heroesByIid(G.players[pid]).values()) {
    for (const c of [h, ...wornItemsOf(h)]) {
      for (const [k, v] of Object.entries(c.cooldowns ?? {})) m.set(`${c.iid}|${k}`, v as number);
    }
  }
  return m;
}

/** The iids of every card on a side's board: its heroes (merged Rem included) and what they wear. */
function boardIids(G: GameState, pid: PlayerID): Set<string> {
  const out = new Set<string>();
  for (const h of heroesByIid(G.players[pid]).values()) {
    out.add(h.iid);
    for (const a of wornItemsOf(h)) out.add(a.iid);
  }
  return out;
}

/** A card's printed stat bonus (passive items only carry one). */
function bonusOf(cardId: string | undefined): { atk: number; spirit: number; hp: number } {
  const d = itemData(cardId);
  const b = d?.type === 'equipment' ? d.bonus : undefined;
  return { atk: b?.atk ?? 0, spirit: b?.spirit ?? 0, hp: b?.hp ?? 0 };
}

/** Where a card is in G (its place label and its side), by iid. */
function placeOf(G: GameState, iid: string): { card: CardInstance; place: string; pid: string } | undefined {
  return everyCard(G).find((x) => x.card.iid === iid);
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
  const B = before.G;

  // ---- what the rules allow: an accepted card play, hand move, choice or item use the oracle refuses ----
  {
    const why = move.name === 'playCard' ? playBlockedOracle(B, mover, args[0], args[1], args[2])
      : move.name === 'placeHero' ? placeHeroBlockedOracle(B, mover, args[0], args[1] === true)
      : move.name === 'chooseActive' ? chooseActiveBlockedOracle(B, args[0])
      : move.name === 'discard' ? discardBlockedOracle(B, mover, discardList(args[0]))
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

  // A fallen hero waits RESPAWN_TURNS of its owner's turns in its slot (docs/deck-plan.md),
  // whatever the round. A side with a live Rejuvenator spends a credit instead and the hero
  // is back in place at full HP; a side whose credits outlast the move had none of its heroes
  // end the move as a corpse. (An end of turn is left out: the next turn's start ticks its
  // own timers.)
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
        const onBoard = heroesByIid(ps1).has(f.hero.iid);
        if (onBoard && !isRespawning(f.hero)) continue; // revived in place
        const timer = respawnTimerOracle(after.G, f.hero, roundOracle(before.G));
        if (onBoard ? f.hero.respawnTurnsLeft !== timer : timer !== 0) add('respawn-timer-start', f.hero.iid, `${describeUnit(f.hero)} fell in round ${roundOracle(before.G)} and ${onBoard ? `waits ${f.hero.respawnTurnsLeft}` : 'went straight to the hand'}; the rules give a wait of ${timer}`);
        if (live && ps0.reviveCredits - credited > 0) add('revive-owed', f.hero.iid, `${describeUnit(f.hero)} fell while P${pid} held ${ps0.reviveCredits - credited} live revive credit(s) after the others, and stayed down`);
      }
    }
  }

  // ---- what a hand move does to the cards (worked out on the board before it) ----
  /** A play: the card from the hand, the hero it goes on, the component it evolves (off that
   *  same hero), and the upgrade it makes. */
  const playedCard = move.name === 'playCard' ? handCardOf(B, mover, args[0]) : undefined;
  const playedOn = playedCard ? slottedHeroOf(B, mover, args[1]) : undefined;
  const evolved = playedCard && playedOn ? upgradeComponentOracle(playedOn, playedCard.cardId) : undefined;
  const upgradeMade = playedCard ? upgradeMadeOracle(playedCard.cardId, args[2]) : undefined;

  // Cards do not vanish and none appears from nowhere: every card anywhere before (decks, hands
  // and discard piles included) is somewhere after — but for a Mid-Boss that falls; and the
  // only new cards are the upgrade a play makes (in the player's deck) and, at a round's start,
  // the Mid-Boss.
  {
    const beforeIids = new Map(everyCard(before.G).map((x) => [x.card.iid, x]));
    const afterCards = everyCard(after.G);
    const afterIids = new Set(afterCards.map((x) => x.card.iid));
    const fellBoss = before.G.boss && !after.G.boss ? before.G.boss.iid : undefined;
    for (const [iid, x] of beforeIids) {
      if (!afterIids.has(iid) && iid !== fellBoss) add('card-vanished', iid, `${x.card.cardId}#${iid} (${x.place}) of P${x.pid} is nowhere after ${move.name}`);
    }
    const appeared = afterCards.filter((x) => !beforeIids.has(x.card.iid));
    let upgrades = 0;
    for (const x of appeared) {
      if (x.place === 'pit' && handOver) continue;
      if (upgradeMade && x.place === 'deck' && x.pid === mover && x.card.cardId === upgradeMade && upgrades === 0) { upgrades++; continue; }
      add('card-appeared', x.card.iid, `${x.card.cardId}#${x.card.iid} (${x.place}) of P${x.pid} appeared after ${move.name}(${JSON.stringify(args)})`);
    }
    // Each copy played makes one upgrade, shuffled into the deck.
    if (!duplicated && playedCard && playedOn && upgradeMade && upgrades !== 1) {
      add('played-card-state', `${playedCard.iid}-upgrade`, `${playedCard.cardId} was played but no ${upgradeMade} was shuffled into P${mover}'s deck`);
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
  // owed promotion or trigger prompt, and the board's reveal bookkeeping) is accepted.
  if (before.G.attackUsed && !['endTurn', 'promoteToActive', 'completeAction', 'useTrigger', 'passTrigger'].includes(move.name)) {
    add('act-over', move.name, `${move.name} was accepted after the turn's attack had ended the Act`);
  }
  // A choice owed comes first: while it is, nothing else is accepted.
  if (B.pendingActive !== undefined && !['chooseActive', 'completeAction'].includes(move.name)) {
    add('choice-owed', move.name, `${move.name} was accepted while P${B.pendingActive}'s first Active was owed`);
  }
  if (B.pendingDiscard !== undefined && !['discard', 'promoteToActive', 'completeAction', 'useTrigger', 'passTrigger'].includes(move.name)) {
    add('choice-owed', move.name, `${move.name} was accepted while P${B.pendingDiscard.pid} owed a discard`);
  }
  // A trigger prompt owed (engine/prompts.ts) is answered before anything else.
  const asked = B.triggers?.[B.triggers.length - 1];
  if (asked && !['useTrigger', 'passTrigger', 'completeAction'].includes(move.name)) {
    add('choice-owed', move.name, `${move.name} was accepted while P${asked.pid} owed an answer to a trigger prompt`);
  }
  if (!asked && (move.name === 'useTrigger' || move.name === 'passTrigger')) {
    add('choice-owed', move.name, `${move.name} was accepted with no trigger prompt owed`);
  }
  // One Retreat a turn.
  if (move.name === 'moveHero' && before.G.retreatUsed) {
    const [f, t] = args as [number, number];
    if (f === 0 || t === 0) add('retreat-once', 'moveHero', `a second Retreat was accepted in one turn`);
  }

  // A hero's level only goes up, wherever it is (it persists through a fall and back in the hand).
  if (!duplicated) {
    const heroes = (G: GameState) => new Map(everyCard(G).filter((x) => isHeroCard(x.card)).map((x) => [x.card.iid, x.card]));
    const now = heroes(after.G);
    for (const [iid, h0] of heroes(before.G)) {
      const h1 = now.get(iid);
      if (h1 && (h1.level ?? 1) < (h0.level ?? 1)) add('level-monotonic', iid, `${h1.cardId}#${iid} level ${h0.level} -> ${h1.level}`);
    }
  }

  // ---- souls (docs/deck-plan.md): the lane's income is the only souls there are ----
  // Within a turn souls change only by what a move costs — an item put on a hero (its price,
  // the difference for an upgrade that evolves), a Retreat (the leaving hero's own price), a
  // skill or an ultimate (its souls, docs/hero-design.md §2) — and by what an item used pays
  // out as its text says (SOULS_ON_USE). Kills, the Guardian and the Mid-Boss pay nothing;
  // placing a hero, the first Active, a discard and a promotion are free. No ceiling.
  if (!duplicated && move.name !== 'endTurn') {
    let cost = 0;
    let payout = 0;
    if (playedCard && playedOn) cost = playCostOracle(playedOn, playedCard.cardId);
    else if (move.name === 'activate') {
      const used = wornItemOf(B, mover, args[0]);
      payout = used ? SOULS_ON_USE[used.item.cardId] ?? 0 : 0;
    } else if (move.name === 'moveHero') {
      const [f, t] = args as [number, number];
      const ps = B.players[mover];
      const get = (s: number) => (s === 0 ? ps.active : ps.bench[s - 1]);
      if ((f === 0 || t === 0) && get(f) && get(t)) cost = retreatCostOracle(B, mover);
    } else if (move.name === 'useSkill' && typeof args[0] === 'string') {
      const hero = heroesByIid(B.players[mover]).get(args[0] as string);
      if (hero) cost = kitSoulsOracle(hero, typeof args[2] === 'string' ? (args[2] as string) : undefined);
    }
    // A trigger used is paid by the seat it was offered to, on either seat's turn: its kit price.
    let foeCost = 0;
    if (move.name === 'useTrigger' && asked && typeof args[0] === 'string') {
      const hero = heroesByIid(B.players[asked.pid]).get(args[0] as string);
      const price = hero ? kitSoulsOracle(hero, typeof args[1] === 'string' ? (args[1] as string) : undefined) : 0;
      if (asked.pid === mover) cost = price;
      else foeCost = price;
    }
    const wantMover = B.players[mover].souls - cost + payout;
    if (after.G.players[mover].souls !== wantMover) {
      add('souls-delta', mover, `P${mover} souls ${B.players[mover].souls} -> ${after.G.players[mover].souls} after ${move.name}(${JSON.stringify(args)}); price ${cost} and payout ${payout} give ${wantMover}`);
    }
    if (after.G.players[foe].souls !== B.players[foe].souls - foeCost) {
      add('souls-delta', foe, `P${foe} souls ${B.players[foe].souls} -> ${after.G.players[foe].souls} after P${mover}'s ${move.name}; ${foeCost ? `its trigger costs ${foeCost}` : 'nothing pays the rival'}`);
    }
  }

  // A kit ability, used: the hero is spent for the turn, and its cooldown is armed — a skill's
  // own (SKILL_COOLDOWN unless its data names one), an ultimate's ULT_COOLDOWN. A locked
  // ultimate (below the unlock level) is never used.
  if (!duplicated && move.name === 'useSkill' && typeof args[0] === 'string') {
    const hero0 = heroesByIid(B.players[mover]).get(args[0] as string);
    const hero1 = heroesByIid(after.G.players[mover]).get(args[0] as string);
    const d = hero0 && CARDS_BY_ID[hero0.cardId];
    if (hero0 && hero1 && d?.type === 'hero') {
      const id = typeof args[2] === 'string' ? (args[2] as string) : d.skills[0];
      if (ultLocked(hero0, id)) add('ult-locked', hero0.iid, `${describeUnit(hero0)} used its ultimate below the unlock level`);
      const want = d.ult === id ? ultCooldownOracle(hero0) : getAbility(id)?.cooldown ?? SKILL_COOLDOWN;
      if ((hero1.cooldowns?.[id] ?? 0) !== want) add('ability-cooldown', hero1.iid, `${describeUnit(hero1)} used ${id}; its cooldown is ${hero1.cooldowns?.[id]}, the rules say ${want}`);
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

  // ---- the items (rules.md §4, docs/deck-plan.md) ----
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

  // A play: the card leaves the hand and is worn by the hero named; an active starts on its
  // full cooldown (its own, else its tier's) or, hard crowd control, with HARD_CC_CHARGES; a
  // passive has neither. The component it evolves leaves that hero for the player's discard
  // pile. A play never leaves a hero over its cap.
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
        const want = activeCooldownOracle(hero1, d);
        if (cd !== want || keys.length !== 1 || it.charges !== undefined) problems.push(`an active on cooldowns ${JSON.stringify(it.cooldowns)}${it.charges !== undefined ? ` with charges ${it.charges}` : ''} (its full cooldown is ${want})`);
      } else if (keys.length || it.charges !== undefined) {
        problems.push(`a passive with cooldowns ${JSON.stringify(it.cooldowns)} / charges ${it.charges}`);
      }
    }
    if (evolved) {
      const where = placeOf(after.G, evolved.iid);
      if (where?.place !== 'discard' || where.pid !== mover) problems.push(`the ${evolved.cardId}#${evolved.iid} it evolves is ${where ? `in ${where.place} of P${where.pid}` : 'nowhere'}, not in P${mover}'s discard pile`);
    }
    if (problems.length) add('played-card-state', playedCard.iid, `${playedCard.cardId}#${playedCard.iid} played on ${playedOn.cardId}#${playedOn.iid}: ${problems.join('; ')}`);
    if (hero1 && wornItemsOf(hero1).length > slotCapOracle(after.G, mover)) {
      add('play-slot-cap', playedOn.iid, `${describeUnit(hero1)} wears ${wornItemsOf(hero1).length} items after playCard(${JSON.stringify(args)}) (cap ${slotCapOracle(after.G, mover)})`);
    }
  }

  // A hero from the hand goes onto the board — into the empty Active slot when asked, else the
  // first free bench slot — and the first Active of the opening into the lane.
  if (!duplicated && (move.name === 'placeHero' || move.name === 'chooseActive')) {
    const owner = move.name === 'chooseActive' ? B.pendingActive : mover;
    const card = owner ? handCardOf(B, owner, args[0]) : undefined;
    if (card && owner) {
      const ps1 = after.G.players[owner];
      const problems: string[] = [];
      if (handCardOf(after.G, owner, card.iid)) problems.push('it is still in the hand');
      const toLane = move.name === 'chooseActive' || args[1] === true;
      const onBoard = boardOf(ps1).find((c) => c.iid === card.iid);
      if (!onBoard) problems.push('it is not on the board');
      else if (toLane && move.name === 'chooseActive' && ps1.active?.iid !== card.iid) problems.push(`it is in ${onBoard.zone}, not the Active slot`);
      if (move.name === 'chooseActive' && after.G.pendingActive !== undefined) problems.push(`G.pendingActive is still ${after.G.pendingActive}`);
      if (problems.length) add('placed-hero', card.iid, `${move.name}(${JSON.stringify(args)}) of ${card.cardId}#${card.iid}: ${problems.join('; ')}`);
    }
  }

  // A discard: the named cards go from the hand to the player's discard pile, and that much of
  // the discard owed is paid (what is left, never more than the hand holds; none: paid).
  if (!duplicated && move.name === 'discard' && B.pendingDiscard) {
    const named = discardList(args[0]).filter((x): x is string => typeof x === 'string');
    const problems: string[] = [];
    for (const iid of named) {
      const where = placeOf(after.G, iid);
      if (where?.place !== 'discard' || where.pid !== mover) problems.push(`${iid} is ${where ? `in ${where.place}` : 'nowhere'}`);
    }
    const left = Math.min(B.pendingDiscard.count - named.length, handOf(after.G, mover).length);
    const want = left > 0 ? left : undefined;
    if (after.G.pendingDiscard?.count !== want) problems.push(`the discard owed went ${B.pendingDiscard.count} -> ${after.G.pendingDiscard?.count ?? 'none'} (the rules: ${want ?? 'none'})`);
    if (problems.length) add('discard-move', mover, `discard(${JSON.stringify(args)}) by P${mover}: ${problems.join('; ')}`);
  }

  // A draw card used: N cards from the top of the deck to the hand (fewer when the deck runs
  // out or the hand fills to MAX_HAND), then M owed to the discard (no more than the hand
  // holds; none when it is empty).
  if (!duplicated && move.name === 'activate') {
    const used = wornItemOf(B, mover, args[0]);
    const draw = used ? DRAW_CARDS[used.item.cardId] : undefined;
    if (draw) {
      const deck0 = deckOf(B, mover);
      const hand0 = handOf(B, mover).length;
      const n = Math.max(0, Math.min(draw.draw, deck0.length, MAX_HAND - hand0));
      const top = deck0.slice(deck0.length - n).map((c) => c.iid).reverse();
      const hand1 = handOf(after.G, mover);
      const drawn = hand1.slice(hand0).map((c) => c.iid);
      const owed = Math.min(draw.discard, hand1.length);
      const problems: string[] = [];
      if (JSON.stringify(drawn) !== JSON.stringify(top)) problems.push(`drew [${drawn.join(', ')}], the top of the deck is [${top.join(', ')}]`);
      if (deckOf(after.G, mover).length !== deck0.length - n) problems.push(`the deck went ${deck0.length} -> ${deckOf(after.G, mover).length}`);
      const pd = after.G.pendingDiscard;
      if (owed > 0 ? pd?.pid !== mover || pd.count !== owed : pd !== undefined) problems.push(`the discard owed is ${JSON.stringify(pd)} (the rules: ${owed} by P${mover})`);
      if (problems.length) add('draw-card', used!.item.iid, `${used!.item.cardId} (draw ${draw.draw}, discard ${draw.discard}) by P${mover} with ${hand0} in hand: ${problems.join('; ')}`);
    }
  }

  // What items give (rules.md §4): a passive's printed bonus sits on its bearer while it is
  // worn — on with a play, and off with the component an evolving upgrade replaces — and the
  // Vitality spike's +1 max HP while the hero wears 3+ Vitality items; a level the play's exp
  // earns adds its own. Current HP moves with the max on the way on (never below 1, and a
  // corpse stays at 0). A play touches no other hero.
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
      if (evolved) change(playedOn.iid, evolved.cardId, -1);
    }
    for (const [iid, h0] of heroes0) {
      const h1 = heroes1.get(iid);
      if (!h1) continue;
      const g = gains.get(iid);
      const lv = (h1.level ?? 1) - (h0.level ?? 1);
      const spike = (hasSpikeOracle(h1, 'vitality') ? 1 : 0) - (hasSpikeOracle(h0, 'vitality') ? 1 : 0);
      const bonus = g?.bonus ?? { atk: 0, spirit: 0, hp: 0 };
      // A level adds the hero's own growth (docs/hero-design.md §2).
      const hd = CARDS_BY_ID[h1.cardId];
      const growth = hd?.type === 'hero' ? hd.growth : { atk: 0, hp: 0, spirit: 0 };
      const want = {
        atkMod: bonus.atk + lv * growth.atk,
        spiritMod: bonus.spirit + lv * growth.spirit,
        hpMax: bonus.hp + spike + lv * growth.hp,
      };
      for (const k of ['atkMod', 'hpMax', 'spiritMod'] as const) {
        if (h1[k] - h0[k] !== want[k]) add('equip-bonus', `${iid}-${k}`, `${h1.cardId}#${iid} ${k} ${h0[k]} -> ${h1[k]} after ${move.name}(${JSON.stringify(args)}); the items' bonuses${spike ? `, the Vitality spike` : ''} and ${lv} level-up(s) give ${want[k] >= 0 ? '+' : ''}${want[k]}`);
      }
      let hp: number | undefined;
      if (!g) hp = h0.hp; // untouched
      else if (g.on && !g.off) hp = h0.hp <= 0 ? 0 : Math.max(1, h0.hp + bonus.hp) + Math.max(0, spike) + lv * growth.hp;
      if (hp !== undefined && h1.hp !== hp) add('equip-bonus', `${iid}-hp`, `${h1.cardId}#${iid} hp ${h0.hp}/${h0.hpMax} -> ${h1.hp}/${h1.hpMax} after ${move.name}(${JSON.stringify(args)}); the rules give ${hp}`);
    }
  }

  // Exp for wearing (rules.md §4): EXP_ON_EQUIP the first time a hero wears an item played
  // onto it — never for a corpse or a re-play (`equippedIds` remembers what it has worn).
  // A hero never forgets what it has worn.
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
  // item cools down (its own cooldown, else its tier's) — or, hard crowd control, spends one charge.
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
        const want = activeCooldownOracle(now.bearer, d);
        if (now.item.cooldowns?.[d.id] !== want) add('activate-spends', used.item.iid, `${d.id} cools down ${now.item.cooldowns?.[d.id]} after its use; the rules say ${want}`);
      }
    }
  }

  // Cooldowns count their owner's turns (rules.md §5): at the start of a player's turn each of
  // its heroes' and items' cooldowns on the board comes down by one (gone at 0), on a corpse
  // and a merged Rem too; nothing else moves a cooldown but the ability or item that starts it
  // — a skill or ultimate used (the `ability-cooldown` rule), an item played or used (the
  // `played-card-state` / `activate-spends` rules), and Refresher, which takes the player's
  // Active and the items it wears off cooldown. A card that comes onto the board or leaves it
  // (a hero to or from the hand, a component evolved away) is left out.
  if (!duplicated) {
    // (A turn handed over has begun even when its start ends the match — a Bleed tick that
    // fells a hero and the patron with it: its ticks have run.)
    const started = move.name === 'endTurn' && switched ? (after.ctx.currentPlayer as PlayerID) : undefined;
    const usedSkill = move.name === 'useSkill' && typeof args[0] === 'string'
      ? `${args[0]}|${typeof args[2] === 'string' ? args[2] : firstSkillId(heroes0.get(args[0] as string))}` : undefined;
    const usedItem = move.name === 'activate' ? wornItemOf(B, mover, args[0]) : undefined;
    // A trigger used arms its own cooldown, as from its button.
    const usedTrigger = move.name === 'useTrigger' && typeof args[0] === 'string' ? `${args[0]}|${args[1]}` : undefined;
    const refreshed = new Set<string>();
    if (usedItem?.item.cardId === 'refresher') {
      const active = B.players[mover].active;
      if (active) for (const c of [active, ...wornItemsOf(active)]) refreshed.add(c.iid);
    }
    for (const pid of PIDS) {
      const present0 = boardIids(B, pid);
      const present1 = boardIids(after.G, pid);
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
        else if (key === usedSkill || key === usedTrigger || (usedItem && owner === usedItem.item.iid) || (playedCard && owner === playedCard.iid)) want = 'any';
        else if (refreshed.has(owner) && v1 === undefined) want = undefined;
        if (want !== 'any' && v1 !== want) add('cooldown-bookkeeping', key, `cooldown ${key} ${v0 ?? '-'} -> ${v1 ?? '-'} after ${move.name}(${JSON.stringify(args)}); the rules give ${want ?? '-'}`);
      }
    }
  }

  // The wait of a fallen hero: -1 on its owner's turn start, untouched otherwise; at 0 it
  // leaves its slot for the hand, at full HP, clean.
  if (!duplicated && !after.ctx.gameover) {
    const started = newTurn ? (after.ctx.currentPlayer as PlayerID) : undefined;
    for (const pid of PIDS) {
      const now = heroesByIid(after.G.players[pid]);
      for (const [iid, h0] of heroesByIid(B.players[pid])) {
        if (!isRespawning(h0)) continue;
        const want = started === pid ? (h0.respawnTurnsLeft ?? 0) - 1 : h0.respawnTurnsLeft ?? 0;
        const h1 = now.get(iid);
        if (want > 0) {
          if (!h1 || h1.respawnTurnsLeft !== want) add('respawn-timer', iid, `${h0.cardId}#${iid} wait ${h0.respawnTurnsLeft} -> ${h1 ? h1.respawnTurnsLeft : 'off the board'} after ${move.name}; expected ${want}`);
        } else {
          const inHand = handOf(after.G, pid).find((c) => c.iid === iid);
          if (h1 || !inHand || inHand.hp !== inHand.hpMax || inHand.respawnTurnsLeft !== undefined) {
            add('respawn-timer', iid, `${h0.cardId}#${iid} should be back in P${pid}'s hand at full HP (${h1 ? `still on the board, wait ${h1.respawnTurnsLeft}` : inHand ? `hp ${inHand.hp}/${inHand.hpMax}` : 'nowhere in the hand'})`);
          }
        }
      }
    }
  }

  // A new turn: the turn counter steps by one, the income lands on top of what was kept
  // (LANE_INCOME, and the second mover's bonus on its first turn — nothing else, ever), the
  // side whose turn ended keeps its souls, and the new player draws DRAW_PER_TURN — unless the
  // deck is empty or the hand already holds MAX_HAND (a fallen hero back in the hand first
  // counts).
  if (newTurn) {
    const cur = after.ctx.currentPlayer as PlayerID;
    const ended = other(cur);
    if (after.G.turnNumber !== B.turnNumber + 1) add('turn-number-step', 'turn', `turnNumber ${B.turnNumber} -> ${after.G.turnNumber} after endTurn`);
    const seat = cur !== firstOf(after.G) && after.G.turnNumber === 2 ? SECOND_MOVER_FIRST_INCOME_BONUS : 0;
    const want = B.players[cur].souls + LANE_INCOME + seat;
    const got = after.G.players[cur].souls;
    if (got !== want) {
      add('souls-income', cur, `P${cur} starts turn ${after.G.turnNumber} with ${got} souls; kept ${B.players[cur].souls}, the income says ${want}`);
    }
    if (after.G.players[ended].souls !== B.players[ended].souls) add('souls-income', `${ended}-ended`, `P${ended}'s souls went ${B.players[ended].souls} -> ${after.G.players[ended].souls} as its turn ended`);
    if (!duplicated) {
      const deck0 = deckOf(B, cur);
      const deckIids = new Set(deck0.map((c) => c.iid));
      const hand1 = handOf(after.G, cur);
      const drawn = hand1.filter((c) => deckIids.has(c.iid)).length;
      const back = hand1.filter((c) => isHeroCard(c) && heroesByIid(B.players[cur]).has(c.iid)).length;
      const room = MAX_HAND - (handOf(B, cur).length + back);
      const wantDrawn = Math.max(0, Math.min(DRAW_PER_TURN, deck0.length, room));
      if (drawn !== wantDrawn) add('draw-per-turn', cur, `P${cur} drew ${drawn} at the start of turn ${after.G.turnNumber}; deck ${deck0.length}, hand ${handOf(B, cur).length} (+${back} back from a fall): the rules give ${wantDrawn}`);
      if (drawn > 0 && hand1.length > Math.max(MAX_HAND, handOf(B, cur).length + back)) add('hand-cap', `${cur}-draw`, `P${cur}'s hand holds ${hand1.length} after its draw (MAX_HAND ${MAX_HAND})`);
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
