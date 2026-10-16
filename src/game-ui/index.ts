import type { GameId } from '@/games/types';

import { carromUI } from './carrom';
import { chessUI } from './chess';
import { ludoUI } from './ludo';
import { rummyUI } from './rummy';
import { snakesUI } from './snakes';
import { unoUI } from './uno';
import type { GameUI } from './types';

export const GAME_UI: Partial<Record<GameId, GameUI<any>>> = {
  ludo: ludoUI,
  snakes: snakesUI,
  chess: chessUI,
  carrom: carromUI,
  uno: unoUI,
  rummy: rummyUI,
};
