import { useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/ui/theme';

/** Minimal 0..1 slider (drag or tap the track); works on native and web. */
export function Slider({
  label,
  value,
  onChange,
  color = colors.accent,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color?: string;
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(1);
  const clamp = (x: number) => Math.min(1, Math.max(0, x / width));

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (e) => onChange(clamp(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => onChange(clamp(e.nativeEvent.locationX)),
    onPanResponderTerminationRequest: () => false,
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[styles.track, disabled && styles.disabled]}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          onChange(Math.min(1, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05))))
        }
        {...responder.panHandlers}
      >
        <View pointerEvents="none" style={[styles.rail, { width: `${value * 100}%`, backgroundColor: color }]} />
        <View pointerEvents="none" style={[styles.thumb, { left: value * width - 12, borderColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 4 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  track: { height: 32, justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 16 },
  rail: { position: 'absolute', left: 0, height: 32, borderRadius: 16, opacity: 0.35 },
  thumb: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 3 },
  disabled: { opacity: 0.4 },
});
