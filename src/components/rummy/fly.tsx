import { ReactNode, useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import type { PlayingCard } from '@/games/rummy/melds';

import { PlayingCardView } from '../playing-card';

type Point = { x: number; y: number };

export const FLIGHT_MS = 420;

/**
 * One card gliding from `from` to `to` (centre points) with a little lift and
 * turn, then fading out where it lands. Mount it with a new `key` per move.
 */
export function FlyingCard({
  from,
  to,
  card,
  width,
  faceDown,
}: {
  from: Point;
  to: Point;
  card?: PlayingCard;
  width: number;
  faceDown?: boolean;
}) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: FLIGHT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [t]);

  const height = width * 1.4;
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [from.x - width / 2, to.x - width / 2] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [from.y - height / 2, to.y - height / 2] });
  const scale = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] });
  const opacity = t.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.abs, { opacity, transform: [{ translateX }, { translateY }, { scale }, { rotate }] }]}
    >
      <PlayingCardView card={card} width={width} faceDown={faceDown} />
    </Animated.View>
  );
}

/** Fades a newly placed card in once the flying copy has landed on it. */
export function LandingCard({ children, delay = FLIGHT_MS }: { children: ReactNode; delay?: number }) {
  const [o] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(o, { toValue: 1, duration: 120, delay, useNativeDriver: true }).start();
  }, [o, delay]);
  return <Animated.View style={{ opacity: o }}>{children}</Animated.View>;
}

export const SHUFFLE_MS = 1100;
const DEAL_STAGGER = 55;
const CARDS_PER_SEAT = 3; // a few cards per player is enough to read as dealing

export function dealDuration(seatCount: number) {
  return SHUFFLE_MS + seatCount * CARDS_PER_SEAT * DEAL_STAGGER + FLIGHT_MS;
}

/**
 * Riffle shuffle at the deck (two halves split, fan and merge, twice), then
 * cards dealt round the table to each seat still in the game.
 */
export function DealAnimation({
  deck,
  seats,
  width,
  onDone,
}: {
  deck: Point;
  seats: Point[];
  width: number;
  onDone?: () => void;
}) {
  const [split] = useState(() => new Animated.Value(0));
  const [deal] = useState(() => new Animated.Value(0));
  const height = width * 1.4;
  const flights = seats.length * CARDS_PER_SEAT;

  useEffect(() => {
    const riffle = Animated.sequence([
      Animated.timing(split, {
        toValue: 1,
        duration: SHUFFLE_MS / 4,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(split, {
        toValue: 0,
        duration: SHUFFLE_MS / 4,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    Animated.sequence([
      riffle,
      Animated.sequence([
        Animated.timing(split, { toValue: 1, duration: SHUFFLE_MS / 4, useNativeDriver: true }),
        Animated.timing(split, { toValue: 0, duration: SHUFFLE_MS / 4, useNativeDriver: true }),
      ]),
      Animated.timing(deal, {
        toValue: flights,
        duration: flights * DEAL_STAGGER + FLIGHT_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start(() => onDone?.());
  }, [split, deal, flights, onDone]);

  const half = (dir: 1 | -1) => ({
    transform: [
      { translateX: deck.x - width / 2 },
      { translateY: deck.y - height / 2 },
      { translateX: split.interpolate({ inputRange: [0, 1], outputRange: [0, dir * width * 0.7] }) },
      { rotate: split.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${dir * 14}deg`] }) },
    ],
    // Hide the shuffling deck once dealing starts.
    opacity: deal.interpolate({ inputRange: [0, 0.01, flights], outputRange: [1, 0, 0] }),
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[-1, 1].map((dir) => (
        <Animated.View key={dir} style={[styles.abs, half(dir as 1 | -1)]}>
          <PlayingCardView width={width} faceDown />
        </Animated.View>
      ))}
      {Array.from({ length: flights }, (_, i) => {
        const to = seats[i % seats.length];
        // Card i leaves at time i (in stagger units) and takes ~FLIGHT_MS to arrive.
        const travel = FLIGHT_MS / DEAL_STAGGER;
        const p = deal.interpolate({ inputRange: [i, i + travel], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={[
              styles.abs,
              {
                opacity: deal.interpolate({
                  inputRange: [i - 0.01, i, i + travel - 0.5, i + travel],
                  outputRange: [0, 1, 1, 0],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    translateX: p.interpolate({
                      inputRange: [0, 1],
                      outputRange: [deck.x - width / 2, to.x - width / 2],
                    }),
                  },
                  {
                    translateY: p.interpolate({
                      inputRange: [0, 1],
                      outputRange: [deck.y - height / 2, to.y - height / 2],
                    }),
                  },
                  { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                  { scale: 0.8 },
                ],
              },
            ]}
          >
            <PlayingCardView width={width} faceDown />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
