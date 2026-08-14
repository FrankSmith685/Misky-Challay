import { useCallback, useEffect, useState } from 'react';
import {
  Keyboard,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppImage } from '../../src/components/AppImage';
import { BottomSheet } from '../../src/components/BottomSheet';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { mobileAnalytics } from '../../src/services/analytics';
import { engagementApi } from '../../src/services/api/engagement.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { PendingReview } from '../../src/types/domain';

const MAX_COMMENT = 800;

/** Lo que significa cada estrella, para que el cliente no tenga que adivinar. */
const RATING_LABEL: Record<number, string> = {
  1: 'Muy malo',
  2: 'Malo',
  3: 'Regular',
  4: 'Bueno',
  5: 'Excelente',
};

const formatDate = (value: string | null): string =>
  value ? `Entregado el ${new Date(value).toLocaleDateString('es-PE')}` : 'Pedido entregado';

export default function ReviewsScreen() {
  const { status } = useSession();
  const toast = useToast();

  const pending = useResource<PendingReview[]>({
    key: status === 'authenticated' ? 'engagement:reviews:pending' : null,
    fetcher: () => engagementApi.pendingReviews(),
  });

  const [selected, setSelected] = useState<PendingReview | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace({ pathname: '/(auth)/login', params: { returnTo: '/reviews' } });
    }
  }, [status]);

  const open = useCallback((item: PendingReview) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(item);
    setRating(5);
    setComment('');
  }, []);

  const close = useCallback(() => {
    if (saving) return;
    Keyboard.dismiss();
    setSelected(null);
  }, [saving]);

  const chooseRating = (value: number) => {
    void Haptics.selectionAsync();
    setRating(value);
  };

  const submit = async () => {
    if (!selected || saving) return;

    setSaving(true);
    try {
      await engagementApi.createReview(selected.orderItemId, rating, comment);
      void mobileAnalytics.track('REVIEW_SUBMITTED', { productId: selected.productId, rating });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // La fila desaparece al momento; la lista real se vuelve a pedir detrás.
      pending.mutate(
        (pending.data ?? []).filter((item) => item.orderItemId !== selected.orderItemId),
      );
      Keyboard.dismiss();
      setSelected(null);
      toast.show({ message: 'Publicamos tu opinión como compra verificada.', tone: 'success' });
      void pending.refetch();
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos publicar tu opinión.',
        tone: 'error',
        placement: 'top',
      });
    } finally {
      setSaving(false);
    }
  };

  const loading = status === 'bootstrapping' || pending.loading;

  return (
    <ScreenScaffold title="Comparte tu experiencia" subtitle="Solo compras verificadas">
      {loading ? (
        <View style={styles.skeleton}>
          <Skeleton height={92} rounded="md" count={4} gap={spacing.sm + spacing.xs} />
        </View>
      ) : (
        <FlatList
          data={pending.data ?? []}
          keyExtractor={(item) => String(item.orderItemId)}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={pending.refreshing}
              onRefresh={() => void pending.refresh()}
              tintColor={colors.brand600}
            />
          }
          ListHeaderComponent={
            <View style={styles.guide}>
              <MaterialCommunityIcons
                name="shield-star-outline"
                size={26}
                color={colors.brand700}
              />

              <View style={styles.guideText}>
                <Text style={styles.guideTitle}>Solo opiniones reales</Text>

                <Text style={styles.guideCopy}>
                  Únicamente puedes calificar los platos que se entregaron en tu cuenta.
                </Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.item}>
              <AppImage
                uri={item.imageUrl}
                style={styles.image}
                accessibilityLabel={item.productName}
                fallbackIconSize={26}
              />

              <View style={styles.itemText}>
                <Text numberOfLines={2} style={styles.itemName}>
                  {item.productName}
                </Text>

                <Text style={styles.itemMeta}>Pedido {item.orderNumber}</Text>

                <Text style={styles.itemDate}>{formatDate(item.deliveredAt)}</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Calificar ${item.productName}`}
                onPress={() => open(item)}
                style={({ pressed }) => [styles.rate, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="star-outline" size={19} color={colors.accent500} />

                <Text style={styles.rateText}>Calificar</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            pending.error ? (
              <EmptyState
                icon="cloud-alert-outline"
                title="No pudimos cargar tus pendientes"
                message={pending.error.message}
                actionLabel="Reintentar"
                onAction={() => void pending.refetch()}
              />
            ) : (
              <EmptyState
                icon="check-decagram-outline"
                title="Estás al día"
                message="Cuando recibas un pedido nuevo podrás compartir aquí tu opinión."
                actionLabel="Ver el menú"
                onAction={() => router.push('/(tabs)/menu')}
              />
            )
          }
        />
      )}

      <BottomSheet
        visible={selected !== null}
        onClose={close}
        title={selected?.productName ?? 'Tu opinión'}
        subtitle="Compra verificada"
        dismissible={!saving}
        footer={
          <View style={styles.sheetFooter}>
            <PrimaryButton
              label="Publicar opinión"
              loading={saving}
              onPress={() => void submit()}
            />
            <PrimaryButton label="Ahora no" variant="ghost" disabled={saving} onPress={close} />
          </View>
        }
      >
        <View>
          <Text style={styles.question}>¿Cuántas estrellas le das?</Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                accessibilityRole="button"
                accessibilityLabel={`${star} ${star === 1 ? 'estrella' : 'estrellas'}`}
                accessibilityState={{ selected: star === rating }}
                onPress={() => chooseRating(star)}
                style={({ pressed }) => [styles.star, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color={star <= rating ? colors.accent500 : colors.line}
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.ratingLabel}>{RATING_LABEL[rating]}</Text>

          <TextInput
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={MAX_COMMENT}
            placeholder="Cuéntanos qué te gustó (opcional)"
            placeholderTextColor="#87938d"
            style={styles.comment}
          />

          <View style={styles.commentBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar el teclado"
              hitSlop={layout.iconHitSlop}
              onPress={() => Keyboard.dismiss()}
              style={({ pressed }) => [styles.done, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="keyboard-close" size={17} color={colors.brand700} />
              <Text style={styles.doneText}>Listo</Text>
            </Pressable>

            <Text style={styles.counter}>
              {comment.length}/{MAX_COMMENT}
            </Text>
          </View>

        </View>
      </BottomSheet>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  sheetFooter: { gap: spacing.xs },
  skeleton: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  guide: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  guideText: {
    flex: 1,
  },
  guideTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.brand900,
  },
  guideCopy: {
    ...type.bodySm,
    color: colors.brand700,
    marginTop: 3,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.sm + spacing.xs,
    marginBottom: spacing.sm + spacing.xs,
    ...shadow.sm,
  },
  image: {
    width: 62,
    height: 62,
    borderRadius: radius.sm + 4,
  },
  itemText: {
    flex: 1,
  },
  itemName: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  itemMeta: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 3,
  },
  itemDate: {
    ...type.caption,
    color: colors.brand600,
    marginTop: 2,
  },
  rate: {
    minWidth: 76,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
    paddingHorizontal: spacing.sm,
  },
  rateText: {
    ...type.label,
    color: colors.brand700,
  },
  question: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  star: {
    width: layout.minTouch + 8,
    height: layout.minTouch + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingLabel: {
    ...type.heading,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  comment: {
    ...type.body,
    minHeight: 108,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    textAlignVertical: 'top',
    padding: spacing.sm + spacing.xs,
    marginTop: spacing.md,
  },
  commentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 34,
    marginTop: spacing.xs,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  doneText: {
    ...type.label,
    color: colors.brand700,
  },
  counter: {
    ...type.caption,
    color: colors.inkMuted,
  },
  submit: {
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: 0.75,
  },
});
