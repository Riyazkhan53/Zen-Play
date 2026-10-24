import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import type { PlayingCard } from '@/games/rummy/melds';

const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const RANK_NAME: Record<number, string> = { 1: 'ace', 11: 'jack', 12: 'queen', 13: 'king' };

export const rankLabel = (rank: number) => RANK[rank] ?? String(rank);
export const cardName = (c: PlayingCard) =>
  c.suit === 'J' ? 'joker' : `${RANK_NAME[c.rank] ?? c.rank} of ${SUIT_NAME[c.suit]}`;
export const shortName = (c: PlayingCard) => (c.suit === 'J' ? '🃏' : `${rankLabel(c.rank)}${SUIT[c.suit]}`);

const RED = '#D21F3C';
const BLACK = '#16181D';

/** Card back: deep indigo with a fine lattice and a gold frame. */
function CardBack({ width }: { width: number }) {
  const height = width * 1.4;
  const inset = width * 0.08;
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#3B2A8C', '#1E1656', '#120C38']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: width * 0.09 }]}
      />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="zp-back" width="8" height="8" patternUnits="userSpaceOnUse">
            <Path d="M0 4 L4 0 L8 4 L4 8 Z" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.8" />
          </Pattern>
        </Defs>
        <Rect
          x={inset}
          y={inset}
          width={width - inset * 2}
          height={height - inset * 2}
          rx={width * 0.05}
          fill="url(#zp-back)"
          stroke="#E8C66A"
          strokeOpacity={0.75}
          strokeWidth={Math.max(1, width * 0.025)}
        />
      </Svg>
      <View style={[styles.backEmblem, { width: width * 0.36, height: width * 0.36, borderRadius: width }]}>
        <Text style={[styles.backEmblemText, { fontSize: width * 0.2 }]} allowFontScaling={false}>
          Z
        </Text>
      </View>
    </View>
  );
}

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
  const ink = red ? RED : BLACK;
  const face = card && card.rank >= 11 && card.suit !== 'J';
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
        { width, height, borderRadius: width * 0.09 },
        back && styles.back,
        selected && styles.selected,
        selected && { transform: [{ translateY: -width * 0.28 }] },
      ]}
    >
      {back ? (
        <CardBack width={width} />
      ) : card!.suit === 'J' ? (
        <>
          <View style={[styles.corner, { top: width * 0.06, left: width * 0.08 }]}>
            <Text style={[styles.jokerIndex, { fontSize: width * 0.15, lineHeight: width * 0.16 }]} allowFontScaling={false}>
              {'J\nO\nK\nE\nR'}
            </Text>
          </View>
          <Text style={{ fontSize: width * 0.52, marginLeft: width * 0.18 }} allowFontScaling={false}>
            🃏
          </Text>
        </>
      ) : (
        <>
          <LinearGradient colors={['#FFFFFF', '#F3F4F7']} style={[StyleSheet.absoluteFill, { borderRadius: width * 0.09 }]} />
          <View style={[styles.corner, { top: width * 0.05, left: width * 0.07 }]}>
            <Text
              style={[styles.rank, { color: ink, fontSize: width * 0.32, lineHeight: width * 0.36 }]}
              allowFontScaling={false}
            >
              {rankLabel(card!.rank)}
            </Text>
            <Text
              style={[styles.suit, { color: ink, fontSize: width * 0.27, lineHeight: width * 0.3 }]}
              allowFontScaling={false}
            >
              {SUIT[card!.suit]}
            </Text>
          </View>
          {face ? (
            <View
              style={[
                styles.facePanel,
                {
                  right: width * 0.08,
                  bottom: width * 0.08,
                  width: width * 0.56,
                  height: width * 0.78,
                  borderRadius: width * 0.06,
                  borderColor: ink,
                  backgroundColor: red ? 'rgba(210,31,60,0.08)' : 'rgba(22,24,29,0.06)',
                },
              ]}
            >
              <Text style={[styles.faceLetter, { color: ink, fontSize: width * 0.36 }]} allowFontScaling={false}>
                {rankLabel(card!.rank)}
              </Text>
              <Text style={{ color: ink, fontSize: width * 0.22 }} allowFontScaling={false}>
                {SUIT[card!.suit]}
              </Text>
            </View>
          ) : (
            <Text
              style={[styles.pip, { color: ink, fontSize: width * 0.62, right: width * 0.08, bottom: width * 0.02 }]}
              allowFontScaling={false}
            >
              {SUIT[card!.suit]}
            </Text>
          )}
          {wild ? (
            <View style={[styles.wildBadge, { width: width * 0.32, height: width * 0.32, borderRadius: width, left: width * 0.07, bottom: width * 0.07 }]}>
              <Text style={[styles.wildText, { fontSize: width * 0.18 }]} allowFontScaling={false}>
                J
              </Text>
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: -1, height: 2 },
    elevation: 3,
  },
  back: { backgroundColor: '#1E1656', borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1, overflow: 'hidden' },
  backEmblem: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: '-18%',
    backgroundColor: 'rgba(232,198,106,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backEmblemText: { color: '#E8C66A', fontWeight: '900' },
  selected: {
    borderColor: '#FACC15',
    borderWidth: 2.5,
    shadowColor: '#FACC15',
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  corner: { position: 'absolute', alignItems: 'center' },
  rank: { fontWeight: '800', letterSpacing: -0.5 },
  suit: { marginTop: -1 },
  pip: { position: 'absolute' },
  facePanel: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  faceLetter: { fontWeight: '900', fontFamily: 'serif' },
  jokerIndex: { color: '#7C3AED', fontWeight: '900', textAlign: 'center' },
  // Bottom-left, so it stays visible when cards overlap in a fanned hand.
  wildBadge: {
    position: 'absolute',
    backgroundColor: '#7C3AED',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wildText: { color: '#fff', fontWeight: '900' },
});
