import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';

import {
  Avatar,
  Notice,
  Press,
  Rail,
  Screen,
  SkeletonList,
  Stack,
  Text,
  colors,
  layout,
} from '@pandam/ui';

import { AddCategorySheet } from '@/components/AddCategorySheet';
import { IntentSwitch } from '@/components/brand/IntentSwitch';
import { CategoryGrid } from '@/components/CategoryFilter';
import { ItemCard } from '@/components/ItemCard';
import { MatchCard } from '@/components/MatchCard';
import { ErrorState } from '@/components/states';
import {
  demoMatches,
  demoMyListings,
  demoMyNeeds,
  demoOthersListings,
  demoMergeList,
  demoMergePages,
  demoPages,
  demoQuery,
} from '@/dummy';
import { mediaSrc } from '@/lib/api/media';
import { useSession } from '@/lib/auth/hooks';
import { useBrowseCategories } from '@/lib/hooks/useCategories';
import { useDiscover, useMyItems } from '@/lib/hooks/useMarket';
import { useMatches } from '@/lib/hooks/useMatches';
import { homeImages } from '@/lib/homeAssets';

/** Swiss palette — deliberately tiny. */
const RED = '#FF3B2F';
const INK = '#111111';
const MUTED = '#666666';
const BG = '#F8F7F3';
const RULE = '#D9D9D9';
/** Page margin on the 8pt spacing scale (8 / 16 / 24 / 32 / 48). */
const G = 16;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Section header: number overline, big title, optional side note and action. */
function SectionTitle({
  number,
  title,
  note,
  actionLabel,
  onAction,
  slash = false,
}: {
  number: string;
  title: string;
  note?: string;
  actionLabel?: string;
  onAction?: () => void;
  slash?: boolean;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 2.4, color: MUTED }}
      >
        {number}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flexShrink: 1 }}>
          {slash ? (
            <View
              style={{
                position: 'absolute',
                left: -8,
                top: 4,
                width: 22,
                height: 30,
                backgroundColor: RED,
                transform: [{ skewX: '-18deg' }],
              }}
            />
          ) : null}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontFamily: 'Inter_700Bold',
              fontSize: 24,
              lineHeight: 30,
              letterSpacing: -0.8,
              color: INK,
            }}
          >
            {title}
          </Text>
        </View>
        {note ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flex: 1,
              paddingBottom: 6,
            }}
          >
            <View style={{ width: 1, height: 28, backgroundColor: INK }} />
            <Text
              style={{
                fontFamily: 'Inter_500Medium',
                fontSize: 8.5,
                lineHeight: 11,
                letterSpacing: 0.8,
                color: MUTED,
                flexShrink: 1,
              }}
            >
              {note}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {actionLabel && onAction ? (
          <Press
            scale="sm"
            hitSlop={12}
            accessibilityRole="link"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            style={{
              paddingBottom: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
              flexShrink: 0,
            }}
          >
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: RED }}>
              {actionLabel}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={RED} />
          </Press>
        ) : null}
      </View>
    </View>
  );
}

/** Compact counter on the strip under the feed. */
function StatChip({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Press
      scale="sm"
      dim={false}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2 }}
    >
      <Text
        style={{
          fontFamily: 'Inter_700Bold',
          fontSize: 32,
          lineHeight: 36,
          letterSpacing: -1,
          color: value === 0 ? RULE : INK,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: 'Inter_600SemiBold',
          fontSize: 10,
          letterSpacing: 1.4,
          color: MUTED,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Press>
  );
}

/* -------------------------------------------------------------------------- */

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const { profile } = useSession();
  const name = profile?.displayName?.split(' ')[0] ?? 'there';

  const categories = useBrowseCategories();
  const [addingCategory, setAddingCategory] = useState(false);
  const matches = demoQuery(useMatches(), demoMatches);
  const recent = demoMergePages(
    useDiscover('listing', { limit: 8 }),
    demoPages(demoOthersListings),
  );
  const myHave = demoMergeList(useMyItems('listing'), demoMyListings);
  const myNeed = demoMergeList(useMyItems('need'), demoMyNeeds);

  const goDiscover = useCallback(
    (categoryId?: string) =>
      router.push(
        categoryId ? `/(app)/(tabs)/discover?category=${categoryId}` : '/(app)/(tabs)/discover',
      ),
    [router],
  );

  const recentItems = recent.data?.pages.flatMap((p) => p.items) ?? [];
  const activeHave = myHave.data?.filter((i) => i.status === 'published').length ?? 0;
  const activeNeed = myNeed.data?.filter((i) => i.status === 'published').length ?? 0;
  const matchCount = matches.data?.length ?? 0;
  const hasNothingListed = activeHave === 0 && activeNeed === 0;
  const maxW = wide ? 1080 : layout.contentMaxWidth;
  const colW = Math.min(width, maxW) - G * 2;

  return (
    <Screen
      scroll
      padded={false}
      background={BG}
      contentStyle={{ maxWidth: '100%' }}
      edges={['top']}
      tabBarInset
      onRefresh={() =>
        void Promise.all([matches.refetch(), recent.refetch(), myHave.refetch(), myNeed.refetch()])
      }
      refreshing={matches.isRefetching}
    >
      <View
        style={{
          width: '100%',
          maxWidth: maxW,
          alignSelf: 'center',
          paddingHorizontal: G,
          paddingTop: 8,
        }}
      >
        <Stack gap="lg">
          {/* ---------------------------------------------------- hero -- */}
          <View style={{ height: 176 }}>
            {/* product collage, bleeding off the right edge */}
            <Image
              source={homeImages.camera}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              style={{ position: 'absolute', top: 54, right: -22, width: 150, height: 122 }}
            />
            <View
              style={{
                position: 'absolute',
                top: 98,
                right: Math.min(colW * 0.3, 112),
                transform: [{ rotate: '-7deg' }],
              }}
            >
              <Image
                source={homeImages.note}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
                style={{ width: 86, height: 74 }}
              />
            </View>

            {/* top row: logo + metadata + avatar */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Image
                  source={homeImages.logo}
                  accessibilityLabel="PANDAM"
                  style={{ width: 30, height: 30, borderRadius: 7 }}
                />
                <Text
                  style={{
                    fontFamily: 'Inter_700Bold',
                    fontSize: 20,
                    letterSpacing: -0.4,
                    color: INK,
                  }}
                >
                  PANDAM
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text
                  style={{
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 8.5,
                    lineHeight: 11,
                    letterSpacing: 0.8,
                    color: INK,
                  }}
                >
                  {'BUY\nSELL\nSWAP\nGROW'}
                </Text>
                <Press
                  scale="sm"
                  accessibilityRole="button"
                  accessibilityLabel="Your profile"
                  onPress={() => router.push('/(app)/(tabs)/profile')}
                  style={{ borderRadius: 22, borderWidth: 1.5, borderColor: INK }}
                >
                  <Avatar
                    name={profile?.displayName ?? 'You'}
                    size={40}
                    uri={mediaSrc(profile?.avatarUrl)}
                  />
                </Press>
              </View>
            </View>

            {/* greeting + the name, big */}
            <Text
              style={{
                position: 'absolute',
                top: 62,
                left: 0,
                fontFamily: 'Inter_500Medium',
                fontSize: 12,
                letterSpacing: 5,
                color: MUTED,
                textTransform: 'uppercase',
              }}
            >
              {greeting()},
            </Text>
            <View style={{ position: 'absolute', top: 80, left: 0, width: colW * 0.66 }}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 52,
                  lineHeight: 58,
                  letterSpacing: -2.4,
                  color: INK,
                  textTransform: 'uppercase',
                }}
              >
                {name}
              </Text>
              {/* hand-drawn red underline */}
              <View
                style={{
                  height: 4,
                  width: '88%',
                  marginTop: 2,
                  borderRadius: 2,
                  backgroundColor: RED,
                  transform: [{ rotate: '-1.2deg' }],
                }}
              />
              <View
                style={{
                  height: 2.5,
                  width: '48%',
                  marginTop: 4,
                  marginLeft: '14%',
                  borderRadius: 2,
                  backgroundColor: RED,
                  transform: [{ rotate: '0.8deg' }],
                }}
              />
            </View>
          </View>

          {/* --------------------------------------------------- search -- */}
          <Press
            scale="sm"
            accessibilityRole="button"
            accessibilityLabel="Search what people are offering"
            onPress={() => goDiscover()}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: '#FFFFFF',
              borderWidth: 1.5,
              borderColor: INK,
              borderRadius: 2,
              paddingHorizontal: 16,
              height: 52,
            }}
          >
            <Ionicons name="search" size={20} color={INK} />
            <Text
              style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: MUTED }}
              numberOfLines={1}
            >
              Search cameras, skills, furniture…
            </Text>
            <Ionicons name="options-outline" size={20} color={INK} />
          </Press>

          {/* ------------------------------------------- I HAVE / I NEED -- */}
          <IntentSwitch
            haveCount={activeHave}
            needCount={activeNeed}
            onHave={() => router.push('/(app)/new-listing')}
            onNeed={() => router.push('/(app)/new-need')}
          />

          {/* -------------------------------------------------- matches -- */}
          <Press
            scale="sm"
            accessibilityRole="button"
            accessibilityLabel={`${matchCount} matches`}
            onPress={() => router.push('/(app)/(tabs)/matches')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: '#FFF1EE',
              borderWidth: 1.5,
              borderColor: RED,
              borderRadius: 2,
              padding: 12,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                backgroundColor: RED,
                borderRadius: 2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="git-compare" size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 17, color: RED }}>
                {matchCount > 0
                  ? `${matchCount} barter match${matchCount === 1 ? '' : 'es'}`
                  : 'No matches yet'}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: INK }}
              >
                {matchCount > 0 ? 'Someone wants what you have' : 'List items to find your mirror'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image
                source={homeImages.headphones}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  borderWidth: 1,
                  borderColor: INK,
                }}
              />
              <Image
                source={homeImages.chair}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: INK,
                  marginLeft: -8,
                }}
              />
            </View>
            <Ionicons name="chevron-forward" size={18} color={RED} />
          </Press>
        </Stack>
      </View>

      {/* ------------------------------------------------------ sections -- */}
      <View
        style={{
          width: '100%',
          maxWidth: maxW,
          alignSelf: 'center',
          paddingHorizontal: G,
          paddingTop: 32,
        }}
      >
        <Stack gap="3xl">
          {/* ----------------------------------------------- categories -- */}
          {categories.data && categories.data.length > 0 ? (
            <View>
              <SectionTitle
                number="03"
                title="Browse by category"
                note={'EXPLORE\nTHINGS\nAROUND YOU'}
                actionLabel="See all"
                onAction={() => goDiscover()}
              />
              <CategoryGrid
                categories={categories.data}
                limit={8}
                onSelect={(id) => goDiscover(id)}
                onAdd={() => setAddingCategory(true)}
              />
            </View>
          ) : null}

          {/* -------------------------------------------------- matches -- */}
          {matchCount > 0 ? (
            <View>
              <SectionTitle
                number="RECIPROCAL"
                title="Your barter matches"
                actionLabel="See all"
                onAction={() => router.push('/(app)/(tabs)/matches')}
              />
              {matches.isPending ? (
                <SkeletonList count={1} />
              ) : matches.isError ? (
                <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />
              ) : (
                <Stack gap="md">
                  {matches.data!.slice(0, 2).map((m) => (
                    <MatchCard
                      key={m.key}
                      match={m}
                      onPress={() => router.push('/(app)/(tabs)/matches')}
                    />
                  ))}
                </Stack>
              )}
            </View>
          ) : null}

          {/* --------------------------------------------------- recent -- */}
          <View>
            <SectionTitle
              number="04"
              title="Fresh near you"
              slash
              actionLabel="See all"
              onAction={() => goDiscover()}
            />
            {recent.isPending ? (
              <SkeletonList count={2} />
            ) : recent.isError ? (
              <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
            ) : recentItems.length === 0 ? (
              <Notice
                kind="neutral"
                icon={<Ionicons name="cube-outline" size={16} color={colors.textMuted} />}
              >
                Nothing has been published yet. Be the first to list something you have.
              </Notice>
            ) : (
              <Rail>
                {recentItems.slice(0, 8).map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    variant="rail"
                    onPress={() => router.push(`/(app)/listing/${it.id}`)}
                  />
                ))}
              </Rail>
            )}
          </View>

          {/* ------------------------------------------- match counters -- */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: '#FFFFFF',
              borderWidth: 1.5,
              borderColor: INK,
              borderRadius: 2,
            }}
          >
            <StatChip
              value={activeHave}
              label="listed"
              onPress={() => router.push('/(app)/(tabs)/profile')}
            />
            <View style={{ width: 1, backgroundColor: INK }} />
            <StatChip
              value={activeNeed}
              label="wanted"
              onPress={() => router.push('/(app)/(tabs)/profile')}
            />
            <View style={{ width: 1, backgroundColor: INK }} />
            <StatChip
              value={matchCount}
              label="matches"
              onPress={() => router.push('/(app)/(tabs)/matches')}
            />
          </View>

          {/* --------------------------------------------- how it works -- */}
          {hasNothingListed ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: INK,
                borderRadius: 2,
                padding: 16,
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 11,
                  letterSpacing: 2,
                  color: INK,
                  textTransform: 'uppercase',
                }}
              >
                How barter works here
              </Text>
              <Text
                style={{
                  fontFamily: 'Inter_400Regular',
                  fontSize: 14,
                  lineHeight: 21,
                  color: MUTED,
                }}
              >
                You have <Text style={{ fontFamily: 'Inter_700Bold', color: RED }}>web design</Text>{' '}
                and need{' '}
                <Text style={{ fontFamily: 'Inter_700Bold', color: INK }}>photography</Text>.
                Someone else has photography and needs web design. PANDAM spots the mirror — no
                money changes hands.
              </Text>
            </View>
          ) : null}
        </Stack>
      </View>
      <AddCategorySheet
        visible={addingCategory}
        onClose={() => setAddingCategory(false)}
        existing={categories.data ?? []}
        onCreated={(c) => goDiscover(c.id)}
        onUseExisting={(id) => goDiscover(id)}
      />
    </Screen>
  );
}
