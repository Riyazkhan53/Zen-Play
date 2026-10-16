import { StyleSheet, Text, View } from 'react-native';

import { ChessBoard, pieceGlyph } from '@/components/chess-board';
import { Button } from '@/components/ui';
import { ChessState, seatColor } from '@/games/chess/engine';
import { colors } from '@/ui/theme';

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
  Board: ({ state, size, mySeats, act }) => (
    <ChessBoard
      state={state}
      size={size}
      canMove={!state.over && mySeats.includes(state.turn)}
      // Black's player sees the board from their side; sharing a device keeps White at the bottom.
      flipped={mySeats.length === 1 && mySeats[0] === 1}
      onMove={(m) => act(state.turn, { type: 'move', ...m })}
    />
  ),
  Controls: ({ state, mySeats, act }) => {
    // When both colours are on this device, "Resign" is for whoever is to move.
    const resigner = mySeats.length === 1 ? mySeats[0] : mySeats.includes(state.turn) ? state.turn : null;
    const taken = (color: 'w' | 'b') =>
      state.captured
        .filter((p) => p[0] === color)
        .map(pieceGlyph)
        .join('');
    return (
      <View style={styles.controls}>
        <Text style={styles.captured} numberOfLines={1}>
          {taken('b') || ' '}
        </Text>
        <Text style={styles.captured} numberOfLines={1}>
          {taken('w') || ' '}
        </Text>
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

const styles = StyleSheet.create({
  controls: { flex: 1, gap: 4 },
  captured: { color: colors.muted, fontSize: 18, letterSpacing: 1 },
  resign: { minHeight: 36, marginTop: 4, alignSelf: 'flex-start' },
});
