import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Gradient, Text, colors, palette, spacing } from '@pandam/ui';

type Side = 'have' | 'need';

const COPY: Record<Side, { number: string; kicker: string; lines: string[] }> = {
  have: { number: '01', kicker: 'I HAVE', lines: ['What I', 'can', 'offer'] },
  need: { number: '02', kicker: 'I NEED', lines: ["What I'm", 'looking', 'for'] },
};

/**
 * A rough concrete/industrial block — two stacked gradient planes (a darker
 * "shadow" plane offset behind a lighter "face" plane) rather than a single
 * flat shape, so it reads as a 3D object rather than a sticker. No real
 * photography exists in this project, so this is built from layout
 * primitives rather than an image asset.
 */
function ConcreteBlock() {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', right: -22, bottom: -28, width: 150, height: 150 }}
    >
      <Gradient
        colors={[palette.steel, palette.charcoal]}
        direction="diagonal"
        style={{
          position: 'absolute',
          width: 108,
          height: 108,
          right: 4,
          bottom: 0,
          transform: [{ rotate: '12deg' }],
          opacity: 0.9,
        }}
      />
      <Gradient
        colors={[palette.concrete, palette.steel]}
        direction="diagonal"
        style={{
          position: 'absolute',
          width: 118,
          height: 118,
          right: 26,
          bottom: 18,
          transform: [{ rotate: '-8deg' }],
        }}
      />
    </View>
  );
}

/**
 * A large dark curved object — a soft-gradient disc bleeding off the panel's
 * bottom-right edge, the orange panel's one visual counterweight.
 */
function DarkCurve() {
  return (
    <Gradient
      pointerEvents="none"
      colors={[palette.steel, palette.graphite]}
      direction="diagonal"
      style={{
        position: 'absolute',
        right: -46,
        bottom: -50,
        width: 170,
        height: 170,
        borderRadius: 999,
        opacity: 0.4,
      }}
    />
  );
}

/**
 * I HAVE / I NEED — a single two-column editorial poster, not two cards.
 *
 * The panels touch directly across one hairline divider: no gap, no center
 * control of any kind. Each side layers a background, a large physical-
 * looking object, then typography, then a bare arrow — in that order, so the
 * object sits behind the text rather than beside it. Left is off-white with
 * a grey concrete block; right is orange with a dark curved object. Tapping
 * either half opens the same create flow as before.
 */
export function IntentSwitch({
  haveCount: _haveCount,
  needCount: _needCount,
  onHave,
  onNeed,
}: {
  haveCount: number;
  needCount: number;
  onHave: () => void;
  onNeed: () => void;
}) {
  const half = (side: Side, onPress: () => void) => {
    const c = COPY[side];
    const isHave = side === 'have';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.kicker}: ${c.lines.join(' ')}`}
        onPress={onPress}
        style={{
          flex: 1,
          minHeight: 224,
          backgroundColor: isHave ? colors.background : colors.accent,
          borderRightWidth: isHave ? 1.5 : 0,
          borderRightColor: colors.border,
          overflow: 'hidden',
          padding: spacing.md,
          justifyContent: 'space-between',
        }}
      >
        {isHave ? <ConcreteBlock /> : <DarkCurve />}

        <View>
          {/* `scaleY` stretches the glyphs themselves taller without
              touching layout — a transform paints after layout, so it never
              changes the panel's own height. */}
          <Text
            style={{
              fontFamily: 'InterTight_900Black',
              fontSize: 50,
              lineHeight: 48,
              letterSpacing: -2,
              color: colors.textPrimary,
              alignSelf: 'flex-start',
              transform: [{ scaleY: 1.18 }],
            }}
          >
            {c.number}
          </Text>
          <Text
            style={{
              fontFamily: 'InterTight_800ExtraBold',
              fontSize: 10,
              lineHeight: 13,
              letterSpacing: 0.5,
              color: colors.textPrimary,
              marginTop: 1,
            }}
          >
            {c.kicker}
          </Text>
        </View>

        <View>
          {/* Stacked, not wrapped — each word is its own line, tight
              leading, so the headline reads as a dense editorial block. */}
          {c.lines.map((line, i) => (
            <Text
              key={i}
              style={{
                fontFamily: 'InterTight_900Black',
                fontSize: 24,
                lineHeight: 23,
                letterSpacing: -0.5,
                color: colors.textPrimary,
              }}
            >
              {line}
            </Text>
          ))}
          <Ionicons
            name="arrow-forward"
            size={20}
            color={colors.textPrimary}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: 0,
        overflow: 'hidden',
      }}
    >
      {half('have', onHave)}
      {half('need', onNeed)}
    </View>
  );
}
