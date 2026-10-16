import type { ComponentType } from 'react';

import type { RoomView } from '@/net/protocol';

export interface GameUIProps<S> {
  state: S;
  room: RoomView;
  /** Board area size in px: a square for board games, the width for card tables. */
  size: number;
  /** Seats this device controls (several when sharing one device). */
  mySeats: number[];
  /** Increases with every state update; handy for one-shot animations. */
  seq: number;
  act: (seat: number, move: unknown) => void;
}

export interface GameOptionsProps {
  options: unknown;
  isHost: boolean;
  onChange: (options: unknown) => void;
}

/** Everything the shared game screen needs to show one game. */
export interface GameUI<S> {
  Board: ComponentType<GameUIProps<S>>;
  /** Lobby settings for the game (e.g. Rummy's match format). */
  Options?: ComponentType<GameOptionsProps>;
  /** Shown in the turn card beside the player's name (e.g. dice). */
  Controls?: ComponentType<GameUIProps<S>>;
  /** What just happened, e.g. "Asha rolled 6". */
  status(state: S, room: RoomView): string;
  /** What the player whose turn it is should do. */
  hint(state: S, room: RoomView, myTurn: boolean): string;
  /** Short per-player progress, e.g. "2/4 home". */
  detail(state: S, seat: number): string;
  /** Title of the game-over dialog. */
  result(state: S, room: RoomView): string;
  /** True when the game ended without a winner. */
  isDraw?(state: S): boolean;
  /** 'square' boards sit beside the panel on tablets; 'table' games use the full width. */
  shape: 'square' | 'table';
}
