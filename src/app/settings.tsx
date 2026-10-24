import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CardStylePicker } from '@/components/card-style-picker';
import { Button, Input, Screen, TopBar } from '@/components/ui';
import { PieceStylePicker } from '@/game-ui/chess';
import { AccentName, ThemeMode, updateProfile, useProfile } from '@/lib/profile';
import { resetStats, useStats } from '@/lib/stats';
import { ACCENTS, makeStyles, paletteFor, radius, useTheme } from '@/ui/theme';

const THEMES: { mode: ThemeMode; label: string; icon: 'phone-portrait-outline' | 'sunny-outline' | 'moon-outline' }[] =
  [
    { mode: 'system', label: 'System', icon: 'phone-portrait-outline' },
    { mode: 'light', label: 'Light', icon: 'sunny-outline' },
    { mode: 'dark', label: 'Dark', icon: 'moon-outline' },
  ];

export default function Settings() {
  const styles = useStyles();
  const colors = useTheme();
  const profile = useProfile();
  const stats = useStats();
  // Name edits stay local until saved.
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? profile.name;
  const dirty = draft != null && draft.trim() !== profile.name;
  const [confirmReset, setConfirmReset] = useState(false);

  const saveName = () => {
    if (draft != null) updateProfile({ name: draft.trim().slice(0, 20) });
    setDraft(null);
  };

  return (
    <Screen>
      <TopBar title="Settings" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
              <Text style={[styles.avatarText, { color: colors.accentText }]}>
                {(name.trim() || 'Z').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.row}>
                <Input
                  value={name}
                  onChangeText={setDraft}
                  onSubmitEditing={saveName}
                  placeholder="What friends see"
                  maxLength={20}
                  style={styles.rowInput}
                  accessibilityLabel="Username"
                />
                <Button title="Save" onPress={saveName} disabled={!dirty || !name.trim()} />
              </View>
            </View>
          </View>
          <Text style={styles.hint}>Shown to other players in rooms and on the table.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {THEMES.map((t) => {
              const on = profile.theme === t.mode;
              return (
                <Pressable
                  key={t.mode}
                  onPress={() => updateProfile({ theme: t.mode })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[styles.segmentItem, on && styles.segmentOn]}
                >
                  <Ionicons name={t.icon} size={18} color={on ? colors.accentText : colors.muted} />
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, styles.accentLabel]}>Accent colour</Text>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {(Object.keys(ACCENTS) as AccentName[]).map((a) => {
              const on = profile.accent === a;
              const swatch = paletteFor(colors.scheme, a).accent;
              return (
                <Pressable
                  key={a}
                  onPress={() => updateProfile({ accent: a })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={ACCENTS[a].label}
                  style={styles.swatchWrap}
                >
                  <View style={[styles.swatch, { backgroundColor: swatch }, on && { borderColor: colors.text }]}>
                    {on ? (
                      <Ionicons name="checkmark" size={20} color={paletteFor(colors.scheme, a).accentText} />
                    ) : null}
                  </View>
                  <Text style={styles.swatchLabel}>{ACCENTS[a].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chess pieces</Text>
          <PieceStylePicker />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playing cards</Text>
          <CardStylePicker />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistics</Text>
          <Text style={styles.hint}>
            {stats.played} games played · {stats.wins} won. Kept on this device only.
          </Text>
          {confirmReset ? (
            <View style={styles.row}>
              <Button
                title="Yes, reset"
                variant="danger"
                onPress={() => {
                  resetStats();
                  setConfirmReset(false);
                }}
                style={styles.flex}
              />
              <Button title="Cancel" variant="secondary" onPress={() => setConfirmReset(false)} style={styles.flex} />
            </View>
          ) : (
            <Button
              title="Reset statistics"
              variant="ghost"
              onPress={() => setConfirmReset(true)}
              disabled={stats.played === 0}
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.hint}>
            Zen-Play {Constants.expoConfig?.version ?? ''} · Ludo, Snakes & Ladders, Chess, Carrom, UNO and Rummy —
            online, on the same Wi-Fi, or on one device.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  scroll: { paddingBottom: 40, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
  section: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '900' },
  row: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1, minWidth: 0 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  segmentOn: { backgroundColor: colors.accent },
  segmentText: { color: colors.muted, fontWeight: '800' },
  segmentTextOn: { color: colors.accentText },
  accentLabel: { marginTop: 6 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  swatchWrap: { alignItems: 'center', gap: 6 },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
}));
