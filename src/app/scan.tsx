import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Screen, TopBar } from '@/components/ui';
import { joinLan, joinOnline } from '@/net/session';
import { colors, radius } from '@/ui/theme';

/** Scan the QR code shown on the host's lobby screen. */
export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const onScan = ({ data }: { data: string }) => {
    if (handled.current) return;
    const { queryParams } = Linking.parse(data);
    const lan = typeof queryParams?.lan === 'string' ? queryParams.lan : null;
    const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
    if (!lan && !code) return;
    handled.current = true;
    if (lan) joinLan(lan);
    else if (code) joinOnline(code);
    router.replace('/room');
  };

  return (
    <Screen>
      <TopBar title="Scan to join" onBack={() => router.back()} />
      {!permission ? null : !permission.granted ? (
        <View style={styles.center}>
          <Text style={styles.text}>Zen-Play needs the camera to scan the host&apos;s QR code.</Text>
          <Button title="Allow camera" onPress={requestPermission} style={styles.allow} />
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScan}
          />
          <View style={styles.frame} pointerEvents="none" />
          <Text style={styles.hint}>Point at the QR code on the host&apos;s screen</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { color: colors.text, fontSize: 16, textAlign: 'center' },
  allow: { minWidth: 180 },
  cameraWrap: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: colors.accent, borderRadius: radius.lg },
  hint: {
    position: 'absolute',
    bottom: 24,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
