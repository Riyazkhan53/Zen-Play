import { shuffle } from '../shuffle';
import { Difficulty, GameDef, IllegalMoveError, SeatInfo } from '../types';
import { arrange, cardValue, isJoker, MAX_POINTS, PlayingCard, solver, Suit } from './melds';

// 13-card Rummy (Indian rules): two decks plus two printed jokers. A card is
// turned up each deal and every card of that rank is also a joker.
//
// Match formats:
//   points  one deal; losers pay their points to the winner
//   pool    deals continue; reach the limit (101, 201 or custom) and you're out; last player in wins
//   deals   a fixed number of deals (best of 3 / 5); lowest total wins
//   seven   7 deals with a hidden joker (you see it once you hold a pure sequence);
//           deals 1 and 7 count double; lowest total wins

export type RummyMode = 'points' | 'pool' | 'deals' | 'seven';

export interface RummyOptions {
  mode: RummyMode;
  /** Pool elimination limit. */
  poolLimit?: number;
  /** Number of deals in "deals" mode. */
  deals?: number;
}

export type RummyMove =
  | { type: 'draw'; from: 'stock' | 'discard' }
  | { type: 'discard'; cardId: number }
  | { type: 'declare'; cardId: number }
  | { type: 'drop' }
  | { type: 'nextRound' };

export interface RummyEvent {
  seat: number;
  kind: 'deal' | 'draw-stock' | 'draw-discard' | 'discard' | 'declare' | 'drop';
  card?: PlayingCard;
}

export interface RoundResult {
  round: number;
  winner: number;
  multiplier: number;
  /** Points each seat scored this deal (after the multiplier). */
  scores: number[];
}

export interface RummyState {
  seats: SeatInfo[];
  options: Required<RummyOptions>;
  round: number;
  /** Deals in the match, or null for pool (plays until one player is left). */
  totalRounds: number | null;
  multiplier: number;
  dealer: number;
  hands: (PlayingCard[] | null)[];
  handCounts: number[];
  /** Empty in player views. */
  stock: PlayingCard[];
  stockCount: number;
  /** Top card last; views keep only the last few. */
  discard: PlayingCard[];
  /** The turned-up card that makes its rank wild; null while it's hidden from this view. */
  wildCard: PlayingCard | null;
  /** -1 while the joker is hidden from this view. */
  wildRank: number;
  hiddenJoker: boolean;
  jokerSeen: boolean[];
  turn: number;
  phase: 'draw' | 'discard' | 'roundOver';
  /** A card taken from the discard pile can't be thrown straight back. */
  takenFromDiscard: number | null;
  hasDrawn: boolean[];
  /** Out of this deal: dropped, or eliminated from the match. */
  dropped: boolean[];
  eliminated: boolean[];
  /** This deal's points (filled in when the deal ends). */
  scores: number[];
  totals: number[];
  history: RoundResult[];
  roundWinner: number | null;
  last: RummyEvent | null;
  over: boolean;
  winner: number | null;
  /** Points mode: what the winner collects. */
  winnings: number;
  rankings: number[];
}

const HAND = 13;

export function normaliseOptions(raw: unknown): Required<RummyOptions> {
  const o = (raw ?? {}) as Partial<RummyOptions>;
  const mode: RummyMode = ['points', 'pool', 'deals', 'seven'].includes(o.mode as string)
    ? (o.mode as RummyMode)
    : 'points';
  const poolLimit = Math.round(Number(o.poolLimit) || 101);
  const deals = Math.round(Number(o.deals) || 3);
  if (mode === 'pool' && (poolLimit < 50 || poolLimit > 1000)) throw new IllegalMoveError('Pool limit must be 50–1000');
  if (mode === 'deals' && (deals < 1 || deals > 15)) throw new IllegalMoveError('Choose 1 to 15 deals');
  return { mode, poolLimit, deals };
}

export function modeLabel(o: Required<RummyOptions>) {
  switch (o.mode) {
    case 'points':
      return 'Points';
    case 'pool':
      return `Pool ${o.poolLimit}`;
    case 'deals':
      return `Best of ${o.deals}`;
    case 'seven':
      return '7 rounds · hidden joker';
  }
}

/** First drop / middle drop costs. Pool 201 uses the higher 25/50 scale. */
export function dropCost(o: Required<RummyOptions>, middle: boolean) {
  const big = o.mode === 'pool' && o.poolLimit >= 201;
  return middle ? (big ? 50 : 40) : big ? 25 : 20;
}

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

/** Any natural run of 3+ in one suit (no jokers standing in). */
export function hasPureSequence(cards: PlayingCard[]): boolean {
  for (const suit of ['S', 'H', 'D', 'C']) {
    const ranks = new Set(cards.filter((c) => c.suit === suit).map((c) => c.rank));
    if (ranks.has(1)) ranks.add(14);
    for (const r of ranks) if (ranks.has(r + 1) && ranks.has(r + 2)) return true;
  }
  return false;
}

const nextActive = (state: Pick<RummyState, 'seats' | 'dropped'>, from: number) => {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if (!state.dropped[seat]) return seat;
  }
  return from;
};

/** Deals a new round to everyone still in the match. */
function deal(
  base: Omit<
    RummyState,
    | 'hands'
    | 'handCounts'
    | 'stock'
    | 'stockCount'
    | 'discard'
    | 'wildCard'
    | 'wildRank'
    | 'jokerSeen'
    | 'turn'
    | 'phase'
    | 'takenFromDiscard'
    | 'hasDrawn'
    | 'dropped'
    | 'scores'
    | 'roundWinner'
    | 'last'
    | 'multiplier'
  >,
  rng: () => number,
): RummyState {
  const deck = shuffle(buildDeck(), rng);
  const hands = base.seats.map((_, i) => (base.eliminated[i] ? [] : deck.splice(deck.length - HAND, HAND)));
  const wildCard = deck.pop()!;
  const firstDiscard = deck.pop()!;
  const dropped = [...base.eliminated];
  const seven = base.options.mode === 'seven';
  return {
    ...base,
    multiplier: seven && (base.round === 1 || base.round === 7) ? 2 : 1,
    hands,
    handCounts: hands.map((h) => h.length),
    stock: deck,
    stockCount: deck.length,
    discard: [firstDiscard],
    wildCard,
    // A printed joker turned up makes aces wild.
    wildRank: wildCard.rank === 0 ? 1 : wildCard.rank,
    jokerSeen: hands.map((h) => !base.hiddenJoker || hasPureSequence(h)),
    turn: nextActive({ seats: base.seats, dropped }, base.dealer),
    phase: 'draw',
    takenFromDiscard: null,
    hasDrawn: base.seats.map(() => false),
    dropped,
    scores: base.seats.map(() => 0),
    roundWinner: null,
    last: { seat: base.dealer, kind: 'deal' },
  };
}

/** Ends a deal: score it, update totals and eliminations, and maybe end the match. */
function endRound(state: RummyState, winner: number): RummyState {
  const scores = state.seats.map((_, i) => {
    if (i === winner || state.eliminated[i]) return 0;
    const raw = state.dropped[i] ? state.scores[i] : arrange(state.hands[i]!, state.wildRank).score;
    return raw * state.multiplier;
  });
  const totals = state.totals.map((t, i) => t + scores[i]);
  const { mode, poolLimit } = state.options;
  const eliminated = state.eliminated.map((e, i) => e || (mode === 'pool' && totals[i] >= poolLimit));
  const history = [...state.history, { round: state.round, winner, multiplier: state.multiplier, scores }];
  const next: RummyState = {
    ...state,
    scores,
    totals,
    eliminated,
    history,
    roundWinner: winner,
    jokerSeen: state.seats.map(() => true),
  };

  const all = state.seats.map((_, i) => i);
  let over = false;
  if (mode === 'points') over = true;
  else if (mode === 'pool') over = all.filter((i) => !eliminated[i]).length <= 1;
  else over = state.round >= (state.totalRounds ?? 1);

  if (!over) return { ...next, phase: 'roundOver', turn: winner };

  if (mode === 'points') {
    return {
      ...next,
      over: true,
      winner,
      winnings: scores.reduce((a, b) => a + b, 0),
      rankings: [winner, ...all.filter((i) => i !== winner).sort((a, b) => scores[a] - scores[b])],
    };
  }
  // Survivors first (pool), then lowest total.
  const rankings = [...all].sort((a, b) => Number(eliminated[a]) - Number(eliminated[b]) || totals[a] - totals[b]);
  return { ...next, over: true, winner: rankings[0], rankings };
}

/** Lets a seat see the hidden joker once it holds a pure sequence. */
function noticeJoker(state: RummyState, seat: number): RummyState {
  if (state.jokerSeen[seat] || !hasPureSequence(state.hands[seat] ?? [])) return state;
  return { ...state, jokerSeen: state.jokerSeen.map((s, i) => s || i === seat) };
}

export const rummy: GameDef<RummyState, RummyMove> = {
  id: 'rummy',
  minPlayers: 2,
  maxPlayers: 6,

  setup(seats, rng, rawOptions) {
    if (seats.length < 2 || seats.length > 6) throw new IllegalMoveError('Rummy needs 2 to 6 players');
    const options = normaliseOptions(rawOptions);
    const zeros = seats.map(() => 0);
    return deal(
      {
        seats,
        options,
        round: 1,
        totalRounds:
          options.mode === 'points' ? 1 : options.mode === 'pool' ? null : options.mode === 'seven' ? 7 : options.deals,
        dealer: seats.length - 1,
        hiddenJoker: options.mode === 'seven',
        eliminated: seats.map(() => false),
        totals: zeros,
        history: [],
        over: false,
        winner: null,
        winnings: 0,
        rankings: [],
      },
      rng,
    );
  },

  currentSeat: (state) => (state.over ? null : state.turn),

  applyMove(state, seat, move, rng) {
    if (state.over) throw new IllegalMoveError('The game is over');

    if (move.type === 'nextRound') {
      if (state.phase !== 'roundOver') throw new IllegalMoveError('The deal is still going');
      const dealer = nextActive({ seats: state.seats, dropped: state.eliminated }, state.dealer);
      return deal({ ...state, round: state.round + 1, dealer }, rng);
    }

    if (state.phase === 'roundOver') throw new IllegalMoveError('Start the next deal');
    if (seat !== state.turn) throw new IllegalMoveError('Not your turn');
    const hand = state.hands[seat]!;
    const withHand = (cards: PlayingCard[]) => {
      const hands = state.hands.map((h, i) => (i === seat ? cards : h));
      return { hands, handCounts: hands.map((h) => h?.length ?? 0) };
    };

    if (move.type === 'drop') {
      if (state.phase !== 'draw') throw new IllegalMoveError('You can only drop before drawing');
      const dropped = state.dropped.map((d, i) => d || i === seat);
      const scores = state.scores.map((s, i) => (i === seat ? dropCost(state.options, state.hasDrawn[seat]) : s));
      const next: RummyState = { ...state, dropped, scores, last: { seat, kind: 'drop' } };
      const remaining = state.seats.map((_, i) => i).filter((i) => !dropped[i]);
      if (remaining.length === 1) return endRound(next, remaining[0]);
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
      return noticeJoker(
        {
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
        },
        seat,
      );
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
        return endRound(
          { ...state, ...withHand(rest), discard: [...state.discard, card], last: { seat, kind: 'declare', card } },
          seat,
        );
      }
      if (card.id === state.takenFromDiscard) {
        throw new IllegalMoveError("You can't throw back the card you just picked up");
      }
      const next: RummyState = {
        ...state,
        ...withHand(rest),
        discard: [...state.discard, card],
        phase: 'draw',
        takenFromDiscard: null,
        last: { seat, kind: 'discard', card },
      };
      return noticeJoker({ ...next, turn: nextActive(next, seat) }, seat);
    }

    throw new IllegalMoveError('Unknown move');
  },

  botMove(state, seat, rng, difficulty: Difficulty = 'medium') {
    if (state.phase === 'roundOver') return { type: 'nextRound' };
    // Chance of a careless move: ignoring a useful open card or throwing a random card.
    const careless = difficulty === 'easy' ? 0.55 : difficulty === 'medium' ? 0.15 : 0;
    const hand = state.hands[seat]!;
    // Bots play fair: no using a hidden joker they haven't earned the right to see.
    const wild = state.jokerSeen[seat] ? state.wildRank : -1;
    if (state.phase === 'draw') {
      // Take the open card only if it makes the hand better than now.
      const top = state.discard[state.discard.length - 1];
      if (top && rng() >= careless) {
        const now = bestDiscard(hand, wild, null).score;
        const withTop = bestDiscard([...hand, top], wild, top.id).score;
        if (withTop < now - 2 || (withTop === 0 && now !== 0)) return { type: 'draw', from: 'discard' };
      }
      return { type: 'draw', from: 'stock' };
    }
    const { card, score } = bestDiscard(hand, wild, state.takenFromDiscard);
    if (score !== 0 && rng() < careless) {
      const throwable = hand.filter((c) => c.id !== state.takenFromDiscard && !isJoker(c, wild));
      if (throwable.length) return { type: 'discard', cardId: throwable[Math.floor(rng() * throwable.length)].id };
    }
    return score === 0 ? { type: 'declare', cardId: card.id } : { type: 'discard', cardId: card.id };
  },

  // Give people time to read the deal's results before a bot starts the next one.
  botDelayMs: (state) => (state.phase === 'roundOver' ? 6000 : undefined),

  rankings: (state) => state.rankings,

  viewFor(state, seats) {
    const reveal = state.over || state.phase === 'roundOver';
    const canSeeJoker = reveal || !state.hiddenJoker || seats.some((s) => state.jokerSeen[s]);
    return {
      ...state,
      hands: state.hands.map((h, i) => (seats.includes(i) || reveal ? h : null)),
      stock: [],
      discard: state.discard.slice(-3),
      wildCard: canSeeJoker ? state.wildCard : null,
      wildRank: canSeeJoker ? state.wildRank : -1,
    };
  },
};

/**
 * Best card to throw from a 14-card hand: the discard that leaves the lowest
 * score, preferring to shed high cards.
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
