import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutRectangle, PanResponder, Text, View } from 'react-native';

import { cardValue, classify, isJoker, PlayingCard } from '@/games/rummy/melds';
import { makeStyles } from '@/ui/theme';

import { PlayingCardView } from '../playing-card';

const PAD = 4;
const LABEL_H = 24;
export const GROUP_GAP = 12;

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
 * two rows when one row would make the cards too small to read. `oneRow`
 * forces a single row (landscape tables).
 */
export function handLayout(width: number, groupSizes: number[], maxCard: number, oneRow = false) {
  const sizes = groupSizes.length ? groupSizes : [1];
  const cards = sizes.reduce((a, b) => a + b, 0);
  const groups = sizes.length;
  const avail = width - (groups - 1) * GROUP_GAP - groups * PAD * 2;
  const loose = Math.max(1, cards - groups);
  // One row: prefer a comfortable overlap, squeezing to 30% visible before shrinking cards.
  let w = Math.min(maxCard, avail / (groups + 0.55 * loose));
  if ((avail - groups * w) / loose < w * 0.3) w = avail / (groups + 0.3 * loose);
  if (oneRow || w >= Math.min(52, maxCard) || groups < 2) {
    return { cardWidth: Math.floor(w), step: Math.floor(Math.min(w * 0.55, (avail - groups * w) / loose)), rows: 1 };
  }
  // Two rows: the largest card that still packs into two.
  for (let card = maxCard; card >= 34; card -= 2) {
    const step = Math.round(card * 0.5);
    if (rowsFor(width, sizes, card, step) <= 2) return { cardWidth: card, step, rows: 2 };
  }
  return { cardWidth: Math.floor(w), step: Math.floor(w * 0.3), rows: 1 };
}

/** Where a dragged card would land in the hand. */
type Target = { group: number; slot: number } | { newGroupAt: number } | null;

export interface DropZone {
  key: string;
  /** In the hand's own coordinates (negative y is above the hand). */
  rect: { x: number; y: number; width: number; height: number };
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
  /** Targets above the hand, e.g. the open pile and the finish slot. */
  zones?: DropZone[];
  /** A card was dropped on a zone; anywhere else above the hand is `'table'`. */
  onZoneDrop?: (zone: string, id: number) => void;
  /** The zone under a dragged card, for highlighting. */
  onZoneHover?: (zone: string | null) => void;
}

interface Drag {
  id: number;
  /** Card centre when the drag began. */
  origin: { x: number; y: number };
  target: Target;
  zone: string | null;
}

/**
 * The player's hand as groups. Tap a card to select it. Drag a card and the
 * others open a gap where it will land: inside a group, between groups (a new
 * group), or up onto the table (discard, declare).
 */
export function RummyHand(props: HandProps) {
  const styles = useStyles();
  const { cards, groups, wildRank, cardWidth, step, selected } = props;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const rects = useRef(new Map<number, LayoutRectangle>());
  const cardHeight = cardWidth * 1.4;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost] = useState(() => new Animated.ValueXY());

  // Gesture callbacks read the latest values without re-creating responders mid-drag.
  const latest = useRef({ props, drag, step, cardWidth, cardHeight });
  useEffect(() => {
    latest.current = { props, drag, step, cardWidth, cardHeight };
  });

  const targetAt = (x: number, y: number, id: number): { target: Target; zone: string | null } => {
    const { props: p, cardHeight: ch, step: st, cardWidth: cw } = latest.current;
    // Zones first: in landscape the piles sit just above the hand.
    // Generous hit area: the card's centre need only be near the zone, not inside it.
    const mx = cw * 0.5;
    const my = ch * 0.3;
    const zone = p.zones?.find(
      (z) =>
        x >= z.rect.x - mx &&
        x <= z.rect.x + z.rect.width + mx &&
        y >= z.rect.y - my &&
        y <= z.rect.y + z.rect.height + my,
    );
    if (zone) return { target: null, zone: zone.key };
    if (y < -ch * 0.2) return { target: null, zone: 'table' };
    const placed = [...rects.current.entries()].filter(([g]) => g < p.groups.length);
    if (!placed.length) return { target: null, zone: null };
    // The row nearest the finger, then the group (or gap) under it.
    const rowY = placed.reduce(
      (best, [, r]) => (Math.abs(r.y + r.height / 2 - y) < Math.abs(best - y) ? r.y + r.height / 2 : best),
      placed[0][1].y + placed[0][1].height / 2,
    );
    const row = placed.filter(([, r]) => Math.abs(r.y + r.height / 2 - rowY) < 4).sort((a, b) => a[1].x - b[1].x);
    for (let i = 0; i < row.length; i++) {
      const [g, r] = row[i];
      if (x >= r.x - 2 && x <= r.x + r.width + 2) {
        const count = p.groups[g].filter((c) => c !== id).length;
        const slot = Math.max(0, Math.min(count, Math.round((x - r.x - PAD - cw / 2) / st)));
        return { target: { group: g, slot }, zone: null };
      }
      if (x < r.x) return { target: { newGroupAt: g }, zone: null };
    }
    return { target: { newGroupAt: row[row.length - 1][0] + 1 }, zone: null };
  };

  const begin = (id: number, group: number, index: number) => {
    const r = rects.current.get(group);
    if (!r) return;
    const { step: st, cardWidth: cw, cardHeight: ch } = latest.current;
    const origin = { x: r.x + PAD + index * st + cw / 2, y: r.y + LABEL_H + ch / 2 };
    ghost.setValue({ x: 0, y: 0 });
    setDrag({ id, origin, target: { group, slot: index }, zone: null });
  };

  const move = (dx: number, dy: number) => {
    const d = latest.current.drag;
    if (!d) return;
    ghost.setValue({ x: dx, y: dy });
    const next = targetAt(d.origin.x + dx, d.origin.y + dy, d.id);
    if (JSON.stringify(next.target) !== JSON.stringify(d.target) || next.zone !== d.zone) {
      if (next.zone !== d.zone) latest.current.props.onZoneHover?.(next.zone);
      setDrag({ ...d, ...next });
    }
  };

  const end = (dx: number, dy: number) => {
    const d = latest.current.drag;
    const p = latest.current.props;
    setDrag(null);
    p.onZoneHover?.(null);
    if (!d) return;
    const { target, zone } = targetAt(d.origin.x + dx, d.origin.y + dy, d.id);
    if (zone) {
      p.onZoneDrop?.(zone, d.id);
      return;
    }
    if (!target) return;
    const without = p.groups.map((g) => g.filter((c) => c !== d.id));
    if ('group' in target) {
      without[target.group] = [...without[target.group]];
      without[target.group].splice(target.slot, 0, d.id);
    } else {
      without.splice(target.newGroupAt, 0, [d.id]);
    }
    p.onGroupsChange(without.filter((g) => g.length));
  };

  const dragging = drag?.id ?? null;
  const target = drag?.target ?? null;
  const gap = (key: string) => <View key={key} style={{ width: step }} />;
  const draggedCard = dragging != null ? byId.get(dragging) : undefined;

  return (
    <View style={styles.wrap}>
      {groups.map((ids, gi) => {
        const groupCards = ids.map((id) => byId.get(id)).filter((c): c is PlayingCard => c != null);
        const kind = groupCards.length >= 3 ? classify(groupCards, wildRank) : null;
        const label = kind ? LABEL[kind] : null;
        const visible = groupCards.filter((c) => c.id !== dragging);
        const gapAt = target && 'group' in target && target.group === gi ? target.slot : -1;
        let shown = 0;
        const row: React.ReactNode[] = [];
        groupCards.forEach((card) => {
          const hidden = card.id === dragging;
          if (!hidden && shown === gapAt) row.push(gap(`gap${gi}`));
          row.push(
            <DraggableCard
              key={card.id}
              card={card}
              width={cardWidth}
              overlap={hidden || (shown === 0 && gapAt !== 0) ? 0 : cardWidth - step}
              hidden={hidden}
              wild={isJoker(card, wildRank) && card.suit !== 'J'}
              selected={selected.includes(card.id)}
              onPress={props.onToggle ? () => props.onToggle!(card.id) : undefined}
              onStart={() => begin(card.id, gi, visible.indexOf(card) === -1 ? 0 : groupCards.indexOf(card))}
              onMove={move}
              onEnd={end}
            />,
          );
          if (!hidden) shown++;
        });
        if (gapAt >= shown && gapAt >= 0) row.push(gap(`gap${gi}`));
        const newGroupHere = target && 'newGroupAt' in target && target.newGroupAt === gi;
        return [
          newGroupHere ? <NewGroupSlot key={`new${gi}`} width={cardWidth} /> : null,
          <View key={gi} onLayout={(e) => rects.current.set(gi, e.nativeEvent.layout)} style={styles.group}>
            <View style={styles.labelRow}>
              <Text
                style={[
                  styles.label,
                  label
                    ? { color: label.color, borderColor: label.color, backgroundColor: `${label.color}22` }
                    : { color: '#FCA5A5', backgroundColor: 'rgba(0,0,0,0.35)' },
                ]}
                numberOfLines={1}
              >
                {label?.text ?? looseLabel(groupCards, wildRank)}
              </Text>
            </View>
            <View style={[styles.row, { minHeight: cardHeight }]}>{row}</View>
            <View style={[styles.underline, { backgroundColor: label?.color ?? 'rgba(255,255,255,0.12)' }]} />
          </View>,
        ];
      })}
      {target && 'newGroupAt' in target && target.newGroupAt >= groups.length ? (
        <NewGroupSlot width={cardWidth} />
      ) : null}

      {drag && draggedCard ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ghost,
            {
              left: drag.origin.x - cardWidth / 2,
              top: drag.origin.y - cardHeight / 2,
              transform: [{ translateX: ghost.x }, { translateY: ghost.y }, { scale: 1.1 }, { rotate: '-4deg' }],
            },
          ]}
        >
          <PlayingCardView
            card={draggedCard}
            width={cardWidth}
            wild={isJoker(draggedCard, wildRank) && draggedCard.suit !== 'J'}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** "✕ Invalid (30)" for an unfinished group, "10 pts" for a single card. */
function looseLabel(cards: PlayingCard[], wildRank: number) {
  const pts = cards.reduce((n, c) => n + cardValue(c, wildRank), 0);
  return cards.length > 1 ? `✕ Invalid (${pts})` : `${pts} pts`;
}

/** Dashed outline where a dragged card would start a new group. */
function NewGroupSlot({ width }: { width: number }) {
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, styles.newLabel]}>New group</Text>
      </View>
      <View style={[styles.newSlot, { width, height: width * 1.4, borderRadius: width * 0.09 }]} />
    </View>
  );
}

function DraggableCard({
  card,
  width,
  overlap,
  hidden,
  wild,
  selected,
  onPress,
  onStart,
  onMove,
  onEnd,
}: {
  card: PlayingCard;
  width: number;
  overlap: number;
  hidden: boolean;
  wild: boolean;
  selected: boolean;
  onPress?: () => void;
  onStart: () => void;
  onMove: (dx: number, dy: number) => void;
  onEnd: (dx: number, dy: number) => void;
}) {
  // Latest handlers for the long-lived gesture responder.
  const handlers = useRef({ onStart, onMove, onEnd });
  useEffect(() => {
    handlers.current = { onStart, onMove, onEnd };
  });

  // The responder must survive re-renders mid-drag. The ref is only read inside
  // gesture callbacks (events), never during render, which the lint rule can't tell.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => handlers.current.onStart(),
      onPanResponderMove: (_, g) => handlers.current.onMove(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => handlers.current.onEnd(g.dx, g.dy),
      onPanResponderTerminate: () => handlers.current.onEnd(0, 0),
    }),
  );

  return (
    <View
      {...responder.panHandlers}
      // The dragged card stays mounted (it owns the gesture) but takes no space.
      style={[overlap ? { marginLeft: -overlap } : null, hidden && { width: 0, opacity: 0 }]}
    >
      <PlayingCardView card={card} width={width} wild={wild} selected={selected} onPress={onPress} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: GROUP_GAP,
    rowGap: 6,
    paddingTop: 18,
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
  newLabel: { color: '#FDE68A' },
  row: { flexDirection: 'row' },
  underline: { height: 3, borderRadius: 2, marginTop: 6, opacity: 0.9 },
  newSlot: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(253,230,138,0.8)',
    backgroundColor: 'rgba(253,230,138,0.08)',
  },
  ghost: {
    position: 'absolute',
    zIndex: 100,
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
}));
