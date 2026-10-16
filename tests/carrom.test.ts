import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  carrom,
  CarromState,
  chooseShot,
  Coin,
  COIN_R,
  POCKETS,
  simulate,
  strikerFits,
  strikerSpot,
} from '../src/games/carrom/engine';
import { IllegalMoveError, Rng } from '../src/games/types';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }));

function seeded(seed: number): Rng {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** A shot from seat 0's baseline straight at a point. */
function aimAt(state: CarromState, pos: number, x: number, y: number, power: number) {
  const [sx, sy] = strikerSpot(0, pos);
  return { type: 'shot' as const, pos, angle: Math.atan2(y - sy, x - sx), power };
}

/** Coin placed so that a straight shot from the bottom-centre baseline sends it into the top-left pocket. */
function lineUp(kind: Coin['kind'], id = 50): Coin {
  const [px, py] = POCKETS[0];
  const [sx, sy] = strikerSpot(0, 0.5);
  const t = 0.45;
  return { id, kind, x: sx + (px - sx) * t, y: sy + (py - sy) * t };
}

test('carrom: break spreads 19 coins and the striker comes to rest', () => {
  const s = carrom.setup(seats(2), Math.random);
  assert.equal(s.coins.length, 19);
  assert.equal(s.coins.filter((c) => c.kind === 'white').length, 9);
  const sim = simulate(s.coins, strikerSpot(0, 0.5), -Math.PI / 2, 1);
  assert.ok(sim.frames.length > 10);
  const moved = sim.coins.filter((c) => {
    const before = s.coins.find((b) => b.id === c.id)!;
    return Math.hypot(before.x - c.x, before.y - c.y) > 1;
  });
  assert.ok(moved.length > 5, 'a full-power break moves many coins');
  for (const c of sim.coins) {
    assert.ok(
      c.x >= COIN_R - 0.01 && c.x <= 100 - COIN_R + 0.01 && c.y >= COIN_R - 0.01 && c.y <= 100 - COIN_R + 0.01,
      'coins stay on the board',
    );
  }
});

test('carrom: pocketing your own coin gives another shot; a miss passes the turn', () => {
  const s: CarromState = { ...carrom.setup(seats(2), Math.random), coins: [lineUp('white')] };
  const hit = carrom.applyMove(s, 0, aimAt(s, 0.5, s.coins[0].x, s.coins[0].y, 0.55), Math.random);
  assert.deepEqual(hit.last?.pocketed, ['white']);
  assert.equal(hit.pocketed.white, 1);
  assert.equal(hit.turn, 0, 'shoots again');

  const miss = carrom.applyMove(s, 0, aimAt(s, 0.1, 90, 50, 0.2), Math.random);
  assert.equal(miss.turn, 1);
});

test('carrom: queen must be covered, otherwise it returns to the centre', () => {
  const base = carrom.setup(seats(2), Math.random);
  const queenShot: CarromState = { ...base, coins: [lineUp('queen', 0), { id: 7, kind: 'white', x: 80, y: 30 }] };
  const pending = carrom.applyMove(
    queenShot,
    0,
    aimAt(queenShot, 0.5, queenShot.coins[0].x, queenShot.coins[0].y, 0.55),
    Math.random,
  );
  assert.deepEqual(pending.queen, { pendingSeat: 0 });
  assert.equal(pending.turn, 0);

  // Next shot misses → queen back on the board.
  const missed = carrom.applyMove(pending, 0, aimAt(pending, 0.1, 10, 60, 0.15), Math.random);
  assert.equal(missed.queen, 'board');
  assert.ok(missed.coins.some((c) => c.kind === 'queen'));

  // Or covered by pocketing a white coin.
  const cover: CarromState = { ...pending, coins: [lineUp('white', 9)] };
  const covered = carrom.applyMove(cover, 0, aimAt(cover, 0.5, cover.coins[0].x, cover.coins[0].y, 0.55), Math.random);
  assert.deepEqual(covered.queen, { coveredBy: 0 });
});

test('carrom: pocketing the striker is a foul that returns a coin', () => {
  const s: CarromState = {
    ...carrom.setup(seats(2), Math.random),
    coins: [{ id: 3, kind: 'black', x: 50, y: 40 }],
    pocketed: { white: 2, black: 0 },
  };
  const [px, py] = POCKETS[2]; // bottom-left pocket, near seat 0's baseline
  const [sx, sy] = strikerSpot(0, 0);
  const foul = carrom.applyMove(
    s,
    0,
    { type: 'shot', pos: 0, angle: Math.atan2(py - sy, px - sx), power: 0.4 },
    Math.random,
  );
  assert.equal(foul.last?.foul, true);
  assert.equal(foul.pocketed.white, 1);
  assert.equal(foul.coins.filter((c) => c.kind === 'white').length, 1);
  assert.equal(foul.turn, 1);
});

test('carrom: last coin before the queen is covered is returned; covering then finishing wins', () => {
  const base = carrom.setup(seats(2), Math.random);
  const early: CarromState = {
    ...base,
    coins: [lineUp('white'), { id: 0, kind: 'queen', x: 50, y: 50 }],
    pocketed: { white: 8, black: 3 },
  };
  const back = carrom.applyMove(early, 0, aimAt(early, 0.5, early.coins[0].x, early.coins[0].y, 0.55), Math.random);
  assert.equal(back.pocketed.white, 8);
  assert.equal(back.over, false);
  assert.equal(back.turn, 1);

  const ready: CarromState = {
    ...base,
    coins: [lineUp('white')],
    pocketed: { white: 8, black: 3 },
    queen: { coveredBy: 0 },
  };
  const won = carrom.applyMove(ready, 0, aimAt(ready, 0.5, ready.coins[0].x, ready.coins[0].y, 0.55), Math.random);
  assert.equal(won.over, true);
  assert.equal(won.winnerTeam, 0);
  assert.equal(won.points, 9 - 3 + 3);
  assert.deepEqual(won.rankings, [0, 1]);
});

test('carrom: four players play in two teams from four sides', () => {
  const s = carrom.setup(seats(4), Math.random);
  assert.deepEqual(s.teams, [0, 1, 0, 1]);
  const right = strikerSpot(1, 0.5);
  assert.ok(right[0] > 80 && Math.abs(right[1] - 50) < 1);
  assert.throws(() => carrom.setup(seats(3), Math.random), IllegalMoveError);
});

test('carrom: striker cannot sit on a coin', () => {
  const s: CarromState = { ...carrom.setup(seats(2), Math.random), coins: [{ id: 1, kind: 'white', x: 50, y: 86.3 }] };
  assert.equal(strikerFits(s, 0, 0.5), false);
  assert.throws(
    () => carrom.applyMove(s, 0, { type: 'shot', pos: 0.5, angle: -1.5, power: 0.5 }, Math.random),
    IllegalMoveError,
  );
});

test('carrom: computer player sinks a lined-up coin', () => {
  const s: CarromState = { ...carrom.setup(seats(2), Math.random), coins: [lineUp('white')] };
  const after = carrom.applyMove(s, 0, chooseShot(s, 0, seeded(3)), Math.random);
  assert.deepEqual(after.last?.pocketed, ['white']);
});

test('carrom: computer-only games finish', () => {
  for (const players of [2, 4]) {
    for (let seed = 1; seed <= 3; seed++) {
      const rng = seeded(seed * 7 + players);
      let s = carrom.setup(seats(players), rng);
      let shots = 0;
      while (!s.over && shots < 600) {
        s = carrom.applyMove(s, s.turn, carrom.botMove(s, s.turn, rng), rng);
        shots++;
      }
      assert.equal(s.over, true, `game with ${players} players ended (seed ${seed}) after ${shots} shots`);
    }
  }
});
