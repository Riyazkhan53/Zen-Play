import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Banner, Button, Card, Input, Screen, TopBar } from '@/components/ui';
import { gameMeta } from '@/games/registry';
import { getProfile, useProfile } from '@/lib/profile';
import { clearError, leaveSession, send, useSession } from '@/net/session';
import { seatColor } from '@/ui/seat-colors';
import { colors, radius } from '@/ui/theme';

export default function Room() {
  const session = useSession();
  const { clientId } = useProfile();
  const { width } = useWindowDimensions();
  const [extraName, setExtraName] = useState('');
  const { room, mode, status } = session;

  // Everyone moves to the board as soon as the host starts.
  useEffect(() => {
    if (room?.started) router.replace('/play');
  }, [room?.started]);

  const leave = () => {
    leaveSession();
    router.back();
  };

  if (!room) {
    return (
      <Screen>
        <TopBar title="Lobby" onBack={leave} />
        <View style={styles.center}>
          {status === 'closed' ? (
            <>
              <Text style={styles.problem}>{session.error ?? 'Could not connect'}</Text>
              <Button title="Go back" variant="secondary" onPress={leave} style={styles.goBack} />
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.muted}>{mode === 'online' ? 'Connecting to the game server…' : 'Connecting…'}</Text>
            </>
          )}
        </View>
      </Screen>
    );
  }

  const game = gameMeta(room.gameId)!;
  const isHost = room.hostClientId === getProfile().clientId;
  const full = room.seats.length >= room.maxPlayers;
  const canStart = room.seats.length >= room.minPlayers;
  const wide = width >= 760;

  const joinLink =
    mode === 'online' && room.code
      ? Linking.createURL('/join', { queryParams: { code: room.code } })
      : mode === 'lan-host' && session.lanAddress
        ? Linking.createURL('/join', { queryParams: { lan: session.lanAddress } })
        : null;

  const share = () => {
    if (!room.code || !joinLink) return;
    Share.share({ message: `Join my ${game.name} game on Zen-Play! Room code: ${room.code}\n${joinLink}` });
  };

  const addLocal = () => {
    send({ t: 'addLocal', name: extraName.trim() || `Player ${room.seats.length + 1}` });
    setExtraName('');
  };

  const invite =
    mode === 'online' && room.code ? (
      <Card style={styles.invite}>
        <Text style={styles.inviteLabel}>Room code</Text>
        <Text style={styles.code} selectable accessibilityLabel={`Room code ${room.code.split('').join(' ')}`}>
          {room.code}
        </Text>
        <Text style={styles.muted}>Friends tap Online → enter this code.</Text>
        <Button title="Share invite" variant="secondary" icon="↗" onPress={share} style={styles.shareBtn} />
      </Card>
    ) : mode === 'lan-host' && session.lanAddress && joinLink ? (
      <Card style={styles.invite}>
        <Text style={styles.inviteLabel}>Scan to join on the same Wi-Fi</Text>
        <View style={styles.qr}>
          <QRCode value={joinLink} size={180} backgroundColor="#fff" color="#0B1220" />
        </View>
        <Text style={styles.muted}>or enter this address</Text>
        <Text style={styles.address} selectable>
          {session.lanAddress}
        </Text>
      </Card>
    ) : mode === 'lan-join' ? (
      <Card style={styles.invite}>
        <Text style={styles.inviteLabel}>Connected over Wi-Fi</Text>
        <Text style={styles.muted}>Waiting for the host to start the game.</Text>
      </Card>
    ) : null;

  return (
    <Screen>
      <TopBar title={`${game.emoji}  ${game.name}`} onBack={leave} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {session.error ? <Banner message={session.error} onClose={clearError} /> : null}
        {status === 'reconnecting' ? <Text style={styles.reconnecting}>Reconnecting…</Text> : null}

        <View style={[styles.layout, wide && styles.layoutWide]}>
          {invite ? <View style={wide ? styles.sideCol : undefined}>{invite}</View> : null}

          <Card style={wide ? styles.mainCol : undefined}>
            <Text style={styles.sectionTitle}>
              Players {room.seats.length}/{room.maxPlayers}
            </Text>
            {room.seats.map((seat, i) => {
              const mine = seat.ownerId === clientId;
              const canRemove = isHost || mine;
              return (
                <View key={`${seat.name}-${i}`} style={styles.seat}>
                  <View style={[styles.dot, { backgroundColor: seatColor(room.gameId, i, room.seats.length) }]} />
                  <Text style={styles.seatName} numberOfLines={1}>
                    {seat.bot ? '🤖 ' : ''}
                    {seat.name}
                    {mine ? <Text style={styles.you}> · you</Text> : null}
                    {seat.ownerId === room.hostClientId ? <Text style={styles.you}> · host</Text> : null}
                  </Text>
                  {!seat.connected ? <Text style={styles.offline}>offline</Text> : null}
                  {canRemove && room.seats.length > 1 ? (
                    <Pressable
                      onPress={() => send({ t: 'removeSeat', seat: i })}
                      hitSlop={8}
                      accessibilityLabel={`Remove ${seat.name}`}
                    >
                      <Text style={styles.remove}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}

            {!full ? (
              <>
                <View style={styles.addRow}>
                  <Input
                    value={extraName}
                    onChangeText={setExtraName}
                    placeholder="Add a player on this device"
                    maxLength={20}
                    onSubmitEditing={addLocal}
                    style={styles.flex}
                    accessibilityLabel="New player name"
                  />
                  <Button title="Add" variant="secondary" onPress={addLocal} />
                </View>
                {isHost ? (
                  <Button
                    title="Add computer player"
                    icon="🤖"
                    variant="ghost"
                    onPress={() => send({ t: 'addBot' })}
                    style={styles.addBot}
                  />
                ) : null}
              </>
            ) : null}

            {isHost ? (
              <Button
                title={canStart ? 'Start game' : `Need ${room.minPlayers - room.seats.length} more player(s)`}
                disabled={!canStart}
                onPress={() => send({ t: 'start' })}
                style={styles.start}
              />
            ) : (
              <Text style={[styles.muted, styles.waiting]}>Waiting for the host to start…</Text>
            )}
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  problem: { color: colors.text, fontSize: 16, textAlign: 'center' },
  goBack: { minWidth: 160 },
  muted: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  reconnecting: { color: colors.warning, textAlign: 'center', marginBottom: 10 },
  layout: { gap: 14 },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  sideCol: { width: 320 },
  mainCol: { flex: 1 },
  invite: { alignItems: 'center' },
  inviteLabel: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8 },
  code: { color: colors.accent, fontSize: 44, fontWeight: '900', letterSpacing: 8, marginBottom: 6 },
  shareBtn: { marginTop: 14, alignSelf: 'stretch' },
  qr: { padding: 12, backgroundColor: '#fff', borderRadius: radius.md, marginBottom: 12 },
  address: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 10 },
  seat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dot: { width: 16, height: 16, borderRadius: 8 },
  seatName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  you: { color: colors.muted, fontWeight: '400' },
  offline: { color: colors.warning, fontSize: 12, fontWeight: '700' },
  remove: { color: colors.faint, fontSize: 16, paddingHorizontal: 4 },
  addRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  addBot: { marginTop: 10 },
  start: { marginTop: 18 },
  waiting: { marginTop: 18 },
});
