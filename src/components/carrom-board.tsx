import { useEffect, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Rect } from 'react-native-svg';

import { Button } from '@/components/ui';
import {
  BOARD,
  baselineEnds,
  CarromMove,
  CarromState,
  COIN_R,
  CoinKind,
  POCKET_R,
  POCKETS,
  sideOf,
  STRIKER_R,
  strikerFits,
  strikerSpot,
} from '@/games/carrom/engine';
import { makeStyles, useTheme } from '@/ui/theme';

import { Slider } from './slider';

const FRAME = 6;
const FILL: Record<CoinKind | 'striker', string> = {
  white: '#F7F1DF',
  black: '#262626',
  queen: '#D7263D',
  striker: '#2563EB',
};
const EDGE: Record<CoinKind | 'striker', string> = {
  white: '#B9AE8E',
  black: '#5B5B5B',
  queen: '#8E1022',
  striker: '#DBEAFE',
};

/** Quarter-turn rotation so the viewer's side is at the bottom. */
const toView = (x: number, y: number, turns: number): [number, number] => {
  let p: [number, number] = [x, y];
  for (let i = 0; i < turns; i++) p = [BOARD - p[1], p[0]];
  return p;
};
const fromView = (x: number, y: number, turns: number): [number, number] => {
  let p: [number, number] = [x, y];
  for (let i = 0; i < turns; i++) p = [p[1], BOARD - p[0]];
  return p;
};

/**
 * Carrom table. Replays the last shot from the host's recorded frames, and
 * on your turn lets you place the striker, drag on the board to aim, set
 * power and strike.
 */
export function CarromBoard({
  state,
  size,
  viewerSide,
  canShoot,
  onShoot,
}: {
  state: CarromState;
  size: number;
  viewerSide: number;
  canShoot: boolean;
  onShoot: (move: CarromMove) => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const turns = viewerSide;
  const scale = size / (BOARD + FRAME * 2);
  const side = sideOf(state.turn, state.seats.length);

  // --- Replay of the last shot ---
  const [shownShot, setShownShot] = useState(state.shots);
  const [frame, setFrame] = useState(0);
  const animating = state.last != null && state.shots !== shownShot;
  useEffect(() => {
    if (!animating || !state.last) return;
    const total = state.last.frames.length;
    const started = Date.now();
    let raf = 0;
    const tick = () => {
      const i = Math.floor((Date.now() - started) / 16);
      if (i >= total - 1) {
        setFrame(0);
        setShownShot(state.shots);
        return;
      }
      setFrame(i);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animating, state.last, state.shots]);

  // --- Aiming ---
  const [pos, setPos] = useState(0.5);
  const [power, setPower] = useState(0.55);
  const spot = strikerSpot(side, pos);
  // Until the player aims, point at the centre of the board.
  const [aim, setAim] = useState<number | null>(null);
  const angle = aim ?? Math.atan2(BOARD / 2 - spot[1], BOARD / 2 - spot[0]);
  const fits = strikerFits(state, state.turn, pos);
  const aiming = canShoot && !animating;

  const aimFromTouch = (lx: number, ly: number) => {
    const [bx, by] = fromView(lx / scale - FRAME, ly / scale - FRAME, turns);
    if (Math.hypot(bx - spot[0], by - spot[1]) < 1) return;
    setAim(Math.atan2(by - spot[1], bx - spot[0]));
  };
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => aiming,
    onMoveShouldSetPanResponder: () => aiming,
    onPanResponderGrant: (e) => aimFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
    onPanResponderMove: (e) => aimFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
    onPanResponderTerminationRequest: () => false,
  });

  const shoot = () => {
    onShoot({ type: 'shot', pos, angle, power });
    setAim(null);
  };

  // --- What to draw ---
  type Piece = { key: string; kind: CoinKind | 'striker'; x: number; y: number };
  let pieces: Piece[];
  if (animating && state.last) {
    const f = state.last.frames[Math.min(frame, state.last.frames.length - 1)];
    const { ids, kinds } = state.last;
    pieces = ids
      .map((id, i) => ({ key: String(id), kind: kinds[i], x: f[i * 2], y: f[i * 2 + 1] }))
      .filter((p) => p.x >= 0);
  } else {
    pieces = state.coins.map((c) => ({ key: String(c.id), kind: c.kind, x: c.x, y: c.y }));
    if (aiming) pieces.push({ key: 'striker', kind: 'striker', x: spot[0], y: spot[1] });
  }

  const v = (x: number, y: number) => toView(x, y, turns);
  const aimLength = 10 + power * 40;
  const [ax, ay] = v(spot[0] + Math.cos(angle) * aimLength, spot[1] + Math.sin(angle) * aimLength);
  const [svx, svy] = v(spot[0], spot[1]);

  return (
    <View style={{ width: size }}>
      <View style={{ width: size, height: size }} {...responder.panHandlers} accessibilityLabel="Carrom board">
        <Svg width={size} height={size} viewBox={`${-FRAME} ${-FRAME} ${BOARD + FRAME * 2} ${BOARD + FRAME * 2}`}>
          <Rect x={-FRAME} y={-FRAME} width={BOARD + FRAME * 2} height={BOARD + FRAME * 2} rx={3} fill="#5B3A1E" />
          <Rect x={0} y={0} width={BOARD} height={BOARD} fill="#F1D7A2" />
          {POCKETS.map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={POCKET_R} fill="#1C1917" />
          ))}
          {[0, 1, 2, 3].map((s) => {
            const [[x1, y1], [x2, y2]] = baselineEnds(s).map(([x, y]) => v(x, y)) as [
              [number, number],
              [number, number],
            ];
            const horizontal = Math.abs(y1 - y2) < 0.01;
            const off = 2.6;
            return (
              <G key={s}>
                <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3F2A16" strokeWidth={0.25} />
                <Line
                  x1={x1 + (horizontal ? 0 : off * Math.sign(50 - x1))}
                  y1={y1 + (horizontal ? off * Math.sign(50 - y1) : 0)}
                  x2={x2 + (horizontal ? 0 : off * Math.sign(50 - x2))}
                  y2={y2 + (horizontal ? off * Math.sign(50 - y2) : 0)}
                  stroke="#3F2A16"
                  strokeWidth={0.25}
                />
                <Circle cx={x1} cy={y1} r={1.4} fill="#C0392B" />
                <Circle cx={x2} cy={y2} r={1.4} fill="#C0392B" />
              </G>
            );
          })}
          <Circle cx={50} cy={50} r={11} fill="none" stroke="#3F2A16" strokeWidth={0.25} />
          <Circle cx={50} cy={50} r={2.4} fill="none" stroke="#C0392B" strokeWidth={0.4} />
          {[
            [12, 12],
            [88, 12],
            [12, 88],
            [88, 88],
          ].map(([x, y], i) => (
            <Line
              key={i}
              x1={x}
              y1={y}
              x2={x + (50 - x) * 0.32}
              y2={y + (50 - y) * 0.32}
              stroke="#3F2A16"
              strokeWidth={0.25}
            />
          ))}

          {aiming ? (
            <Line
              x1={svx}
              y1={svy}
              x2={ax}
              y2={ay}
              stroke={fits ? '#2563EB' : '#DC2626'}
              strokeWidth={0.5}
              strokeDasharray="1.2 1"
            />
          ) : null}

          {pieces.map((p) => {
            const [x, y] = v(p.x, p.y);
            const r = p.kind === 'striker' ? STRIKER_R : COIN_R;
            const blocked = p.kind === 'striker' && aiming && !fits;
            return (
              <G key={p.key}>
                <Circle cx={x + 0.25} cy={y + 0.35} r={r} fill="rgba(0,0,0,0.25)" />
                <Circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={blocked ? '#FCA5A5' : FILL[p.kind]}
                  stroke={EDGE[p.kind]}
                  strokeWidth={0.35}
                />
                <Circle cx={x} cy={y} r={r * 0.55} fill="none" stroke={EDGE[p.kind]} strokeWidth={0.2} />
              </G>
            );
          })}
        </Svg>
      </View>

      {aiming ? (
        <View style={styles.controls}>
          <Text style={styles.tip}>
            {fits ? 'Drag on the board to aim' : 'The striker is on a coin — slide it along the line'}
          </Text>
          <View style={styles.row}>
            <Slider label="Striker position" value={pos} onChange={setPos} color={colors.violet} />
            <Slider label="Power" value={power} onChange={setPower} />
          </View>
          <Button title="Strike" onPress={shoot} disabled={!fits} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  controls: { gap: 10, paddingTop: 12, paddingHorizontal: 4, paddingBottom: 4 },
  tip: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 14 },
}));
