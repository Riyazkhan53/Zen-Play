import { SEAT_COLORS } from '@/games/ludo/engine';
import type { GameId } from '@/games/types';

import { LUDO_COLORS, PLAYER_COLORS } from './theme';

/** Colour a seat plays as, so the lobby matches the board. */
export function seatColor(gameId: GameId, seat: number, seatCount: number): string {
  if (gameId === 'ludo') {
    const colors = SEAT_COLORS[Math.max(2, Math.min(4, seatCount))];
    return LUDO_COLORS[colors[seat] ?? 'blue'];
  }
  if (gameId === 'carrom') return seat % 2 === 0 ? '#F8FAFC' : '#475569';
  if (gameId === 'chess') return seat === 0 ? '#F8FAFC' : '#475569';
  return PLAYER_COLORS[seat % PLAYER_COLORS.length];
}
