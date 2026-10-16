// Meld solver for 13-card (Indian) Rummy: finds the best way to group a hand.
//
// Cards are indexed 0..n-1 (n ≤ 14) and groups are bitmasks. Every subset is
// classified once (pure sequence, sequence, set or nothing); a memoised search
// then covers the hand with groups to minimise the points left over.

export type Suit = 'S' | 'H' | 'D' | 'C' | 'J';

export interface PlayingCard {
  id: number;
  suit: Suit;
  /** 1 (ace) .. 13 (king); 0 for a printed joker. */
  rank: number;
}

export type MeldKind = 'pure' | 'sequence' | 'set';

export interface Arrangement {
  /** Points counted against the hand (0 = ready to declare), capped at 80. */
  score: number;
  groups: { kind: MeldKind; cards: PlayingCard[] }[];
  loose: PlayingCard[];
}

export const MAX_POINTS = 80;

export const isJoker = (c: PlayingCard, wildRank: number) => c.suit === 'J' || c.rank === wildRank;

export function cardValue(c: PlayingCard, wildRank: number): number {
  if (isJoker(c, wildRank)) return 0;
  return c.rank === 1 || c.rank >= 11 ? 10 : c.rank;
}

/** Can these naturals plus `jokers` wildcards form a run of one suit? */
function fitsRun(ranks: number[], size: number): boolean {
  if (new Set(ranks).size !== ranks.length) return false;
  if (ranks.length === 0) return false;
  // Ace can be low (A-2-3) or high (Q-K-A), but a run can't wrap round.
  const variants = ranks.includes(1) ? [ranks, ranks.map((r) => (r === 1 ? 14 : r))] : [ranks];
  return variants.some((rs) => {
    const span = Math.max(...rs) - Math.min(...rs) + 1;
    return span <= size && size <= 14;
  });
}

function classify(cards: PlayingCard[], wildRank: number): MeldKind | null {
  const n = cards.length;
  if (n < 3) return null;
  const printed = cards.filter((c) => c.suit === 'J').length;

  // Pure: same suit, consecutive, no jokers standing in (a wild card in its own natural spot is fine).
  if (printed === 0) {
    const suits = new Set(cards.map((c) => c.suit));
    if (
      suits.size === 1 &&
      fitsRun(
        cards.map((c) => c.rank),
        n,
      )
    ) {
      const rs = cards.map((c) => c.rank);
      const exact = [rs, rs.map((r) => (r === 1 ? 14 : r))].some(
        (v) => Math.max(...v) - Math.min(...v) + 1 === n && new Set(v).size === n,
      );
      if (exact) return 'pure';
    }
  }

  const naturals = cards.filter((c) => !isJoker(c, wildRank));
  if (naturals.length === 0) return null;
  if (
    new Set(naturals.map((c) => c.suit)).size === 1 &&
    fitsRun(
      naturals.map((c) => c.rank),
      n,
    )
  )
    return 'sequence';
  if (
    n <= 4 &&
    new Set(naturals.map((c) => c.rank)).size === 1 &&
    new Set(naturals.map((c) => c.suit)).size === naturals.length
  ) {
    return 'set';
  }
  return null;
}

export function arrange(cards: PlayingCard[], wildRank: number): Arrangement {
  return solver(cards, wildRank).best(cards.length === 0 ? 0 : (1 << cards.length) - 1);
}

/**
 * Builds a solver for one hand of up to 14 cards. `best(mask)` gives the best
 * arrangement of the cards in `mask`; results are shared between calls, so
 * trying each of 14 possible discards costs little more than one.
 */
export function solver(cards: PlayingCard[], wildRank: number) {
  const n = cards.length;
  const full = (1 << n) - 1;
  const value = cards.map((c) => cardValue(c, wildRank));
  const kinds = new Map<number, MeldKind>();
  // Melds grouped by their lowest card, so the search only tries groups containing it.
  const byLowest: number[][] = Array.from({ length: n }, () => []);
  for (let m = 1; m <= full; m++) {
    const size = bitCount(m);
    if (size < 3) continue;
    const members = cards.filter((_, i) => m & (1 << i));
    const kind = classify(members, wildRank);
    if (!kind) continue;
    kinds.set(m, kind);
    byLowest[lowestBit(m)].push(m);
  }
  const points = (mask: number) => {
    let p = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) p += value[i];
    return p;
  };

  // Two searches:
  //  - full rules (needs a pure sequence and a second sequence; sets allowed)
  //  - sequences only (needs a pure sequence), used when the hand can't meet the full rules
  type Result = { left: number; melds: number[] };
  const memo = new Map<string, Result>();
  const search = (mask: number, pure: number, seqs: number, allowSets: boolean, needSeqs: number): Result => {
    if (mask === 0) return pure >= 1 && seqs >= needSeqs ? { left: 0, melds: [] } : { left: Infinity, melds: [] };
    const key = `${mask}|${pure}|${seqs}|${allowSets ? 1 : 0}|${needSeqs}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const low = lowestBit(mask);
    // Leave the lowest card unmatched…
    const skip = search(mask & ~(1 << low), pure, seqs, allowSets, needSeqs);
    let best: Result = { left: skip.left + value[low], melds: skip.melds };
    // …or put it in a group.
    for (const meld of byLowest[low]) {
      if ((meld & mask) !== meld) continue;
      const kind = kinds.get(meld)!;
      if (kind === 'set' && !allowSets) continue;
      const isSeq = kind !== 'set';
      const sub = search(
        mask & ~meld,
        Math.min(1, pure + (kind === 'pure' ? 1 : 0)),
        Math.min(2, seqs + (isSeq ? 1 : 0)),
        allowSets,
        needSeqs,
      );
      if (sub.left < best.left) best = { left: sub.left, melds: [meld, ...sub.melds] };
    }
    memo.set(key, best);
    return best;
  };

  const toArrangement = (mask: number, r: Result, score: number): Arrangement => {
    const used = r.melds.reduce((a, m) => a | m, 0);
    return {
      score: Math.min(MAX_POINTS, score),
      groups: r.melds.map((m) => ({ kind: kinds.get(m)!, cards: cards.filter((_, i) => m & (1 << i)) })),
      loose: cards.filter((_, i) => mask & (1 << i) && !(used & (1 << i))),
    };
  };

  return {
    best(mask: number): Arrangement {
      const total = points(mask);
      const fullRules = search(mask, 0, 0, true, 2);
      const seqOnly = search(mask, 0, 0, false, 1);
      // Without a pure sequence every card counts; with only one sequence, just that sequence is spared.
      const options: { score: number; r: Result }[] = [{ score: total, r: { left: total, melds: [] } }];
      if (Number.isFinite(seqOnly.left)) options.push({ score: seqOnly.left, r: seqOnly });
      if (Number.isFinite(fullRules.left)) options.push({ score: fullRules.left, r: fullRules });
      options.sort((a, b) => a.score - b.score);
      return toArrangement(mask, options[0].r, options[0].score);
    },
    full,
  };
}

function bitCount(m: number) {
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}

function lowestBit(m: number) {
  return 31 - Math.clz32(m & -m);
}
