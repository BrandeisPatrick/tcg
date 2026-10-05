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
import type { FxEvent, CastFx, ShieldFx } from '@/engine/types';
import { FX_TIMING as T, tagLead } from './fxCatalog';

/**
 * True for what the combat choreographer has already shown by the time the
 * engine reports it. The basic attack is walked from the forecast BEFORE the
 * engine makes it, so the engine's own account of that walk — each `swing`, and
 * the hit and Shield that swing met (cast 'attack') — must not be played a
 * second time. The one place that decides this: Board filters its fresh batch
 * through it for the timeline, the FX layer and the final-blow check alike.
 * (Everything else the swing set off — procs, riders, heals, statuses — is not
 * in the walk and plays as usual, and so does an Unstoppable shrug: the walk
 * has no beat for it.)
 */
export function walkedByChoreographer(ev: FxEvent): boolean {
  return ev.kind === 'swing' || ((ev.kind === 'hit' || ev.kind === 'shield') && ev.cast === 'attack');
}

/**
 * Whether a Shield's absorb let some of the hit through. The engine pushes the
 * absorb and then — only if something got past — the hit it let by, with just
 * that damage's own reactions between them, so the next hit or Shield on the
 * same card says which it was.
 */
export function shieldSpilled(batch: FxEvent[], shield: ShieldFx): boolean {
  let after = false;
  for (const e of batch) {
    if (e === shield) { after = true; continue; }
    if (after && (e.kind === 'hit' || e.kind === 'shield') && e.iid === shield.iid && e.type === shield.type) {
      return e.kind === 'hit';
    }
  }
  return false;
}

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
  /** ms until a KO'd unit takes on its corpse look — under the backing its
   *  shards leave behind, so the swap is never seen. */
  koCorpse: Record<string, number>;
  /** ms until a kill has fully played (the sticker has faded). */
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
  const koCorpse: Record<string, number> = {};
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
        // Gunfire from another card needs its volley's flight before it can
        // land; a cast's lead already covers that, a bare proc's does not.
        const volley = ev.type === 'attack' && !!ev.source && ev.source.iid !== ev.iid && ev.tag !== 'ricochet' && ev.tag !== 'tesla';
        const base = volley ? Math.max(baseFor(ev.iid), T.volleyLead) : baseFor(ev.iid);
        const at = base + tagLead(ev.tag) + T.stagger * idx(ev.iid);
        items.push({ ev, at, hold: ev.ko ? T.koHold : T.hitHold });
        if (!hitAt.has(ev.iid) || at < hitAt.get(ev.iid)!) hitAt.set(ev.iid, at);
        noteImpact(ev.iid, at);
        if (ev.ko) {
          koCorpse[ev.iid] = Math.max(koCorpse[ev.iid] ?? 0, at + T.koCorpse);
          koSettle[ev.iid] = Math.max(koSettle[ev.iid] ?? 0, at + T.koSettle);
        }
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
      case 'swing':
        // The choreographer walks the basic attack from the forecast (see
        // walkedByChoreographer); Board never hands a swing to the timeline.
        break;
      case 'revive':
        items.push({ ev, at: T.stagger * idx(ev.iid), hold: T.reviveHold });
        break;
      case 'levelup':
        items.push({ ev, at: T.stagger * idx(ev.iid), hold: T.levelHold });
        break;
    }
  }

  const total = items.reduce((m, it) => Math.max(m, it.at + it.hold), 0) + 80;
  return { items, cast, total, impactDelay, koCorpse, koSettle };
}
