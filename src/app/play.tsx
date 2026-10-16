import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Banner, Button, Card, Screen, TopBar } from '@/components/ui';
import { GAME_UI } from '@/game-ui';
import { ENGINES, gameMeta } from '@/games/registry';
import { useProfile } from '@/lib/profile';
import { recordGame } from '@/lib/stats';
import type { RoomView } from '@/net/protocol';
import { clearError, leaveSession, send, useSession } from '@/net/session';
import { seatColor } from '@/ui/seat-colors';
import { makeStyles, MAX_WIDTH, radius, useTheme } from '@/ui/theme';

export default function Play() {
  const styles = useStyles();
  const colors = useTheme();
  const session = useSession();
  const { clientId } = useProfile();
  const { width, height } = useWindowDimensions();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { room } = session;
  const state = session.game;

  const leave = () => {
    setConfirmLeave(false);
    leaveSession();
    router.dismissTo('/');
  };

  // Back in the lobby (e.g. connection reset) → return to it.
  useEffect(() => {
    if (room && !room.started) router.replace('/room');
  }, [room]);

  const engine = room ? ENGINES[room.gameId] : undefined;
  const turn = engine && state != null ? engine.currentSeat(state) : null;
  useTurnHaptic(turn, room, clientId);

  const ui = room ? GAME_UI[room.gameId] : undefined;

  // Count the finished game in this player's stats (once per game).
  useEffect(() => {
    if (!room || state == null || !engine || !ui || !room.started || engine.currentSeat(state) != null) return;
    const mine = room.seats.flatMap((s, i) => (s.ownerId === clientId ? [i] : []));
    if (!mine.length) return;
    const draw = ui.isDraw?.(state) ?? false;
    recordGame(`${room.code ?? room.hostClientId}:${room.gameId}:${session.seq}`, {
      gameId: room.gameId,
      won: !draw && mine.includes(engine.rankings(state)[0]),
      draw,
      players: room.seats.length,
      mode: session.mode === 'online' ? 'online' : session.mode === 'local' ? 'local' : 'lan',
    });
  }, [room, state, engine, ui, clientId, session.seq, session.mode]);
  if (!room || state == null || !engine || !ui) {
    return (
      <Screen>
        <TopBar title="Zen-Play" onBack={leave} />
        <Text style={styles.muted}>{session.error ?? 'Waiting for the game…'}</Text>
      </Screen>
    );
  }

  const game = gameMeta(room.gameId)!;
  const over = turn == null;
  const rankings = engine.rankings(state);
  const mySeats = room.seats.map((s, i) => (s.ownerId === clientId ? i : -1)).filter((i) => i >= 0);
  const isHost = room.hostClientId === clientId;
  const myTurn = turn != null && mySeats.includes(turn);
  // Screen caps content at MAX_WIDTH with 16px gutters; the board frame adds 14px.
  const contentWidth = Math.min(width, MAX_WIDTH) - 32;
  const wide = width >= 700 && width > height * 1.05;
  const panelWidth = 340;
  const boardSize = Math.floor(
    ui.shape === 'table'
      ? wide
        ? contentWidth - panelWidth - 28
        : contentWidth - 14
      : wide
        ? Math.min(height - 100, contentWidth - panelWidth - 28)
        : Math.min(contentWidth - 14, Math.max(260, height - 340), 720),
  );
  const turnColor = turn != null ? seatColor(room.gameId, turn, room.seats.length) : colors.muted;
  const act = (seat: number, move: unknown) => send({ t: 'move', seat, move });
  const props = { state, room, size: boardSize, mySeats, seq: session.seq, act };
  const { Board, Controls } = ui;
  const draw = ui.isDraw?.(state) ?? false;

  const hint = (() => {
    if (over) return '';
    const seat = room.seats[turn];
    if (!myTurn)
      return seat?.bot ? 'Computer is thinking…' : seat?.connected === false ? 'Offline — waiting…' : 'Their turn';
    const h = ui.hint(state, room, true);
    return mySeats.length > 1 ? `${seat.name}'s turn · ${h}` : h;
  })();

  const panel = (
    <View style={[styles.panel, wide && { width: panelWidth }]}>
      <Card style={styles.turnCard}>
        <Text style={styles.event} numberOfLines={2}>
          {ui.status(state, room)}
        </Text>
        <View style={styles.turnRow}>
          {Controls ? <Controls {...props} /> : null}
          <View style={styles.flex}>
            <Text style={[styles.turnName, { color: turnColor }]} numberOfLines={1}>
              {turn != null ? room.seats[turn].name : 'Game over'}
            </Text>
            {hint ? <Text style={styles.turnHint}>{hint}</Text> : null}
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
            <Text style={styles.progress}>{ui.detail(state, i)}</Text>
            {isHost && !seat.connected && !seat.bot && !over ? (
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
        onBack={() => (over ? leave() : setConfirmLeave(true))}
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

      <ScrollView
        contentContainerStyle={[styles.body, wide && styles.bodyWide]}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.boardFrame}>
          <Board {...props} />
        </View>
        {panel}
      </ScrollView>

      <Modal visible={over} transparent animationType="fade">
        <View style={styles.overlay}>
          <Card style={styles.dialog}>
            <Text style={styles.trophy}>{draw ? '🤝' : '🏆'}</Text>
            <Text style={styles.dialogTitle}>{ui.result(state, room)}</Text>
            {!draw
              ? rankings.map((seat, place) => (
                  <View key={seat} style={styles.rank}>
                    <Text style={styles.rankPlace}>{place + 1}</Text>
                    <View style={[styles.dot, { backgroundColor: seatColor(room.gameId, seat, room.seats.length) }]} />
                    <Text style={styles.rankName}>{room.seats[seat]?.name}</Text>
                    <Text style={styles.rankDetail}>{ui.detail(state, seat)}</Text>
                  </View>
                ))
              : null}
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

/** A little buzz when it becomes one of this device's players' turn. */
function useTurnHaptic(turn: number | null, room: RoomView | null, clientId: string) {
  const lastTurn = useRef<number | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web' || !room) return;
    if (turn != null && turn !== lastTurn.current && room.seats[turn]?.ownerId === clientId) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    lastTurn.current = turn;
  }, [turn, room, clientId]);
}

const useStyles = makeStyles((colors) => ({
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
  turnRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
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
  rankName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  rankDetail: { color: colors.muted, fontSize: 13 },
  dialogBtn: { marginTop: 14 },
  dialogBtnSmall: { marginTop: 8 },
}));
