import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { buildFxTimeline, freshBatch, shieldSpilled, volleySwings, walkedByChoreographer } from '@/ui/effects/fx/fxTimeline';
import { FX_TIMING as T, TAG_INFO } from '@/ui/effects/fx/fxCatalog';
import type { AbilityDef } from '@/abilities';
import { CARDS_BY_ID } from '@/cards';
import { attackAll } from '@/engine/actions/attack';
import { currentCast } from '@/engine/castContext';
import { INVALID, perform } from '@/engine/engine';
import { registerAbilities } from '@/engine/registry';
import { addStatus, tickStartOfTurn } from '@/engine/statusOps';
import type { CardInstance, FxEvent, GameState, HitFx, ShieldFx, SwingFx } from '@/engine/types';
import { freshReadyGame, makeHero } from '../engine/_helpers';

/** The FX scheduler is pure — pin the beat structure HeroSlot and FxLayer
 *  build on: a cast pushes impacts out to the bolt's arrival, stamps queue
 *  behind hits, lifesteal lands when its motes arrive. */

let seq = 0;
const ev = <E extends Omit<FxEvent, 'seq'>>(e: E): E & { seq: number } => ({ ...e, seq: ++seq });

describe('fx timeline', () => {
  it('a skill: flare at 0, the hit lands after the bolt, its stamps queue behind it', () => {
    const batch: FxEvent[] = [
      ev({ kind: 'cast', castKind: 'skill', by: '0', cardId: 'hero_lash', iid: 'lash', targetIid: 't' }),
      ev({ kind: 'hit', iid: 't', amount: 1, type: 'spirit', ko: false, cast: 'skill' }),
      ev({ kind: 'status', iid: 't', statusId: 'bullet_resist_down', value: 1, duration: 1, debuff: true }),
      ev({ kind: 'status', iid: 't', statusId: 'spirit_resist_down', value: 1, duration: 1, debuff: true }),
    ] as FxEvent[];
    const tl = buildFxTimeline(batch);
    expect(tl.cast?.castKind).toBe('skill');
    expect(tl.items.map((i) => i.at)).toEqual([
      0, T.castLead, T.castLead + T.statusAfterHit, T.castLead + T.statusAfterHit + T.statusStack,
    ]);
    expect(tl.impactDelay.t).toBe(T.castLead);
    expect(tl.total).toBeGreaterThan(T.castLead + T.statusAfterHit + T.statusStack + T.statusHold);
  });

  it('effects the caster puts on itself land during the flare', () => {
    const batch = [
      ev({ kind: 'cast', castKind: 'skill', by: '0', cardId: 'hero_warden', iid: 'w', targetIid: 'w' }),
      ev({ kind: 'status', iid: 'w', statusId: 'shield', value: 3, duration: 999, debuff: false }),
    ] as FxEvent[];
    const tl = buildFxTimeline(batch);
    expect(tl.items[1].at).toBe(T.selfLead);
  });

  it('an ultimate waits for its name plate; AoE impacts ripple by the stagger', () => {
    const batch = [
      ev({ kind: 'cast', castKind: 'ult', by: '0', cardId: 'ult_abrams', iid: 'a' }),
      ev({ kind: 'hit', iid: 'e1', amount: 4, type: 'spirit', ko: false, cast: 'ult' }),
      ev({ kind: 'hit', iid: 'e2', amount: 4, type: 'spirit', ko: false, cast: 'ult' }),
      ev({ kind: 'hit', iid: 'e3', amount: 4, type: 'spirit', ko: true, cast: 'ult' }),
    ] as FxEvent[];
    const tl = buildFxTimeline(batch);
    const base = T.ultLead + T.castLead;
    expect(tl.items.slice(1).map((i) => i.at)).toEqual([base, base + T.stagger, base + 2 * T.stagger]);
    expect(tl.koSettle.e3).toBe(base + 2 * T.stagger + T.koSettle);
    expect(tl.items[3].hold).toBe(T.koHold);
    // The tile turns corpse under the shatter's backing — after the print
    // breaks, well before the kill has finished playing.
    expect(tl.koCorpse.e3).toBe(base + 2 * T.stagger + T.koCorpse);
    expect(T.koBreak).toBeLessThan(T.koStamp);
    expect(T.koStamp).toBeLessThan(T.koCorpse);
    expect(T.koCorpse).toBeLessThan(T.koSettle);
    expect(tl.koCorpse.e1).toBeUndefined();
  });

  it('the bolt needs time to fly: a charge fits inside the cast lead', () => {
    expect(T.castCharge).toBeLessThan(T.castLead - 150);
    expect(T.selfLead).toBeLessThanOrEqual(T.castLead);
  });

  it('gunfire from another card waits for its volley; a cast already covers it', () => {
    const src = { iid: 's', cardId: 'hero_haze', owner: '0' as const };
    const proc = buildFxTimeline([
      ev({ kind: 'hit', iid: 't', amount: 2, type: 'attack', ko: false, cast: 'proc', source: src }),
    ] as FxEvent[]);
    expect(proc.items[0].at).toBe(T.volleyLead);
    expect(proc.impactDelay.t).toBe(T.volleyLead);
    // Sourceless, self-inflicted, or travelling by its own lead-in: no volley.
    const bare = buildFxTimeline([
      ev({ kind: 'hit', iid: 't', amount: 2, type: 'attack', ko: false, cast: 'tick' }),
      ev({ kind: 'hit', iid: 's', amount: 1, type: 'attack', ko: false, cast: 'proc', source: src }),
      ev({ kind: 'hit', iid: 'u', amount: 1, type: 'attack', ko: false, cast: 'proc', source: src, tag: 'ricochet' }),
    ] as FxEvent[]);
    expect(bare.items.map((i) => i.at)).toEqual([0, T.stagger, 2 * T.stagger + TAG_INFO.ricochet.lead]);
    // Behind a cast the hit keeps the cast's own lead.
    const ult = buildFxTimeline([
      ev({ kind: 'cast', castKind: 'ult', by: '0', cardId: 'ult_haze', iid: 's' }),
      ev({ kind: 'hit', iid: 't', amount: 3, type: 'attack', ko: false, cast: 'ult', source: src }),
    ] as FxEvent[]);
    expect(ult.items[1].at).toBe(T.ultLead + T.castLead);
    expect(T.ultLead + T.castLead).toBeGreaterThan(T.volleyLead);
  });

  it('a unique tag adds its intro lead before the impact', () => {
    const batch = [
      ev({ kind: 'hit', iid: 't', amount: 12, type: 'spirit', ko: false, cast: 'tick', tag: 'djinns_mark', stacks: 4 }),
    ] as FxEvent[];
    const tl = buildFxTimeline(batch);
    expect(tl.items[0].at).toBe(TAG_INFO.djinns_mark.lead);
    expect(tl.impactDelay.t).toBe(TAG_INFO.djinns_mark.lead);
  });

  it('lifesteal lands when its motes arrive from the victim', () => {
    const batch = [
      ev({ kind: 'cast', castKind: 'skill', by: '0', cardId: 'hero_lady_geist', iid: 'g', targetIid: 't' }),
      ev({ kind: 'hit', iid: 't', amount: 3, type: 'spirit', ko: false, cast: 'skill', tag: 'life_drain' }),
      ev({ kind: 'heal', iid: 'g', amount: 1, tag: 'lifesteal', from: { iid: 't', cardId: 'hero_abrams', owner: '1' } }),
    ] as FxEvent[];
    const tl = buildFxTimeline(batch);
    expect(tl.items[2].at).toBe(T.castLead + T.streamTravel);
    expect(tl.impactDelay.g).toBe(T.castLead + T.streamTravel);
  });

  it('a tick batch with no cast starts at once and staggers per target', () => {
    const batch = [
      ev({ kind: 'hit', iid: 'a', amount: 2, type: 'pure', ko: false, cast: 'tick', tag: 'bleed' }),
      ev({ kind: 'hit', iid: 'b', amount: 2, type: 'pure', ko: false, cast: 'tick', tag: 'bleed' }),
      ev({ kind: 'heal', iid: 'c', amount: 1, tag: 'regen' }),
    ] as FxEvent[];
    const tl = buildFxTimeline(batch);
    expect(tl.items.map((i) => i.at)).toEqual([0, T.stagger, 2 * T.stagger]);
  });
});

describe('what the choreographer has already walked', () => {
  it("a basic swing's own swing, hit and Shield are walked; its procs, riders, shrugs and everything else are not", () => {
    const walked = [
      ev({ kind: 'swing', iid: 'a', targetIid: 't', index: 0, raw: 3, targetHp: 10 }),
      ev({ kind: 'hit', iid: 't', amount: 3, type: 'attack', ko: false, cast: 'attack' }),
      ev({ kind: 'shield', iid: 't', absorbed: 2, broken: false, type: 'attack', cast: 'attack' }),
    ] as FxEvent[];
    const played = [
      ev({ kind: 'hit', iid: 'b', amount: 1, type: 'attack', ko: false, cast: 'proc', tag: 'tesla' }),
      ev({ kind: 'hit', iid: 't', amount: 3, type: 'spirit', ko: false, cast: 'skill' }),
      ev({ kind: 'shield', iid: 't', absorbed: 2, broken: false, type: 'spirit', cast: 'skill' }),
      ev({ kind: 'shield', iid: 't', absorbed: 2, broken: false, type: 'attack' }),
      // The walk has no beat for an Unstoppable shrug, so its stamp still plays.
      ev({ kind: 'immune', iid: 't', what: 'damage', cast: 'attack' }),
      ev({ kind: 'heal', iid: 'a', amount: 2, tag: 'lifesteal' }),
      ev({ kind: 'status', iid: 't', statusId: 'bleed', value: 1, duration: 2, debuff: true }),
    ] as FxEvent[];
    expect(walked.map((e) => walkedByChoreographer(e, walked))).toEqual([true, true, true]);
    expect(played.map((e) => walkedByChoreographer(e, played))).toEqual(played.map(() => false));
  });
});

describe('a Shield spilling', () => {
  const shield = (iid: string, type: 'attack' | 'spirit' = 'spirit') =>
    ev({ kind: 'shield', iid, absorbed: 2, broken: false, type }) as ShieldFx;
  const hit = (iid: string, type: 'attack' | 'spirit' = 'spirit') =>
    ev({ kind: 'hit', iid, amount: 1, type, ko: false, cast: 'skill' }) as FxEvent;

  it('is read off the next hit on the card, however many reactions sit between them', () => {
    const s = shield('t');
    const batch: FxEvent[] = [s, ev({ kind: 'status', iid: 't', statusId: 'shield', value: 2, duration: 999, debuff: false }) as FxEvent, hit('b'), hit('t')];
    expect(shieldSpilled(batch, s)).toBe(true);
  });

  it('is not spilled when the next thing on the card is another absorb, or there is nothing more', () => {
    const s = shield('t');
    expect(shieldSpilled([s, hit('b')], s)).toBe(false);
    expect(shieldSpilled([s, shield('t')], s)).toBe(false);
    expect(shieldSpilled([s], s)).toBe(false);
  });

  it('pairs by card and damage type, not by position', () => {
    const s = shield('t', 'attack');
    expect(shieldSpilled([s, hit('t', 'spirit')], s)).toBe(false);
    expect(shieldSpilled([s, hit('t', 'attack')], s)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The volley. A card that swings at the whole board (an ultimate's `attackAll`)
// reports one `swing` per enemy hero inside its cast, each followed by its hit
// (cast 'attack') — the shape of the turn's attack, which the combat
// choreographer walks and the board skips. The volley is not the turn's attack:
// nothing walked it, so the timeline must play it. These read real engine
// batches: the throwaway ultimate is played through `perform`, like any card,
// and the turn's attack is made through it too.

const VOLLEY_ULT = 'ult_ui_volley';
const volleyEffect: AbilityDef = {
  id: 'eff_ui_volley', trigger: 'onPlay', target: 'noTarget', base: 3,
  run: (G) => { const caster = currentCast()?.source; if (caster) attackAll(G, caster); },
};

beforeAll(() => {
  registerAbilities([volleyEffect]);
  CARDS_BY_ID[VOLLEY_ULT] = { id: VOLLEY_ULT, name: 'Volley', type: 'ultimate', rarity: 4, cost: 0, linkedHero: 'hero_lash', abilities: [volleyEffect.id] };
});
afterAll(() => { delete CARDS_BY_ID[VOLLEY_ULT]; });

/** What a batch holds, in order — for reading a stream at a glance. */
const shape = (batch: FxEvent[]) => batch.map((e) => (e.kind === 'hit' || e.kind === 'shield' || e.kind === 'immune' ? `${e.kind}:${e.cast ?? ''}` : e.kind));
const isAttackEvent = (e: FxEvent) => e.kind === 'swing' || ((e.kind === 'hit' || e.kind === 'shield') && e.cast === 'attack');

/** P0's Active is Lash (no passive to add events of its own); the rival side
 *  (Abrams, then Dynamo / Kelvin / Seven) stands 30 deep. */
function table() {
  const G = freshReadyGame();
  const lash = makeHero('hero_lash', '0', 'active', 0);
  G.players['0'].active = lash;
  const foe = G.players['1'];
  const foes = [foe.active!, ...foe.bench] as CardInstance[];
  for (const c of foes) c.hp = c.hpMax = 30;
  return { G, lash, foes };
}
const highWater = (G: GameState) => Math.max(0, ...G.fx.map((e) => e.seq));
/** The batch one move leaves on the stream, and the mark Board would have seen before it. */
function made(G: GameState, move: () => void) {
  const seen = highWater(G);
  const before = G.fx.length;
  move();
  return { batch: G.fx.slice(before), seen };
}
const playVolley = (G: GameState, iid = 'ui-volley-1') => {
  G.players['0'].hand.push({
    iid, cardId: VOLLEY_ULT, ownerId: '0', zone: 'hand', attached: [],
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
  });
  expect(perform(G, '0', { type: 'playCard', cardIid: iid })).not.toBe(INVALID);
};
const makeTurnAttack = (G: GameState) => expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);

describe('a volley: a card swinging at every enemy hero inside its cast', () => {
  it('is reported as a cast, then a swing at each enemy hero in turn, each followed by its hit', () => {
    const { G, lash, foes } = table();
    const { batch } = made(G, () => playVolley(G));
    expect(shape(batch)).toEqual(['cast', 'swing', 'hit:attack', 'swing', 'hit:attack', 'swing', 'hit:attack', 'swing', 'hit:attack']);
    expect(batch.filter((e): e is SwingFx => e.kind === 'swing').map((s) => [s.iid, s.targetIid, s.index]))
      .toEqual(foes.map((f, i) => [lash.iid, f.iid, i]));
    expect(batch[0]).toMatchObject({ kind: 'cast', castKind: 'ult', iid: lash.iid });
  });

  it('is not walked: no swing, hit or Shield of it is dropped from what the board plays', () => {
    const { G } = table();
    const { batch, seen } = made(G, () => playVolley(G));
    for (const e of batch) expect(walkedByChoreographer(e, batch), e.kind).toBe(false);
    expect(freshBatch(G.fx, seen)).toEqual(batch);
    expect(volleySwings(batch)).toHaveLength(4);
  });

  it('plays in order, one volley step apart, after the ultimate\'s plate and the bolt\'s flight', () => {
    const { G, foes } = table();
    const { batch } = made(G, () => playVolley(G));
    const tl = buildFxTimeline(batch);
    const base = T.ultLead + T.castLead;
    const swings = tl.items.filter((i) => i.ev.kind === 'swing');
    expect(swings.map((i) => (i.ev as SwingFx).targetIid)).toEqual(foes.map((f) => f.iid));
    expect(swings.map((i) => i.at)).toEqual([0, 1, 2, 3].map((k) => base + k * T.volleyStep));
    // Each swing's hit lands the instant its gun's last round does — and the hit brings no gunfire of its own.
    const hits = tl.items.filter((i) => i.ev.kind === 'hit');
    expect(hits.map((i) => i.at)).toEqual(swings.map((i) => i.at));
    expect([...swings, ...hits].every((i) => i.volley === true)).toBe(true);
    // The number on each hero waits for its own impact, not for the whole volley.
    foes.forEach((f, k) => expect(tl.impactDelay[f.iid], f.cardId).toBe(base + k * T.volleyStep));
    // The cast is the batch's first item. Four heroes are hit inside a second — a volley, not four attacks.
    expect(tl.items[0].ev.kind).toBe('cast');
    expect(3 * T.volleyStep).toBeLessThan(1000);
    expect(tl.total).toBe(base + 3 * T.volleyStep + T.hitHold + 80);
  });

  it('a Shield inside a volley soaks at its swing\'s instant, and the swings after it still follow', () => {
    const { G, foes } = table();
    addStatus(G, foes[1], 'shield', 20, 99);
    const { batch } = made(G, () => playVolley(G));
    // The swing at Dynamo meets the Shield (nothing gets past), so it has no hit.
    expect(shape(batch)).toEqual(['cast', 'swing', 'hit:attack', 'swing', 'shield:attack', 'swing', 'hit:attack', 'swing', 'hit:attack']);
    const tl = buildFxTimeline(batch);
    const base = T.ultLead + T.castLead;
    const shield = tl.items.find((i) => i.ev.kind === 'shield')!;
    expect(shield.at).toBe(base + T.volleyStep);
    expect(shield.volley).toBe(true);
    expect(tl.impactDelay[foes[1].iid]).toBe(base + T.volleyStep);
    expect(tl.items.filter((i) => i.ev.kind === 'swing')).toHaveLength(4);
    // The Shield is played, where the turn's own is walked.
    for (const e of batch) expect(walkedByChoreographer(e, batch)).toBe(false);
  });

  it('a knockout inside a volley breaks and settles from its own impact', () => {
    const { G, foes } = table();
    foes[2].hp = 1;
    const { batch } = made(G, () => playVolley(G));
    const tl = buildFxTimeline(batch);
    const ko = T.ultLead + T.castLead + 2 * T.volleyStep;
    expect(batch.some((e) => e.kind === 'hit' && e.ko && e.iid === foes[2].iid)).toBe(true);
    expect(tl.koCorpse[foes[2].iid]).toBe(ko + T.koCorpse);
    expect(tl.koSettle[foes[2].iid]).toBe(ko + T.koSettle);
    expect(tl.items.find((i) => i.ev.kind === 'hit' && i.ev.iid === foes[2].iid)!.hold).toBe(T.koHold);
    expect(tl.koCorpse[foes[0].iid]).toBeUndefined();
  });

  it('an Unstoppable hero shrugs its swing at the swing\'s instant', () => {
    const { G, foes } = table();
    addStatus(G, foes[3], 'unstoppable', 1, 2);
    const { batch } = made(G, () => playVolley(G));
    expect(shape(batch).slice(-2)).toEqual(['swing', 'immune:attack']);
    const tl = buildFxTimeline(batch);
    const at = T.ultLead + T.castLead + 3 * T.volleyStep;
    expect(tl.items.find((i) => i.ev.kind === 'immune')!.at).toBe(at);
    expect(tl.impactDelay[foes[3].iid]).toBe(at);
  });

  it('a hero the engine does not swing at (a Dome) leaves no step behind', () => {
    const { G, foes } = table();
    addStatus(G, foes[0], 'dome', 1, 1);
    const { batch } = made(G, () => playVolley(G));
    expect(volleySwings(batch).map((s) => s.targetIid)).toEqual(foes.slice(1).map((f) => f.iid));
    const tl = buildFxTimeline(batch);
    expect(tl.items.filter((i) => i.ev.kind === 'swing').map((i) => i.at))
      .toEqual([0, 1, 2].map((k) => T.ultLead + T.castLead + k * T.volleyStep));
    expect(tl.impactDelay[foes[0].iid]).toBeUndefined();
  });

  it('a swing with no cast before it is not a volley\'s: the timeline never plays it', () => {
    const lone = [
      ev({ kind: 'swing', iid: 'a', targetIid: 't', index: 0, raw: 3, targetHp: 10 }),
      ev({ kind: 'hit', iid: 't', amount: 3, type: 'attack', ko: false, cast: 'attack' }),
    ] as FxEvent[];
    expect(volleySwings(lone)).toEqual([]);
    expect(lone.map((e) => walkedByChoreographer(e, lone))).toEqual([true, true]);
    expect(buildFxTimeline(lone).items.some((i) => i.ev.kind === 'swing')).toBe(false);
    // A cast that comes AFTER it does not make it one.
    const after = [...lone, ev({ kind: 'cast', castKind: 'skill', by: '0', cardId: 'hero_lash', iid: 'a', targetIid: 't' })] as FxEvent[];
    expect(volleySwings(after)).toEqual([]);
    expect(walkedByChoreographer(after[0], after)).toBe(true);
  });
});

describe('the turn\'s attack is walked by the choreographer alone', () => {
  it('its batch has no cast: the swing and the hit it met are walked, so the board plays nothing of them', () => {
    const { G } = table();
    const { batch, seen } = made(G, () => makeTurnAttack(G));
    expect(shape(batch)).toEqual(['swing', 'hit:attack']);
    for (const e of batch) expect(walkedByChoreographer(e, batch), e.kind).toBe(true);
    expect(freshBatch(G.fx, seen)).toEqual([]);
    expect(volleySwings(batch)).toEqual([]);
  });

  it('nothing of it reaches the timeline, however the batch is handed over — no double play', () => {
    const { G } = table();
    const { batch, seen } = made(G, () => makeTurnAttack(G));
    const tl = buildFxTimeline(freshBatch(G.fx, seen));
    expect(tl.items).toEqual([]);
    expect(tl.impactDelay).toEqual({});
    // Even handed the raw batch, the timeline does not play the swing itself: that is the choreographer's.
    expect(buildFxTimeline(batch).items.some((i) => i.ev.kind === 'swing')).toBe(false);
  });

  it('what the attack met that the walk has no beat for still plays: an Unstoppable hero\'s shrug', () => {
    const { G, foes } = table();
    addStatus(G, foes[0], 'unstoppable', 1, 2);
    const { batch, seen } = made(G, () => makeTurnAttack(G));
    expect(shape(batch)).toEqual(['swing', 'immune:attack']);
    const fresh = freshBatch(G.fx, seen);
    expect(fresh.map((e) => e.kind)).toEqual(['immune']);
    const tl = buildFxTimeline(fresh);
    expect(tl.items.map((i) => i.ev.kind)).toEqual(['immune']);
    expect(tl.impactDelay[foes[0].iid]).toBe(0);
  });

  it('a volley and then the turn\'s attack: each fresh stretch is decided on its own, and the attack is the one walked', () => {
    const { G } = table();
    playVolley(G);
    const played = freshBatch(G.fx, 0);
    expect(played.filter((e) => e.kind === 'swing')).toHaveLength(4);        // the volley: played
    expect(played.filter(isAttackEvent)).toHaveLength(8);
    const afterVolley = highWater(G);
    makeTurnAttack(G);
    expect(G.fx.some((e) => e.seq > afterVolley && isAttackEvent(e))).toBe(true); // the attack is on the stream…
    expect(freshBatch(G.fx, afterVolley)).toEqual([]);                           // …and walked, not played
  });
});

// ---------------------------------------------------------------------------
// Last Stand: a delayed strike in tickStartOfTurn. Its detonation is a spirit
// hit tagged 'channel' from the bearer — the FX layer's channel pulse (one
// shockwave out of the bearer, a low bolt to each target) — and, with no cast
// in the batch, it starts at once and ripples by the tag's own lead.

describe('Last Stand going off at the start of its owner\'s turn', () => {
  function goesOff() {
    const G = freshReadyGame();
    const me = G.players['0'];
    const bearer = me.bench[1]!; // Lash, on the bench
    bearer.spiritMod = 2;
    bearer.hpMax = 12;
    bearer.hp = 5;
    const foe = G.players['1'];
    const foes = [foe.active!, ...foe.bench] as CardInstance[];
    for (const c of foes) c.hp = c.hpMax = 30;
    addStatus(G, bearer, 'last_stand', 4, 1, { heal: 3 });
    const { batch } = made(G, () => tickStartOfTurn(G, me));
    return { G, bearer, foes, batch };
  }

  it('is a channel hit on every enemy hero from the bearer, then the bearer\'s heal — what the layer\'s channel pulse reads', () => {
    const { bearer, foes, batch } = goesOff();
    expect(batch.filter((e): e is HitFx => e.kind === 'hit').map((h) => ({
      iid: h.iid, type: h.type, amount: h.amount, tag: h.tag, cast: h.cast, source: h.source?.iid,
    }))).toEqual(foes.map((f) => ({ iid: f.iid, type: 'spirit', amount: 6, tag: 'channel', cast: 'tick', source: bearer.iid })));
    expect(batch.at(-1)).toMatchObject({ kind: 'heal', iid: bearer.iid, amount: 3 });
    expect(batch.some((e) => e.kind === 'cast' || e.kind === 'swing')).toBe(false);
  });

  it('is played, not walked, and lands after the channel\'s lead-in, one target after another', () => {
    const { bearer, foes, batch } = goesOff();
    expect(batch.every((e) => !walkedByChoreographer(e, batch))).toBe(true);
    const tl = buildFxTimeline(batch);
    const lead = TAG_INFO.channel.lead;
    expect(tl.items.filter((i) => i.ev.kind === 'hit').map((i) => i.at)).toEqual(foes.map((_f, k) => lead + k * T.stagger));
    foes.forEach((f, k) => expect(tl.impactDelay[f.iid]).toBe(lead + k * T.stagger));
    expect(tl.cast).toBeNull();
    expect(tl.items.some((i) => i.ev.kind === 'heal' && i.ev.iid === bearer.iid)).toBe(true);
  });
});
