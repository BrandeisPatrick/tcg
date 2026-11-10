import { useEffect, useState } from 'react';

/**
 * The turn's spine, beat by beat: Income (the souls arrive and a card is
 * drawn, cooldowns tick, a fallen hero whose wait is over goes back to the
 * hand), Act (cards from the hand, abilities, a Retreat, the one attack), End
 * (statuses tick, the lane is pushed, the rival's turn). The two edges the
 * engine runs inside one move — the end of a turn and the start of the next —
 * are given a beat each here, so they can be seen.
 */
export type TurnBeat = 'income' | 'act' | 'end';
export const TURN_BEATS: readonly TurnBeat[] = ['income', 'act', 'end'];
export const BEAT_WORD: Record<TurnBeat, string> = { income: 'Income', act: 'Act', end: 'End' };

/** How long the End beat holds as a turn hands over, ms: the end-of-turn
 *  ticks and the push play under it. */
export const END_BEAT_MS = 700;
/** How long the Income beat holds as a turn opens, ms: the souls count up
 *  under it, and the card is drawn. */
export const INCOME_BEAT_MS = 1100;

export interface BeatView {
  beat: TurnBeat;
  /** The turn the beat belongs to: through a hand-over's End beat, the turn
   *  that just ended. */
  turn: number;
  /** Whose beat it is: through a hand-over's End beat, the player whose turn
   *  just ended. */
  mine: boolean;
  /** A hand-over is playing (the End of one turn, then the Income of the
   *  next): the turn's own step has not taken over yet. */
  edge: boolean;
}

/** A hand-over beat in play, and — through an End beat — the turn it hands to. */
interface Edge {
  beat: 'end' | 'income';
  turn: number;
  mine: boolean;
  next?: { turn: number; mine: boolean };
}

/**
 * The beat a turn is on. As a turn hands over: the End beat of the turn that
 * ended, still its player's, then the Income beat of the one that began; a
 * board that mounts on a match's first turn opens on its Income too. Then the
 * turn's own Act — and End once its attack is made, for the attack ends the
 * turn's play and the turn ends on its own (`attackMade`: the attack made, its
 * walk over). The hand-over is read in the render that first shows the new
 * turn, so not one frame of the new turn's Act slips out before its beats.
 * Every reader of the spine calls this with the same inputs, so they agree.
 */
export function useTurnBeat({ turn, isMyTurn, attackMade }: {
  /** The engine turn; under 1 while there is no match turn yet (the draft). */
  turn: number;
  isMyTurn: boolean;
  attackMade: boolean;
}): BeatView {
  const [seen, setSeen] = useState({ turn, mine: isMyTurn });
  const [edge, setEdge] = useState<Edge | null>(
    () => (turn >= 1 && !attackMade ? { beat: 'income', turn, mine: isMyTurn } : null),
  );
  // A new turn: its hand-over starts in this very render (a state update
  // during render re-renders at once, before anything is committed). The
  // match's first turn follows the draft, not a turn: it opens on its Income
  // alone.
  let shown = edge;
  if (seen.turn !== turn) {
    shown = turn < 1 ? null
      : seen.turn >= 1 ? { beat: 'end', turn: seen.turn, mine: seen.mine, next: { turn, mine: isMyTurn } }
      : { beat: 'income', turn, mine: isMyTurn };
    setSeen({ turn, mine: isMyTurn });
    setEdge(shown);
  }
  // Each hand-over beat holds its time, then gives way to the next.
  useEffect(() => {
    if (!edge) return;
    const t = setTimeout(
      () => setEdge(edge.beat === 'end' && edge.next ? { beat: 'income', ...edge.next } : null),
      edge.beat === 'end' ? END_BEAT_MS : INCOME_BEAT_MS,
    );
    return () => clearTimeout(t);
  }, [edge]);
  if (shown) return { beat: shown.beat, turn: shown.turn, mine: shown.mine, edge: true };
  return { beat: attackMade ? 'end' : 'act', turn, mine: isMyTurn, edge: false };
}
