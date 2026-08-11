import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from '../../src/components/BrandLogo';
import { LocationBar } from '../../src/components/LocationBar';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useSession } from '../../src/providers/SessionProvider';
import { useMobileNotifications } from '../../src/providers/MobileNotificationsProvider';
import { colors, radius, spacing } from '../../src/theme/tokens';

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { status, user, signOut, isBusy } = useSession();
  const notifications = useMobileNotifications();

  if (status !== 'authenticated' || !user) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={[styles.guestContent, { paddingTop: insets.top + 24 }]}>
        <BrandLogo />
        <View style={styles.guestIllustration}><MaterialCommunityIcons name="account-heart-outline" size={58} color={colors.brand700} /></View>
        <Text style={styles.guestTitle}>Haz que cada pedido sea más fácil</Text>
        <Text style={styles.guestCopy}>Guarda direcciones, preferencias y bowls favoritos. Tu sesión se protege en el almacenamiento seguro del teléfono.</Text>
        <PrimaryButton label="Iniciar sesión" onPress={() => router.push('/(auth)/login')} style={styles.fullButton} />
        <PrimaryButton label="Crear mi cuenta" variant="secondary" onPress={() => router.push('/(auth)/register')} style={styles.secondaryButton} />
        <View style={styles.guestTrust}><MaterialCommunityIcons name="shield-lock-outline" size={19} color={colors.brand700} /><Text style={styles.guestTrustText}>No necesitas iniciar sesión para explorar el menú. Sí será obligatorio para guardar datos y confirmar pedidos.</Text></View>
      </ScrollView>
    );
  }

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'VB';
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Cliente Verde Bowl';
  const isStaff = user.isSuperAdmin || user.roles.some((role) => role !== 'customer');
  const pushNeedsConfiguration = notifications.status === 'configuration-required';
  const pushUnavailable = notifications.status === 'unsupported' || pushNeedsConfiguration;
  const confirmLogout = () => Alert.alert('Cerrar sesión', 'Se eliminarán las credenciales guardadas en este teléfono.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: () => void signOut() },
  ]);

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <View style={styles.accountHeader}><View><Text style={styles.eyebrow}>MI CUENTA</Text><Text style={styles.title}>Hola, {user.firstName || 'bienvenido'}</Text></View><BrandLogo compact /></View>
      <View style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.profileCopy}><Text style={styles.profileName}>{fullName}</Text><Text style={styles.profileEmail}>{user.email}</Text>{user.phone && <Text style={styles.profilePhone}>{user.phone}</Text>}</View>
        <View style={styles.verified}><MaterialCommunityIcons name="check-decagram" size={18} color={colors.brand600} /></View>
      </View>
      {isStaff && <View style={styles.staffNotice}><MaterialCommunityIcons name="badge-account-outline" size={22} color={colors.accent500} /><View style={styles.staffCopy}><Text style={styles.staffTitle}>También eres parte del equipo</Text><Text style={styles.staffText}>Esta es la experiencia del cliente. Cocina, caja y administración continúan en el panel web protegido por permisos.</Text></View></View>}
      <View style={styles.pushCard}><View style={[styles.pushIcon, notifications.status === 'enabled' && styles.pushIconEnabled]}><MaterialCommunityIcons name={notifications.status === 'enabled' ? 'bell-check-outline' : 'bell-ring-outline'} size={23} color={notifications.status === 'enabled' ? colors.surface : colors.brand700} /></View><View style={styles.pushCopy}><Text style={styles.pushTitle}>{notifications.status === 'enabled' ? 'Avisos de pedidos activados' : pushNeedsConfiguration ? 'Notificaciones en configuración' : notifications.status === 'unsupported' ? 'Disponible en la app instalada' : 'Recibe cambios de tu pedido'}</Text><Text style={styles.pushText}>{notifications.status === 'enabled' ? 'Te avisaremos cuando cocina confirme, prepare, despache o entregue.' : pushNeedsConfiguration ? 'Falta vincular Firebase y generar una nueva versión de prueba.' : notifications.status === 'unsupported' ? 'Expo Go permite probar la interfaz; el APK habilita las notificaciones remotas.' : 'Activa las notificaciones para no depender de mantener la app abierta.'}</Text>{notifications.error ? <Text style={styles.pushError}>{notifications.error}</Text> : null}</View><Pressable disabled={notifications.status === 'busy' || pushUnavailable} onPress={() => void (notifications.status === 'enabled' ? notifications.disable() : notifications.enable())} style={[styles.pushAction, notifications.status === 'enabled' && styles.pushActionOff, pushUnavailable && styles.pushActionDisabled]}><Text style={[styles.pushActionText, notifications.status === 'enabled' && styles.pushActionTextOff]}>{notifications.status === 'busy' ? '…' : pushNeedsConfiguration ? 'Pendiente' : notifications.status === 'unsupported' ? 'Solo APK' : notifications.status === 'enabled' ? 'Desactivar' : 'Activar'}</Text></Pressable></View>

      <Text style={styles.sectionLabel}>CONTEXTO DE COMPRA</Text>
      <LocationBar />

      <Text style={styles.sectionLabel}>TU INFORMACIÓN</Text>
      <View style={styles.menuCard}>
        {[
          { icon: 'wallet-outline', title: 'Mi saldo', copy: 'Vigencias, bonos y movimientos', to: '/wallet' },
          { icon: 'sparkles', title: 'Planes Verde Bowl', copy: 'Recarga y recibe beneficios', to: '/plans' },
          { icon: 'account-edit-outline', title: 'Datos personales', copy: 'Nombre y teléfono' },
          { icon: 'map-marker-outline', title: 'Direcciones', copy: 'Tus puntos de entrega', to: '/addresses' },
          { icon: 'heart-outline', title: 'Mis favoritos', copy: 'Platos guardados en tu cuenta', to: '/favorites' },
          { icon: 'star-check-outline', title: 'Calificar compras', copy: 'Opiniones de pedidos entregados', to: '/reviews' },
          { icon: 'shield-account-outline', title: 'Preferencias y privacidad', copy: 'Comunicaciones y analítica', to: '/preferences' },
          { icon: 'whatsapp', title: 'Ayuda y reclamaciones', copy: 'WhatsApp, derechos y Libro virtual', to: '/support' },
        ].map(({ icon, title, copy, to }, index, rows) => (
          <Pressable key={title} onPress={() => to && router.push(to as Href)} style={[styles.menuRow, index < rows.length - 1 && styles.menuDivider]}>
            <View style={styles.rowIcon}><MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={21} color={colors.brand700} /></View>
            <View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDescription}>{copy}</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#9ba59f" />
          </Pressable>
        ))}
      </View>

      <Pressable onPress={confirmLogout} disabled={isBusy} style={styles.logout}><MaterialCommunityIcons name="logout" size={20} color={colors.danger} /><Text style={styles.logoutText}>{isBusy ? 'Cerrando…' : 'Cerrar sesión'}</Text></Pressable>
      <Text style={styles.version}>Verde Bowl Mobile · Fase 7</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  guestContent: { flexGrow: 1, paddingHorizontal: spacing.xl, alignItems: 'center' },
  guestIllustration: { width: 110, height: 110, borderRadius: 36, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center', marginTop: 70 },
  guestTitle: { color: colors.ink, fontSize: 27, lineHeight: 32, fontWeight: '900', textAlign: 'center', letterSpacing: -0.8, marginTop: spacing.lg },
  guestCopy: { color: colors.inkMuted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  fullButton: { width: '100%', marginTop: spacing.xl },
  secondaryButton: { width: '100%', marginTop: 10 },
  guestTrust: { flexDirection: 'row', gap: 9, backgroundColor: colors.brand50, borderRadius: radius.md, padding: 13, marginTop: spacing.lg },
  guestTrustText: { flex: 1, color: colors.brand700, fontSize: 11, lineHeight: 17 },
  accountHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.brand600, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 27, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.brand900, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.surface, fontSize: 20, fontWeight: '900' },
  profileCopy: { flex: 1 },
  profileName: { color: colors.surface, fontSize: 17, fontWeight: '900' },
  profileEmail: { color: '#c4dacf', fontSize: 11, marginTop: 4 },
  profilePhone: { color: '#9fc4b1', fontSize: 10, marginTop: 3 },
  verified: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  staffNotice: { flexDirection: 'row', gap: 11, backgroundColor: '#fff8e8', borderRadius: radius.md, padding: 14, marginTop: 12 },
  staffCopy: { flex: 1 },
  staffTitle: { color: '#744d10', fontSize: 12, fontWeight: '900' },
  staffText: { color: '#826733', fontSize: 10, lineHeight: 16, marginTop: 3 },
  pushCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 13, marginTop: 12 },
  pushIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  pushIconEnabled: { backgroundColor: colors.brand600 },
  pushCopy: { flex: 1 },
  pushTitle: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  pushText: { color: colors.inkMuted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  pushError: { color: colors.danger, fontSize: 8, lineHeight: 12, marginTop: 4 },
  pushAction: { borderRadius: radius.pill, backgroundColor: colors.brand700, paddingHorizontal: 12, paddingVertical: 8 },
  pushActionOff: { backgroundColor: '#fff0f0' },
  pushActionDisabled: { backgroundColor: '#87928c' },
  pushActionText: { color: colors.surface, fontSize: 9, fontWeight: '900' },
  pushActionTextOff: { color: colors.danger },
  sectionLabel: { color: colors.inkMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: spacing.xl, marginBottom: 9 },
  menuCard: { overflow: 'hidden', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  menuRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13 },
  menuDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  rowDescription: { color: colors.inkMuted, fontSize: 10, marginTop: 3 },
  logout: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: radius.md, borderWidth: 1, borderColor: '#f0c7c7', backgroundColor: '#fffafa', marginTop: spacing.lg },
  logoutText: { color: colors.danger, fontSize: 13, fontWeight: '900' },
  version: { color: '#929c97', fontSize: 9, textAlign: 'center', marginTop: spacing.lg },
});
