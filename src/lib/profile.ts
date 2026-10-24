import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import type { Difficulty } from '@/games/types';

// The player's display name, a stable ID (so a seat can be reclaimed after
// reconnecting) and how the app looks.

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentName = 'teal' | 'violet' | 'blue' | 'pink' | 'orange';
export type PieceStyle = 'normal' | 'glass' | '3d';
export type CardFace = 'classic' | 'glass' | '3d';
export type CardBack = 'gold' | 'black' | 'wizard' | 'hero';

const KEY = '@zenplay_profile';

export interface Profile {
  clientId: string;
  name: string;
  theme: ThemeMode;
  accent: AccentName;
  /** How chess pieces are drawn. */
  pieceStyle: PieceStyle;
  /** Playing-card front and back designs (Rummy). */
  cardFace: CardFace;
  cardBack: CardBack;
  /** Rummy: keep the hand sorted into melds automatically. */
  autoSort: boolean;
  /** Last difficulty picked in Quick Play. */
  quickDifficulty: Difficulty;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

let profile: Profile = {
  clientId: newId(),
  name: '',
  theme: 'system',
  accent: 'teal',
  pieceStyle: 'normal',
  cardFace: 'classic',
  cardBack: 'gold',
  autoSort: false,
  quickDifficulty: 'medium',
};
let loaded = false;
const listeners = new Set<() => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) profile = { ...profile, ...JSON.parse(stored) };
    else await AsyncStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // storage unavailable (private browsing): keep the in-memory profile
  }
  listeners.forEach((l) => l());
}

export function getProfile(): Profile {
  return profile;
}

export function displayName(): string {
  return profile.name.trim() || 'Player';
}

export async function updateProfile(patch: Partial<Omit<Profile, 'clientId'>>) {
  profile = { ...profile, ...patch };
  listeners.forEach((l) => l());
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // keep in memory
  }
}

export function setName(name: string) {
  return updateProfile({ name: name.trim().slice(0, 20) });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProfile(): Profile {
  useEffect(() => {
    load();
  }, []);
  return useSyncExternalStore(subscribe, getProfile, getProfile);
}
