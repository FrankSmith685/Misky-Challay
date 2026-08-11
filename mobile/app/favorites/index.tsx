import { useCallback, useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { EmptyState } from '../../src/components/EmptyState';
import { ProductCard } from '../../src/components/ProductCard';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useFavorites } from '../../src/providers/FavoritesProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { colors, radius, spacing, type } from '../../src/theme/tokens';
import type { Product } from '../../src/types/domain';

export default function FavoritesScreen() {
  const { status } = useSession();
  const favorites = useFavorites();
  const toast = useToast();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace({ pathname: '/(auth)/login', params: { returnTo: '/favorites' } });
    }
  }, [status]);

  const openProduct = useCallback((product: Product) => {
    router.push({ pathname: '/product/[slug]', params: { slug: product.slug } });
  }, []);

  const removeFavorite = useCallback(
    async (product: Product) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        await favorites.toggle(product);
        toast.show({
          message: `${product.name} salió de tus favoritos`,
          action: {
            label: 'Deshacer',
            onPress: () => {
              void favorites.toggle(product).catch(() => {
                toast.show({ message: 'No pudimos devolverlo a la lista.', tone: 'error' });
              });
            },
          },
        });
      } catch (caught) {
        toast.show({
          message: caught instanceof Error ? caught.message : 'No pudimos actualizar tus favoritos.',
          tone: 'error',
        });
      }
    },
    [favorites, toast],
  );

  const toggleFavorite = useCallback(
    (product: Product) => {
      void removeFavorite(product);
    },
    [removeFavorite],
  );

  const retry = useCallback(() => {
    void favorites.reload();
  }, [favorites]);

  const firstLoad = status === 'bootstrapping' || (favorites.loading && favorites.products.length === 0);

  return (
    <ScreenScaffold
      title="Mis favoritos"
      subtitle="Se guardan en tu cuenta y viajan contigo"
      headerRight={
        favorites.products.length > 0 ? (
          <View style={styles.counter}>
            <MaterialCommunityIcons name="heart" size={15} color={colors.danger} />

            <Text style={styles.counterText}>{favorites.products.length}</Text>
          </View>
        ) : null
      }
    >
      {firstLoad ? (
        <View style={styles.skeleton}>
          <Skeleton height={118} rounded="md" count={4} gap={spacing.sm + spacing.xs} />
        </View>
      ) : (
        <FlatList
          data={favorites.products}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={favorites.refreshing}
              onRefresh={retry}
              tintColor={colors.brand600}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <ProductCard
                compact
                isFavorite
                product={item}
                onPress={openProduct}
                onToggleFavorite={toggleFavorite}
              />
            </View>
          )}
          ListEmptyComponent={
            favorites.error ? (
              <EmptyState
                icon="cloud-alert-outline"
                title="No pudimos cargar tus favoritos"
                message={`${favorites.error} Tu lista sigue guardada en la cuenta.`}
                actionLabel="Reintentar"
                onAction={retry}
              />
            ) : (
              <EmptyState
                icon="heart-plus-outline"
                title="Aún no guardaste platos"
                message="Toca el corazón del menú para armar una lista que viaje contigo."
                actionLabel="Explorar el menú"
                onAction={() => router.replace('/(tabs)/menu')}
              />
            )
          }
        />
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  counterText: {
    ...type.label,
    color: colors.ink,
  },
  skeleton: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  content: {
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  card: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + spacing.xs,
  },
});
