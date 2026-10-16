import { Dice } from '@/components/dice';
import { LudoBoard } from '@/components/ludo-board';
import { HOME, LudoState } from '@/games/ludo/engine';
import { seatColor } from '@/ui/seat-colors';

import type { GameUI } from './types';

export const ludoUI: GameUI<LudoState> = {
  shape: 'square',
  Board: ({ state, size, mySeats, act }) => (
    <LudoBoard
      state={state}
      size={size}
      canMove={!state.over && mySeats.includes(state.turn)}
      onMoveToken={(token) => act(state.turn, { type: 'move', token })}
    />
  ),
  Controls: ({ state, room, mySeats, seq, act }) => (
    <Dice
      value={state.dice}
      rollKey={seq}
      color={seatColor('ludo', state.turn, room.seats.length)}
      canRoll={!state.over && mySeats.includes(state.turn) && state.phase === 'roll'}
      onRoll={() => act(state.turn, { type: 'roll' })}
    />
  ),
  status(state, room) {
    const name = (seat: number) => room.seats[seat]?.name ?? 'Player';
    const last = state.last;
    if (state.phase === 'move' && state.dice) return `${name(state.turn)} rolled ${state.dice}`;
    if (!last) return 'Roll a 6 to bring a token out.';
    if (last.note === 'three-sixes') return `${name(last.seat)} rolled three 6s — turn over`;
    if (last.note === 'no-move') return `${name(last.seat)} rolled ${last.dice} — no move`;
    if (last.captured?.length) return `${name(last.seat)} captured ${name(last.captured[0].seat)}! 💥`;
    if (last.note === 'finished') return `${name(last.seat)} got a token home! 🏠`;
    return `${name(last.seat)} moved ${last.dice}`;
  },
  hint: (state, _room, myTurn) =>
    !myTurn ? '' : state.phase === 'move' ? 'Tap a glowing token' : 'Tap the dice to roll',
  detail(state, seat) {
    const home = state.tokens[seat].filter((p) => p === HOME).length;
    const place = state.rankings.indexOf(seat);
    return place >= 0 && home === 4 ? `#${place + 1}` : `${home}/4 home`;
  },
  result: (state, room) => `${room.seats[state.rankings[0]]?.name} wins!`,
};
