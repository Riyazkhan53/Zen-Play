import { Pressable, Text, View } from 'react-native';

import { ChessBoard, ChessPiece, ChessPlayerBar } from '@/components/chess-board';
import { Button } from '@/components/ui';
import { ChessState, seatColor } from '@/games/chess/engine';
import { PieceStyle, updateProfile, useProfile } from '@/lib/profile';
import { makeStyles, radius } from '@/ui/theme';

import type { GameUI } from './types';

const END_TEXT: Record<string, string> = {
  checkmate: 'Checkmate',
  resign: 'Resigned',
  stalemate: 'Stalemate — draw',
  repetition: 'Draw by repetition',
  'fifty-moves': 'Draw — 50 moves without a capture',
  insufficient: 'Draw — not enough pieces to mate',
};

export const chessUI: GameUI<ChessState> = {
  shape: 'square',
  Board: ({ state, room, size, mySeats, act }) => {
    // Black's player sees the board from their side; sharing a device keeps White at the bottom.
    const flipped = mySeats.length === 1 && mySeats[0] === 1;
    const bar = (seat: number) => (
      <ChessPlayerBar
        name={room.seats[seat]?.name ?? (seat === 0 ? 'White' : 'Black')}
        bot={room.seats[seat]?.bot}
        color={seatColor(seat)}
        state={state}
        active={!state.over && state.turn === seat}
        width={size}
      />
    );
    return (
      <View>
        {bar(flipped ? 0 : 1)}
        <ChessBoard
          state={state}
          size={size}
          canMove={!state.over && mySeats.includes(state.turn)}
          flipped={flipped}
          onMove={(m) => act(state.turn, { type: 'move', ...m })}
        />
        {bar(flipped ? 1 : 0)}
        <PieceStylePicker />
      </View>
    );
  },
  Controls: ({ state, mySeats, act }) => {
    const styles = useStyles();
    // When both colours are on this device, "Resign" is for whoever is to move.
    const resigner = mySeats.length === 1 ? mySeats[0] : mySeats.includes(state.turn) ? state.turn : null;
    return (
      <View style={styles.controls}>
        {resigner != null && !state.over ? (
          <Button
            title="Resign"
            variant="danger"
            onPress={() => act(resigner, { type: 'resign' })}
            style={styles.resign}
          />
        ) : null}
      </View>
    );
  },
  status(state, room) {
    if (state.over) return END_TEXT[state.end ?? ''] ?? 'Game over';
    if (!state.last) return 'White moves first.';
    const mover = room.seats[1 - state.turn]?.name ?? 'Player';
    return `${mover} played ${state.last.san}${state.check ? ' — check!' : ''}`;
  },
  hint: (state, _room, myTurn) =>
    myTurn ? `You play ${seatColor(state.turn) === 'w' ? 'White' : 'Black'} · tap a piece` : '',
  detail: (_state, seat) => (seat === 0 ? '♔ White' : '♚ Black'),
  isDraw: (state) => state.over && state.winner == null,
  result(state, room) {
    if (state.winner == null) return END_TEXT[state.end ?? ''] ?? 'Draw';
    const name = room.seats[state.winner]?.name;
    return state.end === 'resign' ? `${name} wins by resignation` : `Checkmate — ${name} wins!`;
  },
};

const STYLES: { style: PieceStyle; label: string }[] = [
  { style: 'normal', label: 'Normal' },
  { style: 'glass', label: 'Glass' },
  { style: '3d', label: '3D' },
];

/** Normal / Glass / 3D pieces; saved in the profile. */
export function PieceStylePicker() {
  const styles = useStyles();
  const { pieceStyle } = useProfile();
  return (
    <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel="Piece style">
      {STYLES.map(({ style, label }) => {
        const on = pieceStyle === style;
        return (
          <Pressable
            key={style}
            onPress={() => updateProfile({ pieceStyle: style })}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.option, on && styles.optionOn]}
          >
            <View style={styles.preview}>
              <ChessPiece piece="wN" size={34} pieceStyle={style} />
              <View style={styles.previewBack}>
                <ChessPiece piece="bQ" size={34} pieceStyle={style} />
              </View>
            </View>
            <Text style={[styles.optionText, on && styles.optionTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  controls: { gap: 10 },
  resign: { minHeight: 36, alignSelf: 'flex-start' },
  picker: { flexDirection: 'row', gap: 8, marginTop: 4 },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  optionOn: { borderColor: colors.accent },
  preview: { flexDirection: 'row', backgroundColor: '#739552', borderRadius: 6, paddingHorizontal: 2 },
  previewBack: { marginLeft: -8 },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  optionTextOn: { color: colors.text },
}));
