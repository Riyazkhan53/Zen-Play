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
 * Seats go round the oval clockwise starting from the bottom, which is the
 * player looking at this screen (`bottomSeat`).
 */
export function tableLayout(width: number, height: number, seatCount: number, bottomSeat: number): TableLayout {
  const rx = width / 2 - 46;
  const ry = height / 2 - 40;
  const cx = width / 2;
  const cy = height / 2;
  const seats = Array.from({ length: seatCount }, (_, seat) => {
    const k = (seat - bottomSeat + seatCount) % seatCount;
    const angle = Math.PI / 2 + (k * 2 * Math.PI) / seatCount;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
  const card = Math.max(34, Math.min(58, width / 10));
  return {
    width,
    height,
    seats,
    deck: { x: cx - card * 0.85, y: cy },
    open: { x: cx + card * 0.85, y: cy },
    card,
  };
}
