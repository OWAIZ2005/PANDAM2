import { type PublicationStatus } from '@pandam/types';

/** Compact relative time, e.g. "3d", "just now". */
export function timeAgo(epochMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(epochMs).toLocaleDateString();
}

export const STATUS_LABEL: Record<PublicationStatus, string> = {
  draft: 'Draft',
  published: 'Active',
  paused: 'Paused',
  sold: 'Sold',
  traded: 'Traded',
  archived: 'Archived',
};

export function statusBadgeKind(status: PublicationStatus): 'success' | 'neutral' | 'warning' {
  if (status === 'published') return 'success';
  if (status === 'paused') return 'warning';
  return 'neutral';
}

export const TYPE_LABEL: Record<'product' | 'service' | 'skill', string> = {
  product: 'Product',
  service: 'Service',
  skill: 'Skill',
};

/** `amount` is the minor currency unit (paise for INR) — an exact integer. */
export function formatMoney(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}

/** Clock time for a chat bubble, e.g. "14:05". */
export function timeOfDay(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Day separator label for a message list: "Today", "Yesterday", or a date.
 *
 * Chat needs this because relative times ("3d ago") stop being useful once a
 * conversation has more than a handful of messages — you want to know which
 * DAY something was said, then the clock time within it.
 */
export function dayLabel(epochMs: number, now = Date.now()): string {
  const d = new Date(epochMs);
  const today = new Date(now);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';

  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
