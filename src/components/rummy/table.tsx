import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { ComponentProps, ReactNode, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';

import { dropCost, modeLabel, RummyState } from '@/games/rummy/engine';
import { arrange, classify, isJoker, PlayingCard } from '@/games/rummy/melds';
import { updateProfile, useProfile } from '@/lib/profile';
import type { RoomView } from '@/net/protocol';
import { makeStyles, PLAYER_COLORS, radius } from '@/ui/theme';

import { PassCurtain, useHandToShow } from '../pass-curtain';
import { PlayingCardView, shortName } from '../playing-card';
import { Button } from '../ui';
import { DealAnimation, dealDuration, FlyingCard, LandingCard } from './fly';
import { tableLayout } from './geometry';
import { handLayout, RummyHand } from './hand';

const SUIT_ORDER = 'SHCDJ';
const PADDING = 12;
const RIM = 5;

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

/** Cards in the order they were dealt, as one group (auto-sort off). */
const dealtOrder = (cards: PlayingCard[]) => (cards.length ? [cards.map((c) => c.id)] : []);

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

export function RummyTable({
  state,
  room,
  size,
  height,
  mySeats,
  seq,
  act,
}: {
  state: RummyState;
  room: RoomView;
  size: number;
  height: number;
  mySeats: number[];
  seq: number;
  act: (seat: number, move: unknown) => void;
}) {
  const styles = useStyles();
  const { autoSort } = useProfile();
  const turn = state.over || state.phase === 'roundOver' ? null : state.turn;
  const { seat: handSeat, covered, reveal } = useHandToShow(mySeats, turn);
  const bottomSeat = handSeat ?? mySeats[0] ?? 0;
  // A23-style full table when the board area is wide (phones are turned sideways for Rummy).
  const landscape = size > height * 1.15;

  const hand = handSeat != null ? (state.hands[handSeat] ?? []) : [];
  const myTurn = turn != null && handSeat === turn && !covered;
  const drawPhase = myTurn && state.phase === 'draw';
  const discardPhase = myTurn && state.phase === 'discard';

  // Selection and the player's own grouping, both reset each deal.
  const handKey = `${state.round}:${handSeat}`;
  const sig = hand
    .map((c) => c.id)
    .sort((a, b) => a - b)
    .join(',');
  const [sel, setSel] = useState<{ key: string; ids: number[] }>({ key: '', ids: [] });
  // `auto`: the grouping was saved with auto-sort on, so switching it on re-sorts at once.
  const [own, setOwn] = useState<{ key: string; sig: string; auto: boolean; groups: number[][] }>({
    key: '',
    sig: '',
    auto: false,
    groups: [],
  });
  const base = own.key === handKey ? own : null;
  // Auto-sort re-groups whenever the cards change (manual moves stay until then);
  // otherwise the dealt order is kept and new cards are added at the right end.
  const groups = !base
    ? autoSort
      ? autoGroups(hand, state.wildRank)
      : dealtOrder(hand)
    : autoSort && (base.sig !== sig || !base.auto)
      ? autoGroups(hand, state.wildRank)
      : reconcile(base.groups, hand);
  const setGroups = (g: number[][]) => setOwn({ key: handKey, sig, auto: autoSort, groups: g });
  const selected = sel.key === handKey ? sel.ids.filter((id) => hand.some((c) => c.id === id)) : [];
  const toggle = (id: number) =>
    setSel({ key: handKey, ids: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });

  const single = selected.length === 1 ? hand.find((c) => c.id === selected[0])! : null;
  const validShow = (id: number) =>
    arrange(
      hand.filter((c) => c.id !== id),
      state.wildRank,
    ).score === 0;
  const canDeclare = discardPhase && single != null && validShow(single.id);
  const blockedThrow = single != null && single.id === state.takenFromDiscard;
  const points = arrange(hand, state.wildRank).score;

  // Short messages over the table ("Draw a card first", …).
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const say = (text: string) => setToast({ text, at: Date.now() });

  const send = (move: object) => {
    act(state.turn, move);
    setSel({ key: handKey, ids: [] });
  };
  const discard = (id: number) => {
    if (drawPhase) return say('Draw from the deck or take the open card first.');
    if (!discardPhase) return say("It's not your turn yet.");
    if (id === state.takenFromDiscard) return say("You can't throw back the card you just took.");
    send({ type: 'discard', cardId: id });
  };
  const show = (id: number) => {
    if (drawPhase) return say('Draw a card before you show.');
    if (!discardPhase) return say("It's not your turn yet.");
    if (!validShow(id)) return say('Not a valid show yet: group every other card into sequences and sets.');
    send({ type: 'declare', cardId: id });
  };
  const [hoverZone, setHoverZone] = useState<string | null>(null);

  // ---- Geometry ----
  const inner = landscape ? size : size - 2 * PADDING;
  let layout: ReturnType<typeof tableLayout>;
  let showSlot: Rect;
  let handBox: Rect;
  let fit: ReturnType<typeof handLayout>;
  const sizes = groups.map((g) => g.length);
  if (landscape) {
    const W = size;
    const H = height;
    const card = Math.max(38, Math.min(62, H * 0.15));
    const pileY = 30 + 16 + card * 0.7;
    const others = state.seats.map((_, i) => i).filter((i) => i !== bottomSeat);
    const order = others.sort(
      (a, b) =>
        ((a - bottomSeat + state.seats.length) % state.seats.length) -
        ((b - bottomSeat + state.seats.length) % state.seats.length),
    );
    const seats: Point[] = state.seats.map(() => ({ x: W / 2, y: H - 24 }));
    order.forEach((s, k) => {
      const t = order.length === 1 ? 0.5 : 0.1 + (0.8 * k) / (order.length - 1);
      seats[s] = { x: W * t, y: 24 + Math.abs(t - 0.5) * 2 * 26 };
    });
    seats[bottomSeat] = { x: W * 0.5, y: H - 24 };
    layout = { width: W, height: H, seats, deck: { x: W * 0.48, y: pileY }, open: { x: W * 0.62, y: pileY }, card };
    showSlot = { x: W * 0.33 - card * 0.6, y: pileY - card * 0.7, width: card * 1.2, height: card * 1.4 };
    const top = pileY + card * 0.7 + 4;
    const bottom = H - 52;
    const handWidth = W * 0.9;
    fit = handLayout(handWidth, sizes, Math.min(100, (bottom - top - 18 - 24 - 14) / 1.4), true);
    handBox = { x: (W - handWidth) / 2, y: top, width: handWidth, height: bottom - top };
  } else {
    layout = tableLayout(inner, Math.round(inner * 1.02), state.seats.length, bottomSeat);
    showSlot = {
      x: layout.open.x + layout.card * 0.75,
      y: layout.open.y - layout.card * 0.7,
      width: layout.card * 1.05,
      height: layout.card * 1.4,
    };
    fit = handLayout(inner, sizes, 76);
    handBox = { x: 0, y: layout.height + 46, width: inner, height: 0 };
  }
  // The hand's position inside the table area, measured in portrait (it sits in the flow).
  const [handOffset, setHandOffset] = useState<Point | null>(null);
  const origin = landscape ? { x: handBox.x, y: handBox.y } : (handOffset ?? { x: 0, y: layout.height + 46 });
  const toHand = (r: Rect): Rect => ({ ...r, x: r.x - origin.x, y: r.y - origin.y });
  const openRect: Rect = {
    x: layout.open.x - layout.card,
    y: layout.open.y - layout.card * 1.1,
    width: layout.card * 2,
    height: layout.card * 2.2,
  };
  const zones = [
    { key: 'show', rect: toHand(showSlot) },
    { key: 'open', rect: toHand(openRect) },
  ];
  const onZoneDrop = (zone: string, id: number) => (zone === 'show' ? show(id) : discard(id));

  // ---- Animations for the latest move ----
  const last = state.last;
  const handTarget = { x: origin.x + handBox.width / 2, y: origin.y + 60 };
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
  const [dealtRound, setDealtRound] = useState(0);
  const showDeal = dealing && dealtRound !== state.round;
  const activeSeats = state.seats.map((_, i) => i).filter((i) => !state.eliminated[i]);
  const tableRadius = landscape ? (height - 52) / 2 : Math.min(layout.width, layout.height) / 2;

  const groupSelected = () => {
    setGroups([...groups.map((g) => g.filter((id) => !selected.includes(id))).filter((g) => g.length), selected]);
    setSel({ key: handKey, ids: [] });
  };

  // ---- Pieces shared by both layouts ----
  const piles = (
    <>
      {/* Show slot: drop (or tap with one card selected) to declare. */}
      <Pressable
        onPress={() => (single ? show(single.id) : say('Drag a card here to show (declare).'))}
        accessibilityRole="button"
        accessibilityLabel="Place show here"
        style={[
          styles.showSlot,
          {
            left: showSlot.x,
            top: showSlot.y,
            width: showSlot.width,
            height: showSlot.height,
            borderRadius: layout.card * 0.12,
          },
          hoverZone === 'show' && styles.zoneHot,
          canDeclare && styles.showReady,
        ]}
      >
        <Text style={[styles.showText, { fontSize: Math.max(9, layout.card * 0.2) }]}>{'Place\nShow\nHere'}</Text>
      </Pressable>

      {/* Deck with the joker card tucked underneath */}
      <View style={[styles.abs, { left: layout.deck.x - layout.card / 2, top: layout.deck.y - layout.card * 0.7 }]}>
        <View style={[styles.jokerTuck, { left: -layout.card * 0.55 }]}>
          {state.wildCard ? (
            <PlayingCardView
              card={state.wildCard}
              width={layout.card * 0.9}
              wild
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
        accessibilityLabel={top ? `Take ${shortName(top)}` : 'Open pile, empty'}
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
        {hoverZone === 'open' || hoverZone === 'table' ? (
          <View
            pointerEvents="none"
            style={[
              styles.dropHint,
              { width: layout.card + 8, height: layout.card * 1.4 + 8, borderRadius: layout.card * 0.14 },
            ]}
          />
        ) : null}
      </Pressable>
      <Text style={[styles.pileCaption, { left: layout.deck.x - 35, top: layout.deck.y + layout.card * 0.76 }]}>
        DECK {state.stockCount}
      </Text>
      <Text style={[styles.pileCaption, { left: layout.open.x - 35, top: layout.open.y + layout.card * 0.76 }]}>
        OPEN
      </Text>
    </>
  );

  const seatsView = state.seats.map((seat, i) => (
    <Seat
      key={i}
      name={room.seats[i]?.name ?? seat.name}
      color={PLAYER_COLORS[i % PLAYER_COLORS.length]}
      point={layout.seats[i]}
      plate={landscape}
      active={turn === i}
      me={i === handSeat}
      cards={state.handCounts[i]}
      total={state.totalRounds === 1 ? null : state.totals[i]}
      dealer={state.dealer === i}
      status={state.eliminated[i] ? 'out' : state.dropped[i] ? 'dropped' : room.seats[i]?.bot ? 'bot' : null}
    />
  ));

  const overlays = (
    <>
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
      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { top: layout.deck.y - layout.card * 1.3 }]}>
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      ) : null}
    </>
  );

  const handView =
    handSeat == null ||
    covered ||
    (state.dropped[handSeat] && state.phase !== 'roundOver') ||
    state.phase === 'roundOver' ? null : (
      <DelayedReveal key={`hand${state.round}`} delay={showDeal ? dealDuration(activeSeats.length) : 0}>
        <RummyHand
          cards={hand}
          groups={groups}
          onGroupsChange={setGroups}
          wildRank={state.wildRank}
          cardWidth={fit.cardWidth}
          step={fit.step}
          selected={selected}
          onToggle={toggle}
          zones={zones}
          onZoneDrop={onZoneDrop}
          onZoneHover={setHoverZone}
        />
      </DelayedReveal>
    );

  const handNote =
    handSeat == null
      ? state.over
        ? ''
        : 'Watching — waiting for the next deal…'
      : state.dropped[handSeat] && state.phase !== 'roundOver'
        ? state.eliminated[handSeat]
          ? 'You are out of this pool.'
          : 'You dropped this deal.'
        : '';

  const actions = (compact: boolean) =>
    handSeat == null || covered || handNote || state.phase === 'roundOver' ? null : (
      <View style={compact ? styles.actionRow : styles.actionBar}>
        <ActionButton
          compact={compact}
          icon="swap-horizontal"
          label="Sort"
          onPress={() => setGroups(autoGroups(hand, state.wildRank))}
        />
        {selected.length > 1 ? (
          <ActionButton
            compact={compact}
            icon="albums-outline"
            label={`Group ${selected.length}`}
            onPress={groupSelected}
          />
        ) : null}
        {drawPhase ? (
          <ActionButton
            compact={compact}
            icon="exit-outline"
            label={`Drop ${dropCost(state.options, state.hasDrawn[handSeat]) * state.multiplier}`}
            tone="danger"
            onPress={() => send({ type: 'drop' })}
          />
        ) : null}
        {discardPhase ? (
          <>
            <ActionButton
              compact={compact}
              icon="arrow-up-circle-outline"
              label="Discard"
              tone="primary"
              disabled={!single || blockedThrow}
              onPress={() => single && discard(single.id)}
            />
            <ActionButton
              compact={compact}
              icon="trophy-outline"
              label="Show"
              tone="gold"
              disabled={!canDeclare}
              onPress={() => single && show(single.id)}
            />
          </>
        ) : null}
      </View>
    );

  const sortToggle = (
    <Pressable
      onPress={() => updateProfile({ autoSort: !autoSort })}
      accessibilityRole="switch"
      accessibilityState={{ checked: autoSort }}
      style={[styles.chip, autoSort && styles.chipOn]}
    >
      <Ionicons
        name={autoSort ? 'checkmark-circle' : 'ellipse-outline'}
        size={14}
        color={autoSort ? '#6EE7B7' : '#CBD5E1'}
      />
      <Text style={styles.chipText}>Auto-sort</Text>
    </Pressable>
  );
  const pointsPill =
    handSeat != null && !handNote && state.phase !== 'roundOver' ? (
      <View style={[styles.pointsPill, points === 0 && styles.pointsReady]}>
        <Text style={[styles.pointsText, points === 0 && styles.pointsTextReady]}>
          {points === 0 ? 'Ready to show' : `${points} pts`}
        </Text>
      </View>
    ) : null;

  const tip = blockedThrow
    ? "You can't throw back the card you just took."
    : drawPhase
      ? 'Your turn — tap the deck or the open card.'
      : discardPhase
        ? 'Drag a card onto the open pile to discard, or onto “Place Show Here” to declare.'
        : 'Drag cards to arrange your hand.';

  const backdrop = (
    <View style={styles.backdrop} pointerEvents="none">
      <LinearGradient colors={['#0E1B3D', '#0A1128', '#060A18']} style={styles.fill} />
      <View style={[styles.blob, styles.blobTeal, { width: inner * 0.6, height: inner * 0.6, borderRadius: inner }]} />
      <View
        style={[styles.blob, styles.blobViolet, { width: inner * 0.5, height: inner * 0.5, borderRadius: inner }]}
      />
    </View>
  );

  const glassTable = (box: Rect) => (
    <View pointerEvents="none" style={[styles.abs, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      <LinearGradient
        colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.3)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.rim, { borderRadius: tableRadius }]}
      />
      <LinearGradient
        colors={['rgba(64,190,255,0.22)', 'rgba(40,60,140,0.28)', 'rgba(120,70,220,0.24)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.glass, { borderRadius: tableRadius - RIM }]}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
        style={[
          styles.sheen,
          { borderTopLeftRadius: tableRadius, borderTopRightRadius: tableRadius, height: box.height * 0.4 },
        ]}
      />
      <View style={[styles.innerLine, { borderRadius: Math.max(0, tableRadius - RIM - 10) }]} />
    </View>
  );

  if (landscape) {
    return (
      <View style={[styles.rootLandscape, { width: size, height }]}>
        {backdrop}
        {glassTable({ x: 4, y: 26, width: size - 8, height: height - 52 })}
        <Text
          style={[styles.modeText, { left: showSlot.x - 96, top: layout.deck.y - 10, width: 86 }]}
          numberOfLines={3}
        >
          {modeLabel(state.options)}
          {state.totalRounds && state.totalRounds > 1 ? `\nDeal ${state.round}/${state.totalRounds}` : ''}
          {state.multiplier > 1 ? '\n×2 points' : ''}
        </Text>
        {piles}
        <View style={[styles.abs, { left: handBox.x, top: handBox.y, width: handBox.width }]}>{handView}</View>
        {handNote ? (
          <Text style={[styles.waiting, styles.landscapeNote, { top: handBox.y + 30 }]}>{handNote}</Text>
        ) : null}
        {seatsView}
        <View style={styles.bottomLeft}>
          {pointsPill}
          {sortToggle}
        </View>
        <View style={styles.bottomRight}>{actions(true)}</View>
        {overlays}
        {covered && handSeat != null ? (
          <View style={styles.overlayCenter}>
            <PassCurtain name={room.seats[handSeat].name} onReveal={reveal} />
          </View>
        ) : null}
        {state.phase === 'roundOver' ? (
          <View style={styles.overlayCenter}>
            <ScrollView style={{ maxHeight: height - 60 }} contentContainerStyle={styles.overlayScroll}>
              <RoundResults state={state} room={room} mySeats={mySeats} act={act} />
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.root, { width: size }]}>
      {backdrop}
      <View style={{ width: layout.width, height: layout.height }}>
        {glassTable({ x: 0, y: 0, width: layout.width, height: layout.height })}
        <View style={[styles.info, { top: layout.deck.y - layout.card * 1.45 }]}>
          <Text style={styles.brand}>ZEN RUMMY</Text>
          <Text style={styles.infoText}>
            {modeLabel(state.options)}
            {state.totalRounds && state.totalRounds > 1 ? ` · Deal ${state.round}/${state.totalRounds}` : ''}
            {state.multiplier > 1 ? ' · ×2 points' : ''}
          </Text>
        </View>
        {piles}
        {seatsView}
        {overlays}
      </View>

      {handNote ? <Text style={styles.waiting}>{handNote}</Text> : null}
      {covered && handSeat != null ? (
        <View style={styles.curtain}>
          <PassCurtain name={room.seats[handSeat].name} onReveal={reveal} />
        </View>
      ) : null}
      {handView ? (
        <>
          <View style={styles.handHeader}>
            <Text style={styles.handTitle} numberOfLines={1}>
              {mySeats.length > 1 && handSeat != null ? `${room.seats[handSeat].name}'s hand` : 'Your hand'}
            </Text>
            {sortToggle}
            {pointsPill}
          </View>
          {state.hiddenJoker && handSeat != null && !state.jokerSeen[handSeat] ? (
            <Text style={styles.tip}>Joker stays hidden until you have a pure sequence.</Text>
          ) : null}
          <View
            onLayout={(e) => {
              const { x, y } = e.nativeEvent.layout;
              // Relative to the table: both sit inside the root's padding.
              if (!handOffset || handOffset.x !== x - PADDING || handOffset.y !== y - PADDING)
                setHandOffset({ x: x - PADDING, y: y - PADDING });
            }}
          >
            {handView}
          </View>
        </>
      ) : null}
      {actions(false)}
      {handView ? <Text style={styles.tip}>{tip}</Text> : null}
      {state.phase === 'roundOver' ? <RoundResults state={state} room={room} mySeats={mySeats} act={act} /> : null}
    </View>
  );
}

type Tone = 'plain' | 'primary' | 'danger' | 'gold';
const TONES: Record<Tone, { bg: string[]; border: string; text: string }> = {
  plain: {
    bg: ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.06)'],
    border: 'rgba(255,255,255,0.22)',
    text: '#E2E8F0',
  },
  primary: { bg: ['#3B82F6', '#1D4ED8'], border: 'rgba(147,197,253,0.6)', text: '#FFFFFF' },
  danger: { bg: ['rgba(239,68,68,0.25)', 'rgba(185,28,28,0.25)'], border: 'rgba(252,165,165,0.6)', text: '#FECACA' },
  gold: { bg: ['#FCD34D', '#F59E0B'], border: 'rgba(254,243,199,0.8)', text: '#422006' },
};

/** Pill button in the glass action bar. */
function ActionButton({
  icon,
  label,
  onPress,
  tone = 'plain',
  disabled,
  compact,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  compact?: boolean;
}) {
  const styles = useStyles();
  const t = TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        compact ? styles.actionCompact : styles.action,
        disabled && styles.actionDisabled,
        pressed && styles.actionPressed,
      ]}
    >
      <LinearGradient colors={t.bg as [string, string]} style={[styles.actionFill, { borderColor: t.border }]}>
        <Ionicons name={icon} size={18} color={t.text} />
        <Text style={[styles.actionText, { color: t.text }]} numberOfLines={1}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

function Seat({
  name,
  color,
  point,
  plate,
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
  /** Horizontal name plate (landscape table) instead of avatar over name. */
  plate?: boolean;
  active: boolean;
  me: boolean;
  cards: number;
  total: number | null;
  dealer: boolean;
  status: 'out' | 'dropped' | 'bot' | null;
}) {
  const styles = useStyles();
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
  if (plate) {
    return (
      <View
        style={[
          styles.plate,
          { left: point.x - 70, top: point.y - 21 },
          active && styles.plateActive,
          faded && styles.faded,
        ]}
        accessibilityLabel={`${name}${active ? ', playing now' : ''}, ${cards} cards`}
      >
        <View>
          {active ? <Animated.View style={[styles.plateRing, { transform: [{ scale: ring }] }]} /> : null}
          <LinearGradient
            colors={[color, '#0F172A']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1.4 }}
            style={styles.plateAvatar}
          >
            <Text style={styles.plateAvatarText}>{status === 'bot' ? '🤖' : name.slice(0, 1).toUpperCase()}</Text>
          </LinearGradient>
          {dealer ? <Text style={[styles.dealer, styles.plateDealer]}>D</Text> : null}
        </View>
        <View style={styles.plateBody}>
          <Text style={styles.plateName} numberOfLines={1}>
            {me ? 'You' : name}
          </Text>
          <Text style={styles.plateSub} numberOfLines={1}>
            {status === 'out'
              ? 'OUT'
              : status === 'dropped'
                ? 'Dropped'
                : total != null
                  ? `${total} pts`
                  : me
                    ? ' '
                    : `${cards} cards`}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View
      style={[styles.seat, { left: point.x - 46, top: point.y - 34 }, faded && styles.faded]}
      accessibilityLabel={`${name}${active ? ', playing now' : ''}, ${cards} cards`}
    >
      <View>
        {active ? <Animated.View style={[styles.turnRing, { transform: [{ scale: ring }] }]} /> : null}
        <LinearGradient
          colors={[color, '#0F172A']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1.4 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{status === 'bot' ? '🤖' : name.slice(0, 1).toUpperCase()}</Text>
        </LinearGradient>
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

const useStyles = makeStyles(() => ({
  abs: { position: 'absolute', left: 0, top: 0 },
  flex: { flex: 1 },
  root: { padding: PADDING, borderRadius: 24, overflow: 'hidden' },
  rootLandscape: { borderRadius: 20, overflow: 'hidden' },
  modeText: {
    position: 'absolute',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textAlign: 'right',
  },
  showSlot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  showText: { color: 'rgba(255,255,255,0.75)', fontWeight: '800', textAlign: 'center' },
  showReady: { borderColor: '#FCD34D', backgroundColor: 'rgba(252,211,77,0.14)' },
  zoneHot: {
    borderColor: '#FDE68A',
    borderStyle: 'solid',
    backgroundColor: 'rgba(253,230,138,0.22)',
    shadowColor: '#FDE68A',
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  dropHint: {
    position: 'absolute',
    left: -4,
    top: -4,
    borderWidth: 3,
    borderColor: '#60A5FA',
    backgroundColor: 'rgba(96,165,250,0.15)',
  },
  toast: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: 360,
    textAlign: 'center',
  },
  bottomLeft: { position: 'absolute', left: 12, bottom: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
  bottomRight: { position: 'absolute', right: 12, bottom: 6 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionCompact: { minWidth: 76 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  chipOn: { borderColor: 'rgba(110,231,183,0.7)', backgroundColor: 'rgba(52,211,153,0.15)' },
  chipText: { color: '#E2E8F0', fontSize: 12, fontWeight: '800' },
  overlayCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3,7,18,0.55)',
    zIndex: 60,
  },
  overlayScroll: { paddingHorizontal: 12, width: 440, maxWidth: '100%' },
  landscapeNote: { position: 'absolute', left: 0, right: 0 },
  plate: {
    position: 'absolute',
    width: 140,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(10,15,35,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  plateActive: { borderColor: '#FACC15', shadowColor: '#FACC15', shadowOpacity: 0.8, shadowRadius: 10 },
  plateRing: {
    position: 'absolute',
    left: -3,
    top: -3,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2.5,
    borderColor: '#FACC15',
  },
  plateAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  plateAvatarText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  plateDealer: { left: undefined, right: -6, bottom: -4 },
  plateBody: { flex: 1, minWidth: 0 },
  plateName: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  plateSub: { color: '#FDE68A', fontSize: 11, fontWeight: '800' },
  backdrop: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  blob: { position: 'absolute', opacity: 0.6, filter: 'blur(50px)' },
  blobTeal: { left: -40, top: -20, backgroundColor: 'rgba(20,184,166,0.35)' },
  blobViolet: { right: -50, top: '30%', backgroundColor: 'rgba(139,92,246,0.35)' },
  rim: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    shadowColor: '#38BDF8',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  glass: {
    position: 'absolute',
    left: RIM,
    top: RIM,
    right: RIM,
    bottom: RIM,
    backgroundColor: 'rgba(10,16,40,0.55)',
  },
  sheen: { position: 'absolute', left: RIM, right: RIM, top: RIM },
  innerLine: {
    position: 'absolute',
    left: RIM + 10,
    top: RIM + 10,
    right: RIM + 10,
    bottom: RIM + 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  info: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 2 },
  brand: { color: 'rgba(255,255,255,0.22)', fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  infoText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
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
    width: 70,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  glow: {
    position: 'absolute',
    left: -4,
    top: -4,
    borderWidth: 3,
    borderColor: '#FDE68A',
    shadowColor: '#FDE68A',
    shadowOpacity: 0.9,
    shadowRadius: 10,
  },
  seat: { position: 'absolute', width: 92, alignItems: 'center' },
  faded: { opacity: 0.45 },
  turnRing: {
    position: 'absolute',
    left: -5,
    top: -5,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: '#FACC15',
    shadowColor: '#FACC15',
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
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
    backgroundColor: '#312E81',
    borderColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  cardCountText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  seatName: {
    marginTop: 5,
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    maxWidth: 92,
  },
  seatTotal: { color: '#FDE68A', fontSize: 11, fontWeight: '800', marginTop: 2 },
  seatStatus: { color: '#FCA5A5', fontSize: 11, fontWeight: '900', marginTop: 2 },
  waiting: { color: 'rgba(255,255,255,0.65)', textAlign: 'center', paddingVertical: 20 },
  curtain: { marginTop: 14 },
  handHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  handTitle: { flex: 1, color: '#E2E8F0', fontSize: 15, fontWeight: '800' },
  pointsPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pointsReady: { backgroundColor: 'rgba(52,211,153,0.2)', borderColor: '#34D399' },
  pointsText: { color: '#E2E8F0', fontSize: 12, fontWeight: '900' },
  pointsTextReady: { color: '#6EE7B7' },
  ready: { color: '#34D399', fontWeight: '900' },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    padding: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  action: { flexGrow: 1, minWidth: 84 },
  actionFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionText: { fontSize: 14, fontWeight: '800' },
  actionDisabled: { opacity: 0.4 },
  actionPressed: { transform: [{ scale: 0.97 }] },
  tip: { color: 'rgba(226,232,240,0.6)', fontSize: 12, textAlign: 'center', marginTop: 8 },
  results: {
    marginTop: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    gap: 6,
  },
  resultsTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  resultsSub: { color: 'rgba(226,232,240,0.7)', fontSize: 13, textAlign: 'center' },
  resultsHead: { flexDirection: 'row', paddingHorizontal: 4, marginTop: 8, paddingLeft: 24 },
  resultsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 4 },
  resultsCell: { width: 70, color: '#F1F5F9', fontSize: 14, fontWeight: '700', textAlign: 'right' },
  resultsName: { flex: 1, textAlign: 'left' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  nextBtn: { marginTop: 10 },
}));
