import { Ionicons } from '@expo/vector-icons';
import { type OfferStatus, type OfferView } from '@pandam/types';
import { Image, View } from 'react-native';

import { Badge, Press, Reveal, Row, Text, colors, layout, radii, spacing } from '@pandam/ui';

import { mediaSrc } from '@/lib/api/media';

type BadgeKind = 'neutral' | 'success' | 'danger' | 'warning';

/** Matches the status treatment on the full offer screen — one vocabulary, not two. */
const STATUS_KIND: Record<OfferStatus, BadgeKind> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
};

const STATUS_LABEL: Record<OfferStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Declined',
  cancelled: 'Withdrawn',
  expired: 'Expired',
};

/** One line under the chat header that says where the trade stands. */
export function tradeSubtitle(offer: OfferView | undefined): string {
  if (!offer) return 'Trade chat';
  switch (offer.status) {
    case 'pending':
      return offer.isMine ? 'Offer sent — waiting for a reply' : 'Sent you a trade offer';
    case 'accepted':
      return 'Trade agreed — arrange the swap';
    case 'rejected':
      return 'Offer declined';
    case 'cancelled':
      return 'Offer withdrawn';
    default:
      return 'Offer expired';
  }
}

/** The small "this is a trade" mark — always present, independent of whether
 *  a photo is available. */
function TradeMark() {
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: radii.md,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
    </View>
  );
}

/**
 * The real photo for this trade: the requested item's own cover photo —
 * the actual listing image, embedded directly in the offer response server
 * -side (`ItemRef.imageUrl`), so it is available here regardless of whether
 * the listing is still publicly browsable once traded. Falls back to
 * whatever photo the sender separately attached to the offer itself when the
 * item has none of its own. Renders nothing — not a placeholder — when
 * neither exists, same rule as everywhere else in the product: never a
 * stand-in product photo.
 */
function TradeThumb({ offer }: { offer: OfferView }) {
  const src = mediaSrc(offer.requested.imageUrl ?? offer.imageUrl ?? undefined);
  if (!src) return null;

  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: radii.md,
        borderWidth: layout.hairline,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <Image source={{ uri: src }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

/**
 * The compact "why are we talking" block pinned at the top of a trade chat:
 * what is being swapped for what, the offer's live status, and a way back to
 * the full offer (where accept / decline live).
 *
 * Built as a Swiss information block rather than a chat-app card — a thick
 * structural border standing in for a shadow, a photo figure on the left,
 * tight type hierarchy on the right, "View" as a plain directional label
 * rather than a button.
 */
export function TradeContextCard({ offer, onOpen }: { offer: OfferView; onOpen: () => void }) {
  const label = offer.requestedKind === 'need' ? 'Offer for a request' : 'Trade offer';

  return (
    <Reveal>
      <Press
        scale="sm"
        accessibilityRole="button"
        accessibilityLabel={`Trade offer: ${offer.offered.title} for ${offer.requested.title}. ${STATUS_LABEL[offer.status]}. View offer.`}
        onPress={onOpen}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radii.lg,
          borderWidth: layout.borderThick,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <TradeMark />

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Row gap="xs" align="center">
            <Text variant="overline" tone="muted" style={{ letterSpacing: 0.8 }}>
              {label.toUpperCase()}
            </Text>
            <Badge label={STATUS_LABEL[offer.status]} kind={STATUS_KIND[offer.status]} dot />
          </Row>
          <Text variant="bodyStrong" numberOfLines={1}>
            {offer.requested.title}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {offer.isMine ? 'You offer' : 'They offer'}: {offer.offered.title}
          </Text>
        </View>

        <TradeThumb offer={offer} />

        <Row gap="xxs" align="center">
          <Text variant="label" tone="accent" style={{ fontWeight: '700' }}>
            View
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </Row>
      </Press>
    </Reveal>
  );
}
