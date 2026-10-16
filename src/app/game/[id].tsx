import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Banner, Button, Card, Input, Screen, TopBar } from '@/components/ui';
import { gameMeta } from '@/games/registry';
import { lanSupported } from '@/net/lan';
import { clearError, createOnline, hostLan, joinLan, joinOnline, startLocal, useSession } from '@/net/session';
import { makeStyles } from '@/ui/theme';

export default function GameModes() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = gameMeta(id);
  const session = useSession();
  const { width } = useWindowDimensions();
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const wide = width >= 760;

  if (!game || !game.available) {
    return (
      <Screen>
        <TopBar title="Coming soon" onBack={() => router.back()} />
        <Text style={styles.muted}>This game is on its way.</Text>
      </Screen>
    );
  }

  const go = (action: () => void | Promise<void>) => async () => {
    await action();
    router.push('/room');
  };

  return (
    <Screen>
      <TopBar title={`${game.emoji}  ${game.name}`} onBack={() => router.back()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>
            {game.tagline} · {game.players}
          </Text>
          {session.error && session.status === 'closed' ? (
            <Banner message={session.error} onClose={clearError} />
          ) : null}

          <View style={[styles.modes, wide && styles.modesWide]}>
            <Card style={wide ? styles.modeWide : undefined}>
              <Text style={styles.modeIcon}>📱</Text>
              <Text style={styles.modeTitle}>On this device</Text>
              <Text style={styles.modeText}>
                Pass the phone or tablet around, or play against the computer. Works without internet.
              </Text>
              <Button title="Set up players" onPress={go(() => startLocal(game.id))} style={styles.action} />
            </Card>

            <Card style={wide ? styles.modeWide : undefined}>
              <Text style={styles.modeIcon}>🌐</Text>
              <Text style={styles.modeTitle}>Online</Text>
              <Text style={styles.modeText}>Create a room and share the code with friends anywhere.</Text>
              <Button title="Create room" onPress={go(() => createOnline(game.id))} style={styles.action} />
              <View style={styles.row}>
                <Input
                  value={code}
                  onChangeText={(t) => setCode(t.toUpperCase())}
                  placeholder="Room code"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={5}
                  style={styles.rowInput}
                  accessibilityLabel="Room code"
                />
                <Button
                  title="Join"
                  variant="secondary"
                  disabled={code.trim().length < 5}
                  onPress={go(() => joinOnline(code))}
                />
              </View>
            </Card>

            <Card style={wide ? styles.modeWide : undefined}>
              <Text style={styles.modeIcon}>📶</Text>
              <Text style={styles.modeTitle}>Nearby Wi-Fi</Text>
              {lanSupported ? (
                <>
                  <Text style={styles.modeText}>
                    No internet needed. Everyone joins the same Wi-Fi or one phone&apos;s hotspot.
                  </Text>
                  <Button title="Host a game" onPress={go(() => hostLan(game.id))} style={styles.action} />
                  <Button
                    title="Scan host's QR code"
                    variant="secondary"
                    onPress={() => router.push('/scan')}
                    style={styles.secondaryAction}
                  />
                  <View style={styles.row}>
                    <Input
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Host address, e.g. 192.168.1.5"
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      style={styles.rowInput}
                      accessibilityLabel="Host address"
                    />
                    <Button
                      title="Join"
                      variant="secondary"
                      disabled={!address.trim()}
                      onPress={go(() => joinLan(address))}
                    />
                  </View>
                </>
              ) : (
                <Text style={styles.modeText}>
                  Available in the Android and iOS apps. On the web, play online or on this device.
                </Text>
              )}
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  // Inputs beside a button must be allowed to shrink, or they push the button out.
  rowInput: { flex: 1, minWidth: 0 },
  scroll: { paddingBottom: 40 },
  subtitle: { color: colors.muted, fontSize: 15, textAlign: 'center', marginBottom: 18 },
  muted: { color: colors.muted, textAlign: 'center', marginTop: 40 },
  modes: { gap: 14 },
  modesWide: { flexDirection: 'row', alignItems: 'stretch' },
  modeWide: { flex: 1 },
  modeIcon: { fontSize: 30 },
  modeTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 8 },
  modeText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  action: { marginTop: 16 },
  secondaryAction: { marginTop: 10 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
}));
