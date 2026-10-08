import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen, layout, spacing } from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ItemForm } from '@/components/ItemForm';
import { useUploadItemImages } from '@/lib/hooks/useMedia';
import { useCreateItem } from '@/lib/hooks/useMarket';

export default function NewNeedScreen() {
  const router = useRouter();
  const create = useCreateItem('need');
  const uploadImages = useUploadItemImages('need');

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.lg }}>
        <AppHeader
          title="Something I need"
          subtitle="We find people who have it and want what you offer."
          back
        />
      </View>

      <ItemForm
        kind="need"
        mode="create"
        submitting={create.isPending || uploadImages.isPending}
        error={create.error}
        onSubmit={({ photos, ...values }) =>
          create.mutate(values, {
            onSuccess: async (res) => {
              // Photos can only be attached once the need has an id, so they
              // upload here rather than inside the form — same pattern as a
              // listing's own photos.
              if (photos?.length) {
                await uploadImages
                  .mutateAsync({ itemId: res.item.id, uris: photos })
                  .catch(() => undefined);
              }
              router.replace(`/(app)/need/${res.item.id}`);
            },
          })
        }
      />
    </Screen>
  );
}
