import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { dropCost, modeLabel, RummyState } from '@/games/rummy/engine';
import { arrange, classify, isJoker, PlayingCard } from '@/games/rummy/melds';
import type { RoomView } from '@/net/protocol';
import { makeStyles, PLAYER_COLORS, radius, useTheme } from '@/ui/theme';

import { PassCurtain, useHandToShow } from '../pass-curtain';
import { PlayingCardView, shortName } from '../playing-card';
import { Button } from '../ui';
import { DealAnimation, dealDuration, FlyingCard, LandingCard } from './fly';
import { tableLayout } from './geometry';
import { RummyHand } from './hand';

const SUIT_ORDER = 'SHCDJ';

/** Initial grouping: the best arrangement, each group sorted, loose cards by suit. */
export function autoGroups(cards: PlayingCard[], wildRank: number): number[][] {
  const a = arrange(cards, wildRank);
  const sortRun = (g: PlayingCard[]) => {
    const jokers = g.filter((c) => isJoker(c, wildRank) && classify(g, -1) !== 'pure');
    const rest = g.filter((c) => !jokers.includes(c));
    const aceHigh = rest.some((c) => c.rank >= 12) && rest.some((c) => c.rank === 1);
    const r = (c: PlayingCard) => (c.rank === 1 && aceHigh ? 14 : c.rank);
    return [...rest.sort((x, y) => r(x) - r(y)), ...jokers];
  };
  const loose = [...a.loose].sort((x, y) => SUIT_ORDER.indexOf(x.suit) - SUIT_ORDER.indexOf(y.suit) || x.rank - y.rank);
  // Split loose cards by suit so they're easy to scan and drag.
  const bySuit = SUIT_ORDER.split('')
    .map((s) => loose.filter((c) => c.suit === s))
    .filter((g) => g.length);
  return [...a.groups.map((g) => sortRun(g.cards)), ...bySuit].map((g) => g.map((c) => c.id));
}

/** Keeps the player's own grouping as the hand changes: drop gone cards, add new ones at the end. */
function reconcile(groups: number[][], cards: PlayingCard[]): number[][] {
  const ids = new Set(cards.map((c) => c.id));
  const kept = groups.map((g) => g.filter((id) => ids.has(id))).filter((g) => g.length);
  const placed = new Set(kept.flat());
  const fresh = cards.filter((c) => !placed.has(c.id)).map((c) => c.id);
  return fresh.length ? [...kept, fresh] : kept;
}

export function RummyTable({
  state,
  room,
  size,
  mySeats,
  seq,
  act,
}: {
  state: RummyState;
  room: RoomView;
  size: number;
  mySeats: number[];
  seq: number;
  act: (seat: number, move: unknown) => void;
}) {
  const styles = useStyles();
  const window = useWindowDimensions();
  const turn = state.over || state.phase === 'roundOver' ? null : state.turn;
  const { seat: handSeat, covered, reveal } = useHandToShow(mySeats, turn);
  const bottomSeat = handSeat ?? mySeats[0] ?? 0;
  const portrait = window.height > window.width;
  const layout = tableLayout(size, Math.round(portrait ? size * 0.92 : size * 0.56), state.seats.length, bottomSeat);
  const cardW = Math.max(40, Math.min(64, size / 8.6));

  const hand = handSeat != null ? (state.hands[handSeat] ?? []) : [];
  const myTurn = turn != null && handSeat === turn && !covered;
  const drawPhase = myTurn && state.phase === 'draw';
  const discardPhase = myTurn && state.phase === 'discard';

  // Selection and the player's own grouping, both reset each deal.
  const handKey = `${state.round}:${handSeat}`;
  const [sel, setSel] = useState<{ key: string; ids: number[] }>({ key: '', ids: [] });
  const [own, setOwn] = useState<{ key: string; groups: number[][] }>({ key: '', groups: [] });
  const selected = sel.key === handKey ? sel.ids.filter((id) => hand.some((c) => c.id === id)) : [];
  const groups = reconcile(own.key === handKey ? own.groups : autoGroups(hand, state.wildRank), hand);
  const setGroups = (g: number[][]) => setOwn({ key: handKey, groups: g });
  const toggle = (id: number) =>
    setSel({ key: handKey, ids: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });

  const single = selected.length === 1 ? hand.find((c) => c.id === selected[0])! : null;
  const canDeclare =
    discardPhase &&
    single != null &&
    arrange(
      hand.filter((c) => c.id !== single.id),
      state.wildRank,
    ).score === 0;
  const blockedThrow = single != null && single.id === state.takenFromDiscard;
  const points = arrange(hand, state.wildRank).score;

  const send = (move: object) => {
    act(state.turn, move);
    setSel({ key: handKey, ids: [] });
  };
  const discard = (id: number) => {
    if (!discardPhase || id === state.takenFromDiscard) return;
    send({ type: 'discard', cardId: id });
  };

  // ---- Animations for the latest move ----
  const last = state.last;
  const handTarget = { x: size / 2, y: layout.height + 40 };
  const seatPoint = (s: number) => (s === handSeat ? handTarget : layout.seats[s]);
  let flight: ReactNode = null;
  if (last && (last.kind === 'draw-stock' || last.kind === 'draw-discard')) {
    flight = (
      <FlyingCard
        key={`f${seq}`}
        from={last.kind === 'draw-stock' ? layout.deck : layout.open}
        to={seatPoint(last.seat)}
        card={last.card}
        faceDown={last.kind === 'draw-stock'}
        width={layout.card}
      />
    );
  } else if (last && (last.kind === 'discard' || last.kind === 'declare') && last.card) {
    flight = (
      <FlyingCard key={`f${seq}`} from={seatPoint(last.seat)} to={layout.open} card={last.card} width={layout.card} />
    );
  }
  const justDiscarded = last?.kind === 'discard' || last?.kind === 'declare';
  const top = state.discard[state.discard.length - 1];
  const under = justDiscarded ? state.discard[state.discard.length - 2] : undefined;
  const dealing = last?.kind === 'deal' && state.hasDrawn.every((d) => !d) && state.phase === 'draw';
  // Remove the deal overlay once it has played for this deal.
  const [dealtRound, setDealtRound] = useState(0);
  const showDeal = dealing && dealtRound !== state.round;
  const activeSeats = state.seats.map((_, i) => i).filter((i) => !state.eliminated[i]);

  return (
    <View style={{ width: size }}>
      {/* Table */}
      <View style={{ width: layout.width, height: layout.height }}>
        <LinearGradient
          colors={['#1E7A4D', '#0F5132']}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={[styles.felt, { borderRadius: Math.min(layout.width, layout.height) / 2 }]}
        />
        <View style={[styles.rail, { borderRadius: Math.min(layout.width, layout.height) / 2 }]} />

        <View style={[styles.info, { top: layout.height / 2 - layout.card * 1.55 }]}>
          <Text style={styles.infoText}>
            {modeLabel(state.options)}
            {state.totalRounds && state.totalRounds > 1 ? ` · Deal ${state.round}/${state.totalRounds}` : ''}
            {state.options.mode === 'pool' ? ` · Deal ${state.round}` : ''}
            {state.multiplier > 1 ? ' · ×2 points' : ''}
          </Text>
        </View>

        {/* Deck with the joker card tucked underneath */}
        <View style={[styles.abs, { left: layout.deck.x - layout.card / 2, top: layout.deck.y - layout.card * 0.7 }]}>
          <View style={[styles.jokerTuck, { left: -layout.card * 0.55 }]}>
            {state.wildCard ? (
              <PlayingCardView
                card={state.wildCard}
                width={layout.card * 0.9}
                label={`Joker card ${shortName(state.wildCard)}`}
              />
            ) : (
              <View>
                <PlayingCardView width={layout.card * 0.9} faceDown label="Hidden joker" />
                <Text style={styles.hiddenMark}>?</Text>
              </View>
            )}
          </View>
          <Pressable
            disabled={!drawPhase}
            onPress={() => send({ type: 'draw', from: 'stock' })}
            accessibilityLabel={`Draw from the deck, ${state.stockCount} cards`}
          >
            {[2, 1, 0].map((o) => (
              <View key={o} style={o ? [styles.abs, { left: -o * 1.5, top: -o * 1.5 }] : undefined}>
                <PlayingCardView width={layout.card} faceDown />
              </View>
            ))}
            {drawPhase ? <Glow width={layout.card} /> : null}
          </Pressable>
        </View>

        {/* Open card */}
        <Pressable
          disabled={!drawPhase || !top}
          onPress={() => send({ type: 'draw', from: 'discard' })}
          accessibilityLabel={top ? `Pick up ${shortName(top)}` : 'Open pile, empty'}
          style={[styles.abs, { left: layout.open.x - layout.card / 2, top: layout.open.y - layout.card * 0.7 }]}
        >
          {under ? (
            <View style={styles.abs}>
              <PlayingCardView card={under} width={layout.card} wild={isJoker(under, state.wildRank)} />
            </View>
          ) : null}
          {top ? (
            justDiscarded ? (
              <LandingCard key={`l${seq}`}>
                <PlayingCardView card={top} width={layout.card} wild={isJoker(top, state.wildRank)} />
              </LandingCard>
            ) : (
              <PlayingCardView card={top} width={layout.card} wild={isJoker(top, state.wildRank)} />
            )
          ) : (
            <View style={[styles.emptyPile, { width: layout.card, height: layout.card * 1.4 }]} />
          )}
          {drawPhase && top ? <Glow width={layout.card} /> : null}
        </Pressable>
        <Text style={[styles.pileCaption, { left: layout.deck.x - 40, top: layout.deck.y + layout.card * 0.78 }]}>
          Deck
        </Text>
        <Text style={[styles.pileCaption, { left: layout.open.x - 40, top: layout.open.y + layout.card * 0.78 }]}>
          Open card
        </Text>

        {/* Seats round the table */}
        {state.seats.map((seat, i) => (
          <Seat
            key={i}
            name={room.seats[i]?.name ?? seat.name}
            color={PLAYER_COLORS[i % PLAYER_COLORS.length]}
            point={layout.seats[i]}
            active={turn === i}
            me={i === handSeat}
            cards={state.handCounts[i]}
            total={state.totalRounds === 1 ? null : state.totals[i]}
            dealer={state.dealer === i}
            status={state.eliminated[i] ? 'out' : state.dropped[i] ? 'dropped' : room.seats[i]?.bot ? 'bot' : null}
          />
        ))}

        {showDeal ? (
          <DealAnimation
            key={`deal${state.round}`}
            deck={layout.deck}
            seats={activeSeats.map((s) => seatPoint(s))}
            width={layout.card}
            onDone={() => setDealtRound(state.round)}
          />
        ) : null}
        {flight}
      </View>

      {/* Hand */}
      {handSeat == null ? (
        <Text style={styles.waiting}>{state.over ? '' : 'Watching — waiting for the next deal…'}</Text>
      ) : covered ? (
        <View style={styles.curtain}>
          <PassCurtain name={room.seats[handSeat].name} onReveal={reveal} />
        </View>
      ) : state.dropped[handSeat] && state.phase !== 'roundOver' ? (
        <Text style={styles.waiting}>
          {state.eliminated[handSeat] ? 'You are out of this pool.' : 'You dropped this deal.'}
        </Text>
      ) : state.phase === 'roundOver' ? null : (
        <DelayedReveal key={`hand${state.round}`} delay={showDeal ? dealDuration(activeSeats.length) : 0}>
          <View style={styles.handHeader}>
            <Text style={styles.handTitle}>
              {mySeats.length > 1 ? `${room.seats[handSeat].name}'s hand` : 'Your hand'} ·{' '}
              <Text style={points === 0 ? styles.ready : undefined}>
                {points === 0 ? 'Ready to declare!' : `${points} pts`}
              </Text>
              {state.hiddenJoker && !state.jokerSeen[handSeat] ? ' · joker hidden until you have a pure sequence' : ''}
            </Text>
            <Button
              title="Sort"
              variant="ghost"
              onPress={() => setGroups(autoGroups(hand, state.wildRank))}
              style={styles.small}
            />
            {drawPhase ? (
              <Button
                title={`Drop (${dropCost(state.options, state.hasDrawn[handSeat]) * state.multiplier})`}
                variant="danger"
                onPress={() => send({ type: 'drop' })}
                style={styles.small}
              />
            ) : null}
          </View>
          <RummyHand
            cards={hand}
            groups={groups}
            onGroupsChange={setGroups}
            wildRank={state.wildRank}
            cardWidth={cardW}
            selected={selected}
            onToggle={toggle}
            onDropOnTable={discardPhase ? discard : undefined}
          />
          <View style={styles.actions}>
            {selected.length > 1 ? (
              <Button
                title={`Group ${selected.length} cards`}
                variant="secondary"
                onPress={() => {
                  setGroups([
                    ...groups.map((g) => g.filter((id) => !selected.includes(id))).filter((g) => g.length),
                    selected,
                  ]);
                  setSel({ key: handKey, ids: [] });
                }}
                style={styles.flex}
              />
            ) : null}
            {discardPhase ? (
              <>
                <Button
                  title={single ? `Discard ${shortName(single)}` : 'Pick a card to discard'}
                  variant="secondary"
                  disabled={!single || blockedThrow}
                  onPress={() => single && discard(single.id)}
                  style={styles.flex}
                />
                <Button
                  title="Declare 🏆"
                  disabled={!canDeclare}
                  onPress={() => single && send({ type: 'declare', cardId: single.id })}
                  style={styles.flex}
                />
              </>
            ) : null}
          </View>
          <Text style={styles.tip}>
            {blockedThrow
              ? "You can't throw back the card you just picked up."
              : drawPhase
                ? 'Your turn: tap the deck or the open card.'
                : discardPhase
                  ? 'Tap a card to select it, or drag it onto the table to discard. Drag cards between groups to arrange.'
                  : 'Drag cards between groups to arrange your hand.'}
          </Text>
        </DelayedReveal>
      )}

      {state.phase === 'roundOver' ? <RoundResults state={state} room={room} mySeats={mySeats} act={act} /> : null}
    </View>
  );
}

function Seat({
  name,
  color,
  point,
  active,
  me,
  cards,
  total,
  dealer,
  status,
}: {
  name: string;
  color: string;
  point: { x: number; y: number };
  active: boolean;
  me: boolean;
  cards: number;
  total: number | null;
  dealer: boolean;
  status: 'out' | 'dropped' | 'bot' | null;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const ring = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const faded = status === 'out' || status === 'dropped';
  return (
    <View
      style={[styles.seat, { left: point.x - 46, top: point.y - 34 }, faded && styles.faded]}
      accessibilityLabel={`${name}${active ? ', playing now' : ''}, ${cards} cards`}
    >
      <View>
        {active ? (
          <Animated.View style={[styles.turnRing, { borderColor: colors.accent, transform: [{ scale: ring }] }]} />
        ) : null}
        <View style={[styles.avatar, { backgroundColor: color }]}>
          <Text style={styles.avatarText}>{status === 'bot' ? '🤖' : name.slice(0, 1).toUpperCase()}</Text>
        </View>
        {dealer ? <Text style={styles.dealer}>D</Text> : null}
        {!me && cards > 0 ? (
          <View style={styles.cardCount}>
            <Text style={styles.cardCountText}>{cards}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.seatName} numberOfLines={1}>
        {me ? 'You' : name}
      </Text>
      {status === 'out' || status === 'dropped' ? (
        <Text style={styles.seatStatus}>{status === 'out' ? 'OUT' : 'Dropped'}</Text>
      ) : total != null ? (
        <Text style={styles.seatTotal}>{total} pts</Text>
      ) : null}
    </View>
  );
}

function Glow({ width }: { width: number }) {
  const styles = useStyles();
  const [p] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [p]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        {
          width: width + 8,
          height: width * 1.4 + 8,
          borderRadius: width * 0.14,
          opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        },
      ]}
    />
  );
}

/** Shows the hand after the deal animation, fading the cards in. */
function DelayedReveal({ delay, children }: { delay: number; children: ReactNode }) {
  const [o] = useState(() => new Animated.Value(delay ? 0 : 1));
  useEffect(() => {
    if (delay) Animated.timing(o, { toValue: 1, duration: 350, delay, useNativeDriver: true }).start();
  }, [o, delay]);
  return <Animated.View style={{ opacity: o }}>{children}</Animated.View>;
}

function RoundResults({
  state,
  room,
  mySeats,
  act,
}: {
  state: RummyState;
  room: RoomView;
  mySeats: number[];
  act: (seat: number, move: unknown) => void;
}) {
  const styles = useStyles();
  const result = state.history[state.history.length - 1];
  const winner = room.seats[result.winner]?.name ?? 'Player';
  const order = state.seats.map((_, i) => i).sort((a, b) => state.totals[a] - state.totals[b]);
  const nextBy = mySeats.find((s) => !state.eliminated[s]) ?? mySeats[0];
  return (
    <View style={styles.results}>
      <Text style={styles.resultsTitle}>
        🏆 {winner} wins deal {result.round}
        {result.multiplier > 1 ? ' (double points)' : ''}
      </Text>
      {state.wildCard ? (
        <Text style={styles.resultsSub}>Joker was {shortName(state.wildCard).slice(0, -1)}s</Text>
      ) : null}
      <View style={styles.resultsHead}>
        <Text style={[styles.resultsCell, styles.resultsName]}>Player</Text>
        <Text style={styles.resultsCell}>This deal</Text>
        <Text style={styles.resultsCell}>Total</Text>
      </View>
      {order.map((i) => (
        <View key={i} style={styles.resultsRow}>
          <View style={[styles.dot, { backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] }]} />
          <Text style={[styles.resultsCell, styles.resultsName]} numberOfLines={1}>
            {room.seats[i]?.name}
            {state.eliminated[i] ? ' · out' : ''}
          </Text>
          <Text style={[styles.resultsCell, i === result.winner && styles.ready]}>{result.scores[i]}</Text>
          <Text style={styles.resultsCell}>{state.totals[i]}</Text>
        </View>
      ))}
      {nextBy != null ? (
        <Button title="Next deal" onPress={() => act(nextBy, { type: 'nextRound' })} style={styles.nextBtn} />
      ) : (
        <Text style={styles.resultsSub}>Waiting for the next deal…</Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  abs: { position: 'absolute', left: 0, top: 0 },
  flex: { flex: 1 },
  felt: { position: 'absolute', left: 10, top: 10, right: 10, bottom: 10 },
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderWidth: 10,
    borderColor: '#5B3A1E',
  },
  info: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  infoText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  // Rotated so its rank corner sticks out on the left of the deck.
  jokerTuck: { position: 'absolute', top: 6, transform: [{ rotate: '-90deg' }] },
  hiddenMark: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '30%',
    textAlign: 'center',
    color: '#FBBF24',
    fontSize: 20,
    fontWeight: '900',
  },
  emptyPile: { borderRadius: 6, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)' },
  pileCaption: {
    position: 'absolute',
    width: 80,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
  glow: { position: 'absolute', left: -4, top: -4, borderWidth: 3, borderColor: '#FDE68A' },
  seat: { position: 'absolute', width: 92, alignItems: 'center' },
  faded: { opacity: 0.45 },
  turnRing: { position: 'absolute', left: -5, top: -5, width: 50, height: 50, borderRadius: 25, borderWidth: 3 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  dealer: {
    position: 'absolute',
    left: -8,
    bottom: -2,
    backgroundColor: '#FBBF24',
    color: '#111827',
    fontSize: 10,
    fontWeight: '900',
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
  cardCount: {
    position: 'absolute',
    right: -12,
    top: -4,
    backgroundColor: '#1E3A8A',
    borderColor: '#fff',
    borderWidth: 1.5,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  cardCountText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  seatName: {
    marginTop: 4,
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    maxWidth: 92,
  },
  seatTotal: { color: '#FDE68A', fontSize: 11, fontWeight: '800', marginTop: 2 },
  seatStatus: { color: '#FCA5A5', fontSize: 11, fontWeight: '900', marginTop: 2 },
  waiting: { color: colors.muted, textAlign: 'center', paddingVertical: 20 },
  curtain: { marginTop: 14 },
  handHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  handTitle: { flex: 1, color: colors.muted, fontSize: 13, fontWeight: '700' },
  ready: { color: '#34D399', fontWeight: '900' },
  small: { minHeight: 34, paddingHorizontal: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tip: { color: colors.faint, fontSize: 12, textAlign: 'center', marginTop: 8 },
  results: {
    marginTop: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  resultsTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  resultsSub: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  resultsHead: { flexDirection: 'row', paddingHorizontal: 4, marginTop: 8, paddingLeft: 24 },
  resultsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 4 },
  resultsCell: { width: 70, color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  resultsName: { flex: 1, textAlign: 'left' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  nextBtn: { marginTop: 10 },
}));
