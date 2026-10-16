import type { GameId } from '../games/types';

// Messages between a player's app and whoever hosts the room: the online
// server, a phone hosting on Wi-Fi, or this same device for pass-and-play.

export interface SeatView {
  name: string;
  /** Client that controls this seat; null for computer players. */
  ownerId: string | null;
  bot: boolean;
  connected: boolean;
}

export interface RoomView {
  gameId: GameId;
  code?: string;
  hostClientId: string;
  seats: SeatView[];
  minPlayers: number;
  maxPlayers: number;
  started: boolean;
  /** Game settings chosen by the host in the lobby. */
  options?: unknown;
}

export type ClientMessage =
  // First message to a room host (Wi-Fi / same device).
  | { t: 'hello'; clientId: string; name: string }
  // First message to the online server.
  | { t: 'create'; gameId: GameId; clientId: string; name: string }
  | { t: 'join'; code: string; clientId: string; name: string }
  // Lobby. Anyone can add a player sharing their device; only the host can
  // add/remove computer players, remove seats and start.
  | { t: 'addLocal'; name: string }
  | { t: 'addBot' }
  | { t: 'removeSeat'; seat: number }
  | { t: 'start' }
  | { t: 'setOptions'; options: unknown }
  // In game.
  | { t: 'move'; seat: number; move: unknown }
  | { t: 'replaceWithBot'; seat: number }
  | { t: 'rematch' };

export type HostMessage =
  | { t: 'room'; room: RoomView }
  | { t: 'state'; state: unknown; seq: number }
  | { t: 'error'; message: string };

export const LAN_PORT = 7351;
