/**
 * A fallen hero leaves the board at once in the engine (death.ts
 * `heroToDeck`, 2026-11-18: shuffled into its owner's deck). On screen it
 * stays in its slot a moment longer, as it stood before the blow, so the
 * knockout can play on it — the bolt landing, the card breaking — and only
 * then is the slot empty and a card back flies from it into the deck
 * (deckMotionPlan's `toDeck`). How long: until the shatter's backing hides
 * the swap (`koCorpse`, fxTimeline.ts), or, for a kill the combat walk has
 * already played, a beat (FALLEN_BEAT).
 *
 * Pure: `fallenHolds` reads the batch and the game before it, `boardWithFallen`
 * lays the held heroes back into a copy of the game for the board to draw.
 */
import type { CardInstance, DeckFx, FxEvent, GameState, PlayerID } from '@/engine/types';

/** ms a fallen hero stays in its slot when nothing in the batch breaks it
 *  (the combat walk broke it before the engine resolved). */
export const FALLEN_BEAT = 220;

/** A fallen hero held in its slot on screen. */
export interface FallenHold {
  pid: PlayerID;
  /** 0 the Active, 1-3 the bench: where it stood before the blow. */
  slot: 0 | 1 | 2 | 3;
  /** The hero as it stood before the blow. */
  card: CardInstance;
  /** ms after the batch that it leaves its slot. */
  ms: number;
}

/** The heroes the batch shuffled into a deck (`toDeck`), held where they
 *  stood in `before` for `koCorpse[iid]` ms, or FALLEN_BEAT. */
export function fallenHolds(batch: readonly FxEvent[], before: GameState | null | undefined, koCorpse: Record<string, number>): FallenHold[] {
  if (!before) return [];
  const out: FallenHold[] = [];
  for (const e of batch) {
    if (e.kind !== 'deck' || (e as DeckFx).what !== 'toDeck' || !e.iid) continue;
    const ps = before.players[e.pid];
    if (!ps) continue;
    const at = ps.active?.iid === e.iid ? 0 : ps.bench.findIndex((b) => b?.iid === e.iid) + 1;
    const card = at === 0 ? ps.active : ps.bench[at - 1];
    if (!card || at < 0) continue;
    out.push({ pid: e.pid, slot: at as FallenHold['slot'], card, ms: koCorpse[e.iid] ?? FALLEN_BEAT });
  }
  return out;
}

/**
 * `G` with each held hero back in its slot, for the board to draw. Where the
 * slot has been filled since (an AI side steps a bench hero up into its
 * fallen Active's lane in the same move), the hero that stepped up is drawn
 * where it stood until then, so the step-up plays once the fallen one has
 * gone. A slot that cannot be given back is left as it is.
 */
export function boardWithFallen(G: GameState, before: GameState | null | undefined, held: readonly FallenHold[]): GameState {
  if (held.length === 0) return G;
  const players = { ...G.players };
  for (const h of held) {
    const live = players[h.pid];
    if (!live) continue;
    const ps = { ...live, bench: [...live.bench] };
    const taken = h.slot === 0 ? ps.active : ps.bench[h.slot - 1];
    if (taken && taken.iid !== h.card.iid) {
      // Who stands there now: put it back where it stood before, if that is free.
      const was = before?.players[h.pid]?.bench.findIndex((b) => b?.iid === taken.iid) ?? -1;
      if (was < 0 || ps.bench[was] != null) continue;
      ps.bench[was] = taken;
    }
    if (h.slot === 0) ps.active = h.card;
    else ps.bench[h.slot - 1] = h.card;
    players[h.pid] = ps;
  }
  return { ...G, players };
}
