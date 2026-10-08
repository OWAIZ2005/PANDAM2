/**
 * Image upload and URL resolution.
 *
 * The API returns image paths relative to its own origin (`/api/v1/media/…`)
 * so the same row works across local, preview and production deployments.
 * `mediaSrc` is the single place that turns one into something an `<Image>`
 * can fetch — screens must never concatenate that themselves.
 */
import { type ItemImage, type PublicProfile } from '@pandam/types';

import { clientEnv } from '@/lib/env';

import { api } from './client';
import { type MarketKind } from './market';

/** Absolute URL for an API-relative media path. Passes through absolute URLs. */
export function mediaSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${clientEnv.apiUrl}${path}`;
}

/** The photo a card should show, or `undefined` when the item has none. */
export function primaryImage(images: ItemImage[] | undefined): string | undefined {
  return mediaSrc(images?.[0]?.url);
}

/**
 * Wrap a local file URI as multipart form data.
 *
 * Every platform fetches the URI into a real `Blob`/`File` rather than
 * appending the classic RN `{ uri, name, type }` object shape directly: on
 * newer Android builds that shape is sometimes rejected by `FormData` with
 * "Unsupported FormDataPart implementation" (the object isn't recognised as
 * a valid part), while `fetch(uri)` → `Blob` → `File` always is — the same
 * path web already needed for its `blob:`/`data:` URIs, now used everywhere.
 */
async function imageForm(uri: string): Promise<FormData> {
  const form = new FormData();
  const name = uri.split('/').pop()?.split('?')[0] || 'photo.jpg';
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'jpg';
  const type =
    extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';

  const blob = await fetch(uri).then((r) => r.blob());
  form.append('file', new File([blob], name, { type: blob.type || type }));
  return form;
}

const itemBase = (kind: MarketKind) => (kind === 'listing' ? '/api/v1/listings' : '/api/v1/needs');

export const mediaApi = {
  /** Attach one photo to a listing or a need. Returns the stored image. */
  uploadItemImage: async (kind: MarketKind, itemId: string, uri: string) =>
    api.upload<{ image: ItemImage }>(`${itemBase(kind)}/${itemId}/images`, await imageForm(uri)),

  deleteItemImage: (kind: MarketKind, itemId: string, imageId: string) =>
    api.delete<{ deleted: true }>(`${itemBase(kind)}/${itemId}/images/${imageId}`),

  uploadAvatar: async (uri: string) =>
    api.upload<{ profile: PublicProfile }>('/api/v1/profiles/me/avatar', await imageForm(uri)),
};

/** Upload the optional photo for a trade offer; pass the returned key to `offersApi.create`. */
export async function uploadOfferImage(uri: string) {
  return api.upload<{ imageKey: string; imageUrl: string }>(
    '/api/v1/offers/attachments',
    await imageForm(uri),
  );
}

/** Upload the optional photo for a chat message; pass the returned key to `conversationsApi.sendMessage`. */
export async function uploadMessageImage(conversationId: string, uri: string) {
  return api.upload<{ imageKey: string; imageUrl: string }>(
    `/api/v1/conversations/${conversationId}/attachments`,
    await imageForm(uri),
  );
}
