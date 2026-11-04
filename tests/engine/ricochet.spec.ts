/**
 * Ricochet N (docs/engine-model.md, "Ricochet"): a swing that lands bounces,
 * and every other living enemy hero takes N bullet damage and the swing's
 * on-hit debuffs. Each swing bounces, Extra Attacks too, and a bounce never
 * bounces again. The bearer's own heals and chains stay with the swing. It
 * comes from the Ricochet item (Ricochet 2 while worn: the `ricochet` hook) and
 * from Split Shot (the `ricochet` status, for the turn).
 *
 * Board (freshReadyGame): P0's Active is made Dynamo (3 Bullet Power, no
 * passive, one swing) unless a test needs a passive of its own;
 *                         P1 Abrams (active) · Dynamo / Kelvin / Seven, all at 20 HP.
 */
import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import type { CardInstance, GameState, HitFx, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { STATUSES_BY_ID } from '@/statuses';
import { EXP_ON_KILL } from '@/engine/constants';
import { INVALID, perform } from '@/engine/engine';
import { attackAll } from '@/engine/actions/attack';
import { endTurnEffects } from '@/engine/actions/turn';
import { forecastAttack } from '@/engine/forecast';
import { ricochetPower } from '@/engine/query';
import { addStatus, grantExtraAttacks } from '@/engine/statusOps';
import { enumerateAIMoves } from '@/ai/heuristic';
import { statusOfKeyword } from '@/ui/card/RuleText';
import { forecastMismatches } from './fuzz/forecast';
import { freshReadyGame, makeAttack, makeHero, nextTestIid } from './_helpers';

/** Put a copy of `cardId` in `pid`'s hand with souls to spare; returns it. */
function inHand(G: GameState, pid: PlayerID, cardId: string): CardInstance {
  const card = {
    iid: nextTestIid('h'), cardId, ownerId: pid, zone: 'hand' as const, attached: [],
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
  };
  G.players[pid].hand.push(card);
  G.players[pid].souls = 10;
  return card;
}

function play(G: GameState, cardId: string, targetIid?: string) {
  const card = inHand(G, '0', cardId);
  return perform(G, '0', { type: 'playCard', cardIid: card.iid, targetIid });
}

function wear(hero: CardInstance, cardId: string) {
  hero.attached = [...(hero.attached ?? []), {
    iid: nextTestIid('e'), cardId, ownerId: hero.ownerId, zone: 'equipment' as CardInstance['zone'], attached: [],
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
  }];
}

const status = (c: CardInstance, id: string) => c.statuses.find((s) => s.id === id);
const hps = (cs: CardInstance[]) => cs.map((c) => c.hp);
const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as unknown as Ctx;

/** P0's Active becomes `hero` wearing `gear`; every P1 hero stands at 20 HP. */
function lane(hero = 'hero_dynamo', ...gear: string[]) {
  const G = freshReadyGame();
  const atk = G.players['0'].active = makeHero(hero, '0', 'active', 0);
  for (const id of gear) wear(atk, id);
  const foe = G.players['1'];
  const bench = foe.bench.filter((b): b is CardInstance => !!b);
  for (const c of [foe.active!, ...bench]) { c.hpMax = 20; c.hp = 20; }
  return { G, atk, abrams: foe.active!, bench, enemies: [foe.active!, ...bench] };
}

/** The hits the stream took from `from` on, of one tag if one is named. */
const hitsSince = (G: GameState, from: number, tag?: string) =>
  G.fx.slice(from).filter((e): e is HitFx => e.kind === 'hit' && (tag === undefined || e.tag === tag));
const swingsSince = (G: GameState, from: number) => G.fx.slice(from).filter((e) => e.kind === 'swing');

describe('Ricochet: a swing that lands bounces to every other enemy hero', () => {
  it('the worn item is Ricochet 2: each bench hero takes 2 bullet damage, once, and the target only its swing', () => {
    const { G, atk, abrams, bench } = lane('hero_dynamo', 'ricochet');
    expect(ricochetPower(atk)).toBe(2);
    const fx = G.fx.length;
    makeAttack(G, '0');
    expect(abrams.hp).toBe(17);
    expect(hps(bench)).toEqual([18, 18, 18]);
    // One bounce to each other hero, filed as a proc off the swing; none bounces on.
    const bounces = hitsSince(G, fx, 'ricochet');
    expect(bounces.map((e) => e.iid)).toEqual(bench.map((b) => b.iid));
    for (const e of bounces) expect(e).toMatchObject({ amount: 2, type: 'attack', cast: 'proc', source: { iid: atk.iid } });
    expect(G.log.map((l) => l.text)).toContain('Dynamo (Ricochet) → Kelvin: 2 bullet dmg (Kelvin 18 HP).');
  });

  it('a swing absorbed to 0 does not bounce', () => {
    const { G, abrams, bench } = lane('hero_dynamo', 'ricochet');
    addStatus(G, abrams, 'shield', 5, 999);
    const fx = G.fx.length;
    makeAttack(G, '0');
    expect(abrams.hp).toBe(20);
    expect(hps(bench)).toEqual([20, 20, 20]);
    expect(hitsSince(G, fx, 'ricochet')).toEqual([]);
  });

  it('a bounce is bullet damage: each hero meets it with its own Bullet Resist', () => {
    const { G, bench } = lane('hero_dynamo', 'ricochet');
    addStatus(G, bench[1], 'bullet_resist', 1, 2);
    makeAttack(G, '0');
    expect(hps(bench)).toEqual([18, 19, 18]);
  });

  it('a bench hero under a Dome is skipped', () => {
    const { G, bench } = lane('hero_dynamo', 'ricochet');
    addStatus(G, bench[0], 'dome', 1, 1);
    makeAttack(G, '0');
    expect(hps(bench)).toEqual([20, 18, 18]);
  });

  it('with reach the swing names a bench hero, and the bounce takes in the Active', () => {
    const { G, abrams, bench } = lane('hero_dynamo', 'ricochet', 'long_range');
    expect(perform(G, '0', { type: 'attack', targetIid: bench[1].iid })).not.toBe(INVALID);
    expect(abrams.hp).toBe(18);
    expect(hps(bench)).toEqual([18, 17, 18]);
  });

  it('Extra Attack 1: the bench is bounced twice', () => {
    const { G, atk, abrams, bench } = lane('hero_dynamo', 'ricochet');
    grantExtraAttacks(atk, 1);
    const fx = G.fx.length;
    makeAttack(G, '0');
    expect(swingsSince(G, fx)).toHaveLength(2);
    expect(abrams.hp).toBe(14);
    expect(hps(bench)).toEqual([16, 16, 16]);
    expect(hitsSince(G, fx, 'ricochet')).toHaveLength(6);
  });

  it("Haze's Bullet Dance volley (attackAll) does not ricochet: each hero takes its own swing and no more", () => {
    const { G, atk, enemies } = lane('hero_dynamo', 'ricochet');
    const fx = G.fx.length;
    attackAll(G, atk);
    expect(hps(enemies)).toEqual([17, 17, 17, 17]);
    expect(hitsSince(G, fx, 'ricochet')).toEqual([]);
  });
});

describe('What spreads with the bounce, and what stays with the swing', () => {
  it("Toxic Bullets' Bleed and Slowing Bullets' Root land on every bounce target", () => {
    const { G, enemies } = lane('hero_dynamo', 'ricochet', 'toxic_bullets', 'slowing_bullets');
    makeAttack(G, '0');
    for (const c of enemies) {
      expect(status(c, 'bleed'), c.cardId).toMatchObject({ value: 1 });
      expect(status(c, 'rooted'), c.cardId).toBeDefined();
    }
  });

  it("the passives' debuffs spread too: Shiv's Serrated Knives Bleed, Mirage's Djinn's Mark", () => {
    const shiv = lane('hero_shiv', 'ricochet');
    makeAttack(shiv.G, '0');
    for (const c of shiv.enemies) expect(status(c, 'bleed'), c.cardId).toMatchObject({ value: 2 });
    const mirage = lane('hero_mirage', 'ricochet');
    makeAttack(mirage.G, '0');
    for (const c of mirage.enemies) expect(status(c, 'djinns_mark'), c.cardId).toMatchObject({ value: 1 });
  });

  it('Bullet Lifesteal, and Leech, heal once a swing, not once a bounce', () => {
    for (const item of ['bullet_lifesteal', 'leech']) {
      const { G, atk } = lane('hero_dynamo', 'ricochet', item);
      atk.hpMax = 20; atk.hp = 10;
      makeAttack(G, '0');
      expect(atk.hp, item).toBe(12);
    }
  });

  it('Restorative Shot, Active Reload, Frenzy and Spiritual Overflow fire once a swing', () => {
    for (const item of ['restorative_shot', 'active_reload', 'frenzy', 'spiritual_overflow']) {
      const { G, atk } = lane('hero_dynamo', 'ricochet', item);
      atk.hpMax = 20; atk.hp = 5; // below half, for Frenzy
      const fx = G.fx.length;
      makeAttack(G, '0');
      expect(G.fx.slice(fx).filter((e) => e.kind === 'heal' && e.iid === atk.iid), item).toHaveLength(1);
      if (item === 'spiritual_overflow') expect(status(atk, 'spirit_power')?.value).toBe(1);
    }
  });

  it('Tesla Bullets chains once a swing', () => {
    const { G, bench } = lane('hero_dynamo', 'ricochet', 'tesla_bullets');
    const fx = G.fx.length;
    makeAttack(G, '0');
    expect(hitsSince(G, fx, 'tesla')).toHaveLength(1);
    expect(hps(bench)).toEqual([17, 18, 18]);
  });

  it("Haze's Fixation (from Level 3) grants its one extra swing, not one a bounce", () => {
    const { G, atk, bench } = lane('hero_haze', 'ricochet');
    atk.level = 3;
    const fx = G.fx.length;
    makeAttack(G, '0');
    expect(swingsSince(G, fx)).toHaveLength(2);
    expect(status(atk, 'extra_attack')).toBeUndefined();
    expect(hps(bench)).toEqual([16, 16, 16]);
  });

  it("Wraith's spirit half and Drifter's Bloodscent stay with the swing", () => {
    const wraith = lane('hero_wraith', 'ricochet');
    wraith.atk.spiritMod = 2;
    const fx = wraith.G.fx.length;
    makeAttack(wraith.G, '0');
    expect(wraith.abrams.hp).toBe(16); // 2 bullet + 2 spirit
    expect(hps(wraith.bench)).toEqual([18, 18, 18]);
    expect(hitsSince(wraith.G, fx, 'mixed_bullets')).toHaveLength(1);

    const drifter = lane('hero_drifter', 'ricochet');
    drifter.atk.hpMax = 20; drifter.atk.hp = 10;
    makeAttack(drifter.G, '0');
    expect(drifter.atk.hp).toBe(11); // half of the swing's 3; nothing off the bounces
  });
});

describe('A bounce that knocks a hero out', () => {
  // The bounce is dealt in the attacker's own attack frame, so the kill is the
  // attacker's by the path every kill takes: the exp in damageUnit (the frame's
  // source), the KO bounty and the patron's loss when the attack resolves.
  it("pays the KO bounty to the attacker's side and the exp to the attacker; the patron pays the hero's level", () => {
    const { G, atk, bench } = lane('hero_dynamo', 'ricochet');
    bench[0].hp = 2;
    G.players['0'].souls = 0;
    const patron = G.players['1'].hp;
    makeAttack(G, '0');
    expect(bench[0].respawnTurnsLeft).toBeGreaterThan(0);
    expect(G.players['0'].souls).toBe((bench[0].level ?? 1) + 1); // the bounty: its level + 1
    expect(atk.exp).toBe(EXP_ON_KILL);
    expect(G.players['1'].hp).toBe(patron - (bench[0].level ?? 1));
  });

  it("takes nothing more from the attack: the next swing's bounce and Tesla jump pass it by", () => {
    const { G, atk, bench } = lane('hero_dynamo', 'ricochet', 'tesla_bullets');
    bench[0].hp = 2;
    grantExtraAttacks(atk, 1);
    const fx = G.fx.length;
    makeAttack(G, '0');
    // Swing 1: Tesla 1 and the bounce 2 drop it. Swing 2: Tesla jumps to Kelvin.
    const onIt = hitsSince(G, fx).filter((e) => e.iid === bench[0].iid);
    expect(onIt.map((e) => e.tag)).toEqual(['tesla', 'ricochet']);
    expect(onIt[1].ko).toBe(true);
    expect(hitsSince(G, fx, 'tesla').map((e) => e.iid)).toEqual([bench[0].iid, bench[1].iid]);
    expect(hps(bench.slice(1))).toEqual([15, 16]);
  });
});

describe('Split Shot: your Active gains Ricochet 2 this turn', () => {
  it('its swing bounces, and the end of the turn takes the Ricochet away', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.level = 3; // her Fixation swings
    const bench = G.players['1'].bench.filter((b): b is CardInstance => !!b);
    for (const b of bench) { b.hpMax = 20; b.hp = 20; }
    expect(play(G, 'split_shot')).not.toBe(INVALID);
    expect(status(haze, 'ricochet')).toMatchObject({ value: 2, duration: 1 });
    expect(hps(bench)).toEqual([20, 20, 20]); // the card itself shoots nothing
    makeAttack(G, '0');
    expect(hps(bench)).toEqual([16, 16, 16]); // Haze swings twice (Fixation)
    endTurnEffects(G, '0');
    expect(status(haze, 'ricochet')).toBeUndefined();
  });

  it('stretched by Superior Duration it is still gone when the turn ends', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    wear(haze, 'superior_duration');
    expect(play(G, 'split_shot')).not.toBe(INVALID);
    expect(status(haze, 'ricochet')?.duration).toBe(2);
    endTurnEffects(G, '0');
    expect(status(haze, 'ricochet')).toBeUndefined();
  });

  it('adds to a worn Ricochet: 4 a bounce', () => {
    const { G, atk, bench } = lane('hero_dynamo', 'ricochet');
    expect(play(G, 'split_shot')).not.toBe(INVALID);
    expect(ricochetPower(atk)).toBe(4);
    makeAttack(G, '0');
    expect(hps(bench)).toEqual([16, 16, 16]);
  });

  it('the cards print the keyword, and the rule text bolds and explains it', () => {
    expect(CARDS_BY_ID['split_shot']).toMatchObject({ cost: 3, text: 'Your Active gains Ricochet 2 this turn.' });
    expect(CARDS_BY_ID['ricochet']).toMatchObject({ cost: 7, tier: 4 });
    expect((CARDS_BY_ID['ricochet'] as { text: string }).text).toMatch(/^Ricochet 2: /);
    expect(statusOfKeyword('Ricochet', ' 2 this turn.')).toEqual({ id: 'ricochet', value: 2 });
    expect(STATUSES_BY_ID['ricochet']).toMatchObject({ title: 'Ricochet', hvalue: 1 });
  });
});

describe('The AI and the forecast', () => {
  /** The position, read straight off the AI (ai-valuation.spec): with no souls and
   *  no hand, passing is scored as the position stands. P1 is the seat to move. */
  function standing(G: GameState): number {
    G.players['1'].souls = 0;
    G.players['1'].hand = [];
    return enumerateAIMoves(G, ctx('1')).find((m) => m.move === 'endTurn')!.score;
  }

  it('the AI prices Ricochet as its value in bullet damage for the turn, for its bearer and against its rival', () => {
    const base = standing(freshReadyGame());
    const mine = freshReadyGame();
    mine.players['1'].active!.statuses.push({ id: 'ricochet', value: 2, duration: 1 });
    expect(standing(mine) - base).toBeCloseTo(4);
    const theirs = freshReadyGame();
    theirs.players['0'].active!.statuses.push({ id: 'ricochet', value: 2, duration: 1 });
    expect(standing(theirs) - base).toBeCloseTo(-4);
  });

  it('the forecast is the real attack for a Ricochet attacker: two swings, a Tesla chain, two bench heroes dropped by bounces', () => {
    const { G, atk, bench } = lane('hero_dynamo', 'ricochet', 'tesla_bullets');
    grantExtraAttacks(atk, 1);
    bench[0].hp = 2;
    bench[2].hp = 3;
    const plan = forecastAttack(G, '0');
    expect(plan.steps.map((s) => s.finalDamage)).toEqual([3, 3]);
    expect(plan.steps.map((s) => s.predictedHpAfter)).toEqual([17, 14]);
    expect(plan).toMatchObject({ damageToActive: 6, patronDamage: 2, defenderActiveKO: null });
    expect(forecastMismatches(G, ctx('0'), '0')).toEqual([]);
  });

  it('the forecast of a swing at a bench hero counts that hero, not the Active its bounce hit', () => {
    const { G, abrams, bench } = lane('hero_dynamo', 'ricochet', 'long_range');
    const plan = forecastAttack(G, '0', bench[1].iid);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ targetIid: bench[1].iid, finalDamage: 3, predictedHpAfter: 17 });
    expect(plan.damageToActive).toBe(3);
    expect(abrams.hp).toBe(20); // the forecast ran on a copy
  });
});
