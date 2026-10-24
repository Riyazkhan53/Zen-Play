import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { CinzelDecorative_700Bold } from '@expo-google-fonts/cinzel-decorative';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useStats } from '@/lib/stats';
import { useTheme } from '@/ui/theme';

export default function RootLayout() {
  // Load saved stats early so the dashboard has them on first paint.
  useStats();
  // Fonts for the themed card backs; cards fall back to the system font until loaded.
  useFonts({ CinzelDecorative_700Bold, BebasNeue_400Regular });
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
