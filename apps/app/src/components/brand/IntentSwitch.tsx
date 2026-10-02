import { Ionicons } from '@expo/vector-icons';
import { Image, View } from 'react-native';

import { Press, Text } from '@pandam/ui';

import { homeImages } from '@/lib/homeAssets';

const RED = '#FF3B2F';
const INK = '#111111';

type Side = 'have' | 'need';

const COPY: Record<Side, { number: string; tag: string; title: string; sub: string }> = {
  have: { number: '01', tag: '// HAVE', title: 'I HAVE', sub: 'What I can offer' },
  need: { number: '02', tag: '// NEED', title: 'I NEED', sub: "What I'm looking for" },
};

/**
 * I HAVE / I NEED — the hero interaction of the dashboard: two poster blocks,
 * one red and one black, with large numerals and a product cutout bleeding off
 * the top-right corner. Each opens the same create flow as before.
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
  const block = (side: Side, count: number, onPress: () => void) => {
    const c = COPY[side];
    const isHave = side === 'have';
    return (
      <Press
        scale="sm"
        accessibilityRole="button"
        accessibilityLabel={`${c.title}: ${c.sub}. ${count} active.`}
        onPress={onPress}
        style={{
          flex: 1,
          minHeight: 196,
          backgroundColor: isHave ? RED : INK,
          borderWidth: 1.5,
          borderColor: INK,
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        {/* product cutout, bleeding off the top-right corner */}
        <Image
          source={isHave ? homeImages.camera : homeImages.sneakers}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          style={{
            position: 'absolute',
            top: isHave ? -6 : 14,
            right: isHave ? -22 : -24,
            width: isHave ? 118 : 124,
            height: isHave ? 112 : 106,
          }}
        />
        <View style={{ flex: 1, padding: 16, justifyContent: 'space-between' }}>
          <View>
            <Text
              style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 54,
                lineHeight: 56,
                letterSpacing: -2,
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              {c.number}
            </Text>
            <Text
              style={{
                fontFamily: 'Inter_600SemiBold',
                fontSize: 10.5,
                letterSpacing: 3,
                color: '#FFFFFF',
                marginTop: 14,
              }}
            >
              {c.tag}
            </Text>
            <Text
              style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 31,
                lineHeight: 34,
                letterSpacing: -1,
                color: '#FFFFFF',
              }}
            >
              {c.title}
            </Text>
            <Text
              style={{
                fontFamily: 'Inter_400Regular',
                fontSize: 13.5,
                lineHeight: 18,
                color: 'rgba(255,255,255,0.92)',
                marginTop: 2,
              }}
            >
              {c.sub}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.85)',
                borderRadius: 2,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Ionicons name="add" size={13} color="#FFFFFF" />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FFFFFF' }}>
                {count > 0 ? `${count} active` : 'Add first'}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
          </View>
        </View>
      </Press>
    );
  };

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {block('have', haveCount, onHave)}
      {block('need', needCount, onNeed)}
    </View>
  );
}
