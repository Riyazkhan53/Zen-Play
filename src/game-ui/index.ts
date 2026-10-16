import type { GameId } from '@/games/types';

import { chessUI } from './chess';
import { ludoUI } from './ludo';
import { snakesUI } from './snakes';
import type { GameUI } from './types';

export const GAME_UI: Partial<Record<GameId, GameUI<any>>> = {
  ludo: ludoUI,
  snakes: snakesUI,
  chess: chessUI,
};
