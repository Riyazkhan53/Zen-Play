import { GameDef, IllegalMoveError, SeatInfo, rollDie } from '../types';

// Track model: 52 shared squares, numbered clockwise from red's start.
// Each token's progress is relative to its own colour's start:
//   -1      in the yard
//   0..50   on the shared track
//   51..55  in its home column
//   56      home (finished)
export const YARD = -1;
export const LAST_TRACK = 50;
export const HOME = 56;
export const TRACK_LENGTH = 52;

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';
export const COLOR_ORDER: LudoColor[] = ['red', 'green', 'yellow', 'blue'];
export const START_OFFSET: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
// Start squares and the star 8 squares after each start can't be captured on.
export const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Two players sit opposite each other; three leave blue empty.
export const SEAT_COLORS: Record<number, LudoColor[]> = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};

export type LudoMove = { type: 'roll' } | { type: 'move'; token: number };

export interface LudoEvent {
  seat: number;
  dice: number;
  token?: number;
  from?: number;
  to?: number;
  captured?: { seat: number; token: number }[];
  note?: 'no-move' | 'three-sixes' | 'finished';
}

export interface LudoState {
  seats: SeatInfo[];
  colors: LudoColor[];
  tokens: number[][];
  turn: number;
  phase: 'roll' | 'move';
  dice: number | null;
  sixesInRow: number;
  movable: number[];
  rankings: number[];
  over: boolean;
  last: LudoEvent | null;
}

export function globalSquare(color: LudoColor, progress: number): number | null {
  if (progress < 0 || progress > LAST_TRACK) return null;
  return (START_OFFSET[color] + progress) % TRACK_LENGTH;
}

function movableTokens(tokens: number[], dice: number): number[] {
  const result: number[] = [];
  tokens.forEach((p, i) => {
    if (p === YARD ? dice === 6 : p !== HOME && p + dice <= HOME) result.push(i);
  });
  return result;
}

function isFinished(tokens: number[]) {
  return tokens.every((p) => p === HOME);
}

function nextActiveSeat(state: LudoState, from: number): number {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if (!state.rankings.includes(seat)) return seat;
  }
  return from;
}

function endTurn(state: LudoState, extraTurn: boolean): LudoState {
  const finishedNow = state.rankings.includes(state.turn);
  const keep = extraTurn && !finishedNow;
  return {
    ...state,
    turn: keep ? state.turn : nextActiveSeat(state, state.turn),
    sixesInRow: keep ? state.sixesInRow : 0,
    phase: 'roll',
    movable: [],
  };
}

export const ludo: GameDef<LudoState, LudoMove> = {
  id: 'ludo',
  minPlayers: 2,
  maxPlayers: 4,

  setup(seats) {
    const colors = SEAT_COLORS[seats.length];
    if (!colors) throw new IllegalMoveError('Ludo needs 2 to 4 players');
    return {
      seats,
      colors,
      tokens: seats.map(() => [YARD, YARD, YARD, YARD]),
      turn: 0,
      phase: 'roll',
      dice: null,
      sixesInRow: 0,
      movable: [],
      rankings: [],
      over: false,
      last: null,
    };
  },

  currentSeat: (state) => (state.over ? null : state.turn),

  applyMove(state, seat, move, rng) {
    if (state.over) throw new IllegalMoveError('The game is over');
    if (seat !== state.turn) throw new IllegalMoveError('Not your turn');

    if (move.type === 'roll') {
      if (state.phase !== 'roll') throw new IllegalMoveError('Move a token first');
      const dice = rollDie(rng);
      const sixesInRow = dice === 6 ? state.sixesInRow + 1 : 0;
      if (sixesInRow === 3) {
        return endTurn({ ...state, dice, sixesInRow: 0, last: { seat, dice, note: 'three-sixes' } }, false);
      }
      const movable = movableTokens(state.tokens[seat], dice);
      if (movable.length === 0) {
        return endTurn({ ...state, dice, sixesInRow, last: { seat, dice, note: 'no-move' } }, false);
      }
      return { ...state, dice, sixesInRow, phase: 'move', movable, last: state.last };
    }

    if (state.phase !== 'move' || state.dice == null) throw new IllegalMoveError('Roll the dice first');
    if (!state.movable.includes(move.token)) throw new IllegalMoveError('That token cannot move');

    const dice = state.dice;
    const from = state.tokens[seat][move.token];
    const to = from === YARD ? 0 : from + dice;
    const tokens = state.tokens.map((t) => [...t]);
    tokens[seat][move.token] = to;

    const captured: { seat: number; token: number }[] = [];
    const square = globalSquare(state.colors[seat], to);
    if (square != null && !SAFE_SQUARES.has(square)) {
      tokens.forEach((other, otherSeat) => {
        if (otherSeat === seat) return;
        other.forEach((p, token) => {
          if (globalSquare(state.colors[otherSeat], p) === square) {
            other[token] = YARD;
            captured.push({ seat: otherSeat, token });
          }
        });
      });
    }

    let rankings = state.rankings;
    if (isFinished(tokens[seat])) rankings = [...rankings, seat];
    const remaining = state.seats.map((_, i) => i).filter((i) => !rankings.includes(i));
    const over = remaining.length <= 1;
    if (over) rankings = [...rankings, ...remaining];

    const next: LudoState = {
      ...state,
      tokens,
      rankings,
      over,
      last: { seat, dice, token: move.token, from, to, captured, note: to === HOME ? 'finished' : undefined },
    };
    if (over) return { ...next, phase: 'roll', movable: [] };
    return endTurn(next, dice === 6 || captured.length > 0 || to === HOME);
  },

  botMove(state, seat) {
    if (state.phase === 'roll') return { type: 'roll' };
    const dice = state.dice ?? 0;
    const color = state.colors[seat];
    let best = state.movable[0];
    let bestScore = -Infinity;
    for (const token of state.movable) {
      const from = state.tokens[seat][token];
      const to = from === YARD ? 0 : from + dice;
      const square = globalSquare(color, to);
      let score = to; // prefer advancing
      if (to === HOME) score += 80;
      if (from === YARD) score += 60;
      if (from <= LAST_TRACK && to > LAST_TRACK) score += 40;
      if (square != null && SAFE_SQUARES.has(square)) score += 15;
      if (square != null && !SAFE_SQUARES.has(square)) {
        state.tokens.forEach((other, otherSeat) => {
          if (otherSeat === seat) return;
          other.forEach((p) => {
            if (globalSquare(state.colors[otherSeat], p) === square) score += 100;
          });
        });
      }
      if (score > bestScore) {
        bestScore = score;
        best = token;
      }
    }
    return { type: 'move', token: best };
  },

  rankings: (state) => state.rankings,
};
