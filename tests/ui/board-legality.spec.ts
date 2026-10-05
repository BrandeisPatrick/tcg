import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { INVALID, perform, type Action } from '@/engine/engine';
import {
  attackBlocked, cardCost, moveBlocked, playBlocked, skillBlocked,
  type AttackBlock, type MoveBlock, type PlayBlock, type PromoteBlock, type SkillBlock,
} from '@/engine/legality';
import { MAX_EQUIPMENT_PER_HERO, RETREAT_COST, SKILL_COST } from '@/engine/constants';
import { addStatus } from '@/engine/statusOps';
import { STATUSES } from '@/statuses';
import { CARDS_BY_ID } from '@/cards';
import { isValidTarget } from '@/ui/board/targeting';
import {
  actionRefusal, attackBlockReason, moveBlockReason, playBlockReason, promoteBlockReason, skillBlockReason,
} from '@/ui/board/heroActions';
import { statusClass } from '@/ui/card/StatusIcon';
import type { PendingPlay } from '@/ui/helpers';
import { freshReadyGame, nextTestIid } from '../engine/_helpers';

// The board lights the heroes the armed card may be aimed at, and says why a
// move was refused, by asking the engine (`playBlocked` / `skillBlocked` /
// `blocked`) — never by its own copy of the rules. These pin the UI to the
// engine over the boards the old copies got wrong: a corpse on the rival's
// bench, a hero already wearing the item, a hero at the equipment cap, a free
// copied ultimate, a stunned hero.

const ME: PlayerID = '0';

/** A card instance for the hand (or the bearer's gear), as the engine builds one. */
function instance(cardId: string, over: Partial<CardInstance> = {}): CardInstance {
  return {
    iid: nextTestIid('ui'), cardId, ownerId: ME, zone: 'hand', attached: [],
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
    ...over,
  };
}

/** P0 = Haze (Active), Vindicta / Lash / Paige on the bench, an empty hand and
 *  souls to spare; P1 = Abrams (Active), Dynamo / Kelvin / Seven. */
function board(): GameState {
  const G = freshReadyGame();
  G.players[ME].hand = [];
  G.players[ME].souls = 10;
  return G;
}

const give = (G: GameState, cardId: string, over: Partial<CardInstance> = {}) => {
  const card = instance(cardId, over);
  G.players[ME].hand.push(card);
  return card;
};
const wear = (hero: CardInstance, cardId: string) => {
  const item = instance(cardId, { zone: 'equipment', attachedTo: hero.iid });
  hero.attached = [...(hero.attached ?? []), item];
  return item;
};
const heroesOf = (G: GameState): CardInstance[] =>
  (['0', '1'] as PlayerID[]).flatMap((pid) => [G.players[pid].active, ...G.players[pid].bench].filter((c): c is CardInstance => !!c));
const nameOf = (c: CardInstance) => CARDS_BY_ID[c.cardId]?.name ?? c.cardId;
const armed = (card: CardInstance): PendingPlay => ({ kind: 'playCard', iid: card.iid, title: nameOf(card), desc: '', filter: 'anyBoard' });
const armedSkill = (hero: CardInstance): PendingPlay => ({ kind: 'useSkill', iid: hero.iid, title: nameOf(hero), desc: '', filter: 'anyBoard' });

/** Would the engine's front door take `a` as it stands? (A copy, so nothing is spent.) */
function taken(G: GameState, a: Action): boolean {
  return perform(structuredClone(G), ME, a) !== INVALID;
}

/** The UI glows `target` for the armed card exactly when the engine would take
 *  the play on it: straight away, or — a hero at the cap — once an item to
 *  replace is named. */
function expectGlowMatchesEngine(G: GameState, card: CardInstance, label: string) {
  for (const target of heroesOf(G)) {
    const worn = target.attached ?? [];
    const discardIid = worn.length >= MAX_EQUIPMENT_PER_HERO ? worn[0].iid : undefined;
    const engine = taken(G, { type: 'playCard', cardIid: card.iid, targetIid: target.iid, discardIid });
    expect(isValidTarget(G, ME, armed(card), target), `${label}: ${nameOf(card)} on ${nameOf(target)}`).toBe(engine);
  }
}

describe('the glow on the tiles is the engine\'s answer', () => {
  it('a spell for rivals: never a corpse, never an ally', () => {
    const G = board();
    const hex = give(G, 'slowing_hex'); // any rival
    const corpse = G.players['1'].bench[0]!;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    expectGlowMatchesEngine(G, hex, 'a corpse on the rival bench');
    expect(isValidTarget(G, ME, armed(hex), corpse)).toBe(false);
    expect(isValidTarget(G, ME, armed(hex), G.players['1'].active!)).toBe(true);
    expect(isValidTarget(G, ME, armed(hex), G.players[ME].active!)).toBe(false);
  });

  it('a spell for allies skips your own corpse too', () => {
    const G = board();
    const rite = give(G, 'healing_rite'); // ally hero
    const down = G.players[ME].bench[2]!;
    down.hp = 0; down.respawnTurnsLeft = 1;
    expectGlowMatchesEngine(G, rite, 'a corpse on your own bench');
    expect(isValidTarget(G, ME, armed(rite), down)).toBe(false);
    expect(isValidTarget(G, ME, armed(rite), G.players[ME].active!)).toBe(true);
  });

  it('an Active-only spell reaches the rival Active and nothing else', () => {
    const G = board();
    const barrel = give(G, 'rusted_barrel');
    expectGlowMatchesEngine(G, barrel, 'enemy Active');
    expect(heroesOf(G).filter((h) => isValidTarget(G, ME, armed(barrel), h)).map((h) => h.iid)).toEqual([G.players['1'].active!.iid]);
  });

  it('gear goes on your living heroes only', () => {
    const G = board();
    const item = give(G, 'extended_magazine');
    G.players[ME].bench[0]!.hp = 0; G.players[ME].bench[0]!.respawnTurnsLeft = 2;
    expectGlowMatchesEngine(G, item, 'gear');
    expect(isValidTarget(G, ME, armed(item), G.players['1'].active!)).toBe(false);
  });

  it('an ally already wearing the item does not glow, and the refusal names them', () => {
    const G = board();
    const item = give(G, 'extended_magazine');
    const haze = G.players[ME].active!;
    wear(haze, 'extended_magazine');
    expectGlowMatchesEngine(G, item, 'a duplicate');
    expect(isValidTarget(G, ME, armed(item), haze)).toBe(false);
    expect(isValidTarget(G, ME, armed(item), G.players[ME].bench[0]!)).toBe(true);
    expect(playBlocked(G, ME, item.iid, haze.iid)).toBe('duplicate');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: item.iid, targetIid: haze.iid })).toEqual({
      code: 'duplicate', text: 'Haze already wears Extended Magazine',
    });
  });

  it('a hero at the cap still glows: the replace chooser takes it from there', () => {
    const G = board();
    const item = give(G, 'extended_magazine');
    const haze = G.players[ME].active!;
    for (const id of ['extra_health', 'extra_spirit', 'extra_regen']) wear(haze, id);
    expect(haze.attached).toHaveLength(MAX_EQUIPMENT_PER_HERO);
    expectGlowMatchesEngine(G, item, 'a full hero');
    expect(isValidTarget(G, ME, armed(item), haze)).toBe(true);
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: item.iid, targetIid: haze.iid })?.code).toBe('full');
    // …and once the chooser names an item the engine takes it.
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: item.iid, targetIid: haze.iid, discardIid: haze.attached![0].iid })).toBeNull();
  });

  it('a full hero already wearing the item is a duplicate before it is full', () => {
    const G = board();
    const item = give(G, 'extended_magazine');
    const haze = G.players[ME].active!;
    for (const id of ['extended_magazine', 'extra_spirit', 'extra_regen']) wear(haze, id);
    expect(isValidTarget(G, ME, armed(item), haze)).toBe(false);
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: item.iid, targetIid: haze.iid })?.code).toBe('duplicate');
  });

  it('a stunned hero cannot be aimed with a skill, but can still wear gear', () => {
    const G = board();
    const lash = G.players[ME].bench[1]!; // skill: any rival
    addStatus(G, lash, 'stun', 1, 1);
    expect(skillBlocked(G, ME, lash)).toBe('status');
    for (const target of heroesOf(G)) {
      expect(isValidTarget(G, ME, armedSkill(lash), target), nameOf(target)).toBe(false);
    }
    expect(actionRefusal(G, ME, { type: 'useSkill', heroIid: lash.iid, targetIid: G.players['1'].active!.iid })).toEqual({
      code: 'status', text: 'Cannot use skill (status)',
    });
    const item = give(G, 'extended_magazine');
    expect(isValidTarget(G, ME, armed(item), lash)).toBe(true);
  });

  it('a ready skill glows exactly what the engine takes', () => {
    const G = board();
    const lash = G.players[ME].bench[1]!;
    const dynamoCorpse = G.players['1'].bench[0]!;
    dynamoCorpse.hp = 0; dynamoCorpse.respawnTurnsLeft = 2;
    for (const target of heroesOf(G)) {
      const engine = taken(G, { type: 'useSkill', heroIid: lash.iid, targetIid: target.iid });
      expect(isValidTarget(G, ME, armedSkill(lash), target), nameOf(target)).toBe(engine);
    }
    expect(isValidTarget(G, ME, armedSkill(lash), dynamoCorpse)).toBe(false);
    expect(actionRefusal(G, ME, { type: 'useSkill', heroIid: lash.iid, targetIid: dynamoCorpse.iid })?.text)
      .toBe("Not a valid target for Lash's skill");
  });

  it('nothing is a target while nothing is armed, or once the armed card has left the hand', () => {
    const G = board();
    const hex = give(G, 'slowing_hex');
    expect(isValidTarget(G, ME, null, G.players['1'].active!)).toBe(false);
    G.players[ME].hand = [];
    expect(isValidTarget(G, ME, armed(hex), G.players['1'].active!)).toBe(false);
  });
});

describe('what a card costs is the engine\'s answer', () => {
  it('Sinclair\'s copied ultimate is free: 0 souls, playable with none', () => {
    const G = board();
    G.players[ME].souls = 0;
    const copy = give(G, 'ult_abrams', { costOverride: 0 });
    expect(cardCost(copy)).toBe(0);
    expect(playBlocked(G, ME, copy.iid)).toBeNull();
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: copy.iid })).toBeNull();
    expect(taken(G, { type: 'playCard', cardIid: copy.iid })).toBe(true);
  });

  it('the same ultimate without the override costs its printed price, and says so', () => {
    const G = board();
    G.players[ME].souls = 0;
    const real = give(G, 'ult_abrams');
    expect(cardCost(real)).toBe((CARDS_BY_ID.ult_abrams as { cost: number }).cost);
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: real.iid })).toEqual({
      code: 'souls', text: `Need ${cardCost(real)} souls — you have 0`,
    });
    expect(taken(G, { type: 'playCard', cardIid: real.iid })).toBe(false);
  });
});

describe('a refused move is said, with the engine\'s own code', () => {
  it('a card dropped on a corpse is refused for its target', () => {
    const G = board();
    const hex = give(G, 'slowing_hex');
    const corpse = G.players['1'].bench[0]!;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: hex.iid, targetIid: corpse.iid })).toEqual({
      code: 'target', text: 'Not a valid target for Slowing Hex',
    });
  });

  it('gear thrown at a rival is refused', () => {
    const G = board();
    const item = give(G, 'extended_magazine');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: item.iid, targetIid: G.players['1'].active!.iid })?.code).toBe('target');
  });

  it('a card that needs a target, played with none named, is refused for its target', () => {
    const G = board();
    const hex = give(G, 'slowing_hex');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: hex.iid })?.code).toBe('target');
  });

  it('a retreat without the souls says what it costs', () => {
    const G = board();
    G.players[ME].souls = RETREAT_COST - 1;
    expect(moveBlocked(G, ME, 1, 0)).toBe('souls');
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toEqual({
      code: 'souls', text: `Need ${RETREAT_COST} souls`,
    });
  });

  it('a skill without the soul says so', () => {
    const G = board();
    G.players[ME].souls = SKILL_COST - 1;
    const lash = G.players[ME].bench[1]!;
    expect(actionRefusal(G, ME, { type: 'useSkill', heroIid: lash.iid, targetIid: G.players['1'].active!.iid })?.text)
      .toBe(`Need ${SKILL_COST} soul`);
  });

  it('while a promotion is owed, everything else waits for it', () => {
    const G = board();
    const rite = give(G, 'healing_rite');
    const active = G.players[ME].active!;
    active.hp = 0; active.respawnTurnsLeft = 3; active.statuses = [];
    G.pendingPromotion = ME;
    const wait = { code: 'promotionOwed', text: 'Choose who steps up first' };
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: rite.iid, targetIid: G.players[ME].bench[0]!.iid })).toEqual(wait);
    expect(actionRefusal(G, ME, { type: 'endTurn' })).toEqual(wait);
    expect(actionRefusal(G, ME, { type: 'promoteToActive', benchIid: G.players[ME].bench[0]!.iid })).toBeNull();
  });

  it('a move the engine takes is not refused', () => {
    const G = board();
    const rite = give(G, 'healing_rite');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: rite.iid, targetIid: G.players[ME].active!.iid })).toBeNull();
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toBeNull();
    expect(attackBlocked(G, ME)).toBeNull();
    expect(actionRefusal(G, ME, { type: 'attack' })).toBeNull();
  });
});

// The wording has a line for every code the engine can answer with. Each record
// below is keyed by the engine's own union, so a code added there is a compile
// error here until it is worded.
describe('every block code has words', () => {
  const skill: Record<SkillBlock, true> = { noSkill: true, down: true, used: true, attacked: true, status: true, souls: true, target: true };
  const attack: Record<AttackBlock, true> = { turn1: true, used: true, skill: true, noActive: true, cannot: true, noTarget: true };
  const play: Record<PlayBlock, true> = { notInHand: true, souls: true, target: true, duplicate: true, full: true, discard: true };
  const move: Record<MoveBlock, true> = { same: true, empty: true, benchOnly: true, down: true, souls: true, illegal: true };
  const promote: Record<PromoteBlock, true> = { notOnBench: true, notOwed: true, down: true, benchOnly: true };

  it('skills: all but noSkill (nothing to say: there is no skill to offer)', () => {
    for (const code of Object.keys(skill) as SkillBlock[]) {
      if (code === 'noSkill') expect(skillBlockReason(code)).toBe('');
      else expect(skillBlockReason(code).length, code).toBeGreaterThan(0);
    }
  });

  it('attacks', () => {
    for (const code of Object.keys(attack) as AttackBlock[]) expect(attackBlockReason(code, null).length, code).toBeGreaterThan(0);
  });

  it('plays, with and without a named hero', () => {
    for (const code of Object.keys(play) as PlayBlock[]) {
      expect(playBlockReason(code, { card: 'Extended Magazine', cost: 2 }).length, code).toBeGreaterThan(0);
      expect(playBlockReason(code, { card: 'Extended Magazine', hero: 'Haze', cost: 2, have: 1 }).length, code).toBeGreaterThan(0);
    }
    // The ones about a hero name the hero.
    for (const code of ['duplicate', 'full', 'discard'] as const) {
      expect(playBlockReason(code, { card: 'Extended Magazine', hero: 'Haze', cost: 2 }), code).toContain('Haze');
    }
  });

  it('swaps and promotions', () => {
    for (const code of Object.keys(move) as MoveBlock[]) expect(moveBlockReason(code).length, code).toBeGreaterThan(0);
    for (const code of Object.keys(promote) as PromoteBlock[]) expect(promoteBlockReason(code).length, code).toBeGreaterThan(0);
  });
});

describe('a status chip wears the colour its definition says', () => {
  it('buffs above 0, debuffs below, the rest neutral — sleep and reverb are debuffs', () => {
    for (const s of STATUSES) {
      expect(statusClass(s.id), s.id).toBe(s.hvalue > 0 ? 'buff' : s.hvalue < 0 ? 'debuff' : 'utility');
    }
    expect(statusClass('sleep')).toBe('debuff');
    expect(statusClass('reverb')).toBe('debuff');
    expect(statusClass('shield')).toBe('buff');
    expect(statusClass('siphon_drain')).toBe('utility');
  });
});
