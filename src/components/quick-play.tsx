import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { GAMES, GameMeta } from '@/games/registry';
import type { Difficulty, GameId } from '@/games/types';
import { updateProfile, useProfile } from '@/lib/profile';
import { quickPlay } from '@/net/session';
import { makeStyles, radius, useTheme } from '@/ui/theme';

import { Button } from './ui';

/** Opponent counts offered per game (total players minus you), default first. */
const OPPONENTS: Record<GameId, number[]> = {
  chess: [1],
  carrom: [1, 3],
  ludo: [3, 1, 2],
  snakes: [3, 1, 2, 4, 5],
  uno: [3, 1, 2, 4, 5],
  rummy: [2, 1, 3, 4, 5],
};

const LEVELS: { level: Difficulty; label: string; text: string }[] = [
  { level: 'easy', label: 'Easy', text: 'Relaxed — makes plenty of mistakes.' },
  { level: 'medium', label: 'Medium', text: 'A fair game for most players.' },
  { level: 'hard', label: 'Hard', text: 'Plays its best move every time.' },
];

/** Home-screen strip: pick a game, a difficulty and how many computer players, then play. */
export function QuickPlay() {
  const styles = useStyles();
  const [game, setGame] = useState<GameMeta | null>(null);
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Quick play</Text>
        <Text style={styles.subtitle}>vs computer</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {GAMES.filter((g) => g.available).map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setGame(g)}
            accessibilityRole="button"
            accessibilityLabel={`Quick play ${g.name} against the computer`}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            <LinearGradient colors={g.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileFill}>
              <Text style={styles.tileEmoji}>{g.emoji}</Text>
              <Text style={styles.tileName} numberOfLines={1}>
                {g.name}
              </Text>
              <View style={styles.playBadge}>
                <Ionicons name="play" size={12} color="#fff" />
              </View>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>
      {game ? <QuickPlaySheet game={game} onClose={() => setGame(null)} /> : null}
    </View>
  );
}

function QuickPlaySheet({ game, onClose }: { game: GameMeta; onClose: () => void }) {
  const styles = useStyles();
  const colors = useTheme();
  const { quickDifficulty } = useProfile();
  const choices = OPPONENTS[game.id];
  const [bots, setBots] = useState(choices[0]);
  const luckOnly = game.id === 'snakes';

  const play = () => {
    quickPlay(game.id, {
      bots,
      difficulty: quickDifficulty,
      // Quick Rummy is a single points deal.
      options: game.id === 'rummy' ? { mode: 'points' } : undefined,
    });
    onClose();
    // The lobby forwards to the game as soon as it has started.
    router.push('/room');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHead}>
            <LinearGradient colors={game.colors} style={styles.sheetIcon}>
              <Text style={styles.sheetEmoji}>{game.emoji}</Text>
            </LinearGradient>
            <View style={styles.flex}>
              <Text style={styles.sheetTitle}>{game.name}</Text>
              <Text style={styles.sheetSub}>You against the computer</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>

          <Text style={styles.label}>Difficulty</Text>
          {luckOnly ? (
            <Text style={styles.hint}>
              Snakes &amp; Ladders is pure luck — every computer player rolls the same dice.
            </Text>
          ) : (
            <>
              <View style={styles.segment} accessibilityRole="radiogroup">
                {LEVELS.map(({ level, label }) => {
                  const on = quickDifficulty === level;
                  return (
                    <Pressable
                      key={level}
                      onPress={() => updateProfile({ quickDifficulty: level })}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      style={[styles.segmentItem, on && styles.segmentOn]}
                    >
                      <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>{LEVELS.find((l) => l.level === quickDifficulty)?.text}</Text>
            </>
          )}

          {choices.length > 1 ? (
            <>
              <Text style={styles.label}>Computer players</Text>
              <View style={styles.counts} accessibilityRole="radiogroup">
                {[...choices]
                  .sort((a, b) => a - b)
                  .map((n) => {
                    const on = bots === n;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setBots(n)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${n} computer player${n > 1 ? 's' : ''}`}
                        style={[styles.count, on && styles.segmentOn]}
                      >
                        <Text style={[styles.countText, on && styles.segmentTextOn]}>{n}</Text>
                      </Pressable>
                    );
                  })}
              </View>
            </>
          ) : null}

          <Button title="Play now" onPress={play} style={styles.playBtn} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  section: { gap: 10, marginBottom: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  strip: { gap: 10, paddingRight: 4 },
  tile: { width: 108, borderRadius: radius.md, overflow: 'hidden' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
  tileFill: { height: 96, padding: 10, justifyContent: 'space-between' },
  tileEmoji: { fontSize: 28 },
  tileName: { color: '#fff', fontSize: 13, fontWeight: '900' },
  playBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 10,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  sheetIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetEmoji: { fontSize: 26 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  sheetSub: { color: colors.muted, fontSize: 13 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: 6 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.accent },
  segmentText: { color: colors.muted, fontWeight: '800' },
  segmentTextOn: { color: colors.accentText },
  counts: { flexDirection: 'row', gap: 8 },
  count: {
    width: 48,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  countText: { color: colors.text, fontWeight: '900', fontSize: 16 },
  playBtn: { marginTop: 10 },
}));
