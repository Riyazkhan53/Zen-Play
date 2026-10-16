import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PassCurtain, useHandToShow } from '@/components/pass-curtain';
import { PlayingCardView, shortName } from '@/components/playing-card';
import { Button } from '@/components/ui';
import { RummyState } from '@/games/rummy/engine';
import { arrange, isJoker, MeldKind, PlayingCard } from '@/games/rummy/melds';
import { colors, radius } from '@/ui/theme';

import type { GameUI, GameUIProps } from './types';

const KIND_LABEL: Record<MeldKind | 'loose', string> = {
  pure: 'Pure sequence',
  sequence: 'Sequence',
  set: 'Set',
  loose: 'Unmatched',
};

function RummyTable({ state, room, size, mySeats, act }: GameUIProps<RummyState>) {
  const turn = state.over ? null : state.turn;
  const { seat: handSeat, covered, reveal } = useHandToShow(mySeats, turn);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const hand = handSeat != null ? (state.hands[handSeat] ?? []) : [];
  const myTurn = turn != null && handSeat === turn && !covered;
  const drawPhase = myTurn && state.phase === 'draw';
  const discardPhase = myTurn && state.phase === 'discard';
  const selected = hand.find((c) => c.id === selectedId) ?? null;
  const cardWidth = Math.max(40, Math.min(62, size / 9));
  const top = state.discard[state.discard.length - 1];

  // Group the hand the best way automatically, so players see their sequences and sets.
  const arrangement = arrange(hand, state.wildRank);
  const groups: { kind: MeldKind | 'loose'; cards: PlayingCard[] }[] = [
    ...arrangement.groups.map((g) => ({ ...g, cards: sortGroup(g.cards, g.kind, state.wildRank) })),
    ...(arrangement.loose.length
      ? [{ kind: 'loose' as const, cards: sortGroup(arrangement.loose, 'loose', state.wildRank) }]
      : []),
  ];
  const canDeclare =
    discardPhase &&
    selected != null &&
    arrange(
      hand.filter((c) => c.id !== selected.id),
      state.wildRank,
    ).score === 0;
  const throwBackBlocked = selected != null && selected.id === state.takenFromDiscard;

  const send = (move: object) => {
    act(state.turn, move);
    setSelectedId(null);
  };

  const others = room.seats.map((_, i) => i).filter((i) => i !== handSeat);

  return (
    <View style={{ width: size, gap: 14 }}>
      <View style={styles.opponents}>
        {others.map((i) => (
          <View key={i} style={[styles.opponent, turn === i && styles.opponentActive]}>
            <PlayingCardView width={22} faceDown />
            <View>
              <Text style={styles.oppName} numberOfLines={1}>
                {room.seats[i].name}
              </Text>
              <Text style={styles.oppCount}>
                {state.dropped[i] ? `dropped (${state.scores[i]})` : `${state.handCounts[i]} cards`}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.centre}>
        <Pressable
          disabled={!drawPhase}
          onPress={() => send({ type: 'draw', from: 'stock' })}
          accessibilityLabel={`Draw from the deck, ${state.stockCount} cards`}
          style={[styles.pile, !drawPhase && styles.dimmed]}
        >
          <PlayingCardView width={cardWidth * 1.1} faceDown />
          <Text style={styles.pileLabel}>Deck</Text>
        </Pressable>
        <Pressable
          disabled={!drawPhase || !top}
          onPress={() => send({ type: 'draw', from: 'discard' })}
          accessibilityLabel={top ? `Pick up ${shortName(top)} from the discard pile` : 'Discard pile, empty'}
          style={[styles.pile, !drawPhase && styles.dimmed]}
        >
          {top ? (
            <PlayingCardView card={top} width={cardWidth * 1.1} wild={isJoker(top, state.wildRank)} />
          ) : (
            <View style={{ width: cardWidth * 1.1, height: cardWidth * 1.54 }} />
          )}
          <Text style={styles.pileLabel}>Open card</Text>
        </Pressable>
        <View style={styles.pile}>
          <View style={styles.wildTilt}>
            <PlayingCardView card={state.wildCard} width={cardWidth * 0.9} />
          </View>
          <Text style={styles.pileLabel}>
            Joker: {state.wildCard.suit === 'J' ? 'A' : shortName(state.wildCard).slice(0, -1)}s
          </Text>
        </View>
      </View>

      {handSeat == null ? (
        <Text style={styles.waiting}>{state.over ? '' : 'Waiting for the other players…'}</Text>
      ) : covered ? (
        <PassCurtain name={room.seats[handSeat].name} onReveal={reveal} />
      ) : state.dropped[handSeat] ? (
        <Text style={styles.waiting}>You dropped this game.</Text>
      ) : (
        <View style={styles.handArea}>
          <View style={styles.handHeader}>
            <Text style={styles.handTitle}>
              {mySeats.length > 1 ? `${room.seats[handSeat].name}'s hand` : 'Your hand'} · {arrangement.score} pts
            </Text>
            {drawPhase ? (
              <Button
                title={`Drop (${state.hasDrawn[handSeat] ? 40 : 20})`}
                variant="ghost"
                onPress={() => send({ type: 'drop' })}
                style={styles.smallBtn}
              />
            ) : null}
          </View>
          {/* Groups wrap onto new rows so the whole hand is always visible. */}
          <View style={styles.groups}>
            {groups.map((g, gi) => (
              <View key={gi} style={[styles.group, g.kind === 'loose' && styles.looseGroup]}>
                <Text style={[styles.groupLabel, g.kind === 'pure' && styles.pureLabel]}>{KIND_LABEL[g.kind]}</Text>
                <View style={styles.groupCards}>
                  {g.cards.map((c, ci) => (
                    <View key={c.id} style={ci > 0 ? { marginLeft: -cardWidth * 0.42 } : undefined}>
                      <PlayingCardView
                        card={c}
                        width={cardWidth}
                        wild={isJoker(c, state.wildRank) && c.suit !== 'J'}
                        selected={c.id === selectedId}
                        onPress={discardPhase ? () => setSelectedId(c.id === selectedId ? null : c.id) : undefined}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
          {discardPhase ? (
            <View style={styles.actions}>
              <Button
                title={selected ? `Discard ${shortName(selected)}` : 'Tap a card to discard'}
                variant="secondary"
                disabled={!selected || throwBackBlocked}
                onPress={() => selected && send({ type: 'discard', cardId: selected.id })}
                style={styles.flex}
              />
              <Button
                title="Declare 🏆"
                disabled={!canDeclare}
                onPress={() => selected && send({ type: 'declare', cardId: selected.id })}
                style={styles.flex}
              />
            </View>
          ) : null}
          {throwBackBlocked ? (
            <Text style={styles.note}>You can&apos;t throw back the card you just picked up.</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const SUIT_ORDER = 'SHCDJ';

/** Order cards for display: runs low to high (ace high in Q-K-A), jokers last; loose cards by suit. */
function sortGroup(cards: PlayingCard[], kind: MeldKind | 'loose', wildRank: number): PlayingCard[] {
  const jokers = kind === 'pure' ? [] : cards.filter((c) => isJoker(c, wildRank));
  const rest = cards.filter((c) => !jokers.includes(c));
  const aceHigh = rest.some((c) => c.rank === 13 || c.rank === 12) && rest.some((c) => c.rank === 1);
  const rank = (c: PlayingCard) => (c.rank === 1 && aceHigh && kind !== 'loose' ? 14 : c.rank);
  const sorted = [...rest].sort((a, b) =>
    kind === 'loose' ? SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || a.rank - b.rank : rank(a) - rank(b),
  );
  return [...sorted, ...jokers];
}

export const rummyUI: GameUI<RummyState> = {
  shape: 'table',
  Board: RummyTable,
  status(state, room) {
    const last = state.last;
    if (!last) return 'Make 2 sequences (1 pure) and group the rest to declare.';
    const who = room.seats[last.seat]?.name ?? 'Player';
    switch (last.kind) {
      case 'draw-stock':
        return `${who} drew from the deck`;
      case 'draw-discard':
        return `${who} picked up ${last.card ? shortName(last.card) : 'the open card'}`;
      case 'discard':
        return `${who} discarded ${last.card ? shortName(last.card) : 'a card'}`;
      case 'drop':
        return `${who} dropped out`;
      case 'declare':
        return `${who} declared! 🏆`;
    }
  },
  hint: (state) => (state.phase === 'draw' ? 'Draw from the deck or the open card' : 'Discard a card, or declare'),
  detail: (state, seat) =>
    state.over ? `${state.scores[seat]} pts` : state.dropped[seat] ? 'dropped' : `${state.handCounts[seat]} cards`,
  result: (state, room) =>
    state.winner == null ? 'Game over' : `${room.seats[state.winner]?.name} wins ${state.winnings} points!`,
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  opponents: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opponent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  opponentActive: { borderColor: colors.accent },
  oppName: { color: colors.text, fontWeight: '700', fontSize: 13, maxWidth: 110 },
  oppCount: { color: colors.muted, fontSize: 12 },
  centre: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 22, paddingVertical: 6 },
  pile: { alignItems: 'center' },
  pileLabel: { color: colors.muted, fontSize: 12, marginTop: 6 },
  wildTilt: { transform: [{ rotate: '-12deg' }] },
  dimmed: { opacity: 0.55 },
  waiting: { color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  handArea: { gap: 8 },
  handHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  handTitle: { color: colors.muted, fontSize: 13, fontWeight: '700', flex: 1 },
  smallBtn: { minHeight: 34, paddingHorizontal: 12 },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 18, paddingBottom: 4 },
  group: {
    padding: 6,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(45,212,191,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.35)',
  },
  looseGroup: { backgroundColor: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.35)' },
  groupLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  pureLabel: { color: colors.accent },
  groupCards: { flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  note: { color: colors.warning, fontSize: 12, textAlign: 'center' },
});
