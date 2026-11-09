/**
 * The 21 heroes in the game are the cards of docs/hero-design.md §8, under the
 * rules of §2–4: HP from the formula (4 + tank score, the curve's point),
 * Attack 1 or 2, growth by curve (even at Level 2), a printed Retreat of 0–2
 * souls, exactly one skill (1–3 souls, then a 1-turn wait) or one passive, and
 * an ultimate printed on the card as a button — from Level 2, 4, 8 or 12 souls
 * by size, then a 3-turn wait; Victor's and Silver's are charged (20 and 16,
 * their own price; tests/engine/trigger-prompts.spec.ts plays them). No
 * Weakness. Card text names its damage type, and an ultimate is 15 words or
 * fewer. Viscous's skill is The Cube.
 *
 * The table below is the doc's, copied by hand: the data must match it, and
 * the engine must play it.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, HeroCard, PlayerID, UltSize } from '@/engine/types';
import { HEROES, CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { INVALID, perform, type Action } from '@/engine/engine';
import { retreatCost, skillBlocked } from '@/engine/legality';
import { heroAbilities, heroRetreat, kitCost, ultimateCard } from '@/engine/query';
import { grantExp } from '@/engine/expSystem';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { allocatorOf } from '@/engine/ids';
import { makeInstance } from '@/engine/instances';
import { LANE_INCOME, LEVEL_THRESHOLDS, SKILL_COOLDOWN, ULT_COOLDOWN, ULT_COST, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { freshReadyGame } from './_helpers';

/** Each hero as docs/hero-design.md §8 prints it: Attack / HP at Level 1,
 *  growth a level (Attack, HP, Spirit), Retreat, the skill's souls (null for a
 *  passive hero) and the ultimate's size. */
const DOC: Record<string, { atk: number; hp: number; growth: [number, number, number]; retreat: number; skill: number | null; ult: UltSize; charged?: number }> = {
  hero_abrams:     { atk: 2, hp: 7, growth: [1, 2, 0], retreat: 2, skill: null, ult: 'medium' },
  hero_mo_krill:   { atk: 1, hp: 6, growth: [0, 3, 1], retreat: 1, skill: 2,    ult: 'medium' },
  hero_viscous:    { atk: 1, hp: 6, growth: [0, 2, 1], retreat: 1, skill: 3,    ult: 'medium' },
  hero_lady_geist: { atk: 1, hp: 7, growth: [0, 0, 2], retreat: 2, skill: 2,    ult: 'medium' },
  hero_shiv:       { atk: 1, hp: 6, growth: [2, 1, 1], retreat: 1, skill: 2,    ult: 'medium' },
  hero_warden:     { atk: 2, hp: 7, growth: [1, 1, 0], retreat: 1, skill: 2,    ult: 'medium' },
  hero_haze:       { atk: 1, hp: 4, growth: [3, 1, 0], retreat: 1, skill: null, ult: 'large' },
  hero_wraith:     { atk: 1, hp: 4, growth: [3, 1, 0], retreat: 0, skill: 2,    ult: 'medium' },
  hero_vindicta:   { atk: 2, hp: 5, growth: [2, 0, 0], retreat: 0, skill: null, ult: 'medium' },
  hero_seven:      { atk: 1, hp: 4, growth: [0, 1, 3], retreat: 1, skill: 2,    ult: 'large' },
  hero_drifter:    { atk: 2, hp: 6, growth: [2, 1, 0], retreat: 1, skill: null, ult: 'medium' },
  hero_lash:       { atk: 1, hp: 5, growth: [0, 1, 2], retreat: 0, skill: 3,    ult: 'large' },
  hero_mirage:     { atk: 1, hp: 4, growth: [1, 1, 2], retreat: 0, skill: null, ult: 'small' },
  hero_yamato:     { atk: 2, hp: 5, growth: [1, 1, 1], retreat: 0, skill: 2,    ult: 'medium' },
  hero_dynamo:     { atk: 1, hp: 5, growth: [0, 1, 2], retreat: 1, skill: 3,    ult: 'large' },
  hero_kelvin:     { atk: 1, hp: 6, growth: [0, 1, 2], retreat: 1, skill: 3,    ult: 'medium' },
  hero_paige:      { atk: 1, hp: 5, growth: [0, 0, 2], retreat: 1, skill: 2,    ult: 'medium' },
  hero_rem:        { atk: 1, hp: 4, growth: [0, 1, 3], retreat: 0, skill: 2,    ult: 'small' },
  hero_sinclair:   { atk: 1, hp: 4, growth: [0, 1, 2], retreat: 1, skill: 3,    ult: 'medium' },
  // The charged ultimates print their own price; their size is what the effect is worth (half).
  hero_victor:     { atk: 1, hp: 6, growth: [0, 3, 1], retreat: 2, skill: null, ult: 'medium', charged: 20 },
  hero_silver:     { atk: 2, hp: 6, growth: [2, 1, 0], retreat: 1, skill: 2,    ult: 'medium', charged: 16 },
};

/** Growth points a level, by curve (§2). */
const GROWTH_POINTS = { early: 2, mid: 3, late: 4 } as const;
/** The curve's point at Level 1 (§2). */
const CURVE_POINT = { early: 1, mid: 0, late: -1 } as const;

const hero = (id: string) => CARDS_BY_ID[id] as HeroCard;

/** A fresh instance of `id` for `pid`, named by the game's own counters. */
function instance(G: GameState, id: string, pid: PlayerID, zone: CardInstance['zone'], slot: 0 | 1 | 2 | 3): CardInstance {
  return makeInstance(allocatorOf(G), id, pid, zone, slot);
}

/** End the turn of `pid` and begin the other seat's, as the game's turn hooks do. */
function nextTurn(G: GameState, pid: PlayerID): PlayerID {
  const next: PlayerID = pid === '0' ? '1' : '0';
  endTurnEffects(G, pid);
  beginTurn(G, next, G.turnNumber + 1 + G.draftTurnsOffset);
  return next;
}

/** Make `a` as `pid`, failing loudly with the engine's reason when it is refused. */
function act(G: GameState, pid: PlayerID, a: Action) {
  expect(perform(G, pid, a), JSON.stringify(a)).not.toBe(INVALID);
}

describe('the 21 heroes are the hero doc\'s cards', () => {
  it('every hero in the game is in the doc\'s table, and the table is every hero', () => {
    expect(HEROES.map((h) => h.id).sort()).toEqual(Object.keys(DOC).sort());
  });

  it('Attack and HP at Level 1, the growth, the Retreat, the skill\'s souls and the ultimate\'s size are the doc\'s', () => {
    for (const [id, d] of Object.entries(DOC)) {
      const h = hero(id);
      expect([h.atk, h.hp], id).toEqual([d.atk, d.hp]);
      expect([h.growth.atk, h.growth.hp, h.growth.spirit], id).toEqual(d.growth);
      expect(h.retreat, id).toBe(d.retreat);
      const skill = h.skills[0];
      expect(skill === undefined ? null : getAbility(skill)?.souls, id).toBe(d.skill);
      expect(ultimateCard(h.ult)?.size, id).toBe(d.ult);
    }
  });

  it('HP is 4 + the tank score at Level 1, adjusted by the curve; Attack is 1, or 2 for a gun hero with damage 2+; the floors are Attack 1 and HP 4', () => {
    for (const h of HEROES) {
      const { mix, curve, gun } = h.profile;
      const baseAtk = gun && mix.damage >= 2 ? 2 : 1;
      // The curve's point goes on HP or Attack, never below the floors (Rem keeps them).
      expect(h.hp + h.atk, h.id).toBe(Math.max(5, 4 + mix.tank + baseAtk + CURVE_POINT[curve]));
      const onHp = h.hp - (4 + mix.tank);
      const allowed = curve === 'early' ? [0, 1] : curve === 'late' ? [-1, 0] : [0];
      expect(allowed, `${h.id}: HP ${h.hp} for tank ${mix.tank}, ${curve}`).toContain(onHp);
      expect([1, 2], h.id).toContain(h.atk);
      expect(h.hp, h.id).toBeGreaterThanOrEqual(4);
    }
    // The doc's worked examples.
    expect(hero('hero_abrams').hp).toBe(4 + 3);      // tank 3, mid
    expect(hero('hero_lady_geist').hp).toBe(4 + 2 + 1); // tank 2, early: the point on HP
    expect(hero('hero_mo_krill').hp).toBe(4 + 3 - 1); // tank 3, late
    expect(hero('hero_haze').atk).toBe(2 - 1);        // a gun, late: the point off Attack
    expect([hero('hero_rem').atk, hero('hero_rem').hp]).toEqual([1, 4]); // late, but already at the floors
  });

  it('a level adds the curve\'s growth points (2 early, 3 mid, 4 late), and all three curves are even at Level 2', () => {
    for (const h of HEROES) {
      const { mix, curve, gun } = h.profile;
      const g = h.growth;
      expect(g.atk + g.hp + g.spirit, h.id).toBe(GROWTH_POINTS[curve]);
      const baseAtk = gun && mix.damage >= 2 ? 2 : 1;
      // Level 2's points: the formula's, three more — Rem keeps the point the floor gave him (§7).
      const atLevel2 = h.atk + h.hp + g.atk + g.hp + g.spirit;
      expect(atLevel2, h.id).toBe(4 + mix.tank + baseAtk + 3 + (h.id === 'hero_rem' ? 1 : 0));
    }
  });

  it('the engine adds each hero\'s own growth when it levels', () => {
    const G = freshReadyGame();
    for (const h of HEROES) {
      const c = instance(G, h.id, '0', 'bench', 1);
      expect(grantExp(G, c, LEVEL_THRESHOLDS[0]), h.id).toBe(1);
      expect([c.level, c.atkMod, c.hpMax - h.hp, c.hp - h.hp, c.spiritMod], h.id).toEqual([2, h.growth.atk, h.growth.hp, h.growth.hp, h.growth.spirit]);
    }
  });

  it('a hero has exactly one skill or one passive, plus an ultimate; no hero has a Weakness', () => {
    for (const h of HEROES) {
      const kit = heroAbilities(h);
      expect(kit.length, h.id).toBe(1);
      expect(h.skills.length + (h.passives ?? []).length, h.id).toBe(1);
      expect(ultimateCard(h.ult)?.linkedHero, h.id).toBe(h.id);
      expect(Object.keys(h).some((k) => /weak/i.test(k)), h.id).toBe(false);
    }
  });
});

describe('card text names its damage type; an ultimate is one or two effects in 15 words or fewer', () => {
  const texts = HEROES.flatMap((h) => [
    ...heroAbilities(h).map(({ ability }) => ({ id: ability.id, text: ability.text })),
    { id: h.ult!, text: ultimateCard(h.ult)!.text ?? '' },
  ]);

  it('every "damage" is "bullet damage" or "spirit damage" — but for a modifier ("takes +1 damage") and The Cube\'s "no damage"', () => {
    for (const { id, text } of texts) {
      for (const m of text.matchAll(/(\S+) damage/g)) {
        const ok = m[1] === 'bullet' || m[1] === 'spirit' || m[1] === 'no' || /^\+\d+$/.test(m[1]);
        expect(ok, `${id}: "${m[0]}" in "${text}"`).toBe(true);
      }
    }
  });

  it('an ultimate is 15 words or fewer, as the doc writes it', () => {
    for (const h of HEROES) {
      const words = (ultimateCard(h.ult)!.text ?? '').replace(/\{sp:(\d+)\}/g, '$1').split(/\s+/).filter(Boolean);
      expect(words.length, `${h.id}: ${ultimateCard(h.ult)!.text}`).toBeLessThanOrEqual(15);
    }
  });
});

describe('the Retreat costs the leaving hero\'s printed souls', () => {
  it('each hero, standing in the Active slot, retreats for its own price, and the engine charges exactly that', () => {
    for (const h of HEROES) {
      if (h.flags?.benchOnly) continue; // Rem never stands in the lane
      const G = freshReadyGame();
      const me = G.players['0'];
      me.active!.cardId = h.id;
      me.souls = 5;
      expect(heroRetreat(me.active!), h.id).toBe(DOC[h.id].retreat);
      expect(retreatCost(G, '0'), h.id).toBe(DOC[h.id].retreat);
      act(G, '0', { type: 'moveHero', fromSlot: 1, toSlot: 0 });
      expect(me.souls, h.id).toBe(5 - DOC[h.id].retreat);
    }
  });

  it('short of the price the Retreat is refused; Willpower\'s Swift makes Warden\'s next one free', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.active!.cardId = 'hero_abrams';
    me.souls = 1;
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toBe(INVALID); // Abrams: 2
    me.active!.cardId = 'hero_warden';
    me.souls = 2;
    act(G, '0', { type: 'useSkill', heroIid: me.active!.iid, targetIid: me.active!.iid }); // Willpower: 2 souls
    expect(me.souls).toBe(0);
    expect(retreatCost(G, '0')).toBe(0);
    act(G, '0', { type: 'moveHero', fromSlot: 1, toSlot: 0 });
    expect(me.souls).toBe(0);
  });
});

describe('a skill costs its souls, then waits 1 turn', () => {
  it('each hero\'s skill costs the doc\'s souls (kitCost)', () => {
    const G = freshReadyGame();
    for (const h of HEROES) {
      const c = instance(G, h.id, '0', 'bench', 1);
      if (DOC[h.id].skill === null) expect(h.skills, h.id).toEqual([]);
      else expect(kitCost(c), h.id).toBe(DOC[h.id].skill);
    }
  });

  it('it is paid when used, refused a soul short, and ready again on the hero\'s next own turn — SKILL_COOLDOWN, ready in 1 turn', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const paige = me.bench[2]!; // Plot Armor: 2 souls
    const use: Action = { type: 'useSkill', heroIid: paige.iid, targetIid: me.active!.iid };
    me.souls = 1;
    expect(skillBlocked(G, '0', paige, me.active!.iid)).toBe('souls');
    expect(perform(G, '0', use)).toBe(INVALID);
    expect(me.souls).toBe(1);
    me.souls = 2;
    act(G, '0', use);
    expect(me.souls).toBe(0);
    expect(SKILL_COOLDOWN).toBe(1);
    expect(paige.cooldowns?.skill_paige).toBe(SKILL_COOLDOWN);
    expect(skillBlocked(G, '0', paige)).toBe('used');
    // The rival's turn, then Paige's own: the wait has run out, and the income pays for it again.
    let pid = nextTurn(G, '0');
    pid = nextTurn(G, pid);
    expect(pid).toBe('0');
    expect(paige.cooldowns?.skill_paige).toBeUndefined();
    expect(me.souls).toBe(LANE_INCOME);
    expect(skillBlocked(G, '0', paige, me.active!.iid)).toBeNull();
    act(G, '0', use);
    expect(me.souls).toBe(LANE_INCOME - 2);
  });
});

describe('the ultimate is a button on the hero card: from Level 2, 4, 8 or 12 souls by size, then a 3-turn wait', () => {
  it('each hero\'s ultimate costs its size\'s souls — a charged one its own price, before anything has charged it', () => {
    expect(ULT_COST).toEqual({ small: 4, medium: 8, large: 12 });
    const G = freshReadyGame();
    for (const h of HEROES) {
      const c = instance(G, h.id, '0', 'bench', 1);
      expect(kitCost(c, h.ult), h.id).toBe(DOC[h.id].charged ?? ULT_COST[DOC[h.id].ult]);
      expect(ultimateCard(h.ult)?.charged?.cost, h.id).toBe(DOC[h.id].charged);
    }
  });

  it('it is locked below Level 2, refused a soul short of its price, paid when used, and waits 3 of its hero\'s turns', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const haze = me.active!; // Bullet Dance: large, 12 souls
    const use: Action = { type: 'useSkill', heroIid: haze.iid, skillId: 'eff_ult_haze' };
    me.souls = 40;
    expect(skillBlocked(G, '0', haze, undefined, 'eff_ult_haze')).toBe('locked');
    expect(perform(G, '0', use)).toBe(INVALID);
    haze.level = ULT_UNLOCK_LEVEL;
    me.souls = ULT_COST.large - 1;
    expect(skillBlocked(G, '0', haze, undefined, 'eff_ult_haze')).toBe('souls');
    expect(perform(G, '0', use)).toBe(INVALID);
    me.souls = ULT_COST.large;
    act(G, '0', use);
    expect(me.souls).toBe(0);
    expect(haze.cooldowns?.eff_ult_haze).toBe(ULT_COOLDOWN);
    expect(ULT_COOLDOWN).toBe(3);
    // Haze's next two turns it waits, with the souls in hand; on the third it is ready again.
    let pid: PlayerID = '0';
    for (const left of [2, 1]) {
      pid = nextTurn(G, nextTurn(G, pid));
      expect(pid).toBe('0');
      me.souls = 40;
      expect(haze.cooldowns?.eff_ult_haze).toBe(left);
      expect(skillBlocked(G, '0', haze, undefined, 'eff_ult_haze')).toBe('cooldown');
    }
    pid = nextTurn(G, nextTurn(G, pid));
    me.souls = 40;
    expect(skillBlocked(G, '0', haze, undefined, 'eff_ult_haze')).toBeNull();
    act(G, '0', use);
    expect(me.souls).toBe(40 - ULT_COST.large);
  });

  it('the skill and the ultimate share the hero\'s one ability a turn', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const lash = me.bench[1]!;
    lash.level = ULT_UNLOCK_LEVEL;
    me.souls = 40;
    act(G, '0', { type: 'useSkill', heroIid: lash.iid }); // Ground Strike: 3
    expect(me.souls).toBe(37);
    expect(skillBlocked(G, '0', lash, undefined, 'eff_ult_lash')).toBe('used');
  });
});

describe('Viscous\'s skill is The Cube: one of his heroes takes no damage until his next turn', () => {
  /** P0 with Viscous on the bench in Vindicta's place, Haze the Active. */
  function withViscous() {
    const G = freshReadyGame();
    const me = G.players['0'];
    const viscous = instance(G, 'hero_viscous', '0', 'bench', 1);
    me.bench[0] = viscous;
    return { G, me, viscous, haze: me.active! };
  }

  it('costs 3 souls, aims at any hero of his side — himself too — and never at an enemy', () => {
    const { G, me, viscous, haze } = withViscous();
    expect(kitCost(viscous)).toBe(3);
    me.souls = 3;
    expect(skillBlocked(G, '0', viscous, G.players['1'].active!.iid)).toBe('target');
    expect(skillBlocked(G, '0', viscous, viscous.iid)).toBeNull();
    act(G, '0', { type: 'useSkill', heroIid: viscous.iid, targetIid: haze.iid });
    expect(me.souls).toBe(0);
    expect(haze.statuses.find((s) => s.id === 'invulnerable')).toMatchObject({ duration: 1 });
  });

  it('the cubed hero takes no damage on the rival\'s turn — not its attack, not its spirit — and from its own next turn it does', () => {
    const { G, me, viscous, haze } = withViscous();
    me.souls = 3;
    act(G, '0', { type: 'useSkill', heroIid: viscous.iid, targetIid: haze.iid });
    const pid = nextTurn(G, '0'); // the rival's turn
    expect(pid).toBe('1');
    const rival = G.players['1'];
    const hp = haze.hp;
    // Seven's Lightning Ball hits every enemy: all but the cube.
    const seven = rival.bench[2]!;
    const viscousHp = viscous.hp;
    act(G, '1', { type: 'useSkill', heroIid: seven.iid }); // 2 of the turn's 5 souls
    expect(haze.hp).toBe(hp);
    expect(viscous.hp).toBe(viscousHp - 1);
    act(G, '1', { type: 'attack' }); // Abrams swings at the cubed Haze
    expect(haze.hp).toBe(hp);
    expect(G.fx.some((e) => e.kind === 'immune' && e.iid === haze.iid && e.what === 'damage')).toBe(true);
    // Viscous's next turn: the Cube is gone.
    nextTurn(G, '1');
    expect(haze.statuses.some((s) => s.id === 'invulnerable')).toBe(false);
  });
});
