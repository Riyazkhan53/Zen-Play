import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { QuickPlay } from '@/components/quick-play';
import { Button, Input, Screen } from '@/components/ui';
import { GAMES, gameMeta, GameMeta } from '@/games/registry';
import { setName, useProfile } from '@/lib/profile';
import { timeAgo, useStats } from '@/lib/stats';
import { lanSupported } from '@/net/lan';
import { joinOnline } from '@/net/session';
import { makeStyles, radius, useTheme } from '@/ui/theme';

function greeting(hour = new Date().getHours()) {
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const styles = useStyles();
  const colors = useTheme();
  const profile = useProfile();
  const stats = useStats();
  const { width } = useWindowDimensions();
  const [code, setCode] = useState('');
  const [draftName, setDraftName] = useState('');
  const wide = width >= 760;
  const columns = width >= 600 ? 3 : 2;
  const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const favourite = Object.entries(stats.byGame).sort((a, b) => (b[1]?.played ?? 0) - (a[1]?.played ?? 0))[0];

  const join = () => {
    joinOnline(code);
    router.push('/room');
  };

  const side = (
    <View style={[styles.side, wide && styles.sideWide]}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Join friends</Text>
        <View style={styles.row}>
          <Input
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="Room code"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
            style={styles.rowInput}
            accessibilityLabel="Room code"
          />
          <Button title="Join" onPress={join} disabled={code.trim().length < 5} />
        </View>
        {lanSupported ? (
          <Pressable style={styles.scan} onPress={() => router.push('/scan')} accessibilityRole="button">
            <Ionicons name="qr-code-outline" size={18} color={colors.accent} />
            <Text style={styles.scanText}>Scan a Wi-Fi game&apos;s QR code</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Recent games</Text>
        {stats.recent.length === 0 ? (
          <Text style={styles.empty}>Your finished games will show up here.</Text>
        ) : (
          stats.recent.slice(0, wide ? 8 : 4).map((r, i) => {
            const meta = gameMeta(r.gameId);
            return (
              <View key={i} style={styles.recent}>
                <Text style={styles.recentEmoji}>{meta?.emoji}</Text>
                <View style={styles.flex}>
                  <Text style={styles.recentName}>{meta?.name}</Text>
                  <Text style={styles.recentMeta}>
                    {r.players} players · {r.mode === 'online' ? 'online' : r.mode === 'lan' ? 'Wi-Fi' : 'this device'}{' '}
                    · {timeAgo(r.at)}
                  </Text>
                </View>
                <Text style={[styles.result, r.won ? styles.won : r.draw ? styles.drawn : styles.lost]}>
                  {r.won ? 'Won' : r.draw ? 'Draw' : 'Lost'}
                </Text>
              </View>
            );
          })
        )}
        {favourite ? (
          <Text style={styles.favourite}>
            Favourite: {gameMeta(favourite[0])?.emoji} {gameMeta(favourite[0])?.name} ({favourite[1]?.played} played)
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.accentText }]}>
              {(profile.name.trim() || 'Z').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.hello}>{greeting()},</Text>
            <Text style={styles.name} numberOfLines={1}>
              {profile.name.trim() || 'Player'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <Stat label="Games" value={String(stats.played)} icon="game-controller" />
          <Stat label="Wins" value={String(stats.wins)} icon="trophy" />
          <Stat label="Win rate" value={`${winRate}%`} icon="trending-up" />
        </View>

        {!profile.name.trim() ? (
          <View style={[styles.panel, styles.welcome]}>
            <Text style={styles.panelTitle}>Welcome to Zen-Play 👋</Text>
            <Text style={styles.empty}>What should your friends call you?</Text>
            <View style={styles.row}>
              <Input
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Your name"
                maxLength={20}
                style={styles.rowInput}
                onSubmitEditing={() => setName(draftName)}
                accessibilityLabel="Your name"
              />
              <Button title="Save" onPress={() => setName(draftName)} disabled={!draftName.trim()} />
            </View>
          </View>
        ) : null}

        <QuickPlay />

        <View style={[styles.body, wide && styles.bodyWide]}>
          <View style={styles.main}>
            <Text style={styles.sectionTitle}>Play</Text>
            <View style={styles.grid}>
              {GAMES.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  played={stats.byGame[game.id]?.played ?? 0}
                  width={`${100 / columns - 2}%`}
                />
              ))}
            </View>
          </View>
          {side}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function GameCard({ game, played, width }: { game: GameMeta; played: number; width: `${number}%` }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => game.available && router.push({ pathname: '/game/[id]', params: { id: game.id } })}
      disabled={!game.available}
      accessibilityRole="button"
      accessibilityLabel={`${game.name}${game.available ? '' : ', coming soon'}`}
      style={({ pressed }) => [styles.cardWrap, { width }, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={game.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, !game.available && styles.cardSoon]}
      >
        <View style={styles.cardShine} />
        <Text style={styles.emoji}>{game.emoji}</Text>
        {!game.available ? (
          <Text style={styles.badge}>Coming soon</Text>
        ) : played ? (
          <Text style={styles.badge}>{played} played</Text>
        ) : null}
        <Text style={styles.cardTitle}>{game.name}</Text>
        <Text style={styles.cardTagline} numberOfLines={2}>
          {game.tagline}
        </Text>
        <Text style={styles.players}>{game.players}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  scroll: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 22, paddingBottom: 18 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '900' },
  hello: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  name: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  welcome: { marginBottom: 16 },
  body: { gap: 18 },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { flex: 1, gap: 12 },
  side: { gap: 14 },
  sideWide: { width: 340 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  stat: {
    flex: 1,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 4 },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  panel: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  panelTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1, minWidth: 0 },
  scan: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  scanText: { color: colors.accent, fontWeight: '700' },
  empty: { color: colors.muted, fontSize: 14 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  recentEmoji: { fontSize: 24 },
  recentName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  recentMeta: { color: colors.muted, fontSize: 12 },
  result: {
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  won: { color: '#065F46', backgroundColor: '#A7F3D0' },
  lost: { color: colors.muted, backgroundColor: colors.surfaceAlt },
  drawn: { color: '#92400E', backgroundColor: '#FDE68A' },
  favourite: { color: colors.muted, fontSize: 12, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  cardWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  card: { flex: 1, minHeight: 176, padding: 16, borderRadius: radius.lg, overflow: 'hidden' },
  cardShine: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cardSoon: { opacity: 0.5 },
  emoji: { fontSize: 36 },
  badge: {
    position: 'absolute',
    top: 14,
    right: 14,
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardTitle: { color: '#fff', fontSize: 19, fontWeight: '900', marginTop: 10 },
  cardTagline: { color: 'rgba(255,255,255,0.88)', fontSize: 13, marginTop: 4, lineHeight: 18 },
  players: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '800', marginTop: 'auto', paddingTop: 12 },
}));
