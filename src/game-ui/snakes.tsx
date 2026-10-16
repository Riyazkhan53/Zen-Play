import { Dice } from '@/components/dice';
import { SnakesBoard } from '@/components/snakes-board';
import { SnakesState } from '@/games/snakes/engine';
import { seatColor } from '@/ui/seat-colors';

import type { GameUI } from './types';

export const snakesUI: GameUI<SnakesState> = {
  shape: 'square',
  Board: ({ state, size }) => <SnakesBoard state={state} size={size} />,
  Controls: ({ state, room, mySeats, seq, act }) => (
    <Dice
      value={state.last?.dice ?? null}
      rollKey={seq}
      color={seatColor('snakes', state.turn, room.seats.length)}
      canRoll={!state.over && mySeats.includes(state.turn)}
      onRoll={() => act(state.turn, { type: 'roll' })}
    />
  ),
  status(state, room) {
    const last = state.last;
    if (!last) return 'First to land exactly on 100 wins.';
    const who = room.seats[last.seat]?.name ?? 'Player';
    if (last.via === 'ladder') return `${who} rolled ${last.dice} and climbed to ${last.to}! 🪜`;
    if (last.via === 'snake') return `${who} rolled ${last.dice} — snake! Down to ${last.to} 🐍`;
    if (last.via === 'overshoot') return `${who} rolled ${last.dice} — needs an exact roll`;
    return `${who} rolled ${last.dice} → ${last.to}`;
  },
  hint: (_state, _room, myTurn) => (myTurn ? 'Tap the dice to roll' : ''),
  detail(state, seat) {
    const pos = state.positions[seat];
    return pos === 0 ? 'start' : `on ${pos}`;
  },
  result: (state, room) => `${room.seats[state.rankings[0]]?.name} wins!`,
};
