import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HostMessage } from '../src/net/protocol';
import { RoomHost } from '../src/net/room-host';
import { IllegalMoveError, Rng } from '../src/games/types';
import { canPlay, uno, UnoCard, UnoState } from '../src/games/uno/engine';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }));

function seeded(seed: number): Rng {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const card = (id: number, color: UnoCard['color'], value: UnoCard['value']): UnoCard => ({ id, color, value });

/** A controlled table: given hands, top card, and a draw pile. */
function table(
  hands: UnoCard[][],
  top: UnoCard,
  pile: UnoCard[] = [card(900, 'green', '5'), card(901, 'green', '6'), card(902, 'blue', '1'), card(903, 'blue', '2')],
): UnoState {
  return {
    ...uno.setup(seats(hands.length), Math.random),
    hands,
    handCounts: hands.map((h) => h.length),
    discard: [top],
    color: top.color as UnoState['color'],
    drawPile: pile,
    drawCount: pile.length,
  };
}

const total = (s: UnoState) => s.hands.reduce((n, h) => n + h!.length, 0) + s.drawPile.length + s.discard.length;

test('uno: deal 7 each from a 108-card deck, starting on a number card', () => {
  const s = uno.setup(seats(4), seeded(1));
  assert.deepEqual(s.handCounts, [7, 7, 7, 7]);
  assert.equal(total(s), 108);
  assert.match(s.discard[0].value, /^\d$/);
});

test('uno: matching rules', () => {
  const top = card(1, 'red', '5');
  assert.ok(canPlay(card(2, 'red', '9'), top, 'red'));
  assert.ok(canPlay(card(3, 'blue', '5'), top, 'red'));
  assert.ok(canPlay(card(4, 'wild', 'wild'), top, 'red'));
  assert.ok(!canPlay(card(5, 'blue', '7'), top, 'red'));
  const s = table([[card(5, 'blue', '7'), card(6, 'red', '1')], [card(7, 'red', '2')]], top);
  assert.throws(() => uno.applyMove(s, 0, { type: 'play', cardId: 5 }, Math.random), IllegalMoveError);
  assert.throws(() => uno.applyMove(s, 1, { type: 'play', cardId: 7 }, Math.random), IllegalMoveError, 'not your turn');
});

test('uno: skip, reverse and draw two', () => {
  const top = card(1, 'red', '5');
  const hands = () => [
    [card(10, 'red', 'skip'), card(11, 'red', 'reverse'), card(12, 'red', 'draw2'), card(13, 'red', '1')],
    [card(20, 'blue', '1'), card(21, 'blue', '2')],
    [card(30, 'green', '1'), card(31, 'green', '2')],
  ];
  const skip = uno.applyMove(table(hands(), top), 0, { type: 'play', cardId: 10 }, Math.random);
  assert.equal(skip.turn, 2);

  const rev = uno.applyMove(table(hands(), top), 0, { type: 'play', cardId: 11 }, Math.random);
  assert.equal(rev.direction, -1);
  assert.equal(rev.turn, 2, 'play goes the other way');

  const d2 = uno.applyMove(table(hands(), top), 0, { type: 'play', cardId: 12 }, Math.random);
  assert.equal(d2.handCounts[1], 4, 'next player draws two');
  assert.equal(d2.turn, 2, 'and loses their turn');
  assert.equal(d2.last?.victim, 1);

  // Two players: reverse acts like skip.
  const two = table([[card(10, 'red', 'reverse'), card(13, 'red', '1')], [card(20, 'blue', '1')]], top);
  assert.equal(uno.applyMove(two, 0, { type: 'play', cardId: 10 }, Math.random).turn, 0);
});

test('uno: wild needs a colour; wild draw four', () => {
  const top = card(1, 'red', '5');
  const s = table(
    [
      [card(10, 'wild', 'wild4'), card(11, 'blue', '3'), card(12, 'red', '1')],
      [card(20, 'blue', '1')],
      [card(30, 'green', '1')],
    ],
    top,
  );
  assert.throws(() => uno.applyMove(s, 0, { type: 'play', cardId: 10 }, Math.random), IllegalMoveError);
  const after = uno.applyMove(s, 0, { type: 'play', cardId: 10, color: 'blue' }, Math.random);
  assert.equal(after.color, 'blue');
  assert.equal(after.handCounts[1], 5);
  assert.equal(after.turn, 2);
});

test('uno: draw, then play the drawn card or pass', () => {
  const top = card(1, 'red', '5');
  const pile = [card(902, 'blue', '1'), card(901, 'red', '6')]; // red 6 on top of the pile: playable
  const s = table([[card(10, 'blue', '7'), card(11, 'blue', '8')], [card(20, 'blue', '1')]], top, pile);
  const drew = uno.applyMove(s, 0, { type: 'draw' }, Math.random);
  assert.equal(drew.drawnCardId, 901);
  assert.equal(drew.turn, 0);
  assert.throws(() => uno.applyMove(drew, 0, { type: 'play', cardId: 10 }, Math.random), IllegalMoveError);
  assert.equal(uno.applyMove(drew, 0, { type: 'pass' }, Math.random).turn, 1);
  assert.equal(uno.applyMove(drew, 0, { type: 'play', cardId: 901 }, Math.random).discard.at(-1)!.id, 901);

  const unplayable = table([[card(10, 'blue', '7')], [card(20, 'blue', '1')]], top, [card(905, 'green', '2')]);
  const passed = uno.applyMove(unplayable, 0, { type: 'draw' }, Math.random);
  assert.equal(passed.turn, 1, 'an unplayable draw ends the turn');
});

test('uno: forgetting to call UNO costs two cards; emptying your hand wins', () => {
  const top = card(1, 'red', '5');
  const hands = () => [
    [card(10, 'red', '1'), card(11, 'red', '2')],
    [card(20, 'blue', '9'), card(21, 'wild', 'wild')],
  ];
  const forgot = uno.applyMove(table(hands(), top), 0, { type: 'play', cardId: 10 }, Math.random);
  assert.equal(forgot.handCounts[0], 3);
  assert.equal(forgot.last?.kind, 'forgot-uno');
  const called = uno.applyMove(table(hands(), top), 0, { type: 'play', cardId: 10, uno: true }, Math.random);
  assert.equal(called.handCounts[0], 1);

  const win = uno.applyMove({ ...called, turn: 0 }, 0, { type: 'play', cardId: 11 }, Math.random);
  assert.equal(win.over, true);
  assert.deepEqual(win.rankings, [0, 1]);
  assert.equal(win.points, 9 + 50);
});

test('uno: computer games finish and never lose or invent cards', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rng = seeded(seed);
    let s = uno.setup(seats(2 + (seed % 7)), rng);
    let moves = 0;
    while (!s.over && moves < 3000) {
      s = uno.applyMove(s, s.turn, uno.botMove(s, s.turn, rng), rng);
      assert.equal(total(s), 108);
      moves++;
    }
    assert.equal(s.over, true, `seed ${seed}`);
  }
});

test('uno: players only ever receive their own hand', async () => {
  const host = new RoomHost({ gameId: 'uno', hostClientId: 'a', botDelayMs: 0 });
  const inbox: Record<string, HostMessage[]> = { a: [], b: [] };
  const a = host.connect('a', 'Asha', (m) => inbox.a.push(m));
  host.connect('b', 'Bala', (m) => inbox.b.push(m));
  a.receive({ t: 'addLocal', name: 'Chitra' }); // shares Asha's device
  a.receive({ t: 'start' });
  const latest = (id: string) => [...inbox[id]].reverse().find((m) => m.t === 'state')!.state as UnoState;

  const aView = latest('a');
  assert.ok(aView.hands[0] && aView.hands[2], "Asha's device sees both of its players' hands");
  assert.equal(aView.hands[1], null, "but not Bala's");
  assert.deepEqual(aView.drawPile, [], 'and never the deck order');
  const bView = latest('b');
  assert.deepEqual(
    bView.hands.map((h) => h != null),
    [false, true, false],
  );
  assert.deepEqual(bView.handCounts, [7, 7, 7], 'card counts are public');
  // Every update Bala's device ever received hid the other hands and the deck.
  for (const m of inbox.b) {
    if (m.t !== 'state') continue;
    const v = m.state as UnoState;
    assert.equal(v.hands[0], null);
    assert.equal(v.hands[2], null);
    assert.equal(v.drawPile.length, 0);
  }
  host.dispose();
});
