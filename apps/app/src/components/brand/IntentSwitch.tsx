import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, G, Image as SvgImage, Path } from 'react-native-svg';

import { Press, Text } from '@pandam/ui';

import { homeImages } from '@/lib/homeAssets';

const ORANGE = '#FF3B20';
const INK = '#111111';
const CARD_BG = '#FFFFFF';
const CARD_BORDER = '#E9E6DF';

/** Native aspect ratio of the two supplied hero cutouts (~205×265). */
const HERO_ART_RATIO = 205 / 265;
/** Fixed and TALLER than each card's own width — a narrow vertical tile,
 *  not a wide horizontal one. Independent of image size. */
const PANEL_H = 214;
/** Same silhouette for both cards — a clean, evenly rounded square tile. */
const RADII = [28, 28, 28, 28];
const BULGE = 0;

type Side = 'have' | 'need';

const COPY: Record<Side, { number: string; tag: string; lines: string[] }> = {
  have: { number: '01', tag: 'I HAVE', lines: ['What I', 'can', 'offer'] },
  need: { number: '02', tag: 'I NEED', lines: ["What I'm", 'looking', 'for'] },
};

/**
 * A closed SVG path for a soft rounded-tile silhouette: four large corners
 * joined by edges that bow gently outward (`bulge`) instead of running
 * straight — an organic outline, not a mathematically uniform rounded rect.
 */
function blobPath(w: number, h: number, radii: number[], bulge: number) {
  const [rTL = 0, rTR = 0, rBR = 0, rBL = 0] = radii;
  const x0 = 0;
  const y0 = 0;
  const x1 = w;
  const y1 = h;
  const A = [x0 + rTL, y0];
  const B = [x1 - rTR, y0];
  const C = [x1, y0 + rTR];
  const D = [x1, y1 - rBR];
  const E = [x1 - rBR, y1];
  const F = [x0 + rBL, y1];
  const G_ = [x0, y1 - rBL];
  const topMid = [(A[0]! + B[0]!) / 2, y0 - bulge];
  const rightMid = [x1 + bulge, (C[1]! + D[1]!) / 2];
  const bottomMid = [(E[0]! + F[0]!) / 2, y1 + bulge];
  const leftMid = [x0 - bulge, (G_[1]! + A[1]!) / 2];

  return [
    `M${A[0]},${A[1]}`,
    `Q${topMid[0]},${topMid[1]} ${B[0]},${B[1]}`,
    `Q${x1},${y0} ${C[0]},${C[1]}`,
    `Q${rightMid[0]},${rightMid[1]} ${D[0]},${D[1]}`,
    `Q${x1},${y1} ${E[0]},${E[1]}`,
    `Q${bottomMid[0]},${bottomMid[1]} ${F[0]},${F[1]}`,
    `Q${x0},${y1} ${G_[0]},${G_[1]}`,
    `Q${leftMid[0]},${leftMid[1]} ${A[0]},${A[1]}`,
    'Z',
  ].join(' ');
}

/** Fixed art size in px — controlled, never large enough to reach the text. */
const ART_W = 96;

/**
 * I HAVE / I NEED — two matched hero cards: same width, same fixed height,
 * same organic rounded-tile silhouette (SVG path, not `borderRadius`). Each
 * card is a mask — the product cutout is absolutely positioned in the
 * lower-right corner and clipped by the card shape, so it never affects the
 * card's own dimensions or covers the typography.
 */
export function IntentSwitch({
  haveCount,
  needCount,
  onHave,
  onNeed,
}: {
  haveCount: number;
  needCount: number;
  onHave: () => void;
  onNeed: () => void;
}) {
  const [haveW, setHaveW] = useState(0);
  const [needW, setNeedW] = useState(0);

  const panel = (
    side: Side,
    count: number,
    onPress: () => void,
    w: number,
    setW: (n: number) => void,
  ) => {
    const c = COPY[side];
    const isHave = side === 'have';
    const fg = isHave ? INK : '#FFFFFF';
    const path = w > 0 ? blobPath(w, PANEL_H, RADII, BULGE) : '';
    const clipId = `hero-blob-${side}`;
    const artH = ART_W / HERO_ART_RATIO;

    return (
      <Press
        scale="sm"
        accessibilityRole="button"
        accessibilityLabel={`${c.tag}: ${c.lines.join(' ')}. ${count} active.`}
        onPress={onPress}
        onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
        style={{ flex: 1, height: PANEL_H }}
      >
        {w > 0 ? (
          <Svg
            width={w}
            height={PANEL_H}
            viewBox={`0 0 ${w} ${PANEL_H}`}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            <Defs>
              <ClipPath id={clipId}>
                <Path d={path} />
              </ClipPath>
            </Defs>
            <Path
              d={path}
              fill={isHave ? CARD_BG : ORANGE}
              stroke={isHave ? CARD_BORDER : 'none'}
              strokeWidth={isHave ? 1 : 0}
            />
            {/* the product cutout — fixed, controlled size, anchored to the
                lower-right corner and clipped by the card's own silhouette */}
            <G clipPath={`url(#${clipId})`}>
              <SvgImage
                href={isHave ? homeImages.heroConcrete : homeImages.heroCurve}
                x={w - ART_W + 6}
                y={PANEL_H - artH + 6}
                width={ART_W}
                height={artH}
                preserveAspectRatio="xMidYMid slice"
              />
            </G>
          </Svg>
        ) : null}

        <View style={{ flex: 1, padding: 16, justifyContent: 'space-between' }}>
          <View style={{ maxWidth: '62%' }}>
            <Text
              style={{
                fontFamily: 'InterTight_900Black',
                fontSize: 46,
                lineHeight: 44,
                letterSpacing: -1.5,
                color: fg,
              }}
            >
              {c.number}
            </Text>
            <Text
              style={{
                fontFamily: 'InterTight_700Bold',
                fontSize: 12,
                letterSpacing: 0.6,
                color: fg,
                marginTop: 2,
              }}
            >
              {c.tag}
            </Text>
            <View style={{ marginTop: 6 }}>
              {c.lines.map((line) => (
                <Text
                  key={line}
                  style={{
                    fontFamily: 'InterTight_900Black',
                    fontSize: 21,
                    lineHeight: 21,
                    letterSpacing: -0.4,
                    color: fg,
                  }}
                >
                  {line}
                </Text>
              ))}
            </View>
          </View>

          {/* bare arrow — a visual cue, not a button */}
          <Ionicons name="arrow-forward" size={18} color={fg} />
        </View>
      </Press>
    );
  };

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {panel('have', haveCount, onHave, haveW, setHaveW)}
      {panel('need', needCount, onNeed, needW, setNeedW)}
    </View>
  );
}
