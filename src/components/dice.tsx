import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { makeStyles } from '@/ui/theme';

// Pip positions on a 3×3 grid for each face.
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
};

/**
 * Tappable die. `rollKey` changes on every roll so the die tumbles even when
 * the same face comes up twice.
 */
export function Dice({
  value,
  rollKey,
  color,
  canRoll,
  onRoll,
  size = 72,
}: {
  value: number | null;
  rollKey: number;
  color: string;
  canRoll: boolean;
  onRoll: () => void;
  size?: number;
}) {
  const styles = useStyles();
  const [spin] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    spin.setValue(0);
    Animated.timing(spin, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  }, [rollKey, spin]);

  useEffect(() => {
    if (!canRoll) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [canRoll, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-200deg', '0deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pip = size * 0.16;

  return (
    <Pressable
      onPress={onRoll}
      disabled={!canRoll}
      accessibilityRole="button"
      accessibilityLabel={canRoll ? 'Roll the dice' : value ? `Dice shows ${value}` : 'Dice'}
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.die,
          {
            width: size,
            height: size,
            borderRadius: size * 0.2,
            borderColor: color,
            transform: [{ rotate }, { scale }],
          },
          canRoll && { shadowColor: color, shadowOpacity: 0.8, shadowRadius: 12, elevation: 8 },
        ]}
      >
        {value ? (
          <View style={[styles.grid, { top: size * 0.16, left: size * 0.16, right: size * 0.16, bottom: size * 0.16 }]}>
            {(PIPS[value] ?? []).map(([r, c], i) => (
              <View
                key={i}
                style={[
                  styles.pip,
                  {
                    width: pip,
                    height: pip,
                    borderRadius: pip / 2,
                    top: `${r * 50}%`,
                    left: `${c * 50}%`,
                    marginTop: r === 0 ? 0 : r === 1 ? -pip / 2 : -pip,
                    marginLeft: c === 0 ? 0 : c === 1 ? -pip / 2 : -pip,
                  },
                ]}
              />
            ))}
          </View>
        ) : (
          <Text style={[styles.tap, { fontSize: size * 0.2 }]}>ROLL</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  die: {
    backgroundColor: '#fff',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
  },
  grid: { position: 'absolute' },
  // Dice faces are always white with dark pips, whatever the app theme.
  pip: { position: 'absolute', backgroundColor: '#0B1220' },
  tap: { color: '#0B1220', fontWeight: '900', letterSpacing: 1 },
}));
