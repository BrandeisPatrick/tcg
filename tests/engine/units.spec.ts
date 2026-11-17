/**
 * Units, the mill and Graves (docs/hero-design.md, "Units"; Patrick, 2026-11-16).
 *
 *  - A side drafts 3 heroes; the board keeps its 4 spots, so one is free for a unit.
 *  - A unit is a board card that is no hero: it takes a spot, has Attack and HP,
 *    wears nothing, earns nothing, and destroyed it is gone, paying and pushing
 *    nothing.
 *  - A Ghoul (1 Attack, 1 HP, 1 soul): destroyed, the enemy discards the top card
 *    of its deck. A hero that would be discarded goes back into the deck instead.
 *  - Graves: Grasping Hands (hit, Root, 2 Ghouls into her deck) and Borrowed
 *    Decree (a Gravestone on the bench: a Ghoul a turn, destroyed by any damage).
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { ALL_CARDS, CARDS_BY_ID, HEROES, UNITS } from '@/cards';
import { GHOUL, GRAVESTONE } from '@/cards/units';
import { ULTIMATES } from '@/cards/ultimates';
import { ABILITIES_BY_ID } from '@/abilities';
import { INVALID, perform, type Action } from '@/engine/engine';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { damageUnit } from '@/engine/damage';
import { resolve } from '@/engine/death';
import { millDeck, oweDiscard } from '@/engine/deck';
import { blocked, placeCost, placeHeroBlocked, playBlocked, skillBlocked } from '@/engine/legality';
import { attackPower, heroesOf, isUnit, slottedHeroes, stepInCandidates, structureHp, unitData } from '@/engine/query';
import { allocatorOf } from '@/engine/ids';
import { makeInstance } from '@/engine/instances';
import { SQUAD_SIZE, ULT_WAIT } from '@/engine/constants';
import { freshReadyGame, giveCard, stackDeck } from './_helpers';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';

function nextTurn(G: GameState, pid: PlayerID): PlayerID {
  const next: PlayerID = pid === '0' ? '1' : '0';
  endTurnEffects(G, pid);
  beginTurn(G, next, G.turnNumber + 1 + G.draftTurnsOffset);
  return next;
}
const act = (G: GameState, pid: PlayerID, a: Action) => expect(perform(G, pid, a), JSON.stringify(a)).not.toBe(INVALID);
const ids = (cards: readonly CardInstance[]) => cards.map((c) => c.cardId);

/** P0's turn with Graves on its bench (slot 1, in Vindicta's place), slot 3 empty, every hero tough. */
function withGraves(level: 1 | 3 = 1): { G: GameState; graves: CardInstance; foe: CardInstance } {
  const G = freshReadyGame();
  const graves = makeInstance(allocatorOf(G), 'hero_graves', '0', 'bench', 1);
  graves.level = level;
  graves.cooldowns = undefined;
  G.players['0'].bench[0] = graves;
  G.players['0'].bench[2] = null;
  for (const pid of ['0', '1'] as const) for (const h of heroesOf(G.players[pid])) { h.hpMax = 30; h.hp = 30; }
  return { G, graves, foe: G.players['1'].active! };
}
/** A Ghoul on P0's bench, slot 3 (put there for 1 soul through the engine). */
function ghoulOnBench(G: GameState): CardInstance {
  G.players['0'].bench[2] = null;
  const card = giveCard(G, '0', GHOUL);
  G.players['0'].souls += 1;
  act(G, '0', { type: 'placeHero', cardIid: card.iid });
  return card;
}

describe('squads of three', () => {
  it('a side drafts SQUAD_SIZE (3) heroes; the board still has four spots', () => {
    expect(SQUAD_SIZE).toBe(3);
    const G = freshReadyGame();
    expect(1 + G.players['0'].bench.length).toBe(4);
  });
});

describe('a unit is a board card that is no hero', () => {
  it('the Ghoul and the Gravestone are units: never drafted, never in the catalogue a deck is built from', () => {
    expect(UNITS.map((u) => u.id)).toEqual([GHOUL, GRAVESTONE]);
    for (const u of UNITS) {
      expect(HEROES.some((h) => h.id === u.id), u.id).toBe(false);
      expect(ALL_CARDS.some((c) => c.id === u.id), u.id).toBe(false);
      expect(CARDS_BY_ID[u.id], u.id).toBe(u);
      expect(u.unit, u.id).toBeDefined();
      expect([u.skills, u.ult], u.id).toEqual([[], undefined]);
    }
    expect(CARDS_BY_ID[GHOUL]).toMatchObject({ name: 'Ghoul', atk: 1, hp: 1, unit: { price: 1 } });
    expect(CARDS_BY_ID[GRAVESTONE]).toMatchObject({ name: 'Gravestone', atk: 0, hp: 1, flags: { benchOnly: true } });
  });

  it('a Ghoul is played from the hand onto a free spot for 1 soul; a hero is still free', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.bench[2] = null;
    const ghoul = giveCard(G, '0', GHOUL);
    expect(placeCost(GHOUL)).toBe(1);
    expect(placeCost('hero_yamato')).toBe(0);
    me.souls = 0;
    expect(placeHeroBlocked(G, '0', ghoul.iid)).toBe('souls');
    expect(perform(G, '0', { type: 'placeHero', cardIid: ghoul.iid })).toBe(INVALID);
    me.souls = 3;
    act(G, '0', { type: 'placeHero', cardIid: ghoul.iid });
    expect(me.souls).toBe(2);
    expect(me.bench[2]).toBe(ghoul);
    expect([ghoul.hp, ghoul.hpMax, attackPower(ghoul).total]).toEqual([1, 1, 1]);
    expect(isUnit(ghoul)).toBe(true);
    // With every spot taken there is no room for another.
    const second = giveCard(G, '0', GHOUL);
    expect(placeHeroBlocked(G, '0', second.iid)).toBe('benchFull');
  });

  it('it wears nothing, casts nothing and earns nothing', () => {
    const G = freshReadyGame();
    const ghoul = ghoulOnBench(G);
    G.players['0'].souls = 10;
    const item = giveCard(G, '0', 'extra_health');
    expect(playBlocked(G, '0', item.iid, ghoul.iid)).toBe('noHero');
    const exp = ghoul.exp;
    nextTurn(G, '0'); nextTurn(G, '1');
    expect([ghoul.exp, ghoul.level]).toEqual([exp, 1]);
    // With only a Ghoul standing, no spell can be played.
    for (const h of slottedHeroes(G.players['0'])) if (!isUnit(h)) { h.hp = 0; h.respawnTurnsLeft = 2; }
    const spell = giveCard(G, '0', 'grit');
    expect(playBlocked(G, '0', spell.iid)).toBe('noCaster');
  });

  it('a Ghoul may stand in the lane and swings for 1; the Gravestone never takes it', () => {
    const G = freshReadyGame();
    const ghoul = ghoulOnBench(G);
    expect(stepInCandidates(G.players['0'])).toContain(ghoul);
    G.players['0'].souls = 5;
    act(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: 3 }); // the Active retreats; the Ghoul steps in
    expect(G.players['0'].active).toBe(ghoul);
    const foe = G.players['1'].active!;
    foe.hpMax = 20; foe.hp = 20;
    act(G, '0', { type: 'attack' });
    expect(foe.hp).toBe(19);
    // The Gravestone is bench-only.
    const H = freshReadyGame();
    const stone = makeInstance(allocatorOf(H), GRAVESTONE, '0', 'bench', 3);
    H.players['0'].bench[2] = stone;
    expect(stepInCandidates(H.players['0'])).not.toContain(stone);
    expect(blocked(H, '0', { type: 'moveHero', fromSlot: 0, toSlot: 3 })).not.toBeNull();
  });
});

describe('a unit destroyed is gone: no bounty, no push, no wait', () => {
  it('a Ghoul on the bench: to its owner\'s discard pile, its spot free, and the rival paid and pushed nothing', () => {
    const G = freshReadyGame();
    const ghoul = ghoulOnBench(G);
    const [souls, track, kills] = [G.players['1'].souls, structureHp(G.players['0']), G.record['1'].kills];
    damageUnit(G, ghoul, 1, 'spirit', 'test');
    resolve(G);
    expect(G.players['0'].bench[2]).toBeNull();
    expect(G.players['0'].discard).toContain(ghoul);
    expect([ghoul.zone, ghoul.respawnTurnsLeft]).toEqual(['discard', undefined]);
    expect([G.players['1'].souls, structureHp(G.players['0']), G.record['1'].kills]).toEqual([souls, track, kills]);
    expect(G.players['0'].hand).not.toContain(ghoul);
  });

  it('a Ghoul in the lane: the rival\'s swing kills it, it pushes nothing, and a hero steps up', () => {
    const G = freshReadyGame();
    G.humanSeat = null;                                  // both seats promote on their own
    const ghoul = ghoulOnBench(G);
    G.players['0'].souls = 5;
    act(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: 3 });
    const track = structureHp(G.players['0']);
    nextTurn(G, '0');
    act(G, '1', { type: 'attack' });
    expect(G.players['0'].discard).toContain(ghoul);
    expect(structureHp(G.players['0'])).toBe(track);
    expect(G.players['0'].active && !isUnit(G.players['0'].active)).toBe(true);
  });
});

describe('the Ghoul\'s death: the enemy discards the top card of its deck', () => {
  it('one card, off the top, to the rival\'s own discard pile', () => {
    const G = freshReadyGame();
    const ghoul = ghoulOnBench(G);
    const [top, next] = stackDeck(G, '1', ['cold_front', 'extra_health']);
    damageUnit(G, ghoul, 3, 'attack', 'test');
    resolve(G);
    expect(G.players['1'].discard).toEqual([top]);
    expect(top.zone).toBe('discard');
    expect(G.players['1'].deck[G.players['1'].deck.length - 1]).toBe(next);
    expect(unitData(ghoul)?.unit?.death).toBe('passive_ghoul');
  });

  it('an empty deck gives nothing; a Gravestone destroyed discards nothing', () => {
    const G = freshReadyGame();
    const ghoul = ghoulOnBench(G);
    damageUnit(G, ghoul, 1, 'spirit', 'test');
    resolve(G);
    expect(G.players['1'].discard).toEqual([]);
    const H = freshReadyGame();
    stackDeck(H, '1', ['cold_front']);
    const stone = makeInstance(allocatorOf(H), GRAVESTONE, '0', 'bench', 3);
    H.players['0'].bench[2] = stone;
    damageUnit(H, stone, 1, 'spirit', 'test');
    resolve(H);
    expect(H.players['0'].discard).toContain(stone);
    expect(H.players['1'].discard).toEqual([]);
  });
});

describe('a hero is never discarded: it goes back into the deck, which is shuffled', () => {
  it('milled off the top of a deck', () => {
    const G = freshReadyGame();
    stackDeck(G, '1', ['hero_yamato', 'cold_front', 'extra_health', 'grit']);
    const gone = millDeck(G, '1', 1, 'test');
    expect(gone).toEqual([]);
    expect(ids(G.players['1'].deck).sort()).toEqual(['cold_front', 'extra_health', 'grit', 'hero_yamato']);
    expect(G.players['1'].discard).toEqual([]);
    expect(G.log.some((l) => l.text.includes('goes back into'))).toBe(true);
  });

  it('a Ghoul milled is discarded like any card: only a hero proper is kept', () => {
    const G = freshReadyGame();
    const [g] = stackDeck(G, '1', [GHOUL, 'grit']);
    expect(millDeck(G, '1', 1, 'test')).toEqual([g]);
  });

  it('discarded from the hand to a discard owed (the engine\'s step, which no card asks for since 2026-11-16)', () => {
    const G = freshReadyGame();
    const hero = giveCard(G, '0', 'hero_yamato');
    giveCard(G, '0', 'grit');
    oweDiscard(G, '0', 1, 'golden_goose_egg');
    act(G, '0', { type: 'discard', cardIids: [hero.iid] });
    expect(G.players['0'].deck).toContain(hero);
    expect(hero.zone).toBe('deck');
    expect(G.players['0'].discard).not.toContain(hero);
    expect(G.pendingDiscard).toBeUndefined();
  });

  it('a hero back from a fall still wears its items in the hand: they are discarded, and it goes into the deck carrying nothing', () => {
    const G = freshReadyGame();
    G.players['0'].souls = 4;
    const hero = giveCard(G, '0', 'hero_yamato');
    // The item it wore when it fell: taken out of the hand and put on it.
    const worn = giveCard(G, '0', 'extra_health');
    G.players['0'].hand = G.players['0'].hand.filter((c) => c !== worn);
    Object.assign(worn, { zone: 'attached', attachedTo: hero.iid });
    hero.attached = [worn];
    oweDiscard(G, '0', 1, 'golden_goose_egg');
    act(G, '0', { type: 'discard', cardIids: [hero.iid] });
    expect(hero.zone).toBe('deck');
    expect(hero.attached ?? []).toEqual([]);
    expect(G.players['0'].discard.map((c) => c.iid)).toContain(worn.iid);
    expect(worn.zone).toBe('discard');
  });
});

describe('Graves', () => {
  it('her card: Deadlock\'s names, a skill that waits 4, a small ultimate of 15 words or fewer', () => {
    expect(CARDS_BY_ID.hero_graves).toMatchObject({ name: 'Graves', atk: 1, hp: 5, retreat: 1, skills: ['skill_graves'], ult: 'eff_ult_graves' });
    const skill = ABILITIES_BY_ID.skill_graves as { name?: string; cooldown?: number; target: string };
    expect([skill.name, skill.cooldown, skill.target]).toEqual(['Grasping Hands', 4, 'enemyActive']);
    const ult = ULTIMATES.find((u) => u.id === 'ult_graves')!;
    expect([ult.name, ult.size, ult.linkedHero]).toEqual(['Borrowed Decree', 'small', 'hero_graves']);
    expect((ult.text ?? '').split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it('Grasping Hands: 1 + Spirit to the enemy Active, Rooted 1 turn, and 2 Ghouls shuffled into her own deck', () => {
    const { G, graves, foe } = withGraves();
    stackDeck(G, '0', ['grit', 'cold_front', 'extra_health']);
    act(G, '0', { type: 'useSkill', heroIid: graves.iid, targetIid: foe.iid });
    expect(foe.hp).toBe(29);
    expect(foe.statuses.find((s) => s.id === 'rooted')).toMatchObject({ duration: 1 });
    const deck = G.players['0'].deck;
    expect(deck).toHaveLength(5);
    expect(ids(deck).filter((id) => id === GHOUL)).toHaveLength(2);
    expect(deck.every((c) => c.zone === 'deck' && c.ownerId === '0')).toBe(true);
    expect(G.players['1'].deck).toHaveLength(0);
    expect(graves.cooldowns?.skill_graves).toBe(4);
    // A Ghoul drawn is a card of the hand, played for its soul.
    const ghoul = deck.find((c) => c.cardId === GHOUL)!;
    G.players['0'].deck = deck.filter((c) => c !== ghoul);
    ghoul.zone = 'hand';
    G.players['0'].hand.push(ghoul);
    G.players['0'].souls = 1;
    act(G, '0', { type: 'placeHero', cardIid: ghoul.iid });
    expect(G.players['0'].bench[2]).toBe(ghoul);
  });

  it('Borrowed Decree needs a free spot: with her bench full it cannot be used', () => {
    const { G, graves } = withGraves(ULT_UNLOCK_LEVEL);
    const use: Action = { type: 'useSkill', heroIid: graves.iid, skillId: 'eff_ult_graves' };
    expect(skillBlocked(G, '0', graves, undefined, 'eff_ult_graves')).toBeNull();
    G.players['0'].bench[2] = makeInstance(allocatorOf(G), 'hero_yamato', '0', 'bench', 3);
    expect(skillBlocked(G, '0', graves, undefined, 'eff_ult_graves')).not.toBeNull();
    expect(perform(G, '0', use)).toBe(INVALID);
  });

  it('it raises a Gravestone on her bench: a Ghoul into her deck at the start of each of her turns, and its wait is a small ultimate\'s', () => {
    const { G, graves } = withGraves(ULT_UNLOCK_LEVEL);
    act(G, '0', { type: 'useSkill', heroIid: graves.iid, skillId: 'eff_ult_graves' });
    const stone = G.players['0'].bench[2]!;
    expect([stone.cardId, stone.hp, stone.zone, stone.slot]).toEqual([GRAVESTONE, 1, 'bench', 3]);
    expect(graves.cooldowns?.eff_ult_graves).toBe(ULT_WAIT.small);
    expect(G.players['0'].deck).toHaveLength(0);
    nextTurn(G, '0');                                   // the rival's turn: nothing yet
    expect(ids(G.players['0'].deck)).toEqual([]);
    nextTurn(G, '1');                                   // her turn: one Ghoul (drawn at once: the deck held nothing else)
    const mine = [...G.players['0'].deck, ...G.players['0'].hand];
    expect(ids(mine).filter((id) => id === GHOUL)).toHaveLength(1);
    nextTurn(G, '0'); nextTurn(G, '1');                 // and another
    expect(ids([...G.players['0'].deck, ...G.players['0'].hand]).filter((id) => id === GHOUL)).toHaveLength(2);
  });

  it('any damage destroys the Gravestone, and the Ghouls stop', () => {
    const { G, graves } = withGraves(ULT_UNLOCK_LEVEL);
    act(G, '0', { type: 'useSkill', heroIid: graves.iid, skillId: 'eff_ult_graves' });
    const stone = G.players['0'].bench[2]!;
    nextTurn(G, '0');
    // The rival's Kelvin throws a Frost Grenade, 1 to every enemy: the stone goes. (Lash's
    // Ground Strike hit every enemy until 2026-11-17; it now lands on the Active alone.)
    const kelvin = makeInstance(allocatorOf(G), 'hero_kelvin', '1', 'bench', 1);
    G.players['1'].bench[0] = kelvin;
    act(G, '1', { type: 'useSkill', heroIid: kelvin.iid });
    expect(G.players['0'].bench[2]).toBeNull();
    expect(G.players['0'].discard).toContain(stone);
    nextTurn(G, '1');
    expect(ids([...G.players['0'].deck, ...G.players['0'].hand]).filter((id) => id === GHOUL)).toHaveLength(0);
  });
});
