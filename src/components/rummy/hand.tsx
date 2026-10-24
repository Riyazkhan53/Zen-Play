import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutRectangle, PanResponder, Text, View } from 'react-native';

import { classify, isJoker, PlayingCard } from '@/games/rummy/melds';
import { makeStyles, useTheme } from '@/ui/theme';

import { PlayingCardView } from '../playing-card';

const PAD = 4;
const LABEL_H = 24;
export const GROUP_GAP = 10;

const LABEL: Record<string, { text: string; color: string }> = {
  pure: { text: 'Pure ✓', color: '#34D399' },
  sequence: { text: 'Sequence ✓', color: '#2DD4BF' },
  set: { text: 'Set ✓', color: '#60A5FA' },
};

/** How many rows the groups wrap onto at this card size (same packing as flex-wrap). */
function rowsFor(width: number, sizes: number[], card: number, step: number) {
  let rows = 1;
  let used = 0;
  for (const n of sizes) {
    const w = card + (n - 1) * step + PAD * 2;
    if (used > 0 && used + GROUP_GAP + w > width) {
      rows++;
      used = w;
    } else used += (used > 0 ? GROUP_GAP : 0) + w;
  }
  return rows;
}

/**
 * Card size and overlap so every group fits across `width` on one row, or on
 * two rows when one row would make the cards too small to read.
 */
export function handLayout(width: number, groupSizes: number[], maxCard: number) {
  const sizes = groupSizes.length ? groupSizes : [1];
  const cards = sizes.reduce((a, b) => a + b, 0);
  const groups = sizes.length;
  const avail = width - (groups - 1) * GROUP_GAP - groups * PAD * 2;
  const loose = Math.max(1, cards - groups);
  // One row: prefer a comfortable overlap, squeezing to 30% visible before shrinking cards.
  let w = Math.min(maxCard, avail / (groups + 0.55 * loose));
  if ((avail - groups * w) / loose < w * 0.3) w = avail / (groups + 0.3 * loose);
  if (w >= Math.min(52, maxCard) || groups < 2) {
    return { cardWidth: Math.floor(w), step: Math.floor(Math.min(w * 0.55, (avail - groups * w) / loose)), rows: 1 };
  }
  // Two rows: the largest card that still packs into two.
  for (let card = maxCard; card >= 34; card -= 2) {
    const step = Math.round(card * 0.5);
    if (rowsFor(width, sizes, card, step) <= 2) return { cardWidth: card, step, rows: 2 };
  }
  return { cardWidth: Math.floor(w), step: Math.floor(w * 0.3), rows: 1 };
}

export interface HandProps {
  cards: PlayingCard[];
  /** Card ids per group, in display order. */
  groups: number[][];
  onGroupsChange: (groups: number[][]) => void;
  wildRank: number;
  cardWidth: number;
  /** Horizontal distance between overlapping cards. */
  step: number;
  selected: number[];
  onToggle?: (id: number) => void;
  /** Called when a card is dragged up onto the table (to discard it). */
  onDropOnTable?: (id: number) => void;
}

/**
 * The player's hand as groups. Tap cards to select them; drag a card to move
 * it to another group (or into the gap after the last group to start a new
 * one); drag it up onto the table to discard.
 */
export function RummyHand(props: HandProps) {
  const styles = useStyles();
  const colors = useTheme();
  const { cards, groups, wildRank, cardWidth, step, selected } = props;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const rects = useRef(new Map<number, LayoutRectangle>());
  const cardHeight = cardWidth * 1.4;

  // Handlers read the latest props without re-creating gesture responders mid-drag.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const drop = (id: number, from: { group: number; index: number }, dx: number, dy: number) => {
    const p = latest.current;
    const origin = rects.current.get(from.group);
    if (!origin) return false;
    const x = origin.x + PAD + from.index * step + cardWidth / 2 + dx;
    const y = origin.y + LABEL_H + cardHeight / 2 + dy;
    if (y < -cardHeight * 0.4) {
      if (p.onDropOnTable) {
        p.onDropOnTable(id);
        return true;
      }
      return false;
    }
    let target = -1;
    for (const [g, r] of rects.current) {
      if (g < p.groups.length && x >= r.x - 8 && x <= r.x + r.width + 8 && y >= r.y - 8 && y <= r.y + r.height + 8)
        target = g;
    }
    const without = p.groups.map((g) => g.filter((c) => c !== id));
    if (target === -1) {
      // Dropped in empty space: start a new group.
      p.onGroupsChange([...without.filter((g) => g.length), [id]]);
      return true;
    }
    const r = rects.current.get(target)!;
    const slot = Math.max(0, Math.round((x - r.x - PAD - cardWidth / 2) / step));
    const dest = [...without[target]];
    dest.splice(Math.min(slot, dest.length), 0, id);
    without[target] = dest;
    p.onGroupsChange(without.filter((g) => g.length));
    return true;
  };

  return (
    <View style={styles.wrap}>
      {groups.map((ids, gi) => {
        const groupCards = ids.map((id) => byId.get(id)).filter((c): c is PlayingCard => c != null);
        // Only real melds get a coloured label; anything else is just "N cards".
        const kind = groupCards.length >= 3 ? classify(groupCards, wildRank) : null;
        const label = kind ? LABEL[kind] : null;
        return (
          <View key={gi} onLayout={(e) => rects.current.set(gi, e.nativeEvent.layout)} style={styles.group}>
            <View style={styles.labelRow}>
              <Text
                style={[
                  styles.label,
                  label
                    ? { color: label.color, borderColor: label.color, backgroundColor: `${label.color}22` }
                    : { color: colors.faint },
                ]}
                numberOfLines={1}
              >
                {label?.text ?? `${groupCards.length} card${groupCards.length === 1 ? '' : 's'}`}
              </Text>
            </View>
            <View style={styles.row}>
              {groupCards.map((card, ci) => (
                <DraggableCard
                  key={card.id}
                  card={card}
                  width={cardWidth}
                  overlap={ci === 0 ? 0 : cardWidth - step}
                  wild={isJoker(card, wildRank) && card.suit !== 'J'}
                  selected={selected.includes(card.id)}
                  onPress={props.onToggle ? () => props.onToggle!(card.id) : undefined}
                  onDrop={(dx, dy) => drop(card.id, { group: gi, index: ci }, dx, dy)}
                />
              ))}
            </View>
            <View style={[styles.underline, { backgroundColor: label?.color ?? 'rgba(255,255,255,0.12)' }]} />
          </View>
        );
      })}
    </View>
  );
}

function DraggableCard({
  card,
  width,
  overlap,
  wild,
  selected,
  onPress,
  onDrop,
}: {
  card: PlayingCard;
  width: number;
  overlap: number;
  wild: boolean;
  selected: boolean;
  onPress?: () => void;
  onDrop: (dx: number, dy: number) => boolean;
}) {
  const styles = useStyles();
  const [pan] = useState(() => new Animated.ValueXY());
  const [lift] = useState(() => new Animated.Value(0));
  const [dragging, setDragging] = useState(false);
  // Latest drop handler for the long-lived gesture responder.
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });

  // The responder must survive re-renders mid-drag. The ref is only read inside the
  // release callback (an event), never during render, which the lint rule can't tell.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        setDragging(true);
        Animated.spring(lift, { toValue: 1, useNativeDriver: false }).start();
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        const moved = onDropRef.current(g.dx, g.dy);
        setDragging(false);
        lift.setValue(0);
        if (moved) pan.setValue({ x: 0, y: 0 });
        else Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        lift.setValue(0);
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  );

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        overlap ? { marginLeft: -overlap } : null,
        { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }], zIndex: dragging ? 100 : 0 },
        dragging && styles.dragging,
      ]}
    >
      <PlayingCardView card={card} width={width} wild={wild} selected={selected} onPress={onPress} />
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: GROUP_GAP,
    rowGap: 6,
    paddingTop: 22,
  },
  group: { paddingHorizontal: PAD, paddingBottom: 6 },
  labelRow: { height: LABEL_H, alignItems: 'flex-start', justifyContent: 'center' },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  underline: { height: 3, borderRadius: 2, marginTop: 6, opacity: 0.9 },
  dragging: {
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
}));
