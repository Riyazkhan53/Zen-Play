import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PlayingCard } from '@/games/rummy/melds';

const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const RANK_NAME: Record<number, string> = { 1: 'ace', 11: 'jack', 12: 'queen', 13: 'king' };

export const rankLabel = (rank: number) => RANK[rank] ?? String(rank);
export const cardName = (c: PlayingCard) =>
  c.suit === 'J' ? 'joker' : `${RANK_NAME[c.rank] ?? c.rank} of ${SUIT_NAME[c.suit]}`;
export const shortName = (c: PlayingCard) => (c.suit === 'J' ? '🃏' : `${rankLabel(c.rank)}${SUIT[c.suit]}`);

/** A standard playing card (height 1.4 × width). `wild` adds a joker badge. */
export function PlayingCardView({
  card,
  width,
  faceDown,
  wild,
  selected,
  onPress,
  label,
}: {
  card?: PlayingCard;
  width: number;
  faceDown?: boolean;
  wild?: boolean;
  selected?: boolean;
  onPress?: () => void;
  label?: string;
}) {
  const height = width * 1.4;
  const back = faceDown || !card;
  const red = card && (card.suit === 'H' || card.suit === 'D');
  const ink = red ? '#C62828' : '#111827';
  // Non-interactive cards are plain Views: a disabled Pressable on the web still
  // lets its children catch taps, so decorative cards would block the table.
  const Container = (onPress ? Pressable : View) as typeof Pressable;

  return (
    <Container
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      accessibilityLabel={label ?? (back ? 'Card, face down' : `${cardName(card!)}${wild ? ', joker' : ''}`)}
      style={[
        styles.card,
        { width, height, borderRadius: width * 0.1 },
        back && styles.back,
        selected && styles.selected,
        selected && { transform: [{ translateY: -width * 0.25 }] },
      ]}
    >
      {back ? (
        <View style={[styles.backPattern, { borderRadius: width * 0.07 }]} />
      ) : card!.suit === 'J' ? (
        <>
          <Text style={[styles.jokerText, { fontSize: width * 0.2 }]}>JOKER</Text>
          <Text style={{ fontSize: width * 0.5 }}>🃏</Text>
        </>
      ) : (
        <>
          <View style={[styles.corner, { top: width * 0.05, left: width * 0.08 }]}>
            <Text style={[styles.rank, { color: ink, fontSize: width * 0.3 }]} allowFontScaling={false}>
              {rankLabel(card!.rank)}
            </Text>
            <Text style={[styles.suit, { color: ink, fontSize: width * 0.26 }]} allowFontScaling={false}>
              {SUIT[card!.suit]}
            </Text>
          </View>
          <Text style={[styles.pip, { color: ink, fontSize: width * 0.5 }]} allowFontScaling={false}>
            {SUIT[card!.suit]}
          </Text>
          {wild ? (
            <View style={[styles.wildBadge, { width: width * 0.34, height: width * 0.34, borderRadius: width }]}>
              <Text style={[styles.wildText, { fontSize: width * 0.2 }]}>J</Text>
            </View>
          ) : null}
        </>
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  back: { backgroundColor: '#1E3A8A', borderColor: '#fff', borderWidth: 2 },
  backPattern: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    right: '10%',
    bottom: '10%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#2563EB',
  },
  selected: { borderColor: '#2DD4BF', borderWidth: 3 },
  corner: { position: 'absolute', alignItems: 'center' },
  rank: { fontWeight: '800', lineHeight: undefined },
  suit: { marginTop: -4 },
  pip: { marginTop: '30%' },
  jokerText: { color: '#7C3AED', fontWeight: '900', letterSpacing: 1 },
  // Bottom-left, so it stays visible when cards overlap in a fanned hand.
  wildBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wildText: { color: '#fff', fontWeight: '900' },
});
