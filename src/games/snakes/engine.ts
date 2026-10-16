import { GameDef, IllegalMoveError, SeatInfo, rollDie } from '../types';

export const FINAL_SQUARE = 100;

// Classic board layout.
export const LADDERS: Record<number, number> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
};
export const SNAKES: Record<number, number> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
};

export type SnakesMove = { type: 'roll' };

export interface SnakesEvent {
  seat: number;
  dice: number;
  from: number;
  /** Square reached by the roll, before any snake or ladder. */
  landed: number;
  to: number;
  via: 'snake' | 'ladder' | 'overshoot' | null;
}

export interface SnakesState {
  seats: SeatInfo[];
  /** 0 = not on the board yet. */
  positions: number[];
  turn: number;
  rankings: number[];
  over: boolean;
  last: SnakesEvent | null;
}

export const snakes: GameDef<SnakesState, SnakesMove> = {
  id: 'snakes',
  minPlayers: 2,
  maxPlayers: 6,

  setup(seats) {
    if (seats.length < 2 || seats.length > 6) throw new IllegalMoveError('Snakes & Ladders needs 2 to 6 players');
    return { seats, positions: seats.map(() => 0), turn: 0, rankings: [], over: false, last: null };
  },

  currentSeat: (state) => (state.over ? null : state.turn),

  applyMove(state, seat, move, rng) {
    if (state.over) throw new IllegalMoveError('The game is over');
    if (seat !== state.turn) throw new IllegalMoveError('Not your turn');
    if (move.type !== 'roll') throw new IllegalMoveError('Unknown move');

    const dice = rollDie(rng);
    const from = state.positions[seat];
    const landed = from + dice;
    let to = landed;
    let via: SnakesEvent['via'] = null;
    if (landed > FINAL_SQUARE) {
      // Must land exactly on 100.
      to = from;
      via = 'overshoot';
    } else if (LADDERS[landed]) {
      to = LADDERS[landed];
      via = 'ladder';
    } else if (SNAKES[landed]) {
      to = SNAKES[landed];
      via = 'snake';
    }

    const positions = [...state.positions];
    positions[seat] = to;
    const last: SnakesEvent = { seat, dice, from, landed: Math.min(landed, FINAL_SQUARE), to, via };

    if (to === FINAL_SQUARE) {
      // First home wins; everyone else is ranked by how far they got.
      const others = state.seats
        .map((_, i) => i)
        .filter((i) => i !== seat)
        .sort((a, b) => positions[b] - positions[a]);
      return { ...state, positions, rankings: [seat, ...others], over: true, last };
    }

    // A six earns another roll.
    const turn = dice === 6 ? seat : (seat + 1) % state.seats.length;
    return { ...state, positions, turn, last };
  },

  botMove: () => ({ type: 'roll' }),

  rankings: (state) => state.rankings,
};
