import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Input, Screen } from '@/components/ui';
import { GAMES, GameMeta } from '@/games/registry';
import { setName, useProfile } from '@/lib/profile';
import { colors, radius } from '@/ui/theme';

export default function Home() {
  const profile = useProfile();
  const { width } = useWindowDimensions();
  // Edits stay local until the field loses focus, then save to the profile.
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? profile.name;
  const save = () => {
    if (draft != null) setName(draft);
    setDraft(null);
  };

  const columns = width >= 600 ? 3 : 2;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.logo}>
            Zen<Text style={styles.logoAccent}>·</Text>Play
          </Text>
          <Text style={styles.tagline}>Play together — online, on the same Wi-Fi, or on one device.</Text>
        </View>

        <Text style={styles.label}>Your name</Text>
        <Input
          value={name}
          onChangeText={setDraft}
          onBlur={save}
          onSubmitEditing={save}
          placeholder="What should friends call you?"
          maxLength={20}
          returnKeyType="done"
          accessibilityLabel="Your name"
        />

        <Text style={[styles.label, styles.gamesLabel]}>Games</Text>
        <View style={styles.grid}>
          {GAMES.map((game) => (
            <GameCard key={game.id} game={game} width={`${100 / columns - 2}%`} />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function GameCard({ game, width }: { game: GameMeta; width: `${number}%` }) {
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
        <Text style={styles.emoji}>{game.emoji}</Text>
        {!game.available ? <Text style={styles.soon}>Coming soon</Text> : null}
        <Text style={styles.cardTitle}>{game.name}</Text>
        <Text style={styles.cardTagline} numberOfLines={2}>
          {game.tagline}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.players}>{game.players}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  hero: { paddingTop: 28, paddingBottom: 24 },
  logo: { color: colors.text, fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  logoAccent: { color: colors.accent },
  tagline: { color: colors.muted, fontSize: 16, marginTop: 6, lineHeight: 22 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 8, letterSpacing: 0.4 },
  gamesLabel: { marginTop: 28 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  cardWrap: { borderRadius: radius.lg, overflow: 'hidden' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  card: { minHeight: 170, padding: 16, borderRadius: radius.lg },
  cardSoon: { opacity: 0.45 },
  emoji: { fontSize: 34 },
  cardTitle: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 10 },
  cardTagline: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 12,
  },
  players: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  soon: {
    position: 'absolute',
    top: 14,
    right: 14,
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
