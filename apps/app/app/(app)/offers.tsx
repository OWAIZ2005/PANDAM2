import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { type OfferView } from '@pandam/types';
import {
  Avatar,
  Badge,
  Chip,
  EmptyState,
  GroupedList,
  ListRow,
  Screen,
  SegmentedControl,
  SkeletonList,
  colors,
  layout,
  spacing,
} from '@pandam/ui';

import { demoMergeList, demoOffers } from '@/dummy';
import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/states';
import { mediaSrc } from '@/lib/api/media';
import { useIncomingOffers, useOutgoingOffers } from '@/lib/hooks/useOffers';

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

export default function OffersScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [incomingFilter, setIncomingFilter] = useState<IncomingFilter>('all');
  const incoming = demoMergeList(
    useIncomingOffers(),
    demoOffers.filter((o) => !o.isMine),
  );
  const outgoing = demoMergeList(
    useOutgoingOffers(),
    demoOffers.filter((o) => o.isMine),
  );
  const active =
    tab === 'incoming'
      ? {
          ...incoming,
          data:
            incomingFilter === 'all'
              ? incoming.data
              : incoming.data?.filter((o) => o.status === incomingFilter),
        }
      : outgoing;

  /* A count on the received tab: an unanswered offer is the one thing on this
     screen that needs DOING rather than just reading. */
  const pendingIncoming = (incoming.data ?? []).filter((o) => o.status === 'pending').length;
  const incomingCount = (status: IncomingFilter) =>
    status === 'all'
      ? (incoming.data ?? []).length
      : (incoming.data ?? []).filter((o) => o.status === status).length;

  return (
    <Screen padded={false}>
      <View
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.lg,
        }}
      >
        <AppHeader title="Offers" subtitle="Barter proposals between you and other members." back />
        <SegmentedControl
          options={[
            {
              value: 'incoming',
              label: pendingIncoming > 0 ? `Received · ${pendingIncoming}` : 'Received',
            },
            { value: 'outgoing', label: 'Sent' },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            if (v === 'outgoing') setIncomingFilter('all');
          }}
        />
      </View>

      {tab === 'incoming' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: spacing.md }}
          contentContainerStyle={{
            paddingHorizontal: layout.gutter,
            gap: spacing.sm,
          }}
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

      <GroupedList
        data={active.data ?? []}
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
          active.isPending ? (
            <SkeletonList count={3} />
          ) : active.isError ? (
            <ErrorState error={active.error} onRetry={() => void active.refetch()} />
          ) : (
            <EmptyState
              icon={<Ionicons name="paper-plane-outline" size={22} color={colors.textSecondary} />}
              title={tab === 'incoming' ? 'No offers received' : 'No offers sent'}
              body={
                tab === 'incoming'
                  ? 'When someone wants to trade for something you have, it arrives here.'
                  : 'Open any listing you like and offer one of your own items against it.'
              }
              actionLabel={tab === 'outgoing' ? 'Browse listings' : undefined}
              onAction={
                tab === 'outgoing' ? () => router.push('/(app)/(tabs)/discover') : undefined
              }
            />
          )
        }
      />
    </Screen>
  );
}
