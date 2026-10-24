import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import type { PieceType } from '@/games/chess/engine';
import type { PieceStyle } from '@/lib/profile';

// Chess pieces drawn as SVG in a 100×100 box. Every style shares the same
// silhouettes; only the fill, outline and lighting change:
//   normal — flat, outlined pieces like most chess sites
//   glass  — translucent frosted body with a bright rim and a highlight
//   3d     — shaded body with a specular highlight and a contact shadow

const BASE = 'M24 80 Q24 74 30 74 L70 74 Q76 74 76 80 L76 84 Q76 88 72 88 L28 88 Q24 88 24 84 Z';

/** Outline of each piece (one closed shape so it can fill and clip). */
const BODY: Record<PieceType, string> = {
  P:
    'M50 16 A12 12 0 0 1 59 36 Q64 38 64 43 Q64 46 59 47 Q60 60 68 70 L68 74 L32 74 L32 70 ' +
    'Q40 60 41 47 Q36 46 36 43 Q36 38 41 36 A12 12 0 0 1 50 16 Z',
  R:
    'M28 16 L38 16 L38 23 L45 23 L45 16 L55 16 L55 23 L62 23 L62 16 L72 16 L72 32 L65 38 ' +
    'L65 62 L71 68 L71 74 L29 74 L29 68 L35 62 L35 38 L28 32 Z',
  N:
    'M33 74 Q31 62 38 54 Q43 49 44 44 Q38 46 32 49 Q26 52 22 47 Q19 43 22 39 Q30 30 35 24 ' +
    'Q36 18 41 12 L44 19 Q49 15 53 17 Q66 22 72 38 Q77 54 71 74 Z',
  B:
    'M50 8 A6 6 0 0 1 54 18 Q66 26 66 40 Q66 50 58 55 L60 58 Q60 61 56 62 Q60 68 66 70 ' +
    'L66 74 L34 74 L34 70 Q40 68 44 62 Q40 61 40 58 L42 55 Q34 50 34 40 Q34 26 46 18 A6 6 0 0 1 50 8 Z',
  Q:
    'M20 30 A5 5 0 1 1 25 34 L34 54 L37 28 A5 5 0 1 1 43 29 L50 51 L57 29 A5 5 0 1 1 63 28 ' +
    'L66 54 L75 34 A5 5 0 1 1 80 30 L70 60 Q66 64 68 70 L68 74 L32 74 L32 70 Q34 64 30 60 Z',
  K:
    'M47 8 L53 8 L53 14 L59 14 L59 20 L53 20 L53 27 Q72 26 74 40 Q75 52 66 58 Q64 64 68 70 ' +
    'L68 74 L32 74 L32 70 Q36 64 34 58 Q25 52 26 40 Q28 26 47 27 L47 20 L41 20 L41 14 L47 14 Z',
};

/** Inner detail lines drawn over the body. */
const DETAIL: Record<PieceType, string> = {
  P: 'M38 70 L62 70',
  R: 'M35 38 L65 38 M35 62 L65 62',
  N: 'M27 44 Q30 43 31 45 M47 26 A2.6 2.6 0 1 0 47.1 26 M52 22 Q62 30 66 46',
  B: 'M54 28 L46 40 M42 58 L58 58',
  Q: 'M32 62 Q50 57 68 62 M34 68 L66 68',
  K: 'M34 58 Q50 53 66 58 M33 66 L67 66',
};

// [offset, colour, opacity]
const GLASS_WHITE: [string, string, number][] = [
  ['0', '#FFFFFF', 0.96],
  ['0.55', '#E3EEFF', 0.72],
  ['1', '#B9CCF0', 0.62],
];
const GLASS_BLACK: [string, string, number][] = [
  ['0', '#5A6680', 0.9],
  ['0.55', '#1E2536', 0.82],
  ['1', '#070A12', 0.85],
];
const SOLID_WHITE: [string, string][] = [
  ['0', '#FFFFFF'],
  ['0.45', '#F1E9DA'],
  ['1', '#B7A584'],
];
const SOLID_BLACK: [string, string][] = [
  ['0', '#7A7A7A'],
  ['0.45', '#2E2E2E'],
  ['1', '#060606'],
];

interface Look {
  fill: string;
  stroke: string;
  strokeWidth: number;
  detail: string;
}

function look(style: PieceStyle, white: boolean, id: string): Look {
  if (style === 'glass')
    return white
      ? { fill: `url(#${id}-g)`, stroke: 'rgba(255,255,255,0.95)', strokeWidth: 2.4, detail: 'rgba(120,150,190,0.55)' }
      : { fill: `url(#${id}-g)`, stroke: 'rgba(170,190,230,0.75)', strokeWidth: 2.4, detail: 'rgba(170,190,230,0.45)' };
  if (style === '3d')
    return white
      ? { fill: `url(#${id}-r)`, stroke: '#8C7B62', strokeWidth: 1.6, detail: 'rgba(120,100,70,0.55)' }
      : { fill: `url(#${id}-r)`, stroke: '#050505', strokeWidth: 1.6, detail: 'rgba(255,255,255,0.18)' };
  return white
    ? { fill: '#FAFAF7', stroke: '#2B2B2B', strokeWidth: 3, detail: '#2B2B2B' }
    : { fill: '#3A3734', stroke: '#141414', strokeWidth: 3, detail: '#9A958E' };
}

export function ChessPieceSvg({
  type,
  white,
  size,
  pieceStyle,
}: {
  type: PieceType;
  white: boolean;
  size: number;
  pieceStyle: PieceStyle;
}) {
  // Same definitions share an id: identical duplicates are harmless on web.
  const id = `zp-${pieceStyle}-${white ? 'w' : 'b'}`;
  const clip = `zp-clip-${type}`;
  const l = look(pieceStyle, white, id);
  const shape = `${BODY[type]} ${BASE}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" pointerEvents="none">
      <Defs>
        <ClipPath id={clip}>
          <Path d={shape} />
        </ClipPath>
        {pieceStyle === 'glass' ? (
          <LinearGradient id={`${id}-g`} x1="0" y1="0" x2="0.35" y2="1">
            {(white ? GLASS_WHITE : GLASS_BLACK).map(([o, c, a]) => (
              <Stop key={o} offset={o} stopColor={c} stopOpacity={a} />
            ))}
          </LinearGradient>
        ) : null}
        {pieceStyle === '3d' ? (
          <RadialGradient id={`${id}-r`} cx="0.36" cy="0.3" r="0.85">
            {(white ? SOLID_WHITE : SOLID_BLACK).map(([o, c]) => (
              <Stop key={o} offset={o} stopColor={c} />
            ))}
          </RadialGradient>
        ) : null}
      </Defs>

      {pieceStyle === '3d' ? <Ellipse cx="51" cy="90" rx="30" ry="5" fill="rgba(0,0,0,0.35)" /> : null}
      {pieceStyle === 'glass' ? <Ellipse cx="50" cy="90" rx="28" ry="4" fill="rgba(0,0,0,0.18)" /> : null}

      <Path d={shape} fill={l.fill} stroke={l.stroke} strokeWidth={l.strokeWidth} strokeLinejoin="round" />

      {pieceStyle !== 'normal' ? (
        <G clipPath={`url(#${clip})`}>
          {/* Highlight sweeping down the left side, and a darker right edge. */}
          <Ellipse
            cx="34"
            cy="30"
            rx="16"
            ry="40"
            fill="#FFFFFF"
            opacity={pieceStyle === 'glass' ? (white ? 0.55 : 0.22) : white ? 0.45 : 0.16}
            transform="rotate(-14 34 30)"
          />
          <Ellipse cx="80" cy="60" rx="18" ry="44" fill="#000000" opacity={pieceStyle === 'glass' ? 0.1 : 0.14} />
          {/* A thin bright line just inside the base, like light caught on an edge. */}
          <Path d="M30 77 L70 77" stroke="#FFFFFF" strokeWidth="1.4" opacity={white ? 0.8 : 0.3} />
        </G>
      ) : null}

      <Path
        d={DETAIL[type]}
        fill="none"
        stroke={l.detail}
        strokeWidth={pieceStyle === 'normal' ? 2.4 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
