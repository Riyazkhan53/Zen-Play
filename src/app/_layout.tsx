import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useStats } from '@/lib/stats';
import { useTheme } from '@/ui/theme';

export default function RootLayout() {
  // Load saved stats early so the dashboard has them on first paint.
  useStats();
  const colors = useTheme();
  const base = colors.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: colors.bg, card: colors.surface, primary: colors.accent, text: colors.text },
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </ThemeProvider>
  );
}
