import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';

import { type OfferView } from '@pandam/types';
import {
  Avatar,
  Badge,
  Chip,
  EmptyState,
  FloatingObject,
  GroupedList,
  ListRow,
  Notice,
  Reveal,
  Screen,
  SegmentedControl,
  SkeletonList,
  colors,
  layout,
  spacing,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ObjectCluster } from '@/components/brand/ObjectCluster';
import { MatchCard } from '@/components/MatchCard';
import { ErrorState } from '@/components/states';
import { demoMatches, demoMergeList, demoOffers, demoQuery } from '@/dummy';
import { mediaSrc } from '@/lib/api/media';
import { useIncomingOffers, useOutgoingOffers } from '@/lib/hooks/useOffers';
import { useMatches } from '@/lib/hooks/useMatches';

const STATUS_KIND: Record<OfferView['status'], 'neutral' | 'success' | 'danger' | 'warning'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
};

/** Sentence-case labels; the API's lowercase enum is not user-facing copy. */
const STATUS_LABEL: Record<OfferView['status'], string> = {
  pending: 'Awaiting reply',
  accepted: 'Accepted',
  rejected: 'Declined',
  cancelled: 'Withdrawn',
  expired: 'Expired',
};

type IncomingFilter = 'all' | 'pending' | 'accepted' | 'rejected';

const INCOMING_FILTER_LABEL: Record<IncomingFilter, string> = {
  all: 'All',
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Declined',
};

type Tab = 'reciprocal' | 'received' | 'sent';

/**
 * Matches — the single screen for everything about who you could trade with
 * and who already wants to: the reciprocal "you have / they need" candidate
 * feed (unchanged), PLUS incoming interest on your own listings (received
 * offers, with accept/reject) and what you've sent. Accepting an offer here
 * routes to the existing offer detail screen, which creates the barter
 * transaction and opens the existing chat — no parallel request system.
 */
const VALID_TABS: Tab[] = ['reciprocal', 'received', 'sent'];

export default function MatchesScreen() {
  const router = useRouter();
  // Entry points elsewhere (profile, messages/transactions empty states, a
  // need's "View offers") deep-link straight to the Received/Sent tab.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(
    VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'reciprocal',
  );
  // The tab bar keeps this screen mounted across visits, so a fresh
  // `?tab=received` deep link (e.g. from Profile → Offers) needs to be
  // re-applied on every focus, not just on first mount.
  useFocusEffect(
    useCallback(() => {
      if (tabParam && VALID_TABS.includes(tabParam as Tab)) setTab(tabParam as Tab);
    }, [tabParam]),
  );
  const [incomingFilter, setIncomingFilter] = useState<IncomingFilter>('all');

  const matches = demoQuery(useMatches(), demoMatches);
  const matchCount = matches.data?.length ?? 0;

  const incoming = demoMergeList(
    useIncomingOffers(),
    demoOffers.filter((o) => !o.isMine),
  );
  const outgoing = demoMergeList(
    useOutgoingOffers(),
    demoOffers.filter((o) => o.isMine),
  );
  const pendingIncoming = (incoming.data ?? []).filter((o) => o.status === 'pending').length;
  const incomingCount = (status: IncomingFilter) =>
    status === 'all'
      ? (incoming.data ?? []).length
      : (incoming.data ?? []).filter((o) => o.status === status).length;

  const offersTab = tab === 'received' ? incoming : outgoing;
  const offersData =
    tab === 'received' && incomingFilter !== 'all'
      ? offersTab.data?.filter((o) => o.status === incomingFilter)
      : offersTab.data;

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
          subtitle="Who you mirror, and who already wants to trade."
          right={
            matchCount > 0 ? (
              <Badge label={`${matchCount} live`} kind="match" variant="solid" dot />
            ) : null
          }
        />
        <SegmentedControl
          options={[
            { value: 'reciprocal', label: 'Mirrors' },
            {
              value: 'received',
              label: pendingIncoming > 0 ? `Received · ${pendingIncoming}` : 'Received',
            },
            { value: 'sent', label: 'Sent' },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v as Tab);
            if (v !== 'received') setIncomingFilter('all');
          }}
        />
      </View>

      {tab === 'received' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: spacing.md }}
          contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: spacing.sm }}
        >
          {(['all', 'pending', 'accepted', 'rejected'] as const).map((status) => (
            <Chip
              key={status}
              label={INCOMING_FILTER_LABEL[status]}
              selected={incomingFilter === status}
              count={incomingCount(status)}
              onPress={() => setIncomingFilter(status)}
            />
          ))}
        </ScrollView>
      ) : null}

      {tab === 'reciprocal' ? (
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
            matchCount > 0 ? (
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
      ) : (
        <GroupedList
          data={offersData ?? []}
          key={tab}
          keyExtractor={(o) => o.id}
          showsVerticalScrollIndicator={false}
          separatorInset={spacing.lg + 40 + spacing.md}
          contentContainerStyle={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: layout.gutter,
            paddingTop: spacing.lg,
            paddingBottom: layout.tabBarInset,
            flexGrow: 1,
          }}
          renderItem={({ item }) => {
            const person = item.isMine ? item.toUser : item.fromUser;
            return (
              <ListRow
                leading={
                  <Avatar name={person.displayName} size={40} uri={mediaSrc(person.avatarUrl)} />
                }
                title={item.isMine ? `To ${person.displayName}` : `From ${person.displayName}`}
                subtitle={`${item.offered.title} ↔ ${item.requested.title}`}
                // An offer waiting on YOU is the only row that gets emphasis.
                emphasis={!item.isMine && item.status === 'pending'}
                trailing={
                  <Badge label={STATUS_LABEL[item.status]} kind={STATUS_KIND[item.status]} dot />
                }
                chevron={<Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
                onPress={() => router.push(`/(app)/offer/${item.id}`)}
              />
            );
          }}
          ListEmptyComponent={
            offersTab.isPending ? (
              <SkeletonList count={3} />
            ) : offersTab.isError ? (
              <ErrorState error={offersTab.error} onRetry={() => void offersTab.refetch()} />
            ) : (
              <EmptyState
                icon={<Ionicons name="paper-plane-outline" size={22} color={colors.textSecondary} />}
                title={tab === 'received' ? 'No interest yet' : 'No offers sent'}
                body={
                  tab === 'received'
                    ? 'When someone wants to trade for something you have, it arrives here.'
                    : 'Open any listing you like and offer one of your own items against it.'
                }
                actionLabel={tab === 'sent' ? 'Browse listings' : undefined}
                onAction={tab === 'sent' ? () => router.push('/(app)/(tabs)/discover') : undefined}
              />
            )
          }
        />
      )}
    </Screen>
  );
}
