import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';

import { ChessState, Color, legalMoves, Move, Piece, PieceType, Promotion, seatColor } from '@/games/chess/engine';
import { PieceStyle, useProfile } from '@/lib/profile';
import { makeStyles, radius } from '@/ui/theme';

import { ChessPieceSvg } from './chess-pieces';

// Filled glyphs for text (status lines); U+FE0E keeps iOS from drawing emoji.
const GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
export const pieceGlyph = (p: Piece) => `${GLYPH[p[1]]}︎`;

// The familiar green board.
const LIGHT = '#EBECD0';
const DARK = '#739552';
const LIGHT_HL = '#F5F682';
const DARK_HL = '#B9CA43';

const VALUE: Record<PieceType, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

export function ChessPiece({ piece, size, pieceStyle }: { piece: Piece; size: number; pieceStyle?: PieceStyle }) {
  const profile = useProfile();
  return (
    <ChessPieceSvg
      type={piece[1] as PieceType}
      white={piece[0] === 'w'}
      size={size}
      pieceStyle={pieceStyle ?? profile.pieceStyle}
    />
  );
}

/** Slides the piece that just moved from its old square. */
function Sliding({ dx, dy, children }: { dx: number; dy: number; children: React.ReactNode }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  return (
    <Animated.View
      style={{
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Tap a piece to see where it can go, then tap a highlighted square. The
 * board is flipped for the player who has Black.
 */
export function ChessBoard({
  state,
  size,
  canMove,
  flipped,
  onMove,
}: {
  state: ChessState;
  size: number;
  canMove: boolean;
  flipped: boolean;
  onMove: (move: Move) => void;
}) {
  const styles = useStyles();
  const [selected, setSelected] = useState<number | null>(null);
  const [promotionChoices, setPromotionChoices] = useState<Move[] | null>(null);
  const cell = size / 8;
  const moves = canMove ? legalMoves(state) : [];
  const myColor = seatColor(state.turn);
  // Drop a stale selection once it's no longer this player's piece to move.
  const active = selected != null && state.board[selected]?.[0] === myColor && canMove ? selected : null;
  const targets = active != null ? moves.filter((m) => m.from === active) : [];
  const kingInCheck = state.check ? state.board.indexOf(`${seatColor(state.turn)}K`) : -1;
  const coordSize = Math.max(9, cell * 0.2);

  const tap = (sq: number) => {
    if (!canMove) return;
    const options = targets.filter((m) => m.to === sq);
    if (options.length > 1) {
      setPromotionChoices(options);
      return;
    }
    if (options.length === 1) {
      onMove(options[0]);
      setSelected(null);
      return;
    }
    setSelected(state.board[sq]?.[0] === myColor && sq !== active ? sq : null);
  };

  // Where a square is drawn: row 0 is the top edge.
  const place = (sq: number) => {
    const r = Math.floor(sq / 8);
    const f = sq % 8;
    return { row: flipped ? r : 7 - r, col: flipped ? 7 - f : f };
  };
  const last = state.last;
  const slide = last
    ? {
        dx: (place(last.from).col - place(last.to).col) * cell,
        dy: (place(last.from).row - place(last.to).row) * cell,
      }
    : null;

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const rank = flipped ? row : 7 - row;
      const file = flipped ? 7 - col : col;
      const sq = rank * 8 + file;
      const piece = state.board[sq];
      const light = (rank + file) % 2 === 1;
      const isTarget = targets.some((m) => m.to === sq);
      const lit = sq === active || (last && (sq === last.from || sq === last.to));
      const moved = last && sq === last.to && piece;
      const pieceView = piece ? <ChessPiece piece={piece} size={cell} /> : null;
      squares.push(
        <Pressable
          key={sq}
          onPress={() => tap(sq)}
          accessibilityLabel={`${'abcdefgh'[file]}${rank + 1}${piece ? ` ${piece[0] === 'w' ? 'white' : 'black'} ${piece[1]}` : ''}`}
          style={[
            styles.square,
            {
              width: cell,
              height: cell,
              backgroundColor: lit ? (light ? LIGHT_HL : DARK_HL) : light ? LIGHT : DARK,
            },
            moved ? styles.raised : null,
          ]}
        >
          {sq === kingInCheck ? (
            <View style={[styles.check, { width: cell, height: cell, borderRadius: cell / 2 }]} />
          ) : null}
          {col === 0 ? (
            <Text
              style={[styles.coord, styles.rankLabel, { color: light ? DARK : LIGHT, fontSize: coordSize }]}
              allowFontScaling={false}
            >
              {rank + 1}
            </Text>
          ) : null}
          {row === 7 ? (
            <Text
              style={[styles.coord, styles.fileLabel, { color: light ? DARK : LIGHT, fontSize: coordSize }]}
              allowFontScaling={false}
            >
              {'abcdefgh'[file]}
            </Text>
          ) : null}
          {moved && slide ? (
            <Sliding key={`${last.from}-${last.to}-${state.fullmove}-${state.turn}`} dx={slide.dx} dy={slide.dy}>
              {pieceView}
            </Sliding>
          ) : (
            pieceView
          )}
          {isTarget ? (
            <View
              pointerEvents="none"
              style={
                piece
                  ? [styles.captureRing, { borderRadius: cell / 2, borderWidth: cell * 0.09 }]
                  : [styles.dot, { width: cell * 0.32, height: cell * 0.32, borderRadius: cell * 0.16 }]
              }
            />
          ) : null}
        </Pressable>,
      );
    }
  }

  return (
    <View style={[styles.board, { width: size, height: size }]} accessibilityLabel="Chess board">
      {squares}
      <Modal visible={promotionChoices != null} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>Promote to</Text>
            <View style={styles.pickerRow}>
              {(['Q', 'R', 'B', 'N'] as Promotion[]).map((p) => (
                <Pressable
                  key={p}
                  style={styles.pickerBtn}
                  accessibilityLabel={{ Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' }[p]}
                  onPress={() => {
                    const move = promotionChoices?.find((m) => m.promotion === p);
                    setPromotionChoices(null);
                    setSelected(null);
                    if (move) onMove(move);
                  }}
                >
                  <ChessPiece piece={`${myColor}${p}`} size={56} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Pieces this colour has taken, cheapest first, and its material lead. */
export function captures(state: ChessState, by: Color) {
  const taken = state.captured.filter((p) => p[0] !== by).sort((a, b) => VALUE[a[1] as PieceType] - VALUE[b[1] as PieceType]);
  const worth = (c: Color) =>
    state.captured.filter((p) => p[0] !== c).reduce((n, p) => n + VALUE[p[1] as PieceType], 0);
  return { taken, lead: worth(by) - worth(by === 'w' ? 'b' : 'w') };
}

/** Name strip above or below the board: avatar, name, captured pieces, clock-style turn marker. */
export function ChessPlayerBar({
  name,
  color,
  state,
  active,
  width,
  bot,
}: {
  name: string;
  color: Color;
  state: ChessState;
  active: boolean;
  width: number;
  bot?: boolean;
}) {
  const styles = useStyles();
  const { taken, lead } = captures(state, color);
  return (
    <View style={[styles.bar, { width }]}>
      <View style={[styles.avatar, color === 'w' ? styles.avatarWhite : styles.avatarBlack]}>
        <Text style={[styles.avatarText, { color: color === 'w' ? '#312E2B' : '#FFFFFF' }]}>
          {bot ? '🤖' : (name.trim() || '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.barMain}>
        <Text style={styles.barName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.taken}>
          {taken.map((p, i) => (
            <View key={i} style={i > 0 && taken[i - 1][1] === p[1] ? styles.takenTight : styles.takenGap}>
              <ChessPiece piece={p} size={18} />
            </View>
          ))}
          {lead > 0 ? <Text style={styles.lead}>+{lead}</Text> : null}
        </View>
      </View>
      <View style={[styles.turnTag, active ? styles.turnTagOn : null]}>
        <View style={[styles.turnDot, { backgroundColor: color === 'w' ? '#FFFFFF' : '#1B1A18' }]} />
        <Text style={[styles.turnText, active ? styles.turnTextOn : null]}>{active ? 'To move' : color === 'w' ? 'White' : 'Black'}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  square: { alignItems: 'center', justifyContent: 'center' },
  raised: { zIndex: 5 },
  dot: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.14)' },
  captureRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderColor: 'rgba(0,0,0,0.14)' },
  check: {
    position: 'absolute',
    backgroundColor: 'rgba(235,30,30,0.75)',
    shadowColor: '#FF0000',
    shadowOpacity: 0.9,
    shadowRadius: 10,
  },
  coord: { position: 'absolute', fontWeight: '800' },
  rankLabel: { top: 2, left: 3 },
  fileLabel: { bottom: 1, right: 3 },
  overlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.7)', alignItems: 'center', justifyContent: 'center' },
  picker: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  pickerRow: { flexDirection: 'row', gap: 10 },
  pickerBtn: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  avatar: { width: 38, height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  avatarWhite: { backgroundColor: '#F0F0EC' },
  avatarBlack: { backgroundColor: '#312E2B' },
  avatarText: { fontSize: 17, fontWeight: '900' },
  barMain: { flex: 1, minWidth: 0 },
  barName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  taken: { flexDirection: 'row', alignItems: 'center', height: 20, marginTop: 1 },
  takenTight: { marginLeft: -11 },
  takenGap: { marginLeft: -3 },
  lead: { color: colors.muted, fontSize: 12, fontWeight: '800', marginLeft: 4 },
  turnTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
  },
  turnTagOn: { backgroundColor: colors.scheme === 'dark' ? '#F0F0EC' : '#312E2B' },
  turnDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(128,128,128,0.6)' },
  turnText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  turnTextOn: { color: colors.scheme === 'dark' ? '#312E2B' : '#FFFFFF' },
}));
