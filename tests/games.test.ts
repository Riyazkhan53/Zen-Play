import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HOME_COLUMN, TRACK, tokenPosition } from '../src/games/ludo/board';
import { HOME, LudoState, YARD, globalSquare, ludo } from '../src/games/ludo/engine';
import { LADDERS, SNAKES, SnakesState, snakes } from '../src/games/snakes/engine';
import { IllegalMoveError, Rng } from '../src/games/types';

/** Rng that makes rollDie return the given faces in order. */
const dice = (...faces: number[]): Rng => {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
};

/** Small seeded PRNG for long random games. */
function seeded(seed: number): Rng {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }));

// ---------- Ludo ----------

test('ludo board: every colour enters its own home column from the track', () => {
  assert.equal(TRACK.length, 52);
  assert.deepEqual(TRACK[13], [6, 1]);
  assert.deepEqual(TRACK[26], [1, 8]);
  assert.deepEqual(TRACK[39], [8, 13]);
  const cells = new Set(TRACK.map(([r, c]) => `${r},${c}`));
  assert.equal(cells.size, 52, 'track squares are unique');
  for (const [color, column] of Object.entries(HOME_COLUMN)) {
    const lastTrack = TRACK[globalSquare(color as never, 50)!];
    const [r, c] = column[0];
    assert.equal(
      Math.abs(lastTrack[0] - r) + Math.abs(lastTrack[1] - c),
      1,
      `${color} home column is next to its last track square`,
    );
  }
  assert.deepEqual(tokenPosition('red', 0, 0), [13.5, 6.5]);
});

test('ludo: a six is needed to leave the yard, and a six earns another roll', () => {
  let s = ludo.setup(seats(2), Math.random);
  s = ludo.applyMove(s, 0, { type: 'roll' }, dice(3));
  assert.equal(s.turn, 1, 'no legal move passes the turn');
  assert.equal(s.last?.note, 'no-move');

  s = ludo.applyMove(s, 1, { type: 'roll' }, dice(6));
  assert.equal(s.phase, 'move');
  assert.deepEqual(s.movable, [0, 1, 2, 3]);
  s = ludo.applyMove(s, 1, { type: 'move', token: 2 }, Math.random);
  assert.equal(s.tokens[1][2], 0);
  assert.equal(s.turn, 1, 'six gives an extra turn');
  assert.equal(s.phase, 'roll');
});

test('ludo: rejects out-of-turn and illegal moves', () => {
  const s = ludo.setup(seats(2), Math.random);
  assert.throws(() => ludo.applyMove(s, 1, { type: 'roll' }, Math.random), IllegalMoveError);
  assert.throws(() => ludo.applyMove(s, 0, { type: 'move', token: 0 }, Math.random), IllegalMoveError);
  const rolled = ludo.applyMove(s, 0, { type: 'roll' }, dice(6));
  assert.throws(() => ludo.applyMove(rolled, 0, { type: 'roll' }, Math.random), IllegalMoveError);
});

test('ludo: capturing sends the token home and earns another roll', () => {
  const s = ludo.setup(seats(2), Math.random); // red vs yellow
  // Yellow token sits on global square 30 (yellow progress 4). Red token at progress 27 rolls 3.
  s.tokens[0][0] = 27;
  s.tokens[1][0] = 4;
  assert.equal(globalSquare('red', 30), globalSquare('yellow', 4));
  let next = ludo.applyMove(s, 0, { type: 'roll' }, dice(3));
  next = ludo.applyMove(next, 0, { type: 'move', token: 0 }, Math.random);
  assert.equal(next.tokens[1][0], YARD);
  assert.deepEqual(next.last?.captured, [{ seat: 1, token: 0 }]);
  assert.equal(next.turn, 0, 'capture gives an extra turn');
});

test('ludo: no capture on safe squares', () => {
  const s = ludo.setup(seats(2), Math.random);
  s.tokens[0][0] = 5; // red rolls 3 to land on star square 8
  s.tokens[1][0] = 34; // yellow progress 34 = global 8
  let next = ludo.applyMove(s, 0, { type: 'roll' }, dice(3));
  next = ludo.applyMove(next, 0, { type: 'move', token: 0 }, Math.random);
  assert.equal(next.tokens[1][0], 34);
  assert.equal(next.turn, 1);
});

test('ludo: three sixes in a row forfeit the turn', () => {
  let s = ludo.setup(seats(2), Math.random);
  s.tokens[0] = [10, YARD, YARD, YARD];
  for (let i = 0; i < 2; i++) {
    s = ludo.applyMove(s, 0, { type: 'roll' }, dice(6));
    s = ludo.applyMove(s, 0, { type: 'move', token: 0 }, Math.random);
  }
  s = ludo.applyMove(s, 0, { type: 'roll' }, dice(6));
  assert.equal(s.last?.note, 'three-sixes');
  assert.equal(s.turn, 1);
});

test('ludo: exact roll needed to reach home, and finishing ranks the player', () => {
  const s: LudoState = ludo.setup(seats(2), Math.random);
  s.tokens[0] = [HOME, HOME, HOME, 54];
  const over = ludo.applyMove(s, 0, { type: 'roll' }, dice(4));
  assert.equal(over.last?.note, 'no-move', '54 + 4 overshoots home');
  s.turn = 0;
  let won = ludo.applyMove(s, 0, { type: 'roll' }, dice(2));
  won = ludo.applyMove(won, 0, { type: 'move', token: 3 }, Math.random);
  assert.equal(won.over, true);
  assert.deepEqual(won.rankings, [0, 1]);
  assert.equal(ludo.currentSeat(won), null);
});

test('ludo: bot-only games always finish with legal moves', () => {
  for (const players of [2, 3, 4]) {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = seeded(seed * players);
      let s = ludo.setup(seats(players), rng);
      let steps = 0;
      while (!s.over) {
        const seat = ludo.currentSeat(s)!;
        s = ludo.applyMove(s, seat, ludo.botMove(s, seat, rng), rng);
        assert.ok(++steps < 20000, 'game terminates');
      }
      assert.equal(new Set(s.rankings).size, players);
    }
  }
});

// ---------- Snakes & Ladders ----------

test('snakes: ladders climb, snakes slide, sixes roll again', () => {
  let s: SnakesState = snakes.setup(seats(2), Math.random);
  s = snakes.applyMove(s, 0, { type: 'roll' }, dice(4));
  assert.equal(s.positions[0], LADDERS[4]);
  assert.equal(s.last?.via, 'ladder');
  assert.equal(s.turn, 1);

  s.positions[1] = 10;
  s = snakes.applyMove(s, 1, { type: 'roll' }, dice(6));
  assert.equal(s.positions[1], SNAKES[16]);
  assert.equal(s.last?.via, 'snake');
  assert.equal(s.turn, 1, 'six rolls again');
});

test('snakes: must land exactly on 100', () => {
  const s = snakes.setup(seats(3), Math.random);
  s.positions[0] = 97;
  const bounced = snakes.applyMove(s, 0, { type: 'roll' }, dice(5));
  assert.equal(bounced.positions[0], 97);
  assert.equal(bounced.last?.via, 'overshoot');

  s.positions[1] = 40;
  s.positions[2] = 60;
  const won = snakes.applyMove(s, 0, { type: 'roll' }, dice(3));
  assert.equal(won.over, true);
  assert.deepEqual(won.rankings, [0, 2, 1]);
});

test('snakes: bot games finish', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rng = seeded(seed);
    let s = snakes.setup(seats(1 + (seed % 5) + 1), rng);
    let steps = 0;
    while (!s.over) {
      const seat = snakes.currentSeat(s)!;
      s = snakes.applyMove(s, seat, snakes.botMove(s, seat, rng), rng);
      assert.ok(++steps < 50000);
    }
    assert.equal(s.positions[s.rankings[0]], 100);
  }
});
