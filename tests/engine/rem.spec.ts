/**
 * Rem (docs/hero-design.md §8, Patrick's call of 2026-11-09): no longer
 * bench-only. She stands in the lane like any hero — she can open the match,
 * be put straight into an empty lane, step up when the Active falls and be
 * retreated to (her Retreat is 0). Her skill, Tag Along (2 souls), makes her
 * equipment on another standing hero of her side for 2 of her turns: it heals
 * 4✦, and then she returns to her bench — her slot kept for her from the
 * bench, the first free one from the lane (her side then fills the lane as
 * when an Active falls), riding on one more turn when there is none, and back
 * to the bench at once when her bearer falls.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { INVALID, perform } from '@/engine/engine';
import {
  attackTargets, blocked, freeBenchSlots, legalActions, openingCandidates, placeHeroBlocked, promoteBlocked, retreatCost, skillBlocked, skillTargets,
} from '@/engine/legality';
import { resolve } from '@/engine/death';
import { damageUnit } from '@/engine/damage';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { findCardOnBoard, heroesOf, kitCost, liveBoardCards, stepInCandidates, targetsFor } from '@/engine/query';
import { isValidTarget } from '@/ui/board/targeting';
import { getAbility } from '@/abilities';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { freshReadyGame, giveCard, makeHero } from './_helpers';

const saved = getMatchConfig();
afterEach(() => setMatchConfig(saved));

/** Perform `a` for `pid`, failing the test if the engine refuses it. */
function act(G: GameState, pid: '0' | '1', a: Parameters<typeof perform>[2]) {
  expect(perform(G, pid, a), JSON.stringify(a)).not.toBe(INVALID);
}

/** A drafted match whose seat 0 drafted Rem first, held at the opening: seat 0
 *  still owes its first Active. */
function draftedWithRem(): GameState {
  setMatchConfig({ heroPreferences: [null, null, null, null], seed: 77, humanSeat: '0' });
  const client = Client({ game: DeadlockGame, numPlayers: 2 });
  client.start();
  // Snake: P0 at 0, 3, 4, 7 (Rem, Vindicta, Lash, Paige); P1 at 1, 2, 5, 6.
  for (const id of ['hero_rem', 'hero_abrams', 'hero_dynamo', 'hero_vindicta', 'hero_lash', 'hero_kelvin', 'hero_seven', 'hero_paige']) {
    client.moves.draftPick(id);
  }
  const G = structuredClone(client.getState()!.G) as GameState;
  client.stop();
  return G;
}

describe('Rem stands in the lane', () => {
  it('opens the match: the opening offers her, and the lane takes her', () => {
    const G = draftedWithRem();
    expect(G.pendingActive).toBe('0');
    const rem = openingCandidates(G, '0').find((c) => c.cardId === 'hero_rem');
    expect(rem).toBeDefined();
    expect(legalActions(G, '0')).toContainEqual({ type: 'chooseActive', cardIid: rem!.iid });
    act(G, '0', { type: 'chooseActive', cardIid: rem!.iid });
    expect(G.players['0'].active?.cardId).toBe('hero_rem');
    expect(G.players['0'].active).toMatchObject({ zone: 'active', slot: 0 });
  });

  it('goes straight from the hand into an empty lane', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.active = null;
    me.bench = [null, null, null];
    const rem = giveCard(G, '0', 'hero_rem');
    expect(placeHeroBlocked(G, '0', rem.iid, true)).toBeNull();
    expect(legalActions(G, '0')).toContainEqual({ type: 'placeHero', cardIid: rem.iid, toActive: true });
    act(G, '0', { type: 'placeHero', cardIid: rem.iid, toActive: true });
    expect(me.active).toBe(rem);
    expect(rem).toMatchObject({ zone: 'active', slot: 0 });
  });

  it('steps up when the Active falls: the human seat is asked, an AI seat promotes her at once', () => {
    // The human seat (0): her Active down, Rem the only one who can step up.
    const G = freshReadyGame();
    const me = G.players['0'];
    const rem = makeHero('hero_rem', '0', 'bench', 2);
    me.bench = [null, rem, null];
    me.active!.hp = 0;
    resolve(G);
    expect(G.pendingPromotion).toBe('0');
    expect(stepInCandidates(me)).toEqual([rem]);
    expect(promoteBlocked(G, rem.iid)).toBeNull();
    act(G, '0', { type: 'promoteToActive', benchIid: rem.iid });
    expect(me.active).toBe(rem);
    expect(G.pendingPromotion).toBeUndefined();

    // An AI seat (1): promoted on the spot, no question asked.
    const H = freshReadyGame();
    const foe = H.players['1'];
    const theirRem = makeHero('hero_rem', '1', 'bench', 1);
    foe.bench = [theirRem, null, null];
    foe.active!.hp = 0;
    resolve(H);
    expect(foe.active).toBe(theirRem);
    expect(H.pendingPromotion).toBeUndefined();
  });

  it('can be retreated to, and retreats out of the lane for her printed 0', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const haze = me.active!;
    const rem: CardInstance = makeHero('hero_rem', '0', 'bench', 2);
    me.bench[1] = rem;
    me.souls = 5;
    expect(legalActions(G, '0')).toContainEqual({ type: 'moveHero', fromSlot: 2, toSlot: 0 });
    act(G, '0', { type: 'moveHero', fromSlot: 2, toSlot: 0 });
    expect(me.active).toBe(rem);
    expect(me.bench[1]).toBe(haze);
    expect(me.souls).toBe(5 - 1); // Haze's Retreat 1
    // Next turn, out again: Rem's Retreat is 0.
    G.retreatUsed = false;
    expect(retreatCost(G, '0')).toBe(0);
    act(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: 2 });
    expect(me.active).toBe(haze);
    expect(me.souls).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Tag Along
// ---------------------------------------------------------------------------

/** End `pid`'s turn and begin the other seat's, as the game's turn hooks do. */
function nextTurn(G: GameState, pid: PlayerID): PlayerID {
  const next: PlayerID = pid === '0' ? '1' : '0';
  endTurnEffects(G, pid);
  beginTurn(G, next, G.turnNumber + 1 + G.draftTurnsOffset);
  return next;
}

/** P0's board (P0 on turn, the human seat): Haze in the lane, Vindicta, Lash,
 *  Paige on the bench — with Rem standing in `where` instead of the hero
 *  there (0 the lane, 1-3 the bench), and the souls to pay for Tag Along. */
function withRem(where: 0 | 1 | 2 | 3) {
  const G = freshReadyGame();
  const me = G.players['0'];
  const rem = makeHero('hero_rem', '0', where === 0 ? 'active' : 'bench', where);
  if (where === 0) me.active = rem;
  else me.bench[where - 1] = rem;
  me.souls = 10;
  return { G, me, rem };
}

/** Rem's Tag Along on `target`, through the engine's front door. */
function tagAlong(G: GameState, rem: CardInstance, target: CardInstance) {
  act(G, '0', { type: 'useSkill', heroIid: rem.iid, skillId: 'skill_rem', targetIid: target.iid });
}

describe('Tag Along: Rem rides on an ally as equipment', () => {
  it('the card text, exactly, and its price: 2 souls, then the 1-turn wait', () => {
    const skill = getAbility('skill_rem')!;
    expect(skill.name).toBe('Tag Along');
    expect(skill.text).toBe('Rem rides on another of your heroes as equipment for 2 turns: it heals {sp:4}. Then Rem returns to your bench.');
    const { G, me, rem } = withRem(2);
    expect(kitCost(rem, 'skill_rem')).toBe(2);
    tagAlong(G, rem, me.active!);
    expect(me.souls).toBe(10 - 2);
    expect(rem.cooldowns).toEqual({ skill_rem: 1 });
  });

  it('aims at another standing hero of her side, bench or Active — not herself, a corpse or an enemy — and the board lights exactly those', () => {
    const { G, me, rem } = withRem(2);
    const [vindicta, , paige] = me.bench;
    paige!.hp = 0;
    paige!.respawnTurnsLeft = 2; // a corpse
    const aimed = skillTargets(G, '0', rem, 'skill_rem');
    expect(aimed === 'none' ? aimed : aimed.map((c) => c.cardId)).toEqual(['hero_haze', 'hero_vindicta']);
    expect(skillBlocked(G, '0', rem, rem.iid, 'skill_rem')).toBe('target');
    expect(skillBlocked(G, '0', rem, paige!.iid, 'skill_rem')).toBe('target');
    expect(skillBlocked(G, '0', rem, G.players['1'].active!.iid, 'skill_rem')).toBe('target');
    const armed = { kind: 'useSkill' as const, iid: rem.iid, skillId: 'skill_rem', title: 'Tag Along', desc: '', filter: 'allyHero' as const };
    const lit = [...liveBoardCards(G.players['1']), me.active!, ...me.bench, paige!]
      .filter((c): c is CardInstance => !!c)
      .filter((c) => isValidTarget(G, '0', armed, c));
    expect(lit).toEqual([me.active!, vindicta!]);
  });

  it('heals its bearer 4 + Spirit (no higher than its max HP)', () => {
    const { G, me, rem } = withRem(1);
    rem.spiritMod = 3;
    const haze = me.active!;
    haze.hpMax = 20;
    haze.hp = 5;
    tagAlong(G, rem, haze);
    expect(haze.hp).toBe(5 + 4 + 3);
    expect(haze.hpMax).toBe(20);
    // On a hero 2 short of its max it heals those 2.
    const H = withRem(1);
    H.me.active!.hp = H.me.active!.hpMax - 2;
    tagAlong(H.G, H.rem, H.me.active!);
    expect(H.me.active!.hp).toBe(H.me.active!.hpMax);
  });

  it('from the bench: she leaves her slot and rides on the bearer, the slot kept for her', () => {
    const { G, me, rem } = withRem(2);
    const haze = me.active!;
    tagAlong(G, rem, haze);
    expect(me.bench[1]).toBeNull();
    expect(haze.attached).toContain(rem);
    expect(rem).toMatchObject({ zone: 'equipment', attachedTo: haze.iid, remMergeTurnsLeft: 2, slot: 2 });
    expect(heroesOf(me)).toContain(rem); // still one of her side's heroes
    // Her slot is not free: a hero from the hand goes elsewhere, or not at all.
    expect(freeBenchSlots(me)).toEqual([]);
    const yamato = giveCard(G, '0', 'hero_yamato');
    expect(placeHeroBlocked(G, '0', yamato.iid, false, 2)).toBe('slotTaken');
    expect(G.pendingPromotion).toBeUndefined(); // the lane is Haze's still
  });

  it('from the lane: the lane is left empty and her side fills it as when an Active falls — the human seat is asked', () => {
    const { G, me, rem } = withRem(0);
    const lash = me.bench[1]!;
    tagAlong(G, rem, lash);
    expect(me.active).toBeNull();
    expect(lash.attached).toContain(rem);
    expect(rem).toMatchObject({ zone: 'equipment', remMergeTurnsLeft: 2, slot: 0 });
    // The promotion is owed, and nothing else may be done until it is made.
    expect(G.pendingPromotion).toBe('0');
    expect(blocked(G, '0', { type: 'endTurn' })).toBe('promotionOwed');
    expect(legalActions(G, '0').every((a) => a.type === 'promoteToActive')).toBe(true);
    // The bearer can step up, carrying her.
    act(G, '0', { type: 'promoteToActive', benchIid: lash.iid });
    expect(me.active).toBe(lash);
    expect(lash.attached).toContain(rem);
    expect(G.pendingPromotion).toBeUndefined();
    // The turn's attack is still there for the hero who stepped up.
    expect(attackTargets(G, '0').length).toBeGreaterThan(0);
  });

  it('from the lane, on an AI seat: the healthiest bench hero steps up at once', () => {
    const G = freshReadyGame();
    G.turnNumber = 3; // P1's turn
    const foe = G.players['1'];
    const rem = makeHero('hero_rem', '1', 'active', 0);
    foe.active = rem;
    foe.souls = 10;
    const [dynamo, kelvin] = foe.bench;
    dynamo!.hp = 1; // hurt: Kelvin, healthier, steps up
    act(G, '1', { type: 'useSkill', heroIid: rem.iid, skillId: 'skill_rem', targetIid: dynamo!.iid });
    expect(dynamo!.attached).toContain(rem);
    expect(foe.active).toBe(kelvin);
    expect(G.pendingPromotion).toBeUndefined();
  });

  it('rides 2 of her turns, then returns to the bench slot she rode out of', () => {
    const { G, me, rem } = withRem(3);
    const haze = me.active!;
    tagAlong(G, rem, haze);
    nextTurn(G, '0'); // the rival's turn: nothing ticks for her
    expect(rem.remMergeTurnsLeft).toBe(2);
    nextTurn(G, '1'); // her first turn
    expect(rem.remMergeTurnsLeft).toBe(1);
    expect(haze.attached).toContain(rem);
    nextTurn(G, '0');
    nextTurn(G, '1'); // her second turn: the ride is over
    expect(haze.attached ?? []).not.toContain(rem);
    expect(me.bench[2]).toBe(rem);
    expect(rem).toMatchObject({ zone: 'bench', slot: 3, remMergeTurnsLeft: undefined, attachedTo: undefined });
    // Back with Tag Along ready (its 1-turn wait has long run out).
    expect(skillBlocked(G, '0', rem, haze.iid, 'skill_rem')).toBeNull();
  });

  it('from the lane she returns to the first free bench slot', () => {
    const { G, me, rem } = withRem(0);
    const lash = me.bench[1]!;
    tagAlong(G, rem, lash);
    act(G, '0', { type: 'promoteToActive', benchIid: lash.iid }); // bench: Vindicta, —, Paige
    for (let i = 0; i < 4; i++) nextTurn(G, i % 2 === 0 ? '0' : '1');
    expect(me.bench[1]).toBe(rem);
    expect(rem).toMatchObject({ zone: 'bench', slot: 2 });
    expect(me.active).toBe(lash);
  });

  it('with no free bench slot (she rode from the lane, the bench filled since) she rides on one more turn', () => {
    const { G, me, rem } = withRem(0);
    const lash = me.bench[1]!;
    tagAlong(G, rem, lash);
    act(G, '0', { type: 'promoteToActive', benchIid: lash.iid });
    const yamato = giveCard(G, '0', 'hero_yamato');
    act(G, '0', { type: 'placeHero', cardIid: yamato.iid }); // the slot Lash left
    expect(me.bench.every((b) => b !== null)).toBe(true);
    for (let i = 0; i < 4; i++) nextTurn(G, i % 2 === 0 ? '0' : '1');
    expect(lash.attached).toContain(rem);
    expect(rem.remMergeTurnsLeft).toBe(1);
    expect(G.log.some((l) => l.text === 'Rem has no free bench slot and rides on one more turn.')).toBe(true);
    // A slot frees up: Vindicta falls, and her corpse goes back to the hand at her side's
    // next turn start — after the ride is counted, so Rem rides that turn too, and is back
    // on the bench the turn after.
    const vindicta = me.bench[0]!;
    damageUnit(G, vindicta, 999, 'pure');
    resolve(G);
    vindicta.respawnTurnsLeft = 1;
    nextTurn(G, '0');
    nextTurn(G, '1');
    expect(me.hand).toContain(vindicta);
    expect(me.bench[0]).toBeNull();
    expect(lash.attached).toContain(rem);
    nextTurn(G, '0');
    nextTurn(G, '1');
    expect(me.bench[0]).toBe(rem);
    expect(rem.slot).toBe(1);
    expect(lash.attached ?? []).not.toContain(rem);
  });

  it('when her bearer falls first she jumps back to her bench slot, and stands', () => {
    const { G, me, rem } = withRem(2);
    const haze = me.active!;
    tagAlong(G, rem, haze);
    damageUnit(G, haze, 999, 'pure');
    resolve(G);
    expect(haze.respawnTurnsLeft).toBeGreaterThan(0);
    expect(haze.attached ?? []).not.toContain(rem);
    expect(me.bench[1]).toBe(rem);
    expect(rem).toMatchObject({ zone: 'bench', slot: 2, remMergeTurnsLeft: undefined });
    expect(rem.hp).toBe(rem.hpMax);
    // The lane is the corpse's: a promotion is owed, and Rem may take it.
    expect(G.pendingPromotion).toBe('0');
    expect(stepInCandidates(me)).toContain(rem);
  });

  it('when her bearer falls with no bench slot free she jumps back to the hand', () => {
    const { G, me, rem } = withRem(0);
    const lash = me.bench[1]!;
    tagAlong(G, rem, lash);
    act(G, '0', { type: 'promoteToActive', benchIid: lash.iid });
    act(G, '0', { type: 'placeHero', cardIid: giveCard(G, '0', 'hero_yamato').iid });
    damageUnit(G, lash, 999, 'pure');
    resolve(G);
    expect(lash.attached ?? []).not.toContain(rem);
    expect(me.hand).toContain(rem);
    expect(rem).toMatchObject({ zone: 'hand', remMergeTurnsLeft: undefined, attachedTo: undefined });
    expect(G.log.some((l) => l.text === 'Rem has no free bench slot and jumps back to the hand.')).toBe(true);
  });

  it('while she rides nothing can hit or aim at her, and she uses nothing: no Tag Along, no Naptime', () => {
    const { G, me, rem } = withRem(1);
    rem.level = 2; // Naptime unlocked
    const haze = me.active!;
    tagAlong(G, rem, haze);
    // Not on the board's sweeps, nor among anyone's targets.
    expect(findCardOnBoard(G, rem.iid)).toBeNull();
    expect(liveBoardCards(me)).not.toContain(rem);
    for (const filter of ['anyBoard', 'enemyHero', 'allyHero', 'allyAny'] as const) {
      expect(targetsFor(G, '1', filter)).not.toContain(rem);
      expect(targetsFor(G, '0', filter)).not.toContain(rem);
    }
    // An attack and a spell at every enemy pass her by.
    const hp = rem.hp;
    G.turnNumber = 3; // the rival's turn
    const dynamo = G.players['1'].active = makeHero('hero_dynamo', '1', 'active', 0);
    G.players['1'].souls = 10;
    act(G, '1', { type: 'useSkill', heroIid: dynamo.iid, skillId: 'skill_dynamo' }); // 1 spirit damage to every enemy
    expect(attackTargets(G, '1').map((t) => t.iid)).not.toContain(rem.iid);
    act(G, '1', { type: 'attack' });
    expect(rem.hp).toBe(hp);
    // Back on her side's turn: nothing of hers to use.
    G.turnNumber = 4;
    G.attackUsed = false;
    rem.skillUsedThisTurn = false;
    rem.cooldowns = undefined;
    const hers = legalActions(G, '0').filter((a) => a.type === 'useSkill' && a.heroIid === rem.iid);
    expect(hers).toEqual([]);
    for (const skillId of ['skill_rem', 'eff_ult_rem']) {
      expect(blocked(G, '0', { type: 'useSkill', heroIid: rem.iid, skillId, targetIid: G.players['1'].active!.iid })).toBe('noHero');
      expect(perform(G, '0', { type: 'useSkill', heroIid: rem.iid, skillId, targetIid: G.players['1'].active!.iid })).toBe(INVALID);
    }
  });
});
