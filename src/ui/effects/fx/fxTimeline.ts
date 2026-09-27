/**
 * Schedules one FX batch — every event the engine pushed for a single move
 * or turn tick — onto a timeline the FxLayer plays and HeroSlot holds its
 * numbers against. Pure: no DOM, no positions, so Board can run it on the
 * same render the state changes and the Gallery can exercise it directly.
 *
 * The shape of a beat:
 *   cast (flare on the caster)  →  bolt travels  →  impact on the target
 *   →  status stamps on that card queue behind the hit  →  lifesteal motes
 *   stream back to the healer and the heal glow lands when they arrive.
 * Impacts on different targets in one batch ripple out by `stagger`, and an
 * ultimate's strike waits for its screen-fill name plate first.
 */
import type { FxEvent, CastFx } from '@/engine/types';
import { FX_TIMING as T, tagLead } from './fxCatalog';

export interface FxItem {
  ev: FxEvent;
  /** ms after the batch starts that this effect's impact lands. */
  at: number;
  /** ms the effect stays mounted after `at`. */
  hold: number;
}

export interface FxTimeline {
  items: FxItem[];
  cast: CastFx | null;
  /** ms after which the whole batch can be unmounted. */
  total: number;
  /** ms until the first impact on each unit — HeroSlot holds its numbers this long. */
  impactDelay: Record<string, number>;
  /** ms until a KO'd unit may take on its corpse look (after the shatter). */
  koSettle: Record<string, number>;
}

export function buildFxTimeline(batch: FxEvent[]): FxTimeline {
  const cast = (batch.find((e): e is CastFx => e.kind === 'cast')) ?? null;
  const casterIid = cast?.iid;
  const lead = cast?.castKind === 'ult' ? T.ultLead : 0;
  // A cast pushes every effect on OTHER cards out to the bolt's arrival;
  // effects the caster puts on itself land during the flare.
  const baseFor = (iid: string) => (cast ? lead + (iid === casterIid ? T.selfLead : T.castLead) : 0);

  const targetIdx = new Map<string, number>();
  const idx = (iid: string) => {
    if (!targetIdx.has(iid)) targetIdx.set(iid, targetIdx.size);
    return targetIdx.get(iid)!;
  };
  const hitAt = new Map<string, number>();
  const statusCount = new Map<string, number>();
  const impactDelay: Record<string, number> = {};
  const koSettle: Record<string, number> = {};
  const items: FxItem[] = [];
  const noteImpact = (iid: string, at: number) => {
    impactDelay[iid] = Math.min(impactDelay[iid] ?? Infinity, at);
  };

  for (const ev of batch) {
    switch (ev.kind) {
      case 'cast':
        items.push({ ev, at: lead, hold: T.castHold });
        break;
      case 'hit': {
        const at = baseFor(ev.iid) + tagLead(ev.tag) + T.stagger * idx(ev.iid);
        items.push({ ev, at, hold: ev.ko ? T.koHold : T.hitHold });
        if (!hitAt.has(ev.iid) || at < hitAt.get(ev.iid)!) hitAt.set(ev.iid, at);
        noteImpact(ev.iid, at);
        if (ev.ko) koSettle[ev.iid] = Math.max(koSettle[ev.iid] ?? 0, at + T.koSettle);
        break;
      }
      case 'shield':
      case 'immune': {
        const at = baseFor(ev.iid) + T.stagger * idx(ev.iid);
        items.push({ ev, at, hold: ev.kind === 'shield' ? T.shieldHold : T.immuneHold });
        if (!hitAt.has(ev.iid)) hitAt.set(ev.iid, at);
        noteImpact(ev.iid, at);
        break;
      }
      case 'heal': {
        // Lifesteal arrives when its motes do — after the hit it was drawn from.
        const drawnFrom = ev.tag === 'lifesteal' && ev.from ? hitAt.get(ev.from.iid) : undefined;
        const at = drawnFrom != null
          ? drawnFrom + T.streamTravel
          : baseFor(ev.iid) + T.stagger * idx(ev.iid);
        items.push({ ev, at, hold: T.healHold });
        noteImpact(ev.iid, at);
        break;
      }
      case 'status': {
        const n = statusCount.get(ev.iid) ?? 0;
        statusCount.set(ev.iid, n + 1);
        const h = hitAt.get(ev.iid);
        const at = (h != null ? h + T.statusAfterHit : baseFor(ev.iid) + T.stagger * idx(ev.iid)) + T.statusStack * n;
        items.push({ ev, at, hold: T.statusHold });
        noteImpact(ev.iid, at);
        break;
      }
      case 'revive':
        items.push({ ev, at: T.stagger * idx(ev.iid), hold: T.reviveHold });
        break;
      case 'levelup':
        items.push({ ev, at: T.stagger * idx(ev.iid), hold: T.levelHold });
        break;
    }
  }

  const total = items.reduce((m, it) => Math.max(m, it.at + it.hold), 0) + 80;
  return { items, cast, total, impactDelay, koSettle };
}
