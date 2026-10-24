// Layout of the oval Rummy table: where each seat sits and where the piles are.

export interface TableLayout {
  width: number;
  height: number;
  /** Seat centres, indexed by seat. */
  seats: { x: number; y: number }[];
  deck: { x: number; y: number };
  open: { x: number; y: number };
  /** Card width used on the table. */
  card: number;
}

/**
 * The player looking at this screen (`bottomSeat`) sits at the bottom; the
 * others spread clockwise along the upper part of the oval, so they never
 * crowd the deck and open card in the middle.
 */
export function tableLayout(width: number, height: number, seatCount: number, bottomSeat: number): TableLayout {
  const rx = width / 2 - 46;
  const ry = height / 2 - 42;
  const cx = width / 2;
  const cy = height / 2;
  const others = seatCount - 1;
  // Upper arc, from left (180°) through the top (270°) to the right (360°).
  const spread = others <= 1 ? 0 : others === 2 ? 110 : 150;
  const seats = Array.from({ length: seatCount }, (_, seat) => {
    const k = (seat - bottomSeat + seatCount) % seatCount;
    if (k === 0) return { x: cx, y: cy + ry };
    const deg = others <= 1 ? 270 : 270 - spread / 2 + ((k - 1) * spread) / (others - 1);
    const angle = (deg * Math.PI) / 180;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
  const card = Math.max(38, Math.min(66, width / 8));
  const pileY = cy + card * 0.45;
  return {
    width,
    height,
    seats,
    deck: { x: cx - card * 0.8, y: pileY },
    open: { x: cx + card * 0.9, y: pileY },
    card,
  };
}
