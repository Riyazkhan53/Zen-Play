import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutRectangle, PanResponder, Text, View } from 'react-native';

import { classify, isJoker, PlayingCard } from '@/games/rummy/melds';
import { makeStyles, radius, useTheme } from '@/ui/theme';

import { PlayingCardView } from '../playing-card';

const OVERLAP = 0.45; // share of each card hidden under the next one
const PAD = 6;
const LABEL_H = 18;

const LABEL: Record<string, { text: string; color: string }> = {
  pure: { text: 'Pure sequence', color: '#34D399' },
  sequence: { text: 'Sequence', color: '#2DD4BF' },
  set: { text: 'Set', color: '#60A5FA' },
};

export interface HandProps {
  cards: PlayingCard[];
  /** Card ids per group, in display order. */
  groups: number[][];
  onGroupsChange: (groups: number[][]) => void;
  wildRank: number;
  cardWidth: number;
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
  const { cards, groups, wildRank, cardWidth, selected } = props;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const rects = useRef(new Map<number, LayoutRectangle>());
  const step = cardWidth * (1 - OVERLAP);
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
    const y = origin.y + LABEL_H + PAD + cardHeight / 2 + dy;
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
          <View
            key={gi}
            onLayout={(e) => rects.current.set(gi, e.nativeEvent.layout)}
            style={[styles.group, label && { borderColor: label.color }]}
          >
            <Text style={[styles.label, { color: label?.color ?? colors.faint }]} numberOfLines={1}>
              {label?.text ?? (groupCards.length ? `${groupCards.length} card${groupCards.length > 1 ? 's' : ''}` : '')}
            </Text>
            <View style={styles.row}>
              {groupCards.map((card, ci) => (
                <DraggableCard
                  key={card.id}
                  card={card}
                  width={cardWidth}
                  first={ci === 0}
                  wild={isJoker(card, wildRank) && card.suit !== 'J'}
                  selected={selected.includes(card.id)}
                  onPress={props.onToggle ? () => props.onToggle!(card.id) : undefined}
                  onDrop={(dx, dy) => drop(card.id, { group: gi, index: ci }, dx, dy)}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DraggableCard({
  card,
  width,
  first,
  wild,
  selected,
  onPress,
  onDrop,
}: {
  card: PlayingCard;
  width: number;
  first: boolean;
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
        !first && { marginLeft: -width * OVERLAP },
        { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }], zIndex: dragging ? 100 : 0 },
        dragging && styles.dragging,
      ]}
    >
      <PlayingCardView card={card} width={width} wild={wild} selected={selected} onPress={onPress} />
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 14 },
  group: {
    padding: PAD,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  label: { height: LABEL_H, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  row: { flexDirection: 'row' },
  dragging: {
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
}));
