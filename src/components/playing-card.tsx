import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';

import type { PlayingCard } from '@/games/rummy/melds';
import { CardBack as BackDesign, CardFace, useProfile } from '@/lib/profile';

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

// ---------- Backs ----------

interface BackLook {
  colors: [string, string, string];
  line: string;
  frame: string;
  emblemBg: string;
  emblemInk: string;
  font?: string;
  /** Drawn in the card's pattern tile (8×8). */
  motif: 'diamond' | 'stars' | 'carbon' | 'rays';
  mark: string;
}

const BACKS: Record<BackDesign, BackLook> = {
  gold: {
    colors: ['#F7E08A', '#C9A227', '#7A5A0C'],
    line: 'rgba(90,60,0,0.28)',
    frame: '#5C4306',
    emblemBg: 'rgba(60,40,0,0.2)',
    emblemInk: '#3D2C03',
    motif: 'diamond',
    mark: 'Z',
  },
  black: {
    colors: ['#34343A', '#141416', '#000000'],
    line: 'rgba(255,255,255,0.07)',
    frame: '#C8C8D0',
    emblemBg: 'rgba(255,255,255,0.08)',
    emblemInk: '#E5E5EA',
    motif: 'carbon',
    mark: 'Z',
  },
  // Wizard school look: burgundy night sky, gold stars, decorative serif.
  wizard: {
    colors: ['#5B1022', '#2D0B30', '#0D0A2B'],
    line: 'rgba(250,215,120,0.45)',
    frame: '#E3B95A',
    emblemBg: 'rgba(227,185,90,0.15)',
    emblemInk: '#F2CE72',
    font: 'CinzelDecorative_700Bold',
    motif: 'stars',
    mark: 'Z',
  },
  // Superhero look: metallic red, sunburst, bold condensed lettering.
  hero: {
    colors: ['#E11D2E', '#8E0E1B', '#1C1C22'],
    line: 'rgba(255,214,90,0.22)',
    frame: '#FFD65A',
    emblemBg: 'rgba(20,20,30,0.55)',
    emblemInk: '#FFD65A',
    font: 'BebasNeue_400Regular',
    motif: 'rays',
    mark: 'Z',
  },
};

function Motif({ kind, color }: { kind: BackLook['motif']; color: string }) {
  switch (kind) {
    case 'stars':
      return (
        <>
          <Circle cx="2" cy="2" r="0.7" fill={color} />
          <Circle cx="6" cy="5" r="0.45" fill={color} />
          <Circle cx="4" cy="7.2" r="0.3" fill={color} />
        </>
      );
    case 'carbon':
      return <Path d="M0 0 L4 0 L4 4 L0 4 Z M4 4 L8 4 L8 8 L4 8 Z" fill={color} />;
    case 'rays':
      return <Path d="M0 8 L8 0 M-2 2 L2 -2 M6 10 L10 6" stroke={color} strokeWidth="1.2" />;
    default:
      return <Path d="M0 4 L4 0 L8 4 L4 8 Z" fill="none" stroke={color} strokeWidth="0.8" />;
  }
}

export function CardBackView({ width, design }: { width: number; design: BackDesign }) {
  const height = width * 1.4;
  const inset = width * 0.08;
  const b = BACKS[design] ?? BACKS.gold;
  const id = `zp-back-${design}`;
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={b.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: width * 0.09 }]}
      />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
            <Motif kind={b.motif} color={b.line} />
          </Pattern>
        </Defs>
        <Rect
          x={inset}
          y={inset}
          width={width - inset * 2}
          height={height - inset * 2}
          rx={width * 0.05}
          fill={`url(#${id})`}
          stroke={b.frame}
          strokeOpacity={0.85}
          strokeWidth={Math.max(1, width * 0.025)}
        />
        {design === 'wizard' ? (
          // A lightning bolt across the middle.
          <Path
            d={`M${width * 0.56} ${height * 0.18} L${width * 0.36} ${height * 0.52} L${width * 0.52} ${height * 0.52} L${width * 0.42} ${height * 0.84} L${width * 0.68} ${height * 0.44} L${width * 0.52} ${height * 0.44} Z`}
            fill="rgba(242,206,114,0.22)"
          />
        ) : null}
      </Svg>
      <View
        style={[
          styles.backEmblem,
          {
            width: width * 0.42,
            height: width * 0.42,
            borderRadius: design === 'hero' ? width * 0.08 : width,
            backgroundColor: b.emblemBg,
            borderColor: b.frame,
          },
        ]}
      >
        <Text
          style={[styles.backEmblemText, { color: b.emblemInk, fontSize: width * 0.24, fontFamily: b.font }]}
          allowFontScaling={false}
        >
          {b.mark}
        </Text>
      </View>
    </View>
  );
}

// ---------- Faces ----------

const FACE_FILL: Record<CardFace, [string, string, ...string[]]> = {
  classic: ['#FFFFFF', '#F3F4F7'],
  glass: ['rgba(255,255,255,0.92)', 'rgba(232,240,255,0.62)', 'rgba(210,225,255,0.5)'],
  '3d': ['#FFFFFF', '#EEF0F4', '#D3D8E2'],
};

/** A standard playing card (height 1.4 × width). `wild` adds a joker badge. */
export function PlayingCardView({
  card,
  width,
  faceDown,
  wild,
  selected,
  onPress,
  label,
  face: faceOverride,
  back: backOverride,
}: {
  card?: PlayingCard;
  width: number;
  faceDown?: boolean;
  wild?: boolean;
  selected?: boolean;
  onPress?: () => void;
  label?: string;
  /** Override the player's chosen designs (previews in Settings). */
  face?: CardFace;
  back?: BackDesign;
}) {
  const profile = useProfile();
  const face = faceOverride ?? profile.cardFace ?? 'classic';
  const backDesign = backOverride ?? profile.cardBack ?? 'gold';
  const height = width * 1.4;
  const back = faceDown || !card;
  const red = card && (card.suit === 'H' || card.suit === 'D');
  const ink = red ? RED : BLACK;
  const courtCard = card && card.rank >= 11 && card.suit !== 'J';
  const r = width * 0.09;
  // Embossed ink on the 3D face.
  const emboss = face === '3d' ? styles.emboss : null;
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
        { width, height, borderRadius: r },
        !back && face === 'glass' && styles.glassCard,
        !back && face === '3d' && styles.solidCard,
        back && styles.back,
        selected && styles.selected,
        selected && { transform: [{ translateY: -width * 0.28 }] },
      ]}
    >
      {back ? (
        <CardBackView width={width} design={backDesign} />
      ) : (
        <>
          <LinearGradient
            colors={FACE_FILL[face]}
            start={{ x: 0, y: 0 }}
            end={{ x: face === 'glass' ? 1 : 0.4, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: r }]}
          />
          {face === 'glass' ? (
            // Diagonal light streak across the glass.
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.15 }}
              end={{ x: 1, y: 0.55 }}
              style={[StyleSheet.absoluteFill, { borderRadius: r, opacity: 0.6 }]}
            />
          ) : null}
          {card!.suit === 'J' ? (
            <>
              <View style={[styles.corner, { top: width * 0.06, left: width * 0.08 }]}>
                <Text
                  style={[styles.jokerIndex, { fontSize: width * 0.15, lineHeight: width * 0.16 }]}
                  allowFontScaling={false}
                >
                  {'J\nO\nK\nE\nR'}
                </Text>
              </View>
              <Text style={{ fontSize: width * 0.52, marginLeft: width * 0.18 }} allowFontScaling={false}>
                🃏
              </Text>
            </>
          ) : (
            <>
              <View style={[styles.corner, { top: width * 0.05, left: width * 0.07 }]}>
                <Text
                  style={[styles.rank, emboss, { color: ink, fontSize: width * 0.32, lineHeight: width * 0.36 }]}
                  allowFontScaling={false}
                >
                  {rankLabel(card!.rank)}
                </Text>
                <Text
                  style={[styles.suit, emboss, { color: ink, fontSize: width * 0.27, lineHeight: width * 0.3 }]}
                  allowFontScaling={false}
                >
                  {SUIT[card!.suit]}
                </Text>
              </View>
              {courtCard ? (
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
                  <Text
                    style={[styles.faceLetter, emboss, { color: ink, fontSize: width * 0.36 }]}
                    allowFontScaling={false}
                  >
                    {rankLabel(card!.rank)}
                  </Text>
                  <Text style={{ color: ink, fontSize: width * 0.22 }} allowFontScaling={false}>
                    {SUIT[card!.suit]}
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    styles.pip,
                    emboss,
                    { color: ink, fontSize: width * 0.62, right: width * 0.08, bottom: width * 0.02 },
                  ]}
                  allowFontScaling={false}
                >
                  {SUIT[card!.suit]}
                </Text>
              )}
              {wild ? (
                <View
                  style={[
                    styles.wildBadge,
                    {
                      width: width * 0.32,
                      height: width * 0.32,
                      borderRadius: width,
                      left: width * 0.07,
                      bottom: width * 0.07,
                    },
                  ]}
                >
                  <Text style={[styles.wildText, { fontSize: width * 0.18 }]} allowFontScaling={false}>
                    J
                  </Text>
                </View>
              ) : null}
            </>
          )}
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
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#7DD3FC',
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  // Card thickness: a darker lower-right edge and a deeper shadow.
  solidCard: {
    borderWidth: 0,
    borderRightWidth: 2,
    borderBottomWidth: 3,
    borderColor: '#A9B0BE',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: -2, height: 4 },
  },
  emboss: {
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowOffset: { width: 0.6, height: 0.8 },
    textShadowRadius: 0.5,
  },
  back: { backgroundColor: '#111', borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1, overflow: 'hidden' },
  backEmblem: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: '-21%',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backEmblemText: { fontWeight: '900' },
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
