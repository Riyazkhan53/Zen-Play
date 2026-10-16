import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chess, ChessState, legalMoves, Piece, squareName } from '../src/games/chess/engine';
import { IllegalMoveError } from '../src/games/types';

const seats = [{ name: 'White' }, { name: 'Black' }];
const sq = (name: string) => (Number(name[1]) - 1) * 8 + 'abcdefgh'.indexOf(name[0]);

/** Load a FEN position (board, side, castling, en passant). */
function fromFen(fen: string): ChessState {
  const [placement, side, castling, ep] = fen.split(' ');
  const board: (Piece | null)[] = Array(64).fill(null);
  placement.split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        board[(7 - i) * 8 + f] = `${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toUpperCase()}` as Piece;
        f++;
      }
    }
  });
  return {
    ...chess.setup(seats, Math.random),
    board,
    turn: side === 'w' ? 0 : 1,
    castling: castling === '-' ? '' : castling,
    enPassant: ep === '-' ? null : sq(ep),
    repetitions: {},
  };
}

function play(state: ChessState, ...moves: string[]): ChessState {
  for (const m of moves) {
    const promotion = m[4]?.toUpperCase() as 'Q' | undefined;
    state = chess.applyMove(
      state,
      state.turn,
      { type: 'move', from: sq(m.slice(0, 2)), to: sq(m.slice(2, 4)), promotion },
      Math.random,
    );
  }
  return state;
}

function perft(state: ChessState, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(chess.applyMove(state, state.turn, { type: 'move', ...m }, Math.random), depth - 1);
  return n;
}

test('chess: perft from the start position matches known counts', () => {
  const start = chess.setup(seats, Math.random);
  assert.equal(perft(start, 1), 20);
  assert.equal(perft(start, 2), 400);
  assert.equal(perft(start, 3), 8902);
});

test('chess: perft on "Kiwipete" (castling, en passant, promotions, pins)', () => {
  const kiwipete = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -');
  assert.equal(perft(kiwipete, 1), 48);
  assert.equal(perft(kiwipete, 2), 2039);
});

test("chess: fool's mate is checkmate", () => {
  const s = play(chess.setup(seats, Math.random), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.equal(s.over, true);
  assert.equal(s.end, 'checkmate');
  assert.equal(s.winner, 1);
  assert.equal(s.last?.san, 'Qh4#');
  assert.deepEqual(s.rankings, [1, 0]);
});

test('chess: castling moves the rook and is blocked through check', () => {
  let s = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq -');
  s = play(s, 'e1g1');
  assert.equal(s.board[sq('f1')], 'wR');
  assert.equal(s.board[sq('h1')], null);
  assert.equal(s.last?.san, 'O-O');
  assert.equal(s.castling, 'kq');

  const attacked = fromFen('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq -'); // rook on f2 covers f1
  const kingMoves = legalMoves(attacked)
    .filter((m) => m.from === sq('e1'))
    .map((m) => squareName(m.to));
  assert.ok(!kingMoves.includes('g1'));
  assert.ok(kingMoves.includes('c1'));
});

test('chess: en passant and promotion', () => {
  let s = fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6');
  s = play(s, 'e5d6');
  assert.equal(s.board[sq('d5')], null, 'captured pawn removed');
  assert.equal(s.last?.san, 'exd6');

  let p = fromFen('8/4P3/8/8/8/8/k7/4K3 w - -');
  assert.equal(legalMoves(p).filter((m) => m.from === sq('e7')).length, 4, 'four promotion choices');
  p = play(p, 'e7e8n');
  assert.equal(p.board[sq('e8')], 'wN');
});

test('chess: stalemate, insufficient material and repetition are draws', () => {
  const stale = play(fromFen('7k/5Q2/6K1/8/8/8/8/8 w - -'), 'f7f8');
  assert.equal(stale.check, true, 'Qf8 is check, not stalemate');
  const realStale = play(fromFen('7k/8/5QK1/8/8/8/8/8 w - -'), 'f6f7');
  assert.equal(realStale.end, 'stalemate');
  assert.equal(realStale.winner, null);

  const bare = play(fromFen('4k3/8/8/8/8/8/3q4/4K3 w - -'), 'e1d2');
  assert.equal(bare.end, 'insufficient');

  let rep = chess.setup(seats, Math.random);
  rep = play(rep, 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  assert.equal(rep.end, 'repetition');
});

test('chess: illegal moves, moving into check, turn order and resigning', () => {
  const s = chess.setup(seats, Math.random);
  assert.throws(() => play(s, 'e2e5'), IllegalMoveError);
  assert.throws(
    () => chess.applyMove(s, 1, { type: 'move', from: sq('e7'), to: sq('e5') }, Math.random),
    IllegalMoveError,
  );
  const pinned = fromFen('4k3/4r3/8/8/8/8/4B3/4K3 w - -');
  assert.ok(!legalMoves(pinned).some((m) => m.from === sq('e2')), 'pinned bishop cannot move');
  const resigned = chess.applyMove(s, 1, { type: 'resign' }, Math.random);
  assert.equal(resigned.winner, 0);
  assert.equal(resigned.end, 'resign');
});

test('chess: computer player takes a free queen, finds mate in one, and plays legal moves quickly', () => {
  const freeQueen = fromFen('4k3/8/8/3q4/8/8/8/3RK3 w - -');
  assert.deepEqual(chess.botMove(freeQueen, 0, Math.random), { type: 'move', from: sq('d1'), to: sq('d5') });
  const mateInOne = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - -');
  const mv = chess.botMove(mateInOne, 0, Math.random);
  assert.equal(chess.applyMove(mateInOne, 0, mv, Math.random).end, 'checkmate');

  let s = chess.setup(seats, Math.random);
  const t0 = Date.now();
  for (let i = 0; i < 40 && !s.over; i++)
    s = chess.applyMove(s, s.turn, chess.botMove(s, s.turn, Math.random), Math.random);
  assert.ok((Date.now() - t0) / 40 < 500, 'under half a second per move');
});
