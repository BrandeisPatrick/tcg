import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type {
  CardInstance,
  GameState,
  PlayerID,
  PlayerState,
} from './types';
import { CARDS_BY_ID, getCard, HEROES } from '@/cards';
import { getMatchConfig } from '@/storage/matchConfig';
import { getAIDeckTagged } from '@/decks/aiDecks';
import { tickStartOfTurn, tickEndOfTurnCC, clearTurnFlags, tickCastingPulses } from './statusOps';
import { reapDead, damagePlayer } from './damage';
import { resolveAttackPhase } from './combat';
import { findCardOnBoard, liveBoardCards, otherPlayer, pushLog, resetIid, nextIid } from './util';
import { getAbility } from '@/abilities';
import { withCast } from './castContext';
import { fireEquipmentTriggers } from './equipmentDispatch';
import { grantExp } from './expSystem';
import { MAX_HAND, drawCards } from './deckOps';

const ULT_UNLOCK_TURN = 5;
// Patron HP — the ONLY way it drops is a hero death (flat 1, in killInPlace).
// Low because each death is just 1 dmg; tuned via the eval sim for pacing.
const PATRON_HP = 8;
const SOULS_START = 0;
/** Monotonic counter for `G.action.id` — each play / skill / ult bumps this
 *  so the UI's animation-driver effect (keyed on action.id) re-fires for
 *  back-to-back actions of the same kind. */
let actionCounter = 0;
/** Max equipment a hero can wear at once. Playing a 4th piece requires
 *  the player to choose one of the existing items to discard. */
export const MAX_EQUIPMENT_PER_HERO = 3;
/** Soul cost to activate any hero skill (one-per-player-per-turn rule still
 *  applies — this just adds a tempo cost on top). */
export const SKILL_COST = 1;
// Refill economy (Hearthstone-style): at the start of each of your turns,
// your pool is REFILLED to N — anything banked from last turn is lost.
// The ramp climbs 1 → 10 by your 10th turn, then caps.
const SOULS_REFILL_TABLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Souls to swap an Active with a bench hero (Pokémon-flavored). Shared with the
 *  AI heuristic and the board UI so the cost lives in one place. */
export const RETREAT_COST = 2;

function soulRefillForTurn(globalTurn: number): number {
  // globalTurn 1 → my turn 1 (idx 0), globalTurn 3 → my turn 2 (idx 1), ...
  const idx = Math.floor((globalTurn - 1) / 2);
  return SOULS_REFILL_TABLE[Math.min(idx, SOULS_REFILL_TABLE.length - 1)];
}

const INITIAL_DRAW = 3;
const DRAW_PER_TURN = 1;

function makeInstance(cardId: string, ownerId: PlayerID, zone: CardInstance['zone'], slot?: 0|1|2|3): CardInstance {
  const data = getCard(cardId);
  const hp = data.type === 'hero' ? data.hp : 0;
  const isHero = data.type === 'hero';
  return {
    iid: nextIid(),
    cardId,
    ownerId,
    zone,
    slot,
    attachedTo: undefined,
    attached: [],
    hp,
    hpMax: hp,
    atkMod: 0,
    spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: false,
    // Hero leveling: start at Lv1 with 0 exp.
    ...(isHero ? { exp: 0, level: 1 as const } : {}),
  };
}

/** Empty PlayerState used while the pre-match draft is running — no heroes,
 *  no deck. Replaced via `buildPlayer()` once the 8th draft pick lands. */
function makeEmptyPlayer(pid: PlayerID): PlayerState {
  return {
    id: pid,
    hp: PATRON_HP,
    hpMax: PATRON_HP,
    souls: SOULS_START,
    deck: [],
    hand: [],
    active: null,
    bench: [null, null, null],
    discard: [],
    secret: [],
    ultsConsumed: [],
    skillUsedThisTurn: false,
    respawning: [],
  };
}

/** Snake draft order for 4 picks per player (8 total).
 *  P0 picks at indexes 0, 3, 4, 7; P1 picks at 1, 2, 5, 6. */
const DRAFT_ORDER: PlayerID[] = ['0', '1', '1', '0', '0', '1', '1', '0'];

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface RosterOpts {
  /** Flat stat buff applied to every hero (Story mode enemy scaling). */
  buff?: { atk: number; hp: number };
  /** Patron-HP override for this match (Story pacing). */
  patronHp?: number;
}

/** Build a PlayerState from a 1-4 hero roster + deck. Heroes beyond the first
 *  fill the bench (length 3, padded with null). Used by both the draft path
 *  (exactly 4 heroes) and Story mode (1-4 heroes, optional buff/patron HP). */
export function buildPlayer(pid: PlayerID, heroes: string[], deckCards: string[], opts: RosterOpts = {}): PlayerState {
  const roster = heroes.slice(0, 4);
  const active = makeInstance(roster[0], pid, 'active', 0);
  const bench: (CardInstance | null)[] = [null, null, null];
  for (let i = 1; i < roster.length; i++) {
    bench[i - 1] = makeInstance(roster[i], pid, 'bench', i as 1 | 2 | 3);
  }

  const buff = opts.buff;
  if (buff && (buff.atk || buff.hp)) {
    for (const c of [active, ...bench]) {
      if (!c) continue;
      if (buff.atk) c.atkMod += buff.atk;
      if (buff.hp) { c.hpMax += buff.hp; c.hp += buff.hp; }
    }
  }

  const deck = shuffle(deckCards.map((id) => makeInstance(id, pid, 'deck')));
  const hand: CardInstance[] = [];
  for (let i = 0; i < INITIAL_DRAW && deck.length > 0; i++) {
    const card = deck.pop()!;
    card.zone = 'hand';
    hand.push(card);
  }

  const patronHp = opts.patronHp ?? PATRON_HP;
  return {
    id: pid,
    hp: patronHp,
    hpMax: patronHp,
    souls: SOULS_START,
    deck,
    hand,
    active,
    bench,
    discard: [],
    secret: [],
    ultsConsumed: [],
    skillUsedThisTurn: false,
    respawning: [],
  };
}

function unlockUltimates(G: GameState, ps: PlayerState) {
  if (G.turnNumber < ULT_UNLOCK_TURN) return;
  const heroesOnBoard: CardInstance[] = liveBoardCards(ps);
  for (const hero of heroesOnBoard) {
    const data = CARDS_BY_ID[hero.cardId];
    if (data?.type !== 'hero' || !data.ult) continue;
    if (ps.ultsConsumed.includes(data.ult)) continue;
    if (ps.hand.length >= MAX_HAND) break;
    const ult = makeInstance(data.ult, ps.id, 'hand');
    ps.hand.push(ult);
    ps.ultsConsumed.push(data.ult);
    pushLog(G, `P${ps.id} unlocked ${CARDS_BY_ID[data.ult]?.name ?? data.ult}.`);
  }
}

function applyOnPlay(G: GameState, pid: PlayerID, source: CardInstance, target?: CardInstance) {
  const data = CARDS_BY_ID[source.cardId];
  const abilityIds: string[] =
    data?.type === 'spell' ? data.abilities :
    data?.type === 'equipment' ? data.abilities ?? [] :
    data?.type === 'ultimate' ? data.abilities :
    [];

  // Only fire abilities marked with the onPlay trigger. Equipment can also
  // declare reactive triggers (onBearerSkillDamage, onAttack, onBearerCCSuffered,
  // onBearerSkillUsed, onBearerUltCast) which must NOT fire on attach — those
  // are driven by the engine dispatcher at the appropriate game event.
  for (const aid of abilityIds) {
    const a = getAbility(aid);
    if (a && a.trigger === 'onPlay') {
      a.run(G, { movingPlayer: pid }, { source, target });
    }
  }
  if (data?.type === 'equipment' && target && data.bonus) {
    if (data.bonus.atk) target.atkMod += data.bonus.atk;
    if (data.bonus.hp) { target.hpMax += data.bonus.hp; target.hp += data.bonus.hp; }
    if (data.bonus.spirit) target.spiritMod += data.bonus.spirit;
  }
  // Charge-based gear (cooldown→draw family): seed the instance's charge meter.
  if (data?.type === 'equipment' && data.charges) {
    source.charges = data.charges;
  }
  // Hero leveling: +1 exp to the bearer hero when an item is attached.
  if (data?.type === 'equipment' && target && CARDS_BY_ID[target.cardId]?.type === 'hero') {
    grantExp(G, target, 1);
  }
}

function fireBoardTriggers(G: GameState, pid: PlayerID, trigger: 'startOfTurn' | 'endOfTurn') {
  const ps = G.players[pid];
  for (const c of liveBoardCards(ps)) {
    const data = CARDS_BY_ID[c.cardId];
    if (data?.type !== 'hero') continue;
    for (const passId of data.passives ?? []) {
      const a = getAbility(passId);
      if (a?.trigger === trigger) a.run(G, { movingPlayer: pid }, { source: c });
    }
    // Equipment worn by this hero may also declare turn-based procs
    // (e.g. Extra Regen heals 1 each start of turn).
    for (const eq of c.attached ?? []) {
      const eqData = CARDS_BY_ID[eq.cardId];
      if (eqData?.type !== 'equipment') continue;
      for (const aid of eqData.abilities ?? []) {
        const a = getAbility(aid);
        if (a?.trigger === trigger) a.run(G, { movingPlayer: pid }, { source: c });
      }
    }
  }
}

/**
 * Tick down respawn timers on heroes that are currently corpses in their slots.
 * On reaching 0 the hero returns to full HP in the same slot.
 */
function tickRespawn(G: GameState, pid: PlayerID) {
  const ps = G.players[pid];
  const corpses: CardInstance[] = [];
  if (ps.active && (ps.active.respawnTurnsLeft ?? 0) > 0) corpses.push(ps.active);
  for (const b of ps.bench) if (b && (b.respawnTurnsLeft ?? 0) > 0) corpses.push(b);

  for (const hero of corpses) {
    hero.respawnTurnsLeft = (hero.respawnTurnsLeft ?? 0) - 1;
    if (hero.respawnTurnsLeft <= 0) {
      hero.respawnTurnsLeft = undefined;
      hero.hp = hero.hpMax;
      hero.exhausted = false;
      pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} respawned.`);
    }
  }
}

/** True when a player still has heroes but every one of them is KO'd (on the
 *  respawn timer) at the same moment — a full board wipe. */
function boardWiped(ps: PlayerState): boolean {
  const heroes = [ps.active, ...ps.bench].filter(
    (c): c is CardInstance => !!c && CARDS_BY_ID[c.cardId]?.type === 'hero',
  );
  if (heroes.length === 0) return false; // pre-match / nothing to wipe yet
  return heroes.every((c) => (c.respawnTurnsLeft ?? 0) > 0 || c.hp <= 0);
}

function checkWinner(G: GameState): { winner?: PlayerID; draw?: boolean } | undefined {
  // Two ways to lose: your patron HP hits 0 (death tax), OR your whole roster is
  // on the respawn timer at once (board wipe).
  const p0Down = G.players['0'].hp <= 0 || boardWiped(G.players['0']);
  const p1Down = G.players['1'].hp <= 0 || boardWiped(G.players['1']);
  // Ties go to the player (P0) — a mutual wipe shouldn't end your run on a draw.
  if (p0Down && p1Down) return { winner: '0' };
  if (p0Down) return { winner: '1' };
  if (p1Down) return { winner: '0' };
  return undefined;
}

export const DeadlockGame: Game<GameState> = {
  name: 'deadlock-tcg',
  setup: (): GameState => {
    resetIid();
    const story = getMatchConfig().story;

    // Story mode: skip the draft entirely and build both players from the
    // campaign roster/deck. Enemy heroes carry the node's scaling buff.
    if (story) {
      const G: GameState = {
        players: {
          '0': buildPlayer('0', story.playerHeroes, story.playerDeck, { patronHp: story.patronHp }),
          '1': buildPlayer('1', story.enemyHeroes, story.enemyDeck, { buff: story.enemyBuff, patronHp: story.patronHp }),
        },
        turnNumber: 1,
        selector: null,
        resolveQueue: [],
        log: [{ turn: 1, text: 'Battle begins.' }],
        draft: null,
        draftTurnsOffset: 0,
        mulliganPending: false,
        action: null,
        damageFx: [],
        shop: null,
      };
      G.players['0'].archetype = 'story';
      G.players['1'].archetype = 'story-enemy';
      return G;
    }

    const G: GameState = {
      players: {
        '0': makeEmptyPlayer('0'),
        '1': makeEmptyPlayer('1'),
      },
      turnNumber: 1,
      selector: null,
      resolveQueue: [],
      log: [{ turn: 1, text: 'Draft begins.' }],
      draft: {
        pool: HEROES.map((h) => h.id),
        order: [...DRAFT_ORDER],
        currentIndex: 0,
        picks: { '0': [], '1': [] },
      },
      draftTurnsOffset: 0,  // set in draftPick when draft completes
      mulliganPending: false,
      action: null,
      damageFx: [],
      shop: null,
    };
    return G;
  },

  turn: {
    onBegin: ({ G, ctx }) => {
      // Draft phase: turn changes are just for snake-order ownership; the
      // normal start-of-turn pipeline (souls refill, draw, respawn ticks)
      // must NOT fire while players have empty boards / decks.
      if (G.draft) return;
      const pid = ctx.currentPlayer as PlayerID;
      const ps = G.players[pid];
      // Real-match turn — boardgame.io's ctx.turn includes the draft turns,
      // so subtract the offset captured at draft completion.
      const realTurn = ctx.turn - G.draftTurnsOffset;
      G.turnNumber = realTurn;
      ps.skillUsedThisTurn = false;
      G.damageFx = [];   // flush last turn's hit-flash events before this turn's (e.g. bleed) land
      tickStartOfTurn(G, ps);
      // Refill (not add) — no hoarding across turns. KO bounty banked this turn IS preserved
      // until the NEXT refill, so a kill mid-turn still gives you something to spend right away.
      ps.souls = soulRefillForTurn(realTurn);
      // Draw from deck
      drawCards(G, pid, DRAW_PER_TURN);
      // Ultimate unlock
      unlockUltimates(G, ps);
      // Respawn ticks ONLY for the player whose turn is starting, so a corpse
      // decrements once per round (on its owner's turn) — RESPAWN_TURNS = 3 means
      // 3 of the owner's turns of downtime. (Ticking both players here was a bug:
      // it double-ticked corpses, halving respawn time so KOs felt near-instant.)
      tickRespawn(G, pid);
      fireBoardTriggers(G, pid, 'startOfTurn');
      reapDead(G, G.players['0']);
      reapDead(G, G.players['1']);
      pushLog(G, `--- Turn ${realTurn}, player ${pid} ---`);
    },
    onEnd: ({ G, ctx }) => {
      if (G.draft) return;  // see onBegin — draft turns are not real game turns
      const pid = ctx.currentPlayer as PlayerID;
      fireBoardTriggers(G, pid, 'endOfTurn');
      // Channeled ultimates (Dynamo / Seven / Warden) pulse their AoE here,
      // before combat, so Warden's chip softens enemies ahead of his swing.
      tickCastingPulses(G, G.players[pid]);
      resolveAttackPhase(G, pid);
      // Hero leveling: +1 exp to each alive hero on the player's board.
      for (const c of liveBoardCards(G.players[pid])) {
        const data = CARDS_BY_ID[c.cardId];
        if (data?.type === 'hero') grantExp(G, c, 1);
      }
      // Strip action-denying CC now that this player has spent their turn under
      // it — so "Stun N turns" denies exactly N turns (docs/stats-model.md).
      tickEndOfTurnCC(G, G.players[pid]);
      clearTurnFlags(G.players[pid]);
    },
  },

  moves: {
    /**
     * UI-side callback: signals the reveal animation for the previous
     * action has finished playing. Flips `G.action.state` begin → done. The
     * dispatcher (player input / AI loop) treats anything other than `begin`
     * as not-locked. Engine resolution doesn't gate itself on this — only the
     * UI/AI input layer does. The next playCard / useSkill overwrites
     * `G.action` with a fresh `begin` state.
     */
    completeAction: ({ G }) => {
      if (G.action) G.action.state = 'done';
    },

    shopPick: () => {
      return INVALID_MOVE;
    },

    playCard: ({ G, ctx, playerID }, iid: string, targetIid?: string, discardIid?: string) => {
      const pid = (playerID ?? ctx.currentPlayer) as PlayerID;
      const ps = G.players[pid];
      const idx = ps.hand.findIndex((c) => c.iid === iid);
      if (idx < 0) return INVALID_MOVE;
      const card = ps.hand[idx];
      const data = CARDS_BY_ID[card.cardId];
      if (!data) return INVALID_MOVE;

      const cost = (data.type === 'spell' || data.type === 'equipment' || data.type === 'ultimate')
        ? (card.costOverride ?? data.cost ?? 0) : 0;
      if (ps.souls < cost) return INVALID_MOVE;

      let target: CardInstance | undefined;
      if (targetIid) {
        const f = findCardOnBoard(G, targetIid);
        if (f) target = f.card;
      }

      if (data.type === 'equipment') {
        if (!target) return INVALID_MOVE;
        if (target.ownerId !== pid) return INVALID_MOVE;
        if (CARDS_BY_ID[target.cardId]?.type !== 'hero') return INVALID_MOVE;
        // Can't attach gear to a corpse.
        if ((target.respawnTurnsLeft ?? 0) > 0) return INVALID_MOVE;
        // Equipment cap: if the hero is full, the caller must specify
        // which existing item to discard. Without discardIid the move is
        // invalid so the UI can intercept and prompt the player to pick.
        const attached = target.attached ?? [];
        // Rule: a hero can't equip two of the same equipment.
        if (attached.some((eq) => eq.cardId === card.cardId)) return INVALID_MOVE;
        if (attached.length >= MAX_EQUIPMENT_PER_HERO) {
          if (!discardIid) return INVALID_MOVE;
          const dropIdx = attached.findIndex((eq) => eq.iid === discardIid);
          if (dropIdx < 0) return INVALID_MOVE;
          const dropped = attached[dropIdx];
          dropped.zone = 'discard';
          dropped.attachedTo = undefined;
          ps.discard.push(dropped);
          attached.splice(dropIdx, 1);
          pushLog(G, `${CARDS_BY_ID[target.cardId]?.name} discarded ${CARDS_BY_ID[dropped.cardId]?.name} to make room.`);
        }
        card.attachedTo = target.iid;
      }
      // Spells / ults targeting a hero can't pick a corpse either.
      if (target && (data.type === 'spell' || data.type === 'ultimate') && (target.respawnTurnsLeft ?? 0) > 0) {
        return INVALID_MOVE;
      }

      ps.souls -= cost;
      ps.hand.splice(idx, 1);

      // Cast context: spells channel through the active hero (so spell damage
      // can scale with Spirit and trigger the active hero's equipment).
      // Ults are sourced from their linked hero on the caster's board.
      if (data.type === 'spell') {
        withCast(ps.active, 'spell', () => applyOnPlay(G, pid, card, target));
      } else if (data.type === 'ultimate') {
        const linked = [ps.active, ...ps.bench].find((c) => c?.cardId === (data as any).linkedHero) ?? null;
        withCast(linked, 'ult', () => applyOnPlay(G, pid, card, target));
        if (linked) fireEquipmentTriggers(G, linked, 'onBearerUltCast', { movingPlayer: pid });
      } else {
        applyOnPlay(G, pid, card, target);
      }

      if (data.type === 'spell' || data.type === 'ultimate') {
        card.zone = 'discard';
        ps.discard.push(card);
      } else if (data.type === 'equipment' && target) {
        card.zone = 'equipment';
        if (!target.attached) target.attached = [];
        target.attached.push(card);
      }

      pushLog(G, `P${pid} played ${data.name}${target ? ` on ${CARDS_BY_ID[target.cardId]?.name}` : ''}.`);
      reapDead(G, G.players['0']);
      reapDead(G, G.players['1']);
      // Record the action so the UI can play the matching reveal animation
      // (CardPlayFlash for spell/equipment, UltMomentFlash for ultimate)
      // and lock further input until completeAction fires.
      G.action = {
        id: `act-${++actionCounter}`,
        kind: data.type === 'ultimate' ? 'ult' : 'play',
        by: pid,
        cardId: card.cardId,
        state: 'begin',
      };
    },

    useSkill: ({ G, ctx, playerID }, heroIid: string, targetIid?: string) => {
      const pid = (playerID ?? ctx.currentPlayer) as PlayerID;
      const ps = G.players[pid];
      const found = findCardOnBoard(G, heroIid);
      if (!found || found.owner !== pid) return INVALID_MOVE;
      const hero = found.card;
      // Corpses can't act.
      if ((hero.respawnTurnsLeft ?? 0) > 0) return INVALID_MOVE;
      // Rule: only ONE skill use per player per turn (across all heroes).
      if (ps.skillUsedThisTurn) return INVALID_MOVE;
      // Stun, Silenced, and Sleep all suppress skill use. `casting` is the heavy
      // channel lockout (Dynamo / Seven) — locked in their ultimate, no skills.
      // (Warden's `casting_light` is not listed, so he keeps using Willpower.)
      if (hero.statuses.some((s) => s.id === 'silenced' || s.id === 'stun' || s.id === 'sleep' || s.id === 'casting')) return INVALID_MOVE;

      const data = CARDS_BY_ID[hero.cardId];
      if (data?.type !== 'hero' || !data.skill) return INVALID_MOVE;

      const ability = getAbility(data.skill);
      if (!ability) return INVALID_MOVE;

      // Skills cost 1 soul. Same gating pattern as playCard — reject before
      // any state mutation if the player can't afford it.
      if (ps.souls < SKILL_COST) return INVALID_MOVE;

      let target: CardInstance | undefined;
      if (targetIid) {
        const f = findCardOnBoard(G, targetIid);
        if (f) target = f.card;
      }

      ps.souls -= SKILL_COST;

      // Headline log BEFORE the ability runs — the ability itself will emit
      // damage/status lines under this header, and the player sees who cast what.
      // Format mirrors playCard so CardPlayFlash can show the hero card the
      // same way it shows the spell/equipment card on play.
      const heroName = data.name;
      const targetName = target ? (CARDS_BY_ID[target.cardId]?.name ?? target.cardId) : null;
      pushLog(G, `P${pid} used skill: ${heroName}${targetName ? ` on ${targetName}` : ''}.`);

      // Cast context: equipment triggers (Mystic Burst, Mystic Vulnerability,
      // Suppressor, Mystic Reverb) read this to know "bearer's skill damaged X".
      withCast(hero, 'skill', () => {
        ability.run(G, { movingPlayer: pid }, { source: hero, target });
      });
      hero.skillUsedThisTurn = true;     // per-hero flag (drives UI glint)
      ps.skillUsedThisTurn = true;       // per-player flag (gates the rule)
      // Equipment reactive: Surge of Power fires after bearer used their skill.
      fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: pid });
      reapDead(G, G.players['0']);
      reapDead(G, G.players['1']);
      G.action = {
        id: `act-${++actionCounter}`,
        kind: 'skill',
        by: pid,
        cardId: hero.cardId,
        state: 'begin',
      };
    },

    moveHero: ({ G, ctx, playerID }, fromSlot: 0|1|2|3, toSlot: 0|1|2|3) => {
      const pid = (playerID ?? ctx.currentPlayer) as PlayerID;
      const ps = G.players[pid];
      if (fromSlot === toSlot) return INVALID_MOVE;
      const get = (s: 0|1|2|3) => s === 0 ? ps.active : ps.bench[s - 1];
      const set = (s: 0|1|2|3, c: CardInstance | null) => {
        if (s === 0) { ps.active = c; if (c) { c.zone = 'active'; c.slot = 0; } }
        else { ps.bench[s - 1] = c; if (c) { c.zone = 'bench'; c.slot = s; } }
      };
      const a = get(fromSlot);
      const b = get(toSlot);
      if (!a) return INVALID_MOVE;
      const aData = CARDS_BY_ID[a.cardId];
      if (toSlot === 0 && aData?.type === 'hero' && aData.flags?.benchOnly) return INVALID_MOVE;
      // Retreat cost: swapping the Active out (slot 0 involved, both heroes alive) charges souls.
      const isRetreat = (fromSlot === 0 || toSlot === 0) && a && b;
      if (isRetreat) {
        if (ps.souls < RETREAT_COST) return INVALID_MOVE;
        ps.souls -= RETREAT_COST;
      }
      set(fromSlot, b);
      set(toSlot, a);
      a.exhausted = true;
      if (b) b.exhausted = true;
      if (isRetreat) {
        pushLog(G, `P${pid} retreated (-${RETREAT_COST} souls).`);
      } else {
        pushLog(G, `P${pid} swapped bench slots ${fromSlot} <-> ${toSlot}.`);
      }
    },

    /**
     * Promote a bench hero to Active after the previous Active was KO'd.
     * Free (no Retreat cost) since it's a forced replacement, not a tactical
     * swap. The dying corpse takes the chosen bench hero's slot — that's
     * where it stays greyed-out until its respawn timer hits 0.
     *
     * Callable on EITHER player's turn — your Active can die during the
     * opponent's combat phase or off a skill they cast, and the engine is
     * still on their turn at that moment. The owning player is derived from
     * the bench iid rather than from `playerID` so the dispatcher's turn
     * context doesn't gate the swap.
     */
    promoteToActive: ({ G }, benchHeroIid: string) => {
      let pid: PlayerID | null = null;
      let benchIdx = -1;
      for (const candidate of ['0', '1'] as PlayerID[]) {
        const idx = G.players[candidate].bench.findIndex((b) => b?.iid === benchHeroIid);
        if (idx !== -1) { pid = candidate; benchIdx = idx; break; }
      }
      if (!pid) return INVALID_MOVE;
      const ps = G.players[pid];
      // Only valid when our Active is a corpse — otherwise use retreat (which costs souls).
      if (!ps.active || (ps.active.respawnTurnsLeft ?? 0) === 0) return INVALID_MOVE;
      const benchHero = ps.bench[benchIdx]!;
      // Replacement must be alive (no corpses moving to Active).
      if ((benchHero.respawnTurnsLeft ?? 0) > 0) return INVALID_MOVE;
      const data = CARDS_BY_ID[benchHero.cardId];
      if (data?.type !== 'hero' || data.flags?.benchOnly) return INVALID_MOVE;
      // Swap: bench hero becomes Active, corpse takes the vacated bench slot.
      const corpse = ps.active;
      ps.active = benchHero;
      benchHero.zone = 'active';
      benchHero.slot = 0;
      ps.bench[benchIdx] = corpse;
      corpse.zone = 'bench';
      corpse.slot = (benchIdx + 1) as 1 | 2 | 3;
      pushLog(G, `P${pid} promoted ${data.name} to Active.`);
    },

    endTurn: ({ events }) => {
      events.endTurn();
    },

    /**
     * Pre-match hero draft pick. Validates the pick is from the current
     * player's draft turn, removes the hero from the pool, and either ends
     * the boardgame.io turn (if the next pick belongs to the other player)
     * or stays in the same turn (consecutive snake picks). On the final
     * pick, finalizes both players' PlayerStates with the drafted heroes
     * and flips `mulliganPending = true` so MulliganOverlay takes over.
     */
    draftPick: ({ G, ctx, events }, heroId: string) => {
      if (!G.draft) return INVALID_MOVE;
      const expected = G.draft.order[G.draft.currentIndex];
      if (expected !== ctx.currentPlayer) return INVALID_MOVE;
      if (!G.draft.pool.includes(heroId)) return INVALID_MOVE;

      G.draft.pool = G.draft.pool.filter((id) => id !== heroId);
      G.draft.picks[expected].push(heroId);
      G.draft.currentIndex++;

      const data = CARDS_BY_ID[heroId];
      pushLog(G, `P${expected} drafted ${data?.name ?? heroId}.`);

      if (G.draft.currentIndex >= G.draft.order.length) {
        const p0Heroes = G.draft.picks['0'] as [string, string, string, string];
        const p1Heroes = G.draft.picks['1'] as [string, string, string, string];
        const config = getMatchConfig();
        const p0Tag = getAIDeckTagged();
        const playerDeck = config.playerDeck.length > 0 ? config.playerDeck : p0Tag.cards;
        const aiTag = getAIDeckTagged();
        G.players['0'] = buildPlayer('0', p0Heroes, playerDeck);
        G.players['1'] = buildPlayer('1', p1Heroes, aiTag.cards);
        G.players['0'].archetype = config.playerDeck.length > 0 ? 'custom' : p0Tag.archetype;
        G.players['1'].archetype = aiTag.archetype;
        G.draft = null;
        G.mulliganPending = false;
        G.draftTurnsOffset = ctx.turn - 1;
        G.turnNumber = 1;
        const currentPid = ctx.currentPlayer as PlayerID;
        const currentPs = G.players[currentPid];
        currentPs.souls = soulRefillForTurn(1);
        unlockUltimates(G, currentPs);
        pushLog(G, 'Match begins.');
        if (ctx.currentPlayer !== '0') events.endTurn();
        return;
      }

      const next = G.draft.order[G.draft.currentIndex];
      if (next !== ctx.currentPlayer) events.endTurn();
    },

    mulligan: ({ G }) => {
      if (!G.mulliganPending) return INVALID_MOVE;
      G.mulliganPending = false;
    },
  },

  endIf: ({ G }) => checkWinner(G),
};
