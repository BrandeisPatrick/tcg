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
 *
 * A card that swings at the whole board (an ultimate's `attackAll`) is the one
 * beat that is not a ripple: its swings fire in order, one volley step apart
 * (see `volleySteps`).
 */
import type { FxEvent, CastFx, ShieldFx, SwingFx } from '@/engine/types';
import { FX_TIMING as T, tagLead } from './fxCatalog';

/** The shape of the basic swing's own account: the `swing`, and the hit and
 *  Shield that swing met (filed cast 'attack'). */
function isBasicSwing(ev: FxEvent): boolean {
  return ev.kind === 'swing' || ((ev.kind === 'hit' || ev.kind === 'shield') && ev.cast === 'attack');
}

/**
 * True for what the combat choreographer has already shown by the time the
 * engine reports it. The turn's basic attack is walked from the forecast BEFORE
 * the engine makes it, so the engine's own account of that walk — each `swing`,
 * and the hit and Shield that swing met (cast 'attack') — must not be played a
 * second time. The one place that decides this: `freshBatch` filters Board's
 * fresh events through it for the timeline, the FX layer and the final-blow
 * check alike. (Everything else the swing set off — procs, riders, heals,
 * statuses — is not in the walk and plays as usual, and so does an Unstoppable
 * shrug: the walk has no beat for it.)
 *
 * The turn's attack is a move of its own, so the batch it comes in has no cast
 * in it. A swing that follows a cast in its batch is something else: a card
 * swinging at the whole board (an ultimate's `attackAll`, a volley) inside its
 * cast. The choreographer never walked that, so it is played — `batch` is how an
 * event is told which of the two it belongs to.
 */
export function walkedByChoreographer(ev: FxEvent, batch: readonly FxEvent[]): boolean {
  return isBasicSwing(ev) && !batch.some((e) => e.kind === 'cast' && e.seq < ev.seq);
}

/**
 * The events of `fx` past the high-water mark `seen` that the board still has
 * to play: everything the engine pushed since, but what the choreographer has
 * already walked. Board's fresh batch — what the timeline, the FX layer and the
 * final-blow check all read.
 */
export function freshBatch(fx: readonly FxEvent[], seen: number): FxEvent[] {
  const since = fx.filter((e) => e.seq > seen);
  return since.filter((e) => !walkedByChoreographer(e, since));
}

/**
 * The steps of a volley: every `swing` that follows a cast in the batch starts
 * one, and what the engine reports after it — its hit, the Shield it met, the
 * riders it set off — belongs to it until the next swing. Maps each such event
 * to its step (0, 1, 2…); events before the first volley swing are in none.
 */
function volleySteps(batch: readonly FxEvent[]): Map<FxEvent, number> {
  const steps = new Map<FxEvent, number>();
  let cast = false;
  let step = -1;
  for (const e of batch) {
    if (e.kind === 'cast') cast = true;
    else if (e.kind === 'swing' && cast) step++;
    if (step >= 0) steps.set(e, step);
  }
  return steps;
}

/** The swings of a batch that are a volley's: those that follow a cast. */
export function volleySwings(batch: readonly FxEvent[]): SwingFx[] {
  const steps = volleySteps(batch);
  return batch.filter((e): e is SwingFx => e.kind === 'swing' && steps.has(e));
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
  /** One of a volley's own: the `swing` (the gun going off — the layer fires it
   *  at the target, `volleyLead` before `at`) or what that swing met. The hit's
   *  impact then brings no gunfire of its own. */
  volley?: true;
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
  // Impacts on different cards ripple out by `stagger` — except a volley's,
  // which land one swing after another, `volleyStep` apart, in the order the
  // engine swung.
  const steps = volleySteps(batch);
  const ripple = (ev: FxEvent, iid: string) => {
    const step = steps.get(ev);
    return step === undefined ? T.stagger * idx(iid) : T.volleyStep * step;
  };
  /** A volley's own: the swing, or the hit / Shield / shrug it met. */
  const ownVolley = (ev: FxEvent): { volley?: true } =>
    (steps.has(ev) && (ev.kind === 'swing' || ((ev.kind === 'hit' || ev.kind === 'shield' || ev.kind === 'immune') && ev.cast === 'attack')) ? { volley: true } : {});
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
        const gunfire = ev.type === 'attack' && !!ev.source && ev.source.iid !== ev.iid && ev.tag !== 'ricochet' && ev.tag !== 'tesla';
        const base = gunfire ? Math.max(baseFor(ev.iid), T.volleyLead) : baseFor(ev.iid);
        const at = base + tagLead(ev.tag) + ripple(ev, ev.iid);
        items.push({ ev, at, hold: ev.ko ? T.koHold : T.hitHold, ...ownVolley(ev) });
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
        const at = baseFor(ev.iid) + ripple(ev, ev.iid);
        items.push({ ev, at, hold: ev.kind === 'shield' ? T.shieldHold : T.immuneHold, ...ownVolley(ev) });
        if (!hitAt.has(ev.iid)) hitAt.set(ev.iid, at);
        noteImpact(ev.iid, at);
        break;
      }
      case 'heal': {
        // Lifesteal arrives when its motes do — after the hit it was drawn from.
        const drawnFrom = ev.tag === 'lifesteal' && ev.from ? hitAt.get(ev.from.iid) : undefined;
        const at = drawnFrom != null
          ? drawnFrom + T.streamTravel
          : baseFor(ev.iid) + ripple(ev, ev.iid);
        items.push({ ev, at, hold: T.healHold });
        noteImpact(ev.iid, at);
        break;
      }
      case 'status': {
        const n = statusCount.get(ev.iid) ?? 0;
        statusCount.set(ev.iid, n + 1);
        const h = hitAt.get(ev.iid);
        const at = (h != null ? h + T.statusAfterHit : baseFor(ev.iid) + ripple(ev, ev.iid)) + T.statusStack * n;
        items.push({ ev, at, hold: T.statusHold });
        noteImpact(ev.iid, at);
        break;
      }
      case 'swing':
        // The turn's own swing is walked by the choreographer from the forecast
        // (see walkedByChoreographer), and Board never hands it to the timeline.
        // One that follows a cast is a volley's: the gun goes off at its target,
        // and what it hits lands `at` — the hit's own item draws the impact.
        if (steps.has(ev)) {
          items.push({ ev, at: baseFor(ev.targetIid) + ripple(ev, ev.targetIid), hold: T.volleyHold, ...ownVolley(ev) });
        }
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
