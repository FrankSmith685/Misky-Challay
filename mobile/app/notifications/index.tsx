import { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { EmptyState } from '../../src/components/EmptyState';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { mobileNotificationHref } from '../../src/lib/notificationRoutes';
import { accountApi } from '../../src/services/api/account.service';
import { colors, layout, radius, spacing, type } from '../../src/theme/tokens';
import type { AccountNotification, AccountNotificationsFeed } from '../../src/types/domain';

const RESOURCE_KEY = 'account:notifications';
/** La bandeja abierta se refresca sola: un pedido cambia de estado mientras se mira. */
const POLL_MS = 60_000;

/** Icono y color por plantilla. El backend nombra las plantillas, no los avisos. */
const decorate = (
  notification: AccountNotification,
): { icon: keyof typeof MaterialCommunityIcons.glyphMap; tint: string } => {
  const template = notification.template.toLowerCase();

  if (notification.status === 'FAILED') return { icon: 'alert-circle-outline', tint: colors.danger };
  if (template.includes('cancel')) return { icon: 'close-circle-outline', tint: colors.danger };
  if (template.includes('deliver')) return { icon: 'moped-outline', tint: colors.success };
  if (template.includes('order')) return { icon: 'receipt-text-outline', tint: colors.brand700 };
  if (template.includes('wallet') || template.includes('plan')) {
    return { icon: 'wallet-outline', tint: colors.accent500 };
  }
  if (template.includes('stock') || template.includes('availab')) {
    return { icon: 'bowl-mix-outline', tint: colors.brand600 };
  }
  if (template.includes('complaint')) return { icon: 'book-open-outline', tint: colors.warning };

  return { icon: 'bell-outline', tint: colors.brand700 };
};

const toMobileHref = (notification: AccountNotification): Href | null => {
  const destination = notification.actionUrl ? mobileNotificationHref(notification.actionUrl) : null;
  if (destination) return destination;

  if (notification.order) {
    return {
      pathname: '/order/[orderNumber]',
      params: { orderNumber: notification.order.orderNumber },
    } as Href;
  }

  if (notification.template === 'PLAN_ACTIVATED') return '/wallet' as Href;
  if (notification.template.startsWith('COMPLAINT_')) return '/support' as Href;
  if (notification.template === 'PRODUCT_AVAILABLE') return '/(tabs)/menu' as Href;

  return null;
};

/** Fecha en lenguaje de cliente: lo reciente en minutos, lo viejo con día y mes. */
const formatWhen = (iso: string | null): string => {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Ahora mismo';
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  if (hours < 48) return 'Ayer';

  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
};

export default function NotificationsScreen() {
  const { status } = useSession();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const feed = useResource<AccountNotificationsFeed>({
    key: status === 'authenticated' ? `${RESOURCE_KEY}:${page}` : null,
    fetcher: () => accountApi.notifications(page),
    pollIntervalMs: POLL_MS,
  });

  useEffect(() => {
    if (status === 'anonymous') router.replace({ pathname: '/(auth)/login', params: { returnTo: '/notifications' } });
  }, [status]);
  const items = feed.data?.items ?? [];
  const markRead = async (item?: AccountNotification) => {
    try {
      await accountApi.markNotificationsRead(item ? { ids: [item.id] } : { all: true, throughId: feed.data?.newestId });
      invalidateResource(RESOURCE_KEY, { prefix: true });
    } catch { toast.show({ message: 'No pudimos guardar la lectura del aviso.', tone: 'error' }); }
  };
  const open = useCallback(
    (notification: AccountNotification) => {
      if (!notification.readAt) void markRead(notification);
      const href = toMobileHref(notification);
      if (!href) {
        toast.show({ message: 'Este aviso es solo informativo.', tone: 'info' });
        return;
      }
      void Haptics.selectionAsync();
      if (typeof href === 'string' && /^https?:\/\//.test(href)) void Linking.openURL(href);
      else router.push(href);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast, items],
  );

  const renderItem = useCallback(
    ({ item }: { item: AccountNotification }) => {
      const { icon, tint } = decorate(item);
      const isNew = !item.readAt;
      const navigable = toMobileHref(item) !== null;

      return (
        <Pressable
          accessibilityRole={navigable ? 'button' : 'text'}
          accessibilityLabel={`${item.subject}. ${formatWhen(item.sentAt ?? item.createdAt)}${
            isNew ? '. Nuevo' : ''
          }`}
          onPress={() => open(item)}
          style={({ pressed }) => [styles.row, isNew && styles.rowNew, pressed && styles.pressed]}
        >
          <View style={[styles.icon, { backgroundColor: `${tint}1a` }]}>
            <MaterialCommunityIcons name={icon} size={21} color={tint} />
          </View>

          <View style={styles.copy}>
            <Text style={styles.subject}>{item.subject}</Text>

            <View style={styles.metaRow}>
              <Text style={styles.when}>{formatWhen(item.sentAt ?? item.createdAt)}</Text>

              {item.order ? (
                <>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.order}>Pedido {item.order.orderNumber}</Text>
                </>
              ) : null}

              {isNew ? (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NUEVO</Text>
                </View>
              ) : null}
            </View>
          </View>

          {navigable ? (
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkMuted} />
          ) : null}
        </Pressable>
      );
    },
    [open],
  );

  const body = () => {
    if (feed.loading) {
      return (
        <View style={styles.loading}>
          <Skeleton height={82} rounded="md" count={5} gap={spacing.sm} />
        </View>
      );
    }

    if (feed.error && feed.data === null) {
      return (
        <EmptyState
          icon="cloud-alert-outline"
          title="No pudimos cargar tus avisos"
          message={feed.error.message}
          actionLabel="Reintentar"
          onAction={() => void feed.refetch()}
        />
      );
    }

    return (
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={feed.refreshing}
            onRefresh={() => void feed.refresh()}
            tintColor={colors.brand600}
            colors={[colors.brand600]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="bell-sleep-outline"
            title="Todavía no tienes avisos"
            message="Aquí verás cuando confirmemos, preparemos y entreguemos tus pedidos, y cuando se muevan tu saldo o tus planes."
            actionLabel="Ver el menú"
            onAction={() => router.push('/(tabs)/menu' as Href)}
          />
        }
        ListFooterComponent={<View style={{ padding: spacing.md, gap: spacing.md }}>
          <Pressable accessibilityRole="button" onPress={() => void markRead()} disabled={!feed.data?.unreadCount || !items.length}><Text>Marcar todo como leído ({feed.data?.unreadCount ?? 0})</Text></Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" disabled={page <= 1} onPress={() => setPage((value) => value - 1)}><Text>Anterior</Text></Pressable>
            <Text>{page} / {feed.data?.totalPages ?? 1}</Text>
            <Pressable accessibilityRole="button" disabled={page >= (feed.data?.totalPages ?? 1)} onPress={() => setPage((value) => value + 1)}><Text>Siguiente</Text></Pressable>
          </View>
        </View>}
      />
    );
  };

  return (
    <ScreenScaffold title="Avisos" subtitle="Pedidos, saldo y novedades de tu cuenta">
      {body()}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  listEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 76,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  rowNew: {
    borderColor: colors.brand600,
    backgroundColor: colors.brand50,
  },
  icon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  subject: {
    ...type.body,
    fontWeight: '700',
    color: colors.ink,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  when: {
    ...type.caption,
    color: colors.inkMuted,
  },
  dot: {
    ...type.caption,
    color: colors.inkMuted,
  },
  order: {
    ...type.caption,
    color: colors.brand700,
  },
  newBadge: {
    borderRadius: radius.pill,
    backgroundColor: colors.brand600,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  newBadgeText: {
    ...type.caption,
    color: colors.surface,
    letterSpacing: 0.6,
  },
  footNote: {
    ...type.caption,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
});
