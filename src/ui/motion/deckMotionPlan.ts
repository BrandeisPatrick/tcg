/**
 * The card motion between the deck, the hand and the discard pile — planned
 * from the `deck` FX events the engine reports (docs/deck-plan.md,
 * "Animations"; `DeckFx` in engine/types.ts), never from guessing at state
 * diffs. Pure: no DOM, no timers, so Board can run it on the render the state
 * changes (the hand then knows which cards are landing) and the tests can
 * exercise it directly. `DeckMotionLayer` plays the plan.
 *
 * What one batch of events becomes:
 *   place     a hero flies to the slot it was put in — from the hand card
 *             (yours face up; the rival's leaves as a back and turns over as
 *             it lands), or, the opening, from the picker's card (yours) and
 *             the rival's hand (its first Active, hidden until then); the real
 *             tile stays out of sight until it lands
 *   shuffle   the opening: the side's drafted heroes still in its deck appear
 *             over the table and fly into it one after another, then the deck
 *             riffles; any other shuffle is the riffle alone
 *   draw      a card flies from the deck to the hand (yours lands face up,
 *             the rival's stays face down); the deck's count ticks as it leaves
 *   discard   a card flies from the hand (or off the hero that wore it) to
 *             the discard pile, face up; the pile's count ticks as it lands
 *   upgrade   the upgrade card appears over the table, holds, and flies into
 *             the deck
 *   toHand    a fallen hero flies from its slot back to the hand
 *
 * Each side has its own cursor, so both sides' openings play at once (the
 * Actives fly, the heroes go in, the decks riffle, the hands are dealt);
 * within a side a run of cards is staggered (a draw of 8 lands in ~1.2 s), and
 * a placement, a riffle or an upgrade waits for the run before it. Nothing here blocks input or
 * reads back into the game: the plan is presentation only.
 */
import type { CardId, DeckFx, FxEvent, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';

/** Every number of the motion, ms. */
export const DECK_MOTION = {
  /** One card's flight. */
  flight: 380,
  /** One card to the next in a run of draws or discards. */
  stagger: 110,
  /** The deck riffling after a shuffle. */
  riffle: 420,
  /** An upgrade card shown over the table before it flies into the deck. */
  appear: 560,
  /** The opening: the board settles before the heroes leave. */
  lead: 220,
  /** The opening: one hero into the deck to the next. */
  fanIn: 100,
} as const;

export type PileKind = 'deck' | 'discard';
export type Face = 'back' | 'face';

/** Where a flight starts or ends. The layer measures each on screen. */
export type Anchor =
  /** A side's deck or discard pile. */
  | { kind: 'pile'; pile: PileKind; pid: PlayerID }
  /** A card in a side's hand (`iid`), or the hand itself when it is not known. */
  | { kind: 'hand'; pid: PlayerID; iid?: string }
  /** A hero's slot on the board. */
  | { kind: 'slot'; iid: string }
  /** The middle of a side's half of the table: card `i` of `n` across. */
  | { kind: 'stage'; pid: PlayerID; i: number; n: number };

export interface Flight {
  /** The event's seq: the flight's identity. The opening's hero flights hang
   *  off their shuffle's seq, `-` the hero's index. */
  key: string;
  what: DeckFx['what'];
  pid: PlayerID;
  cardId?: CardId;
  iid?: string;
  /** ms after the batch arrives that the card leaves `from`. */
  at: number;
  /** ms held at `from`, shown, before it leaves (an upgrade appears first). */
  hold: number;
  /** ms the flight takes once it leaves. */
  dur: number;
  from: Anchor;
  to: Anchor;
  /** What is seen as it leaves and as it lands: a back or the card's face. */
  faces: { start: Face; end: Face };
  /** The real card (its iid) to keep out of sight until the flight lands —
   *  the hand card the flight becomes, or the one it carries away. */
  hide?: string;
}

/** A pile's count changing when a card leaves it or lands on it. */
export interface PileTick { pile: PileKind; pid: PlayerID; at: number; delta: 1 | -1 }

/** A deck riffling (the shuffle). */
export interface Riffle { pid: PlayerID; at: number; dur: number }

export interface DeckMotionPlan {
  flights: Flight[];
  ticks: PileTick[];
  riffles: Riffle[];
  /** ms after which everything has landed. */
  total: number;
  /** The match's opening: the drafted heroes going into the decks. */
  opening: boolean;
}

export const EMPTY_PLAN: DeckMotionPlan = { flights: [], ticks: [], riffles: [], total: 0, opening: false };

/** The `deck` events of a batch, in seq order. */
export function deckEvents(batch: readonly FxEvent[]): DeckFx[] {
  return batch.filter((e): e is DeckFx => e.kind === 'deck').sort((a, b) => a.seq - b.seq);
}

/** Where a card was, read from the game before the batch. */
export type Place =
  | { kind: 'hand' }
  | { kind: 'worn'; heroIid: string }
  | { kind: 'board' }
  | { kind: 'deck' }
  | { kind: 'discard' }
  | null;

export function locate(G: GameState | null | undefined, pid: PlayerID, iid: string): Place {
  const ps = G?.players?.[pid];
  if (!ps) return null;
  if (ps.hand.some((c) => c.iid === iid)) return { kind: 'hand' };
  if (ps.deck.some((c) => c.iid === iid)) return { kind: 'deck' };
  if (ps.discard.some((c) => c.iid === iid)) return { kind: 'discard' };
  for (const hero of [ps.active, ...ps.bench]) {
    if (!hero) continue;
    if (hero.iid === iid) return { kind: 'board' };
    if ((hero.attached ?? []).some((a) => a.iid === iid)) return { kind: 'worn', heroIid: hero.iid };
  }
  return null;
}

/** The heroes a side shuffles into its deck at the opening: its drafted
 *  heroes less the one it chose for the lane — in the deck, or dealt to the
 *  hand by the batch. */
export function openingHeroes(G: GameState, pid: PlayerID): { iid: string; cardId: CardId }[] {
  const ps = G.players[pid];
  const all = [...ps.deck, ...ps.hand];
  return all
    .filter((c): c is NonNullable<typeof c> => !!c && CARDS_BY_ID[c.cardId]?.type === 'hero')
    .map((c) => ({ iid: c.iid, cardId: c.cardId }));
}

export interface PlanInput {
  /** The human seat: its cards land face up, the rival's face down. */
  me: PlayerID;
  /** The game before the batch — where each card was. Null when unknown. */
  before: GameState | null | undefined;
  /** The game now — the heroes of the opening are read off it. */
  after: GameState;
}

/** True when `batch` is the match's opening: the shuffle that follows the
 *  first Actives' choice (the human seat's `chooseActive`, or the draft's
 *  last pick when no seat is human — the Actives, the shuffles and the deal
 *  come in one batch), or a scripted match's first batch. */
export function isOpening(events: readonly DeckFx[], input: PlanInput): boolean {
  if (!events.some((e) => e.what === 'shuffle')) return false;
  if (input.before?.draft || input.before?.pendingActive) return true;
  return !input.before && input.after.turnNumber <= 1;
}

/** One side's clock through the batch. */
interface Cursor {
  /** When the next card of a run may leave. */
  next: number;
  /** When everything so far has landed. */
  end: number;
  /** The side has had its opening shuffle. */
  opened: boolean;
}

export function planDeckMotion(batch: readonly FxEvent[], input: PlanInput): DeckMotionPlan {
  const events = deckEvents(batch);
  if (events.length === 0) return EMPTY_PLAN;
  const T = DECK_MOTION;
  const opening = isOpening(events, input);
  const flights: Flight[] = [];
  const ticks: PileTick[] = [];
  const riffles: Riffle[] = [];
  const cursors: Record<PlayerID, Cursor> = {
    '0': { next: opening ? T.lead : 0, end: opening ? T.lead : 0, opened: false },
    '1': { next: opening ? T.lead : 0, end: opening ? T.lead : 0, opened: false },
  };
  const faceFor = (pid: PlayerID): Face => (pid === input.me ? 'face' : 'back');

  for (const ev of events) {
    const pid = ev.pid;
    const c = cursors[pid];
    const deck: Anchor = { kind: 'pile', pile: 'deck', pid };
    const discard: Anchor = { kind: 'pile', pile: 'discard', pid };
    switch (ev.what) {
      case 'shuffle': {
        let at = c.end;
        if (opening && !c.opened) {
          c.opened = true;
          const heroes = openingHeroes(input.after, pid);
          heroes.forEach((h, i) => {
            flights.push({
              key: `${ev.seq}-${i}`, what: 'shuffle', pid, cardId: h.cardId, iid: h.iid,
              at: at + i * T.fanIn, hold: 0, dur: T.flight,
              from: { kind: 'stage', pid, i, n: heroes.length }, to: deck,
              faces: { start: 'face', end: 'face' },
            });
          });
          if (heroes.length > 0) at += (heroes.length - 1) * T.fanIn + T.flight;
        }
        riffles.push({ pid, at, dur: T.riffle });
        c.end = at + T.riffle;
        c.next = c.end;
        break;
      }
      case 'draw': {
        const at = c.next;
        flights.push({
          key: `${ev.seq}`, what: 'draw', pid, cardId: ev.cardId, iid: ev.iid,
          at, hold: 0, dur: T.flight,
          from: deck, to: { kind: 'hand', pid, iid: ev.iid },
          faces: { start: 'back', end: faceFor(pid) },
          hide: ev.iid,
        });
        ticks.push({ pile: 'deck', pid, at, delta: -1 });
        c.next = at + T.stagger;
        c.end = Math.max(c.end, at + T.flight);
        break;
      }
      case 'discard': {
        const at = c.next;
        const was = ev.iid ? locate(input.before, pid, ev.iid) : null;
        if (was?.kind === 'hand') {
          flights.push({
            key: `${ev.seq}`, what: 'discard', pid, cardId: ev.cardId, iid: ev.iid,
            at, hold: 0, dur: T.flight,
            from: { kind: 'hand', pid, iid: ev.iid }, to: discard,
            faces: { start: faceFor(pid), end: 'face' },
            hide: ev.iid,
          });
        } else if (was?.kind === 'worn' || was?.kind === 'board') {
          flights.push({
            key: `${ev.seq}`, what: 'discard', pid, cardId: ev.cardId, iid: ev.iid,
            at, hold: 0, dur: T.flight,
            from: { kind: 'slot', iid: was.kind === 'worn' ? was.heroIid : ev.iid! }, to: discard,
            faces: { start: 'face', end: 'face' },
          });
        } else {
          // Nowhere we can point at: the pile just takes it, on the beat.
          ticks.push({ pile: 'discard', pid, at, delta: 1 });
          c.next = at + T.stagger;
          c.end = Math.max(c.end, at);
          break;
        }
        ticks.push({ pile: 'discard', pid, at: at + T.flight, delta: 1 });
        c.next = at + T.stagger;
        c.end = Math.max(c.end, at + T.flight);
        break;
      }
      case 'upgrade': {
        const at = c.end;
        flights.push({
          key: `${ev.seq}`, what: 'upgrade', pid, cardId: ev.cardId, iid: ev.iid,
          at, hold: T.appear, dur: T.flight,
          from: { kind: 'stage', pid, i: 0, n: 1 }, to: deck,
          faces: { start: 'face', end: 'face' },
        });
        ticks.push({ pile: 'deck', pid, at: at + T.appear + T.flight, delta: 1 });
        c.end = at + T.appear + T.flight;
        c.next = c.end;
        break;
      }
      case 'toHand': {
        const at = c.next;
        flights.push({
          key: `${ev.seq}`, what: 'toHand', pid, cardId: ev.cardId, iid: ev.iid,
          at, hold: 0, dur: T.flight,
          from: { kind: 'slot', iid: ev.iid! }, to: { kind: 'hand', pid, iid: ev.iid },
          faces: { start: 'face', end: faceFor(pid) },
          hide: ev.iid,
        });
        c.next = at + T.stagger;
        c.end = Math.max(c.end, at + T.flight);
        break;
      }
      case 'place': {
        // After whatever the side has in the air: the opening's lead, a turn's draw.
        const at = c.end;
        flights.push({
          key: `${ev.seq}`, what: 'place', pid, cardId: ev.cardId, iid: ev.iid,
          at, hold: 0, dur: T.flight,
          from: { kind: 'hand', pid, iid: ev.iid }, to: { kind: 'slot', iid: ev.iid! },
          // Yours was face up in the hand (or on the picker); the rival's
          // leaves its hand as a back and turns over as it lands.
          faces: { start: faceFor(pid), end: 'face' },
          hide: ev.iid,
        });
        c.end = at + T.flight;
        c.next = c.end;
        break;
      }
    }
  }

  const total = Math.max(
    0,
    ...flights.map((f) => f.at + f.hold + f.dur),
    ...riffles.map((r) => r.at + r.dur),
    ...ticks.map((t) => t.at),
  );
  return { flights, ticks, riffles, total, opening };
}

/** ms after the batch arrives that the last placement of a side other than
 *  `me` has landed: the AI's next move waits for it. 0 when there is none. */
export function rivalPlacedBy(plan: DeckMotionPlan, me: PlayerID): number {
  return Math.max(0, ...plan.flights.filter((f) => f.what === 'place' && f.pid !== me).map((f) => f.at + f.hold + f.dur));
}

/** The cards of `me`'s hand a plan flies in: the hand fades them in where
 *  they land instead of rising them from below. */
export function arrivingIids(plan: DeckMotionPlan, me: PlayerID): string[] {
  return plan.flights
    .filter((f) => f.pid === me && f.to.kind === 'hand' && !!f.iid)
    .map((f) => f.iid!);
}
