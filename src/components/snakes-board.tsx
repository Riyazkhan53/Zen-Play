import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { LADDERS, SNAKES, SnakesState } from '@/games/snakes/engine';
import { PLAYER_COLORS } from '@/ui/theme';

const N = 10;
const SNAKE_COLORS = ['#16A34A', '#DC2626', '#7C3AED', '#0891B2', '#EA580C'];

/** Centre of square 1..100 in board units (0..10), snaking from bottom-left. */
export function squareCenter(square: number): [number, number] {
  const idx = square - 1;
  const rowFromBottom = Math.floor(idx / N);
  const col = rowFromBottom % 2 === 0 ? idx % N : N - 1 - (idx % N);
  return [col + 0.5, N - 1 - rowFromBottom + 0.5];
}

function ladderShape(from: number, to: number, key: string) {
  const [x1, y1] = squareCenter(from);
  const [x2, y2] = squareCenter(to);
  const len = Math.hypot(x2 - x1, y2 - y1);
  // Rails sit either side of the centre line.
  const nx = (-(y2 - y1) / len) * 0.18;
  const ny = ((x2 - x1) / len) * 0.18;
  const rungs = Math.max(2, Math.round(len / 0.45));
  return (
    <G key={key}>
      {Array.from({ length: rungs - 1 }, (_, i) => {
        const t = (i + 1) / rungs;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        return <Line key={i} x1={x + nx} y1={y + ny} x2={x - nx} y2={y - ny} stroke="#92400E" strokeWidth={0.07} />;
      })}
      <Line
        x1={x1 + nx}
        y1={y1 + ny}
        x2={x2 + nx}
        y2={y2 + ny}
        stroke="#B45309"
        strokeWidth={0.1}
        strokeLinecap="round"
      />
      <Line
        x1={x1 - nx}
        y1={y1 - ny}
        x2={x2 - nx}
        y2={y2 - ny}
        stroke="#B45309"
        strokeWidth={0.1}
        strokeLinecap="round"
      />
    </G>
  );
}

function snakeShape(head: number, tail: number, color: string, key: string) {
  const [hx, hy] = squareCenter(head);
  const [tx, ty] = squareCenter(tail);
  const dx = tx - hx;
  const dy = ty - hy;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const wiggle = Math.min(0.9, len * 0.18);
  // An S-curve from head to tail.
  const c1 = [hx + dx * 0.33 + nx * wiggle, hy + dy * 0.33 + ny * wiggle];
  const c2 = [hx + dx * 0.66 - nx * wiggle, hy + dy * 0.66 - ny * wiggle];
  const d = `M ${hx} ${hy} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${tx} ${ty}`;
  return (
    <G key={key}>
      <Path d={d} stroke="rgba(0,0,0,0.25)" strokeWidth={0.32} fill="none" strokeLinecap="round" />
      <Path d={d} stroke={color} strokeWidth={0.24} fill="none" strokeLinecap="round" />
      <Path d={d} stroke="rgba(255,255,255,0.35)" strokeWidth={0.06} strokeDasharray="0.12 0.18" fill="none" />
      <Circle cx={hx} cy={hy} r={0.24} fill={color} />
      <Circle cx={hx - 0.08} cy={hy - 0.06} r={0.05} fill="#fff" />
      <Circle cx={hx + 0.08} cy={hy - 0.06} r={0.05} fill="#fff" />
    </G>
  );
}

export function SnakesBoard({ state, size }: { state: SnakesState; size: number }) {
  const cell = size / N;
  const squares = Array.from({ length: 100 }, (_, i) => i + 1);

  // Spread players who share a square.
  const counts = new Map<number, number>();
  const pieces = state.positions
    .map((pos, seat) => ({ pos, seat }))
    .filter((p) => p.pos > 0)
    .map((p) => {
      const i = counts.get(p.pos) ?? 0;
      counts.set(p.pos, i + 1);
      return { ...p, i };
    });

  return (
    <View style={{ width: size, height: size }} accessibilityLabel="Snakes and ladders board">
      <Svg width={size} height={size} viewBox={`0 0 ${N} ${N}`}>
        {squares.map((sq) => {
          const [cx, cy] = squareCenter(sq);
          const light = (Math.floor((sq - 1) / N) + sq) % 2 === 0;
          return (
            <G key={sq}>
              <Rect x={cx - 0.5} y={cy - 0.5} width={1} height={1} fill={light ? '#FEF3C7' : '#FDE68A'} />
              <SvgText x={cx - 0.42} y={cy - 0.22} fontSize={0.26} fill="#92400E" fontWeight="bold">
                {sq}
              </SvgText>
            </G>
          );
        })}
        <Rect x={0} y={0} width={N} height={N} fill="none" stroke="#92400E" strokeWidth={0.06} />
        {Object.entries(LADDERS).map(([from, to]) => ladderShape(Number(from), to, `l${from}`))}
        {Object.entries(SNAKES).map(([head, tail], i) =>
          snakeShape(Number(head), tail, SNAKE_COLORS[i % SNAKE_COLORS.length], `s${head}`),
        )}
      </Svg>
      {pieces.map(({ pos, seat, i }) => {
        const [cx, cy] = squareCenter(pos);
        const n = counts.get(pos) ?? 1;
        const offset = n > 1 ? (i - (n - 1) / 2) * cell * 0.22 : 0;
        return (
          <Piece
            key={seat}
            x={cx * cell + offset}
            y={cy * cell + 0.12 * cell}
            size={cell * (n > 1 ? 0.42 : 0.5)}
            color={PLAYER_COLORS[seat % PLAYER_COLORS.length]}
            highlighted={seat === state.turn && !state.over}
          />
        );
      })}
    </View>
  );
}

function Piece({
  x,
  y,
  size,
  color,
  highlighted,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  highlighted: boolean;
}) {
  const [pos] = useState(() => new Animated.ValueXY({ x, y }));
  useEffect(() => {
    Animated.timing(pos, { toValue: { x, y }, duration: 450, useNativeDriver: false }).start();
  }, [x, y, pos]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderWidth: highlighted ? 3 : 2,
          transform: [
            { translateX: Animated.subtract(pos.x, size / 2) },
            { translateY: Animated.subtract(pos.y, size / 2) },
          ],
          zIndex: highlighted ? 2 : 1,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
});
