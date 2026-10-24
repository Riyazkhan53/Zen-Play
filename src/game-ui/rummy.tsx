import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { shortName } from '@/components/playing-card';
import { RummyTable } from '@/components/rummy/table';
import { Input } from '@/components/ui';
import { modeLabel, normaliseOptions, RummyMode, RummyOptions, RummyState } from '@/games/rummy/engine';
import { makeStyles, radius } from '@/ui/theme';

import type { GameOptionsProps, GameUI } from './types';

const MODES: { mode: RummyMode; title: string; text: string }[] = [
  { mode: 'points', title: 'Points', text: 'One deal. Losers pay their points to the winner.' },
  { mode: 'pool', title: 'Pool', text: 'Deals continue; reach the limit and you are out. Last player in wins.' },
  { mode: 'deals', title: 'Best of', text: 'A fixed number of deals. Lowest total wins.' },
  {
    mode: 'seven',
    title: '7 rounds',
    text: 'Hidden joker you only see once you have a pure sequence. Deals 1 and 7 count double. Lowest total after 7 wins.',
  },
];

function Chip({
  label,
  on,
  onPress,
  disabled,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}
      style={[styles.chip, on && styles.chipOn, disabled && !on && styles.chipDisabled]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** Lobby picker for the match format. Only the host can change it. */
function RummyOptionsPicker({ options, isHost, onChange }: GameOptionsProps) {
  const styles = useStyles();
  let current: Required<RummyOptions>;
  try {
    current = normaliseOptions(options);
  } catch {
    current = { mode: 'pool', poolLimit: 101, deals: 3 };
  }
  const [custom, setCustom] = useState('');
  const set = (patch: Partial<RummyOptions>) => onChange({ ...current, ...patch });
  const info = MODES.find((m) => m.mode === current.mode)!;

  return (
    <View style={styles.options}>
      <Text style={styles.optionsTitle}>Game type</Text>
      <View style={styles.chips}>
        {MODES.map((m) => (
          <Chip
            key={m.mode}
            label={m.title}
            on={current.mode === m.mode}
            disabled={!isHost}
            onPress={() => set({ mode: m.mode })}
          />
        ))}
      </View>
      {current.mode === 'pool' ? (
        <View style={styles.chips}>
          {[101, 201].map((n) => (
            <Chip
              key={n}
              label={String(n)}
              on={current.poolLimit === n}
              disabled={!isHost}
              onPress={() => set({ poolLimit: n })}
            />
          ))}
          {isHost ? (
            <Input
              value={custom}
              onChangeText={(t) => {
                const digits = t.replace(/\D/g, '');
                setCustom(digits);
                const n = Number(digits);
                if (n >= 50 && n <= 1000) set({ poolLimit: n });
              }}
              placeholder="Custom"
              keyboardType="number-pad"
              maxLength={4}
              style={styles.customInput}
              accessibilityLabel="Custom pool limit, 50 to 1000"
            />
          ) : ![101, 201].includes(current.poolLimit) ? (
            <Chip label={String(current.poolLimit)} on onPress={() => {}} disabled />
          ) : null}
        </View>
      ) : null}
      {current.mode === 'deals' ? (
        <View style={styles.chips}>
          {[3, 5].map((n) => (
            <Chip
              key={n}
              label={`Best of ${n}`}
              on={current.deals === n}
              disabled={!isHost}
              onPress={() => set({ deals: n })}
            />
          ))}
        </View>
      ) : null}
      <Text style={styles.optionsText}>{info.text}</Text>
      {!isHost ? <Text style={styles.optionsText}>The host picks the game type.</Text> : null}
    </View>
  );
}

export const rummyUI: GameUI<RummyState> = {
  shape: 'table',
  landscape: true,
  Board: RummyTable,
  Options: RummyOptionsPicker,
  Controls: ({ state }) => {
    const styles = useStyles();
    return (
      <View style={styles.controls}>
        <Text style={styles.mode}>{modeLabel(state.options)}</Text>
        <Text style={styles.round}>
          {state.totalRounds ? `Deal ${state.round} of ${state.totalRounds}` : `Deal ${state.round}`}
          {state.multiplier > 1 ? ' · ×2' : ''}
        </Text>
        <Text style={styles.joker}>
          {state.wildCard ? `Joker: ${shortName(state.wildCard).slice(0, -1)}s` : 'Joker: hidden'}
        </Text>
      </View>
    );
  },
  status(state, room) {
    if (state.phase === 'roundOver') {
      const r = state.history[state.history.length - 1];
      return `${room.seats[r.winner]?.name} won deal ${r.round}`;
    }
    const last = state.last;
    if (!last || last.kind === 'deal') return `Deal ${state.round}: make 2 sequences (1 pure) and group the rest.`;
    const who = room.seats[last.seat]?.name ?? 'Player';
    switch (last.kind) {
      case 'draw-stock':
        return `${who} drew from the deck`;
      case 'draw-discard':
        return `${who} picked up ${last.card ? shortName(last.card) : 'the open card'}`;
      case 'discard':
        return `${who} discarded ${last.card ? shortName(last.card) : 'a card'}`;
      case 'drop':
        return `${who} dropped`;
      default:
        return `${who} declared! 🏆`;
    }
  },
  hint: (state) =>
    state.phase === 'roundOver' ? 'Deal over' : state.phase === 'draw' ? 'Draw a card' : 'Discard or declare',
  detail: (state, seat) =>
    state.eliminated[seat]
      ? `out · ${state.totals[seat]}`
      : state.totalRounds === 1
        ? state.over
          ? `${state.history[0]?.scores[seat] ?? 0} pts`
          : `${state.handCounts[seat]} cards`
        : `${state.totals[seat]} pts`,
  result(state, room) {
    const name = room.seats[state.winner ?? 0]?.name;
    if (state.options.mode === 'points') return `${name} wins ${state.winnings} points!`;
    if (state.options.mode === 'pool') return `${name} wins the pool!`;
    return `${name} wins with ${state.totals[state.winner ?? 0]} points!`;
  },
};

const useStyles = makeStyles((colors) => ({
  controls: { minWidth: 110, gap: 2 },
  mode: { color: colors.text, fontWeight: '900', fontSize: 14 },
  round: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  joker: { color: '#C4B5FD', fontSize: 12, fontWeight: '700' },
  options: {
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  optionsTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  optionsText: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipDisabled: { opacity: 0.5 },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  chipTextOn: { color: colors.accentText },
  customInput: { width: 100, minHeight: 40, borderRadius: radius.md },
}));
