import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '../../src/components/BrandLogo';
import { LocationBar } from '../../src/components/LocationBar';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useMobileNotifications } from '../../src/providers/MobileNotificationsProvider';
import { accountApi } from '../../src/services/api/account.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { AccountNotificationsFeed, Profile } from '../../src/types/domain';

interface MenuRow {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  copy: string;
  to: Href;
  badge?: number;
}

/**
 * Estado de los avisos push contado como se lo contamos al cliente. El provider
 * distingue casos técnicos (Expo Go, Firebase sin vincular) que a quien pide un
 * bowl no le dicen nada: aquí se traducen a qué puede hacer y qué no.
 */
const pushCopy = (
  status: ReturnType<typeof useMobileNotifications>['status'],
): { title: string; text: string; action: string } => {
  switch (status) {
    case 'enabled':
      return {
        title: 'Avisos de tu pedido activados',
        text: 'Te avisamos cuando confirmemos el pedido, cuando entre a cocina y cuando salga hacia ti.',
        action: 'Desactivar',
      };
    case 'busy':
      return {
        title: 'Un momento…',
        text: 'Estamos guardando tu preferencia de avisos.',
        action: '…',
      };
    case 'configuration-required':
      return {
        title: 'Avisos en camino',
        text: 'Estamos terminando de habilitarlos en esta versión. Mientras tanto sigue tu pedido desde la pestaña Pedidos.',
        action: 'Pronto',
      };
    case 'unsupported':
      return {
        title: 'Disponible en la app instalada',
        text: 'Instala Verde Bowl en tu teléfono para recibir los avisos aunque tengas la app cerrada.',
        action: 'No disponible',
      };
    default:
      return {
        title: 'Entérate sin estar pendiente',
        text: 'Actívalos y te avisamos en cada paso del pedido sin que tengas que mantener la app abierta.',
        action: 'Activar',
      };
  }
};

/** Versión real de la instalación. En Expo Go no hay build nativa: vale la del proyecto. */
const appVersion = (): string => {
  const version =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
  const build = Application.nativeBuildVersion;
  return build ? `${version} (${build})` : version;
};

export default function AccountScreen() {
  const { status, user, signOut, isBusy } = useSession();
  const notifications = useMobileNotifications();

  const authenticated = status === 'authenticated' && user !== null;

  // La misma clave que usa la pantalla de perfil: al guardar allí, aquí cambia
  // el saludo sin recargar nada.
  const profile = useResource<Profile>({
    key: authenticated ? 'account:profile' : null,
    fetcher: () => accountApi.profile(),
  });

  const feed = useResource<AccountNotificationsFeed>({
    key: authenticated ? 'account:notifications' : null,
    fetcher: () => accountApi.notifications(),
  });

  if (!authenticated || !user) {
    return (
      <ScreenScaffold showBack={false} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.guestContent}>
          <BrandLogo />

          <View style={styles.guestIllustration}>
            <MaterialCommunityIcons
              name="account-heart-outline"
              size={58}
              color={colors.brand700}
            />
          </View>

          <Text style={styles.guestTitle}>Haz que cada pedido sea más fácil</Text>
          <Text style={styles.guestCopy}>
            Guarda direcciones, preferencias y bowls favoritos. Tu sesión se protege en el
            almacenamiento seguro del teléfono.
          </Text>

          <PrimaryButton
            label="Iniciar sesión"
            onPress={() => router.push('/(auth)/login')}
            style={styles.fullButton}
          />
          <PrimaryButton
            label="Crear mi cuenta"
            variant="secondary"
            onPress={() => router.push('/(auth)/register')}
            style={styles.secondaryButton}
          />

          <View style={styles.guestTrust}>
            <MaterialCommunityIcons name="shield-lock-outline" size={20} color={colors.brand700} />
            <Text style={styles.guestTrustText}>
              No necesitas iniciar sesión para explorar el menú. Sí hará falta para guardar tus
              datos y confirmar pedidos.
            </Text>
          </View>
        </ScrollView>
      </ScreenScaffold>
    );
  }

  const firstName = profile.data?.firstName ?? user.firstName;
  const lastName = profile.data?.lastName ?? user.lastName;
  const email = profile.data?.email ?? user.email;
  const phone = profile.data?.phone ?? user.phone;

  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || 'VB';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Cliente Verde Bowl';
  const isStaff = user.isSuperAdmin || user.roles.some((role) => role !== 'customer');

  const unread = feed.data?.unreadCount ?? 0;
  const push = pushCopy(notifications.status);
  const pushBlocked =
    notifications.status === 'unsupported' || notifications.status === 'configuration-required';

  const rows: MenuRow[] = [
    {
      icon: 'bell-outline',
      title: 'Avisos',
      copy: unread > 0 ? `${unread} sin leer` : 'Pedidos, saldo y novedades',
      to: '/notifications' as Href,
      badge: unread,
    },
    {
      icon: 'wallet-outline',
      title: 'Mi saldo',
      copy: 'Vigencias, bonos y movimientos',
      to: '/wallet' as Href,
    },
    {
      icon: 'crown-outline',
      title: 'Planes Verde Bowl',
      copy: 'Recarga y recibe beneficios',
      to: '/plans' as Href,
    },
    {
      icon: 'account-edit-outline',
      title: 'Datos personales',
      copy: 'Nombre, apellido, teléfono y contraseña',
      to: '/profile' as Href,
    },
    {
      icon: 'map-marker-outline',
      title: 'Direcciones',
      copy: 'Tus puntos de entrega',
      to: '/addresses' as Href,
    },
    {
      icon: 'heart-outline',
      title: 'Mis favoritos',
      copy: 'Platos guardados en tu cuenta',
      to: '/favorites' as Href,
    },
    {
      icon: 'bookmark-multiple-outline',
      title: 'Bowls guardados',
      copy: 'Tus recetas listas para repetir',
      to: '/saved-bowls' as Href,
    },
    {
      icon: 'star-check-outline',
      title: 'Calificar compras',
      copy: 'Opiniones de pedidos entregados',
      to: '/reviews' as Href,
    },
    {
      icon: 'shield-account-outline',
      title: 'Preferencias y privacidad',
      copy: 'Alérgenos, metas, correos y medición',
      to: '/preferences' as Href,
    },
    {
      icon: 'whatsapp',
      title: 'Ayuda y reclamaciones',
      copy: 'WhatsApp, derechos y Libro virtual',
      to: '/support' as Href,
    },
  ];

  const confirmLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      'Se eliminarán las credenciales guardadas en este teléfono.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            // Perfil, avisos y saldo son de este cliente: no deben sobrevivir en
            // la caché para el siguiente que inicie sesión en el mismo teléfono.
            invalidateResource();
            void signOut();
          },
        },
      ],
    );
  };

  const bell = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Ver avisos, ${unread} sin leer` : 'Ver avisos'}
      hitSlop={layout.iconHitSlop}
      onPress={() => router.push('/notifications' as Href)}
      style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="bell-outline" size={23} color={colors.brand700} />
      {unread > 0 && (
        <View style={styles.bellBadge}>
          <Text style={styles.bellBadgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <ScreenScaffold
      title="Mi cuenta"
      subtitle={`Hola, ${firstName || 'qué gusto verte'}`}
      showBack={false}
      headerRight={bell}
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.profileCard, shadow.md]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={styles.profileCopy}>
            <Text numberOfLines={1} style={styles.profileName}>
              {fullName}
            </Text>
            <Text numberOfLines={1} style={styles.profileEmail}>
              {email}
            </Text>
            {phone ? <Text style={styles.profilePhone}>{phone}</Text> : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Editar mis datos personales"
            onPress={() => router.push('/profile' as Href)}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.brand700} />
          </Pressable>
        </View>

        {isStaff && (
          <View style={styles.staffNotice}>
            <MaterialCommunityIcons
              name="badge-account-outline"
              size={22}
              color={colors.accent500}
            />
            <View style={styles.staffCopy}>
              <Text style={styles.staffTitle}>También eres parte del equipo</Text>
              <Text style={styles.staffText}>
                Esta es la experiencia del cliente. Cocina, caja y administración siguen en el
                panel web protegido por permisos.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.pushCard}>
          <View
            style={[styles.pushIcon, notifications.status === 'enabled' && styles.pushIconEnabled]}
          >
            <MaterialCommunityIcons
              name={notifications.status === 'enabled' ? 'bell-check-outline' : 'bell-ring-outline'}
              size={23}
              color={notifications.status === 'enabled' ? colors.surface : colors.brand700}
            />
          </View>

          <View style={styles.pushCopy}>
            <Text style={styles.pushTitle}>{push.title}</Text>
            <Text style={styles.pushText}>{push.text}</Text>
            {notifications.error && notifications.status === 'disabled' ? (
              <Text style={styles.pushError}>{notifications.error}</Text>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={push.action}
            disabled={notifications.status === 'busy' || pushBlocked}
            onPress={() => {
              void Haptics.selectionAsync();
              void (notifications.status === 'enabled'
                ? notifications.disable()
                : notifications.enable());
            }}
            style={[
              styles.pushAction,
              notifications.status === 'enabled' && styles.pushActionOff,
              pushBlocked && styles.pushActionDisabled,
            ]}
          >
            <Text
              style={[
                styles.pushActionText,
                notifications.status === 'enabled' && styles.pushActionTextOff,
              ]}
            >
              {push.action}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>CONTEXTO DE COMPRA</Text>
        <LocationBar />

        <Text style={styles.sectionLabel}>TU INFORMACIÓN</Text>

        <View style={styles.menuCard}>
          {rows.map((row, index) => (
            <Pressable
              key={row.title}
              accessibilityRole="button"
              accessibilityLabel={`${row.title}. ${row.copy}`}
              onPress={() => router.push(row.to)}
              style={({ pressed }) => [
                styles.menuRow,
                index < rows.length - 1 && styles.menuDivider,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name={row.icon} size={21} color={colors.brand700} />
              </View>

              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowDescription}>{row.copy}</Text>
              </View>

              {row.badge ? (
                <View style={styles.rowBadge}>
                  <Text style={styles.rowBadgeText}>{row.badge > 9 ? '9+' : row.badge}</Text>
                </View>
              ) : null}

              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkMuted} />
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          onPress={confirmLogout}
          disabled={isBusy}
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="logout" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>{isBusy ? 'Cerrando…' : 'Cerrar sesión'}</Text>
        </Pressable>

        <Text style={styles.version}>Verde Bowl · versión {appVersion()}</Text>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  guestContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  guestIllustration: {
    width: 110,
    height: 110,
    borderRadius: radius.lg + 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
    marginTop: spacing.xxl,
  },
  guestTitle: {
    ...type.display,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  guestCopy: {
    ...type.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm + spacing.xs,
  },
  fullButton: {
    width: '100%',
    marginTop: spacing.xl,
  },
  secondaryButton: {
    width: '100%',
    marginTop: spacing.sm + spacing.xs,
  },
  guestTrust: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  guestTrustText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
  },
  bell: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: colors.accent500,
  },
  bellBadgeText: {
    ...type.caption,
    color: colors.surface,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.lg,
    padding: spacing.md + spacing.xs,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: radius.md + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  avatarText: {
    ...type.title,
    color: colors.onDark,
  },
  profileCopy: {
    flex: 1,
  },
  profileName: {
    ...type.heading,
    color: colors.onDark,
  },
  profileEmail: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: 3,
  },
  profilePhone: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: 2,
  },
  editButton: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  staffNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    backgroundColor: '#fff8e8',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm + spacing.xs,
  },
  staffCopy: {
    flex: 1,
  },
  staffTitle: {
    ...type.body,
    fontWeight: '800',
    color: '#744d10',
  },
  staffText: {
    ...type.bodySm,
    color: '#826733',
    marginTop: 3,
  },
  pushCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginTop: spacing.sm + spacing.xs,
  },
  pushIcon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  pushIconEnabled: {
    backgroundColor: colors.brand600,
  },
  pushCopy: {
    flex: 1,
  },
  pushTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  pushText: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  pushError: {
    ...type.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  pushAction: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.brand700,
    paddingHorizontal: spacing.md,
  },
  pushActionOff: {
    backgroundColor: '#fff0f0',
  },
  pushActionDisabled: {
    backgroundColor: '#87928c',
  },
  pushActionText: {
    ...type.label,
    color: colors.surface,
  },
  pushActionTextOff: {
    color: colors.danger,
  },
  sectionLabel: {
    ...type.label,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  menuCard: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 68,
    paddingHorizontal: spacing.md,
  },
  menuDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowIcon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  rowDescription: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  rowBadge: {
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent500,
  },
  rowBadgeText: {
    ...type.caption,
    color: colors.surface,
    textAlign: 'center',
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f0c7c7',
    backgroundColor: '#fffafa',
    marginTop: spacing.lg,
  },
  logoutText: {
    ...type.body,
    fontWeight: '800',
    color: colors.danger,
  },
  version: {
    ...type.caption,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
});
