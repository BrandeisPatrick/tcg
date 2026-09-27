/**
 * The board-FX layer. Board hands it each fresh batch of engine events (the
 * hits / heals / statuses / casts one move produced); the layer measures the
 * cards involved, schedules the batch with `buildFxTimeline`, and plays it as
 * fixed-position overlays anchored to those cards. Batches overlap freely —
 * a bleed tick can still be dripping while the next skill's bolt flies — and
 * each one unmounts itself when its timeline runs out.
 *
 * Positions are captured once, when the batch arrives, so a card sliding to
 * another slot mid-effect keeps the effect where the hit landed (the same
 * trade the combat choreographer makes).
 */
import { useEffect, useRef, useState } from 'react';
import type { CastFx, FxEvent, HitFx } from '@/engine/types';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { poster } from '../../poster';
import { FX_INK, FX_TIMING, TAG_INFO, typeInk } from './fxCatalog';
import { buildFxTimeline, type FxItem, type FxTimeline } from './fxTimeline';
import { type Pt, type Rect, center, dist, toRect } from './geometry';
import { AoeWave, Bolt, DrainStream, LightningArc } from './primitives';
import { HitImpact } from './hits';
import {
  CastFlare, EquipGlint, HealGlow, ImmuneStamp, LevelUpBurst, ReviveRays, ShieldDeflect, StatusStamp,
  castInk, castLabel,
} from './support';

interface LiveBatch {
  key: number;
  batch: FxEvent[];
  timeline: FxTimeline;
  rects: Map<string, Rect>;
  /** Where a spell's bolt leaves from (the reveal card), when Board knows. */
  origin: Pt | null;
}

export interface FxLayerProps {
  /** The events not yet played. Identity may change every render; `batchKey`
   *  (the batch's highest seq) is what marks a new batch. */
  batch: FxEvent[];
  batchKey: number;
  slotRefs: Map<string, HTMLElement>;
  /** The point a spell's bolt should leave from — the card reveal's anchor. */
  spellOrigin?: () => Pt;
}

export function FxLayer({ batch, batchKey, slotRefs, spellOrigin }: FxLayerProps) {
  const [live, setLive] = useState<LiveBatch[]>([]);
  const lastKey = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (batch.length === 0 || batchKey <= lastKey.current) return;
    lastKey.current = batchKey;
    const timeline = buildFxTimeline(batch);
    // Measure every card the batch touches — targets, sources, lifesteal victims.
    const want = new Set<string>();
    for (const e of batch) {
      if ('iid' in e && e.iid) want.add(e.iid);
      if ('source' in e && e.source) want.add(e.source.iid);
      if ('from' in e && e.from) want.add(e.from.iid);
      if (e.kind === 'cast' && e.targetIid) want.add(e.targetIid);
    }
    const rects = new Map<string, Rect>();
    for (const iid of want) {
      const el = slotRefs.get(iid);
      if (el && document.body.contains(el)) rects.set(iid, toRect(el));
    }
    const origin = timeline.cast?.castKind === 'spell' ? (spellOrigin?.() ?? null) : null;
    setLive((l) => [...l, { key: batchKey, batch, timeline, rects, origin }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setLive((l) => l.filter((b) => b.key !== batchKey));
    }, timeline.total);
    timers.current.add(t);
  }, [batch, batchKey, slotRefs, spellOrigin]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  return <>{live.map((b) => <FxBatch key={b.key} live={b} />)}</>;
}

const ownerInk = (owner: '0' | '1' | undefined) => (owner === '1' ? poster.rival : poster.you);

/** The colour a spell or ult's bolt draws in — what it is about to do. */
function effectInk(batch: FxEvent[], casterIid: string | undefined): string {
  for (const e of batch) {
    if (e.kind === 'hit') return typeInk(e.type);
    if (e.kind === 'heal') return FX_INK.heal;
    if (e.kind === 'status' && e.iid !== casterIid) return e.debuff ? FX_INK.debuff : FX_INK.gold;
  }
  return FX_INK.spirit;
}

function FxBatch({ live }: { live: LiveBatch }) {
  const { batch, timeline, rects, origin } = live;
  const cast = timeline.cast;
  const statusIndex = new Map<string, number>();

  // Channelled pulses: one shockwave from the channeler per pulse group,
  // then the per-target impacts. Seven's storm rains lightning instead.
  const channelGroups = new Map<string, { source: HitFx['source']; targets: Pt[]; at: number }>();
  for (const it of timeline.items) {
    const ev = it.ev;
    if (ev.kind !== 'hit' || ev.tag !== 'channel' || !ev.source) continue;
    const rect = rects.get(ev.iid);
    if (!rect) continue;
    const g = channelGroups.get(ev.source.iid) ?? { source: ev.source, targets: [], at: it.at };
    g.targets.push(center(rect));
    g.at = Math.min(g.at, it.at);
    channelGroups.set(ev.source.iid, g);
  }

  return (
    <>
      {/* Zero-size marker so QA harnesses can see a batch start (data-fx-batch). */}
      <span data-fx-batch={live.key} data-fx-total={timeline.total} aria-hidden style={{ position: 'fixed', left: 0, top: 0, width: 0, height: 0 }} />
      {cast && <CastVisuals cast={cast} item={timeline.items.find((i) => i.ev === cast)!} batch={batch} timeline={timeline} rects={rects} origin={origin} />}

      {[...channelGroups.values()].map((g) => {
        const src = g.source!;
        const srcRect = rects.get(src.iid);
        const ink = getHeroIdentity(src.cardId).primary;
        const lead = TAG_INFO.channel.lead;
        if (src.cardId === 'hero_seven') {
          return g.targets.map((p, i) => (
            <LightningArc key={`${src.iid}-${i}`} from={{ x: p.x + (i % 2 ? 40 : -40), y: Math.max(0, p.y - 260) }} to={p} at={g.at - 180 + i * FX_TIMING.stagger} dur={320} seed={live.key + i} />
          ));
        }
        if (!srcRect) return null;
        const from = center(srcRect);
        const radius = Math.max(...g.targets.map((p) => dist(from, p))) + 60;
        return <AoeWave key={src.iid} from={from} radius={radius} color={ink} at={g.at - lead} dur={lead - 40} spokes={g.targets} />;
      })}

      {timeline.items.map((it) => renderItem(it, rects, batch, statusIndex))}
    </>
  );
}

function renderItem(it: FxItem, rects: Map<string, Rect>, batch: FxEvent[], statusIndex: Map<string, number>) {
  const ev = it.ev;
  const key = `fx-${ev.seq}`;
  switch (ev.kind) {
    case 'cast':
      return null; // drawn by CastVisuals
    case 'hit': {
      const rect = rects.get(ev.iid);
      if (!rect) return null;
      const sourceRect = ev.source ? rects.get(ev.source.iid) : undefined;
      return <HitImpact key={key} ev={ev} rect={rect} sourceRect={sourceRect} at={it.at} hold={it.hold} ownerInk={ownerInk(ev.source?.owner)} />;
    }
    case 'heal': {
      const rect = rects.get(ev.iid);
      if (!rect) return null;
      const fromRect = ev.from ? rects.get(ev.from.iid) : undefined;
      const drainInk = ev.tag === 'lifesteal' ? (ev.source?.cardId === 'hero_lady_geist' ? TAG_INFO.life_drain.ink : poster.red) : FX_INK.heal;
      return (
        <span key={key}>
          {fromRect && (
            <DrainStream from={center(fromRect)} to={center(rect)} color={drainInk} at={it.at - FX_TIMING.streamTravel} dur={FX_TIMING.streamTravel} seed={ev.seq} />
          )}
          <HealGlow rect={rect} amount={ev.amount} at={it.at} hold={it.hold} tag={ev.tag} seed={ev.seq} />
        </span>
      );
    }
    case 'status': {
      const rect = rects.get(ev.iid);
      if (!rect) return null;
      const n = statusIndex.get(ev.iid) ?? 0;
      statusIndex.set(ev.iid, n + 1);
      return <StatusStamp key={key} rect={rect} ev={ev} at={it.at} hold={it.hold} index={n} />;
    }
    case 'shield': {
      const rect = rects.get(ev.iid);
      if (!rect) return null;
      // The engine pushes the spill-over hit right after the absorb, so a
      // following hit on the same card means the shield did not eat it all.
      const spilled = batch.some((e) => e.kind === 'hit' && e.iid === ev.iid && e.seq === ev.seq + 1);
      return <ShieldDeflect key={key} rect={rect} absorbed={ev.absorbed} fullyAbsorbed={!spilled} broken={ev.broken} at={it.at} hold={it.hold} />;
    }
    case 'immune': {
      const rect = rects.get(ev.iid);
      if (!rect) return null;
      return <ImmuneStamp key={key} rect={rect} what={ev.what} at={it.at} hold={it.hold} />;
    }
    case 'revive': {
      const rect = rects.get(ev.iid);
      if (!rect) return null;
      return <ReviveRays key={key} rect={rect} at={it.at} hold={it.hold} seed={ev.seq} />;
    }
    case 'levelup': {
      const rect = rects.get(ev.iid);
      if (!rect) return null;
      return <LevelUpBurst key={key} rect={rect} level={ev.level} at={it.at} hold={it.hold} seed={ev.seq} />;
    }
  }
}

/** The cast's own visuals: the flare on the caster, then a bolt to a single
 *  target or a shockwave with spokes to several. Equipment just glints. */
function CastVisuals({ cast, item, batch, timeline, rects, origin }: {
  cast: CastFx; item: FxItem; batch: FxEvent[]; timeline: FxTimeline; rects: Map<string, Rect>; origin: Pt | null;
}) {
  const casterRect = cast.iid ? rects.get(cast.iid) : undefined;
  if (cast.castKind === 'equip') {
    return casterRect ? <EquipGlint rect={casterRect} at={item.at} hold={item.hold} /> : null;
  }
  const ink = cast.castKind === 'skill' ? castInk(cast.cardId) : cast.castKind === 'ult' ? castInk(cast.cardId) : effectInk(batch, cast.iid);
  const label = castLabel(cast.cardId);
  // Every card the cast's effects land on, other than the caster itself.
  const seen = new Set<string>();
  const targets: Pt[] = [];
  for (const it of timeline.items) {
    const e = it.ev;
    if (e.kind === 'cast' || !('iid' in e) || e.iid === cast.iid || seen.has(e.iid)) continue;
    if (e.kind === 'heal' && e.tag === 'lifesteal') continue;   // drawn back, not cast out
    seen.add(e.iid);
    const r = rects.get(e.iid);
    if (r) targets.push(center(r));
  }
  const from = cast.castKind === 'spell'
    ? (origin ?? (casterRect ? center(casterRect) : null))
    : (casterRect ? center(casterRect) : null);
  const boltAt = item.at + 60;
  const boltDur = FX_TIMING.castLead - 80;
  return (
    <>
      {casterRect && cast.castKind !== 'spell' && (
        <CastFlare rect={casterRect} ink={ink} label={label} at={item.at} hold={item.hold} heavy={cast.castKind === 'ult'} />
      )}
      {from && targets.length === 1 && (
        <Bolt from={from} to={targets[0]} color={ink} at={boltAt} dur={boltDur} width={cast.castKind === 'ult' ? 4 : 3} />
      )}
      {from && targets.length > 1 && (
        <AoeWave from={from} radius={Math.max(...targets.map((p) => dist(from, p))) + 60} color={ink} at={boltAt - 20} dur={boltDur} spokes={targets} />
      )}
    </>
  );
}
