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
 * engine) match the table in the harness report. The shop redesign took the
 * old deck away, and the deck game (docs/deck-plan.md) brought a deck, a hand
 * and a discard pile back: an item is drawn and put on a hero from the hand
 * for its price, an upgrade onto the hero wearing its component evolves it. A
 * reproduction whose rule survived is kept in those terms (a spell is an
 * active item a hero wears and uses; a piece of gear is played from the hand
 * or evolved), and says what it was; one about a sale or a move of an item —
 * gone with the shop, with no deck equivalent — stays skipped, saying so.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { resolve } from '@/engine/death';
import { addStatus, grantExtraAttacks, tickRemMerges } from '@/engine/statusOps';
import { blocked, legalActions, playBlocked, playTargets, skillBlocked } from '@/engine/legality';
import { kitCost, seatOf, wornItems } from '@/engine/query';
import { ULT_COST } from '@/engine/constants';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { configureReadyMatch, freshReadyGame, giveCard, giveItem, makeHero, playNew } from '../_helpers';
import { forecastMismatches } from './forecast';
import { everyCard } from './oracle';

beforeAll(configureReadyMatch);

const ctxFor = (pid: PlayerID) => ({ currentPlayer: pid, numPlayers: 2, turn: 1 }) as unknown as Ctx;

/** Call a move straight on G (mutating it), like turn-actions.spec's runMove. */
function runMove(name: string, G: GameState, pid: PlayerID, ...args: unknown[]) {
  const fn = (DeadlockGame.moves as Record<string, any>)[name];
  return fn({ G, ctx: ctxFor(pid), playerID: pid, events: { endTurn() {} }, random: {} }, ...args);
}

const anywhere = (G: GameState, iid: string) => everyCard(G).find((x) => x.card.iid === iid)?.card;
/** `hero` uses its ultimate (a kit ability, unlocked at Level 2: the hero is raised to it; it
 *  costs 4, 8 or 12 souls by its card's size: its side is given that much if it holds less, so
 *  a refusal is never the price's). */
function useUlt(G: GameState, hero: CardInstance, targetIid?: string) {
  hero.level = Math.max(2, hero.level ?? 1) as 2 | 3 | 4;
  const ult = (CARDS_BY_ID[hero.cardId] as { ult?: string }).ult;
  const ps = G.players[seatOf(hero)];
  ps.souls = Math.max(ps.souls, kitCost(hero, ult));
  return runMove('useSkill', G, seatOf(hero), hero.iid, targetIid, ult);
}

/** P0 (Haze active; Vindicta / Lash / Paige on the bench), turn 2, with souls to spend. */
function game(): GameState {
  const G = freshReadyGame();
  G.players['0'].souls = 10;
  G.players['1'].souls = 10;
  return G;
}
/** A merged Rem, built by hand: she sits on P0's bench slot `slot` (1..3), then merges into
 *  `bearer` as the old Lil Helpers did — out of her slot (left empty), into the bearer's
 *  `attached`, the max HP she grants on it, for 3 of her owner's turns. No card merges Rem since
 *  the hero rebuild (her skill is Tag Along, a heal); the engine's merge machinery — the
 *  countdown, the return to the bench, the death rescue, the item cap that skips her — remains. */
function mergeRem(G: GameState, slot: 1 | 2 | 3, bearer: CardInstance): CardInstance {
  const rem = makeHero('hero_rem', '0', 'bench', slot);
  G.players['0'].bench[slot - 1] = null;
  rem.zone = 'equipment';
  rem.attachedTo = bearer.iid;
  rem.remMergeTurnsLeft = 3;
  rem.remMergeHpBuff = 1;
  bearer.hpMax += 1;
  bearer.hp += 1;
  (bearer.attached ??= []).push(rem);
  expect(G.players['0'].bench[slot - 1]).toBeNull();
  return rem;
}

// ===========================================================================
// E1  addStatus put statuses on a corpse  (fixed: a corpse takes no status, at the source)
//     Reached through a swing's onAttack passives running after the target was already reaped
//     by Ricochet's own resolve(), and through an ultimate's onBearerUltCast gear on a linked
//     hero who is a corpse. Ricochet became a keyword on 2026-11-03 and no longer reaps
//     mid-attack (the attack resolves once, at its end), so E1a and E1c now guard the outcome:
//     the knocked-out hero comes back clean. (E1a was Shiv's on-hit Bleed; since the hero
//     rebuild the status a swing puts on its target is Haze's Fixation.)
// ===========================================================================
describe('E1 a corpse carries no statuses', () => {
  it('precondition: Shiv with Ricochet knocks the target out and the hero is a corpse afterwards', () => {
    const G = game();
    const shiv = makeHero('hero_shiv', '0', 'active', 0);
    giveItem(G, shiv, 'ricochet');
    G.players['0'].active = shiv;
    const foe = G.players['1'].active!;
    foe.hp = 1;
    expect(runMove('attack', G, '0')).not.toBe(INVALID_MOVE);
    expect(foe.respawnTurnsLeft).toBeGreaterThan(0);
  });

  it('E1a a swing\'s on-hit status — Haze\'s Fixation stack — does not land on the Active she just knocked out (fuzz: heuristic-vs-heuristic seed 145 step 64 is the Weapon Shielding variant)', () => {
    const G = game();
    const haze = G.players['0'].active!;
    expect(haze.cardId).toBe('hero_haze');
    giveItem(G, haze, 'ricochet');
    const foe = G.players['1'].active!;
    foe.hp = 1;
    expect(runMove('attack', G, '0')).not.toBe(INVALID_MOVE);
    expect(foe.respawnTurnsLeft).toBeGreaterThan(0);
    expect(foe.statuses).toEqual([]);
  });

  it('precondition: a standing Lash who uses her ultimate is shielded by her Diviner\'s Kevlar', () => {
    const G = game();
    const lash = G.players['0'].bench[1]!;
    giveItem(G, lash, 'diviners_kevlar');
    expect(useUlt(G, lash)).not.toBe(INVALID_MOVE);
    expect(lash.statuses.map((s) => s.id)).toContain('shield');
  });

  it('E1b Diviner\'s Kevlar never shields a corpse: a fallen hero cannot use its ultimate (it was an ultimate card played for a fallen hero)', () => {
    const G = game();
    const lash = G.players['0'].bench[1]!;
    expect(lash.cardId).toBe('hero_lash');
    giveItem(G, lash, 'diviners_kevlar');
    lash.hp = 0;
    lash.respawnTurnsLeft = 3;
    expect(useUlt(G, lash)).toBe(INVALID_MOVE);
    expect(lash.statuses).toEqual([]);
  });

  it('E1c Siphon Bullets neither robs nor feeds a corpse (Ricochet reaped the target first)', () => {
    const G = game();
    const shiv = makeHero('hero_shiv', '0', 'active', 0);
    giveItem(G, shiv, 'ricochet');
    giveItem(G, shiv, 'siphon_bullets');
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
// E2  Lady Geist's Soul Exchange swapped raw HP  (fixed: each side clamped to its own max, never a corpse)
//     eff_ult_lady_geist did `ally.hp = enemy.hp`: no clamp to hpMax and no corpse check. The
//     ultimate is a kit ability now, used through useSkill, and since the hero rebuild it is aimed:
//     it targets the enemy Active, swaps Lady Geist's own HP (the caster's, wherever she stands)
//     with it — each keeping what its own max HP holds — then deals {sp:3} spirit damage to it.
// ===========================================================================
describe('E2 Soul Exchange keeps HP inside 0..hpMax and leaves corpses alone', () => {
  /** Lady Geist on P0's side — its Active, or bench slot 1 — facing P1's Active. */
  const geistGame = (where: 'active' | 'bench' = 'active') => {
    const G = game();
    const geist = makeHero('hero_lady_geist', '0', where, where === 'active' ? 0 : 1);
    if (where === 'active') G.players['0'].active = geist;
    else G.players['0'].bench[0] = geist;
    return { G, geist, foe: G.players['1'].active! };
  };

  it('precondition: Lady Geist is smaller than the enemy Active', () => {
    const { geist, foe } = geistGame();
    foe.hpMax = foe.hp = 12;
    expect(geist.hpMax).toBeLessThan(12);
  });

  it('E2a the swap never leaves a hero above its max HP — Geist\'s own HP is swapped, from the Active slot or the bench', () => {
    for (const where of ['active', 'bench'] as const) {
      const { G, geist, foe } = geistGame(where);
      geist.hp = 1;
      foe.hpMax = foe.hp = 12;
      const front = G.players['0'].active!;
      if (where === 'bench') front.hp = 2; // the Active is not the one swapped
      expect(useUlt(G, geist, foe.iid), where).not.toBe(INVALID_MOVE);
      expect(geist.hp, where).toBe(geist.hpMax); // the rival's 12 clamps to her max
      expect(geist.hp, where).toBeLessThanOrEqual(geist.hpMax);
      expect(front.cardId, where).toBe(where === 'active' ? 'hero_lady_geist' : 'hero_haze');
      if (where === 'bench') expect(front.hp, where).toBe(2);
    }
  });

  it('E2b a corpse Active cannot be swapped with (no hp on a corpse, no free KO of the caster): it is no target', () => {
    const { G, geist, foe } = geistGame();
    geist.hp = 5;
    foe.hp = 0;
    foe.respawnTurnsLeft = 3;
    expect(useUlt(G, geist, foe.iid)).toBe(INVALID_MOVE);
    expect(foe.hp).toBe(0);
    expect(geist.hp).toBe(5);
  });

  it('E2c each hero keeps what its own max HP holds, the HP that fits changes hands, then Soul Exchange hits the rival', () => {
    const { G, geist, foe } = geistGame();
    geist.hp = 5;                    // 5 / 7
    foe.hpMax = 12; foe.hp = 9;      // 9 / 12
    expect(useUlt(G, geist, foe.iid)).not.toBe(INVALID_MOVE);
    // 9 clamps to Geist's max; Geist's 5 goes across, then {sp:3} (her Spirit is 0) lands on it.
    expect([geist.hp, foe.hp]).toEqual([geist.hpMax, 5 - 3]);
    expect(G.log.some((l) => l.text.startsWith('Soul Exchange:') && l.text.includes('swap HP'))).toBe(true);
  });

  it('E2d a corpse on either side: nobody changes — a fallen Geist cannot cast it, a fallen rival Active is no target', () => {
    for (const side of ['ally', 'foe'] as const) {
      const { G, geist, foe } = geistGame();
      geist.hp = 2;
      foe.hp = 7;
      const corpse = side === 'ally' ? geist : foe;
      corpse.hp = 0;
      corpse.respawnTurnsLeft = 3;
      const before = [geist.hp, foe.hp];
      expect(useUlt(G, geist, foe.iid), side).toBe(INVALID_MOVE);
      expect([geist.hp, foe.hp], side).toEqual(before);
      expect(G.log.some((l) => l.text.startsWith('Soul Exchange')), side).toBe(false);
    }
  });
});

// ===========================================================================
// E3  A merged Rem was counted — and could be discarded — as equipment  (fixed: wornItems)
//     playCard counted `target.attached.length` (Rem included) against the cap and let the
//     discard name her; the AI counted and scored the same way. A card is played from the hand
//     again: a merged Rem takes no item slot — two items and Rem leave room for a third — and no
//     card is played onto her while she rides, nor is she a card of the hand to place or discard.
//     (No card merges Rem since the hero rebuild: `mergeRem` builds the merge by hand.)
// ===========================================================================
describe('E3 a merged Rem takes no item slot', () => {
  /** P0's Active wearing the first `n` of three items with Rem merged into it. */
  const remGame = (n: number) => {
    const G = game();
    const bearer = G.players['0'].active!;
    ['extra_health', 'extended_magazine', 'restorative_shot'].slice(0, n).forEach((id) => giveItem(G, bearer, id));
    const rem = mergeRem(G, 2, bearer);
    return { G, bearer, rem };
  };

  it('precondition: with 3 items and no Rem a 4th card is refused as full, and an upgrade of a worn one still fits (it evolves)', () => {
    const G = game();
    const bearer = G.players['0'].active!;
    ['extra_health', 'extended_magazine', 'restorative_shot'].forEach((id) => giveItem(G, bearer, id));
    const card = giveCard(G, '0', 'extra_spirit');
    expect(playBlocked(G, '0', card.iid, bearer.iid)).toBe('full');
    expect(runMove('playCard', G, '0', card.iid, bearer.iid)).toBe(INVALID_MOVE);
    const titanic = giveCard(G, '0', 'titanic_magazine');
    expect(runMove('playCard', G, '0', titanic.iid, bearer.iid)).not.toBe(INVALID_MOVE);
    expect(wornItems(bearer)).toHaveLength(3);
  });

  it('E3a two items + Rem: a third card may be played onto the bearer (the cap counts items only)', () => {
    const { G, bearer, rem } = remGame(2);
    const card = giveCard(G, '0', 'extra_spirit');
    expect(playBlocked(G, '0', card.iid, bearer.iid)).toBeNull();
    expect(runMove('playCard', G, '0', card.iid, bearer.iid)).not.toBe(INVALID_MOVE);
    expect(wornItems(bearer).map((it) => it.cardId)).toEqual(['extra_health', 'extended_magazine', 'extra_spirit']);
    expect(bearer.attached).toContain(rem);
  });

  // Items no longer move between heroes (the shop's moveItem went with the shop): no deck equivalent.
  it.skip('E3b two items + Rem: a third item may be moved in from another hero', () => {});

  it('E3c three items + Rem is full: no play fits a fourth (but an upgrade of a worn one does)', () => {
    const { G, bearer } = remGame(3);
    const card = giveCard(G, '0', 'extra_spirit');
    const titanic = giveCard(G, '0', 'titanic_magazine');
    expect(playBlocked(G, '0', card.iid, bearer.iid)).toBe('full');
    expect(playBlocked(G, '0', titanic.iid, bearer.iid)).toBeNull(); // over Extended Magazine
    expect(runMove('playCard', G, '0', titanic.iid, bearer.iid)).not.toBe(INVALID_MOVE);
    expect(wornItems(bearer)).toHaveLength(3);
  });

  it('E3d Rem is never played onto as a hero in a slot, nor placed, discarded or played as a card of the hand', () => {
    const { G, bearer, rem } = remGame(2);
    const souls = G.players['0'].souls;
    const card = giveCard(G, '0', 'extra_spirit');
    expect(runMove('placeHero', G, '0', rem.iid)).toBe(INVALID_MOVE);
    expect(runMove('playCard', G, '0', rem.iid, G.players['0'].bench[0]!.iid)).toBe(INVALID_MOVE);
    expect(playBlocked(G, '0', card.iid, rem.iid)).toBe('noHero');
    expect(runMove('playCard', G, '0', card.iid, rem.iid)).toBe(INVALID_MOVE);
    expect(playTargets(G, '0', card.iid)).not.toContain(rem);
    expect(bearer.attached).toContain(rem);
    expect(G.players['0'].souls).toBe(souls);
  });

  it('M3d neither legalActions nor the AI offers to place the merged Rem, or to play a card onto her', () => {
    const { G, rem } = remGame(2);
    giveCard(G, '0', 'extra_spirit');
    const named = legalActions(G, '0').filter((a) => ((a.type === 'placeHero' || a.type === 'chooseActive') && a.cardIid === rem.iid) || (a.type === 'playCard' && (a.heroIid === rem.iid || a.cardIid === rem.iid)));
    expect(named).toEqual([]);
    expect(legalActions(G, '0').some((a) => a.type === 'playCard')).toBe(true);
    const ai = enumerateAIMoves(G, ctxFor('0'), false).filter((m) => m.args.includes(rem.iid));
    expect(ai).toEqual([]);
  });
});

// ===========================================================================
// E4  returnRemToBench  (fixed: she lands in a real slot with `slot` right, and is never dropped)
//     The free-slot fallback never updated `rem.slot`, and when no slot was free she was
//     detached and put nowhere. The hole she leaves can no longer be filled (E5c), so her own
//     slot is always free; these tests build the impossible states by hand (and the merge itself:
//     no card merges Rem since the hero rebuild, the engine still carries her back).
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
  it('precondition: a plain retreat swaps Active and bench hero and charges the leaving Haze\'s printed retreat, 1 soul', () => {
    const G = game();
    const me = G.players['0'];
    const active = me.active!;
    const vind = me.bench[0]!;
    expect(runMove('moveHero', G, '0', 1, 0)).not.toBe(INVALID_MOVE);
    expect(me.active).toBe(vind);
    expect(me.bench[0]).toBe(active);
    expect(me.souls).toBe(9);
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
//     (fixed: legality.ts skillBlocked / activateBlocked validate against targetsFor;
//     E6i, Rem aimed at herself: fixed by the skill's `excludeSelf`). A spell played from
//     the hand is an active item now, used by the hero wearing it.
// ===========================================================================
describe('E6 targets are validated against the ability\'s TargetFilter', () => {
  it('precondition: the AI aims Cold Front at the enemy Active and the engine takes it', () => {
    const G = game();
    const c = giveItem(G, G.players['0'].active!, 'cold_front');
    const foe = G.players['1'].active!.iid;
    expect(enumerateAIMoves(G, ctxFor('0'), false).some((m) => m.move === 'activate' && m.args[0] === c.iid && m.args[1] === foe)).toBe(true);
    expect(runMove('activate', G, '0', c.iid, foe)).not.toBe(INVALID_MOVE);
  });

  it('E6a a "self" skill (Wraith\'s Full Auto; it was Viscous\'s, an ally skill now) cannot be aimed at an enemy', () => {
    const G = game();
    const wraith = makeHero('hero_wraith', '0', 'active', 0);
    G.players['0'].active = wraith;
    const foe = G.players['1'].active!;
    expect(skillBlocked(G, '0', wraith, wraith.iid)).toBeNull(); // paid for, aimed at herself
    const r = runMove('useSkill', G, '0', wraith.iid, foe.iid);
    expect(r).toBe(INVALID_MOVE);
    expect(foe.statuses.some((s) => s.id === 'weapon_power')).toBe(false);
    expect(G.players['0'].souls).toBe(10);
  });

  it('E6b an enemy-Active item cannot be aimed at your own hero', () => {
    const G = game();
    const c = giveItem(G, G.players['0'].active!, 'cold_front');
    const own = G.players['0'].bench[0]!;
    expect(runMove('activate', G, '0', c.iid, own.iid)).toBe(INVALID_MOVE);
  });

  it('E6c an enemy-Active item cannot be aimed at an enemy bench hero', () => {
    const G = game();
    const c = giveItem(G, G.players['0'].active!, 'cold_front');
    expect(runMove('activate', G, '0', c.iid, G.players['1'].bench[0]!.iid)).toBe(INVALID_MOVE);
  });

  it('E6d a targeted item needs a target (no ability and no cooldown spent for nothing)', () => {
    const G = game();
    const haze = G.players['0'].active!;
    const c = giveItem(G, haze, 'cold_front');
    const souls = G.players['0'].souls;
    expect(runMove('activate', G, '0', c.iid)).toBe(INVALID_MOVE);
    expect([G.players['0'].souls, haze.skillUsedThisTurn, c.cooldowns]).toEqual([souls, false, undefined]);
  });

  it('E6e an unknown iid is not a target', () => {
    const G = game();
    const c = giveItem(G, G.players['0'].active!, 'cold_front');
    expect(runMove('activate', G, '0', c.iid, 'no-such-iid')).toBe(INVALID_MOVE);
  });

  it('E6f a skill cannot target a corpse (and a corpse takes no damage or status)', () => {
    const G = game();
    // Yamato's Flying Slash: any enemy hero, bench too (Lash's skill, enemyAny once, has no target now).
    const yamato = makeHero('hero_yamato', '0', 'active', 0);
    G.players['0'].active = yamato;
    const corpse = G.players['1'].bench[0]!;
    corpse.hp = 0;
    corpse.respawnTurnsLeft = 3;
    expect(skillBlocked(G, '0', yamato, G.players['1'].bench[1]!.iid)).toBeNull(); // a living bench hero is a target
    const r = runMove('useSkill', G, '0', yamato.iid, corpse.iid);
    expect(r).toBe(INVALID_MOVE);
    expect(corpse.hp).toBe(0);
    expect(corpse.statuses).toEqual([]);
    expect(G.players['0'].souls).toBe(10);
  });

  it('E6g Yamato\'s self-cast ultimate cannot be given an enemy target', () => {
    const G = game();
    const yamato = makeHero('hero_yamato', '0', 'active', 0);
    G.players['0'].active = yamato;
    const foe = G.players['1'].active!;
    expect(useUlt(G, yamato, foe.iid)).toBe(INVALID_MOVE);
    expect(foe.statuses.some((s) => s.id === 'unstoppable')).toBe(false);
  });

  it('E6h Rem\'s ally skill cannot be aimed at an enemy hero (it merged into it once; Tag Along would heal it now)', () => {
    const G = game();
    const rem = makeHero('hero_rem', '0', 'bench', 1);
    G.players['0'].bench[0] = rem;
    const foe = G.players['1'].active!;
    foe.hp = 2;
    const r = runMove('useSkill', G, '0', rem.iid, foe.iid);
    expect(r).toBe(INVALID_MOVE);
    expect(foe.hp).toBe(2);
    expect(foe.attached ?? []).not.toContain(rem);
    expect(G.players['0'].souls).toBe(10);
  });

  it('E6i Rem aimed at herself is refused instead of burning a soul and the skill for nothing', () => {
    const G = game();
    const rem = makeHero('hero_rem', '0', 'bench', 1);
    G.players['0'].bench[0] = rem;
    const souls = G.players['0'].souls;
    const r = runMove('useSkill', G, '0', rem.iid, rem.iid);
    expect(r).toBe(INVALID_MOVE);
    expect(G.players['0'].souls).toBe(souls);
    expect(rem.skillUsedThisTurn).toBe(false);
  });

  it('E6j Rem\'s Tag Along is aimed at any other ally hero, and has no target when she is alone', () => {
    const G = game();
    const rem = makeHero('hero_rem', '0', 'bench', 1);
    G.players['0'].bench[0] = rem;
    const me = G.players['0'];
    const others = [me.active!, me.bench[1]!, me.bench[2]!].map((c) => c.iid);
    const targets = legalActions(G, '0').filter((a) => a.type === 'useSkill' && a.heroIid === rem.iid).map((a) => (a as { targetIid?: string }).targetIid);
    expect(targets).toEqual(others); // board order, her own iid not among them
    expect(skillBlocked(G, '0', rem)).toBeNull();
    // alone on the board she has nobody to nap on
    me.active = rem; me.bench = [null, null, null]; // (a state a story roster can reach)
    expect(skillBlocked(G, '0', rem)).toBe('target');
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
    giveItem(G, G.players['0'].active!, 'cold_front'); // something worn, for the item moves to miss
    return G;
  };

  it.each(['useSkill', 'activate', 'promoteToActive'])('%s with junk ids', (move) => {
    for (const a of junk) for (const b of junk) {
      const G = withHole();
      const before = JSON.stringify(G);
      expect(runMove(move, G, '0', a, b, a), `${move}(${String(a)}, ${String(b)})`).toBe(INVALID_MOVE);
      expect(JSON.stringify(G)).toBe(before);
    }
  });

  it.each(['playCard', 'placeHero', 'discard', 'chooseActive'])('%s with junk ids', (move) => {
    for (const a of junk) for (const b of junk) {
      const G = withHole();
      const before = JSON.stringify(G);
      expect(runMove(move, G, '0', a, b), `${move}(${String(a)}, ${String(b)})`).toBe(INVALID_MOVE);
      expect(JSON.stringify(G)).toBe(before);
    }
  });

  it('playCard with a real card and a junk hero or a junk upgrade, or a junk card and a real hero; a discard nobody owes', () => {
    for (const j of junk) {
      const G = withHole();
      const card = giveCard(G, '0', 'extended_magazine');
      const before = JSON.stringify(G);
      expect(runMove('playCard', G, '0', card.iid, j), `playCard(card, ${String(j)})`).toBe(INVALID_MOVE);
      expect(runMove('playCard', G, '0', j, G.players['0'].active!.iid), `playCard(${String(j)}, Active)`).toBe(INVALID_MOVE);
      if (j !== undefined) expect(runMove('playCard', G, '0', card.iid, G.players['0'].active!.iid, j), `playCard(card, Active, ${String(j)})`).toBe(INVALID_MOVE);
      expect(runMove('discard', G, '0', [card.iid]), 'discard with nothing owed').toBe(INVALID_MOVE);
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
// E8  Replaced equipment kept its bonuses  (fixed: an item that comes off takes its bonus back)
//     applyOnPlay added `bonus` to atkMod / hpMax / spiritMod and nothing removed it when the item
//     was discarded to make room. In the deck game an item comes off a hero when an upgrade
//     played onto it evolves it (the component goes to the discard pile) — and its bonus goes
//     with it (HP the hero no longer has room for goes too, HP already lost stays lost). Sales
//     and moves went with the shop: their reproductions stay skipped.
// ===========================================================================
describe('E8 an item that comes off takes its bonus with it', () => {
  it('E8a Extra Health evolved into Colossus (no HP of its own) takes its +2 HP away, and goes to the discard pile', () => {
    const G = game();
    const hero = G.players['0'].active!;
    const base = hero.hpMax;
    const hp = playNew(G, '0', 'extra_health', hero);
    expect([hero.hpMax, hero.hp]).toEqual([base + 2, base + 2]);
    G.players['0'].souls = 20;
    playNew(G, '0', 'colossus', hero);
    expect(hero.attached!.some((a) => a.iid === hp.iid)).toBe(false);
    expect(G.players['0'].discard.map((c) => c.iid)).toEqual([hp.iid]);
    expect([hero.hpMax, hero.hp]).toEqual([base, base]);
  });

  it('E8b an upgrade takes its component\'s bonus away and brings its own', () => {
    const G = game();
    const hero = G.players['0'].active!;
    const { atkMod, spiritMod, hpMax } = hero;
    playNew(G, '0', 'extended_magazine', hero);  // +1 attack
    playNew(G, '0', 'titanic_magazine', hero);   // +2 attack, over Extended Magazine
    expect(hero.atkMod).toBe(atkMod + 2);
    playNew(G, '0', 'extra_spirit', hero);       // +1 spirit
    playNew(G, '0', 'improved_spirit', hero);    // +2 spirit, over Extra Spirit
    expect(wornItems(hero).map((it) => it.cardId)).toEqual(['titanic_magazine', 'improved_spirit']);
    expect([hero.atkMod, hero.spiritMod, hero.hpMax]).toEqual([atkMod + 2, spiritMod + 2, hpMax]);
    // (a fifth first wearing would level the hero up: Boundless Spirit on a fresh board)
    const H = game();
    const bearer = H.players['0'].active!;
    giveItem(H, bearer, 'improved_spirit');      // +2 spirit
    const before = { ...bearer };
    playNew(H, '0', 'boundless_spirit', bearer); // +5 spirit, +3 HP, over Improved Spirit
    expect([bearer.spiritMod, bearer.hpMax, bearer.hp]).toEqual([before.spiritMod - 2 + 5, before.hpMax + 3, before.hp + 3]);
    expect(wornItems(bearer).map((it) => it.cardId)).toEqual(['boundless_spirit']);
  });

  it('E8c an evolution off an HP item: HP already lost stays lost, a full hero is clamped to its new max', () => {
    const G = game();
    G.players['0'].souls = 40;
    const hero = G.players['0'].active!;
    const base = hero.hpMax;
    giveItem(G, hero, 'extra_health');
    hero.hp = 3;
    playNew(G, '0', 'colossus', hero);
    expect([hero.hpMax, hero.hp]).toEqual([base, 3]); // the lost HP is not refunded or double-counted
    const V = game();
    const full = V.players['0'].active!;
    giveItem(V, full, 'extra_health');
    expect(full.hp).toBe(base + 2);
    playNew(V, '0', 'colossus', full);
    expect([full.hpMax, full.hp]).toEqual([base, base]); // no room for the 2 it gave
  });

  // Items no longer move between heroes, and nothing is sold: these went with the shop and
  // have no deck equivalent (an item comes off a hero only when an upgrade evolves it, E8a–c).
  it.skip('E8d moving an item takes its bonus from one hero to the other', () => {});
  it.skip('E8e an upgrade sold on the turn it was bought gives its component back, bonus and all', () => {});
});

// ===========================================================================
// M1  skillBlocked ignored target availability  (fixed: legality.skillBlocked asks targetsFor)
//     A skill aimed at the enemy Active with the rival Active a corpse and no hero able to step
//     in has no target: the board lit the skill and no click could complete it. (It was Kelvin's;
//     since the hero rebuild Frost Grenade has no target, and Mo & Krill's Sand Blast — the enemy
//     Active — stands in.)
// ===========================================================================
describe('M1 skillBlocked agrees there is something to aim at', () => {
  it('M1 an enemy-Active skill (Mo & Krill\'s Sand Blast) is not offered while the rival Active is a corpse with nobody to step in', () => {
    const G = game();
    const mk = makeHero('hero_mo_krill', '0', 'active', 0);
    G.players['0'].active = mk;
    const sandBlast = (g: GameState) => legalActions(g, '0').filter((a) => a.type === 'useSkill' && a.heroIid === mk.iid && a.skillId === 'skill_mo_krill');
    // paid for, and aimed at the standing rival Active
    expect(skillBlocked(G, '0', mk)).toBeNull();
    expect(sandBlast(G).map((a) => (a as { targetIid?: string }).targetIid)).toEqual([G.players['1'].active!.iid]);
    const foe = G.players['1'];
    foe.bench = [makeHero('hero_rem', '1', 'bench', 1), null, null]; // Rem cannot step up
    foe.active!.hp = 0;
    foe.active!.respawnTurnsLeft = 3;
    resolve(G);
    expect(foe.active!.respawnTurnsLeft).toBeGreaterThan(0);
    expect(skillBlocked(G, '0', mk)).toBe('target');
    expect(sandBlast(G)).toEqual([]);
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
  /** The attack is open (a blocked one is forecast as nothing, and would match vacuously); it
   *  is made, and P1's Active as it leaves it is returned, to show the case reached its subject. */
  const swing = (G: GameState) => {
    expect(blocked(G, '0', { type: 'attack' })).toBeNull();
    expect(runMove('attack', G, '0')).not.toBe(INVALID_MOVE);
    return G.players['1'].active!;
  };

  it('precondition: a plain attack is forecast exactly', () => {
    const { G } = duel('hero_haze');
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
  });

  it('M2a a swing\'s spirit rider — Vindicta\'s Flight, {sp:1} with each swing (it was Wraith\'s Mixed Bullets) — is in the plan', () => {
    const { G, atk } = duel('hero_vindicta');
    atk.spiritMod = 3;
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
    expect(swing(G).hp).toBe(40 - 2 - (1 + 3)); // her 2 Attack, and Flight's {sp:1} at Spirit 3
  });

  it('M2b a sleeping target — a Sleep is a Stun for its turns: damage does not wake it, and there is no wake-up burst any more — is in the plan', () => {
    const { G, foe } = duel('hero_haze', 12);
    foe.statuses.push({ id: 'sleep', value: 1, duration: 2 });
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
    const hit = swing(G);
    expect(hit.hp).toBe(12 - 1); // Haze's 1 Attack, nothing more
    expect(hit.statuses.find((s) => s.id === 'sleep')).toMatchObject({ value: 1, duration: 2 }); // still asleep
  });

  it('M2c Djinn\'s Mark detonating on the 3rd mark (passive_mirage_djinns_mark, DJINN_CAP) is in the plan', () => {
    const { G, foe } = duel('hero_mirage', 40);
    foe.statuses.push({ id: 'djinns_mark', value: 2, duration: 3 });
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
    const hit = swing(G);
    expect(hit.hp).toBe(40 - 1 - 4); // Mirage's 1 Attack, then the detonation's 4 (Spirit 0)
    expect(hit.statuses.some((s) => s.id === 'djinns_mark')).toBe(false); // the marks went off
  });

  it('M2d Ricochet knocking out a bench hero costs the patron a life (plan.patronDamage)', () => {
    const { G, atk, foe } = duel('hero_haze');
    giveItem(G, atk, 'ricochet');
    G.players['1'].bench[0]!.hp = 1;
    expect(foe.hp).toBe(40);
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
  });

  it('M2e the target\'s Weapon Shielding (Shield 2 after each bullet) is in the plan of a two-swing attack', () => {
    const { G, atk, foe } = duel('hero_haze', 5);
    giveItem(G, foe, 'weapon_shielding');
    // Haze's Fixation no longer swings twice (each swing adds a stack she hits harder for): the
    // second swing is an Extra Attack. The first lands and raises the Shield the second runs into.
    expect(atk.cardId).toBe('hero_haze');
    grantExtraAttacks(atk, 1);
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
    // swing 1: 5 -> 4, Shield 2; swing 2 (1 + Fixation 1) is soaked by it — no KO.
    const hit = swing(G);
    expect(hit.hp).toBe(4);
    expect(hit.statuses.find((s) => s.id === 'fixation')?.value).toBe(2); // two swings landed
  });

  it('M2f Bullet Resist Shredder (+1 damage on the next swing) is in the plan of a two-swing attack', () => {
    const { G, atk } = duel('hero_haze', 40);
    giveItem(G, atk, 'bullet_resist_shredder');
    grantExtraAttacks(atk, 1); // the second swing (Fixation gives none now)
    expect(forecastMismatches(G, ctxFor('0'), '0')).toEqual([]);
    // swing 1: 1; swing 2: 1 + Fixation 1 + the Shredder's 1
    expect(swing(G).hp).toBe(40 - 1 - 3);
  });
});

// ===========================================================================
// M3  The AI's own copy of the rules  (fixed: the AI plays the engine's legalActions)
//     It had its own cost, its own target test (a self-cast ultimate never matched) and its own
//     skill gate (Rem on Rem). Ultimates are kit abilities now, paid by their size: a self-cast
//     one, and Sinclair's Audience Participation — aimed as the rival Active's ultimate it copies,
//     which it casts at once — are offered like any skill, and an active item like its bearer's
//     ability. (M3a was the borrowed ultimate Sinclair's copy left behind, used later for free:
//     it went with the hero rebuild.)
// ===========================================================================
describe('M3 the AI sees every legal play', () => {
  /** Sinclair at Level 2, alone on P0's side (a short list: the AI keeps only its top 12 moves)
   *  with `souls`, facing P1's Abrams — whose Seismic Impact (the enemy Active) is there to copy. */
  const sinclairGame = (souls: number) => {
    const G = game();
    const sinclair = makeHero('hero_sinclair', '0', 'active', 0);
    sinclair.level = 2;
    G.players['0'].active = sinclair;
    G.players['0'].bench = [null, null, null];
    G.players['0'].souls = souls;
    return { G, sinclair, foe: G.players['1'].active! };
  };
  /** What legalActions and the AI offer of Audience Participation: [target iid, …] each. */
  const offers = (G: GameState, sinclair: CardInstance) => ({
    legal: legalActions(G, '0').filter((a) => a.type === 'useSkill' && a.heroIid === sinclair.iid && a.skillId === 'eff_ult_sinclair').map((a) => (a as { targetIid?: string }).targetIid),
    ai: enumerateAIMoves(G, ctxFor('0'), false).filter((m) => m.move === 'useSkill' && m.args[0] === sinclair.iid && m.args[2] === 'eff_ult_sinclair').map((m) => m.args[1]),
  });

  it('precondition: the engine takes Audience Participation for its 8 souls and casts the copied ultimate at once, keeping no copy', () => {
    const { G, sinclair, foe } = sinclairGame(ULT_COST.medium);
    expect(foe.cardId).toBe('hero_abrams');
    expect(kitCost(sinclair, 'eff_ult_sinclair')).toBe(ULT_COST.medium);
    const hp = foe.hp;
    expect(runMove('useSkill', G, '0', sinclair.iid, foe.iid, 'eff_ult_sinclair')).not.toBe(INVALID_MOVE);
    // Seismic Impact, cast now by Sinclair: {sp:6} (his Spirit is 0) and a Stun.
    expect(foe.hp).toBe(hp - 6);
    expect(foe.statuses.some((s) => s.id === 'stun')).toBe(true);
    expect(G.players['0'].souls).toBe(0);
    // nothing is left to use later: Seismic Impact is no ability of his
    sinclair.skillUsedThisTurn = false;
    expect(skillBlocked(G, '0', sinclair, foe.iid, 'eff_ult_abrams')).toBe('noSkill');
    expect((sinclair as unknown as Record<string, unknown>).borrowedUlt).toBeUndefined();
  });

  it('M3a Audience Participation is offered — by legalActions and the AI — exactly when it can be paid for and there is an ultimate to copy', () => {
    // paid for, Seismic Impact to copy: offered, aimed as Seismic Impact aims (the enemy Active)
    const paid = sinclairGame(ULT_COST.medium);
    expect(skillBlocked(paid.G, '0', paid.sinclair, undefined, 'eff_ult_sinclair')).toBeNull();
    expect(offers(paid.G, paid.sinclair)).toEqual({ legal: [paid.foe.iid], ai: [paid.foe.iid] });
    // a soul short: neither offers it
    const short = sinclairGame(ULT_COST.medium - 1);
    expect(skillBlocked(short.G, '0', short.sinclair, undefined, 'eff_ult_sinclair')).toBe('souls');
    expect(offers(short.G, short.sinclair)).toEqual({ legal: [], ai: [] });
    // nothing to copy — the rival Active is a Sinclair, and a copy is no ultimate to copy: neither
    const mirror = sinclairGame(ULT_COST.medium);
    mirror.G.players['1'].active = makeHero('hero_sinclair', '1', 'active', 0);
    expect(skillBlocked(mirror.G, '0', mirror.sinclair, undefined, 'eff_ult_sinclair')).toBe('target');
    expect(offers(mirror.G, mirror.sinclair)).toEqual({ legal: [], ai: [] });
  });

  it('precondition: the engine takes Yamato\'s self-cast ultimate aimed at himself', () => {
    const G = game();
    const yamato = makeHero('hero_yamato', '0', 'active', 0);
    G.players['0'].active = yamato;
    expect(useUlt(G, yamato, yamato.iid)).not.toBe(INVALID_MOVE);
  });

  it('M3b Yamato\'s self-cast ultimate is offered', () => {
    const G = game();
    const yamato = makeHero('hero_yamato', '0', 'active', 0);
    yamato.level = 2;
    G.players['0'].active = yamato;
    const offered = enumerateAIMoves(G, ctxFor('0'), false).some((m) => m.move === 'useSkill' && m.args[0] === yamato.iid && m.args[2] === 'eff_ult_yamato');
    expect(offered).toBe(true);
  });

  it('M3c Rem\'s skill is not offered on Rem herself (the engine refuses it)', () => {
    const G = game();
    const rem = makeHero('hero_rem', '0', 'bench', 1);
    G.players['0'].bench = [rem, null, null]; // a short list: the AI keeps only its top 12 moves
    const selfCast = enumerateAIMoves(G, ctxFor('0'), false).some((m) => m.move === 'useSkill' && m.args[0] === rem.iid && m.args[1] === rem.iid);
    expect(selfCast).toBe(false);
  });

  it('M3e an active item worn on the bench is offered as its bearer\'s ability, on each of its targets', () => {
    const G = game();
    const paige = G.players['0'].bench[2]!;
    const ward = giveItem(G, paige, 'guardian_ward'); // "Grant an ally Shield 3."
    const offered = legalActions(G, '0').filter((a) => a.type === 'activate' && a.itemIid === ward.iid).map((a) => (a as { targetIid?: string }).targetIid);
    const allies = [G.players['0'].active!, ...G.players['0'].bench].map((c) => c!.iid);
    expect(offered).toEqual(allies);
    expect(runMove('activate', G, '0', ward.iid, allies[0])).not.toBe(INVALID_MOVE);
    expect(paige.skillUsedThisTurn).toBe(true);
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

  it('M4b an active item, a card from the hand and a hero from the hand are refused while the seat owes a promotion', () => {
    const G = owed();
    const heal = giveItem(G, G.players['0'].bench[1]!, 'healing_rite');
    const card = giveCard(G, '0', 'healing_rite');
    const hero = giveCard(G, '0', 'hero_yamato');
    expect(runMove('activate', G, '0', heal.iid, G.players['0'].bench[1]!.iid)).toBe(INVALID_MOVE);
    expect(blocked(G, '0', { type: 'playCard', cardIid: card.iid, heroIid: G.players['0'].bench[0]!.iid })).toBe('promotionOwed');
    expect(runMove('playCard', G, '0', card.iid, G.players['0'].bench[0]!.iid)).toBe(INVALID_MOVE);
    expect(blocked(G, '0', { type: 'placeHero', cardIid: hero.iid })).toBe('promotionOwed');
    expect(runMove('placeHero', G, '0', hero.iid)).toBe(INVALID_MOVE);
    expect(G.players['0'].hand).toEqual([card, hero]);
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
