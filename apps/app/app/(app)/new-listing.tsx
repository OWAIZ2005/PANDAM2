import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen, layout, spacing } from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ItemForm } from '@/components/ItemForm';
import { useUploadItemImages } from '@/lib/hooks/useMedia';
import { useCreateItem } from '@/lib/hooks/useMarket';

export default function NewListingScreen() {
  const router = useRouter();
  const create = useCreateItem('listing');
  const uploadImages = useUploadItemImages('listing');

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.lg }}>
        <AppHeader
          title="Something I have"
          subtitle="A product, a service, or a skill you can put on the table."
          back
        />
      </View>

      <ItemForm
        kind="listing"
        mode="create"
        submitting={create.isPending || uploadImages.isPending}
        error={create.error}
        onSubmit={({ photos, ...values }) =>
          create.mutate(values, {
            onSuccess: async (res) => {
              // Photos can only be attached once the listing has an id, so they
              // upload here rather than inside the form. A failed upload still
              // lands on the listing: the item itself was created, and the
              // detail screen is where the owner can retry adding photos.
              if (photos?.length) {
                await uploadImages
                  .mutateAsync({ itemId: res.item.id, uris: photos })
                  .catch(() => undefined);
              }
              router.replace(`/(app)/listing/${res.item.id}`);
            },
          })
        }
      />
    </Screen>
  );
}
