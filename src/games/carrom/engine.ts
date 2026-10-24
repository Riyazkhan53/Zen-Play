import { Difficulty, GameDef, IllegalMoveError, Rng, SeatInfo } from '../types';

// Board coordinates run 0..100 with y pointing down (screen-style).
// Each seat plays from one side: 0 bottom, 1 right, 2 top, 3 left.
export const BOARD = 100;
export const COIN_R = 2.15;
export const STRIKER_R = 2.8;
export const POCKET_R = 3.3;
export const POCKETS: [number, number][] = [
  [3.2, 3.2],
  [96.8, 3.2],
  [3.2, 96.8],
  [96.8, 96.8],
];
const BASELINE_Y = 86.3;
const BASELINE_MIN = 20;
const BASELINE_MAX = 80;
const CENTRE = 50;

export type CoinKind = 'white' | 'black' | 'queen';
export type TeamColor = 'white' | 'black';

export interface Coin {
  id: number;
  kind: CoinKind;
  x: number;
  y: number;
}

export type CarromMove = {
  type: 'shot';
  /** Striker position along the player's baseline, 0 (their left) to 1 (their right). */
  pos: number;
  /** Direction in board coordinates, radians. */
  angle: number;
  /** 0..1 */
  power: number;
};

export interface CarromShot {
  seat: number;
  /** Ids in frame order; the striker is id -1 and always first. */
  ids: number[];
  /** Kind of each piece, in the same order as `ids`. */
  kinds: (CoinKind | 'striker')[];
  /** Positions every few physics steps: [x0, y0, x1, y1, ...]; -1 once pocketed. */
  frames: number[][];
  pocketed: CoinKind[];
  foul: boolean;
  message: string;
}

export interface CarromState {
  seats: SeatInfo[];
  /** Team per seat: 0 plays white coins, 1 plays black. */
  teams: number[];
  coins: Coin[];
  pocketed: { white: number; black: number };
  queen: 'board' | { pendingSeat: number } | { coveredBy: number };
  turn: number;
  shots: number;
  last: CarromShot | null;
  over: boolean;
  winnerTeam: number | null;
  points: number;
  rankings: number[];
}

export const teamColor = (team: number): TeamColor => (team === 0 ? 'white' : 'black');

/** Board side a seat plays from: 2 players face each other, 4 sit round the board. */
export function sideOf(seat: number, seatCount: number): number {
  return seatCount === 2 ? seat * 2 : seat;
}

/** Rotates a point a quarter turn anticlockwise on screen (bottom side → right side). */
function quarter(x: number, y: number, times: number): [number, number] {
  let p: [number, number] = [x, y];
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) p = [p[1], BOARD - p[0]];
  return p;
}

/** Striker centre on a side's baseline. */
export function strikerSpot(side: number, pos: number): [number, number] {
  const x = BASELINE_MIN + Math.min(1, Math.max(0, pos)) * (BASELINE_MAX - BASELINE_MIN);
  return quarter(x, BASELINE_Y, side);
}

export function baselineEnds(side: number): [[number, number], [number, number]] {
  return [quarter(BASELINE_MIN, BASELINE_Y, side), quarter(BASELINE_MAX, BASELINE_Y, side)];
}

function initialCoins(): Coin[] {
  const d = COIN_R * 2 + 0.08;
  const spots: [number, number][] = [];
  for (let k = 0; k < 6; k++) spots.push([Math.cos((k * Math.PI) / 3) * d, Math.sin((k * Math.PI) / 3) * d]);
  for (let k = 0; k < 6; k++) {
    spots.push([Math.cos((k * Math.PI) / 3) * d * 2, Math.sin((k * Math.PI) / 3) * d * 2]);
    const a = (k * Math.PI) / 3 + Math.PI / 6;
    spots.push([Math.cos(a) * d * Math.sqrt(3), Math.sin(a) * d * Math.sqrt(3)]);
  }
  const coins: Coin[] = [{ id: 0, kind: 'queen', x: CENTRE, y: CENTRE }];
  spots.forEach(([dx, dy], i) => {
    coins.push({ id: i + 1, kind: i % 2 === 0 ? 'white' : 'black', x: CENTRE + dx, y: CENTRE + dy });
  });
  return coins;
}

// ---------- Physics ----------

const MAX_SPEED = 4.2; // board units per step at full power
const FRICTION = 0.986;
const DRAG = 0.004;
const WALL_BOUNCE = 0.75;
const STRIKER_MASS = 1.5;
const FRAME_EVERY = 3;
const MAX_STEPS = 2500;

interface Body {
  id: number;
  kind: CoinKind | 'striker';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  m: number;
  gone: boolean;
}

export interface SimResult {
  coins: Coin[];
  pocketed: CoinKind[];
  strikerPocketed: boolean;
  ids: number[];
  kinds: (CoinKind | 'striker')[];
  frames: number[][];
}

export function simulate(coins: Coin[], striker: [number, number], angle: number, power: number): SimResult {
  const speed = 0.5 + Math.min(1, Math.max(0, power)) * (MAX_SPEED - 0.5);
  const bodies: Body[] = [
    {
      id: -1,
      kind: 'striker',
      x: striker[0],
      y: striker[1],
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: STRIKER_R,
      m: STRIKER_MASS,
      gone: false,
    },
    ...coins.map((c) => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, vx: 0, vy: 0, r: COIN_R, m: 1, gone: false })),
  ];
  const pocketed: CoinKind[] = [];
  let strikerPocketed = false;
  const frames: number[][] = [];
  const snapshot = () =>
    frames.push(bodies.flatMap((b) => (b.gone ? [-1, -1] : [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10])));
  snapshot();

  for (let step = 0; step < MAX_STEPS; step++) {
    let fastest = 0;
    for (const b of bodies) if (!b.gone) fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
    if (fastest < 0.02) break;
    // Small substeps so fast pieces can't pass through each other.
    const sub = Math.max(1, Math.ceil(fastest / 0.4));
    for (let s = 0; s < sub; s++) {
      for (const b of bodies) {
        if (b.gone) continue;
        b.x += b.vx / sub;
        b.y += b.vy / sub;
        // Walls
        if (b.x < b.r) [b.x, b.vx] = [b.r, Math.abs(b.vx) * WALL_BOUNCE];
        if (b.x > BOARD - b.r) [b.x, b.vx] = [BOARD - b.r, -Math.abs(b.vx) * WALL_BOUNCE];
        if (b.y < b.r) [b.y, b.vy] = [b.r, Math.abs(b.vy) * WALL_BOUNCE];
        if (b.y > BOARD - b.r) [b.y, b.vy] = [BOARD - b.r, -Math.abs(b.vy) * WALL_BOUNCE];
        // Pockets
        for (const [px, py] of POCKETS) {
          if (Math.hypot(b.x - px, b.y - py) < POCKET_R) {
            b.gone = true;
            if (b.kind === 'striker') strikerPocketed = true;
            else pocketed.push(b.kind);
            break;
          }
        }
      }
      // Collisions between pieces (elastic, unequal masses).
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        if (a.gone) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          if (b.gone) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const min = a.r + b.r;
          if (dist >= min || dist === 0) continue;
          const nx = dx / dist;
          const ny = dy / dist;
          // Separate the overlap.
          const push = (min - dist) / 2;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel <= 0) continue;
          const impulse = (2 * rel * 0.95) / (a.m + b.m);
          a.vx -= impulse * b.m * nx;
          a.vy -= impulse * b.m * ny;
          b.vx += impulse * a.m * nx;
          b.vy += impulse * a.m * ny;
        }
      }
    }
    for (const b of bodies) {
      if (b.gone) continue;
      const v = Math.hypot(b.vx, b.vy);
      if (v === 0) continue;
      const nv = Math.max(0, v * FRICTION - DRAG);
      b.vx *= nv / v;
      b.vy *= nv / v;
    }
    if (step % FRAME_EVERY === 0) snapshot();
  }
  snapshot();

  return {
    coins: bodies
      .filter((b) => b.kind !== 'striker' && !b.gone)
      .map((b) => ({ id: b.id, kind: b.kind as CoinKind, x: b.x, y: b.y })),
    pocketed,
    strikerPocketed,
    ids: bodies.map((b) => b.id),
    kinds: bodies.map((b) => b.kind),
    frames,
  };
}

/** Puts a coin back on the board as close to the centre as possible. */
function placeAtCentre(coins: Coin[], coin: Omit<Coin, 'x' | 'y'>): Coin[] {
  for (let ring = 0; ring < 12; ring++) {
    const steps = ring === 0 ? 1 : ring * 8;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const x = CENTRE + Math.cos(a) * ring * COIN_R * 1.2;
      const y = CENTRE + Math.sin(a) * ring * COIN_R * 1.2;
      if (coins.every((c) => Math.hypot(c.x - x, c.y - y) >= COIN_R * 2)) return [...coins, { ...coin, x, y }];
    }
  }
  return [...coins, { ...coin, x: CENTRE, y: CENTRE }];
}

function strikerBlocked(coins: Coin[], spot: [number, number]) {
  return coins.some((c) => Math.hypot(c.x - spot[0], c.y - spot[1]) < COIN_R + STRIKER_R);
}

export function strikerFits(state: CarromState, seat: number, pos: number) {
  return !strikerBlocked(state.coins, strikerSpot(sideOf(seat, state.seats.length), pos));
}

// ---------- Rules ----------

function isCovered(queen: CarromState['queen']): queen is { coveredBy: number } {
  return typeof queen === 'object' && 'coveredBy' in queen;
}

export const carrom: GameDef<CarromState, CarromMove> = {
  id: 'carrom',
  minPlayers: 2,
  maxPlayers: 4,

  setup(seats) {
    if (seats.length !== 2 && seats.length !== 4)
      throw new IllegalMoveError('Carrom is for 2 players or 4 in two teams');
    return {
      seats,
      teams: seats.map((_, i) => i % 2),
      coins: initialCoins(),
      pocketed: { white: 0, black: 0 },
      queen: 'board',
      turn: 0,
      shots: 0,
      last: null,
      over: false,
      winnerTeam: null,
      points: 0,
      rankings: [],
    };
  },

  currentSeat: (state) => (state.over ? null : state.turn),

  applyMove(state, seat, move) {
    if (state.over) throw new IllegalMoveError('The game is over');
    if (seat !== state.turn) throw new IllegalMoveError('Not your turn');
    if (move.type !== 'shot' || ![move.pos, move.angle, move.power].every(Number.isFinite)) {
      throw new IllegalMoveError('Invalid shot');
    }
    const spot = strikerSpot(sideOf(seat, state.seats.length), move.pos);
    if (strikerBlocked(state.coins, spot)) throw new IllegalMoveError('Move the striker off the coin');

    const sim = simulate(state.coins, spot, move.angle, move.power);
    const team = state.teams[seat];
    const own = teamColor(team);
    const opp = teamColor(1 - team);
    const ownIn = sim.pocketed.filter((k) => k === own).length;
    const oppIn = sim.pocketed.filter((k) => k === opp).length;
    const queenIn = sim.pocketed.includes('queen');
    let foul = sim.strikerPocketed;
    let coins = sim.coins;
    const pocketed = { ...state.pocketed, [own]: state.pocketed[own] + ownIn, [opp]: state.pocketed[opp] + oppIn };
    let queen = state.queen;
    const notes: string[] = [];
    const nextId = () => Math.max(0, ...state.coins.map((c) => c.id), ...coins.map((c) => c.id)) + 1;

    // The queen must be covered: pocket one of your own coins with it or on the very next shot.
    const pendingForMe = typeof queen === 'object' && 'pendingSeat' in queen && queen.pendingSeat === seat;
    if (queenIn) {
      if (foul) {
        coins = placeAtCentre(coins, { id: 0, kind: 'queen' });
        notes.push('queen returned');
      } else if (ownIn > 0) {
        queen = { coveredBy: team };
        notes.push('queen covered! 👑');
      } else {
        queen = { pendingSeat: seat };
        notes.push('queen pocketed — cover it next shot');
      }
    } else if (pendingForMe) {
      if (ownIn > 0 && !foul) {
        queen = { coveredBy: team };
        notes.push('queen covered! 👑');
      } else {
        queen = 'board';
        coins = placeAtCentre(coins, { id: 0, kind: 'queen' });
        notes.push('queen not covered — back to the centre');
      }
    }

    // You can't finish before the queen is covered.
    for (const color of ['white', 'black'] as TeamColor[]) {
      if (pocketed[color] === 9 && !isCovered(queen)) {
        pocketed[color] -= 1;
        coins = placeAtCentre(coins, { id: nextId(), kind: color });
        if (color === own) foul = true;
        notes.push(`last ${color} coin returned — queen first`);
      }
    }

    if (sim.strikerPocketed) {
      notes.unshift('foul: striker pocketed');
      if (pocketed[own] > 0) {
        pocketed[own] -= 1;
        coins = placeAtCentre(coins, { id: nextId(), kind: own });
        notes.push(`one ${own} coin returned`);
      }
    }

    const name = state.seats[seat].name;
    const inText = sim.pocketed.length
      ? `${name} pocketed ${sim.pocketed.map((k) => (k === 'queen' ? 'the queen' : k)).join(', ')}`
      : `${name} missed`;
    const shot: CarromShot = {
      seat,
      ids: sim.ids,
      kinds: sim.kinds,
      frames: sim.frames,
      pocketed: sim.pocketed,
      foul,
      message: [inText, ...notes].join(' · '),
    };

    let next: CarromState = { ...state, coins, pocketed, queen, shots: state.shots + 1, last: shot };

    // A team that has all nine coins in, with the queen covered, wins.
    for (const t of [team, 1 - team]) {
      if (next.pocketed[teamColor(t)] === 9 && isCovered(queen)) {
        const loser = teamColor(1 - t);
        const points = 9 - next.pocketed[loser] + (queen.coveredBy === t ? 3 : 0);
        const order = state.seats.map((_, i) => i);
        return {
          ...next,
          over: true,
          winnerTeam: t,
          points,
          rankings: [...order.filter((i) => state.teams[i] === t), ...order.filter((i) => state.teams[i] !== t)],
        };
      }
    }

    const again = !foul && (ownIn > 0 || queenIn);
    if (!again) next = { ...next, turn: (seat + 1) % state.seats.length };
    return next;
  },

  botMove(state, seat, rng, difficulty: Difficulty = 'medium') {
    return chooseShot(state, seat, rng, difficulty);
  },

  rankings: (state) => state.rankings,
};

// ---------- Computer player ----------

function pathClear(coins: Coin[], from: [number, number], to: [number, number], ignore: number, radius: number) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  return coins.every((c) => {
    if (c.id === ignore) return true;
    const t = Math.max(0, Math.min(1, ((c.x - x1) * (x2 - x1) + (c.y - y1) * (y2 - y1)) / (len2 || 1)));
    return Math.hypot(c.x - (x1 + t * (x2 - x1)), c.y - (y1 + t * (y2 - y1))) > radius + COIN_R - 0.2;
  });
}

/** Aims the striker so a target coin heads into a pocket ("ghost ball" aiming), then checks by simulating. */
export function chooseShot(state: CarromState, seat: number, rng: Rng, difficulty: Difficulty = 'medium'): CarromMove {
  const side = sideOf(seat, state.seats.length);
  const own = teamColor(state.teams[seat]);
  const queenPending = typeof state.queen === 'object' && 'pendingSeat' in state.queen;
  const targets = state.coins.filter((c) => c.kind === own || (c.kind === 'queen' && !queenPending));
  const candidates: { move: CarromMove; score: number }[] = [];

  for (const coin of targets) {
    for (const [px, py] of POCKETS) {
      const dx = px - coin.x;
      const dy = py - coin.y;
      const toPocket = Math.hypot(dx, dy);
      const ghost: [number, number] = [
        coin.x - (dx / toPocket) * (COIN_R + STRIKER_R),
        coin.y - (dy / toPocket) * (COIN_R + STRIKER_R),
      ];
      if (!pathClear(state.coins, [coin.x, coin.y], [px, py], coin.id, COIN_R)) continue;
      for (let i = 0; i <= 12; i++) {
        const pos = i / 12;
        const spot = strikerSpot(side, pos);
        if (strikerBlocked(state.coins, spot)) continue;
        const ax = ghost[0] - spot[0];
        const ay = ghost[1] - spot[1];
        const aim = Math.hypot(ax, ay);
        const cut = (ax * dx + ay * dy) / (aim * toPocket); // 1 = straight shot
        if (cut < 0.35) continue;
        if (!pathClear(state.coins, spot, ghost, coin.id, STRIKER_R)) continue;
        const power = Math.min(1, 0.25 + (aim + toPocket) / 160 / Math.max(cut, 0.5));
        candidates.push({
          move: { type: 'shot', pos, angle: Math.atan2(ay, ax), power },
          score: cut * 2 - (aim + toPocket) / 100,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  let best: CarromMove | null = null;
  let bestValue = -Infinity;
  for (const { move } of candidates.slice(0, 10)) {
    const sim = simulate(state.coins, strikerSpot(side, move.pos), move.angle, move.power);
    const value =
      sim.pocketed.filter((k) => k === own).length * 3 +
      (sim.pocketed.includes('queen') ? 2 : 0) -
      sim.pocketed.filter((k) => k !== own && k !== 'queen').length * 2 -
      (sim.strikerPocketed ? 6 : 0);
    if (value > bestValue) {
      bestValue = value;
      best = move;
    }
  }
  if (best && bestValue > 0) {
    // Human error: a shaky aim on easy, almost none on hard.
    const wobble = difficulty === 'easy' ? 0.14 : difficulty === 'medium' ? 0.025 : 0.004;
    return { ...best, angle: best.angle + (rng() - 0.5) * wobble };
  }

  // Nothing clean: hit the nearest own coin firmly to spread the coins.
  for (let tries = 0; tries < 20; tries++) {
    const pos = rng();
    const spot = strikerSpot(side, pos);
    if (strikerBlocked(state.coins, spot)) continue;
    const pool = targets.length ? targets : state.coins;
    const target = pool.reduce((a, b) =>
      Math.hypot(a.x - spot[0], a.y - spot[1]) < Math.hypot(b.x - spot[0], b.y - spot[1]) ? a : b,
    );
    return { type: 'shot', pos, angle: Math.atan2(target.y - spot[1], target.x - spot[0]), power: 0.75 };
  }
  return { type: 'shot', pos: 0.5, angle: Math.atan2(CENTRE - strikerSpot(side, 0.5)[1], 0), power: 0.8 };
}
