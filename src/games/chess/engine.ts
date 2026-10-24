import { Difficulty, GameDef, IllegalMoveError, SeatInfo } from '../types';

// Squares are 0..63: index = rank * 8 + file, rank 0 is White's back rank.
// Pieces are two-letter codes: colour (w/b) + type (P N B R Q K).
export type Color = 'w' | 'b';
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K';
export type Piece = `${Color}${PieceType}`;
export type Promotion = 'Q' | 'R' | 'B' | 'N';

export type ChessMove = { type: 'move'; from: number; to: number; promotion?: Promotion } | { type: 'resign' };

export interface Move {
  from: number;
  to: number;
  promotion?: Promotion;
}

export type ChessEnd = 'checkmate' | 'stalemate' | 'resign' | 'repetition' | 'fifty-moves' | 'insufficient';

export interface ChessState {
  seats: SeatInfo[];
  board: (Piece | null)[];
  /** Seat to move: 0 plays White, 1 plays Black. */
  turn: number;
  castling: string; // subset of "KQkq"
  enPassant: number | null;
  halfmove: number;
  fullmove: number;
  repetitions: Record<string, number>;
  check: boolean;
  last: { from: number; to: number; san: string; captured?: Piece } | null;
  captured: Piece[];
  over: boolean;
  end: ChessEnd | null;
  /** Winning seat, or null for a draw. */
  winner: number | null;
  rankings: number[];
}

const FILES = 'abcdefgh';
export const squareName = (sq: number) => `${FILES[sq % 8]}${Math.floor(sq / 8) + 1}`;
export const seatColor = (seat: number): Color => (seat === 0 ? 'w' : 'b');
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const rank = (sq: number) => Math.floor(sq / 8);
const file = (sq: number) => sq % 8;
const onBoard = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;

const KNIGHT = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const KING = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function initialBoard(): (Piece | null)[] {
  const board: (Piece | null)[] = Array(64).fill(null);
  const back: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  back.forEach((t, f) => {
    board[f] = `w${t}`;
    board[56 + f] = `b${t}`;
    board[8 + f] = 'wP';
    board[48 + f] = 'bP';
  });
  return board;
}

/** Is `sq` attacked by any piece of colour `by`? */
export function isAttacked(board: (Piece | null)[], sq: number, by: Color): boolean {
  const r = rank(sq);
  const f = file(sq);
  const pawnRank = by === 'w' ? r - 1 : r + 1;
  for (const df of [-1, 1]) {
    if (onBoard(pawnRank, f + df) && board[pawnRank * 8 + f + df] === `${by}P`) return true;
  }
  for (const [dr, df] of KNIGHT) {
    if (onBoard(r + dr, f + df) && board[(r + dr) * 8 + f + df] === `${by}N`) return true;
  }
  for (const [dr, df] of KING) {
    if (onBoard(r + dr, f + df) && board[(r + dr) * 8 + f + df] === `${by}K`) return true;
  }
  const slide = (dirs: number[][], types: string) => {
    for (const [dr, df] of dirs) {
      let rr = r + dr;
      let ff = f + df;
      while (onBoard(rr, ff)) {
        const p = board[rr * 8 + ff];
        if (p) {
          if (p[0] === by && types.includes(p[1])) return true;
          break;
        }
        rr += dr;
        ff += df;
      }
    }
    return false;
  };
  return slide(ROOK_DIRS, 'RQ') || slide(BISHOP_DIRS, 'BQ');
}

function kingSquare(board: (Piece | null)[], color: Color) {
  return board.indexOf(`${color}K`);
}

function pseudoMoves(state: ChessState, color: Color): Move[] {
  const { board } = state;
  const moves: Move[] = [];
  const add = (from: number, to: number) => {
    if (board[from]![1] === 'P' && (rank(to) === 7 || rank(to) === 0)) {
      for (const promotion of ['Q', 'R', 'B', 'N'] as Promotion[]) moves.push({ from, to, promotion });
    } else moves.push({ from, to });
  };

  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || p[0] !== color) continue;
    const r = rank(from);
    const f = file(from);
    switch (p[1]) {
      case 'P': {
        const dir = color === 'w' ? 1 : -1;
        const one = from + dir * 8;
        if (onBoard(r + dir, f) && !board[one]) {
          add(from, one);
          const startRank = color === 'w' ? 1 : 6;
          const two = from + dir * 16;
          if (r === startRank && !board[two]) moves.push({ from, to: two });
        }
        for (const df of [-1, 1]) {
          if (!onBoard(r + dir, f + df)) continue;
          const to = (r + dir) * 8 + f + df;
          const target = board[to];
          if ((target && target[0] !== color) || to === state.enPassant) add(from, to);
        }
        break;
      }
      case 'N':
      case 'K':
        for (const [dr, df] of p[1] === 'N' ? KNIGHT : KING) {
          if (!onBoard(r + dr, f + df)) continue;
          const to = (r + dr) * 8 + f + df;
          if (board[to]?.[0] !== color) moves.push({ from, to });
        }
        break;
      default: {
        const dirs = p[1] === 'R' ? ROOK_DIRS : p[1] === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
        for (const [dr, df] of dirs) {
          let rr = r + dr;
          let ff = f + df;
          while (onBoard(rr, ff)) {
            const to = rr * 8 + ff;
            if (board[to]?.[0] === color) break;
            moves.push({ from, to });
            if (board[to]) break;
            rr += dr;
            ff += df;
          }
        }
      }
    }
  }

  // Castling: rights intact, path empty, king not in or passing through check.
  const home = color === 'w' ? 0 : 56;
  const enemy = other(color);
  if (board[home + 4] === `${color}K` && !isAttacked(board, home + 4, enemy)) {
    const [kingSide, queenSide] = color === 'w' ? ['K', 'Q'] : ['k', 'q'];
    if (
      state.castling.includes(kingSide) &&
      board[home + 7] === `${color}R` &&
      !board[home + 5] &&
      !board[home + 6] &&
      !isAttacked(board, home + 5, enemy) &&
      !isAttacked(board, home + 6, enemy)
    ) {
      moves.push({ from: home + 4, to: home + 6 });
    }
    if (
      state.castling.includes(queenSide) &&
      board[home] === `${color}R` &&
      !board[home + 1] &&
      !board[home + 2] &&
      !board[home + 3] &&
      !isAttacked(board, home + 3, enemy) &&
      !isAttacked(board, home + 2, enemy)
    ) {
      moves.push({ from: home + 4, to: home + 2 });
    }
  }
  return moves;
}

/** Board after a move, plus what was captured. Doesn't check legality. */
function playOnBoard(state: ChessState, move: Move) {
  const board = [...state.board];
  const piece = board[move.from]!;
  let captured = board[move.to] ?? undefined;
  // En passant removes the pawn beside the destination.
  if (piece[1] === 'P' && move.to === state.enPassant && !board[move.to]) {
    const victim = move.to + (piece[0] === 'w' ? -8 : 8);
    captured = board[victim] ?? undefined;
    board[victim] = null;
  }
  // Castling moves the rook too.
  if (piece[1] === 'K' && Math.abs(move.to - move.from) === 2) {
    const kingSide = move.to > move.from;
    const rookFrom = kingSide ? move.from + 3 : move.from - 4;
    const rookTo = kingSide ? move.from + 1 : move.from - 1;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }
  board[move.to] = move.promotion ? (`${piece[0]}${move.promotion}` as Piece) : piece;
  board[move.from] = null;
  return { board, captured, piece };
}

export function legalMoves(state: ChessState): Move[] {
  if (state.over) return [];
  const color = seatColor(state.turn);
  return pseudoMoves(state, color).filter((m) => {
    const { board } = playOnBoard(state, m);
    return !isAttacked(board, kingSquare(board, color), other(color));
  });
}

function positionKey(board: (Piece | null)[], turn: number, castling: string, ep: number | null) {
  return `${board.map((p) => p ?? '.').join('')}|${turn}|${castling}|${ep ?? '-'}`;
}

function insufficientMaterial(board: (Piece | null)[]) {
  const pieces = board.filter((p): p is Piece => p != null && p[1] !== 'K');
  if (pieces.length === 0) return true;
  return pieces.length === 1 && (pieces[0][1] === 'B' || pieces[0][1] === 'N');
}

function sanFor(state: ChessState, move: Move, piece: Piece, captured: boolean): string {
  if (piece[1] === 'K' && Math.abs(move.to - move.from) === 2) return move.to > move.from ? 'O-O' : 'O-O-O';
  const dest = squareName(move.to);
  if (piece[1] === 'P') {
    return `${captured ? `${FILES[file(move.from)]}x` : ''}${dest}${move.promotion ? `=${move.promotion}` : ''}`;
  }
  // Disambiguate when another piece of the same kind could also go there.
  const rivals = legalMoves(state).filter(
    (m) => m.to === move.to && m.from !== move.from && state.board[m.from] === piece,
  );
  let from = '';
  if (rivals.length) {
    from = rivals.some((m) => file(m.from) === file(move.from))
      ? rivals.some((m) => rank(m.from) === rank(move.from))
        ? squareName(move.from)
        : String(rank(move.from) + 1)
      : FILES[file(move.from)];
  }
  return `${piece[1]}${from}${captured ? 'x' : ''}${dest}`;
}

function finish(state: ChessState, end: ChessEnd, winner: number | null): ChessState {
  return {
    ...state,
    over: true,
    end,
    winner,
    rankings: winner == null ? [0, 1] : [winner, 1 - winner],
  };
}

export const chess: GameDef<ChessState, ChessMove> = {
  id: 'chess',
  minPlayers: 2,
  maxPlayers: 2,

  setup(seats) {
    if (seats.length !== 2) throw new IllegalMoveError('Chess needs exactly 2 players');
    const board = initialBoard();
    return {
      seats,
      board,
      turn: 0,
      castling: 'KQkq',
      enPassant: null,
      halfmove: 0,
      fullmove: 1,
      repetitions: { [positionKey(board, 0, 'KQkq', null)]: 1 },
      check: false,
      last: null,
      captured: [],
      over: false,
      end: null,
      winner: null,
      rankings: [],
    };
  },

  currentSeat: (state) => (state.over ? null : state.turn),

  applyMove(state, seat, move) {
    if (state.over) throw new IllegalMoveError('The game is over');
    if (move.type === 'resign') {
      if (seat !== 0 && seat !== 1) throw new IllegalMoveError('Only players can resign');
      return finish(state, 'resign', 1 - seat);
    }
    if (seat !== state.turn) throw new IllegalMoveError('Not your turn');
    const legal = legalMoves(state).find(
      (m) => m.from === move.from && m.to === move.to && (m.promotion ?? null) === (move.promotion ?? null),
    );
    if (!legal) throw new IllegalMoveError('That move is not allowed');
    return advance(state, legal, true);
  },

  botMove(state, seat, rng, difficulty: Difficulty = 'medium') {
    const moves = legalMoves(state);
    if (!moves.length) return { type: 'resign' };
    // Easy: often just a random legal move, otherwise a one-move look-ahead.
    if (difficulty === 'easy' && rng() < 0.35) return { type: 'move', ...moves[Math.floor(rng() * moves.length)] };
    const depth = difficulty === 'easy' ? 0 : difficulty === 'hard' ? 2 : 1;
    const me = seatColor(seat);
    let best: Move[] = [];
    let bestScore = -Infinity;
    for (const move of orderMoves(state, moves)) {
      const score = -negamax(advance(state, move, false), depth, -Infinity, Infinity, other(me));
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = [move];
      } else if (Math.abs(score - bestScore) < 1e-9) best.push(move);
    }
    const pick = best[Math.floor(rng() * best.length)];
    return { type: 'move', ...pick };
  },

  rankings: (state) => state.rankings,
};

/** Plays a move already known to be legal. `withSan` skips notation during search. */
function advance(state: ChessState, legal: Move, withSan: boolean): ChessState {
  const { board, captured, piece } = playOnBoard(state, legal);
  let san = withSan ? sanFor(state, legal, piece, captured != null) : '';

  // Moving a king or rook (or capturing a rook at home) loses castling rights.
  let castling = state.castling;
  const strip = (sq: number) => {
    if (sq === 0) castling = castling.replace('Q', '');
    if (sq === 7) castling = castling.replace('K', '');
    if (sq === 56) castling = castling.replace('q', '');
    if (sq === 63) castling = castling.replace('k', '');
    if (sq === 4) castling = castling.replace(/[KQ]/g, '');
    if (sq === 60) castling = castling.replace(/[kq]/g, '');
  };
  strip(legal.from);
  strip(legal.to);

  const enPassant = piece[1] === 'P' && Math.abs(legal.to - legal.from) === 16 ? (legal.from + legal.to) / 2 : null;
  const turn = 1 - state.turn;
  const key = positionKey(board, turn, castling, enPassant);
  const repetitions = { ...state.repetitions, [key]: (state.repetitions[key] ?? 0) + 1 };

  let next: ChessState = {
    ...state,
    board,
    turn,
    castling,
    enPassant,
    halfmove: piece[1] === 'P' || captured ? 0 : state.halfmove + 1,
    fullmove: state.fullmove + (state.turn === 1 ? 1 : 0),
    repetitions,
    captured: captured ? [...state.captured, captured] : state.captured,
    check: false,
    last: null,
  };

  const nextColor = seatColor(turn);
  const inCheck = isAttacked(board, kingSquare(board, nextColor), other(nextColor));
  const replies = legalMoves(next);
  if (inCheck) san += replies.length ? '+' : '#';
  next = { ...next, check: inCheck, last: { from: legal.from, to: legal.to, san, captured } };

  if (replies.length === 0) return inCheck ? finish(next, 'checkmate', state.turn) : finish(next, 'stalemate', null);
  if (repetitions[key] >= 3) return finish(next, 'repetition', null);
  if (next.halfmove >= 100) return finish(next, 'fifty-moves', null);
  if (insufficientMaterial(board)) return finish(next, 'insufficient', null);
  return next;
}

// ---------- Computer player: short alpha-beta search ----------

const VALUE: Record<PieceType, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

/** Material plus small bonuses for central, advanced pieces. From `color`'s view. */
function evaluate(board: (Piece | null)[], color: Color): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p) continue;
    const r = rank(sq);
    const f = file(sq);
    const centre = 3.5 - Math.max(Math.abs(3.5 - r), Math.abs(3.5 - f));
    let v = VALUE[p[1] as PieceType];
    if (p[1] === 'N' || p[1] === 'B') v += centre * 8;
    if (p[1] === 'P') v += (p[0] === 'w' ? r - 1 : 6 - r) * 6 + (f >= 2 && f <= 5 ? centre * 4 : 0);
    if (p[1] === 'Q') v += centre * 2;
    score += p[0] === color ? v : -v;
  }
  return score;
}

function orderMoves(state: ChessState, moves: Move[]) {
  // Captures first (most valuable victim), so pruning works better.
  return [...moves].sort((a, b) => {
    const va = state.board[a.to] ? VALUE[state.board[a.to]![1] as PieceType] : 0;
    const vb = state.board[b.to] ? VALUE[state.board[b.to]![1] as PieceType] : 0;
    return vb - va + (b.promotion === 'Q' ? 800 : 0) - (a.promotion === 'Q' ? 800 : 0);
  });
}

function negamax(state: ChessState, depth: number, alpha: number, beta: number, color: Color): number {
  if (state.over) {
    if (state.winner == null) return 0;
    return seatColor(state.winner) === color ? 100000 : -100000;
  }
  if (depth === 0) return evaluate(state.board, color);
  let best = -Infinity;
  for (const move of orderMoves(state, legalMoves(state))) {
    const score = -negamax(advance(state, move, false), depth - 1, -beta, -alpha, other(color));
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}
