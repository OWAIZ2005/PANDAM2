/**
 * Create / edit form for a listing ("I HAVE") or a need ("I NEED"). One
 * component, driven by `kind` + `mode`. Validation bounds come from the shared
 * `@pandam/validation` primitives so the client and server never disagree.
 *
 * Photos are handled by `<PhotoPicker>`: on create they are collected locally
 * and returned in `onSubmit` for the screen to upload once the item has an
 * id; on edit they upload and delete immediately against the existing item.
 * Both a listing's own photos and a need's reference photos work the same way.
 */
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, Switch, View } from 'react-native';

import { type MarketItem } from '@pandam/types';
import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  Row,
  Stack,
  Text,
  colors,
  layout,
  radii,
  spacing,
} from '@pandam/ui';
import { boundedString, itemTypeSchema, z } from '@pandam/validation';

import { AddCategorySheet } from '@/components/AddCategorySheet';
import { GuideRail } from '@/components/brand/GuideRail';
import { PhotoPicker } from '@/components/PhotoPicker';
import { ApiError } from '@/lib/api/client';
import { TYPE_LABEL } from '@/lib/format';
import { useCategories } from '@/lib/hooks/useCategories';
import { categoryIcon, typeIcon } from '@/lib/icons';

const TRANSACTION_TYPES = ['barter', 'sale', 'both'] as const;
type TransactionTypeOption = (typeof TRANSACTION_TYPES)[number];

const formSchema = z
  .object({
    categoryId: z.string().min(1, 'Pick a category'),
    type: itemTypeSchema,
    title: boundedString(3, 120),
    description: boundedString(10, 4000),
    publish: z.boolean(),
    transactionType: z.enum(TRANSACTION_TYPES),
    /** Rupees, as typed — converted to paise on submit. Blank when `barter`. */
    priceRupees: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.transactionType === 'barter') return;
    const n = Number(v.priceRupees);
    if (!v.priceRupees.trim() || !Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: 'custom', path: ['priceRupees'], message: 'Enter a price above ₹0' });
    }
  });
type FormValues = z.infer<typeof formSchema>;

export interface ItemFormSubmit {
  categoryId: string;
  type: FormValues['type'];
  title: string;
  description: string;
  status: 'draft' | 'published';
  /** Listings only — a need is never itself for sale. */
  transactionType?: TransactionTypeOption;
  /** Minor currency unit (paise for INR). Present iff `transactionType !== 'barter'`. */
  priceAmount?: number;
  priceCurrency?: string;
  /**
   * Local photo URIs picked during CREATE, which the caller uploads once the
   * item exists. Empty in edit mode, where the picker uploads directly.
   * Available for both a listing's own photos and a need's reference photos.
   */
  photos?: string[];
}

const TRANSACTION_TYPE_LABEL: Record<TransactionTypeOption, string> = {
  barter: 'Barter only',
  sale: 'Sale only',
  both: 'Either',
};
const TRANSACTION_TYPE_HINT: Record<TransactionTypeOption, string> = {
  barter: 'Trade it for something else. No money changes hands.',
  sale: 'Buyers pay a fixed price. Not eligible for barter matches.',
  both: 'People can trade for it or buy it outright — whichever suits them.',
};

export interface ItemFormProps {
  kind: 'listing' | 'need';
  mode: 'create' | 'edit';
  initial?: MarketItem;
  submitting?: boolean;
  error?: unknown;
  onSubmit: (values: ItemFormSubmit) => void;
}

/**
 * A step in the form.
 *
 * The numeral is set in the same monospaced-figure style used for money and
 * counts, in the accent colour, with the step title as a real heading beside
 * it. The previous grey disc gave the number more visual weight than the
 * label it introduced, which is backwards — the number is a wayfinding aid,
 * the label is the question being asked.
 */
function StepLabel({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <Row gap="md" align="flex-start" style={{ marginBottom: spacing.md }}>
      {/* A numbered stop on the guided path: a warm disc that reads as a
          progress marker, not a form-field decoration. */}
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radii.pill,
          backgroundColor: colors.accentSoft,
          borderWidth: 1,
          borderColor: colors.accentBorder,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="label" numeric tone="accent" style={{ fontWeight: '700' }}>
          {n}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="overline" tone="muted">
          Step {n}
        </Text>
        <Text variant="h3">{label}</Text>
        {hint ? (
          <Text variant="bodySm" tone="secondary">
            {hint}
          </Text>
        ) : null}
      </View>
    </Row>
  );
}

export function ItemForm({ kind, mode, initial, submitting, error, onSubmit }: ItemFormProps) {
  const isHave = kind === 'listing';
  const categories = useCategories();
  const [photos, setPhotos] = useState<string[]>([]);

  const [addingCategory, setAddingCategory] = useState(false);
  const { control, handleSubmit, formState, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      categoryId: initial?.category.id ?? '',
      type: initial?.type ?? 'service',
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      publish: initial ? initial.status === 'published' : true,
      transactionType: initial?.pricing?.transactionType ?? 'barter',
      priceRupees:
        initial?.pricing?.priceAmount != null ? String(initial.pricing.priceAmount / 100) : '',
    },
  });

  const title = watch('title');
  const description = watch('description');
  const transactionType = watch('transactionType');
  const categoryId = watch('categoryId');
  // Guided path progress (visual only): how far down the form the user is.
  const detailsDone = (title?.trim().length ?? 0) >= 3 && (description?.trim().length ?? 0) >= 10;
  const guideDone = !categoryId ? 0 : photos.length === 0 ? 1 : !detailsDone ? 2 : 3;

  const submit = handleSubmit((v) => {
    const isBarter = v.transactionType === 'barter';
    onSubmit({
      categoryId: v.categoryId,
      type: v.type,
      title: v.title.trim(),
      description: v.description.trim(),
      status: v.publish ? 'published' : 'draft',
      photos,
      ...(isHave
        ? {
            transactionType: v.transactionType,
            ...(isBarter
              ? {}
              : { priceAmount: Math.round(Number(v.priceRupees) * 100), priceCurrency: 'INR' }),
          }
        : {}),
    });
  });

  const formError =
    error instanceof ApiError ? error.message : error ? 'Could not save. Try again.' : null;

  const tone = isHave ? ('accent' as const) : ('need' as const);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: layout.gutter,
        paddingTop: spacing.md,
        paddingBottom: spacing['6xl'],
      }}
    >
      <Stack gap="2xl">
        {mode === 'create' ? (
          <GuideRail
            steps={
              isHave
                ? ['Item', 'Photos', 'Details', 'Want', 'Publish']
                : ['Need', 'Kind', 'Details', 'Photos', 'Publish']
            }
            done={guideDone}
          />
        ) : null}
        {/* ------------------------------------------------------- category -- */}
        <View>
          <StepLabel n={1} label="Pick a category" hint="This is what matching keys off." />
          <Controller
            control={control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <View style={{ gap: spacing.sm }}>
                <Row gap="sm" style={{ flexWrap: 'wrap' }}>
                  {(categories.data ?? []).map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      tone={tone}
                      selected={field.value === c.id}
                      icon={
                        <Ionicons
                          name={categoryIcon(c.slug)}
                          size={13}
                          color={field.value === c.id ? colors.textInverse : colors.textMuted}
                        />
                      }
                      onPress={() => field.onChange(c.id)}
                    />
                  ))}
                  {/* Nothing fits? Members can add a category right here. */}
                  <Chip
                    label="New category"
                    tone={tone}
                    selected={false}
                    icon={<Ionicons name="add" size={14} color={colors.accent} />}
                    onPress={() => setAddingCategory(true)}
                  />
                </Row>
                {fieldState.error ? (
                  <Text variant="caption" tone="danger">
                    {fieldState.error.message}
                  </Text>
                ) : null}
              </View>
            )}
          />
        </View>

        <AddCategorySheet
          visible={addingCategory}
          onClose={() => setAddingCategory(false)}
          existing={categories.data ?? []}
          onCreated={(c) => setValue('categoryId', c.id, { shouldValidate: true })}
          onUseExisting={(id) => setValue('categoryId', id, { shouldValidate: true })}
        />

        {/* ----------------------------------------------------------- type -- */}
        <View>
          <StepLabel n={2} label="What kind of thing is it?" />
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Row gap="sm">
                {(['product', 'service', 'skill'] as const).map((t) => (
                  <Chip
                    key={t}
                    label={TYPE_LABEL[t]}
                    tone={tone}
                    selected={field.value === t}
                    icon={
                      <Ionicons
                        name={typeIcon(t)}
                        size={13}
                        color={field.value === t ? colors.textInverse : colors.textMuted}
                      />
                    }
                    onPress={() => field.onChange(t)}
                  />
                ))}
              </Row>
            )}
          />
        </View>

        {/* -------------------------------------------------------- pricing -- */}
        {isHave ? (
          <View>
            <StepLabel n={3} label="How can people get this?" />
            <Stack gap="md">
              <Row gap="sm">
                {TRANSACTION_TYPES.map((t) => (
                  <Controller
                    key={t}
                    control={control}
                    name="transactionType"
                    render={({ field }) => (
                      <Chip
                        label={TRANSACTION_TYPE_LABEL[t]}
                        tone={tone}
                        selected={field.value === t}
                        onPress={() => field.onChange(t)}
                      />
                    )}
                  />
                ))}
              </Row>
              <Notice
                kind={transactionType === 'barter' ? 'neutral' : 'info'}
                icon={
                  <Ionicons
                    name={transactionType === 'barter' ? 'swap-horizontal' : 'card-outline'}
                    size={15}
                    color={transactionType === 'barter' ? colors.textMuted : colors.info}
                  />
                }
              >
                {TRANSACTION_TYPE_HINT[transactionType]}
              </Notice>
              {transactionType !== 'barter' ? (
                <Controller
                  control={control}
                  name="priceRupees"
                  render={({ field, fieldState }) => (
                    <Field
                      label="Price"
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      leftIcon={
                        <Text variant="bodyStrong" tone="secondary">
                          ₹
                        </Text>
                      }
                      value={field.value}
                      onChangeText={(t) => field.onChange(t.replace(/[^0-9.]/g, ''))}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              ) : null}
            </Stack>
          </View>
        ) : null}

        {/* --------------------------------------------------------- details -- */}
        <View>
          <StepLabel
            n={isHave ? 4 : 3}
            label="Describe it"
            hint="Clear beats clever — people search this."
          />
          <Stack gap="lg">
            <Controller
              control={control}
              name="title"
              render={({ field, fieldState }) => (
                <Field
                  label={isHave ? 'What do you have?' : 'What do you need?'}
                  placeholder={isHave ? 'e.g. Hand-built websites' : 'e.g. Product photography'}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  counter={{ value: title?.length ?? 0, max: 120 }}
                  maxLength={120}
                />
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState }) => (
                <Field
                  label="Details"
                  hint="What’s included, condition, timescale — anything a trader should know."
                  placeholder="Add a few details…"
                  multiline
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  counter={{ value: description?.length ?? 0, max: 4000 }}
                />
              )}
            />
          </Stack>
        </View>

        {/* ---------------------------------------------------------- photos -- */}
        <View>
          <StepLabel
            n={isHave ? 5 : 4}
            label="Photos"
            hint={
              mode === 'edit'
                ? 'Saved as you add them.'
                : isHave
                  ? 'Optional, but they get traded faster.'
                  : 'Optional — a reference photo helps people recognise what you want.'
            }
          />
          <PhotoPicker
            kind={kind}
            existing={initial?.images ?? []}
            local={photos}
            onChangeLocal={setPhotos}
            itemId={mode === 'edit' ? initial?.id : undefined}
          />
        </View>

        {/* --------------------------------------------------------- publish -- */}
        <Card padded>
          <Controller
            control={control}
            name="publish"
            render={({ field }) => (
              <Row justify="space-between" gap="md">
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">Make it visible now</Text>
                  <Text variant="caption" tone="muted">
                    {field.value
                      ? 'It will appear in Discover and count towards barter matches.'
                      : 'Saved as a draft — only you can see it until you publish.'}
                  </Text>
                </View>
                <Switch
                  value={field.value}
                  onValueChange={field.onChange}
                  trackColor={{ true: isHave ? colors.accent : colors.need }}
                  accessibilityLabel="Publish now"
                />
              </Row>
            )}
          />
        </Card>

        {formError ? (
          <Notice
            kind="danger"
            icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
          >
            {formError}
          </Notice>
        ) : null}

        <Button
          label={
            submitting
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save changes'
                : isHave
                  ? 'List this item'
                  : 'Post this request'
          }
          variant={isHave ? 'primary' : 'need'}
          size="lg"
          fullWidth
          loading={submitting}
          disabled={formState.isSubmitting}
          onPress={submit}
        />
      </Stack>
    </ScrollView>
  );
}
