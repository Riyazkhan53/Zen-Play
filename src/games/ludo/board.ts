import { HOME, LAST_TRACK, LudoColor, START_OFFSET, TRACK_LENGTH, YARD } from './engine';

// Board geometry on a 15×15 grid, as [row, col]. Red's yard is bottom-left,
// then green top-left, yellow top-right, blue bottom-right (clockwise).
export type Cell = [number, number];

function buildTrack(): Cell[] {
  const t: Cell[] = [];
  for (let r = 13; r >= 9; r--) t.push([r, 6]); // up the bottom arm
  for (let c = 5; c >= 0; c--) t.push([8, c]); // left along the left arm
  t.push([7, 0]);
  for (let c = 0; c <= 5; c++) t.push([6, c]); // right along the left arm
  for (let r = 5; r >= 0; r--) t.push([r, 6]); // up the top arm
  t.push([0, 7]);
  for (let r = 0; r <= 5; r++) t.push([r, 8]); // down the top arm
  for (let c = 9; c <= 14; c++) t.push([6, c]); // right along the right arm
  t.push([7, 14]);
  for (let c = 14; c >= 9; c--) t.push([8, c]); // left along the right arm
  for (let r = 9; r <= 14; r++) t.push([r, 8]); // down the bottom arm
  t.push([14, 7]);
  t.push([14, 6]);
  return t;
}

export const TRACK: Cell[] = buildTrack();
if (TRACK.length !== TRACK_LENGTH) throw new Error(`Ludo track has ${TRACK.length} squares`);

// Home column squares, from the track towards the centre.
export const HOME_COLUMN: Record<LudoColor, Cell[]> = {
  red: [
    [13, 7],
    [12, 7],
    [11, 7],
    [10, 7],
    [9, 7],
  ],
  green: [
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
  ],
  yellow: [
    [1, 7],
    [2, 7],
    [3, 7],
    [4, 7],
    [5, 7],
  ],
  blue: [
    [7, 13],
    [7, 12],
    [7, 11],
    [7, 10],
    [7, 9],
  ],
};

// Top-left cell of each 6×6 yard, and the four token spots inside it.
export const YARD_ORIGIN: Record<LudoColor, Cell> = {
  red: [9, 0],
  green: [0, 0],
  yellow: [0, 9],
  blue: [9, 9],
};
const YARD_SPOTS: [number, number][] = [
  [2, 2],
  [2, 4],
  [4, 2],
  [4, 4],
];

// Where a finished token sits inside the centre triangle of its colour.
const HOME_SPOT: Record<LudoColor, [number, number]> = {
  red: [8.1, 7],
  green: [7, 5.9],
  yellow: [5.9, 7],
  blue: [7, 8.1],
};

/** Centre of the cell (row, col in cell units, fractional) for a token. */
export function tokenPosition(color: LudoColor, progress: number, token: number): [number, number] {
  if (progress === YARD) {
    const [r, c] = YARD_ORIGIN[color];
    const [dr, dc] = YARD_SPOTS[token];
    return [r + dr, c + dc];
  }
  if (progress === HOME) {
    const [r, c] = HOME_SPOT[color];
    return [r + 0.5, c + 0.5];
  }
  const cell =
    progress <= LAST_TRACK
      ? TRACK[(START_OFFSET[color] + progress) % TRACK_LENGTH]
      : HOME_COLUMN[color][progress - LAST_TRACK - 1];
  return [cell[0] + 0.5, cell[1] + 0.5];
}
