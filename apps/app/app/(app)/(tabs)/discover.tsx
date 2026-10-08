import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, View, useWindowDimensions } from 'react-native';

import {
  Chip,
  EmptyState,
  Row,
  Screen,
  SearchInput,
  SegmentedControl,
  Skeleton,
  SkeletonGrid,
  Stack,
  Text,
  colors,
  layout,
  radii,
  spacing,
} from '@pandam/ui';

import { AddCategorySheet } from '@/components/AddCategorySheet';
import { PandamBackground } from '@/components/brand/PandamBackground';
import { CategoryRail } from '@/components/CategoryFilter';
import { ItemCard } from '@/components/ItemCard';
import { ErrorState } from '@/components/states';
import { demoCities, demoDiscover, demoMergePages, demoQuery } from '@/dummy';
import { type MarketKind } from '@/lib/api/market';
import { useSession } from '@/lib/auth/hooks';
import { useBrowseCategories } from '@/lib/hooks/useCategories';
import { useDebounced } from '@/lib/hooks/useDebounced';
import { useDiscover, useListingCities } from '@/lib/hooks/useMarket';

const KIND_OPTIONS = [
  { value: 'listing' as const, label: 'I HAVE', tone: 'accent' as const },
  { value: 'need' as const, label: 'I NEED', tone: 'need' as const },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; owner?: string; city?: string }>();
  const [kind, setKind] = useState<MarketKind>('listing');
  const [rawQuery, setRawQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(params.category ?? null);
  const [city, setCity] = useState<string | null>(params.city ?? null);
  const q = useDebounced(rawQuery.trim(), 350);

  const categories = useBrowseCategories();
  const [addingCategory, setAddingCategory] = useState(false);
  const cities = demoQuery(useListingCities(), demoCities() as never);
  const filters = useMemo(
    () => ({
      category: categoryId ?? undefined,
      q: q || undefined,
      owner: params.owner || undefined,
      city: city ?? undefined,
      limit: 12,
    }),
    [categoryId, q, params.owner, city],
  );
  const discover = demoMergePages(useDiscover(kind, filters), demoDiscover(kind, filters));
  const { user: me } = useSession();
  // Discover is for OTHER people's items — your own listing or request is not
  // an opportunity for you (it lives on your Profile instead).
  const items = (discover.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (i) => i.ownerId !== me?.id,
  );
  // Marketplace rhythm: the freshest item leads as a large feature card.
  const featured = items.length > 3 ? items[0] : null;
  const gridItems = featured ? items.slice(1) : items;

  /*
   * Column count follows the WIDTH, not the platform. Two columns inside a
   * 720pt reading column gives 340pt cards, which on a laptop are absurdly
   * large for a thumbnail and a two-line title. Three is the right density
   * once there is room for it — the grid gets denser on a bigger screen
   * rather than just wider.
   */
  const { width } = useWindowDimensions();
  const columns = width >= 620 ? 3 : 2;

  const isHave = kind === 'listing';
  const tone = isHave ? 'accent' : 'need';
  const activeFilters = [!!q, !!categoryId, !!city].filter(Boolean).length;
  const clearFilters = () => {
    setRawQuery('');
    setCategoryId(null);
    setCity(null);
  };

  /*
   * The search box and the HAVE/NEED switch stay pinned; the taxonomy filters
   * and the result count scroll away with the grid.
   *
   * Before, all five controls were pinned, which on a 375pt screen left less
   * than half the viewport for results — you had to scroll past the filters
   * to see whether the filters had found anything. Search and the kind switch
   * are the two you reach for repeatedly, so those are the two that stay.
   */
  const pinned = (
    // The rule spans the full width; the controls inside it stay in the same
    // centred column as the grid, so nothing is left hanging on a wide screen.
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.borderSoft,
        overflow: 'hidden',
      }}
    >
      <PandamBackground variant="discover" />
      <View
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.md,
          paddingBottom: spacing.md,
          gap: spacing.md,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="overline" tone={tone} caps>
            {isHave ? 'What people have' : 'What people need'}
          </Text>
          <Text
            style={{
              fontFamily: 'InterTight_800ExtraBold',
              fontSize: 34,
              lineHeight: 36,
              letterSpacing: -1,
              color: colors.textPrimary,
              textTransform: 'uppercase',
            }}
          >
            Discover
          </Text>
        </View>
        <SearchInput
          icon={<Ionicons name="search" size={17} color={colors.textMuted} />}
          placeholder={isHave ? 'Search what people have' : 'Search what people need'}
          value={rawQuery}
          onChangeText={setRawQuery}
          autoCapitalize="none"
          onClear={() => setRawQuery('')}
          clearIcon={<Ionicons name="close-circle" size={17} color={colors.textMuted} />}
        />
        <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={setKind} />
      </View>
    </View>
  );

  const scrollingHeader = (
    <Stack gap="lg" style={{ paddingBottom: spacing.lg }}>
      {categories.data ? (
        <CategoryRail
          categories={categories.data}
          selectedId={categoryId}
          onSelect={setCategoryId}
          tone={tone}
          onAdd={() => setAddingCategory(true)}
        />
      ) : (
        <Row gap="sm">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={72} height={58} radius={radii.md} />
          ))}
        </Row>
      )}

      {/*
        Barter means meeting in person, so where something is matters as much
        as what it is. Only cities that actually have listings are offered, and
        the row is hidden entirely when nobody has set one.
      */}
      {cities.data && cities.data.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -layout.gutter }}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: layout.gutter }}
        >
          <Chip
            label="Anywhere"
            icon={<Ionicons name="earth-outline" size={13} color={colors.textMuted} />}
            selected={!city}
            tone={tone}
            onPress={() => setCity(null)}
          />
          {cities.data.map((c) => (
            <Chip
              key={c.city}
              label={c.city}
              count={c.count}
              icon={
                <Ionicons
                  name="location-outline"
                  size={13}
                  color={city === c.city ? colors.textInverse : colors.textMuted}
                />
              }
              selected={city === c.city}
              tone={tone}
              onPress={() => setCity(city === c.city ? null : c.city)}
            />
          ))}
        </ScrollView>
      ) : null}

      {featured ? (
        <ItemCard
          item={featured}
          variant="feature"
          onPress={() =>
            router.push(isHave ? `/(app)/listing/${featured.id}` : `/(app)/need/${featured.id}`)
          }
        />
      ) : null}

      {items.length > 0 ? (
        <Row justify="space-between">
          <Text variant="caption" tone="muted" numeric>
            {items.length} {items.length === 1 ? 'result' : 'results'}
            {activeFilters > 0 ? ` · ${activeFilters} filter${activeFilters === 1 ? '' : 's'}` : ''}
          </Text>
          {activeFilters > 0 ? (
            <Text variant="label" tone={tone} onPress={clearFilters}>
              Clear
            </Text>
          ) : null}
        </Row>
      ) : null}
    </Stack>
  );

  return (
    <Screen padded={false}>
      {pinned}

      <FlatList
        data={gridItems}
        key={`${kind}-${columns}`}
        keyExtractor={(it) => it.id}
        numColumns={columns}
        columnWrapperStyle={{ gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.lg,
          paddingBottom: layout.tabBarInset,
          gap: spacing.md,
          flexGrow: 1,
        }}
        ListHeaderComponent={scrollingHeader}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / columns }}>
            <ItemCard
              item={item}
              variant="grid"
              onPress={() =>
                router.push(isHave ? `/(app)/listing/${item.id}` : `/(app)/need/${item.id}`)
              }
            />
          </View>
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (discover.hasNextPage && !discover.isFetchingNextPage) void discover.fetchNextPage();
        }}
        ListEmptyComponent={
          discover.isPending ? (
            <SkeletonGrid count={6} />
          ) : discover.isError ? (
            <ErrorState error={discover.error} onRetry={() => void discover.refetch()} />
          ) : (
            <EmptyState
              tone={tone}
              icon={
                <Ionicons
                  name={
                    activeFilters > 0
                      ? 'search-outline'
                      : isHave
                        ? 'cube-outline'
                        : 'hand-left-outline'
                  }
                  size={24}
                  color={isHave ? colors.accent : colors.need}
                />
              }
              title={activeFilters > 0 ? 'Nothing matches those filters' : 'Nothing here yet'}
              body={
                activeFilters > 0
                  ? 'Try a broader search, another category, or widen the location.'
                  : `No one has published something they ${isHave ? 'have' : 'need'} yet. Be the first.`
              }
              actionLabel={
                activeFilters > 0
                  ? 'Clear filters'
                  : isHave
                    ? 'Add what you have'
                    : 'Add what you need'
              }
              actionVariant={isHave ? 'primary' : 'need'}
              onAction={
                activeFilters > 0
                  ? clearFilters
                  : () => router.push(isHave ? '/(app)/new-listing' : '/(app)/new-need')
              }
            />
          )
        }
        ListFooterComponent={
          discover.isFetchingNextPage ? (
            <View style={{ paddingTop: spacing.md }}>
              <SkeletonGrid count={2} />
            </View>
          ) : items.length > 0 && !discover.hasNextPage ? (
            <Row justify="center" gap="xs" style={{ paddingVertical: spacing['2xl'] }}>
              <Text variant="caption" tone="faint">
                That is everything
              </Text>
            </Row>
          ) : null
        }
      />
      <AddCategorySheet
        visible={addingCategory}
        onClose={() => setAddingCategory(false)}
        existing={categories.data ?? []}
        onCreated={(c) => setCategoryId(c.id)}
        onUseExisting={(id) => setCategoryId(id)}
      />
    </Screen>
  );
}
