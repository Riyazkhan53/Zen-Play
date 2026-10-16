import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bestDiscard, rummy, RummyState } from '../src/games/rummy/engine';
import { arrange, PlayingCard, Suit } from '../src/games/rummy/melds';
import { IllegalMoveError, Rng } from '../src/games/types';
import type { HostMessage } from '../src/net/protocol';
import { RoomHost } from '../src/net/room-host';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }));
function seeded(seed: number): Rng {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

let nextId = 1000;
/** Parse "5H 6H 7H JK QS" — rank (A,2..10,J,Q,K) + suit; "JK" is a printed joker. */
const hand = (text: string): PlayingCard[] =>
  text.split(/\s+/).map((t) => {
    if (t === 'JK') return { id: nextId++, suit: 'J', rank: 0 };
    const rank = { A: 1, J: 11, Q: 12, K: 13 }[t.slice(0, -1)] ?? Number(t.slice(0, -1));
    return { id: nextId++, suit: t.slice(-1) as Suit, rank };
  });

const WILD = 7; // sevens are jokers in these tests unless noted

test('melds: a complete hand scores 0 and is grouped', () => {
  // Pure 4-5-6♥, sequence 9-10-[7♣ joker]-Q♠, set of kings, set of aces with printed joker.
  const a = arrange(hand('4H 5H 6H 9S 10S 7C QS KH KD KC AH AD JK'), WILD);
  assert.equal(a.score, 0);
  assert.equal(a.loose.length, 0);
  assert.ok(a.groups.some((g) => g.kind === 'pure'));
  assert.ok(a.groups.filter((g) => g.kind !== 'set').length >= 2);
});

test('melds: needs a pure sequence — otherwise every card counts', () => {
  // Two impure sequences and two sets, but nothing pure: all points count.
  const a = arrange(hand('4H 5H JK 9S 10S 7C KH KD KC AH AD AS 2C'), WILD);
  // 90 points of cards (jokers count 0), capped at 80.
  assert.equal(a.score, 80);
});

test('melds: with one pure sequence and no second sequence, only the sequence is spared', () => {
  // No jokers (jacks are wild, none in hand): the set of kings doesn't count without a second sequence.
  const a = arrange(hand('4H 5H 6H KH KD KC 2S 9D 3C 8C 10D QS 4S'), 11);
  assert.equal(a.score, 91 - (4 + 5 + 6));
  // With 2s wild, 9♦ 10♦ + 2♠ is a second sequence, so the kings count as a set.
  const b = arrange(hand('4H 5H 6H KH KD KC 2S 9D 3C 8C 10D QS 4S'), 2);
  assert.equal(b.score, 3 + 8 + 10 + 4);
});

test('melds: ace runs high or low but never wraps; sets need different suits', () => {
  assert.equal(arrange(hand('QS KS AS 2H 3H 4H 5D 6D 7D 8C 9C 10C JC'), 0).score, 0);
  assert.equal(arrange(hand('AS 2S 3S 2H 3H 4H 5D 6D 7D 8C 9C 10C JC'), 0).score, 0);
  const wrap = arrange(hand('KS AS 2S 2H 3H 4H 5D 6D 7D 8C 9C 10C JC'), 0);
  assert.ok(wrap.score > 0, 'K-A-2 is not a sequence');
  const sameSuitSet = arrange(hand('5H 5H 5D 2H 3H 4H 5C 6C 7C 8S 9S 10S JS'), 0);
  assert.ok(sameSuitSet.loose.length > 0, 'two 5♥ cannot be in one set');
});

test('rummy: deal 13 each, turn up a joker, 106 cards in play', () => {
  const s = rummy.setup(seats(4), seeded(2));
  assert.deepEqual(s.handCounts, [13, 13, 13, 13]);
  const total = s.hands.reduce((n, h) => n + h!.length, 0) + s.stock.length + s.discard.length + 1;
  assert.equal(total, 106);
  assert.ok(s.wildRank >= 1 && s.wildRank <= 13);
});

test('rummy: draw then discard; cannot throw back the open card; cannot draw twice', () => {
  let s = rummy.setup(seats(2), seeded(3));
  assert.throws(
    () => rummy.applyMove(s, 0, { type: 'discard', cardId: s.hands[0]![0].id }, Math.random),
    IllegalMoveError,
  );
  const top = s.discard.at(-1)!;
  s = rummy.applyMove(s, 0, { type: 'draw', from: 'discard' }, Math.random);
  assert.equal(s.handCounts[0], 14);
  assert.throws(() => rummy.applyMove(s, 0, { type: 'draw', from: 'stock' }, Math.random), IllegalMoveError);
  assert.throws(() => rummy.applyMove(s, 0, { type: 'discard', cardId: top.id }, Math.random), IllegalMoveError);
  s = rummy.applyMove(s, 0, { type: 'discard', cardId: s.hands[0]![0].id }, Math.random);
  assert.equal(s.turn, 1);
  assert.equal(s.phase, 'draw');
});

test('rummy: a valid declaration wins and collects the others’ points; an invalid one is refused', () => {
  const base = rummy.setup(seats(3), seeded(4));
  const winning = hand('4H 5H 6H 9S 10S 7C QS KH KD KC AH AD JK 2D');
  const s: RummyState = {
    ...base,
    wildRank: WILD,
    phase: 'discard',
    hands: [winning, hand('2S 4C 6D 8H 10C QD 3S 5C 9D JH KS AC 3D'), hand('2C 3C 4C 8D 8S 8C 9H 10H JD QC KC 7H 5S')],
  };
  const extra = winning.at(-1)!;
  assert.throws(() => rummy.applyMove(s, 0, { type: 'declare', cardId: winning[0].id }, Math.random), IllegalMoveError);
  const done = rummy.applyMove(s, 0, { type: 'declare', cardId: extra.id }, Math.random);
  assert.equal(done.over, true);
  assert.equal(done.winner, 0);
  assert.equal(done.scores[0], 0);
  assert.equal(done.scores[1], 80, 'no pure sequence → capped');
  assert.ok(done.scores[2] < done.scores[1], 'a pure sequence plus melds lowers the score');
  assert.equal(done.winnings, done.scores[1] + done.scores[2]);
  assert.deepEqual(done.rankings[0], 0);
});

test('rummy: dropping costs 20 before drawing and 40 later; last player standing wins', () => {
  let s = rummy.setup(seats(3), seeded(5));
  s = rummy.applyMove(s, 0, { type: 'drop' }, Math.random);
  assert.equal(s.scores[0], 20);
  assert.equal(s.turn, 1);
  s = rummy.applyMove(s, 1, { type: 'draw', from: 'stock' }, Math.random);
  s = rummy.applyMove(s, 1, { type: 'discard', cardId: s.hands[1]![0].id }, Math.random);
  s = rummy.applyMove(s, 2, { type: 'draw', from: 'stock' }, Math.random);
  s = rummy.applyMove(s, 2, { type: 'discard', cardId: s.hands[2]![0].id }, Math.random);
  assert.equal(s.turn, 1, 'dropped player is skipped');
  s = rummy.applyMove(s, 1, { type: 'drop' }, Math.random);
  assert.equal(s.scores[1], 40);
  assert.equal(s.over, true);
  assert.equal(s.winner, 2);
  assert.equal(s.winnings, 60);
});

test('rummy: the computer keeps its pure sequence and throws the loosest card', () => {
  const h = hand('4H 5H 6H 9S 10S JS KH KD KC AH AD 2C 8D QC');
  const { card, score } = bestDiscard(h, 3, null);
  // Loose cards are A♥ A♦ 2♣ 8♦ Q♣; shedding one of the 10-pointers leaves the fewest points.
  assert.ok(['1H', '1D', '12C'].includes(`${card.rank}${card.suit}`));
  assert.equal(score, 10 + 2 + 8 + 10);
});

test('rummy: computer-only games end, quickly', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const rng = seeded(seed);
    let s = rummy.setup(seats(2 + (seed % 3)), rng);
    let moves = 0;
    const t0 = Date.now();
    while (!s.over && moves < 2000) {
      s = rummy.applyMove(s, s.turn, rummy.botMove(s, s.turn, rng), rng);
      moves++;
    }
    assert.equal(s.over, true, `seed ${seed}: ended after ${moves} moves`);
    assert.ok((Date.now() - t0) / moves < 60, 'bot thinks fast enough for a phone');
  }
});

test('rummy: other players never receive your hand or the stock', () => {
  const host = new RoomHost({ gameId: 'rummy', hostClientId: 'a', botDelayMs: 0 });
  const inbox: HostMessage[] = [];
  const a = host.connect('a', 'Asha', () => {});
  host.connect('b', 'Bala', (m) => inbox.push(m));
  a.receive({ t: 'start' });
  const states = inbox.filter((m) => m.t === 'state').map((m) => m.state as RummyState);
  assert.ok(states.length > 0);
  for (const v of states) {
    assert.equal(v.hands[0], null);
    assert.equal(v.hands[1]!.length, 13);
    assert.equal(v.stock.length, 0);
  }
  host.dispose();
});
