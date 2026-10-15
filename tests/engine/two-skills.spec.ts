import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { ABILITIES_BY_ID, type HeroAbilityDef } from '@/abilities';
import { CARDS_BY_ID, HEROES } from '@/cards';
import { AI_DECKS_BY_NAME } from '@/decks/aiDecks';
import { STARTER_DECK_AI } from '@/decks/starter';
import { enumerateAIMoves } from '@/ai/heuristic';
import { damageUnit } from '@/engine/damage';
import { resolve } from '@/engine/death';
import { DeadlockGame } from '@/engine/game';
import { INVALID, perform } from '@/engine/engine';
import { blocked, legalActions, skillBlocked, skillTargets } from '@/engine/legality';
import { isRespawning, liveBoardCards, otherPlayer, heroAbilities } from '@/engine/query';
import { registerAbilities } from '@/engine/registry';
import { beginTurn } from '@/engine/actions/turn';
import { clearTurnFlags, tickCooldowns } from '@/engine/statusOps';
import type { CardInstance, GameState, HeroCard, PlayerID } from '@/engine/types';
import { setMatchConfig } from '@/storage/matchConfig';
import { freshReadyGame, makeHero } from './_helpers';

// A hero may carry one or two skills, each with its own cooldown, and uses one
// of them a turn. No hero of the real roster has two yet, so these specs play
// throwaway cards registered here — the real roster is left as it is.

const TWIN = 'hero_test_twin';   // two skills: Test Bolt, then Test Surge
const COOL = 'hero_test_cool';   // one skill, with a cooldown of 2
const BOLT = 'test_skill_bolt';
const SURGE = 'test_skill_surge';
const CHILL = 'test_skill_chill';

/** 1 spirit damage to the rival Active: takes a target. */
const bolt: HeroAbilityDef = {
  id: BOLT, name: 'Test Bolt', text: '1 spirit dmg to the enemy Active.',
  trigger: 'activate', target: 'enemyActive', base: 1,
  run: (G, _ctx, { target }) => { if (target) damageUnit(G, target, 1, 'spirit'); },
};
/** 2 spirit damage to every rival hero: takes no target. */
const surge: HeroAbilityDef = {
  id: SURGE, name: 'Test Surge', text: '2 spirit dmg to every enemy hero.',
  trigger: 'activate', target: 'noTarget', base: 2,
  run: (G, ctx) => { for (const e of liveBoardCards(G.players[otherPlayer(ctx.movingPlayer)])) damageUnit(G, e, 2, 'spirit'); },
};
/** 2 spirit damage to the rival Active, then cooling down for 2 turns. */
const chill: HeroAbilityDef = {
  id: CHILL, name: 'Test Chill', text: '2 spirit dmg to the enemy Active. Cooldown 2.',
  trigger: 'activate', target: 'enemyActive', base: 2, cooldown: 2,
  run: (G, _ctx, { target }) => { if (target) damageUnit(G, target, 2, 'spirit'); },
};

const throwaway = (id: string, name: string, skills: string[]): HeroCard => ({ id, name, type: 'hero', rarity: 3, atk: 2, hp: 8, skills });

beforeAll(() => {
  registerAbilities([bolt, surge, chill]);
  CARDS_BY_ID[TWIN] = throwaway(TWIN, 'Twin', [BOLT, SURGE]);
  CARDS_BY_ID[COOL] = throwaway(COOL, 'Cool', [CHILL]);
});
afterAll(() => {
  delete CARDS_BY_ID[TWIN];
  delete CARDS_BY_ID[COOL];
});

function runMove(name: string, G: GameState, pid: PlayerID, ...args: any[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}
const ctxFor = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as any;

/** P0's Active is the twin, with souls to spare; the rival side stands 30 deep. */
function twinGame() {
  const G = freshReadyGame();
  const me = G.players['0'];
  me.souls = 10;
  const twin = makeHero(TWIN, '0', 'active', 0);
  me.active = twin;
  const rival = G.players['1'].active!;
  rival.hp = rival.hpMax = 30;
  for (const b of G.players['1'].bench) if (b) b.hp = b.hpMax = 30;
  const benched = G.players['1'].bench.find((b): b is CardInstance => !!b)!;
  return { G, me, twin, rival, benched };
}

const useSkill = (G: GameState, twin: CardInstance, skillId?: string, targetIid?: string) =>
  perform(G, '0', { type: 'useSkill', heroIid: twin.iid, skillId, targetIid });

/** A boardgame.io match with the throwaway heroes on P0's board: the twin
 *  Active, the cool hero and the real Lash and Paige on the bench. */
function twinClient() {
  setMatchConfig({
    playerDeck: [], heroPreferences: [null, null, null, null],
    story: {
      playerHeroes: [TWIN, COOL, 'hero_lash', 'hero_paige'],
      playerDeck: AI_DECKS_BY_NAME.aggro,
      enemyHeroes: STARTER_DECK_AI.heroes,
      enemyDeck: AI_DECKS_BY_NAME.control,
      enemyBuff: { atk: 0, hp: 0 },
    },
  });
  const c = Client({ game: DeadlockGame, numPlayers: 2 });
  c.start();
  const G = () => c.getState()!.G as GameState;
  const endTurns = (n: number) => { for (let i = 0; i < n; i++) c.moves.endTurn?.(); };
  return { c, G, endTurns, moves: c.moves as any };
}

describe('two skills on one hero', () => {
  it('legalActions lists both skills of a two-skill hero, each with its targets', () => {
    const { G, twin, rival } = twinGame();
    const mine = legalActions(G, '0').filter((a) => a.type === 'useSkill' && a.heroIid === twin.iid);
    expect(mine).toEqual([
      { type: 'useSkill', heroIid: twin.iid, skillId: BOLT, targetIid: rival.iid },
      { type: 'useSkill', heroIid: twin.iid, skillId: SURGE }, // aimed at nothing, so no target
    ]);
    for (const a of mine) expect(blocked(G, '0', a), JSON.stringify(a)).toBeNull();
    expect(skillTargets(G, '0', twin, BOLT)).toEqual([rival]);
    expect(skillTargets(G, '0', twin, SURGE)).toBe('none');
    expect(skillTargets(G, '0', twin)).toEqual([rival]); // the first, when none is named
  });

  it('a hero uses one skill a turn: the other is blocked by "used"', () => {
    const { G, twin, rival } = twinGame();
    expect(skillBlocked(G, '0', twin, undefined, BOLT)).toBeNull();
    expect(skillBlocked(G, '0', twin, undefined, SURGE)).toBeNull();
    expect(useSkill(G, twin, BOLT, rival.iid)).not.toBe(INVALID);
    expect(skillBlocked(G, '0', twin, undefined, BOLT)).toBe('used');
    expect(skillBlocked(G, '0', twin, undefined, SURGE)).toBe('used');
    expect(blocked(G, '0', { type: 'useSkill', heroIid: twin.iid, skillId: SURGE })).toBe('used');
    const before = JSON.stringify(G);
    expect(useSkill(G, twin, SURGE)).toBe(INVALID);
    expect(JSON.stringify(G)).toBe(before);
    // …and what is on the hero's sheet: neither skill is offered, and the hero gave up its attack.
    expect(legalActions(G, '0').some((a) => a.type === 'useSkill' && a.heroIid === twin.iid)).toBe(false);
    expect(blocked(G, '0', { type: 'attack' })).toBe('skill');
  });

  it('on the owner\'s next turn both skills are available again', () => {
    const { c, G, endTurns, moves } = twinClient();
    const twin = G().players['0'].active!;
    const rival = G().players['1'].active!;
    expect(twin.cardId).toBe(TWIN);
    moves.useSkill(twin.iid, rival.iid);                                // turn 1: the first skill
    expect(G().players['0'].active!.skillUsedThisTurn).toBe(true);
    expect(skillBlocked(G(), '0', G().players['0'].active!, undefined, SURGE)).toBe('used');
    const stuck = JSON.stringify(G());
    moves.useSkill(twin.iid, undefined, SURGE);                         // the second, the same turn: refused
    expect(JSON.stringify(G())).toBe(stuck);

    endTurns(2);                                                        // P1's turn, then P0's again
    expect(c.getState()!.ctx.currentPlayer).toBe('0');
    const back = G().players['0'].active!;
    expect(back.skillUsedThisTurn).toBe(false);
    expect(back.lastSkillUsed).toBeUndefined();
    expect(skillBlocked(G(), '0', back, undefined, BOLT)).toBeNull();
    expect(skillBlocked(G(), '0', back, undefined, SURGE)).toBeNull();
    moves.useSkill(twin.iid, undefined, SURGE);                         // now the second
    expect(G().players['0'].active!.lastSkillUsed).toBe(SURGE);
    expect(skillBlocked(G(), '0', G().players['0'].active!, undefined, BOLT)).toBe('used');
  });
});

describe('a skill\'s cooldown', () => {
  it('is "cooldown" on the owner\'s next turn and legal the turn after; the field goes when it empties', () => {
    const { G, endTurns, moves, c } = twinClient();
    const cool = G().players['0'].bench[0]!;
    const lash = G().players['0'].bench[1]!;
    const rival = G().players['1'].active!;
    expect(cool.cardId).toBe(COOL);
    expect('cooldowns' in cool).toBe(false);

    moves.useSkill(cool.iid, rival.iid);                                // turn 1: used, and cooling for 2
    expect(G().players['0'].bench[0]!.cooldowns).toEqual({ [CHILL]: 2 });

    endTurns(2);                                                        // turn 2 (P0): one turn of cooldown left
    expect(c.getState()!.ctx.currentPlayer).toBe('0');
    expect(G().players['0'].bench[0]!.skillUsedThisTurn).toBe(false);   // so it is the cooldown that stops it, not "used"
    expect(G().players['0'].bench[0]!.cooldowns).toEqual({ [CHILL]: 1 });
    expect(skillBlocked(G(), '0', G().players['0'].bench[0]!, rival.iid)).toBe('cooldown');
    expect(blocked(G(), '0', { type: 'useSkill', heroIid: cool.iid, targetIid: rival.iid })).toBe('cooldown');
    const stuck = JSON.stringify(G());
    moves.useSkill(cool.iid, rival.iid);
    expect(JSON.stringify(G())).toBe(stuck);                            // refused, untouched
    // A one-skill hero without a cooldown never gains the field.
    moves.useSkill(lash.iid, G().players['1'].active!.iid);
    expect('cooldowns' in G().players['0'].bench[1]!).toBe(false);

    endTurns(2);                                                        // turn 3: the clock reached 0
    const warm = G().players['0'].bench[0]!;
    expect('cooldowns' in warm).toBe(false);
    expect(skillBlocked(G(), '0', warm, rival.iid)).toBeNull();
    moves.useSkill(cool.iid, G().players['1'].active!.iid);
    expect(G().players['0'].bench[0]!.cooldowns).toEqual({ [CHILL]: 2 });
    expect('cooldowns' in G().players['0'].bench[1]!).toBe(false);
  });

  it('is not cleared by a fall, and counts the owner\'s turns whether the hero is up or down', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const cool = makeHero(COOL, '0', 'bench', 1);
    me.bench[0] = cool;
    cool.cooldowns = { [CHILL]: 3 };
    damageUnit(G, cool, 99, 'pure');
    resolve(G);
    expect(isRespawning(cool)).toBe(true);
    expect(cool.cooldowns).toEqual({ [CHILL]: 3 });          // the fall left it as it was
    beginTurn(G, '0', 4);                                    // P0's turn starts: the timer counts it down, corpse or not
    expect(cool.cooldowns).toEqual({ [CHILL]: 2 });
  });

  it('ticks every entry, drops the ones that reach 0, and drops an empty map (a merged Rem ticks too)', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    const [a, b, c] = [ps.active!, ps.bench[0]!, ps.bench[1]!];
    a.cooldowns = { x: 1, y: 3 };
    b.cooldowns = { x: 1 };
    const rem = makeHero('hero_rem', '0', 'equipment', 0);
    rem.remMergeTurnsLeft = 3;
    rem.cooldowns = { x: 2 };
    c.attached = [rem];
    tickCooldowns(ps);
    expect(a.cooldowns).toEqual({ y: 2 });
    expect('cooldowns' in b).toBe(false);
    expect(rem.cooldowns).toEqual({ x: 1 });
    expect(ps.bench[2]!.cooldowns).toBeUndefined();          // nobody else gained a field
    expect('cooldowns' in ps.bench[2]!).toBe(false);
  });
});

describe('a bare useSkill', () => {
  it('means the hero\'s first skill — the action and the move', () => {
    // The action.
    const one = twinGame();
    const hp = one.rival.hp;
    expect(useSkill(one.G, one.twin, undefined, one.rival.iid)).not.toBe(INVALID);
    expect(one.rival.hp).toBe(hp - 1);                       // Bolt, not Surge (which would also hit the bench)
    expect(one.benched.hp).toBe(30);
    expect(one.twin.lastSkillUsed).toBe(BOLT);
    expect(one.G.action).toMatchObject({ kind: 'skill', by: '0', cardId: TWIN, abilityId: BOLT });
    // The move: [hero, target] is the first skill; the skill follows as the third argument.
    const two = twinGame();
    expect(runMove('useSkill', two.G, '0', two.twin.iid, two.rival.iid)).not.toBe('INVALID_MOVE');
    expect(two.rival.hp).toBe(29);
    expect(two.twin.lastSkillUsed).toBe(BOLT);
    // Naming the first skill is the same as leaving it off.
    const three = twinGame();
    expect(runMove('useSkill', three.G, '0', three.twin.iid, three.rival.iid, BOLT)).not.toBe('INVALID_MOVE');
    expect(three.rival.hp).toBe(29);
    // The second skill, named, with no target in the target's place.
    const four = twinGame();
    expect(runMove('useSkill', four.G, '0', four.twin.iid, undefined, SURGE)).not.toBe('INVALID_MOVE');
    expect([four.rival.hp, four.benched.hp]).toEqual([28, 28]);
    expect(four.twin.lastSkillUsed).toBe(SURGE);
    expect(four.G.action).toMatchObject({ kind: 'skill', abilityId: SURGE });
  });

  it('sets no cooldowns field for a skill without one', () => {
    const { G, twin, rival } = twinGame();
    useSkill(G, twin, BOLT, rival.iid);
    expect('cooldowns' in twin).toBe(false);
  });

  it('forgets the skill with the turn\'s other flags, and when the hero falls', () => {
    const a = twinGame();
    useSkill(a.G, a.twin, SURGE);
    expect(a.twin.lastSkillUsed).toBe(SURGE);
    clearTurnFlags(a.G.players['0']);
    expect(a.twin.lastSkillUsed).toBeUndefined();
    expect(a.twin.skillUsedThisTurn).toBe(false);

    const b = twinGame();
    useSkill(b.G, b.twin, SURGE);
    damageUnit(b.G, b.twin, 99, 'pure');
    resolve(b.G);
    expect(isRespawning(b.twin)).toBe(true);
    expect(b.twin.lastSkillUsed).toBeUndefined();
  });
});

describe('a skill the hero does not have', () => {
  it('is "noSkill", and perform refuses it with G untouched', () => {
    const { G, twin, rival } = twinGame();
    const before = JSON.stringify(G);
    for (const skillId of ['skill_kelvin', 'nope', '', 7 as unknown as string, null as unknown as string]) {
      expect(skillBlocked(G, '0', twin, rival.iid, skillId), String(skillId)).toBe('noSkill');
      expect(skillTargets(G, '0', twin, skillId), String(skillId)).toEqual([]);
      expect(blocked(G, '0', { type: 'useSkill', heroIid: twin.iid, targetIid: rival.iid, skillId }), String(skillId)).toBe('noSkill');
      expect(perform(G, '0', { type: 'useSkill', heroIid: twin.iid, targetIid: rival.iid, skillId }), String(skillId)).toBe(INVALID);
      expect(runMove('useSkill', G, '0', twin.iid, rival.iid, skillId), String(skillId)).toBe('INVALID_MOVE');
    }
    expect(JSON.stringify(G)).toBe(before);
  });

  it('a hero with no skills has none to name, the default included', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!; // passive only
    G.players['0'].souls = 5;
    expect(skillBlocked(G, '0', haze)).toBe('noSkill');
    expect(skillBlocked(G, '0', haze, undefined, 'skill_kelvin')).toBe('noSkill');
    expect(legalActions(G, '0').some((a) => a.type === 'useSkill' && a.heroIid === haze.iid)).toBe(false);
  });
});

describe('Echo Shard', () => {
  const shard = (): CardInstance => ({
    iid: 'echo-1', cardId: 'echo_shard', ownerId: '0', zone: 'hand', attached: [],
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
  });
  const play = (G: GameState) => {
    G.players['0'].hand.push(shard());
    expect(perform(G, '0', { type: 'playCard', cardIid: 'echo-1' })).not.toBe(INVALID);
  };

  it('repeats the skill the hero used this turn — the second one, when that was used', () => {
    const { G, twin, rival, benched } = twinGame();
    useSkill(G, twin, SURGE);
    expect([rival.hp, benched.hp]).toEqual([28, 28]);
    play(G);
    expect([rival.hp, benched.hp]).toEqual([26, 26]);        // Surge again (Bolt would have spared the bench)
  });

  it('repeats the first skill when that was the one used', () => {
    const { G, twin, rival, benched } = twinGame();
    useSkill(G, twin, BOLT, rival.iid);
    expect(rival.hp).toBe(29);
    play(G);
    expect([rival.hp, benched.hp]).toEqual([28, 30]);
  });

  it('casts the first skill when the hero used none this turn', () => {
    const { G, rival, benched } = twinGame();
    play(G);
    expect([rival.hp, benched.hp]).toEqual([29, 30]);
  });

  it('still fizzles on a hero with no skill', () => {
    const G = freshReadyGame(); // P0 Active = Haze, passive only
    const foe = G.players['1'].active!;
    const hp = foe.hp;
    expect(() => ABILITIES_BY_ID.eff_echo_shard.run(G, { movingPlayer: '0' }, {})).not.toThrow();
    expect(foe.hp).toBe(hp);
    expect(G.log.some((l) => l.text === 'Echo Shard fizzled — hero has no skill.')).toBe(true);
  });
});

describe('the AI with a two-skill hero', () => {
  it('names the second skill in the move, and leaves the first unnamed', () => {
    const { G, twin, rival } = twinGame();
    G.players['0'].hand = [];
    for (const lookahead of [false, true]) {
      const moves = enumerateAIMoves(G, ctxFor('0'), lookahead).filter((m) => m.move === 'useSkill' && m.args[0] === twin.iid);
      expect(moves.map((m) => m.args), `lookahead ${lookahead}`).toContainEqual([twin.iid, rival.iid]);
      expect(moves.map((m) => m.args), `lookahead ${lookahead}`).toContainEqual([twin.iid, undefined, SURGE]);
      // Everything it offers, the engine takes.
      for (const m of moves) expect(runMove(m.move, structuredClone(G), '0', ...m.args), JSON.stringify(m.args)).not.toBe('INVALID_MOVE');
    }
  });

  it('plays a two-skill hero through a whole turn without a refused move', () => {
    const { G } = twinGame();
    for (let i = 0; i < 6; i++) {
      const best = enumerateAIMoves(G, ctxFor('0'))[0];
      if (!best || best.move === 'endTurn') break;
      expect(runMove(best.move, G, '0', ...best.args), `${best.move}(${JSON.stringify(best.args)})`).not.toBe('INVALID_MOVE');
    }
  });
});

describe('what a hero card prints', () => {
  // Every skill and passive, as the hero card printed it before the hero's
  // text moved onto the abilities: moving it changed no word. Since then the
  // numbers that grow with Spirit Power carry their `{sp:N}` mark (the card
  // prints N in purple, card/scaling.ts) in place of "(3 + Spirit)" and the
  // like — and Paige's says Bullet Resist, which is what the skill grants.
  const PRINTED: Record<string, [kind: 'skill' | 'passive', name: string, text: string]> = {
    hero_abrams: ['passive', "Infernal Resilience", "Heals 1 at start of own turn while Active."],
    hero_haze: ['passive', "Fixation", "After Haze attacks, she gains Extra Attack 1 this turn."],
    hero_mo_krill: ['passive', "Burrow", "Cleanses all debuffs from self at start of own turn."],
    hero_rem: ['skill', "Lil Helpers", "Merge into an ally as a buff: heal {sp:3} and grant +{sp:1} max HP for 3 turns, then return to the bench."],
    hero_shiv: ['passive', "Serrated Knives", "Attacks apply Bleed 2 for 2 turns."],
    hero_vindicta: ['passive', "Flight", "Takes 1 less bullet damage from all sources."],
    hero_wraith: ['passive', "Mixed Bullets", "Attacks deal Bullet Power (bullet) + {sp:0} (spirit)."],
    hero_dynamo: ['skill', "Rejuvenating Aurora", "Heal an ally 2 and grant +{sp:1/2} Bullet Power for 2 turns."],
    hero_kelvin: ['skill', "Frost Grenade", "{sp:1} spirit dmg to enemy Active + heal your Active 2."],
    hero_lady_geist: ['skill', "Life Drain", "Deal {sp:3} spirit to any enemy and heal for half the damage dealt."],
    hero_lash: ['skill', "Ground Strike", "{sp:1} spirit dmg + Vulnerable (take +1 dmg) for 1 turn."],
    hero_paige: ['skill', "Plot Armor", "Shield 2 on an ally and grant +{sp:1/2} Bullet Resist for 2 turns."],
    hero_seven: ['skill', "Static Charge", "{sp:1} spirit dmg + Charged 2 — Stun 1 turn on expiry."],
    hero_sinclair: ['skill', "Vexing Bolt", "{sp:2} spirit dmg to any enemy."],
    hero_viscous: ['skill', "The Cube", "Gain Unstoppable 1 + heal 1."],
    hero_yamato: ['skill', "Power Slash", "{sp:1} spirit dmg to any enemy."],
    hero_warden: ['skill', "Willpower", "Shield 3 on self."],
    hero_mirage: ['passive', "Djinn's Mark", "Attacks apply 1 stack of Djinn's Mark (max 4) for 3 turns. Mark detonates at max stacks or on expiry for 3 spirit dmg per stack."],
    hero_drifter: ['passive', "Bloodscent", "Heals for half the damage his attacks deal (bullet lifesteal)."],
  };

  it('heroAbilities lists skills, then passives, with names and texts, for every hero', () => {
    expect(Object.keys(PRINTED).sort()).toEqual(HEROES.map((h) => h.id).sort());
    for (const hero of HEROES) {
      const kit = heroAbilities(hero);
      expect(kit.length, hero.id).toBeGreaterThan(0);
      expect(kit.map((x) => x.ability.id), hero.id).toEqual([...hero.skills, ...(hero.passives ?? [])]);
      expect(kit.map((x) => x.kind), hero.id).toEqual([
        ...hero.skills.map(() => 'skill'), ...(hero.passives ?? []).map(() => 'passive'),
      ]);
      for (const { ability } of kit) {
        expect(ability.name.length, `${hero.id} ${ability.id} name`).toBeGreaterThan(0);
        expect(ability.text.length, `${hero.id} ${ability.id} text`).toBeGreaterThan(0);
      }
      expect(kit.map((x) => [x.kind, x.ability.name, x.ability.text]), hero.id).toEqual([PRINTED[hero.id]]);
      expect(hero.skills.length, hero.id).toBeLessThanOrEqual(2);
    }
  });

  it('a hero card has no abilityName and no text of its own any more', () => {
    for (const hero of HEROES) {
      expect('abilityName' in hero, hero.id).toBe(false);
      expect('text' in hero, hero.id).toBe(false);
      expect('skill' in hero, hero.id).toBe(false);
      expect(Array.isArray(hero.skills), hero.id).toBe(true);
    }
  });

  it('each ability\'s name is the one its prompt has always opened with (the sheet and the coach name the same skill)', () => {
    for (const hero of HEROES) {
      for (const { ability } of heroAbilities(hero)) {
        const head = (ability.prompt ?? '').split(' — ')[0].trim();
        const named = head.startsWith(`${hero.name} `) ? head.slice(hero.name.length + 1) : head;
        expect(ability.name, ability.id).toBe(named);
      }
    }
  });
});
