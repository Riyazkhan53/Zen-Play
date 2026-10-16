import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bestDiscard, hasPureSequence, rummy, RummyState } from '../src/games/rummy/engine';
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

// ---------- Match formats ----------

/** Plays bot moves until the deal ends (or the match does). */
function playDeal(s: RummyState, rng: Rng): RummyState {
  for (let i = 0; i < 3000 && s.phase !== 'roundOver' && !s.over; i++) {
    s = rummy.applyMove(s, s.turn, rummy.botMove(s, s.turn, rng), rng);
  }
  return s;
}

test('rummy modes: points is one deal; options are validated', () => {
  const s = rummy.setup(seats(2), seeded(9), { mode: 'points' });
  assert.equal(s.totalRounds, 1);
  assert.equal(playDeal(s, seeded(9)).over, true);
  assert.throws(() => rummy.setup(seats(2), Math.random, { mode: 'pool', poolLimit: 10 }), IllegalMoveError);
  assert.equal(rummy.setup(seats(2), Math.random, { mode: 'nonsense' }).options.mode, 'points');
});

test('rummy modes: deals (best of 3) adds up totals and the lowest total wins', () => {
  const rng = seeded(11);
  let s = rummy.setup(seats(3), rng, { mode: 'deals', deals: 3 });
  for (let round = 1; round <= 3; round++) {
    assert.equal(s.round, round);
    s = playDeal(s, rng);
    if (round < 3) {
      assert.equal(s.phase, 'roundOver');
      assert.equal(rummy.currentSeat(s), s.roundWinner, 'the deal winner starts the next deal');
      assert.throws(() => rummy.applyMove(s, 0, { type: 'draw', from: 'stock' }, rng), IllegalMoveError);
      s = rummy.applyMove(s, 1, { type: 'nextRound' }, rng);
      // The last seat deals first, so the deal passes to seat 0, then seat 1.
      assert.equal(s.dealer, (round - 1) % 3, 'dealer moves round the table');
    }
  }
  assert.equal(s.over, true);
  assert.equal(s.history.length, 3);
  const sums = [0, 1, 2].map((i) => s.history.reduce((t, h) => t + h.scores[i], 0));
  assert.deepEqual(s.totals, sums);
  assert.equal(s.totals[s.winner!], Math.min(...s.totals));
});

test('rummy modes: pool knocks players out at the limit; last one in wins', () => {
  const rng = seeded(12);
  let s = rummy.setup(seats(3), rng, { mode: 'pool', poolLimit: 101 });
  assert.equal(s.totalRounds, null);
  for (let deal = 0; deal < 40 && !s.over; deal++) {
    s = playDeal(s, rng);
    for (let i = 0; i < 3; i++) assert.equal(s.eliminated[i], s.totals[i] >= 101);
    if (!s.over) {
      s = rummy.applyMove(s, s.turn, { type: 'nextRound' }, rng);
      s.eliminated.forEach((out, i) => out && assert.equal(s.handCounts[i], 0, 'eliminated players are not dealt in'));
    }
  }
  assert.equal(s.over, true);
  assert.equal(s.eliminated.filter((e) => !e).length <= 1, true);
  assert.equal(s.eliminated[s.winner!], false);
  // Pool 201 uses 25/50 drops.
  const big = rummy.setup(seats(2), rng, { mode: 'pool', poolLimit: 201 });
  assert.equal(rummy.applyMove(big, big.turn, { type: 'drop' }, rng).history[0].scores[big.turn], 25);
});

test('rummy modes: seven deals, hidden joker, rounds 1 and 7 count double', () => {
  const rng = seeded(13);
  let s = rummy.setup(seats(2), rng, { mode: 'seven' });
  assert.equal(s.totalRounds, 7);
  assert.equal(s.multiplier, 2);
  assert.equal(s.hiddenJoker, true);

  // Before a pure sequence, a player's view hides the joker.
  const noPure = s.hands.map((h) => !hasPureSequence(h!));
  s.jokerSeen.forEach((seen, i) => assert.equal(seen, !noPure[i]));
  const v = rummy.viewFor!({ ...s, jokerSeen: [false, true] }, [0]);
  assert.equal(v.wildCard, null);
  assert.equal(v.wildRank, -1);
  const v2 = rummy.viewFor!({ ...s, jokerSeen: [true, false] }, [0]);
  assert.equal(v2.wildRank, s.wildRank);

  // A dropped first deal costs double.
  const dropped = rummy.applyMove(s, s.turn, { type: 'drop' }, rng);
  assert.equal(dropped.history[0].scores[s.turn], 40);
  s = dropped;
  for (let round = 2; round <= 7; round++) {
    s = rummy.applyMove(s, s.turn, { type: 'nextRound' }, rng);
    assert.equal(s.multiplier, round === 7 ? 2 : 1);
    s = playDeal(s, rng);
  }
  assert.equal(s.over, true);
  assert.equal(s.history.length, 7);
});

test('rummy: hasPureSequence spots natural runs only', () => {
  assert.equal(hasPureSequence(hand('5H 6H 7H 2C')), true);
  assert.equal(hasPureSequence(hand('QS KS AS')), true);
  assert.equal(hasPureSequence(hand('5H 6H JK 8H')), false);
  assert.equal(hasPureSequence(hand('5H 6D 7H')), false);
});

test('rummy: bots pause on the results screen, but not in tests', () => {
  const s = rummy.setup(seats(2), seeded(14), { mode: 'deals', deals: 2 });
  assert.equal(rummy.botDelayMs!(s), undefined);
  assert.equal(rummy.botDelayMs!({ ...s, phase: 'roundOver' }), 6000);
});
