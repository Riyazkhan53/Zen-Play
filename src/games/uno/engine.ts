import { shuffle } from '../shuffle';
import { GameDef, IllegalMoveError, Rng, SeatInfo } from '../types';

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue';
export type UnoValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

export interface UnoCard {
  id: number;
  color: UnoColor | 'wild';
  value: UnoValue;
}

export const UNO_COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue'];
const HAND_SIZE = 7;

export type UnoMove =
  | { type: 'play'; cardId: number; color?: UnoColor; uno?: boolean }
  | { type: 'draw' }
  | { type: 'pass' };

export interface UnoEvent {
  seat: number;
  kind: 'play' | 'draw' | 'pass' | 'forgot-uno';
  card?: UnoCard;
  /** Seat that had to draw and skip because of a draw card. */
  victim?: number;
  drew?: number;
}

export interface UnoState {
  seats: SeatInfo[];
  /** A seat's cards, or null when this view isn't allowed to see them. */
  hands: (UnoCard[] | null)[];
  handCounts: number[];
  /** Empty in player views; only the host knows the order. */
  drawPile: UnoCard[];
  drawCount: number;
  /** Played cards, top card last. Views keep only the last few. */
  discard: UnoCard[];
  color: UnoColor;
  direction: 1 | -1;
  turn: number;
  /** After drawing a playable card the player may play it or pass. */
  drawnCardId: number | null;
  last: UnoEvent | null;
  over: boolean;
  points: number;
  rankings: number[];
}

function buildDeck(): UnoCard[] {
  const cards: Omit<UnoCard, 'id'>[] = [];
  for (const color of UNO_COLORS) {
    cards.push({ color, value: '0' });
    for (const value of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'] as UnoValue[]) {
      cards.push({ color, value }, { color, value });
    }
  }
  for (let i = 0; i < 4; i++) cards.push({ color: 'wild', value: 'wild' }, { color: 'wild', value: 'wild4' });
  return cards.map((c, id) => ({ ...c, id }));
}

export const cardPoints = (c: UnoCard) => (c.color === 'wild' ? 50 : /^\d$/.test(c.value) ? Number(c.value) : 20);

export function canPlay(card: UnoCard, top: UnoCard, color: UnoColor) {
  return card.color === 'wild' || card.color === color || card.value === top.value;
}

function nextSeat(state: Pick<UnoState, 'turn' | 'direction' | 'seats'>, from = state.turn, steps = 1) {
  const n = state.seats.length;
  return (((from + state.direction * steps) % n) + n) % n;
}

/** Draws `count` cards for a seat, reshuffling the discard pile when the deck runs out. */
function draw(state: UnoState, seat: number, count: number, rng: Rng): { state: UnoState; drawn: UnoCard[] } {
  let drawPile = state.drawPile;
  let discard = state.discard;
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      if (discard.length <= 1) break;
      drawPile = shuffle(discard.slice(0, -1), rng);
      discard = discard.slice(-1);
    }
    drawn.push(drawPile[drawPile.length - 1]);
    drawPile = drawPile.slice(0, -1);
  }
  const hands = state.hands.map((h, i) => (i === seat ? [...h!, ...drawn] : h));
  return {
    state: { ...state, drawPile, discard, hands, drawCount: drawPile.length, handCounts: hands.map((h) => h!.length) },
    drawn,
  };
}

export const uno: GameDef<UnoState, UnoMove> = {
  id: 'uno',
  minPlayers: 2,
  maxPlayers: 8,

  setup(seats, rng) {
    if (seats.length < 2 || seats.length > 8) throw new IllegalMoveError('UNO needs 2 to 8 players');
    let deck = shuffle(buildDeck(), rng);
    const hands = seats.map(() => deck.splice(deck.length - HAND_SIZE, HAND_SIZE));
    // Start on a number card so the first turn is a normal one.
    const firstIndex = deck.findIndex((c) => /^\d$/.test(c.value));
    const first = deck[firstIndex];
    deck = [...deck.slice(0, firstIndex), ...deck.slice(firstIndex + 1)];
    return {
      seats,
      hands,
      handCounts: hands.map((h) => h.length),
      drawPile: deck,
      drawCount: deck.length,
      discard: [first],
      color: first.color as UnoColor,
      direction: 1,
      turn: 0,
      drawnCardId: null,
      last: null,
      over: false,
      points: 0,
      rankings: [],
    };
  },

  currentSeat: (state) => (state.over ? null : state.turn),

  applyMove(state, seat, move, rng) {
    if (state.over) throw new IllegalMoveError('The game is over');
    if (seat !== state.turn) throw new IllegalMoveError('Not your turn');
    const hand = state.hands[seat]!;
    const top = state.discard[state.discard.length - 1];

    if (move.type === 'draw') {
      if (state.drawnCardId != null) throw new IllegalMoveError('Play the card you drew, or pass');
      const { state: after, drawn } = draw(state, seat, 1, rng);
      const card = drawn[0];
      const last: UnoEvent = { seat, kind: 'draw', drew: drawn.length };
      if (card && canPlay(card, top, state.color)) return { ...after, drawnCardId: card.id, last };
      return { ...after, drawnCardId: null, turn: nextSeat(state), last };
    }

    if (move.type === 'pass') {
      if (state.drawnCardId == null) throw new IllegalMoveError('Draw a card first');
      return { ...state, drawnCardId: null, turn: nextSeat(state), last: { seat, kind: 'pass' } };
    }

    if (move.type !== 'play') throw new IllegalMoveError('Unknown move');
    const card = hand.find((c) => c.id === move.cardId);
    if (!card) throw new IllegalMoveError("That card isn't in your hand");
    if (state.drawnCardId != null && card.id !== state.drawnCardId) {
      throw new IllegalMoveError('You can only play the card you just drew');
    }
    if (!canPlay(card, top, state.color)) throw new IllegalMoveError("That card doesn't match");
    if (card.color === 'wild' && !UNO_COLORS.includes(move.color as UnoColor)) {
      throw new IllegalMoveError('Choose a colour');
    }

    const hands = state.hands.map((h, i) => (i === seat ? h!.filter((c) => c.id !== card.id) : h));
    let next: UnoState = {
      ...state,
      hands,
      handCounts: hands.map((h) => h!.length),
      discard: [...state.discard, card],
      color: card.color === 'wild' ? (move.color as UnoColor) : card.color,
      drawnCardId: null,
      last: { seat, kind: 'play', card },
    };

    if (hands[seat]!.length === 0) {
      // Winner scores the cards left in everyone else's hands.
      const others = state.seats.map((_, i) => i).filter((i) => i !== seat);
      const left = (i: number) => hands[i]!.reduce((sum, c) => sum + cardPoints(c), 0);
      return {
        ...next,
        over: true,
        points: others.reduce((sum, i) => sum + left(i), 0),
        rankings: [seat, ...others.sort((a, b) => left(a) - left(b))],
      };
    }

    // Down to one card without calling UNO: draw two.
    if (hands[seat]!.length === 1 && !move.uno) {
      next = { ...draw(next, seat, 2, rng).state, last: { seat, kind: 'forgot-uno', card } };
    }

    const twoPlayers = state.seats.length === 2;
    if (card.value === 'reverse') {
      next = { ...next, direction: (next.direction * -1) as 1 | -1 };
      // With two players a reverse works like a skip.
      return { ...next, turn: twoPlayers ? seat : nextSeat(next, seat) };
    }
    if (card.value === 'skip') return { ...next, turn: nextSeat(next, seat, 2) };
    if (card.value === 'draw2' || card.value === 'wild4') {
      const victim = nextSeat(next, seat);
      const count = card.value === 'draw2' ? 2 : 4;
      const after = draw(next, victim, count, rng).state;
      return { ...after, turn: nextSeat(next, seat, 2), last: { ...next.last!, victim, drew: count } };
    }
    return { ...next, turn: nextSeat(next, seat) };
  },

  botMove(state, seat, rng) {
    const hand = state.hands[seat]!;
    const top = state.discard[state.discard.length - 1];
    if (state.drawnCardId != null) {
      const drawn = hand.find((c) => c.id === state.drawnCardId)!;
      return { type: 'play', cardId: drawn.id, color: favouriteColor(hand, rng), uno: hand.length === 2 };
    }
    const playable = hand.filter((c) => canPlay(c, top, state.color));
    if (!playable.length) return { type: 'draw' };
    const nextCount = state.handCounts[nextSeat(state, seat)];
    // Save wilds for later; hit hard when the next player is close to winning.
    const rank = (c: UnoCard) =>
      (c.color === 'wild' ? -30 : 0) +
      (['skip', 'draw2', 'reverse'].includes(c.value) ? (nextCount <= 2 ? 25 : 5) : 0) +
      (c.value === 'wild4' && nextCount <= 2 ? 60 : 0) +
      (c.color === state.color ? 3 : 0) +
      cardPoints(c) / 10 +
      rng() * 2;
    const card = playable.sort((a, b) => rank(b) - rank(a))[0];
    return {
      type: 'play',
      cardId: card.id,
      color: favouriteColor(
        hand.filter((c) => c.id !== card.id),
        rng,
      ),
      uno: hand.length === 2,
    };
  },

  rankings: (state) => state.rankings,

  viewFor(state, seats) {
    return {
      ...state,
      hands: state.hands.map((h, i) => (seats.includes(i) || state.over ? h : null)),
      drawPile: [],
      discard: state.discard.slice(-4),
    };
  },
};

function favouriteColor(hand: UnoCard[], rng: Rng): UnoColor {
  const counts = UNO_COLORS.map((c) => hand.filter((card) => card.color === c).length);
  const max = Math.max(...counts);
  if (max === 0) return UNO_COLORS[Math.floor(rng() * 4)];
  return UNO_COLORS[counts.indexOf(max)];
}
