import { shuffle } from '../shuffle';
import { GameDef, IllegalMoveError, SeatInfo } from '../types';
import { arrange, cardValue, MAX_POINTS, PlayingCard, solver, Suit } from './melds';

// 13-card Rummy (the Indian points game): two decks plus two printed jokers.
// A card is turned up at the start; every card of that rank is also a joker.

export type RummyMove =
  | { type: 'draw'; from: 'stock' | 'discard' }
  | { type: 'discard'; cardId: number }
  | { type: 'declare'; cardId: number }
  | { type: 'drop' };

export interface RummyEvent {
  seat: number;
  kind: 'draw-stock' | 'draw-discard' | 'discard' | 'declare' | 'drop';
  card?: PlayingCard;
}

export interface RummyState {
  seats: SeatInfo[];
  hands: (PlayingCard[] | null)[];
  handCounts: number[];
  /** Empty in player views. */
  stock: PlayingCard[];
  stockCount: number;
  /** Top card last; views keep only the last few. */
  discard: PlayingCard[];
  /** The turned-up card that makes its rank wild. */
  wildCard: PlayingCard;
  wildRank: number;
  turn: number;
  phase: 'draw' | 'discard';
  /** A card taken from the discard pile can't be thrown straight back. */
  takenFromDiscard: number | null;
  hasDrawn: boolean[];
  dropped: boolean[];
  /** Points per seat, filled in at the end (lower is better; winner 0). */
  scores: number[];
  last: RummyEvent | null;
  over: boolean;
  winner: number | null;
  /** Points the winner collects. */
  winnings: number;
  rankings: number[];
}

const HAND = 13;
const FIRST_DROP = 20;
const MIDDLE_DROP = 40;

function buildDeck(): PlayingCard[] {
  const cards: Omit<PlayingCard, 'id'>[] = [];
  for (let deck = 0; deck < 2; deck++) {
    for (const suit of ['S', 'H', 'D', 'C'] as Suit[]) {
      for (let rank = 1; rank <= 13; rank++) cards.push({ suit, rank });
    }
    cards.push({ suit: 'J', rank: 0 });
  }
  return cards.map((c, id) => ({ ...c, id }));
}

const nextActive = (state: RummyState, from: number) => {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if (!state.dropped[seat]) return seat;
  }
  return from;
};

/** Ends the game with `winner`; everyone else scores their hand (dropped players keep their drop points). */
function finish(state: RummyState, winner: number): RummyState {
  const scores = state.seats.map((_, i) => {
    if (i === winner) return 0;
    if (state.dropped[i]) return state.scores[i];
    return arrange(state.hands[i]!, state.wildRank).score;
  });
  const winnings = scores.reduce((a, b) => a + b, 0);
  const others = state.seats.map((_, i) => i).filter((i) => i !== winner);
  return {
    ...state,
    scores,
    over: true,
    winner,
    winnings,
    rankings: [winner, ...others.sort((a, b) => scores[a] - scores[b])],
  };
}

export const rummy: GameDef<RummyState, RummyMove> = {
  id: 'rummy',
  minPlayers: 2,
  maxPlayers: 6,

  setup(seats, rng) {
    if (seats.length < 2 || seats.length > 6) throw new IllegalMoveError('Rummy needs 2 to 6 players');
    const deck = shuffle(buildDeck(), rng);
    const hands = seats.map(() => deck.splice(deck.length - HAND, HAND));
    // Turn up the wild joker card (a printed joker would make aces wild, as is common).
    const wildCard = deck.pop()!;
    const firstDiscard = deck.pop()!;
    return {
      seats,
      hands,
      handCounts: hands.map((h) => h.length),
      stock: deck,
      stockCount: deck.length,
      discard: [firstDiscard],
      wildCard,
      wildRank: wildCard.rank === 0 ? 1 : wildCard.rank,
      turn: 0,
      phase: 'draw',
      takenFromDiscard: null,
      hasDrawn: seats.map(() => false),
      dropped: seats.map(() => false),
      scores: seats.map(() => 0),
      last: null,
      over: false,
      winner: null,
      winnings: 0,
      rankings: [],
    };
  },

  currentSeat: (state) => (state.over ? null : state.turn),

  applyMove(state, seat, move, rng) {
    if (state.over) throw new IllegalMoveError('The game is over');
    if (seat !== state.turn) throw new IllegalMoveError('Not your turn');
    const hand = state.hands[seat]!;
    const withHand = (cards: PlayingCard[]) => {
      const hands = state.hands.map((h, i) => (i === seat ? cards : h));
      return { hands, handCounts: hands.map((h) => h?.length ?? 0) };
    };

    if (move.type === 'drop') {
      if (state.phase !== 'draw') throw new IllegalMoveError('You can only drop before drawing');
      const dropped = state.dropped.map((d, i) => d || i === seat);
      const scores = state.scores.map((s, i) => (i === seat ? (state.hasDrawn[seat] ? MIDDLE_DROP : FIRST_DROP) : s));
      const next: RummyState = { ...state, dropped, scores, last: { seat, kind: 'drop' } };
      const remaining = state.seats.map((_, i) => i).filter((i) => !dropped[i]);
      if (remaining.length === 1) return finish(next, remaining[0]);
      return { ...next, turn: nextActive(next, seat), phase: 'draw' };
    }

    if (move.type === 'draw') {
      if (state.phase !== 'draw') throw new IllegalMoveError('Discard a card first');
      let { stock, discard } = state;
      let card: PlayingCard;
      if (move.from === 'discard') {
        if (!discard.length) throw new IllegalMoveError('The discard pile is empty');
        card = discard[discard.length - 1];
        discard = discard.slice(0, -1);
      } else {
        if (!stock.length) {
          // Reshuffle everything but the top discard.
          stock = shuffle(discard.slice(0, -1), rng);
          discard = discard.slice(-1);
        }
        if (!stock.length) throw new IllegalMoveError('No cards left to draw');
        card = stock[stock.length - 1];
        stock = stock.slice(0, -1);
      }
      return {
        ...state,
        ...withHand([...hand, card]),
        stock,
        stockCount: stock.length,
        discard,
        phase: 'discard',
        takenFromDiscard: move.from === 'discard' ? card.id : null,
        hasDrawn: state.hasDrawn.map((d, i) => d || i === seat),
        last: {
          seat,
          kind: move.from === 'discard' ? 'draw-discard' : 'draw-stock',
          card: move.from === 'discard' ? card : undefined,
        },
      };
    }

    if (move.type === 'discard' || move.type === 'declare') {
      if (state.phase !== 'discard') throw new IllegalMoveError('Draw a card first');
      const card = hand.find((c) => c.id === move.cardId);
      if (!card) throw new IllegalMoveError("That card isn't in your hand");
      const rest = hand.filter((c) => c.id !== card.id);
      if (move.type === 'declare') {
        if (arrange(rest, state.wildRank).score !== 0) {
          throw new IllegalMoveError('Not ready: you need 2 sequences (1 pure) and every card grouped');
        }
        return finish(
          { ...state, ...withHand(rest), discard: [...state.discard, card], last: { seat, kind: 'declare', card } },
          seat,
        );
      }
      if (card.id === state.takenFromDiscard)
        throw new IllegalMoveError("You can't throw back the card you just picked up");
      const next: RummyState = {
        ...state,
        ...withHand(rest),
        discard: [...state.discard, card],
        phase: 'draw',
        takenFromDiscard: null,
        last: { seat, kind: 'discard', card },
      };
      return { ...next, turn: nextActive(next, seat) };
    }

    throw new IllegalMoveError('Unknown move');
  },

  botMove(state, seat) {
    const hand = state.hands[seat]!;
    if (state.phase === 'draw') {
      // Take the open card only if it makes the hand better than now.
      const top = state.discard[state.discard.length - 1];
      if (top) {
        const now = bestDiscard(hand, state.wildRank, null).score;
        const withTop = bestDiscard([...hand, top], state.wildRank, top.id).score;
        if (withTop < now - 2 || (withTop === 0 && now !== 0)) return { type: 'draw', from: 'discard' };
      }
      return { type: 'draw', from: 'stock' };
    }
    const { card, score } = bestDiscard(hand, state.wildRank, state.takenFromDiscard);
    return score === 0 ? { type: 'declare', cardId: card.id } : { type: 'discard', cardId: card.id };
  },

  rankings: (state) => state.rankings,

  viewFor(state, seats) {
    return {
      ...state,
      hands: state.hands.map((h, i) => (seats.includes(i) || state.over ? h : null)),
      stock: [],
      discard: state.discard.slice(-3),
    };
  },
};

/**
 * Best card to throw from a 14-card hand (or the "13 + one more" for 13 cards):
 * the discard that leaves the lowest score, preferring to shed high cards.
 */
export function bestDiscard(hand: PlayingCard[], wildRank: number, keepId: number | null) {
  const s = solver(hand, wildRank);
  let best = { card: hand[0], score: Infinity, value: -1 };
  hand.forEach((card, i) => {
    if (card.id === keepId) return;
    const score = s.best(s.full & ~(1 << i)).score;
    const value = cardValue(card, wildRank);
    if (score < best.score || (score === best.score && value > best.value)) best = { card, score, value };
  });
  return { card: best.card, score: best.score === Infinity ? MAX_POINTS : best.score };
}
