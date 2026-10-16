import { ImageStyle, StyleSheet, TextStyle, useColorScheme, ViewStyle } from 'react-native';

import { AccentName, ThemeMode, useProfile } from '@/lib/profile';

// App chrome follows the player's theme (light / dark / system) and accent
// colour. Game boards keep their own fixed colours (felt, wood, card faces).

export interface Colors {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentDark: string;
  accentText: string;
  violet: string;
  danger: string;
  warning: string;
  success: string;
  /** Translucent black or white for overlays. */
  overlay: string;
}

const DARK = {
  scheme: 'dark' as const,
  bg: '#0B1220',
  surface: '#131C2E',
  surfaceAlt: '#1B2740',
  border: '#26344F',
  text: '#F1F5F9',
  muted: '#94A3B8',
  faint: '#64748B',
  violet: '#A78BFA',
  danger: '#F87171',
  warning: '#FBBF24',
  success: '#4ADE80',
  overlay: 'rgba(2,6,23,0.75)',
};

const LIGHT = {
  scheme: 'light' as const,
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2F7',
  border: '#D9E0EA',
  text: '#0F172A',
  muted: '#475569',
  faint: '#64748B',
  violet: '#7C3AED',
  danger: '#DC2626',
  warning: '#B45309',
  success: '#15803D',
  overlay: 'rgba(15,23,42,0.55)',
};

/** Accent colour per scheme: bright on dark, deeper on light so text stays readable. */
export const ACCENTS: Record<
  AccentName,
  { label: string; dark: [string, string, string]; light: [string, string, string] }
> = {
  teal: { label: 'Teal', dark: ['#2DD4BF', '#0F766E', '#042F2E'], light: ['#0D9488', '#115E59', '#FFFFFF'] },
  violet: { label: 'Violet', dark: ['#A78BFA', '#6D28D9', '#1E1B4B'], light: ['#7C3AED', '#5B21B6', '#FFFFFF'] },
  blue: { label: 'Blue', dark: ['#60A5FA', '#1D4ED8', '#0B1B3F'], light: ['#2563EB', '#1E40AF', '#FFFFFF'] },
  pink: { label: 'Pink', dark: ['#F472B6', '#BE185D', '#3B0A24'], light: ['#DB2777', '#9D174D', '#FFFFFF'] },
  orange: { label: 'Orange', dark: ['#FB923C', '#C2410C', '#3B1405'], light: ['#EA580C', '#9A3412', '#FFFFFF'] },
};

const cache = new Map<string, Colors>();

export function paletteFor(scheme: 'light' | 'dark', accent: AccentName): Colors {
  const key = `${scheme}:${accent}`;
  let c = cache.get(key);
  if (!c) {
    const [a, aDark, aText] = (ACCENTS[accent] ?? ACCENTS.teal)[scheme];
    c = { ...(scheme === 'dark' ? DARK : LIGHT), accent: a, accentDark: aDark, accentText: aText };
    cache.set(key, c);
  }
  return c;
}

export function resolveScheme(mode: ThemeMode, system: string | null | undefined): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'light' ? 'light' : 'dark';
}

/** The current colours, following the player's settings and the device's light/dark mode. */
export function useTheme(): Colors {
  const { theme, accent } = useProfile();
  const system = useColorScheme();
  return paletteFor(resolveScheme(theme, system), accent);
}

/**
 * Themed stylesheets: `const useStyles = makeStyles((c) => ({ ... }))`, then
 * `const styles = useStyles()` inside the component. One sheet per palette.
 */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T>>(factory: (c: Colors) => T) {
  const sheets = new Map<Colors, T>();
  return function useStyles(): T {
    const c = useTheme();
    let sheet = sheets.get(c);
    if (!sheet) {
      sheet = StyleSheet.create(factory(c));
      sheets.set(c, sheet);
    }
    return sheet;
  };
}

export const LUDO_COLORS = {
  red: '#E53935',
  green: '#43A047',
  yellow: '#FBC02D',
  blue: '#1E88E5',
} as const;

export const PLAYER_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316'];

export const radius = { sm: 10, md: 16, lg: 22 };

/** Content never stretches wider than this on tablets and desktop web. */
export const MAX_WIDTH = 1100;
