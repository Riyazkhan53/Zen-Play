import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UnoCard, UnoColor } from '@/games/uno/engine';

export const UNO_HEX: Record<UnoColor, string> = {
  red: '#E53935',
  yellow: '#FBC02D',
  green: '#43A047',
  blue: '#1E88E5',
};

const LABEL: Record<string, string> = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: 'W', wild4: '+4' };
const NAME: Record<string, string> = {
  skip: 'skip',
  reverse: 'reverse',
  draw2: 'draw two',
  wild: 'wild',
  wild4: 'wild draw four',
};

export const unoCardName = (c: UnoCard) => `${c.color === 'wild' ? '' : `${c.color} `}${NAME[c.value] ?? c.value}`;

/** One UNO card, face up or face down. Height is 1.5 × width. */
export function UnoCardView({
  card,
  width,
  faceDown,
  dimmed,
  raised,
  onPress,
}: {
  card?: UnoCard;
  width: number;
  faceDown?: boolean;
  dimmed?: boolean;
  raised?: boolean;
  onPress?: () => void;
}) {
  const height = width * 1.5;
  const back = faceDown || !card;
  const bg = back ? '#111827' : card.color === 'wild' ? '#111827' : UNO_HEX[card.color];
  const label = card ? (LABEL[card.value] ?? card.value) : '';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={back ? 'UNO card, face down' : onPress ? `Play ${unoCardName(card!)}` : unoCardName(card!)}
      style={[
        styles.card,
        { width, height, borderRadius: width * 0.12, backgroundColor: bg, borderWidth: Math.max(2, width * 0.06) },
        dimmed && styles.dimmed,
        raised && { transform: [{ translateY: -width * 0.18 }] },
      ]}
    >
      {back ? (
        <View style={[styles.oval, { width: width * 0.78, height: height * 0.62, borderRadius: width }]}>
          <Text style={[styles.backText, { fontSize: width * 0.26 }]}>UNO</Text>
        </View>
      ) : (
        <>
          {card!.color === 'wild' ? (
            <View style={[styles.wildRing, { width: width * 0.72, height: width * 0.72, borderRadius: width }]}>
              {(['red', 'yellow', 'green', 'blue'] as UnoColor[]).map((c) => (
                <View key={c} style={[styles.quarter, { backgroundColor: UNO_HEX[c] }]} />
              ))}
            </View>
          ) : (
            <View
              style={[styles.oval, styles.faceOval, { width: width * 0.8, height: height * 0.6, borderRadius: width }]}
            />
          )}
          <Text
            style={[
              styles.value,
              {
                fontSize: width * (label.length > 1 ? 0.36 : 0.48),
                color: card!.color === 'wild' ? '#fff' : UNO_HEX[card!.color as UnoColor],
              },
            ]}
            allowFontScaling={false}
          >
            {label}
          </Text>
          <Text
            style={[styles.corner, { fontSize: width * 0.18, top: width * 0.06, left: width * 0.09 }]}
            allowFontScaling={false}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  dimmed: { opacity: 0.45 },
  oval: {
    position: 'absolute',
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-28deg' }],
  },
  faceOval: { backgroundColor: '#fff' },
  backText: { color: '#FBC02D', fontWeight: '900', fontStyle: 'italic', transform: [{ rotate: '28deg' }] },
  wildRing: {
    position: 'absolute',
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    transform: [{ rotate: '45deg' }],
  },
  quarter: { width: '50%', height: '50%' },
  value: {
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 2,
    textShadowOffset: { width: 1, height: 1 },
  },
  corner: { position: 'absolute', color: '#fff', fontWeight: '900' },
});
