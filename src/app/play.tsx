import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Dice } from '@/components/dice';
import { LudoBoard } from '@/components/ludo-board';
import { SnakesBoard } from '@/components/snakes-board';
import { Banner, Button, Card, Screen, TopBar } from '@/components/ui';
import { HOME, LudoState } from '@/games/ludo/engine';
import { gameMeta } from '@/games/registry';
import { SnakesState } from '@/games/snakes/engine';
import { useProfile } from '@/lib/profile';
import type { RoomView } from '@/net/protocol';
import { clearError, leaveSession, send, useSession } from '@/net/session';
import { seatColor } from '@/ui/seat-colors';
import { colors, MAX_WIDTH, radius } from '@/ui/theme';

type AnyState = LudoState | SnakesState;

export default function Play() {
  const session = useSession();
  const { clientId } = useProfile();
  const { width, height } = useWindowDimensions();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { room } = session;
  const state = session.game as AnyState | null;

  const leave = () => {
    setConfirmLeave(false);
    leaveSession();
    router.dismissTo('/');
  };

  // Back in the lobby (e.g. connection reset) → return to it.
  useEffect(() => {
    if (room && !room.started) router.replace('/room');
  }, [room]);

  useHaptics(state, room, clientId);

  if (!room || !state) {
    return (
      <Screen>
        <TopBar title="Zen-Play" onBack={leave} />
        <Text style={styles.muted}>{session.error ?? 'Waiting for the game…'}</Text>
      </Screen>
    );
  }

  const game = gameMeta(room.gameId)!;
  const mySeats = room.seats.map((s, i) => (s.ownerId === clientId ? i : -1)).filter((i) => i >= 0);
  const isHost = room.hostClientId === clientId;
  const turn = state.over ? null : state.turn;
  const myTurn = turn != null && mySeats.includes(turn);
  // Screen caps content at MAX_WIDTH with 16px gutters; the board frame adds 14px.
  const contentWidth = Math.min(width, MAX_WIDTH) - 32;
  const wide = width >= 700 && width > height * 1.05;
  const boardSize = Math.floor(
    wide
      ? Math.min(height - 100, contentWidth - 340 - 14 - 14)
      : Math.min(contentWidth - 14, Math.max(260, height - 340), 720),
  );

  const roll = () => {
    if (turn != null) send({ t: 'move', seat: turn, move: { type: 'roll' } });
  };

  const isLudo = room.gameId === 'ludo';
  const ludoState = isLudo ? (state as LudoState) : null;
  const canRoll = myTurn && (!ludoState || ludoState.phase === 'roll');
  const dice = isLudo ? ludoState!.dice : ((state as SnakesState).last?.dice ?? null);
  const turnColor = turn != null ? seatColor(room.gameId, turn, room.seats.length) : colors.border;

  const board = isLudo ? (
    <LudoBoard
      state={ludoState!}
      size={boardSize}
      canMove={myTurn}
      onMoveToken={(token) => send({ t: 'move', seat: ludoState!.turn, move: { type: 'move', token } })}
    />
  ) : (
    <SnakesBoard state={state as SnakesState} size={boardSize} />
  );

  const panel = (
    <View style={[styles.panel, wide && styles.panelWide]}>
      <Card style={styles.turnCard}>
        <Text style={styles.event} numberOfLines={2}>
          {describeLast(room, state)}
        </Text>
        <View style={styles.diceRow}>
          <Dice value={dice} rollKey={session.seq} color={turnColor} canRoll={canRoll} onRoll={roll} />
          <View style={styles.flex}>
            <Text style={[styles.turnName, { color: turnColor }]} numberOfLines={1}>
              {turn != null ? room.seats[turn].name : 'Game over'}
            </Text>
            <Text style={styles.turnHint}>{turnHint(state, room, myTurn, mySeats.length > 1)}</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.playersCard}>
        {room.seats.map((seat, i) => (
          <View key={i} style={[styles.player, turn === i && styles.playerActive]}>
            <View style={[styles.dot, { backgroundColor: seatColor(room.gameId, i, room.seats.length) }]} />
            <Text style={styles.playerName} numberOfLines={1}>
              {seat.bot ? '🤖 ' : ''}
              {seat.name}
              {seat.ownerId === clientId ? <Text style={styles.you}> · you</Text> : null}
            </Text>
            {!seat.connected ? <Text style={styles.offline}>offline</Text> : null}
            <Text style={styles.progress}>{progressLabel(state, i)}</Text>
            {isHost && !seat.connected && !seat.bot && !state.over ? (
              <Button
                title="Bot"
                variant="ghost"
                onPress={() => send({ t: 'replaceWithBot', seat: i })}
                style={styles.botBtn}
              />
            ) : null}
          </View>
        ))}
      </Card>
    </View>
  );

  return (
    <Screen>
      <TopBar
        title={`${game.emoji}  ${game.name}`}
        onBack={() => (state.over ? leave() : setConfirmLeave(true))}
        right={
          room.code ? (
            <Text style={styles.code} selectable>
              {room.code}
            </Text>
          ) : null
        }
      />
      {session.error ? <Banner message={session.error} onClose={clearError} /> : null}
      {session.status === 'reconnecting' ? <Text style={styles.reconnecting}>Reconnecting…</Text> : null}

      <ScrollView contentContainerStyle={[styles.body, wide && styles.bodyWide]} bounces={false}>
        <View style={styles.boardFrame}>{board}</View>
        {panel}
      </ScrollView>

      <Modal visible={state.over} transparent animationType="fade">
        <View style={styles.overlay}>
          <Card style={styles.dialog}>
            <Text style={styles.trophy}>🏆</Text>
            <Text style={styles.dialogTitle}>{room.seats[state.rankings[0]]?.name} wins!</Text>
            {state.rankings.map((seat, place) => (
              <View key={seat} style={styles.rank}>
                <Text style={styles.rankPlace}>{place + 1}</Text>
                <View style={[styles.dot, { backgroundColor: seatColor(room.gameId, seat, room.seats.length) }]} />
                <Text style={styles.rankName}>{room.seats[seat]?.name}</Text>
              </View>
            ))}
            {isHost ? (
              <Button title="Play again" onPress={() => send({ t: 'rematch' })} style={styles.dialogBtn} />
            ) : (
              <Text style={[styles.muted, styles.dialogBtn]}>The host can start a rematch.</Text>
            )}
            <Button title="Leave" variant="secondary" onPress={leave} style={styles.dialogBtnSmall} />
          </Card>
        </View>
      </Modal>

      <Modal visible={confirmLeave} transparent animationType="fade" onRequestClose={() => setConfirmLeave(false)}>
        <View style={styles.overlay}>
          <Card style={styles.dialog}>
            <Text style={styles.dialogTitle}>Leave this game?</Text>
            <Text style={styles.muted}>
              {session.mode === 'local' || session.mode === 'lan-host'
                ? 'The game ends for everyone.'
                : 'You can rejoin with the same room.'}
            </Text>
            <Button title="Leave game" variant="danger" onPress={leave} style={styles.dialogBtn} />
            <Button
              title="Keep playing"
              variant="secondary"
              onPress={() => setConfirmLeave(false)}
              style={styles.dialogBtnSmall}
            />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

/** A little buzz when it becomes your turn and when your token gets captured. */
function useHaptics(state: AnyState | null, room: RoomView | null, clientId: string) {
  const lastTurn = useRef<number | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web' || !state || !room) return;
    const mine = (seat: number) => room.seats[seat]?.ownerId === clientId;
    const turn = state.over ? null : state.turn;
    if (turn != null && turn !== lastTurn.current && mine(turn)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    lastTurn.current = turn;
    const last = 'tokens' in state ? state.last : null;
    if (last?.captured?.some((c) => mine(c.seat))) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [state, room, clientId]);
}

function describeLast(room: RoomView, state: AnyState): string {
  const name = (seat: number) => room.seats[seat]?.name ?? 'Player';
  if ('tokens' in state) {
    const last = state.last;
    if (state.phase === 'move' && state.dice) return `${name(state.turn)} rolled ${state.dice}`;
    if (!last) return 'Roll a 6 to bring a token out.';
    if (last.note === 'three-sixes') return `${name(last.seat)} rolled three 6s — turn over`;
    if (last.note === 'no-move') return `${name(last.seat)} rolled ${last.dice} — no move`;
    if (last.captured?.length) return `${name(last.seat)} captured ${name(last.captured[0].seat)}! 💥`;
    if (last.note === 'finished') return `${name(last.seat)} got a token home! 🏠`;
    return `${name(last.seat)} moved ${last.dice}`;
  }
  const last = state.last;
  if (!last) return 'First to land exactly on 100 wins.';
  const who = name(last.seat);
  if (last.via === 'ladder') return `${who} rolled ${last.dice} and climbed to ${last.to}! 🪜`;
  if (last.via === 'snake') return `${who} rolled ${last.dice} — snake! Down to ${last.to} 🐍`;
  if (last.via === 'overshoot') return `${who} rolled ${last.dice} — needs an exact roll`;
  return `${who} rolled ${last.dice} → ${last.to}`;
}

function turnHint(state: AnyState, room: RoomView, myTurn: boolean, sharedDevice: boolean): string {
  if (state.over) return '';
  const seat = room.seats[state.turn];
  if (!myTurn)
    return seat?.bot ? 'Computer is thinking…' : seat?.connected === false ? 'Offline — waiting…' : 'Their turn';
  if ('tokens' in state && state.phase === 'move') return 'Tap a glowing token';
  return sharedDevice ? `Pass to ${seat.name} · tap the dice` : 'Your turn · tap the dice';
}

function progressLabel(state: AnyState, seat: number): string {
  if ('tokens' in state) {
    const home = state.tokens[seat].filter((p) => p === HOME).length;
    const place = state.rankings.indexOf(seat);
    return place >= 0 && home === 4 ? `#${place + 1}` : `${home}/4 home`;
  }
  const pos = state.positions[seat];
  return pos === 0 ? 'start' : `on ${pos}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  reconnecting: { color: colors.warning, textAlign: 'center', marginBottom: 6 },
  code: { color: colors.accent, fontWeight: '800', letterSpacing: 2 },
  body: { alignItems: 'center', gap: 14, paddingBottom: 24 },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  boardFrame: {
    padding: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panel: { width: '100%', gap: 12 },
  panelWide: { width: 340 },
  turnCard: { gap: 12, padding: 14 },
  event: { color: colors.text, fontSize: 15, fontWeight: '600', minHeight: 20 },
  diceRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  turnName: { fontSize: 20, fontWeight: '900' },
  turnHint: { color: colors.muted, fontSize: 14, marginTop: 2 },
  playersCard: { padding: 8 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.sm },
  playerActive: { backgroundColor: colors.surfaceAlt },
  dot: { width: 14, height: 14, borderRadius: 7 },
  playerName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  you: { color: colors.muted, fontWeight: '400' },
  offline: { color: colors.warning, fontSize: 12, fontWeight: '700' },
  progress: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  botBtn: { minHeight: 32, paddingHorizontal: 10 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { width: '100%', maxWidth: 380, alignItems: 'stretch', gap: 6 },
  trophy: { fontSize: 52, textAlign: 'center' },
  dialogTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  rank: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rankPlace: { color: colors.muted, fontWeight: '800', width: 20, textAlign: 'center' },
  rankName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  dialogBtn: { marginTop: 14 },
  dialogBtnSmall: { marginTop: 8 },
});
