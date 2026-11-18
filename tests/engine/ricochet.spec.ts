/**
 * Ricochet N (docs/engine-model.md, "Ricochet"): a swing that lands bounces,
 * and every other living enemy hero takes N bullet damage and the swing's
 * on-hit debuffs. Each swing bounces, Extra Attacks too, and a bounce never
 * bounces again. The bearer's own heals and chains stay with the swing. It
 * comes from the Ricochet item (Ricochet 2 while worn: the `ricochet` hook) and
 * from Split Shot (the `ricochet` status, for the turn).
 *
 * Board (freshReadyGame): P0's Active is made Dynamo (no passive, one swing)
 * unless a test needs a passive of its own, its Attack set to 3 whoever it is;
 *                         P1 Abrams (active) · Dynamo / Kelvin / Seven, all at 20 HP.
 */
import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import type { CardInstance, GameState, HeroCard, HitFx, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { STATUSES_BY_ID } from '@/statuses';
import { EXP_ON_KILL } from '@/engine/constants';
import { INVALID, perform } from '@/engine/engine';
import { attackAll } from '@/engine/actions/attack';
import { endTurnEffects } from '@/engine/actions/turn';
import { forecastAttack } from '@/engine/forecast';
import { ricochetPower, structureHp } from '@/engine/query';
import { addStatus, grantExtraAttacks } from '@/engine/statusOps';
import { enumerateAIMoves } from '@/ai/heuristic';
import { statusOfKeyword } from '@/ui/card/RuleText';
import { forecastMismatches } from './fuzz/forecast';
import { freshReadyGame, giveItem, makeAttack, makeHero, useItem } from './_helpers';
import { killBounty } from '@/engine/rounds';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';

const status = (c: CardInstance, id: string) => c.statuses.find((s) => s.id === id);
const hps = (cs: CardInstance[]) => cs.map((c) => c.hp);
const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as unknown as Ctx;

/** P0's Active becomes `hero` wearing `gear`, its Attack 3 (its Bullet Power
 *  modifier makes up what its card prints); every P1 hero stands at 20 HP. */
function lane(hero = 'hero_dynamo', ...gear: string[]) {
  const G = freshReadyGame();
  const atk = G.players['0'].active = makeHero(hero, '0', 'active', 0);
  atk.atkMod = 3 - (CARDS_BY_ID[hero] as HeroCard).atk;
  for (const id of gear) giveItem(G, atk, id);
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

  it("a volley (attackAll) does not ricochet: each hero takes its own swing and no more; nor does Haze's Bullet Dance", () => {
    const { G, atk, enemies } = lane('hero_dynamo', 'ricochet');
    const fx = G.fx.length;
    attackAll(G, atk);
    expect(hps(enemies)).toEqual([17, 17, 17, 17]);
    expect(hitsSince(G, fx, 'ricochet')).toEqual([]);

    // Bullet Dance is her Attack as bullet damage to every enemy, no swing at all.
    const haze = lane('hero_haze', 'ricochet');
    haze.atk.level = ULT_UNLOCK_LEVEL;
    haze.G.players['0'].souls = 12;
    const from = haze.G.fx.length;
    expect(perform(haze.G, '0', { type: 'useSkill', heroIid: haze.atk.iid, skillId: 'eff_ult_haze' })).not.toBe(INVALID);
    expect(hps(haze.enemies)).toEqual([17, 17, 17, 17]);
    expect(swingsSince(haze.G, from)).toEqual([]);
    expect(hitsSince(haze.G, from, 'ricochet')).toEqual([]);
  });
});

describe('What spreads with the bounce, and what stays with the swing', () => {
  it("Toxic Bullets' Toxin and Slowing Bullets' Root land on every bounce target", () => {
    const { G, enemies } = lane('hero_dynamo', 'ricochet', 'toxic_bullets', 'slowing_bullets');
    makeAttack(G, '0');
    for (const c of enemies) {
      expect(status(c, 'toxin'), c.cardId).toMatchObject({ value: 1 }); // a Toxin each (2026-11-16)
      expect(status(c, 'rooted'), c.cardId).toBeDefined();
    }
  });

  it("a passive's debuff spreads too (Mirage's Djinn's Mark); Haze's Fixation puts nothing on anyone (a bonus, no status, since 2026-11-16)", () => {
    const mirage = lane('hero_mirage', 'ricochet');
    makeAttack(mirage.G, '0');
    for (const c of mirage.enemies) expect(status(c, 'djinns_mark'), c.cardId).toMatchObject({ value: 1 });
    const haze = lane('hero_haze', 'ricochet');
    makeAttack(haze.G, '0');
    for (const c of [haze.abrams, ...haze.bench]) expect(status(c, 'fixation'), c.cardId).toBeUndefined();
  });

  it('Bullet Lifesteal, and Leech, heal once a swing, not once a bounce', () => {
    for (const item of ['bullet_lifesteal', 'leech']) {
      const { G, atk } = lane('hero_dynamo', 'ricochet', item);
      atk.hpMax = 20; atk.hp = 10;
      makeAttack(G, '0');
      expect(atk.hp, item).toBe(12);
    }
  });

  it('Restorative Shot, Frenzy and Spiritual Overflow fire once a swing', () => {
    for (const item of ['restorative_shot', 'frenzy', 'spiritual_overflow']) {
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
    expect(hps(bench)).toEqual([16, 18, 18]);
  });

  it("Haze's Fixation rides the swing alone: +{bp:0} on a swing at a hurt hero, never on a bounce", () => {
    const { G, atk, abrams, bench } = lane('hero_haze', 'ricochet');
    grantExtraAttacks(atk, 1);
    const fx = G.fx.length;
    makeAttack(G, '0');
    expect(swingsSince(G, fx)).toHaveLength(2);
    // Swing 1: 3 (Abrams still whole). Swing 2: 3 + Fixation 3, her Bullet Power (he is hurt now). Each bounce is Ricochet's 2,
    // though the bench is hurt by the first bounce: a bounce is no swing, so Fixation is not on it.
    expect(abrams.hp).toBe(20 - 3 - 6);
    expect(hps(bench)).toEqual([16, 16, 16]);
  });

  it("Vindicta's Flight, Drifter's Rend and his Bloodscent stay with the swing", () => {
    const vindicta = lane('hero_vindicta', 'ricochet');
    vindicta.atk.spiritMod = 2;
    addStatus(vindicta.G, vindicta.atk, 'flying', 1, 3); // in Flight: her swing's spirit rider is the status's
    const fx = vindicta.G.fx.length;
    makeAttack(vindicta.G, '0');
    expect(vindicta.abrams.hp).toBe(14); // 3 bullet + Flight's 1 + 2 Spirit
    expect(hps(vindicta.bench)).toEqual([18, 18, 18]);
    const spirit = hitsSince(vindicta.G, fx).filter((e) => e.type === 'spirit');
    expect(spirit.map((e) => e.iid)).toEqual([vindicta.abrams.iid]);

    // Every enemy below half: the swing gets Rend's +3 (his Bullet Power), each bounce is Ricochet's 2;
    // Bloodscent heals him his Bullet Power once, for the swing, not once a bounce (2026-11-18).
    const drifter = lane('hero_drifter', 'ricochet');
    drifter.atk.hpMax = 20; drifter.atk.hp = 5;
    for (const c of drifter.enemies) c.hp = 9;
    const healsFrom = drifter.G.fx.length;
    makeAttack(drifter.G, '0');
    expect(drifter.abrams.hp).toBe(9 - 6);
    expect(hps(drifter.bench)).toEqual([7, 7, 7]);
    expect(drifter.atk.hp).toBe(5 + 3);
    expect(drifter.G.fx.slice(healsFrom).filter((e) => e.kind === 'heal' && e.iid === drifter.atk.iid)).toHaveLength(1);
  });
});

describe('A bounce that knocks a hero out', () => {
  // The bounce is dealt in the attacker's own attack frame, so the kill is the
  // attacker's by the path every kill takes: the exp in damageUnit (the frame's
  // source), the kill on the record and the push into its side's structures
  // and the bounty when the attack resolves.
  it("gives the kill, the exp and the round's bounty to the attacker; the push is the hero's level + 1", () => {
    const { G, atk, bench } = lane('hero_dynamo', 'ricochet');
    bench[0].hp = 2;
    G.players['0'].souls = 0;
    const structures = structureHp(G.players['1']);
    makeAttack(G, '0');
    expect(bench[0].zone).toBe('deck');
    expect(G.players['0'].souls).toBe(killBounty(G));
    expect(G.record['0'].kills).toBe(1);
    expect(atk.exp).toBe(EXP_ON_KILL);
    expect(structureHp(G.players['1'])).toBe(structures - ((bench[0].level ?? 1) + 1));
  });

  it("takes nothing more from the attack: the next swing's bounce and Tesla jump pass it by", () => {
    const { G, atk, bench } = lane('hero_dynamo', 'ricochet', 'tesla_bullets');
    bench[0].hp = 3;
    grantExtraAttacks(atk, 1);
    const fx = G.fx.length;
    makeAttack(G, '0');
    // Swing 1: Tesla 2 and the bounce 2 drop it. Swing 2: Tesla jumps to Kelvin.
    const onIt = hitsSince(G, fx).filter((e) => e.iid === bench[0].iid);
    expect(onIt.map((e) => e.tag)).toEqual(['tesla', 'ricochet']);
    expect(onIt[1].ko).toBe(true);
    expect(hitsSince(G, fx, 'tesla').map((e) => e.iid)).toEqual([bench[0].iid, bench[1].iid]);
    expect(hps(bench.slice(1))).toEqual([14, 16]);
  });
});

describe('Split Shot: your Active gains Ricochet 2 this turn', () => {
  it('its swing bounces, and the end of the turn takes the Ricochet away', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const bench = G.players['1'].bench.filter((b): b is CardInstance => !!b);
    for (const b of bench) { b.hpMax = 20; b.hp = 20; }
    useItem(G, '0', 'split_shot'); // Haze's ability of the turn; she may still attack
    expect(status(haze, 'ricochet')).toMatchObject({ value: 2, duration: 1 });
    expect(hps(bench)).toEqual([20, 20, 20]); // the item itself shoots nothing
    makeAttack(G, '0');
    expect(hps(bench)).toEqual([18, 18, 18]); // Haze's one swing, one bounce of 2 each
    endTurnEffects(G, '0');
    expect(status(haze, 'ricochet')).toBeUndefined();
  });

  it('stretched by Superior Duration it is still gone when the turn ends', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    giveItem(G, haze, 'superior_duration');
    useItem(G, '0', 'split_shot');
    expect(status(haze, 'ricochet')?.duration).toBe(3); // 1, and Superior Duration's 2
    endTurnEffects(G, '0');
    expect(status(haze, 'ricochet')).toBeUndefined();
  });

  it('adds to a worn Ricochet: 4 a bounce', () => {
    const { G, atk, bench } = lane('hero_dynamo', 'ricochet');
    useItem(G, '0', 'split_shot');
    expect(ricochetPower(atk)).toBe(4);
    makeAttack(G, '0');
    expect(hps(bench)).toEqual([16, 16, 16]);
  });

  it('the cards print the keyword, and the rule text bolds and explains it', () => {
    expect(CARDS_BY_ID['split_shot']).toMatchObject({ slot: 'weapon', tier: 2, text: 'Your Active gains Ricochet 2 this turn.' });
    expect(CARDS_BY_ID['ricochet']).toMatchObject({ slot: 'weapon', tier: 4 });
    expect((CARDS_BY_ID['ricochet'] as { text: string }).text).toMatch(/^Ricochet 2: /);
    expect(statusOfKeyword('Ricochet', ' 2 this turn.')).toEqual({ id: 'ricochet', value: 2 });
    expect(STATUSES_BY_ID['ricochet']).toMatchObject({ title: 'Ricochet', hvalue: 1 });
  });
});

describe('The AI and the forecast', () => {
  /** The position, read straight off the AI (ai-valuation.spec): with no souls and
   *  no items, passing is scored as the position stands. P1 is the seat to move. */
  function standing(G: GameState): number {
    G.players['1'].souls = 0;
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
    expect(plan).toMatchObject({ damageToActive: 6, pushDamage: 4, defenderActiveKO: null });
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
