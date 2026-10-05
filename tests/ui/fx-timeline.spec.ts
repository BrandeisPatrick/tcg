import { describe, it, expect } from 'vitest';
import { buildFxTimeline, shieldSpilled, walkedByChoreographer } from '@/ui/effects/fx/fxTimeline';
import { FX_TIMING as T, TAG_INFO } from '@/ui/effects/fx/fxCatalog';
import type { FxEvent, ShieldFx } from '@/engine/types';

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
    expect(walked.map(walkedByChoreographer)).toEqual([true, true, true]);
    expect(played.map(walkedByChoreographer)).toEqual(played.map(() => false));
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
