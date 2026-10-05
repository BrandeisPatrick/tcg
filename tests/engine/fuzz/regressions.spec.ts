/**
 * One focused, hand-built reproduction per real violation the fuzz harness
 * found. A plain `it` asserts behaviour that is correct today (the bug is
 * fixed). An `it.fails` asserts the CORRECT behaviour of a bug still open, so
 * it passes today (the assertion fails) and starts failing the day the bug is
 * fixed — at which point drop the `.fails`. A plain `it` next to an `it.fails`
 * pins a precondition that is true today and must stay true, so a `.fails` can
 * never pass for the wrong reason (a bad setup).
 *
 * Ids (E = engine bug, M = mirror bug: the UI / AI copy disagrees with the
 * engine) match the table in the harness report.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { resolve } from '@/engine/death';
import { addStatus, grantExtraAttacks, tickRemMerges } from '@/engine/statusOps';
import { blocked, legalActions, skillBlocked } from '@/engine/legality';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { configureReadyMatch, freshReadyGame, makeHero, nextTestIid } from '../_helpers';
import { forecastMismatches } from './forecast';
import { everyCard } from './oracle';

beforeAll(configureReadyMatch);

const ctxFor = (pid: PlayerID) => ({ currentPlayer: pid, numPlayers: 2, turn: 1 }) as unknown as Ctx;

/** Call a move straight on G (mutating it), like turn-actions.spec's runMove. */
function runMove(name: string, G: GameState, pid: PlayerID, ...args: unknown[]) {
  const fn = (DeadlockGame.moves as Record<string, any>)[name];
  return fn({ G, ctx: ctxFor(pid), playerID: pid, events: { endTurn() {} }, random: {} }, ...args);
}

function card(cardId: string, owner: PlayerID, zone: CardInstance['zone'] = 'hand'): CardInstance {
  return {
    iid: nextTestIid(), cardId, ownerId: owner, zone, attached: [], hp: 0, hpMax: 0,
    atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
  };
}
function toHand(G: GameState, pid: PlayerID, cardId: string): CardInstance {
  const c = card(cardId, pid);
  G.players[pid].hand.push(c);
  return c;
}
function wear(hero: CardInstance, cardId: string): CardInstance {
  const e = card(cardId, hero.ownerId, 'equipment');
  e.attachedTo = hero.iid;
  (hero.attached ??= []).push(e);
  return e;
}
const anywhere = (G: GameState, iid: string) => everyCard(G).find((x) => x.card.iid === iid)?.card;

/** P0 (Haze active; Vindicta / Lash / Paige on the bench), turn 2, with souls to spend. */
function game(): GameState {
  const G = freshReadyGame();
  G.players['0'].souls = 10;
  G.players['1'].souls = 10;
  return G;
}
/** A merged Rem: she sits on P0's bench slot `slot` (1..3), then casts her skill on `bearer`. */
function mergeRem(G: GameState, slot: 1 | 2 | 3, bearer: CardInstance): CardInstance {
  const rem = makeHero('hero_rem', '0', 'bench', slot);
  G.players['0'].bench[slot - 1] = rem;
  expect(runMove('useSkill', G, '0', rem.iid, bearer.iid)).not.toBe(INVALID_MOVE);
  expect(bearer.attached).toContain(rem);
  return rem;
}

// ===========================================================================
// E1  addStatus put statuses on a corpse  (fixed: a corpse takes no status, at the source)
//     Reached through a swing's onAttack passives running after the target was already reaped
//     by Ricochet's own resolve(), and through an ultimate's onBearerUltCast gear on a linked
//     hero who is a corpse.
// ===========================================================================
describe('E1 a corpse carries no statuses', () => {
  it('precondition: Ricochet reaps the target mid-attack and the hero is a corpse afterwards', () => {
    const G = game();
    const shiv = makeHero('hero_shiv', '0', 'active', 0);
    wear(shiv, 'ricochet');
    G.players['0'].active = shiv;
    const foe = G.players['1'].active!;
    foe.hp = 1;
    expect(runMove('attack', G, '0')).not.toBe(INVALID_MOVE);
    expect(foe.respawnTurnsLeft).toBeGreaterThan(0);
  });

  it('E1a Shiv\'s Bleed does not land on the Active he just knocked out (fuzz: heuristic-vs-heuristic seed 145 step 64 is the Weapon Shielding variant)', () => {
    const G = game();
    const shiv = makeHero('hero_shiv', '0', 'active', 0);
    wear(shiv, 'ricochet');
    G.players['0'].active = shiv;
    const foe = G.players['1'].active!;
    foe.hp = 1;
    runMove('attack', G, '0');
    expect(foe.statuses).toEqual([]);
  });

  it('E1b Diviner\'s Kevlar does not shield the corpse of the hero whose ultimate is cast', () => {
    const G = game();
    const lash = G.players['0'].bench[1]!;
    expect(lash.cardId).toBe('hero_lash');
    lash.hp = 0;
    lash.respawnTurnsLeft = 3;
    wear(lash, 'diviners_kevlar');
    const ult = toHand(G, '0', 'ult_lash');
    runMove('playCard', G, '0', ult.iid);
    expect(lash.statuses).toEqual([]);
  });

  it('E1c Siphon Bullets neither robs nor feeds a corpse (Ricochet reaped the target first)', () => {
    const G = game();
    const shiv = makeHero('hero_shiv', '0', 'active', 0);
    wear(shiv, 'ricochet');
    wear(shiv, 'siphon_bullets');
    G.players['0'].active = shiv;
    const foe = G.players['1'].active!;
    foe.hp = 1;
    const hpMax = foe.hpMax;
    runMove('attack', G, '0');
    expect(foe.respawnTurnsLeft).toBeGreaterThan(0);
    expect(foe.statuses).toEqual([]);
    expect(foe.hpMax).toBe(hpMax); // it respawns at its true max HP
  });

  it('E1d addStatus and grantExtraAttacks on a corpse do nothing — no status, no log line, no event', () => {
    const G = game();
    const corpse = G.players['1'].bench[0]!;
    corpse.hp = 0;
    corpse.respawnTurnsLeft = 2;
    const log = G.log.length;
    const fx = G.fx.length;
    for (const id of ['stun', 'bleed', 'shield', 'unstoppable', 'weapon_power']) addStatus(G, corpse, id, 1, 2);
    grantExtraAttacks(corpse, 2);
    expect(corpse.statuses).toEqual([]);
    expect([G.log.length, G.fx.length]).toEqual([log, fx]);
    // and a living hero still takes them
    addStatus(G, G.players['1'].bench[1]!, 'shield', 2, 9);
    expect(G.players['1'].bench[1]!.statuses.map((s) => s.id)).toEqual(['shield']);
  });
});

// ===========================================================================
// E2  Lady Geist's Soul Exchange swaps raw HP
//     abilities/index.ts:904-911 eff_ult_lady_geist: `ally.hp = enemy.hp`, no clamp to
//     hpMax and no corpse check.
// ===========================================================================
describe('E2 Soul Exchange keeps HP inside 0..hpMax and leaves corpses alone', () => {
  const geistGame = () => {
    const G = game();
    const geist = makeHero('hero_lady_geist', '0', 'active', 0);
    G.players['0'].active = geist;
    return { G, geist, foe: G.players['1'].active! };
  };

  it('precondition: Lady Geist is smaller than the enemy Active', () => {
    const { geist, foe } = geistGame();
    foe.hpMax = foe.hp = 12;
    expect(geist.hpMax).toBeLessThan(12);
  });

  it.fails('E2a the swap never leaves a hero above its max HP', () => {
    const { G, geist, foe } = geistGame();
    geist.hp = 1;
    foe.hpMax = foe.hp = 12;
    runMove('playCard', G, '0', toHand(G, '0', 'ult_lady_geist').iid);
    expect(geist.hp).toBeLessThanOrEqual(geist.hpMax); // currently 12 / 4
  });

  it.fails('E2b a corpse Active cannot be swapped with (no hp on a corpse, no free KO of the caster)', () => {
    const { G, geist, foe } = geistGame();
    geist.hp = 5;
    foe.hp = 0;
    foe.respawnTurnsLeft = 3;
    runMove('playCard', G, '0', toHand(G, '0', 'ult_lady_geist').iid);
    expect(foe.hp).toBe(0);     // currently 5: a corpse with HP
    expect(geist.hp).toBe(5);   // currently 0: the caster is knocked out by its own ultimate
  });
});

// ===========================================================================
// E3  A merged Rem is counted — and can be discarded — as equipment
//     game.ts:471-484 playCard counts `target.attached.length` (Rem included) against
//     MAX_EQUIPMENT_PER_HERO and lets `discardIid` name her. heuristic.ts:305 and
//     Board.tsx:535 count the same way, and the replace overlay lists her.
// ===========================================================================
describe('E3 a merged Rem is not an equipment slot', () => {
  const remGame = (equipCount: number) => {
    const G = game();
    const bearer = G.players['0'].active!;
    ['extra_health', 'extended_magazine', 'restorative_shot'].slice(0, equipCount).forEach((id) => wear(bearer, id));
    const rem = mergeRem(G, 2, bearer);
    return { G, bearer, rem };
  };

  it('precondition: with 3 pieces of gear and no Rem a 4th without a discard is refused', () => {
    const G = game();
    const bearer = G.players['0'].active!;
    ['extra_health', 'extended_magazine', 'restorative_shot'].forEach((id) => wear(bearer, id));
    expect(runMove('playCard', G, '0', toHand(G, '0', 'extra_spirit').iid, bearer.iid)).toBe(INVALID_MOVE);
  });

  it.fails('E3a two items + Rem: a third item needs no discard (the cap counts equipment only)', () => {
    const { G, bearer } = remGame(2);
    const r = runMove('playCard', G, '0', toHand(G, '0', 'extra_spirit').iid, bearer.iid);
    expect(r).not.toBe(INVALID_MOVE); // currently INVALID_MOVE: attached.length is 3
  });

  it.fails('E3b Rem cannot be named as the item to discard', () => {
    const { G, bearer, rem } = remGame(3);
    const r = runMove('playCard', G, '0', toHand(G, '0', 'extra_spirit').iid, bearer.iid, rem.iid);
    expect(r).toBe(INVALID_MOVE); // currently accepted: Rem goes to the discard pile
    expect(G.players['0'].discard.some((c) => c.cardId === 'hero_rem')).toBe(false);
  });

  it.fails('E3c a discard never ends with more than 3 pieces of gear', () => {
    const { G, bearer, rem } = remGame(3);
    runMove('playCard', G, '0', toHand(G, '0', 'extra_spirit').iid, bearer.iid, rem.iid);
    const gear = (bearer.attached ?? []).filter((a) => a.cardId !== 'hero_rem');
    expect(gear.length).toBeLessThanOrEqual(3); // currently 4
  });

  it.fails('M3d the AI never offers to discard the merged Rem', () => {
    const { G, bearer, rem } = remGame(2);
    toHand(G, '0', 'extra_spirit');
    const offers = enumerateAIMoves(G, ctxFor('0'), false)
      .filter((m) => m.move === 'playCard' && m.args[1] === bearer.iid && m.args[2] === rem.iid);
    expect(offers).toEqual([]); // currently offered: heuristic.ts:305-324 scores her lowest
  });
});

// ===========================================================================
// E4  returnRemToBench  (fixed: she lands in a real slot with `slot` right, and is never dropped)
//     The free-slot fallback never updated `rem.slot`, and when no slot was free she was
//     detached and put nowhere. The hole she leaves can no longer be filled (E5c), so her own
//     slot is always free; these tests build the impossible states by hand.
// ===========================================================================
describe('E4 Rem returns to a real bench slot', () => {
  it('precondition: with her own slot free she returns there', () => {
    const G = game();
    const rem = mergeRem(G, 2, G.players['0'].active!);
    rem.remMergeTurnsLeft = 1;
    tickRemMerges(G, G.players['0']);
    expect(G.players['0'].bench[1]).toBe(rem);
    expect(rem.slot).toBe(2);
  });

  it('E4a her slot field matches where she lands when another hero took her old slot', () => {
    const G = game();
    const me = G.players['0'];
    const rem = mergeRem(G, 2, me.active!);
    // Paige into the hole by hand (no move can do it any more).
    const paige = me.bench[2]!;
    me.bench[1] = paige; paige.slot = 2;
    me.bench[2] = null;
    rem.remMergeTurnsLeft = 1;
    tickRemMerges(G, me);
    const idx = me.bench.indexOf(rem);
    expect(idx).toBe(2); // the first free slot
    expect(rem.slot).toBe(idx + 1);
    expect(rem.zone).toBe('bench');
    expect(me.bench[1]).toBe(paige);
  });

  it('E4b she is never dropped when the bench has no free slot: she stays merged and the log says so', () => {
    const G = game();
    const me = G.players['0'];
    const bearer = me.active!;
    const rem = mergeRem(G, 3, bearer);
    me.bench[2] = makeHero('hero_shiv', '0', 'bench', 3); // the hole filled by hand
    rem.remMergeTurnsLeft = 1;
    tickRemMerges(G, me);
    expect(anywhere(G, rem.iid)).toBeDefined();
    expect(bearer.attached).toContain(rem);
    expect(rem.remMergeTurnsLeft).toBe(1); // she tries again next turn
    expect(G.log.some((l) => l.text.includes('Rem has no free bench slot'))).toBe(true);
    me.bench[2] = null; // once there is room she returns
    rem.remMergeTurnsLeft = 1;
    tickRemMerges(G, me);
    expect(me.bench[2]).toBe(rem);
    expect(rem.slot).toBe(3);
  });
});

// ===========================================================================
// E5  moveHero validated neither its arguments nor an empty / bench-only side
//     (fixed: moveBlocked refuses junk slots, a hole on either side, and Rem in slot 0)
// ===========================================================================
describe('E5 moveHero', () => {
  it('precondition: a plain retreat swaps Active and bench hero and charges 2 souls', () => {
    const G = game();
    const me = G.players['0'];
    const active = me.active!;
    const vind = me.bench[0]!;
    expect(runMove('moveHero', G, '0', 1, 0)).not.toBe(INVALID_MOVE);
    expect(me.active).toBe(vind);
    expect(me.bench[0]).toBe(active);
    expect(me.souls).toBe(8);
  });

  it('E5a slots outside 0..3 are refused and leave the bench at length 3', () => {
    const G = game();
    const r = runMove('moveHero', G, '0', 1, 7);
    expect(r).toBe(INVALID_MOVE);
    expect(G.players['0'].bench.length).toBe(3);
  });

  it('E5b a missing slot is refused instead of writing bench["NaN"]', () => {
    const G = game();
    expect(runMove('moveHero', G, '0', 1, undefined)).toBe(INVALID_MOVE);
  });

  it('E5c the Active cannot be swapped into an empty bench slot (it would leave no Active, and a free retreat)', () => {
    const G = game();
    const me = G.players['0'];
    me.bench[1] = null; // the hole a merged Rem leaves
    const souls = me.souls;
    const r = runMove('moveHero', G, '0', 0, 2);
    expect(r).toBe(INVALID_MOVE);
    expect(me.active).not.toBeNull();
    expect(me.souls).toBe(souls);
  });

  it('E5c2 a bench hero cannot trade into an empty bench slot either', () => {
    const G = game();
    const me = G.players['0'];
    me.bench[1] = null;
    expect(runMove('moveHero', G, '0', 3, 2)).toBe(INVALID_MOVE);
    expect(runMove('moveHero', G, '0', 2, 3)).toBe(INVALID_MOVE);
    expect(me.bench[2]).not.toBeNull();
  });

  it('E5d Rem cannot take the Active slot from either side of the swap', () => {
    for (const [from, to] of [[0, 2], [2, 0]] as const) {
      const G = game();
      const me = G.players['0'];
      const active = me.active!;
      me.bench[1] = makeHero('hero_rem', '0', 'bench', 2);
      const r = runMove('moveHero', G, '0', from, to);
      expect(r, `moveHero(${from}, ${to})`).toBe(INVALID_MOVE);
      expect(me.active).toBe(active);
      expect(me.souls).toBe(10);
    }
  });

  it('E5f two occupied bench slots trade places for free, Rem included', () => {
    const G = game();
    const me = G.players['0'];
    const rem = me.bench[1] = makeHero('hero_rem', '0', 'bench', 2);
    const paige = me.bench[2]!;
    expect(runMove('moveHero', G, '0', 2, 3)).not.toBe(INVALID_MOVE);
    expect(me.bench[2]).toBe(rem);
    expect(me.bench[1]).toBe(paige);
    expect([rem.slot, paige.slot]).toEqual([3, 2]);
    expect(me.souls).toBe(10);
  });

  it('E5e through a real client a missing slot is a rejected move, not an exception', () => {
    const client = Client({ game: DeadlockGame, numPlayers: 2 });
    client.start();
    expect(() => (client.moves as any).moveHero(1, undefined)).not.toThrow();
  });
});

// ===========================================================================
// E6  useSkill / playCard never checked the ability's TargetFilter
//     (fixed: legality.ts skillBlocked / playBlocked validate against targetsFor;
//     E6i, Rem aimed at herself, is open)
// ===========================================================================
describe('E6 targets are validated against the ability\'s TargetFilter', () => {
  it('precondition: the AI aims Cold Front at the enemy Active and the engine takes it', () => {
    const G = game();
    const c = toHand(G, '0', 'cold_front');
    expect(runMove('playCard', G, '0', c.iid, G.players['1'].active!.iid)).not.toBe(INVALID_MOVE);
  });

  it('E6a a "self" skill (Viscous) cannot be aimed at an enemy', () => {
    const G = game();
    const viscous = makeHero('hero_viscous', '0', 'active', 0);
    G.players['0'].active = viscous;
    const foe = G.players['1'].active!;
    const r = runMove('useSkill', G, '0', viscous.iid, foe.iid);
    expect(r).toBe(INVALID_MOVE);
    expect(foe.statuses.some((s) => s.id === 'unstoppable')).toBe(false);
  });

  it('E6b an enemy-Active spell cannot be played on your own hero', () => {
    const G = game();
    const c = toHand(G, '0', 'cold_front');
    const own = G.players['0'].bench[0]!;
    expect(runMove('playCard', G, '0', c.iid, own.iid)).toBe(INVALID_MOVE);
  });

  it('E6c an enemy-Active spell cannot be played on an enemy bench hero', () => {
    const G = game();
    const c = toHand(G, '0', 'cold_front');
    expect(runMove('playCard', G, '0', c.iid, G.players['1'].bench[0]!.iid)).toBe(INVALID_MOVE);
  });

  it('E6d a targeted spell needs a target (no souls and no card for nothing)', () => {
    const G = game();
    const c = toHand(G, '0', 'cold_front');
    const souls = G.players['0'].souls;
    expect(runMove('playCard', G, '0', c.iid)).toBe(INVALID_MOVE);
    expect(G.players['0'].souls).toBe(souls);
  });

  it('E6e an unknown iid is not a target', () => {
    const G = game();
    const c = toHand(G, '0', 'cold_front');
    expect(runMove('playCard', G, '0', c.iid, 'no-such-iid')).toBe(INVALID_MOVE);
  });

  it('E6f a skill cannot target a corpse (and a corpse takes no status)', () => {
    const G = game();
    const lash = G.players['0'].bench[1]!; // Lash: enemyAny
    const corpse = G.players['1'].bench[0]!;
    corpse.hp = 0;
    corpse.respawnTurnsLeft = 3;
    const r = runMove('useSkill', G, '0', lash.iid, corpse.iid);
    expect(r).toBe(INVALID_MOVE);
    expect(corpse.statuses).toEqual([]);
  });

  it('E6g Yamato\'s self-cast ultimate cannot be given an enemy target', () => {
    const G = game();
    const yamato = makeHero('hero_yamato', '0', 'active', 0);
    G.players['0'].active = yamato;
    const foe = G.players['1'].active!;
    const ult = toHand(G, '0', 'ult_yamato');
    expect(runMove('playCard', G, '0', ult.iid, foe.iid)).toBe(INVALID_MOVE);
    expect(foe.statuses.some((s) => s.id === 'unstoppable')).toBe(false);
  });

  it('E6h Rem cannot merge into an enemy hero (she would sit in its attached list, owned by the other player)', () => {
    const G = game();
    const rem = makeHero('hero_rem', '0', 'bench', 1);
    G.players['0'].bench[0] = rem;
    const foe = G.players['1'].active!;
    const r = runMove('useSkill', G, '0', rem.iid, foe.iid);
    expect(r).toBe(INVALID_MOVE);
    expect(foe.attached ?? []).not.toContain(rem);
  });

  it.fails('E6i Rem aimed at herself is refused instead of burning a soul and the skill for nothing', () => {
    const G = game();
    const rem = makeHero('hero_rem', '0', 'bench', 1);
    G.players['0'].bench[0] = rem;
    const souls = G.players['0'].souls;
    const r = runMove('useSkill', G, '0', rem.iid, rem.iid);
    expect(r).toBe(INVALID_MOVE);
    expect(G.players['0'].souls).toBe(souls);
    expect(rem.skillUsedThisTurn).toBe(false);
  });
});

// ===========================================================================
// E7  Missing ids throw instead of being rejected
//     findCardOnBoard: `b?.iid === undefined` matches an EMPTY bench slot (the hole a
//     merged Rem leaves), so `useSkill()` got `found.card === null`. (E7a, E7b: fixed — an empty
//     slot is nobody, and every id that names no card is INVALID)
// ===========================================================================
describe('E7 a missing iid is a rejected move, not a TypeError', () => {
  it('E7a useSkill with no hero iid while the bench has a hole', () => {
    const G = game();
    G.players['0'].bench[0] = null;
    expect(runMove('useSkill', G, '0', undefined)).toBe(INVALID_MOVE);
  });

  it('E7b promoteToActive with no iid while the bench has a hole', () => {
    const G = game();
    G.players['0'].bench[0] = null;
    G.players['0'].active!.hp = 0;
    G.players['0'].active!.respawnTurnsLeft = 3;
    expect(runMove('promoteToActive', G, '0', undefined)).toBe(INVALID_MOVE);
  });
});

describe('E7 junk arguments of every kind are INVALID, never a throw', () => {
  const junk: unknown[] = [undefined, null, 7, '', 'no-such-iid', {}, [], NaN];
  const withHole = () => {
    const G = game();
    G.players['0'].bench[0] = null; // the hole a merged Rem leaves
    return G;
  };

  it.each(['useSkill', 'playCard', 'promoteToActive'])('%s with junk ids', (move) => {
    for (const a of junk) for (const b of junk) {
      const G = withHole();
      const before = JSON.stringify(G);
      expect(runMove(move, G, '0', a, b, a), `${move}(${String(a)}, ${String(b)})`).toBe(INVALID_MOVE);
      expect(JSON.stringify(G)).toBe(before);
    }
  });

  it('moveHero with a junk slot on either side', () => {
    const slots: unknown[] = [...junk, 4, -1, 1.5, '2'];
    for (const bad of slots) for (const ok of [0, 1, 2, 3, ...slots]) {
      for (const [a, b] of [[bad, ok], [ok, bad]]) {
        const G = withHole();
        const before = JSON.stringify(G);
        expect(runMove('moveHero', G, '0', a, b), `moveHero(${String(a)}, ${String(b)})`).toBe(INVALID_MOVE);
        expect(JSON.stringify(G)).toBe(before);
      }
    }
  });
});

// ===========================================================================
// E8  Replaced equipment keeps its bonuses  (INTENT UNCONFIRMED)
//     game.ts:226-230 applyOnPlay adds `bonus` to atkMod / hpMax / spiritMod and
//     statuses (Bullet Resist…) with duration 999; nothing removes them when the item
//     is discarded to make room. If "discard" is meant to keep the stats, delete this.
// ===========================================================================
describe('E8 discarding equipment takes its bonus away (intent unconfirmed)', () => {
  it.fails('E8a the +2 HP of Extra Health leaves with it', () => {
    const G = game();
    const hero = G.players['0'].active!;
    const base = hero.hpMax;
    const hp = wearByPlay(G, hero, 'extra_health');
    expect(hero.hpMax).toBe(base + 2);
    wearByPlay(G, hero, 'extended_magazine');
    wearByPlay(G, hero, 'extra_spirit');
    runMove('playCard', G, '0', toHand(G, '0', 'titanic_magazine').iid, hero.iid, hp.iid);
    expect(hero.attached!.some((a) => a.iid === hp.iid)).toBe(false);
    expect(hero.hpMax).toBe(base); // currently still base + 2
  });
});
function wearByPlay(G: GameState, hero: CardInstance, cardId: string): CardInstance {
  const c = toHand(G, '0', cardId);
  expect(runMove('playCard', G, '0', c.iid, hero.iid)).not.toBe(INVALID_MOVE);
  return c;
}

// ===========================================================================
// M1  skillBlocked ignored target availability  (fixed: legality.skillBlocked asks targetsFor)
//     Kelvin (enemyActive) with the rival Active a corpse and no hero able to step
//     in has no target: the board lit the skill and no click could complete it.
// ===========================================================================
describe('M1 skillBlocked agrees there is something to aim at', () => {
  it('M1 Kelvin is not offered while the rival Active is a corpse with nobody to step in', () => {
    const G = game();
    const kelvin = makeHero('hero_kelvin', '0', 'active', 0);
    G.players['0'].active = kelvin;
    const foe = G.players['1'];
    foe.bench = [makeHero('hero_rem', '1', 'bench', 1), null, null]; // Rem cannot step up
    foe.active!.hp = 0;
    foe.active!.respawnTurnsLeft = 3;
    resolve(G);
    expect(foe.active!.respawnTurnsLeft).toBeGreaterThan(0);
    expect(skillBlocked(G, '0', kelvin)).not.toBeNull();
  });
});

// ===========================================================================
// M2  the attack forecast vs the attack move  (fixed: forecastAttack IS the attack, run on a copy)
//     The old planner mirrored the swings only; it could not run onAttack passives / reactive
//     gear, so these effects were missing from damageToActive / defenderActiveKO /
//     patronDamage / predictedHpAfter.
// ===========================================================================
describe('M2 the attack forecast matches what the attack does', () => {
  /** P0's Active vs P1's Active, with P1's Active made sturdy so nothing dies by accident. */
  const duel = (attackerId: string, foeHp = 40) => {
    const G = game();
    const atk = makeHero(attackerId, '0', 'active', 0);
    G.players['0'].active = atk;
    const foe = G.players['1'].active!;
    foe.hpMax = foe.hp = foeHp;
    return { G, atk, foe };
  };

  it('precondition: a plain attack is forecast exactly', () => {
    const { G } = duel('hero_haze');
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
  });

  it('M2a Wraith\'s Mixed Bullets spirit rider (passive_wraith_mixed) is in the plan', () => {
    const { G, atk } = duel('hero_wraith');
    atk.spiritMod = 3;
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
  });

  it('M2b a sleeping target\'s wake-up burst (damage.ts:152-158) is in the plan', () => {
    const { G, foe } = duel('hero_haze', 12);
    foe.statuses.push({ id: 'sleep', value: 6, duration: 2 });
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
  });

  it('M2c Djinn\'s Mark detonating on the 4th stack (passive_mirage_djinns_mark) is in the plan', () => {
    const { G, foe } = duel('hero_mirage', 40);
    foe.statuses.push({ id: 'djinns_mark', value: 3, duration: 3 });
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
  });

  it('M2d Ricochet knocking out a bench hero costs the patron a life (plan.patronDamage)', () => {
    const { G, atk, foe } = duel('hero_haze');
    wear(atk, 'ricochet');
    G.players['1'].bench[0]!.hp = 1;
    expect(foe.hp).toBe(40);
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
  });

  it('M2e the target\'s Weapon Shielding (Shield 2 after each bullet) is in the plan of a two-swing attack', () => {
    const { G, atk, foe } = duel('hero_haze', 5);
    wear(foe, 'weapon_shielding');
    // Haze swings twice (Fixation). hp 5: swing 1 -> 2 (+Shield 2), swing 2 is soaked down to 1 — no KO.
    expect(atk.cardId).toBe('hero_haze');
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
  });

  it('M2f Bullet Resist Shredder (+1 damage on the next swing) is in the plan of a two-swing attack', () => {
    const { G, atk } = duel('hero_haze', 40);
    wear(atk, 'bullet_resist_shredder');
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
  });
});

// ===========================================================================
// M3  The AI's own copy of the rules
// ===========================================================================
describe('M3 the AI sees every legal play', () => {
  it('precondition: the engine plays a free copied ultimate at 0 souls', () => {
    const G = game();
    G.players['0'].souls = 0;
    const copy = toHand(G, '0', 'ult_haze');
    copy.costOverride = 0; // what eff_ult_sinclair stamps on its copy
    expect(runMove('playCard', G, '0', copy.iid)).not.toBe(INVALID_MOVE);
  });

  it.fails('M3a Sinclair\'s free copy (costOverride 0) is offered at 0 souls (heuristic.ts cardCost ignores costOverride)', () => {
    const G = game();
    G.players['0'].souls = 0;
    const copy = toHand(G, '0', 'ult_haze');
    copy.costOverride = 0;
    const offered = enumerateAIMoves(G, ctxFor('0'), false).some((m) => m.move === 'playCard' && m.args[0] === copy.iid);
    expect(offered).toBe(true);
  });

  it('precondition: the engine plays Yamato\'s self-cast ultimate with no target', () => {
    const G = game();
    G.players['0'].active = makeHero('hero_yamato', '0', 'active', 0);
    const ult = toHand(G, '0', 'ult_yamato');
    expect(runMove('playCard', G, '0', ult.iid)).not.toBe(INVALID_MOVE);
  });

  it.fails('M3b Yamato\'s self-cast ultimate is offered (heuristic.ts isValidTarget(self) with no source is never true)', () => {
    const G = game();
    G.players['0'].active = makeHero('hero_yamato', '0', 'active', 0);
    const ult = toHand(G, '0', 'ult_yamato');
    const offered = enumerateAIMoves(G, ctxFor('0'), false).some((m) => m.move === 'playCard' && m.args[0] === ult.iid);
    expect(offered).toBe(true);
  });

  it.fails('M3c Rem\'s skill is not offered on Rem herself (a no-op that costs a soul)', () => {
    const G = game();
    const rem = makeHero('hero_rem', '0', 'bench', 1);
    G.players['0'].bench = [rem, null, null]; // a short list: the AI keeps only its top 12 moves
    G.players['0'].hand = [];
    const selfCast = enumerateAIMoves(G, ctxFor('0'), false).some((m) => m.move === 'useSkill' && m.args[0] === rem.iid && m.args[1] === rem.iid);
    expect(selfCast).toBe(false);
  });
});

// ===========================================================================
// M4  An owed promotion was only enforced by the AI / UI  (fixed: blocked() enforces it)
//     The AI returned the promotion alone ("the only legal move") and the board refused to
//     end the turn, but the engine took any move, endTurn included, while G.pendingPromotion
//     was set.
// ===========================================================================
describe('M4 a promotion owed is the only legal move', () => {
  const owed = () => {
    const G = game();
    G.players['0'].active!.hp = 0;
    resolve(G);
    expect(G.pendingPromotion).toBe('0');
    return G;
  };

  it('precondition: the AI offers nothing but the promotion', () => {
    const G = owed();
    expect(new Set(enumerateAIMoves(G, ctxFor('0'), false).map((m) => m.move))).toEqual(new Set(['promoteToActive']));
  });

  it('M4a endTurn is refused while the seat owes a promotion', () => {
    expect(runMove('endTurn', owed(), '0')).toBe(INVALID_MOVE);
  });

  it('M4b a spell is refused while the seat owes a promotion', () => {
    const G = owed();
    const heal = toHand(G, '0', 'healing_rite');
    expect(runMove('playCard', G, '0', heal.iid, G.players['0'].bench[1]!.iid)).toBe(INVALID_MOVE);
  });

  it('M4c the only legal action is a promotion for the owed seat\'s bench — made from either seat', () => {
    const G = owed();
    const me = G.players['0'];
    const stepIns = [me.bench[0]!, me.bench[1]!, me.bench[2]!].map((b) => b.iid);
    for (const pid of ['0', '1'] as const) {
      expect(legalActions(G, pid), `seat ${pid}`).toEqual(stepIns.map((benchIid) => ({ type: 'promoteToActive', benchIid })));
    }
    // the rival's own heroes are not the ones owed
    expect(blocked(G, '1', { type: 'promoteToActive', benchIid: G.players['1'].bench[0]!.iid })).toBe('promotionOwed');
    // none of the other moves, however harmless
    for (const a of [{ type: 'attack' }, { type: 'moveHero', fromSlot: 1, toSlot: 2 }, { type: 'endTurn' }] as const) {
      expect(blocked(G, '0', a), a.type).toBe('promotionOwed');
    }
    // the rival may make it from its own turn, and then play goes on
    expect(runMove('promoteToActive', G, '1', stepIns[1])).not.toBe(INVALID_MOVE);
    expect(G.pendingPromotion).toBeUndefined();
    expect(me.active!.iid).toBe(stepIns[1]);
    expect(runMove('endTurn', G, '0')).not.toBe(INVALID_MOVE);
  });
});
