import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INVALID_MOVE } from 'boardgame.io/core';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { ABILITIES_BY_ID, type AbilityDef, type HeroAbilityDef } from '@/abilities';
import { CARDS_BY_ID } from '@/cards';
import { AI_DECKS_BY_NAME } from '@/decks/aiDecks';
import { STARTER_DECK_AI } from '@/decks/starter';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { CC_STATUSES, DEBUFF_IDS, STATUSES_BY_ID } from '@/statuses';
import { enumerateAIMoves } from '@/ai/heuristic';
import { FIXATION_CAP, MAX_HAND, RETREAT_COST, SOULS_MAX } from '@/engine/constants';
import { attackAll } from '@/engine/actions/attack';
import { promoteToActive, pullToActive, swapIntoActive } from '@/engine/actions/board';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { returnToHand } from '@/engine/deckOps';
import { damageUnit, healUnit } from '@/engine/damage';
import { autoPromoteAi, awardSouls, resolve } from '@/engine/death';
import { INVALID, perform } from '@/engine/engine';
import { forecastAttack } from '@/engine/forecast';
import { DeadlockGame } from '@/engine/game';
import {
  attackBlocked, attackTargets, blocked, legalActions, moveBlocked, playBlocked, promoteBlocked, skillBlocked, skillTargets,
} from '@/engine/legality';
import { pushLog } from '@/engine/log';
import {
  attackPower, effectiveAtk, findCardOnBoard, hasReach, isBlocked, isRespawning, isUntargetable, targetsFor,
} from '@/engine/query';
import { registerAbilities } from '@/engine/registry';
import { addStatus, leaveActive, tickCastingPulses, tickEndOfTurnCC, tickStartOfTurn } from '@/engine/statusOps';
import type { CardInstance, GameState, HeroCard, PlayerID, SwingFx } from '@/engine/types';
import { actionRefusal, attackBlockReason, moveBlockReason, skillBlockReason } from '@/ui/board/heroActions';
import { freshReadyGame, makeHero } from './_helpers';

// The primitives the new hero kits are built from — an attack that names its
// target, Fixation, Dome, Rooted, Rabbit, Last Stand, a pull, a swap-in, HP as a
// cost, souls and a card back in hand. No card of the real roster uses them yet,
// so each is played here on throwaway heroes and abilities registered for this
// file (the real roster is left as it is; replay-trace.ts proves the game plays
// the same). One describe per primitive.

const REACHER = 'hero_test_reacher'; // passive Long Arm: its attack may be aimed at any enemy hero
const FIXER = 'hero_test_fixer';     // passive Fixed Eye: +1 to its swing per Fixation stack on the hero it swings at
const TALLY = 'hero_test_tally';     // passive Tally: remembers every swing it follows through
const PAYER = 'hero_test_payer';     // skill Blood Price: pays 2 HP for 2 spirit damage
const CALM = 'hero_test_calm';       // passive Calm: heals 2 at the end of its owner's turn
const LONG_BARREL = 'test_long_barrel'; // gear whose ability has reach

const longArm: HeroAbilityDef = {
  id: 'test_passive_long_arm', name: 'Long Arm', text: 'Its attack may be aimed at any enemy hero.',
  trigger: 'ongoing', target: 'self', reach: true, run: () => {},
};
const fixedEye: HeroAbilityDef = {
  id: 'test_passive_fixed_eye', name: 'Fixed Eye', text: '+1 Bullet Power per Fixation stack on the hero it swings at.',
  trigger: 'ongoing', target: 'self',
  attackBonus: (_self, target) => {
    const stacks = target?.statuses.find((s) => s.id === 'fixation')?.value ?? 0;
    return stacks > 0 ? { amount: stacks, label: `Fixation: +${stacks}` } : null;
  },
  run: () => {},
};
const swungAt: string[] = [];
const tally: HeroAbilityDef = {
  id: 'test_passive_tally', name: 'Tally', text: 'Counts its swings.',
  trigger: 'onAttack', target: 'self',
  run: (_G, _ctx, { target }) => { if (target) swungAt.push(target.iid); },
};
const bloodPrice: HeroAbilityDef = {
  id: 'test_skill_blood_price', name: 'Blood Price', text: 'Pay 2 HP: 2 spirit dmg to the enemy Active.',
  trigger: 'activate', target: 'enemyActive', hpCost: 2, base: 2,
  run: (G, _ctx, { target }) => { if (target) damageUnit(G, target, 2, 'spirit'); },
};
const gearReach: AbilityDef = {
  id: 'test_gear_reach', trigger: 'ongoing', target: 'self', reach: true, run: () => {},
};
const calm: HeroAbilityDef = {
  id: 'test_passive_calm', name: 'Calm', text: 'Heals 2 at the end of its owner\'s turn.',
  trigger: 'endOfTurn', target: 'self',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 2, 'Calm'); },
};

const throwaway = (id: string, name: string, over: Partial<HeroCard> = {}): HeroCard =>
  ({ id, name, type: 'hero', rarity: 3, atk: 3, hp: 12, skills: [], ...over });

beforeAll(() => {
  registerAbilities([longArm, fixedEye, tally, bloodPrice, gearReach, calm]);
  CARDS_BY_ID[LONG_BARREL] = { id: LONG_BARREL, name: 'Long Barrel', type: 'equipment', rarity: 2, tier: 2, abilities: [gearReach.id] };
  CARDS_BY_ID[REACHER] = throwaway(REACHER, 'Reacher', { passives: [longArm.id] });
  CARDS_BY_ID[FIXER] = throwaway(FIXER, 'Fixer', { passives: [fixedEye.id] });
  CARDS_BY_ID[TALLY] = throwaway(TALLY, 'Tally', { passives: [tally.id] });
  CARDS_BY_ID[PAYER] = throwaway(PAYER, 'Payer', { skills: [bloodPrice.id] });
  CARDS_BY_ID[CALM] = throwaway(CALM, 'Calm', { passives: [calm.id] });
});
afterAll(() => {
  for (const id of [REACHER, FIXER, TALLY, PAYER, CALM, LONG_BARREL]) delete CARDS_BY_ID[id];
});
beforeEach(() => { swungAt.length = 0; });

/** Make a move on `G` the way the boardgame.io game would (INVALID_MOVE for a refusal). */
function runMove(name: string, G: GameState, pid: PlayerID, ...args: unknown[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}
const ctxFor = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as unknown as Ctx;

/** Put a piece of gear on a hero. */
function wear(bearer: CardInstance, cardId: string): CardInstance {
  const eq: CardInstance = {
    iid: `eq-${cardId}-${bearer.iid}`, cardId, ownerId: bearer.ownerId, zone: 'equipment',
    attachedTo: bearer.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
  };
  (bearer.attached ??= []).push(eq);
  return eq;
}

/** P0's Active is `cardId` (atk 3), with souls to spare; the rival side (Abrams, then Dynamo / Kelvin / Seven)
 *  stands 30 deep, so a swing is read off its HP. Turn 2: P0 may attack. */
function duel(cardId: string) {
  const G = freshReadyGame();
  const me = G.players['0'];
  me.souls = 10;
  const atk = makeHero(cardId, '0', 'active', 0);
  me.active = atk;
  const foe = G.players['1'];
  for (const c of [foe.active!, ...foe.bench]) if (c) c.hp = c.hpMax = 30;
  const foes = [foe.active!, ...foe.bench] as CardInstance[];
  return { G, me, atk, foe, foes, rival: foes[0] };
}

const swingsOf = (G: GameState) => G.fx.filter((e): e is SwingFx => e.kind === 'swing');
const has = (c: CardInstance, id: string) => c.statuses.some((s) => s.id === id);
const status = (c: CardInstance, id: string) => c.statuses.find((s) => s.id === id);
const snapshot = (G: GameState) => JSON.stringify(G);

// ---------------------------------------------------------------------------

describe('the new statuses', () => {
  it('are defined as the rules word them', () => {
    expect(STATUSES_BY_ID.fixation).toMatchObject({
      title: 'Fixation', desc: 'Takes +<value> from the attacker fixed on it.', hvalue: -1,
      stack: { add: true, cap: 3, duration: 'reset' }, clearOnLeaveActive: true,
    });
    expect(FIXATION_CAP).toBe(3);
    expect(STATUSES_BY_ID.dome).toMatchObject({ title: 'Dome', desc: 'Cannot be the target of an attack.', hvalue: 2, untargetable: ['attack'] });
    expect(STATUSES_BY_ID.rooted).toMatchObject({ title: 'Rooted', desc: 'Cannot retreat or be swapped.', hvalue: -1, blocks: ['move'], cc: true });
    expect(STATUSES_BY_ID.rabbit).toMatchObject({
      title: 'Rabbit', desc: 'Hexed into a rabbit: cannot attack or use skills.', hvalue: -2, blocks: ['attack', 'skill', 'pulse'], cc: true,
    });
    expect(STATUSES_BY_ID.last_stand).toMatchObject({
      title: 'Last Stand', desc: 'Goes off at the start of your turn: <value> spirit to all enemies.', hvalue: 1,
    });
  });

  it('are buffs or debuffs, and crowd control or not, as their definitions say (the derived sets follow)', () => {
    for (const id of ['fixation', 'rooted', 'rabbit']) expect(DEBUFF_IDS.has(id), id).toBe(true);
    for (const id of ['dome', 'last_stand']) expect(DEBUFF_IDS.has(id), id).toBe(false);
    for (const id of ['rooted', 'rabbit']) expect(CC_STATUSES.has(id), id).toBe(true);
    for (const id of ['fixation', 'dome', 'last_stand']) expect(CC_STATUSES.has(id), id).toBe(false);
  });

  it('only Dome keeps its bearer from being attacked, and only Rooted from moving', () => {
    const G = freshReadyGame();
    const c = G.players['1'].active!;
    expect(isUntargetable(c, 'attack')).toBe(false);
    expect(isBlocked(c, 'move')).toBe(false);
    for (const id of ['stun', 'silenced', 'disarm', 'sleep', 'rabbit', 'fixation', 'last_stand']) {
      c.statuses = [{ id, value: 1, duration: 2 }];
      expect(isUntargetable(c, 'attack'), id).toBe(false);
      expect(isBlocked(c, 'move'), id).toBe(false); // a Stun does not root its bearer
    }
    c.statuses = [{ id: 'dome', value: 1, duration: 1 }];
    expect(isUntargetable(c, 'attack')).toBe(true);
    expect(isBlocked(c, 'move')).toBe(false);
    expect(isBlocked(c, 'attack') || isBlocked(c, 'skill')).toBe(false); // it does not stop the bearer acting
    c.statuses = [{ id: 'rooted', value: 1, duration: 1 }];
    expect(isBlocked(c, 'move')).toBe(true);
    expect(isBlocked(c, 'attack') || isBlocked(c, 'skill')).toBe(false); // …and a rooted hero still fights
    expect(isUntargetable(c, 'attack')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Fixation', () => {
  it('stacks up to 3 and starts its timer over with every stack', () => {
    const G = freshReadyGame();
    const foe = G.players['1'].active!;
    addStatus(G, foe, 'fixation', 1, 99);
    expect(status(foe, 'fixation')).toMatchObject({ value: 1, duration: 99 });
    expect(G.log.at(-1)!.text).toBe('Abrams suffered Fixation 1.');
    addStatus(G, foe, 'fixation', 1, 99);
    addStatus(G, foe, 'fixation', 1, 99);
    expect(status(foe, 'fixation')!.value).toBe(3);
    addStatus(G, foe, 'fixation', 1, 99); // a fourth stack goes over the cap…
    addStatus(G, foe, 'fixation', 5, 99); // …and so does a big one
    expect(status(foe, 'fixation')!.value).toBe(FIXATION_CAP);
    expect(foe.statuses.filter((s) => s.id === 'fixation')).toHaveLength(1);
    // The timer is the newest stack's, not the longer of the two.
    addStatus(G, foe, 'fixation', 1, 4);
    expect(status(foe, 'fixation')!.duration).toBe(4);
  });

  it('ends when its bearer leaves the Active slot — a retreat, a swap-in, a pull, a promotion — and takes nothing else with it', () => {
    const ways: [string, (G: GameState) => void][] = [
      ['a retreat', (G) => {
        G.players['1'].souls = RETREAT_COST;
        expect(perform(G, '1', { type: 'moveHero', fromSlot: 0, toSlot: 2 })).not.toBe(INVALID);
      }],
      ['a swap-in', (G) => { expect(swapIntoActive(G, G.players['1'], G.players['1'].bench[1]!)).toBe(true); }],
      ['a pull', (G) => { expect(pullToActive(G, G.players['1'], G.players['1'].bench[1]!)).toBe(true); }],
      // A fallen hero's statuses are wiped on death, so these two put the status on the corpse by hand:
      // they prove the hook is in the promotion, not a situation the game reaches.
      ['a promotion', (G) => {
        const a = G.players['1'].active!;
        a.hp = 0; a.respawnTurnsLeft = 3;
        promoteToActive(G, G.players['1'].bench[1]!.iid);
      }],
      ['the AI\'s promotion', (G) => {
        const a = G.players['1'].active!;
        a.hp = 0; a.respawnTurnsLeft = 3;
        autoPromoteAi(G, G.players['1']);
      }],
    ];
    for (const [label, leave] of ways) {
      const G = freshReadyGame();
      const foe = G.players['1'].active!;
      addStatus(G, foe, 'fixation', 2, 99);
      addStatus(G, foe, 'bleed', 1, 2);
      leave(G);
      expect(G.players['1'].active, label).not.toBe(foe);
      expect(foe.statuses.map((s) => s.id), label).toEqual(['bleed']);
    }
  });

  it('stays on a hero that stays: a swap between bench slots, and the hero who steps in', () => {
    const G = freshReadyGame();
    const foe = G.players['1'];
    addStatus(G, foe.bench[0]!, 'fixation', 1, 99);
    addStatus(G, foe.bench[1]!, 'fixation', 1, 99);
    expect(perform(G, '1', { type: 'moveHero', fromSlot: 1, toSlot: 3 })).not.toBe(INVALID); // bench ↔ bench
    expect(has(foe.bench[2]!, 'fixation')).toBe(true);
    foe.souls = RETREAT_COST;
    const incoming = foe.bench[1]!;
    expect(perform(G, '1', { type: 'moveHero', fromSlot: 0, toSlot: 2 })).not.toBe(INVALID); // a retreat
    expect(foe.active).toBe(incoming);
    expect(has(incoming, 'fixation')).toBe(true); // arriving is not leaving
  });

  it('leaveActive ends exactly the statuses that declare clearOnLeaveActive', () => {
    const G = freshReadyGame();
    const hero = G.players['1'].active!;
    addStatus(G, hero, 'fixation', 3, 99);
    addStatus(G, hero, 'shield', 4, 999);
    addStatus(G, hero, 'stun', 1, 1);
    leaveActive(G, hero);
    expect(hero.statuses.map((s) => s.id).sort()).toEqual(['shield', 'stun']);
    const before = snapshot(G);
    leaveActive(G, hero); // nothing left to end
    expect(snapshot(G)).toBe(before);
  });

  it('attackPower(card, target) adds a throwaway bonus that reads the target\'s stacks; attackPower(card) does not', () => {
    const { G, atk, rival } = duel(FIXER);
    expect(attackPower(atk).total).toBe(3);
    expect(attackPower(atk, rival).total).toBe(3); // no stacks yet
    addStatus(G, rival, 'fixation', 2, 99);
    const against = attackPower(atk, rival);
    expect(against.total).toBe(5);
    expect(against.parts.find((p) => p.bonus)).toMatchObject({ label: 'Fixation: +2', amount: 2 });
    expect(attackPower(atk).total).toBe(3);   // the card face has no target
    expect(effectiveAtk(atk)).toBe(3);
    // Only the hero it is fixed on pays: another target has no stacks.
    const other = G.players['1'].bench[0]!;
    expect(attackPower(atk, other).total).toBe(3);
  });

  it('the swing, the forecast and the gate all pass the target', () => {
    const { G, rival } = duel(FIXER);
    addStatus(G, rival, 'fixation', 3, 99);
    const plan = forecastAttack(G, '0');
    expect(plan.steps[0]).toMatchObject({ rawDamage: 6, finalDamage: 6, predictedHpAfter: 24 });
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(rival.hp).toBe(24);
    expect(swingsOf(G)[0].raw).toBe(6);

    // The gate asks with the target too: weakened to nothing, the hero cannot swing at a hero
    // that is not fixed on — and can at the one that is.
    const h = duel(FIXER);
    addStatus(h.G, h.atk, 'weapon_power_down', 9, 99);
    expect(attackPower(h.atk).total).toBe(0);
    expect(attackBlocked(h.G, '0')).toBe('cannot');
    addStatus(h.G, h.rival, 'fixation', 2, 99);
    expect(attackPower(h.atk, h.rival).total).toBe(2);
    expect(attackBlocked(h.G, '0')).toBeNull();
    expect(perform(h.G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(h.rival.hp).toBe(28);
  });
});

// ---------------------------------------------------------------------------

describe('Dome', () => {
  it('takes the Active out of attackTargets: noTarget, no attack to offer, an empty forecast, nothing performed', () => {
    const { G, rival } = duel(TALLY);
    expect(attackTargets(G, '0')).toEqual([rival]);
    addStatus(G, rival, 'dome', 1, 1);
    expect(attackTargets(G, '0')).toEqual([]);
    expect(attackBlocked(G, '0')).toBe('noTarget');
    expect(blocked(G, '0', { type: 'attack' })).toBe('noTarget');
    expect(legalActions(G, '0').some((a) => a.type === 'attack')).toBe(false);
    const plan = forecastAttack(G, '0');
    expect(plan.steps).toEqual([]);
    expect(plan.damageToActive).toBe(0);
    expect(plan.patronDamage).toBe(0);
    expect(plan.defenderActiveKO).toBeNull();
    const before = snapshot(G);
    expect(perform(G, '0', { type: 'attack' })).toBe(INVALID);
    expect(runMove('attack', G, '0')).toBe(INVALID_MOVE);
    expect(snapshot(G)).toBe(before);
  });

  it('a Dome on a bench hero changes nothing for the attack on the Active, and the Active\'s Dome stops only the attack, not a skill or a spell', () => {
    const { G, rival, foes } = duel(TALLY);
    addStatus(G, foes[2], 'dome', 1, 1);
    expect(attackTargets(G, '0')).toEqual([rival]);
    expect(attackBlocked(G, '0')).toBeNull();
    // "Cannot be the target of an attack": a skill or a spell can still be aimed at the domed Active.
    addStatus(G, rival, 'dome', 1, 1);
    const lash = G.players['0'].bench[1]!;
    expect(CARDS_BY_ID[lash.cardId]).toMatchObject({ id: 'hero_lash' });
    expect(skillTargets(G, '0', lash)).toContain(rival);
    expect(skillBlocked(G, '0', lash, rival.iid)).toBeNull();
    const spell: CardInstance = {
      iid: 'spell-cold-front', cardId: 'cold_front', ownerId: '0', zone: 'hand', hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
      statuses: [], exhausted: false, skillUsedThisTurn: false,
    };
    G.players['0'].hand.push(spell);
    expect(playBlocked(G, '0', spell.iid, rival.iid)).toBeNull();
    expect(attackBlocked(G, '0')).toBe('noTarget'); // while the swing at the same hero is not
  });

  it('a reach attacker can still hit the bench, and not what is domed; with the whole board domed, nothing', () => {
    const { G, atk, rival, foes } = duel(REACHER);
    addStatus(G, rival, 'dome', 1, 1);
    expect(attackTargets(G, '0')).toEqual([foes[1], foes[2], foes[3]]);
    expect(attackBlocked(G, '0', rival.iid)).toBe('target');
    expect(attackBlocked(G, '0', foes[2].iid)).toBeNull();
    // A bare attack swings at the first it may: the first bench hero.
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(foes[1].hp).toBe(27);
    expect([rival.hp, foes[2].hp, foes[3].hp]).toEqual([30, 30, 30]);
    expect(swingsOf(G)[0]).toMatchObject({ iid: atk.iid, targetIid: foes[1].iid });

    const all = duel(REACHER);
    for (const f of all.foes) addStatus(all.G, f, 'dome', 1, 1);
    expect(attackTargets(all.G, '0')).toEqual([]);
    expect(attackBlocked(all.G, '0')).toBe('noTarget');
    expect(attackBlocked(all.G, '0', all.foes[1].iid)).toBe('noTarget');
  });

  it('covers the rival\'s turn and is gone when its owner\'s next turn begins', () => {
    const { G, rival } = duel(TALLY);
    // P1's turn: the Dome goes up for 1 turn. Not crowd control, so the end of P1's turn leaves it be…
    addStatus(G, rival, 'dome', 1, 1);
    endTurnEffects(G, '1');
    expect(status(rival, 'dome')).toMatchObject({ duration: 1 });
    // …P0's turn begins (its own statuses tick, not P1's), and P0 cannot attack the Active.
    beginTurn(G, '0', 3);
    expect(status(rival, 'dome')).toMatchObject({ duration: 1 });
    expect(attackBlocked(G, '0')).toBe('noTarget');
    endTurnEffects(G, '0');
    expect(status(rival, 'dome')).toBeDefined();
    // P1's next turn begins: the Dome ticks out, and the Active can be attacked again.
    beginTurn(G, '1', 4);
    expect(status(rival, 'dome')).toBeUndefined();
    expect(attackTargets(G, '0')).toEqual([rival]);
  });
});

// ---------------------------------------------------------------------------

describe('Rooted', () => {
  const game = () => {
    const G = freshReadyGame();
    G.players['0'].souls = 5;
    return G;
  };

  it('stops a retreat from either side of the swap — the Active rooted, or the bench hero', () => {
    const G = game();
    const me = G.players['0'];
    expect(moveBlocked(G, '0', 0, 1)).toBeNull();
    addStatus(G, me.active!, 'rooted', 1, 1);
    for (const slot of [1, 2, 3] as const) {
      expect(moveBlocked(G, '0', 0, slot), `0 to ${slot}`).toBe('rooted');
      expect(moveBlocked(G, '0', slot, 0), `${slot} to 0`).toBe('rooted');
    }
    const before = snapshot(G);
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: 1 })).toBe(INVALID);
    expect(runMove('moveHero', G, '0', 2, 0)).toBe(INVALID_MOVE);
    expect(snapshot(G)).toBe(before);
    // The board says why, in the engine's own code and words.
    expect(actionRefusal(G, '0', { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toEqual({ code: 'rooted', text: moveBlockReason('rooted') });
    expect(moveBlockReason('rooted')).toBe('Rooted: cannot retreat or be swapped');

    const H = game();
    addStatus(H, H.players['0'].bench[1]!, 'rooted', 1, 1);
    expect(moveBlocked(H, '0', 0, 2)).toBe('rooted'); // it cannot be swapped in…
    expect(moveBlocked(H, '0', 2, 0)).toBe('rooted');
    expect(moveBlocked(H, '0', 0, 1)).toBeNull();     // …and the others can
    expect(moveBlocked(H, '0', 0, 3)).toBeNull();
  });

  it('does not touch a swap between two bench slots', () => {
    const G = game();
    const me = G.players['0'];
    const rooted = me.bench[1]!;
    addStatus(G, rooted, 'rooted', 1, 1);
    expect(moveBlocked(G, '0', 2, 1)).toBeNull();
    expect(moveBlocked(G, '0', 2, 3)).toBeNull();
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 2, toSlot: 3 })).not.toBe(INVALID);
    expect(me.bench[2]).toBe(rooted);
    // Rooted on the Active, too: the bench still shuffles.
    addStatus(G, me.active!, 'rooted', 1, 1);
    expect(moveBlocked(G, '0', 1, 2)).toBeNull();
  });

  it('is named before the price of the retreat, and the retreats it forbids are not offered', () => {
    const G = game();
    const me = G.players['0'];
    const retreats = () => legalActions(G, '0').filter((a) => a.type === 'moveHero');
    expect(retreats()).toHaveLength(3);
    addStatus(G, me.bench[1]!, 'rooted', 1, 1);
    expect(retreats()).toEqual([
      { type: 'moveHero', fromSlot: 1, toSlot: 0 },
      { type: 'moveHero', fromSlot: 3, toSlot: 0 },
    ]);
    addStatus(G, me.active!, 'rooted', 1, 1);
    expect(retreats()).toEqual([]);
    me.souls = 0;
    expect(moveBlocked(G, '0', 0, 1)).toBe('rooted'); // not 'souls'
  });

  it('is crowd control: Unstoppable blocks it and cleanses it, and Reactive Barrier fires on it', () => {
    const G = game();
    const hero = G.players['0'].active!;
    addStatus(G, hero, 'unstoppable', 1, 2);
    addStatus(G, hero, 'rooted', 1, 1);
    expect(has(hero, 'rooted')).toBe(false);
    expect(G.log.some((l) => l.text.includes('resisted rooted (Unstoppable)'))).toBe(true);

    const H = game();
    const bound = H.players['0'].bench[0]!;
    addStatus(H, bound, 'rooted', 2, 2);
    expect(moveBlocked(H, '0', 0, 1)).toBe('rooted');
    addStatus(H, bound, 'unstoppable', 1, 1);
    expect(has(bound, 'rooted')).toBe(false);
    expect(moveBlocked(H, '0', 0, 1)).toBeNull();

    const I = game();
    const guarded = I.players['0'].active!;
    wear(guarded, 'reactive_barrier');
    addStatus(I, guarded, 'rooted', 1, 1);
    expect(status(guarded, 'shield')).toMatchObject({ value: 3 });
  });

  it('ticks at the end of the afflicted turn: a stored 1 denies one turn, a stored 2 denies two', () => {
    const G = game();
    const me = G.players['0'];
    const hero = me.active!;
    addStatus(G, hero, 'rooted', 1, 1);
    tickStartOfTurn(G, me);                           // the owner's turn begins: crowd control waits
    expect(status(hero, 'rooted')).toMatchObject({ duration: 1 });
    expect(moveBlocked(G, '0', 0, 1)).toBe('rooted'); // the whole turn is spent rooted
    tickEndOfTurnCC(G, me);                           // …and it goes as the turn ends
    expect(has(hero, 'rooted')).toBe(false);
    expect(moveBlocked(G, '0', 0, 1)).toBeNull();

    const H = game();
    const two = H.players['0'].active!;
    addStatus(H, two, 'rooted', 1, 2);
    tickStartOfTurn(H, H.players['0']);
    tickEndOfTurnCC(H, H.players['0']);
    expect(status(two, 'rooted')).toMatchObject({ duration: 1 });
    expect(moveBlocked(H, '0', 0, 1)).toBe('rooted'); // the second turn
    tickStartOfTurn(H, H.players['0']);
    tickEndOfTurnCC(H, H.players['0']);
    expect(has(two, 'rooted')).toBe(false);
  });

  it('does not hold up a forced promotion: a rooted bench hero steps up over a fallen Active', () => {
    const G = game();
    const me = G.players['0'];
    const rooted = me.bench[0]!;
    addStatus(G, rooted, 'rooted', 3, 3);
    me.active!.hp = 0;
    resolve(G); // Haze falls; P0 owes a promotion
    expect(G.pendingPromotion).toBe('0');
    expect(promoteBlocked(G, rooted.iid)).toBeNull();
    expect(perform(G, '0', { type: 'promoteToActive', benchIid: rooted.iid })).not.toBe(INVALID);
    expect(me.active).toBe(rooted);
    expect(has(rooted, 'rooted')).toBe(true);
    expect(G.pendingPromotion).toBeUndefined();

    // …and the AI's own promotion takes a rooted hero as readily.
    const H = game();
    const foe = H.players['1'];
    for (const b of foe.bench) addStatus(H, b!, 'rooted', 3, 3);
    foe.active!.hp = 0;
    resolve(H);
    expect(isRespawning(foe.active!)).toBe(false);
    expect(has(foe.active!, 'rooted')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('Rabbit', () => {
  const game = () => {
    const G = freshReadyGame();
    G.players['0'].souls = 5;
    return G;
  };

  it('blocks the attack and every skill, and the channel\'s pulse, but not a retreat', () => {
    const G = game();
    const me = G.players['0'];
    const haze = me.active!;
    const lash = me.bench[1]!;
    expect(attackBlocked(G, '0')).toBeNull();
    expect(skillBlocked(G, '0', lash)).toBeNull();
    addStatus(G, haze, 'rabbit', 1, 1);
    addStatus(G, lash, 'rabbit', 1, 1);
    expect(isBlocked(haze, 'attack') && isBlocked(haze, 'skill') && isBlocked(haze, 'pulse')).toBe(true);
    expect(attackPower(haze).total).toBe(0);
    expect(attackBlocked(G, '0')).toBe('cannot');
    expect(skillBlocked(G, '0', lash)).toBe('status');
    expect(perform(G, '0', { type: 'attack' })).toBe(INVALID);
    expect(perform(G, '0', { type: 'useSkill', heroIid: lash.iid, targetIid: G.players['1'].active!.iid })).toBe(INVALID);
    expect(legalActions(G, '0').some((a) => a.type === 'attack' || (a.type === 'useSkill' && a.heroIid === lash.iid))).toBe(false);
    expect(moveBlocked(G, '0', 0, 1)).toBeNull(); // a rabbit can still be sent to the bench

    const channel = game();
    const caster = channel.players['0'].active!;
    addStatus(channel, caster, 'casting', 3, 3);
    addStatus(channel, caster, 'rabbit', 1, 1);
    const hp = channel.players['1'].active!.hp;
    tickCastingPulses(channel, channel.players['0']);
    expect(channel.players['1'].active!.hp).toBe(hp);
    expect(channel.log.some((l) => l.text.includes('channel is interrupted'))).toBe(true);
  });

  it('is crowd control: Unstoppable blocks it and cleanses it; it goes as the afflicted turn ends', () => {
    const G = game();
    const hero = G.players['0'].active!;
    addStatus(G, hero, 'unstoppable', 1, 2);
    addStatus(G, hero, 'rabbit', 1, 1);
    expect(has(hero, 'rabbit')).toBe(false);

    const H = game();
    const rabbit = H.players['0'].active!;
    addStatus(H, rabbit, 'rabbit', 1, 1);
    expect(attackBlocked(H, '0')).toBe('cannot');
    addStatus(H, rabbit, 'unstoppable', 1, 1);
    expect(has(rabbit, 'rabbit')).toBe(false);
    expect(attackBlocked(H, '0')).toBeNull();

    const I = game();
    const me = I.players['0'];
    const one = me.active!;
    addStatus(I, one, 'rabbit', 1, 1);
    tickStartOfTurn(I, me);
    expect(attackBlocked(I, '0')).toBe('cannot'); // the whole turn
    tickEndOfTurnCC(I, me);
    expect(has(one, 'rabbit')).toBe(false);
    expect(attackBlocked(I, '0')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('Last Stand', () => {
  function setup() {
    const G = freshReadyGame();
    const me = G.players['0'];
    const bearer = me.bench[1]!; // Lash, on the bench
    bearer.spiritMod = 2;
    bearer.hpMax = 12;
    bearer.hp = 5;
    const foes = [G.players['1'].active!, ...G.players['1'].bench] as CardInstance[];
    for (const f of foes) f.hp = f.hpMax = 30;
    return { G, me, bearer, foes };
  }

  it('goes off at the start of its owner\'s turn: value + Spirit to every enemy hero, then it heals its bearer', () => {
    const { G, me, bearer, foes } = setup();
    addStatus(G, bearer, 'last_stand', 4, 1, { heal: 3 });
    expect(status(bearer, 'last_stand')).toMatchObject({ value: 4, duration: 1, heal: 3 });
    const mine = [me.active!, me.bench[0]!, me.bench[2]!].map((c) => c.hp);
    tickStartOfTurn(G, me);
    for (const f of foes) expect(f.hp, f.cardId).toBe(30 - 6); // 4 + Spirit 2
    expect(bearer.hp).toBe(8);                                 // 5 + 3
    expect([me.active!, me.bench[0]!, me.bench[2]!].map((c) => c.hp)).toEqual(mine); // its own side is untouched
    expect(has(bearer, 'last_stand')).toBe(false);             // it is spent
    expect(G.log.some((l) => l.text === 'Lash — Last Stand goes off.')).toBe(true);
  });

  it('waits until it is about to expire, and only for its own owner\'s turn', () => {
    const { G, me, bearer, foes } = setup();
    addStatus(G, bearer, 'last_stand', 4, 2, { heal: 3 });
    tickStartOfTurn(G, G.players['1']);                 // the rival's turn begins: not its clock
    expect(foes.every((f) => f.hp === 30)).toBe(true);
    expect(status(bearer, 'last_stand')).toMatchObject({ duration: 2 });
    tickStartOfTurn(G, me);                             // 2 → 1: not yet
    expect(foes.every((f) => f.hp === 30)).toBe(true);
    expect(bearer.hp).toBe(5);
    expect(status(bearer, 'last_stand')).toMatchObject({ duration: 1 });
    tickStartOfTurn(G, me);                             // about to expire: now
    expect(foes.every((f) => f.hp === 24)).toBe(true);
    expect(bearer.hp).toBe(8);
    expect(has(bearer, 'last_stand')).toBe(false);
  });

  it('is plain spirit damage: resist counts, a fallen hero is passed over, and it heals nothing it does not carry', () => {
    const { G, me, bearer, foes } = setup();
    addStatus(G, foes[0], 'spirit_resist', 2, 99);
    foes[1].hp = 0; foes[1].respawnTurnsLeft = 2; // a corpse waiting to respawn
    foes[2].hp = 3;                               // one the strike finishes
    addStatus(G, bearer, 'last_stand', 4, 1);     // no heal carried
    tickStartOfTurn(G, me);
    expect(foes[0].hp).toBe(30 - 4);              // 6 less its Spirit Resist 2
    expect(foes[1].hp).toBe(0);                   // untouched: a corpse is passed over
    expect(foes[2].hp).toBe(0);
    expect(foes[3].hp).toBe(24);
    expect(bearer.hp).toBe(5);                    // default heal 0
    resolve(G);
    expect(isRespawning(foes[2])).toBe(true);
  });

  it('works from the Active slot too, and a second Last Stand does not double the first', () => {
    const { G, me, foes } = setup();
    const active = me.active!;
    active.spiritMod = 0;
    addStatus(G, active, 'last_stand', 3, 1, { heal: 0 });
    addStatus(G, active, 'last_stand', 2, 1);
    expect(active.statuses.filter((s) => s.id === 'last_stand')).toHaveLength(1);
    tickStartOfTurn(G, me);
    expect(foes.every((f) => f.hp === 27)).toBe(true); // the larger value, once
  });
});

// ---------------------------------------------------------------------------

describe('an attack that names its target', () => {
  it('lists one attack per enemy hero for a hero with reach: the first bare, the others naming theirs', () => {
    const { G, atk, foes } = duel(REACHER);
    expect(hasReach(atk)).toBe(true);
    expect(attackTargets(G, '0')).toEqual(foes);
    expect(attackTargets(G, '0')).toEqual(targetsFor(G, '0', 'enemyHero')); // in targetsFor order
    const attacks = legalActions(G, '0').filter((a) => a.type === 'attack');
    expect(attacks).toEqual([
      { type: 'attack' },
      { type: 'attack', targetIid: foes[1].iid },
      { type: 'attack', targetIid: foes[2].iid },
      { type: 'attack', targetIid: foes[3].iid },
    ]);
    for (const a of attacks) expect(blocked(G, '0', a), JSON.stringify(a)).toBeNull();
    // The bare attack is the first of the list — the rival Active, as it always was.
    expect(attackBlocked(G, '0')).toBeNull();
    expect(attackBlocked(G, '0', foes[0].iid)).toBeNull();
  });

  it('without reach there is one target, and one attack, as there has always been', () => {
    const { G, atk, rival, foes } = duel(TALLY);
    expect(hasReach(atk)).toBe(false);
    expect(attackTargets(G, '0')).toEqual([rival]);
    expect(legalActions(G, '0').filter((a) => a.type === 'attack')).toEqual([{ type: 'attack' }]);
    expect(attackBlocked(G, '0', rival.iid)).toBeNull(); // naming the Active is the same as the default
    for (const bench of foes.slice(1)) expect(attackBlocked(G, '0', bench.iid), bench.cardId).toBe('target');
  });

  it('gear can give a hero reach, and taking it away takes the reach away', () => {
    const { G, atk, foes } = duel(TALLY);
    const barrel = wear(atk, LONG_BARREL);
    expect(hasReach(atk)).toBe(true);
    expect(attackTargets(G, '0')).toEqual(foes);
    expect(attackBlocked(G, '0', foes[3].iid)).toBeNull();
    atk.attached = atk.attached!.filter((a) => a !== barrel);
    expect(hasReach(atk)).toBe(false);
    expect(attackTargets(G, '0')).toEqual([foes[0]]);
  });

  it('attack(targetIid) hits that hero and nothing else', () => {
    const { G, atk, foes } = duel(REACHER);
    expect(perform(G, '0', { type: 'attack', targetIid: foes[2].iid })).not.toBe(INVALID);
    expect(foes.map((f) => f.hp)).toEqual([30, 30, 27, 30]);
    const swings = swingsOf(G);
    expect(swings).toHaveLength(1);
    expect(swings[0]).toMatchObject({ iid: atk.iid, targetIid: foes[2].iid, index: 0, raw: 3 });
    expect(G.attackUsed).toBe(true);
    expect(atk.attackedThisTurn).toBe(true);
    expect(attackBlocked(G, '0', foes[1].iid)).toBe('used'); // one attack a turn, whoever it names

    // The same through the game's move, and a bare move is still the Active.
    const H = duel(REACHER);
    expect(runMove('attack', H.G, '0', H.foes[3].iid)).not.toBe(INVALID_MOVE);
    expect(H.foes.map((f) => f.hp)).toEqual([30, 30, 30, 27]);
    const I = duel(REACHER);
    expect(runMove('attack', I.G, '0')).not.toBe(INVALID_MOVE);
    expect(I.foes.map((f) => f.hp)).toEqual([27, 30, 30, 30]);
  });

  it('through a real boardgame.io match: the move takes the target, and a bare move swings at the Active', () => {
    const saved = getMatchConfig();
    setMatchConfig({
      playerDeck: [], heroPreferences: [null, null, null, null],
      story: {
        playerHeroes: [REACHER, 'hero_lash', 'hero_paige', 'hero_vindicta'],
        playerDeck: AI_DECKS_BY_NAME.aggro,
        enemyHeroes: STARTER_DECK_AI.heroes,
        enemyDeck: AI_DECKS_BY_NAME.control,
        enemyBuff: { atk: 0, hp: 20 }, // nobody falls to one swing
      },
    });
    const quiet = console.error;
    try {
      const turnTwo = () => {
        const c = Client({ game: DeadlockGame, numPlayers: 2 });
        c.start();
        const moves = c.moves as any;
        moves.endTurn(); // Turn 1 has no attack; P1 passes too…
        moves.endTurn(); // …and P0's second turn opens the attack
        const G = () => c.getState()!.G as GameState;
        const foes = [G().players['1'].active!, ...G().players['1'].bench] as CardInstance[];
        return { moves, G, foes, hp: foes.map((f) => f.hp), now: () => foes.map((f) => findCardOnBoard(G(), f.iid)!.card.hp) };
      };

      const named = turnTwo();
      named.moves.attack(named.foes[2].iid);
      expect(named.now()).toEqual([named.hp[0], named.hp[1], named.hp[2] - 3, named.hp[3]]);
      expect(swingsOf(named.G()).map((s) => s.targetIid)).toEqual([named.foes[2].iid]);
      expect(named.G().attackUsed).toBe(true);

      const bare = turnTwo();
      bare.moves.attack();
      expect(bare.now()).toEqual([bare.hp[0] - 3, bare.hp[1], bare.hp[2], bare.hp[3]]);

      // A target that is not one is refused by the match itself, and nothing changes.
      const refused = turnTwo();
      const stuck = JSON.stringify(refused.G());
      console.error = () => {}; // boardgame.io logs every refused move
      refused.moves.attack('ghost-iid');
      expect(JSON.stringify(refused.G())).toBe(stuck);
    } finally {
      console.error = quiet;
      setMatchConfig(saved);
    }
  });

  it('Extra Attacks follow the same target', () => {
    const { G, atk, foes } = duel(REACHER);
    addStatus(G, atk, 'extra_attack', 1, 99);
    expect(perform(G, '0', { type: 'attack', targetIid: foes[1].iid })).not.toBe(INVALID);
    expect(swingsOf(G).map((s) => [s.targetIid, s.index])).toEqual([[foes[1].iid, 0], [foes[1].iid, 1]]);
    expect(foes.map((f) => f.hp)).toEqual([30, 24, 30, 30]);
  });

  it('a target that is not one is "target", and leaves G exactly as it was', () => {
    const { G, me, atk, foes } = duel(REACHER);
    const corpse = foes[3];
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    const junk = ['ghost-iid', '', atk.iid, me.bench[0]!.iid, corpse.iid, 7, null, {}] as unknown as string[];
    const before = snapshot(G);
    for (const targetIid of junk) {
      const label = String(targetIid);
      expect(attackBlocked(G, '0', targetIid), label).toBe('target');
      expect(blocked(G, '0', { type: 'attack', targetIid }), label).toBe('target');
      expect(perform(G, '0', { type: 'attack', targetIid }), label).toBe(INVALID);
      expect(runMove('attack', G, '0', targetIid), label).toBe(INVALID_MOVE);
      expect(forecastAttack(G, '0', targetIid).steps, label).toEqual([]);
    }
    expect(snapshot(G)).toBe(before);
    expect(attackTargets(G, '0')).toEqual(foes.slice(0, 3)); // the fallen are not in the list
  });

  it('keeps its reasons and their order: turn1, used, noActive, skill, noTarget, then target, then cannot', () => {
    const { G, me, atk, foes } = duel(REACHER);
    const ghost = 'ghost-iid';
    G.turnNumber = 1;
    expect(attackBlocked(G, '0', ghost)).toBe('turn1');
    G.turnNumber = 2;
    G.attackUsed = true;
    expect(attackBlocked(G, '0', ghost)).toBe('used');
    G.attackUsed = false;
    atk.skillUsedThisTurn = true;
    expect(attackBlocked(G, '0', ghost)).toBe('skill');
    atk.skillUsedThisTurn = false;
    addStatus(G, atk, 'stun', 1, 1);
    expect(attackBlocked(G, '0', foes[0].iid)).toBe('cannot');
    expect(attackBlocked(G, '0', ghost)).toBe('target'); // an impossible target is named before the stun
    expect(attackTargets(G, '0')).toEqual([]);
    atk.statuses = [];
    for (const f of foes) { f.hp = 0; f.respawnTurnsLeft = 3; }
    expect(attackBlocked(G, '0')).toBe('noTarget');
    expect(attackBlocked(G, '0', ghost)).toBe('noTarget');
    me.active = null;
    expect(attackBlocked(G, '0', ghost)).toBe('noActive');
    expect(attackTargets(G, '0')).toEqual([]);
  });

  it('the forecast, per target, is what the real attack then does', () => {
    const { G, atk, foes } = duel(REACHER);
    foes[3].hp = 2; // the last one falls to its swing
    for (const target of foes) {
      const plan = forecastAttack(G, '0', target.iid);
      const real = structuredClone(G) as GameState;
      expect(perform(real, '0', { type: 'attack', targetIid: target.iid })).not.toBe(INVALID);
      const after = findCardOnBoard(real, target.iid)!.card;
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0], target.cardId).toMatchObject({
        attackerIid: atk.iid, targetIid: target.iid, rawDamage: 3, predictedHpAfter: Math.max(0, after.hp),
      });
      expect(plan.damageToActive, target.cardId).toBe(target.hp - after.hp);
      expect(plan.defenderActiveKO, target.cardId).toBe(after.hp <= 0 ? target.iid : null);
      expect(plan.patronDamage, target.cardId).toBe(G.players['1'].hp - real.players['1'].hp);
    }
    // The default is the rival Active, as before.
    expect(forecastAttack(G, '0')).toEqual(forecastAttack(G, '0', foes[0].iid));
  });

  it('the AI lists the attacks as moves: [] for the default, [targetIid] for the others', () => {
    const { G, me, foes } = duel(REACHER);
    me.hand = [];
    me.souls = 0; // nothing but the attacks and the end of the turn
    const options = enumerateAIMoves(G, ctxFor('0'), false);
    const attacks = options.filter((o) => o.move === 'attack').map((o) => o.args);
    expect(attacks).toHaveLength(4);
    expect(attacks).toEqual(expect.arrayContaining([[], [foes[1].iid], [foes[2].iid], [foes[3].iid]]));
    for (const args of attacks) expect(runMove('attack', structuredClone(G), '0', ...args)).not.toBe(INVALID_MOVE);
    // With lookahead on, the AI weighs each target and takes a legal one.
    const best = enumerateAIMoves(G, ctxFor('0'))[0];
    expect(best.move).toBe('attack');
    expect(runMove('attack', structuredClone(G), '0', ...best.args)).not.toBe(INVALID_MOVE);
  });

  it('the sheet words the new refusals', () => {
    const { G, rival, atk } = duel(REACHER);
    addStatus(G, rival, 'dome', 1, 1);
    expect(attackBlockReason('noTarget', atk, rival)).toBe('Their Active cannot be attacked this turn');
    expect(attackBlockReason('noTarget', atk)).toBe('No rival Active to hit');
    expect(attackBlockReason('noTarget', atk, { ...rival, statuses: [] })).toBe('No rival Active to hit');
    expect(attackBlockReason('noTarget', atk, { ...rival, respawnTurnsLeft: 2 })).toBe('No rival Active to hit');
    expect(attackBlockReason('target', atk).length).toBeGreaterThan(0);
    // …and the board's gate says the same through the engine's own code.
    const domed = duel(TALLY);
    addStatus(domed.G, domed.rival, 'dome', 1, 1);
    expect(actionRefusal(domed.G, '0', { type: 'attack' })).toEqual({ code: 'noTarget', text: 'Their Active cannot be attacked this turn' });
    const named = duel(TALLY);
    expect(actionRefusal(named.G, '0', { type: 'attack', targetIid: named.foes[1].iid })).toEqual({ code: 'target', text: attackBlockReason('target', named.atk) });
    expect(actionRefusal(named.G, '0', { type: 'attack' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('attackAll', () => {
  it('swings at every living enemy hero in board order, a swing event and the on-attack procs each — and the turn\'s attack is not spent', () => {
    const { G, atk, foes } = duel(TALLY);
    attackAll(G, atk);
    const swings = swingsOf(G);
    expect(swings.map((s) => s.targetIid)).toEqual(foes.map((f) => f.iid)); // targetsFor order
    expect(swings.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(swings.every((s) => s.iid === atk.iid && s.raw === 3)).toBe(true);
    for (const f of foes) expect(f.hp, f.cardId).toBe(27);
    expect(swungAt).toEqual(foes.map((f) => f.iid));  // the passive followed through once per swing
    expect(G.attackUsed).toBe(false);
    expect(atk.attackedThisTurn).toBeFalsy();
    expect(attackBlocked(G, '0')).toBeNull();          // the attack itself is still there to make
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
  });

  it('fires worn on-attack gear once per swing', () => {
    const { G, atk, foes } = duel(TALLY);
    wear(atk, 'toxic_bullets'); // Bleed 1 on whoever the bearer hits
    attackAll(G, atk);
    for (const f of foes) expect(status(f, 'bleed'), f.cardId).toMatchObject({ value: 1 });
  });

  it('reads each swing\'s power for its own target, and uses no Extra Attack', () => {
    const { G, atk, foes } = duel(FIXER);
    addStatus(G, foes[2], 'fixation', 2, 99);
    addStatus(G, atk, 'extra_attack', 2, 99);
    attackAll(G, atk);
    expect(swingsOf(G).map((s) => s.raw)).toEqual([3, 3, 5, 3]);
    expect(foes.map((f) => f.hp)).toEqual([27, 27, 25, 27]);
    expect(status(atk, 'extra_attack')).toMatchObject({ value: 2 }); // neither read nor spent
  });

  it('passes over the fallen and what a Dome covers, and does nothing for a hero that cannot attack', () => {
    const { G, atk, foes } = duel(TALLY);
    foes[1].hp = 0; foes[1].respawnTurnsLeft = 2;
    addStatus(G, foes[2], 'dome', 1, 1);
    attackAll(G, atk);
    expect(swingsOf(G).map((s) => [s.targetIid, s.index])).toEqual([[foes[0].iid, 0], [foes[3].iid, 1]]);
    expect(foes.map((f) => f.hp)).toEqual([27, 0, 30, 27]);
    expect(swungAt).toEqual([foes[0].iid, foes[3].iid]);

    const disarmed = duel(TALLY);
    addStatus(disarmed.G, disarmed.atk, 'disarm', 1, 1);
    const before = snapshot(disarmed.G);
    attackAll(disarmed.G, disarmed.atk);
    expect(snapshot(disarmed.G)).toBe(before);
  });

  it('ends with the state-based pass: a hero it finishes falls, costs its patron its level and pays a bounty', () => {
    const { G, me, atk, foes } = duel(TALLY);
    foes[2].hp = 3;
    me.souls = 4;
    const patron = G.players['1'].hp;
    attackAll(G, atk);
    expect(isRespawning(foes[2])).toBe(true);
    expect(G.players['1'].hp).toBe(patron - 1);
    expect(me.souls).toBe(5);
    expect(G.log.some((l) => l.text === 'P0 +1 Souls (KO bounty).')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('swapIntoActive and pullToActive', () => {
  it('swapIntoActive trades the Active with a bench hero: the right cards, the right slots, no price', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const [haze, vindicta, lash, paige] = [me.active!, ...me.bench] as CardInstance[];
    me.souls = 3;
    expect(swapIntoActive(G, me, lash)).toBe(true);
    expect(me.active).toBe(lash);
    expect(lash).toMatchObject({ zone: 'active', slot: 0 });
    expect(me.bench[1]).toBe(haze);
    expect(haze).toMatchObject({ zone: 'bench', slot: 2 });
    expect(me.bench[0]).toBe(vindicta);
    expect(me.bench[2]).toBe(paige); // the others stand where they stood
    expect(me.souls).toBe(3);        // free
    expect(haze.exhausted || lash.exhausted).toBe(false);
    expect(G.log.at(-1)!.text).toBe('Lash steps in for Haze.');
    // Swap back: the same two, the other way round.
    expect(swapIntoActive(G, me, haze)).toBe(true);
    expect(me.active).toBe(haze);
    expect(me.bench[1]).toBe(lash);
    expect(G.log.at(-1)!.text).toBe('Haze steps in for Lash.');
  });

  it('says nothing when asked to be quiet', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const lines = G.log.length;
    expect(swapIntoActive(G, me, me.bench[0]!, { quiet: true })).toBe(true);
    expect(G.log).toHaveLength(lines);
    expect(me.active!.cardId).toBe('hero_vindicta');
  });

  it('pullToActive does it on the rival\'s board: their Active goes to the slot the hero leaves', () => {
    const G = freshReadyGame();
    const foe = G.players['1'];
    const [abrams, dynamo, kelvin, seven] = [foe.active!, ...foe.bench] as CardInstance[];
    const mine = JSON.stringify(G.players['0']);
    expect(pullToActive(G, foe, kelvin)).toBe(true);
    expect(foe.active).toBe(kelvin);
    expect(kelvin).toMatchObject({ zone: 'active', slot: 0 });
    expect(foe.bench[1]).toBe(abrams);
    expect(abrams).toMatchObject({ zone: 'bench', slot: 2 });
    expect(foe.bench[0]).toBe(dynamo);
    expect(foe.bench[2]).toBe(seven);
    expect(G.log.at(-1)!.text).toBe('Kelvin is dragged to the front.');
    expect(JSON.stringify(G.players['0'])).toBe(mine); // the puller's own side is not touched
  });

  it('leaveActive runs for the hero who leaves, not for the one who arrives', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    addStatus(G, me.active!, 'fixation', 2, 99);
    addStatus(G, me.bench[0]!, 'fixation', 1, 99);
    expect(swapIntoActive(G, me, me.bench[0]!)).toBe(true);
    expect(me.bench[0]!.statuses).toEqual([]);                     // the old Active lost it
    expect(me.active!.statuses.map((s) => s.id)).toEqual(['fixation']); // the new one keeps its own
  });

  it('refuse what they should: a fallen hero, a bench-only hero, a hero who is not on that bench, a board with no Active', () => {
    const cases: [string, (G: GameState) => { ps: GameState['players']['0']; hero: CardInstance }][] = [
      ['a corpse', (G) => { const h = G.players['0'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 2; return { ps: G.players['0'], hero: h }; }],
      ['a bench-only hero', (G) => { const h = makeHero('hero_rem', '0', 'bench', 3); G.players['0'].bench[2] = h; return { ps: G.players['0'], hero: h }; }],
      ['the Active itself', (G) => ({ ps: G.players['0'], hero: G.players['0'].active! })],
      ['the rival\'s hero', (G) => ({ ps: G.players['0'], hero: G.players['1'].bench[0]! })],
      ['a hero from nowhere', (G) => ({ ps: G.players['0'], hero: makeHero('hero_shiv', '0', 'bench', 1) })],
      ['an empty board', (G) => { G.players['0'].active = null; return { ps: G.players['0'], hero: G.players['0'].bench[0]! }; }],
    ];
    for (const [label, build] of cases) {
      const G = freshReadyGame();
      const { ps, hero } = build(G);
      const before = snapshot(G);
      expect(swapIntoActive(G, ps, hero), label).toBe(false);
      expect(pullToActive(G, ps, hero), label).toBe(false);
      expect(snapshot(G), label).toBe(before);
    }
  });

  it('Mirage\'s Traveler uses the swap and does exactly what it did: the same state, the same lines', () => {
    // The Traveler of before, as it was written inline.
    const legacy = (G: GameState, movingPlayer: PlayerID) => {
      const ps = G.players[movingPlayer];
      const mirage = [ps.active, ...ps.bench].find((c) => c && c.cardId === 'hero_mirage' && (c.respawnTurnsLeft ?? 0) === 0);
      if (!mirage) { pushLog(G, 'Traveler fizzled.'); return; }
      if (ps.active === mirage) {
        const benchAlly = ps.bench.find((b) => {
          if (!b || (b.respawnTurnsLeft ?? 0) > 0) return false;
          const d = CARDS_BY_ID[b.cardId];
          return d?.type === 'hero' && !d.flags?.benchOnly;
        });
        if (benchAlly) {
          const bSlot = benchAlly.slot ?? 1;
          ps.active = benchAlly; benchAlly.zone = 'active'; benchAlly.slot = 0;
          ps.bench[bSlot - 1] = mirage; mirage.zone = 'bench'; mirage.slot = bSlot;
        }
      }
      addStatus(G, mirage, 'shield', 3, 999);
      pushLog(G, 'Traveler: Mirage slips to safety (Shield 3).');
    };
    const mirageActive = (G: GameState) => { G.players['0'].active = makeHero('hero_mirage', '0', 'active', 0); };
    const cases: [string, (G: GameState) => void][] = [
      ['Mirage fronts with allies behind her', mirageActive],
      ['the first ally has fallen', (G) => { mirageActive(G); const b = G.players['0'].bench[0]!; b.hp = 0; b.respawnTurnsLeft = 2; }],
      ['only a bench-only ally is left', (G) => {
        mirageActive(G);
        const bench = G.players['0'].bench;
        bench[0]!.hp = 0; bench[0]!.respawnTurnsLeft = 2;
        bench[1] = makeHero('hero_rem', '0', 'bench', 2);
        bench[2]!.hp = 0; bench[2]!.respawnTurnsLeft = 2;
      }],
      ['a hole where the first ally stood', (G) => { mirageActive(G); G.players['0'].bench[0] = null; }],
      ['Mirage is on the bench', (G) => { G.players['0'].bench[1] = makeHero('hero_mirage', '0', 'bench', 2); }],
      ['Mirage has fallen', (G) => { mirageActive(G); const m = G.players['0'].active!; m.hp = 0; m.respawnTurnsLeft = 2; }],
      ['there is no Mirage', () => {}],
    ];
    for (const [label, stage] of cases) {
      const base = freshReadyGame();
      stage(base);
      const was = structuredClone(base) as GameState;
      const now = structuredClone(base) as GameState;
      legacy(was, '0');
      ABILITIES_BY_ID.eff_ult_mirage.run(now, { movingPlayer: '0' }, {});
      expect(snapshot(now), label).toBe(snapshot(was));
      expect(now.log.some((l) => l.text.includes('steps in for')), label).toBe(false);
    }
    // And in the first case the swap really happened.
    const G = freshReadyGame();
    mirageActive(G);
    ABILITIES_BY_ID.eff_ult_mirage.run(G, { movingPlayer: '0' }, {});
    expect(G.players['0'].active!.cardId).toBe('hero_vindicta');
    expect(G.players['0'].bench[0]!.cardId).toBe('hero_mirage');
    expect(status(G.players['0'].bench[0]!, 'shield')).toMatchObject({ value: 3 });
  });
});

// ---------------------------------------------------------------------------

describe('a skill that costs HP', () => {
  it('is blocked at hp <= cost and open above it', () => {
    const { G, atk } = duel(PAYER);
    const cases: [number, 'hp' | null][] = [[12, null], [3, null], [2, 'hp'], [1, 'hp']];
    for (const [hp, why] of cases) {
      atk.hp = hp;
      expect(skillBlocked(G, '0', atk), `hp ${hp}`).toBe(why);
      expect(legalActions(G, '0').some((a) => a.type === 'useSkill' && a.heroIid === atk.iid), `hp ${hp}`).toBe(why === null);
    }
    // At hp <= cost the skill is refused, and nothing is touched.
    const before = snapshot(G);
    expect(perform(G, '0', { type: 'useSkill', heroIid: atk.iid, targetIid: G.players['1'].active!.iid })).toBe(INVALID);
    expect(runMove('useSkill', G, '0', atk.iid, G.players['1'].active!.iid)).toBe(INVALID_MOVE);
    expect(snapshot(G)).toBe(before);
    expect(atk.hp).toBe(1);
  });

  it('comes after the lockouts and the cooldown, and before the souls', () => {
    const { G, me, atk } = duel(PAYER);
    atk.hp = 1;
    addStatus(G, atk, 'silenced', 1, 1);
    expect(skillBlocked(G, '0', atk)).toBe('status');
    atk.statuses = [];
    atk.cooldowns = { [bloodPrice.id]: 1 };
    expect(skillBlocked(G, '0', atk)).toBe('cooldown');
    delete atk.cooldowns;
    me.souls = 0;
    expect(skillBlocked(G, '0', atk)).toBe('hp');
    atk.hp = 5;
    expect(skillBlocked(G, '0', atk)).toBe('souls');
  });

  it('is paid straight off the hero before the skill runs, and the skill still happens', () => {
    const { G, me, atk, rival } = duel(PAYER);
    atk.hp = 5;
    expect(perform(G, '0', { type: 'useSkill', heroIid: atk.iid, targetIid: rival.iid })).not.toBe(INVALID);
    expect(atk.hp).toBe(3);
    expect(rival.hp).toBe(28);
    expect(me.souls).toBe(9); // the soul as ever
    const lines = G.log.map((l) => l.text);
    const used = lines.indexOf('P0 used skill: Payer on Abrams.');
    const paid = lines.indexOf('Payer pays 2 HP.');
    const dealt = lines.findIndex((l) => l.includes('Abrams') && l.includes('spirit dmg'));
    expect(used).toBeGreaterThanOrEqual(0);
    expect(paid).toBeGreaterThan(used);
    expect(dealt).toBeGreaterThan(paid);
  });

  it('goes through a Shield untouched, past resists and Unstoppable, and sets nothing off', () => {
    const shielded = duel(PAYER);
    shielded.atk.hp = 4;
    addStatus(shielded.G, shielded.atk, 'shield', 5, 999);
    addStatus(shielded.G, shielded.atk, 'spirit_resist', 9, 99);
    addStatus(shielded.G, shielded.atk, 'unstoppable', 1, 1);
    const fx = shielded.G.fx.length;
    expect(perform(shielded.G, '0', { type: 'useSkill', heroIid: shielded.atk.iid, targetIid: shielded.rival.iid })).not.toBe(INVALID);
    expect(shielded.atk.hp).toBe(2);
    expect(status(shielded.atk, 'shield')!.value).toBe(5);
    expect(shielded.G.fx.slice(fx).some((e) => (e.kind === 'hit' || e.kind === 'shield' || e.kind === 'immune') && e.iid === shielded.atk.iid)).toBe(false);

    // Spirit Shielding grants Shield 2 whenever its bearer takes spirit damage: it takes none here.
    const geared = duel(PAYER);
    geared.atk.hp = 4;
    wear(geared.atk, 'spirit_shielding');
    expect(perform(geared.G, '0', { type: 'useSkill', heroIid: geared.atk.iid, targetIid: geared.rival.iid })).not.toBe(INVALID);
    expect(geared.atk.hp).toBe(2);
    expect(has(geared.atk, 'shield')).toBe(false);
  });

  it('can never kill: the last HP is never paid', () => {
    const { G, atk, rival } = duel(PAYER);
    atk.hp = 3; // 3 > 2: payable, and one HP is left
    expect(perform(G, '0', { type: 'useSkill', heroIid: atk.iid, targetIid: rival.iid })).not.toBe(INVALID);
    expect(atk.hp).toBe(1);
    expect(isRespawning(atk)).toBe(false);
    expect(G.log.some((l) => l.text === 'Payer fell.')).toBe(false);
    resolve(G);
    expect(isRespawning(atk)).toBe(false);
    expect(atk.hp).toBe(1);
  });

  it('the sheet says how much it needs', () => {
    const { G, atk } = duel(PAYER);
    expect(skillBlockReason('hp', atk, bloodPrice.id)).toBe('Needs more than 2 HP');
    expect(skillBlockReason('hp', atk)).toBe('Needs more than 2 HP'); // a bare ask is the hero's first skill
    expect(skillBlockReason('hp').length).toBeGreaterThan(0);
    atk.hp = 2;
    expect(actionRefusal(G, '0', { type: 'useSkill', heroIid: atk.iid, targetIid: G.players['1'].active!.iid })).toEqual({ code: 'hp', text: 'Needs more than 2 HP' });
  });
});

// ---------------------------------------------------------------------------

describe('awardSouls', () => {
  it('adds souls and says so, with its reason', () => {
    const G = freshReadyGame();
    G.players['0'].souls = 3;
    expect(awardSouls(G, '0', 2, 'a test')).toBe(2);
    expect(G.players['0'].souls).toBe(5);
    expect(G.log.at(-1)!.text).toBe('P0 +2 Souls (a test).');
    expect(awardSouls(G, '1', 1)).toBe(1);
    expect(G.log.at(-1)!.text).toBe('P1 +1 Souls.');
  });

  it('is capped at SOULS_MAX, says only what it gave, and never subtracts', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = SOULS_MAX - 1;
    expect(awardSouls(G, '0', 5, 'big')).toBe(1);
    expect(me.souls).toBe(SOULS_MAX);
    expect(G.log.at(-1)!.text).toBe('P0 +1 Souls (big).');
    const lines = G.log.length;
    expect(awardSouls(G, '0', 3, 'at the cap')).toBe(0);
    expect(me.souls).toBe(SOULS_MAX);
    expect(G.log).toHaveLength(lines); // nothing gained, nothing said
    me.souls = SOULS_MAX + 2;         // (not a state the game reaches)
    expect(awardSouls(G, '0', 3, 'over')).toBe(0);
    expect(me.souls).toBe(SOULS_MAX + 2);
    expect(awardSouls(G, '0', 0)).toBe(0);
    expect(awardSouls(G, '0', -4)).toBe(0);
    expect(me.souls).toBe(SOULS_MAX + 2);
  });

  it('is what the KO bounty pays through, in the words it always used', () => {
    const G = freshReadyGame();
    G.players['0'].souls = 2;
    const victim = G.players['1'].bench[1]!;
    damageUnit(G, victim, 99, 'pure');
    resolve(G);
    expect(isRespawning(victim)).toBe(true);
    expect(G.players['0'].souls).toBe(3);
    expect(G.log.some((l) => l.text === 'P0 +1 Souls (KO bounty).')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('returnToHand', () => {
  it('puts a fresh copy of the card in the hand', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.hand = me.hand.slice(0, 3);
    const iids = new Set([...me.hand, ...me.deck, ...me.discard].map((c) => c.iid));
    const card = returnToHand(G, me, 'ult_shiv')!;
    expect(card).toBeTruthy();
    expect(me.hand).toHaveLength(4);
    expect(me.hand.at(-1)).toBe(card);
    expect(card).toMatchObject({ cardId: 'ult_shiv', ownerId: '0', zone: 'hand', statuses: [] });
    expect(iids.has(card.iid)).toBe(false);
    expect(G.log.at(-1)!.text).toBe('Killing Blow returns to P0\'s hand.');
    // Another one is another instance.
    const again = returnToHand(G, me, 'ult_shiv')!;
    expect(again.iid).not.toBe(card.iid);
  });

  it('respects the hand limit: a full hand loses it, and says so', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    while (me.hand.length < MAX_HAND - 1) me.hand.push(me.deck.pop()!);
    expect(me.hand).toHaveLength(MAX_HAND - 1);
    expect(returnToHand(G, me, 'ult_shiv')).not.toBeNull(); // the last place
    expect(me.hand).toHaveLength(MAX_HAND);
    const counter = G.counters.iid;
    const before = me.hand.map((c) => c.iid);
    expect(returnToHand(G, me, 'ult_shiv')).toBeNull();     // no place left
    expect(me.hand.map((c) => c.iid)).toEqual(before);
    expect(G.counters.iid).toBe(counter);                    // nothing was made
    expect(G.log.at(-1)!.text).toBe('P0\'s hand is full — Killing Blow is lost.');
  });
});

// ---------------------------------------------------------------------------

describe('an end-of-turn passive', () => {
  it('runs for the Active and for the bench — and for no one else', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.active = makeHero(CALM, '0', 'active', 0);
    me.bench[0] = makeHero(CALM, '0', 'bench', 1);
    me.bench[1] = makeHero(CALM, '0', 'bench', 2); // a corpse
    const rival = makeHero(CALM, '1', 'bench', 3);
    G.players['1'].bench[2] = rival;
    const paige = me.bench[2]!;
    for (const c of [me.active, me.bench[0], me.bench[1], rival, paige]) c!.hp = 5;
    me.bench[1]!.hp = 0; me.bench[1]!.respawnTurnsLeft = 2;
    endTurnEffects(G, '0');
    expect(me.active!.hp).toBe(7);
    expect(me.bench[0]!.hp).toBe(7);
    expect(me.bench[1]!.hp).toBe(0); // the fallen are passed over
    expect(paige.hp).toBe(5);        // a hero without the passive is left alone
    expect(rival.hp).toBe(5);        // the other side's end of turn is another turn
    endTurnEffects(G, '1');
    expect(rival.hp).toBe(7);
  });
});
