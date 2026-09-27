import { describe, it, expect } from 'vitest';
import { buildFxTimeline } from '@/ui/effects/fx/fxTimeline';
import { FX_TIMING as T, TAG_INFO } from '@/ui/effects/fx/fxCatalog';
import type { FxEvent } from '@/engine/types';

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
