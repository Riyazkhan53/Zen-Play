import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChessState, legalMoves, Move, Piece, Promotion, seatColor } from '@/games/chess/engine';
import { colors, radius } from '@/ui/theme';

// Filled glyphs for both sides (coloured by style); U+FE0E keeps iOS from
// drawing them as emoji.
const GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
export const pieceGlyph = (p: Piece) => `${GLYPH[p[1]]}︎`;

const LIGHT = '#F0D9B5';
const DARK = '#B58863';

export function ChessPiece({ piece, size }: { piece: Piece; size: number }) {
  const white = piece[0] === 'w';
  return (
    <Text
      style={[
        styles.piece,
        {
          fontSize: size,
          lineHeight: size * 1.15,
          color: white ? '#FFFFFF' : '#1F1F1F',
          textShadowColor: white ? '#1F1F1F' : 'rgba(255,255,255,0.6)',
        },
      ]}
      allowFontScaling={false}
    >
      {pieceGlyph(piece)}
    </Text>
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
  const [selected, setSelected] = useState<number | null>(null);
  const [promotionChoices, setPromotionChoices] = useState<Move[] | null>(null);
  const cell = size / 8;
  const moves = canMove ? legalMoves(state) : [];
  const myColor = seatColor(state.turn);
  // Drop a stale selection once it's no longer this player's piece to move.
  const active = selected != null && state.board[selected]?.[0] === myColor && canMove ? selected : null;
  const targets = active != null ? moves.filter((m) => m.from === active) : [];
  const kingInCheck = state.check ? state.board.indexOf(`${myColor}K`) : -1;

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
    setSelected(state.board[sq]?.[0] === myColor ? sq : null);
  };

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      // Row 0 is drawn at the top: rank 8 for White's view, rank 1 when flipped.
      const rank = flipped ? row : 7 - row;
      const file = flipped ? 7 - col : col;
      const sq = rank * 8 + file;
      const piece = state.board[sq];
      const isTarget = targets.some((m) => m.to === sq);
      const highlight =
        sq === active
          ? 'rgba(45,212,191,0.55)'
          : state.last && (sq === state.last.from || sq === state.last.to)
            ? 'rgba(250,204,21,0.45)'
            : null;
      squares.push(
        <Pressable
          key={sq}
          onPress={() => tap(sq)}
          accessibilityLabel={`${'abcdefgh'[file]}${rank + 1}${piece ? ` ${piece[0] === 'w' ? 'white' : 'black'} ${piece[1]}` : ''}`}
          style={[
            styles.square,
            { width: cell, height: cell, backgroundColor: (rank + file) % 2 === 0 ? DARK : LIGHT },
          ]}
        >
          {highlight ? <View style={[StyleSheet.absoluteFill, { backgroundColor: highlight }]} /> : null}
          {sq === kingInCheck ? <View style={[StyleSheet.absoluteFill, styles.check]} /> : null}
          {col === 0 ? (
            <Text style={[styles.coord, styles.rankLabel, { color: (rank + file) % 2 === 0 ? LIGHT : DARK }]}>
              {rank + 1}
            </Text>
          ) : null}
          {row === 7 ? (
            <Text style={[styles.coord, styles.fileLabel, { color: (rank + file) % 2 === 0 ? LIGHT : DARK }]}>
              {'abcdefgh'[file]}
            </Text>
          ) : null}
          {piece ? <ChessPiece piece={piece} size={cell * 0.78} /> : null}
          {isTarget ? (
            <View
              pointerEvents="none"
              style={
                piece
                  ? [styles.captureRing, { borderRadius: cell / 2, borderWidth: cell * 0.07 }]
                  : [styles.dot, { width: cell * 0.3, height: cell * 0.3, borderRadius: cell * 0.15 }]
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
                  <ChessPiece piece={`${myColor}${p}`} size={44} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 6, overflow: 'hidden' },
  square: { alignItems: 'center', justifyContent: 'center' },
  piece: { textAlign: 'center', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 2 },
  dot: { position: 'absolute', backgroundColor: 'rgba(15,23,42,0.35)' },
  captureRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderColor: 'rgba(15,23,42,0.35)' },
  check: { backgroundColor: 'rgba(239,68,68,0.6)', borderRadius: 999 },
  coord: { position: 'absolute', fontSize: 10, fontWeight: '700' },
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
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
