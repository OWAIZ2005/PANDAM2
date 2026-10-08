import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { boundedString, usernameSchema, z, type PatchProfileInput } from '@pandam/validation';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, View } from 'react-native';

import {
  Button,
  Field,
  Notice,
  Screen,
  Stack,
  Text,
  colors,
  layout,
  spacing,
  useToast,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { AvatarPicker } from '@/components/AvatarPicker';
import { PandamBackground } from '@/components/brand/PandamBackground';
import { ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/hooks';
import { useUpdateProfile } from '@/lib/auth/profile';
import { mediaSrc } from '@/lib/api/media';
import { useUploadAvatar } from '@/lib/hooks/useMedia';

// Blank inputs are allowed and mean "clear this field"; non-empty values are
// checked against the shared rules, then mapped to the strict PatchProfileInput.
const optionalTrimmed = (max: number) => z.string().trim().max(max).optional();
const profileFormSchema = z.object({
  displayName: boundedString(1, 80),
  username: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || usernameSchema.safeParse(v).success, {
      message: 'letters, numbers and underscores only',
    }),
  bio: optionalTrimmed(500),
  locationCity: optionalTrimmed(120),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, profile } = useSession();
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const toast = useToast();
  const verified = user?.identityVerification?.status === 'verified';

  const { control, handleSubmit, reset, formState } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { displayName: '', username: '', bio: '', locationCity: '' },
  });

  useEffect(() => {
    if (profile) {
      reset({
        displayName: profile.displayName,
        username: profile.username ?? '',
        bio: profile.bio ?? '',
        locationCity: profile.locationCity ?? '',
      });
    }
  }, [profile, reset]);

  const back = () => router.replace('/(app)/(tabs)/profile');

  const onSubmit = handleSubmit((values) => {
    const payload: PatchProfileInput = {
      displayName: values.displayName,
      username: values.username?.trim() ? values.username.trim() : null,
      bio: values.bio?.trim() ? values.bio.trim() : null,
      locationCity: values.locationCity?.trim() ? values.locationCity.trim() : null,
    };
    update.mutate(payload, {
      onSuccess: () => {
        toast.success('Profile updated.');
        back();
      },
    });
  });

  const formError =
    update.error instanceof ApiError
      ? update.error.message
      : update.error
        ? 'Update failed.'
        : null;

  return (
    <Screen
      padded={false}
      edges={['top', 'bottom']}
      footer={
        <Stack gap="sm">
          <Button
            label={update.isPending ? 'Saving…' : 'Save changes'}
            size="lg"
            fullWidth
            loading={update.isPending}
            disabled={formState.isSubmitting}
            onPress={onSubmit}
          />
          <Button label="Cancel" variant="ghost" fullWidth onPress={back} />
        </Stack>
      }
    >
      <View style={{ overflow: 'hidden' }}>
        <PandamBackground variant="create" />
        <View style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.lg }}>
          <AppHeader title="Edit profile" subtitle="Tell others about yourself." back />
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingBottom: spacing['3xl'],
        }}
      >
        <Stack gap="lg">
          <Stack gap="xs" style={{ alignItems: 'center', marginBottom: spacing.xs }}>
            <AvatarPicker
              name={profile?.displayName ?? 'You'}
              size={96}
              uri={mediaSrc(profile?.avatarUrl)}
              busy={uploadAvatar.isPending}
              onPicked={(uri) =>
                uploadAvatar.mutate(uri, {
                  onSuccess: () => toast.success('Photo updated.'),
                  onError: () => toast.error('That photo could not be uploaded. Please try again.'),
                })
              }
            />
            <Text variant="label" tone="accent">
              {uploadAvatar.isPending
                ? 'Uploading…'
                : profile?.avatarUrl
                  ? 'Change photo'
                  : 'Add a photo'}
            </Text>
          </Stack>

          <Controller
            control={control}
            name="displayName"
            render={({ field, fieldState }) => (
              <Field
                label="Display name"
                autoCapitalize="words"
                leftIcon={<Ionicons name="person-outline" size={17} color={colors.textMuted} />}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="username"
            render={({ field, fieldState }) => (
              <Field
                label="Username"
                hint="Others can find you by this handle."
                autoCapitalize="none"
                leftIcon={<Ionicons name="at" size={17} color={colors.textMuted} />}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="bio"
            render={({ field, fieldState }) => (
              <Field
                label="Bio"
                optional
                hint="A line or two about what you make, do, or collect."
                multiline
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="locationCity"
            render={({ field, fieldState }) => (
              <Field
                label="City"
                optional
                hint="Used to show your items to people nearby. City only — never an address."
                autoCapitalize="words"
                leftIcon={<Ionicons name="location-outline" size={17} color={colors.textMuted} />}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />

          {formError ? (
            <Notice
              kind="danger"
              icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
            >
              {formError}
            </Notice>
          ) : null}

          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Text variant="bodyStrong">Verification</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: 14,
                backgroundColor: verified ? colors.matchSoft : colors.surfaceMuted,
              }}
            >
              <Ionicons
                name={verified ? 'shield-checkmark' : 'shield-outline'}
                size={22}
                color={verified ? colors.match : colors.textMuted}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" tone={verified ? 'match' : 'primary'}>
                  {verified ? 'Identity Verified' : 'Not verified yet'}
                </Text>
                <Text variant="caption" tone="muted">
                  {verified
                    ? 'Your identity has been verified'
                    : 'Verify your identity to build trust with other traders'}
                </Text>
              </View>
            </View>
          </View>
        </Stack>
      </ScrollView>
    </Screen>
  );
}
