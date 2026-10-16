import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PassCurtain, useHandToShow } from '@/components/pass-curtain';
import { Button } from '@/components/ui';
import { UNO_HEX, UnoCardView, unoCardName } from '@/components/uno-card';
import { canPlay, UNO_COLORS, UnoCard, UnoColor, UnoState } from '@/games/uno/engine';
import { colors, radius } from '@/ui/theme';

import type { GameUI, GameUIProps } from './types';

function UnoTable({ state, room, size, mySeats, act }: GameUIProps<UnoState>) {
  const turn = state.over ? null : state.turn;
  const { seat: handSeat, covered, reveal } = useHandToShow(mySeats, turn);
  const [callUno, setCallUno] = useState(false);
  const [wildCard, setWildCard] = useState<UnoCard | null>(null);

  const top = state.discard[state.discard.length - 1];
  const hand = handSeat != null ? (state.hands[handSeat] ?? []) : [];
  const myTurn = turn != null && handSeat === turn && !covered;
  const playable = (c: UnoCard) =>
    myTurn && canPlay(c, top, state.color) && (state.drawnCardId == null || c.id === state.drawnCardId);
  const cardWidth = Math.max(44, Math.min(72, size / 7.5));
  const unoArmed = callUno && hand.length === 2;

  const play = (card: UnoCard, color?: UnoColor) => {
    act(state.turn, { type: 'play', cardId: card.id, color, uno: unoArmed });
    setCallUno(false);
  };

  const others = room.seats.map((_, i) => i).filter((i) => i !== handSeat);

  return (
    <View style={{ width: size, gap: 16 }}>
      <View style={styles.opponents}>
        {others.map((i) => (
          <View key={i} style={[styles.opponent, turn === i && styles.opponentActive]}>
            <UnoCardView width={26} faceDown />
            <View>
              <Text style={styles.oppName} numberOfLines={1}>
                {room.seats[i].name}
              </Text>
              <Text style={[styles.oppCount, state.handCounts[i] === 1 && styles.unoAlert]}>
                {state.handCounts[i] === 1 ? 'UNO!' : `${state.handCounts[i]} cards`}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.centre}>
        <Pressable
          onPress={() => act(state.turn, { type: 'draw' })}
          disabled={!myTurn || state.drawnCardId != null}
          accessibilityLabel={`Draw a card, ${state.drawCount} left`}
          style={!myTurn || state.drawnCardId != null ? styles.dimmed : undefined}
        >
          <UnoCardView width={cardWidth * 1.15} faceDown />
          <Text style={styles.pileLabel}>
            {myTurn && state.drawnCardId == null ? 'Tap to draw' : `${state.drawCount} left`}
          </Text>
        </Pressable>
        <View style={[styles.colorRing, { borderColor: UNO_HEX[state.color] }]}>
          <UnoCardView card={top} width={cardWidth * 1.3} />
        </View>
        <View style={styles.direction}>
          <Text style={[styles.arrow, { color: UNO_HEX[state.color] }]}>{state.direction === 1 ? '↻' : '↺'}</Text>
          <Text style={styles.pileLabel}>{state.color}</Text>
        </View>
      </View>

      {handSeat == null ? (
        <Text style={styles.waiting}>{state.over ? '' : 'Waiting for the other players…'}</Text>
      ) : covered ? (
        <PassCurtain name={room.seats[handSeat].name} onReveal={reveal} />
      ) : (
        <View style={styles.handArea}>
          <View style={styles.handHeader}>
            <Text style={styles.handTitle}>
              {mySeats.length > 1 ? `${room.seats[handSeat].name}'s hand` : 'Your hand'} · {hand.length}
            </Text>
            {myTurn && hand.length === 2 ? (
              <Pressable
                onPress={() => setCallUno((v) => !v)}
                style={[styles.unoBtn, unoArmed && styles.unoBtnOn]}
                accessibilityRole="switch"
                accessibilityState={{ checked: unoArmed }}
                accessibilityLabel="Call UNO with your next card"
              >
                <Text style={[styles.unoBtnText, unoArmed && styles.unoBtnTextOn]}>{unoArmed ? 'UNO! ✓' : 'UNO!'}</Text>
              </Pressable>
            ) : null}
            {myTurn && state.drawnCardId != null ? (
              <Button
                title="Keep it & pass"
                variant="secondary"
                onPress={() => act(state.turn, { type: 'pass' })}
                style={styles.passBtn}
              />
            ) : null}
          </View>
          <View style={styles.hand}>
            {hand.map((c) => {
              const ok = playable(c);
              return (
                <UnoCardView
                  key={c.id}
                  card={c}
                  width={cardWidth}
                  dimmed={myTurn && !ok}
                  raised={ok}
                  onPress={ok ? () => (c.color === 'wild' ? setWildCard(c) : play(c)) : undefined}
                />
              );
            })}
          </View>
        </View>
      )}

      <Modal visible={wildCard != null} transparent animationType="fade" onRequestClose={() => setWildCard(null)}>
        <View style={styles.overlay}>
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>Choose a colour</Text>
            <View style={styles.pickerGrid}>
              {UNO_COLORS.map((color) => (
                <Pressable
                  key={color}
                  accessibilityLabel={color}
                  style={[styles.swatch, { backgroundColor: UNO_HEX[color] }]}
                  onPress={() => {
                    if (wildCard) play(wildCard, color);
                    setWildCard(null);
                  }}
                />
              ))}
            </View>
            <Button title="Cancel" variant="ghost" onPress={() => setWildCard(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export const unoUI: GameUI<UnoState> = {
  shape: 'table',
  Board: UnoTable,
  status(state, room) {
    const last = state.last;
    if (!last) return `Match the ${state.color} card by colour or number.`;
    const who = room.seats[last.seat]?.name ?? 'Player';
    if (last.kind === 'draw') return `${who} drew a card`;
    if (last.kind === 'pass') return `${who} kept the card and passed`;
    if (last.kind === 'forgot-uno') return `${who} forgot to call UNO — +2 cards!`;
    const card = last.card ? unoCardName(last.card) : 'a card';
    const extra = last.victim != null ? ` — ${room.seats[last.victim]?.name} draws ${last.drew}` : '';
    return `${who} played ${card}${last.card?.color === 'wild' ? ` (${state.color})` : ''}${extra}`;
  },
  hint: (state) => (state.drawnCardId != null ? 'Play the card you drew, or keep it' : 'Play a matching card or draw'),
  detail: (state, seat) => (state.over ? `${state.handCounts[seat]} left` : `${state.handCounts[seat]} cards`),
  result: (state, room) => `${room.seats[state.rankings[0]]?.name} wins! +${state.points} points`,
};

const styles = StyleSheet.create({
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
  unoAlert: { color: '#F87171', fontWeight: '900' },
  centre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingVertical: 8 },
  pileLabel: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 6, textTransform: 'capitalize' },
  colorRing: { padding: 6, borderWidth: 4, borderRadius: radius.lg },
  direction: { alignItems: 'center' },
  arrow: { fontSize: 40, fontWeight: '900' },
  dimmed: { opacity: 0.5 },
  waiting: { color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  handArea: { gap: 10 },
  handHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  handTitle: { color: colors.muted, fontSize: 13, fontWeight: '700', flex: 1 },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 14 },
  unoBtn: { borderWidth: 2, borderColor: '#F87171', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  unoBtnOn: { backgroundColor: '#F87171' },
  unoBtnText: { color: '#F87171', fontWeight: '900' },
  unoBtnTextOn: { color: '#fff' },
  passBtn: { minHeight: 36 },
  overlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.7)', alignItems: 'center', justifyContent: 'center' },
  picker: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  pickerGrid: { flexDirection: 'row', gap: 10 },
  swatch: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: '#fff' },
});
