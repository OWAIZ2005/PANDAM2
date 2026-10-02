import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';

import {
  Badge,
  EmptyState,
  FloatingObject,
  Reveal,
  Notice,
  Screen,
  SkeletonList,
  colors,
  layout,
  spacing,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ObjectCluster } from '@/components/brand/ObjectCluster';
import { MatchCard } from '@/components/MatchCard';
import { ErrorState } from '@/components/states';
import { demoMatches, demoQuery } from '@/dummy';
import { useMatches } from '@/lib/hooks/useMatches';

export default function MatchesScreen() {
  const router = useRouter();
  const matches = demoQuery(useMatches(), demoMatches);
  const count = matches.data?.length ?? 0;

  return (
    <Screen padded={false}>
      <View
        style={{
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.lg,
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        <AppHeader
          eyebrow="03"
          title="Matches"
          subtitle="You have what they need, they have what you need."
          right={
            count > 0 ? <Badge label={`${count} live`} kind="match" variant="solid" dot /> : null
          }
        />
      </View>

      <FlatList
        data={matches.data ?? []}
        keyExtractor={(m) => m.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.sm,
          paddingBottom: layout.tabBarInset,
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          gap: spacing.lg,
          flexGrow: 1,
        }}
        refreshing={matches.isRefetching}
        onRefresh={() => void matches.refetch()}
        renderItem={({ item, index }) => (
          <Reveal index={index}>
            <MatchCard
              match={item}
              onPress={() => router.push(`/(app)/match/${encodeURIComponent(item.key)}`)}
            />
          </Reveal>
        )}
        ListEmptyComponent={
          matches.isPending ? (
            <SkeletonList count={3} />
          ) : matches.isError ? (
            <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />
          ) : (
            <EmptyState
              art={<ObjectCluster left="camera" right="laptop" icon="sparkles" />}
              tone="match"
              icon={
                <FloatingObject>
                  <Ionicons name="sparkles" size={24} color={colors.match} />
                </FloatingObject>
              }
              title="No barter match yet"
              body="Add what you have and what you need. When someone is the mirror of you, they appear here — no money, just a fair swap."
              actionLabel="Explore what others have"
              actionVariant="match"
              onAction={() => router.push('/(app)/(tabs)/discover')}
              secondaryLabel="Add something I have"
              onSecondary={() => router.push('/(app)/new-listing')}
            />
          )
        }
        ListFooterComponent={
          /*
            Worth saying plainly: people distrust a feed that decides things
            for them. Stating the rule — same category, same kind, both ways —
            is what makes a match feel like a fact rather than a suggestion.
          */
          count > 0 ? (
            <Notice
              kind="neutral"
              icon={
                <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
              }
            >
              Matches follow one exact rule: the same category and kind on both sides, in both
              directions. No black-box scoring.
            </Notice>
          ) : null
        }
      />
    </Screen>
  );
}
