import { Client } from 'boardgame.io/react';
import { DeadlockGame } from './engine/game';
import { Board } from './ui/Board';

export const App = Client({
  game: DeadlockGame,
  board: Board,
  numPlayers: 2,
  debug: false,
});
