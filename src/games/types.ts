// Shared game contract. Engines are pure functions over JSON-serialisable
// state, so the same code runs on a phone (same-device and Wi-Fi host), and
// on the online server, and state can be sent over the network as-is.

export type Rng = () => number;

export type GameId = 'ludo' | 'snakes' | 'chess' | 'carrom' | 'rummy' | 'uno';

export interface SeatInfo {
  name: string;
}

export class IllegalMoveError extends Error {}

export interface GameDef<S = unknown, M = unknown> {
  id: GameId;
  minPlayers: number;
  maxPlayers: number;
  /** `options` are game settings chosen in the lobby (e.g. Rummy's match format). */
  setup(seats: SeatInfo[], rng: Rng, options?: unknown): S;
  /** Seat whose turn it is, or null once the game is over. */
  currentSeat(state: S): number | null;
  /** Returns the next state, or throws IllegalMoveError. Never mutates `state`. */
  applyMove(state: S, seat: number, move: M, rng: Rng): S;
  /** A legal move for a computer player. */
  botMove(state: S, seat: number, rng: Rng): M;
  /** Seats in finishing order (winner first) once the game is over. */
  rankings(state: S): number[];
  /** Overrides how long a computer player waits before acting (e.g. on a results screen). */
  botDelayMs?(state: S): number | undefined;
  /**
   * What a device controlling `seats` may see. Games with hidden information
   * (card hands, the deck order) blank out everything else; the host only
   * ever sends this view, so other players' cards never leave the host.
   */
  viewFor?(state: S, seats: number[]): S;
}

export const rollDie = (rng: Rng) => 1 + Math.floor(rng() * 6);
