import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type Tabs } from 'expo-router';
import { type ComponentProps, useEffect, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CountBadge, Text, colors, palette, useMotionOK } from '@pandam/ui';

import { demoMatches, demoQuery } from '@/dummy';
import { useMatches } from '@/lib/hooks/useMatches';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type IconName = keyof typeof Ionicons.glyphMap;

/** Content height of the bar; the safe-area inset is added as padding. */
export const TAB_BAR_HEIGHT = 56;
const CREATE = 'create';

const ICONS: Record<string, IconName> = {
  index: 'home',
  discover: 'compass',
  matches: 'sparkles',
  profile: 'person',
};
/** Numbered editorial labels — "a physical control panel", not icon-only chrome. */
const LABELS: Record<string, string> = {
  index: '01 HOME',
  discover: '02 DISCOVER',
  matches: '03 MATCHES',
  profile: '04 PROFILE',
};

const SPRING = { damping: 17, stiffness: 210, mass: 0.8 };

function tap() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
}

/* -------------------------------------------------------------------------- */

/** A navigation tab: icon + numbered label, on a sliding orange block when active. */
function TabItem({
  name,
  focused,
  badge,
  onPress,
  onLongPress,
}: {
  name: string;
  focused: boolean;
  badge?: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const motionOK = useMotionOK();
  const on = useSharedValue(focused ? 1 : 0);
  const pop = useSharedValue(1);

  useEffect(() => {
    on.set(motionOK ? withSpring(focused ? 1 : 0, SPRING) : focused ? 1 : 0);
  }, [focused, motionOK, on]);

  const icon = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  const label = useAnimatedStyle(() => ({
    opacity: interpolate(on.value, [0, 1], [0.7, 1]),
  }));

  const press = () => {
    if (motionOK) {
      pop.set(
        withSequence(
          withTiming(0.82, { duration: 70 }),
          withSpring(1, { damping: 8, stiffness: 320 }),
        ),
      );
    }
    tap();
    onPress();
  };

  const fg = focused ? palette.white : colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={LABELS[name]}
      onPress={press}
      onLongPress={onLongPress}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: TAB_BAR_HEIGHT,
        gap: 2,
        // thin Swiss rules between the cells of the nav grid
        borderLeftWidth: name === 'index' ? 0 : 1,
        borderRightWidth: name === 'discover' ? 1 : 0,
        borderColor: '#D9D9D9',
      }}
    >
      <Animated.View style={icon}>
        <Ionicons
          name={focused ? ICONS[name]! : (`${ICONS[name]}-outline` as IconName)}
          size={19}
          color={fg}
        />
        {badge ? (
          <CountBadge
            value={badge}
            color={colors.match}
            ringColor={focused ? colors.accent : colors.background}
            style={{ position: 'absolute', top: -6, left: 11 }}
          />
        ) : null}
      </Animated.View>
      <Animated.View style={label}>
        <Text
          style={{
            fontSize: 8.5,
            fontFamily: 'InterTight_700Bold',
            letterSpacing: 0.4,
            color: fg,
          }}
        >
          {LABELS[name]}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** The raised centre action: a black-bordered orange square that overlaps the bar. */
function CreateButton({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const motionOK = useMotionOK();
  const on = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    on.set(
      motionOK ? withSpring(focused ? 1 : 0, { damping: 12, stiffness: 180 }) : focused ? 1 : 0,
    );
  }, [focused, motionOK, on]);

  const square = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }, { rotate: `${on.value * 45}deg` }],
  }));

  return (
    <View style={{ width: 68, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add something"
        accessibilityState={{ selected: focused }}
        onPressIn={() => {
          if (motionOK) press.set(withSpring(0.88, { damping: 15, stiffness: 400 }));
        }}
        onPressOut={() => {
          if (motionOK) press.set(withSpring(1, { damping: 7, stiffness: 300 }));
        }}
        onPress={() => {
          if (Platform.OS !== 'web') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
          }
          onPress();
        }}
        hitSlop={8}
        style={{ marginTop: -22 }}
      >
        {/* The off-white ring makes the square look cut into — and raised
            above — the bar, like a punch card. */}
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 14,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View
            style={[
              {
                width: 52,
                height: 52,
                borderRadius: 10,
                backgroundColor: colors.accent,
                borderWidth: 1.5,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: colors.border,
                shadowOpacity: 0.3,
                shadowRadius: 0,
                shadowOffset: { width: 2, height: 3 },
                elevation: 8,
              },
              square,
            ]}
          >
            <Ionicons name="add" size={28} color={palette.white} />
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * PANDAM's navigation: a flat off-white editorial control panel, flush with
 * the bottom edge, with a 2px black top border, a sliding sharp-cornered
 * orange block behind the active tab, a raised black-bordered "+" square cut
 * into the middle, a live match badge, and a haptic tick on every change.
 * Navigation behaviour is React Navigation's own (`tabPress` event,
 * `navigate`), so routes and deep links are unchanged.
 */
export function PandamTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const motionOK = useMotionOK();
  const matches = demoQuery(useMatches(), demoMatches);
  const matchCount = matches.data?.length ?? 0;

  const [rowW, setRowW] = useState(0);
  const routes = state.routes;
  const focusedName = routes[state.index]?.name;

  // Slot geometry: four equal tabs around a fixed-width centre slot.
  const createW = 68;
  const slotW = rowW > 0 ? (rowW - createW) / 4 : 0;
  const slotX = (name: string) => {
    const order = routes.map((r) => r.name).filter((n) => n !== CREATE);
    const i = order.indexOf(name);
    return i < 2 ? i * slotW : createW + i * slotW;
  };

  const pillX = useSharedValue(0);
  const pillOn = useSharedValue(0);
  useEffect(() => {
    if (!slotW || !focusedName) return;
    const onTab = focusedName !== CREATE;
    if (onTab) {
      const x = slotX(focusedName) + 4;
      pillX.set(motionOK && pillOn.value > 0 ? withSpring(x, SPRING) : x);
    }
    pillOn.set(motionOK ? withTiming(onTab ? 1 : 0, { duration: 160 }) : onTab ? 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedName, slotW, motionOK]);

  const pill = useAnimatedStyle(() => ({
    opacity: pillOn.value,
    transform: [{ translateX: pillX.value }],
  }));

  const go = (routeName: string, key: string, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  const maxW = Math.min(screenW, 720);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}
    >
      <View
        style={{
          width: maxW,
          paddingBottom: insets.bottom,
          backgroundColor: colors.background,
          borderTopWidth: 2,
          borderTopColor: colors.border,
        }}
      >
        <View
          onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
          style={{ height: TAB_BAR_HEIGHT, flexDirection: 'row' }}
        >
          {/* Hairline dividers between every cell — a structured grid strip,
              not a borderless row of icons. */}
          {slotW > 0
            ? [slotW, slotW * 2, slotW * 2 + createW, slotW * 3 + createW].map((x) => (
                <View
                  key={x}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: x,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: colors.border,
                  }}
                />
              ))
            : null}

          {/* sliding active block */}
          {slotW > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: 6,
                  width: slotW - 8,
                  height: TAB_BAR_HEIGHT - 12,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  backgroundColor: colors.accent,
                },
                pill,
              ]}
            />
          ) : null}

          {routes.map((route) => {
            const focused = route.name === focusedName;
            if (route.name === CREATE) {
              return (
                <CreateButton
                  key={route.key}
                  focused={focused}
                  onPress={() => go(route.name, route.key, focused)}
                />
              );
            }
            if (!ICONS[route.name]) return null;
            return (
              <TabItem
                key={route.key}
                name={route.name}
                focused={focused}
                badge={route.name === 'matches' ? matchCount : undefined}
                onPress={() => go(route.name, route.key, focused)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}
