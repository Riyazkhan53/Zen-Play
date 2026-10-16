import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import type { GameId } from '@/games/types';

// Personal game history kept on this device, for the dashboard.

const KEY = '@zenplay_stats';
const RECENT = 20;

export interface GameRecord {
  gameId: GameId;
  won: boolean;
  draw: boolean;
  players: number;
  mode: 'local' | 'online' | 'lan';
  at: number;
}

export interface Stats {
  played: number;
  wins: number;
  byGame: Partial<Record<GameId, { played: number; wins: number }>>;
  recent: GameRecord[];
}

const EMPTY: Stats = { played: 0, wins: 0, byGame: {}, recent: [] };
let stats: Stats = EMPTY;
let loaded = false;
const recorded = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) stats = { ...EMPTY, ...JSON.parse(stored) };
  } catch {
    // storage unavailable: start fresh in memory
  }
  emit();
}

async function save() {
  emit();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // keep in memory
  }
}

/** Records a finished game once (`key` identifies it, so re-renders don't double count). */
export function recordGame(key: string, record: Omit<GameRecord, 'at'>) {
  if (recorded.has(key)) return;
  recorded.add(key);
  const game = stats.byGame[record.gameId] ?? { played: 0, wins: 0 };
  stats = {
    played: stats.played + 1,
    wins: stats.wins + (record.won ? 1 : 0),
    byGame: { ...stats.byGame, [record.gameId]: { played: game.played + 1, wins: game.wins + (record.won ? 1 : 0) } },
    recent: [{ ...record, at: Date.now() }, ...stats.recent].slice(0, RECENT),
  };
  save();
}

export function resetStats() {
  stats = EMPTY;
  save();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getStats = () => stats;

export function useStats(): Stats {
  useEffect(() => {
    load();
  }, []);
  return useSyncExternalStore(subscribe, getStats, getStats);
}

export function timeAgo(at: number, now = Date.now()): string {
  const m = Math.round((now - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
