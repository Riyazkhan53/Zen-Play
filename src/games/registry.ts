import { carrom } from './carrom/engine';
import { chess } from './chess/engine';
import { ludo } from './ludo/engine';
import { snakes } from './snakes/engine';
import { GameDef, GameId } from './types';

export interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  players: string;
  emoji: string;
  colors: [string, string];
  available: boolean;
}

export const GAMES: GameMeta[] = [
  {
    id: 'ludo',
    name: 'Ludo',
    tagline: 'Race your four tokens home',
    players: '2–4 players',
    emoji: '🎲',
    colors: ['#F97316', '#DC2626'],
    available: true,
  },
  {
    id: 'snakes',
    name: 'Snakes & Ladders',
    tagline: 'Climb up, slide down, reach 100',
    players: '2–6 players',
    emoji: '🐍',
    colors: ['#22C55E', '#0D9488'],
    available: true,
  },
  {
    id: 'chess',
    name: 'Chess',
    tagline: 'The classic game of strategy',
    players: '2 players',
    emoji: '♟️',
    colors: ['#64748B', '#334155'],
    available: true,
  },
  {
    id: 'carrom',
    name: 'Carrom',
    tagline: 'Flick, pocket, win the queen',
    players: '2 or 4 players',
    emoji: '🎯',
    colors: ['#D97706', '#92400E'],
    available: true,
  },
  {
    id: 'uno',
    name: 'UNO',
    tagline: 'Match colours, play wild cards',
    players: '2–8 players',
    emoji: '🃏',
    colors: ['#EF4444', '#2563EB'],
    available: false,
  },
  {
    id: 'rummy',
    name: 'Rummy',
    tagline: 'Build sets and sequences',
    players: '2–6 players',
    emoji: '♠️',
    colors: ['#7C3AED', '#4338CA'],
    available: false,
  },
];

// Engines are typed per game; the multiplayer layer treats them generically.
export const ENGINES: Partial<Record<GameId, GameDef<any, any>>> = {
  ludo,
  snakes,
  chess,
  carrom,
};

export function gameMeta(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}
