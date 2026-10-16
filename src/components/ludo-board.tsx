import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { HOME_COLUMN, TRACK, tokenPosition, YARD_ORIGIN } from '@/games/ludo/board';
import { COLOR_ORDER, LudoColor, LudoState, SAFE_SQUARES, START_OFFSET } from '@/games/ludo/engine';
import { LUDO_COLORS } from '@/ui/theme';

const GRID = 15;
const LIGHT: Record<LudoColor, string> = { red: '#FFCDD2', green: '#C8E6C9', yellow: '#FFF59D', blue: '#BBDEFB' };

/**
 * Ludo board. Tokens that can move are highlighted and call `onMoveToken`
 * when tapped (only when it's one of this device's players' turn).
 */
export function LudoBoard({
  state,
  size,
  canMove,
  onMoveToken,
}: {
  state: LudoState;
  size: number;
  canMove: boolean;
  onMoveToken: (token: number) => void;
}) {
  const cell = size / GRID;
  const inPlay = new Set(state.colors);

  // Tokens sharing a square are fanned out so each stays tappable.
  const stacks = new Map<string, number>();
  const tokens = state.tokens.flatMap((list, seat) =>
    list.map((progress, token) => {
      const [r, c] = tokenPosition(state.colors[seat], progress, token);
      const key = `${r},${c}`;
      const index = stacks.get(key) ?? 0;
      stacks.set(key, index + 1);
      return { seat, token, r, c, index };
    }),
  );
  const stackSize = (r: number, c: number) => stacks.get(`${r},${c}`) ?? 1;

  return (
    <View style={{ width: size, height: size }} accessibilityLabel="Ludo board">
      <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
        <Rect x={0} y={0} width={GRID} height={GRID} rx={0.4} fill="#FAFAF7" />

        {COLOR_ORDER.map((color) => {
          const [r, c] = YARD_ORIGIN[color];
          const fill = inPlay.has(color) ? LUDO_COLORS[color] : '#CBD5E1';
          return (
            <G key={color}>
              <Rect x={c} y={r} width={6} height={6} fill={fill} />
              <Rect x={c + 0.8} y={r + 0.8} width={4.4} height={4.4} rx={0.5} fill="#fff" />
            </G>
          );
        })}

        {TRACK.map(([r, c], i) => {
          const startOf = COLOR_ORDER.find((col) => START_OFFSET[col] === i);
          return (
            <G key={`t${i}`}>
              <Rect
                x={c}
                y={r}
                width={1}
                height={1}
                fill={startOf ? LUDO_COLORS[startOf] : '#fff'}
                stroke="#94A3B8"
                strokeWidth={0.03}
              />
              {SAFE_SQUARES.has(i) && !startOf ? (
                <SvgText x={c + 0.5} y={r + 0.78} fontSize={0.75} textAnchor="middle" fill="#94A3B8">
                  ★
                </SvgText>
              ) : null}
            </G>
          );
        })}

        {COLOR_ORDER.map((color) =>
          HOME_COLUMN[color].map(([r, c], i) => (
            <Rect
              key={`${color}${i}`}
              x={c}
              y={r}
              width={1}
              height={1}
              fill={LUDO_COLORS[color]}
              stroke="#94A3B8"
              strokeWidth={0.03}
            />
          )),
        )}

        {/* Centre: each colour's home triangle points at the middle. */}
        <Polygon points="6,9 9,9 7.5,7.5" fill={LUDO_COLORS.red} />
        <Polygon points="6,6 6,9 7.5,7.5" fill={LUDO_COLORS.green} />
        <Polygon points="6,6 9,6 7.5,7.5" fill={LUDO_COLORS.yellow} />
        <Polygon points="9,6 9,9 7.5,7.5" fill={LUDO_COLORS.blue} />

        {/* Faint yard spots under the tokens. */}
        {COLOR_ORDER.map((color) =>
          [0, 1, 2, 3].map((t) => {
            const [r, c] = tokenPosition(color, -1, t);
            return (
              <Rect
                key={`${color}-spot${t}`}
                x={c - 0.55}
                y={r - 0.55}
                width={1.1}
                height={1.1}
                rx={0.55}
                fill={inPlay.has(color) ? LIGHT[color] : '#E2E8F0'}
              />
            );
          }),
        )}
      </Svg>

      {tokens.map(({ seat, token, r, c, index }) => {
        const movable = canMove && seat === state.turn && state.phase === 'move' && state.movable.includes(token);
        const n = stackSize(r, c);
        const shrink = n > 1 ? 0.75 : 1;
        const offset = n > 1 ? (index - (n - 1) / 2) * cell * 0.28 : 0;
        return (
          <Token
            key={`${seat}-${token}`}
            x={c * cell + offset}
            y={r * cell - Math.abs(offset) * 0.3}
            size={cell * 0.78 * shrink}
            color={LUDO_COLORS[state.colors[seat]]}
            highlighted={movable}
            onPress={movable ? () => onMoveToken(token) : undefined}
            label={`${state.seats[seat].name} token ${token + 1}`}
          />
        );
      })}
    </View>
  );
}

function Token({
  x,
  y,
  size,
  color,
  highlighted,
  onPress,
  label,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  highlighted: boolean;
  onPress?: () => void;
  label: string;
}) {
  const [pos] = useState(() => new Animated.ValueXY({ x, y }));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(pos, { toValue: { x, y }, duration: 280, useNativeDriver: false }).start();
  }, [x, y, pos]);

  useEffect(() => {
    if (!highlighted) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 500, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [highlighted, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <Animated.View
      style={[
        styles.tokenWrap,
        {
          width: size,
          height: size,
          // Position is the cell centre; shift by half the token.
          transform: [
            { translateX: Animated.subtract(pos.x, size / 2) },
            { translateY: Animated.subtract(pos.y, size / 2) },
            { scale },
          ],
          zIndex: highlighted ? 10 : 1,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        hitSlop={8}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `Move ${label}` : label}
        style={[
          styles.token,
          {
            borderRadius: size / 2,
            backgroundColor: color,
            borderColor: highlighted ? '#111827' : '#fff',
            borderWidth: highlighted ? 3 : 2,
          },
        ]}
      >
        <View style={[styles.tokenInner, { borderRadius: size }]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tokenWrap: { position: 'absolute', left: 0, top: 0 },
  token: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tokenInner: { width: '40%', height: '40%', backgroundColor: 'rgba(255,255,255,0.55)' },
});
