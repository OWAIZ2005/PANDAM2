import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { type MarketItem } from '@pandam/types';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  IconFrame,
  ListRow,
  Rail,
  Row,
  Screen,
  SectionHeader,
  SkeletonList,
  Stack,
  Text,
  colors,
  layout,
  radii,
  spacing,
  shadows,
  useToast,
} from '@pandam/ui';

import { IS_DEMO_DATA, demoMergeList, demoMyListings, demoMyNeeds } from '@/dummy';
import { useTransactions } from '@/lib/hooks/useTransactions';
import { AppHeader } from '@/components/AppHeader';
import { AvatarPicker } from '@/components/AvatarPicker';
import { PandamBackground } from '@/components/brand/PandamBackground';
import { ItemCard } from '@/components/ItemCard';
import { ErrorState } from '@/components/states';
import { type MarketKind } from '@/lib/api/market';
import { mediaSrc } from '@/lib/api/media';
import { useLogout, useSession } from '@/lib/auth/hooks';
import { useMyItems } from '@/lib/hooks/useMarket';
import { useUploadAvatar } from '@/lib/hooks/useMedia';
import { useUnreadNotificationCount } from '@/lib/hooks/useNotifications';

function MyItemsSection({
  kind,
  onOpen,
  onAdd,
}: {
  kind: MarketKind;
  onOpen: (item: MarketItem) => void;
  onAdd: () => void;
}) {
  const q = demoMergeList(useMyItems(kind), kind === 'listing' ? demoMyListings : demoMyNeeds);
  const isHave = kind === 'listing';
  const items = q.data ?? [];
  const live = items.filter((i) => i.status === 'published').length;

  return (
    <View>
      <SectionHeader
        title={isHave ? 'Things I have' : 'Things I need'}
        subtitle={items.length > 0 ? `${live} live of ${items.length}` : undefined}
        actionLabel="Add"
        onAction={onAdd}
      />

      {q.isPending ? (
        <SkeletonList count={1} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          size="inline"
          tone={isHave ? 'accent' : 'need'}
          icon={
            <Ionicons
              name={isHave ? 'cube-outline' : 'search-outline'}
              size={20}
              color={isHave ? colors.accent : colors.need}
            />
          }
          title={isHave ? 'Nothing listed yet' : 'Nothing requested yet'}
          body={
            isHave
              ? 'List something and people can start offering trades for it.'
              : 'Say what you are after — it is half of every match.'
          }
          actionLabel={isHave ? 'Add something I have' : 'Add something I need'}
          actionVariant={isHave ? 'primary' : 'need'}
          onAction={onAdd}
        />
      ) : (
        <Rail>
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              variant="rail"
              showOwner={false}
              showStatus
              onPress={() => onOpen(item)}
            />
          ))}
        </Rail>
      )}
    </View>
  );
}

/**
 * The unread count on a settings row.
 *
 * Clay rather than terracotta: terracotta means "I HAVE" everywhere else in
 * the product, and a green count here would read as a quantity of something
 * rather than as something needing attention.
 */
function CountBadge({ count }: { count: number }) {
  return (
    <View
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: radii.pill,
        backgroundColor: colors.need,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="caption" numeric tone="inverse" style={{ fontWeight: '600' }}>
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const uploadAvatar = useUploadAvatar();
  const avatarToast = useToast();
  const router = useRouter();
  const { user, profile } = useSession();
  const logout = useLogout();
  const unread = useUnreadNotificationCount();
  const myHave = demoMergeList(useMyItems('listing'), demoMyListings);
  const myNeed = demoMergeList(useMyItems('need'), demoMyNeeds);
  const trades = useTransactions();
  const tradeCount = IS_DEMO_DATA
    ? 4
    : (trades.data?.filter((t) => t.status === 'completed').length ?? 0);

  const open = (item: MarketItem) =>
    router.push(item.kind === 'listing' ? `/(app)/listing/${item.id}` : `/(app)/need/${item.id}`);

  if (!profile) {
    return (
      <Screen scroll tabBarInset>
        <AppHeader title="Profile" />
        <EmptyState title="Profile unavailable" body="Try again in a moment." />
      </Screen>
    );
  }

  const location = [profile.locationCity, profile.locationRegion, profile.locationCountry]
    .filter(Boolean)
    .join(', ');

  const chevron = <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />;

  return (
    <Screen scroll padded={false} tabBarInset>
      <View style={{ overflow: 'hidden' }}>
        <PandamBackground variant="profile" />
        <View
          style={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: layout.gutter,
            paddingTop: spacing.lg,
          }}
        >
          <AppHeader
            eyebrow="04"
            title="Profile"
            subtitle="Your items, interests and activity."
            right={
              <IconButton
                variant="plain"
                size={40}
                icon={<Ionicons name="settings-outline" size={19} color={colors.textPrimary} />}
                accessibilityLabel="Account settings"
                onPress={() => router.push('/(app)/account')}
                style={{ backgroundColor: colors.surface, ...shadows.xs }}
              />
            }
          />
        </View>
      </View>
      <View
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.sm,
        }}
      >
        {/* ---------------------------------------------------------- you -- */}
        {/*
          No gradient banner. A coloured slab behind your own name and photo
          made the profile look like a membership card; on the page background
          the avatar and the name are the strongest things on screen, which is
          what a profile should lead with.
        */}
        <Stack
          gap="2xl"
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii['2xl'],
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.xl,
            ...shadows.sm,
          }}
        >
          <Row gap="lg" align="flex-start">
            <View
              style={{ borderRadius: radii.pill, borderWidth: 3, borderColor: colors.accentSoft }}
            >
              <AvatarPicker
                name={profile.displayName}
                size={72}
                uri={mediaSrc(profile.avatarUrl)}
                busy={uploadAvatar.isPending}
                onPicked={(uri) =>
                  uploadAvatar.mutate(uri, {
                    onSuccess: () => avatarToast.success('Photo updated.'),
                    onError: () =>
                      avatarToast.error('That photo could not be uploaded. Please try again.'),
                  })
                }
              />
            </View>

            <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: spacing.xs }}>
              <Text variant="display" numberOfLines={1}>
                {profile.displayName}
              </Text>
              <Text variant="bodySm" tone="muted" numberOfLines={1}>
                {profile.username ? `@${profile.username}` : user?.email}
              </Text>
              {user?.identityVerification?.status === 'verified' ? (
                <Row gap="xs" style={{ marginTop: 2 }}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.match} />
                  <Text variant="caption" tone="match" style={{ fontWeight: '700' }}>
                    Identity Verified ✓
                  </Text>
                </Row>
              ) : null}
              {location ? (
                <Row gap="xs" style={{ marginTop: 2 }}>
                  <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {location}
                  </Text>
                </Row>
              ) : null}
            </View>

            <Button
              label="Edit"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/(app)/edit-profile')}
            />
          </Row>

          {/* Marketplace identity: what you bring, what you seek, what you've done. */}
          <Row style={{ marginHorizontal: -spacing.xs }}>
            {[
              { n: myHave.data?.length ?? 0, l: 'Listed', tone: colors.accent },
              { n: myNeed.data?.length ?? 0, l: 'Wanted', tone: colors.needText },
              { n: tradeCount, l: 'Trades done', tone: colors.matchText },
            ].map((st) => (
              <View
                key={st.l}
                style={{
                  flex: 1,
                  marginHorizontal: spacing.xs,
                  paddingVertical: spacing.md,
                  borderRadius: radii.lg,
                  backgroundColor: colors.background,
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Text
                  style={{
                    fontSize: 24,
                    lineHeight: 28,
                    fontWeight: '800',
                    letterSpacing: -0.6,
                    color: st.tone,
                  }}
                >
                  {st.n}
                </Text>
                <Text variant="caption" tone="muted">
                  {st.l}
                </Text>
              </View>
            ))}
          </Row>

          {profile.bio ? (
            <Text variant="body" tone="secondary" style={{ maxWidth: layout.proseMaxWidth }}>
              {profile.bio}
            </Text>
          ) : null}
        </Stack>
      </View>

      {/* --------------------------------------------------------- body --- */}
      <View
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing['3xl'],
        }}
      >
        <Stack gap="3xl">
          <MyItemsSection
            kind="listing"
            onOpen={open}
            onAdd={() => router.push('/(app)/new-listing')}
          />
          <MyItemsSection kind="need" onOpen={open} onAdd={() => router.push('/(app)/new-need')} />

          {/*
            Two groups, not one list of nine. The first is the trading you are
            actually doing; the second is account housekeeping. Splitting them
            means "Sign out" is nowhere near "Messages", which is worth the
            extra heading.
          */}
          <View>
            <SectionHeader title="Your trading" />
            <Card padded={false}>
              <ListRow
                leading={
                  <IconFrame tone="match">
                    <Ionicons name="sparkles-outline" size={17} color={colors.match} />
                  </IconFrame>
                }
                title="Matches"
                subtitle="Reciprocal barters found for you"
                chevron={chevron}
                onPress={() => router.push('/(app)/(tabs)/matches')}
              />
              <Divider tone="soft" inset={spacing.lg + 38 + spacing.md} />
              <ListRow
                leading={
                  <IconFrame tone="accent">
                    <Ionicons name="paper-plane-outline" size={17} color={colors.accent} />
                  </IconFrame>
                }
                title="Offers"
                subtitle="Proposals you have sent and received"
                chevron={chevron}
                onPress={() => router.push('/(app)/(tabs)/matches?tab=received')}
              />
              <Divider tone="soft" inset={spacing.lg + 38 + spacing.md} />
              <ListRow
                leading={
                  <IconFrame tone="accent">
                    <Ionicons name="chatbubbles-outline" size={17} color={colors.accent} />
                  </IconFrame>
                }
                title="Messages"
                subtitle="Chats for trades you have agreed"
                chevron={chevron}
                onPress={() => router.push('/(app)/messages')}
              />
              <Divider tone="soft" inset={spacing.lg + 38 + spacing.md} />
              <ListRow
                leading={
                  <IconFrame tone="accent">
                    <Ionicons name="repeat-outline" size={17} color={colors.accent} />
                  </IconFrame>
                }
                title="Transactions"
                subtitle="Track and complete your trades"
                chevron={chevron}
                onPress={() => router.push('/(app)/transactions')}
              />
              <Divider tone="soft" inset={spacing.lg + 38 + spacing.md} />
              <ListRow
                leading={
                  <IconFrame tone={unread > 0 ? 'need' : 'neutral'}>
                    <Ionicons
                      name="notifications-outline"
                      size={17}
                      color={unread > 0 ? colors.need : colors.textSecondary}
                    />
                  </IconFrame>
                }
                title="Notifications"
                subtitle={unread > 0 ? `${unread} unread` : 'Offers, messages and trade updates'}
                emphasis={unread > 0}
                trailing={unread > 0 ? <CountBadge count={unread} /> : undefined}
                chevron={chevron}
                onPress={() => router.push('/(app)/notifications')}
              />
            </Card>
          </View>

          <View>
            <SectionHeader title="Account" />
            <Card padded={false}>
              <ListRow
                leading={
                  <IconFrame>
                    <Ionicons name="person-outline" size={17} color={colors.textSecondary} />
                  </IconFrame>
                }
                title="Edit profile"
                subtitle="Name, username, bio, photo and city"
                chevron={chevron}
                onPress={() => router.push('/(app)/edit-profile')}
              />
              <Divider tone="soft" inset={spacing.lg + 38 + spacing.md} />
              <ListRow
                leading={
                  <IconFrame>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={17}
                      color={colors.textSecondary}
                    />
                  </IconFrame>
                }
                title="Security"
                subtitle="Devices, password, delete account"
                chevron={chevron}
                onPress={() => router.push('/(app)/account')}
              />
              <Divider tone="soft" inset={spacing.lg + 38 + spacing.md} />
              <ListRow
                leading={
                  <IconFrame tone="danger">
                    <Ionicons name="log-out-outline" size={17} color={colors.danger} />
                  </IconFrame>
                }
                title={logout.isPending ? 'Signing out…' : 'Sign out'}
                danger
                onPress={() =>
                  logout.mutate(undefined, { onSettled: () => router.replace('/(auth)/login') })
                }
              />
            </Card>
          </View>

          <Row justify="center" gap="xs" style={{ paddingBottom: spacing.lg }}>
            <Badge label="Goods for goods, no money" kind="neutral" />
          </Row>
        </Stack>
      </View>
    </Screen>
  );
}
