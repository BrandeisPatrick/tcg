import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type {
  CardInstance,
  GameState,
  PlayerID,
  PlayerState,
} from './types';
import { CARDS_BY_ID, getCard } from '@/cards';
import { STARTER_DECK_PLAYER, STARTER_DECK_AI, type DeckBlueprint } from '@/decks/starter';
import { tickStartOfTurn, clearTurnFlags } from './statusOps';
import { reapDead, damagePlayer } from './damage';
import { resolveAttackPhase } from './combat';
import { findCardOnBoard, liveBoardCards, otherPlayer, pushLog, resetIid, nextIid } from './util';
import { getAbility } from '@/abilities';

const MAX_HAND = 7;
const ULT_UNLOCK_TURN = 5;
const SOULS_START = 0;
/** Max equipment a hero can wear at once. Playing a 4th piece requires
 *  the player to choose one of the existing items to discard. */
export const MAX_EQUIPMENT_PER_HERO = 3;
// Refill economy (Hearthstone-style): at the start of each of your turns,
// your pool is REFILLED to N — anything banked from last turn is lost.
// The ramp climbs 1 → 7 by your 7th turn, then caps.
const SOULS_REFILL_TABLE = [1, 2, 3, 4, 5, 6, 7];
const SOULS_PER_KO = 1;
const SOULS_MAX = 7;         // hard cap — KO bounty + refill can't push you over.
const RETREAT_COST = 2;      // souls to swap an Active with a bench hero (Pokémon-flavored)

function soulRefillForTurn(globalTurn: number): number {
  // globalTurn 1 → my turn 1 (idx 0), globalTurn 3 → my turn 2 (idx 1), ...
  const idx = Math.floor((globalTurn - 1) / 2);
  return SOULS_REFILL_TABLE[Math.min(idx, SOULS_REFILL_TABLE.length - 1)];
}

function makeInstance(cardId: string, ownerId: PlayerID, zone: CardInstance['zone'], slot?: 0|1|2|3): CardInstance {
  const data = getCard(cardId);
  const hp = data.type === 'hero' ? data.hp : 0;
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
  };
}

function buildPlayer(pid: PlayerID, deck: DeckBlueprint): PlayerState {
  const heroes = deck.heroes;
  const active = makeInstance(heroes[0], pid, 'active', 0);
  const bench: (CardInstance | null)[] = [
    makeInstance(heroes[1], pid, 'bench', 1),
    makeInstance(heroes[2], pid, 'bench', 2),
    makeInstance(heroes[3], pid, 'bench', 3),
  ];

  const deckInstances = deck.cards.map((cid) => makeInstance(cid, pid, 'deck'));
  for (let i = deckInstances.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deckInstances[i], deckInstances[j]] = [deckInstances[j], deckInstances[i]];
  }

  return {
    id: pid,
    hp: 15,
    hpMax: 15,
    souls: SOULS_START,
    deck: deckInstances,
    hand: [],
    active,
    bench,
    discard: [],
    secret: [],
    ultsConsumed: [],
    skillUsedThisTurn: false,
    respawning: [],
  };
}

function reshuffleDiscardIfNeeded(G: GameState, ps: PlayerState) {
  if (ps.deck.length > 0) return;
  if (ps.discard.length === 0) return;
  // Move all discard back to deck (excluding equipment which stays with hero)
  const recyclable = ps.discard.filter((c) => CARDS_BY_ID[c.cardId]?.type !== 'equipment');
  ps.discard = ps.discard.filter((c) => CARDS_BY_ID[c.cardId]?.type === 'equipment');
  for (const c of recyclable) {
    c.zone = 'deck';
    c.statuses = [];
    c.atkMod = 0;
    c.spiritMod = 0;
    c.attached = [];
    if (CARDS_BY_ID[c.cardId]?.type === 'hero') {
      c.hp = c.hpMax;
    }
    ps.deck.push(c);
  }
  // Shuffle
  for (let i = ps.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ps.deck[i], ps.deck[j]] = [ps.deck[j], ps.deck[i]];
  }
  pushLog(G, `P${ps.id} reshuffled discard.`);
}

function drawN(G: GameState, ps: PlayerState, n: number) {
  for (let i = 0; i < n; i++) {
    if (ps.hand.length >= MAX_HAND) break;
    if (ps.deck.length === 0) reshuffleDiscardIfNeeded(G, ps);
    const c = ps.deck.shift();
    if (!c) {
      damagePlayer(G, ps.id, 1);
      pushLog(G, `P${ps.id} fatigue: 1 dmg (no cards).`);
      continue;
    }
    c.zone = 'hand';
    ps.hand.push(c);
  }
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

  for (const aid of abilityIds) {
    const a = getAbility(aid);
    if (a) a.run(G, { movingPlayer: pid }, { source, target });
  }
  if (data?.type === 'equipment' && target && data.bonus) {
    if (data.bonus.atk) target.atkMod += data.bonus.atk;
    if (data.bonus.hp) { target.hpMax += data.bonus.hp; target.hp += data.bonus.hp; }
    if (data.bonus.spirit) target.spiritMod += data.bonus.spirit;
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

function checkWinner(G: GameState): { winner?: PlayerID; draw?: boolean } | undefined {
  const p0 = G.players['0'].hp;
  const p1 = G.players['1'].hp;
  if (p0 <= 0 && p1 <= 0) return { draw: true };
  if (p0 <= 0) return { winner: '1' };
  if (p1 <= 0) return { winner: '0' };
  return undefined;
}

export const DeadlockGame: Game<GameState> = {
  name: 'deadlock-tcg',
  setup: (): GameState => {
    resetIid();
    const players = {
      '0': buildPlayer('0', STARTER_DECK_PLAYER),
      '1': buildPlayer('1', STARTER_DECK_AI),
    };
    const G: GameState = {
      players,
      turnNumber: 1,
      selector: null,
      resolveQueue: [],
      log: [{ turn: 1, text: 'Match begins.' }],
      mulliganPending: true,
    };
    drawN(G, players['0'], 3);
    drawN(G, players['1'], 3);
    return G;
  },

  turn: {
    onBegin: ({ G, ctx }) => {
      const pid = ctx.currentPlayer as PlayerID;
      const ps = G.players[pid];
      G.turnNumber = ctx.turn;
      ps.skillUsedThisTurn = false;
      tickStartOfTurn(G, ps);
      // Refill (not add) — no hoarding across turns. KO bounty banked this turn IS preserved
      // until the NEXT refill, so a kill mid-turn still gives you something to spend right away.
      ps.souls = soulRefillForTurn(ctx.turn);
      const drawCount = ctx.turn === 1 && pid === '0' ? 1 : 2;
      drawN(G, ps, drawCount);
      // Ultimate unlock
      unlockUltimates(G, ps);
      // Respawn queue ticks down for BOTH players at the start of every turn.
      tickRespawn(G, '0');
      tickRespawn(G, '1');
      fireBoardTriggers(G, pid, 'startOfTurn');
      reapDead(G, G.players['0']);
      reapDead(G, G.players['1']);
      pushLog(G, `--- Turn ${ctx.turn}, player ${pid} ---`);
    },
    onEnd: ({ G, ctx }) => {
      const pid = ctx.currentPlayer as PlayerID;
      fireBoardTriggers(G, pid, 'endOfTurn');
      resolveAttackPhase(G, pid);
      clearTurnFlags(G.players[pid]);
    },
  },

  moves: {
    playCard: ({ G, ctx, playerID }, iid: string, targetIid?: string, discardIid?: string) => {
      const pid = (playerID ?? ctx.currentPlayer) as PlayerID;
      const ps = G.players[pid];
      const idx = ps.hand.findIndex((c) => c.iid === iid);
      if (idx < 0) return INVALID_MOVE;
      const card = ps.hand[idx];
      const data = CARDS_BY_ID[card.cardId];
      if (!data) return INVALID_MOVE;

      const cost = (data.type === 'spell' || data.type === 'equipment' || data.type === 'ultimate')
        ? (data.cost ?? 0) : 0;
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

      applyOnPlay(G, pid, card, target);

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
      // Bypass: a bearer of Improved Cooldown ignores the player-wide gate.
      const hasImprovedCooldown = hero.attached?.some((eq) => eq.cardId === 'improved_cooldown') ?? false;
      if (ps.skillUsedThisTurn && !hasImprovedCooldown) return INVALID_MOVE;
      // Stun / Silenced / Sleep all suppress skill use.
      if (hero.statuses.some((s) => s.id === 'silenced' || s.id === 'stun' || s.id === 'sleep')) return INVALID_MOVE;

      const data = CARDS_BY_ID[hero.cardId];
      if (data?.type !== 'hero' || !data.skill) return INVALID_MOVE;

      const ability = getAbility(data.skill);
      if (!ability) return INVALID_MOVE;

      let target: CardInstance | undefined;
      if (targetIid) {
        const f = findCardOnBoard(G, targetIid);
        if (f) target = f.card;
      }

      // Headline log BEFORE the ability runs — the ability itself will emit
      // damage/status lines under this header, and the player sees who cast what.
      const heroName = data.name;
      const targetName = target ? (CARDS_BY_ID[target.cardId]?.name ?? target.cardId) : null;
      pushLog(G, `${heroName} casts skill${targetName ? ` on ${targetName}` : ''}.`);

      ability.run(G, { movingPlayer: pid }, { source: hero, target });
      hero.skillUsedThisTurn = true;     // per-hero flag (drives UI glint)
      ps.skillUsedThisTurn = true;       // per-player flag (gates the rule)
      reapDead(G, G.players['0']);
      reapDead(G, G.players['1']);
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
      // Trap: a hero with the Trap status cannot be swapped (in or out).
      if (a.statuses.some((s) => s.id === 'sleep')) return INVALID_MOVE;
      if (b && b.statuses.some((s) => s.id === 'sleep')) return INVALID_MOVE;
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
     * swap. The dying corpse takes the chosen bench hero's slot — that's where
     * it stays greyed-out until its respawn timer hits 0.
     *
     * Callable on either player's turn (your active can die during the
     * opponent's combat phase, and you still need to pick a replacement).
     */
    promoteToActive: ({ G, playerID }, benchHeroIid: string) => {
      if (!playerID) return INVALID_MOVE;
      const pid = playerID as PlayerID;
      const ps = G.players[pid];
      // Only valid when our Active is a corpse — otherwise use retreat (which costs souls).
      if (!ps.active || (ps.active.respawnTurnsLeft ?? 0) === 0) return INVALID_MOVE;
      const benchIdx = ps.bench.findIndex((b) => b?.iid === benchHeroIid);
      if (benchIdx === -1) return INVALID_MOVE;
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

    mulligan: ({ G }, swapIids: string[] = []) => {
      if (!G.mulliganPending) return INVALID_MOVE;
      const ps = G.players['0'];
      // Pull selected cards out of the hand
      const keep: CardInstance[] = [];
      const swap: CardInstance[] = [];
      for (const c of ps.hand) {
        if (swapIids.includes(c.iid)) swap.push(c);
        else keep.push(c);
      }
      ps.hand = keep;
      // Put them back in the deck
      for (const c of swap) {
        c.zone = 'deck';
        ps.deck.push(c);
      }
      // Shuffle
      for (let i = ps.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ps.deck[i], ps.deck[j]] = [ps.deck[j], ps.deck[i]];
      }
      // Replenish
      drawN(G, ps, swap.length);
      // AI mulligan: cheap rule — swap cards it can never use (heroes, ults), keep the rest.
      const ai = G.players['1'];
      const aiSwap: CardInstance[] = [];
      const aiKeep: CardInstance[] = [];
      for (const c of ai.hand) {
        const data = CARDS_BY_ID[c.cardId];
        if (data?.type === 'hero' || data?.type === 'ultimate') aiSwap.push(c);
        else aiKeep.push(c);
      }
      ai.hand = aiKeep;
      for (const c of aiSwap) { c.zone = 'deck'; ai.deck.push(c); }
      for (let i = ai.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ai.deck[i], ai.deck[j]] = [ai.deck[j], ai.deck[i]];
      }
      drawN(G, ai, aiSwap.length);
      G.mulliganPending = false;
      pushLog(G, `Mulligan complete (you swapped ${swap.length}).`);
    },
  },

  endIf: ({ G }) => checkWinner(G),
};
