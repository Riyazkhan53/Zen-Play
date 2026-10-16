import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, radius } from '@/ui/theme';

/**
 * Which hand this device should show, for card games.
 * - One player on this device: always their own hand.
 * - Several players sharing it: the hand of whoever's turn it is, behind a
 *   "pass the device" curtain whenever a different person picks it up.
 */
export function useHandToShow(mySeats: number[], turn: number | null) {
  const [revealedSeat, setRevealedSeat] = useState<number | null>(null);
  if (mySeats.length === 1) return { seat: mySeats[0], covered: false, reveal: () => {} };
  if (turn == null || !mySeats.includes(turn)) return { seat: null, covered: false, reveal: () => {} };
  return { seat: turn, covered: revealedSeat !== turn, reveal: () => setRevealedSeat(turn) };
}

export function PassCurtain({ name, onReveal }: { name: string; onReveal: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.curtain}>
      <Text style={styles.emoji}>🙈</Text>
      <Text style={styles.title}>Pass the device to {name}</Text>
      <Text style={styles.text}>Everyone else, look away.</Text>
      <Button title={`I'm ${name} — show my cards`} onPress={onReveal} style={styles.button} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  curtain: {
    alignItems: 'center',
    gap: 6,
    padding: 22,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emoji: { fontSize: 36 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  text: { color: colors.muted, fontSize: 14 },
  button: { marginTop: 10, alignSelf: 'stretch' },
}));
