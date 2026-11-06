/**
 * Which seat the person at this screen plays. The engine names it
 * (`G.humanSeat`, seat 0 unless a match config says otherwise); the board,
 * which still lays itself out for seat 0, reads it here and only here. With no
 * human seat (an AI-vs-AI match) the board shows seat 0's side.
 */
import type { GameState, PlayerID } from '@/engine/types';

export function humanSeat(G: Pick<GameState, 'humanSeat'>): PlayerID {
  return G.humanSeat ?? '0';
}
