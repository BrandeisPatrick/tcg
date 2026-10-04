/**
 * The board-FX layer. Board hands it each fresh batch of engine events (the
 * hits / heals / statuses / casts one move produced); the layer measures the
 * cards on the table, schedules the batch with `buildFxTimeline`, and plays
 * it three ways at once: prints on the cards (fixed-position overlays
 * anchored to their rects), things in the air (booked on the FX stage by
 * those overlays), and the cards themselves moving (impulses on the bus —
 * a hit rocks its target, a caster lifts, a shockwave bobs every card it
 * passes under). Batches overlap freely — a bleed tick can still be dripping
 * while the next skill's bolt flies — and each one unmounts itself when its
 * timeline runs out.
 *
 * Positions are captured once, when the batch arrives, so a card sliding to
 * another slot mid-effect keeps the effect where the hit landed (the same
 * trade the combat choreographer makes).
 */
import { useContext, useEffect, useRef, useState } from 'react';
import type { CastFx, FxEvent, HitFx } from '@/engine/types';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { poster } from '../../poster';
import { FX_INK, FX_TIMING, TAG_INFO, typeInk } from './fxCatalog';
import { buildFxTimeline, type FxItem, type FxTimeline } from './fxTimeline';
import { FxImpulseBus, FxImpulseContext, type FxImpulse, hitStrength } from './FxImpulse';
import { type Pt, type Rect, angleOf, center, dist, restRect } from './geometry';
import { AoeWave, Bolt, DrainStream, FxCardContext, LightningArc } from './primitives';
import { HitImpact } from './hits';
import { useStageEngine } from './stage/FxStage';
import {
  CastFlare, EquipGlint, HealGlow, ImmuneStamp, LevelUpBurst, ReviveRays, ShieldDeflect, StatusStamp,
  castInk, castLabel,
} from './support';

interface LiveBatch {
  key: number;
  batch: FxEvent[];
  timeline: FxTimeline;
  /** Every card on the table when the batch arrived, not only the ones it
   *  names — a shockwave bobs the bystanders too. */
  rects: Map<string, Rect>;
  /** The live tiles, for the effects that take the card itself apart. */
  tiles: Map<string, HTMLElement>;
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
  const stage = useStageEngine();

  useEffect(() => {
    if (batch.length === 0 || batchKey <= lastKey.current) return;
    lastKey.current = batchKey;
    const timeline = buildFxTimeline(batch);
    const rects = new Map<string, Rect>();
    const tiles = new Map<string, HTMLElement>();
    for (const [iid, el] of slotRefs) {
      if (!document.body.contains(el)) continue;
      rects.set(iid, restRect(el));
      tiles.set(iid, el);
    }
    const table = tableCenter(rects);
    if (table) stage?.lookAt(table);
    const origin = timeline.cast?.castKind === 'spell' ? (spellOrigin?.() ?? null) : null;
    setLive((l) => [...l, { key: batchKey, batch, timeline, rects, tiles, origin }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setLive((l) => l.filter((b) => b.key !== batchKey));
    }, timeline.total);
    timers.current.add(t);
  }, [batch, batchKey, slotRefs, spellOrigin, stage]);

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

/** The middle of the cards on the table — where the stage's camera hangs. */
export function tableCenter(rects: Map<string, Rect>): Pt | null {
  if (rects.size === 0) return null;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const q of rects.values()) {
    l = Math.min(l, q.left); t = Math.min(t, q.top);
    r = Math.max(r, q.left + q.width); b = Math.max(b, q.top + q.height);
  }
  return { x: (l + r) / 2, y: (t + b) / 2 };
}

/** How fast a shockwave's bob travels from card to card, px/s. */
const QUAKE_SPEED = 1500;

/** Bob every card but `skip` as a shock from `from` passes under it — the
 *  nearer the card, the sooner and the harder. Returns the timers booked. */
export function quake(bus: FxImpulseBus, rects: Map<string, Rect>, from: Pt, at: number, strength: number, skip?: string): ReturnType<typeof setTimeout>[] {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const [iid, rect] of rects) {
    if (iid === skip) continue;
    const c = center(rect);
    const d = dist(from, c);
    const impulse: FxImpulse = { kind: 'wave', angle: angleOf(from, c), strength: Math.max(0.25, strength / (1 + d / 320)) };
    timers.push(setTimeout(() => bus.emit(iid, impulse), at + (d / QUAKE_SPEED) * 1000));
  }
  return timers;
}

/** The cast's targets: every card its effects land on, other than the caster. */
function castTargets(cast: CastFx, timeline: FxTimeline, rects: Map<string, Rect>): Pt[] {
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
  return targets;
}

function FxBatch({ live }: { live: LiveBatch }) {
  const { batch, timeline, rects, tiles, origin } = live;
  const cast = timeline.cast;
  const statusIndex = new Map<string, number>();
  const hitIndex = new Map<string, number>();

  // The tiles take their part at the beats: HeroSlot listens on the impulse
  // bus and moves the card (see FxImpulse).
  const bus = useContext(FxImpulseContext);
  useEffect(() => {
    if (!bus) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const emit = (iid: string, impulse: FxImpulse, at: number) => {
      timers.push(setTimeout(() => bus.emit(iid, impulse), Math.max(0, at)));
    };
    for (const it of timeline.items) {
      const ev = it.ev;
      if (ev.kind === 'cast') {
        // The caster lifts while it gathers power and slaps down as it lets
        // go; an area cast then rolls a shockwave under every other card.
        if (ev.castKind === 'equip' || ev.castKind === 'spell' || !ev.iid) continue;
        const heavy = ev.castKind === 'ult';
        emit(ev.iid, { kind: 'cast', strength: heavy ? 1 : 0.4, duration: (FX_TIMING.castCharge + 180) / 1000 }, it.at);
        const src = rects.get(ev.iid);
        if (src && castTargets(ev, timeline, rects).length > 1) {
          timers.push(...quake(bus, rects, center(src), it.at + FX_TIMING.castCharge, heavy ? 1 : 0.7, ev.iid));
        }
      } else if (ev.kind === 'hit' && ev.amount > 0) {
        const src = ev.source ? rects.get(ev.source.iid) : undefined;
        const tgt = rects.get(ev.iid);
        const angle = src && tgt && ev.source!.iid !== ev.iid ? angleOf(center(src), center(tgt)) : undefined;
        emit(ev.iid, { kind: ev.ko ? 'ko' : 'hit', angle, strength: hitStrength(ev.amount) }, it.at);
        // A skill's gunfire kicks its shooter back (GunBurst's volley leaves
        // this long before the rounds land).
        if (ev.type === 'attack' && angle != null && ev.tag !== 'ricochet' && ev.tag !== 'tesla') {
          emit(ev.source!.iid, { kind: 'fire', angle, strength: 0.5 }, it.at - FX_TIMING.volleyLead);
        }
        if (ev.ko && tgt) {
          // The card breaks: every other card on the table jumps, and the
          // sticker slammed onto the wreck lands with a thud.
          timers.push(...quake(bus, rects, center(tgt), it.at + FX_TIMING.koBreak, 0.9, ev.iid));
          emit(ev.iid, { kind: 'slam', strength: 1 }, it.at + FX_TIMING.koStamp + 90);
        }
      } else if (ev.kind === 'heal' && ev.amount > 0) {
        emit(ev.iid, { kind: 'heal', strength: 0.6 }, it.at);
      } else if (ev.kind === 'shield') {
        emit(ev.iid, { kind: 'shield', strength: 0.6 }, it.at);
      } else if (ev.kind === 'status') {
        emit(ev.iid, { kind: 'slam', strength: 0.6 }, it.at + 100);
      } else if (ev.kind === 'revive' || ev.kind === 'levelup') {
        emit(ev.iid, { kind: 'cast', strength: 0.5, duration: 0.6 }, it.at);
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [bus, timeline, rects]);

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
  useEffect(() => {
    if (!bus) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const g of channelGroups.values()) {
      const src = rects.get(g.source!.iid);
      if (src && g.source!.cardId !== 'hero_seven') timers.push(...quake(bus, rects, center(src), g.at - TAG_INFO.channel.lead, 0.7, g.source!.iid));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, timeline, rects]);

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
        return <AoeWave key={src.iid} from={from} radius={radius} color={ink} at={g.at - lead} dur={lead - 40} seed={live.key} spokes={g.targets} />;
      })}

      {/* Each effect is printed on its own card, and rides that card's kicks. */}
      {timeline.items.map((it) => (
        <FxCardContext.Provider key={`fx-${it.ev.seq}`} value={'iid' in it.ev ? it.ev.iid ?? null : null}>
          {renderItem(it, rects, tiles, batch, statusIndex, hitIndex)}
        </FxCardContext.Provider>
      ))}
    </>
  );
}

function renderItem(it: FxItem, rects: Map<string, Rect>, tiles: Map<string, HTMLElement>, batch: FxEvent[], statusIndex: Map<string, number>, hitIndex: Map<string, number>) {
  const ev = it.ev;
  const key = `fx-${ev.seq}`;
  switch (ev.kind) {
    case 'cast':
      return null; // drawn by CastVisuals
    case 'hit': {
      const rect = rects.get(ev.iid);
      if (!rect) return null;
      const sourceRect = ev.source ? rects.get(ev.source.iid) : undefined;
      const n = hitIndex.get(ev.iid) ?? 0;
      hitIndex.set(ev.iid, n + 1);
      return <HitImpact key={key} ev={ev} rect={rect} sourceRect={sourceRect} tile={tiles.get(ev.iid)} at={it.at} hold={it.hold} ownerInk={ownerInk(ev.source?.owner)} index={n} />;
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
      return <ShieldDeflect key={key} rect={rect} absorbed={ev.absorbed} fullyAbsorbed={!spilled} broken={ev.broken} at={it.at} hold={it.hold} seed={ev.seq} />;
    }
    case 'immune': {
      const rect = rects.get(ev.iid);
      if (!rect) return null;
      return <ImmuneStamp key={key} rect={rect} what={ev.what} at={it.at} hold={it.hold} seed={ev.seq} />;
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

/** The cast's own visuals: the caster gathers power and flares, then a bolt
 *  arcs over the table to a single target, or a shockwave rolls out with a
 *  low bolt to each of several. Equipment just glints. */
function CastVisuals({ cast, item, batch, timeline, rects, origin }: {
  cast: CastFx; item: FxItem; batch: FxEvent[]; timeline: FxTimeline; rects: Map<string, Rect>; origin: Pt | null;
}) {
  const casterRect = cast.iid ? rects.get(cast.iid) : undefined;
  if (cast.castKind === 'equip') {
    return casterRect ? (
      <FxCardContext.Provider value={cast.iid ?? null}>
        <EquipGlint rect={casterRect} at={item.at} hold={item.hold} />
      </FxCardContext.Provider>
    ) : null;
  }
  const heavy = cast.castKind === 'ult';
  const ink = cast.castKind === 'spell' ? effectInk(batch, cast.iid) : castInk(cast.cardId);
  const label = castLabel(cast.cardId);
  const targets = castTargets(cast, timeline, rects);
  const from = cast.castKind === 'spell'
    ? (origin ?? (casterRect ? center(casterRect) : null))
    : (casterRect ? center(casterRect) : null);
  // A hero's bolt leaves once the charge lets go; a spell's is thrown
  // straight off the revealed card.
  const flares = !!casterRect && cast.castKind !== 'spell';
  const boltAt = item.at + (flares ? FX_TIMING.castCharge : 60);
  const boltDur = item.at + FX_TIMING.castLead - 20 - boltAt;
  return (
    <>
      {flares && (
        <FxCardContext.Provider value={cast.iid ?? null}>
          <CastFlare rect={casterRect} ink={ink} label={label} at={item.at} hold={item.hold} seed={cast.seq} heavy={heavy} />
        </FxCardContext.Provider>
      )}
      {from && targets.length === 1 && (
        <Bolt from={from} to={targets[0]} color={ink} at={boltAt} dur={boltDur} size={heavy ? 12 : 9} embers={heavy ? 130 : 90} />
      )}
      {from && targets.length > 1 && (
        <AoeWave from={from} radius={Math.max(...targets.map((p) => dist(from, p))) + 60} color={ink} at={boltAt - 20} dur={boltDur} seed={cast.seq} spokes={targets} />
      )}
    </>
  );
}
