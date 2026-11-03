import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { StatusPill } from '../../src/components/StatusPill';
import {
  STAFF_GROUP_LABELS,
  STAFF_MODULES,
  canAccessStaffModule,
  isStaffUser,
  type StaffModule,
} from '../../src/constants/staffModules';
import { useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useMobileNotifications } from '../../src/providers/MobileNotificationsProvider';
import { geoApi } from '../../src/services/api/geo.service';
import { colors, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { Branch } from '../../src/types/domain';

const GROUPS: StaffModule['group'][] = ['GENERAL', 'OPERACION', 'ABASTECIMIENTO', 'NEGOCIO', 'ADMINISTRACION'];

const roleLabel = (roles: string[], superAdmin: boolean): string => {
  if (superAdmin) return 'Superadministración';
  const normalized = roles.map((role) => role.toLowerCase());
  if (normalized.some((role) => role.includes('kitchen') || role.includes('cocina'))) return 'Cocina';
  if (normalized.some((role) => role.includes('delivery') || role.includes('repart'))) return 'Reparto';
  if (normalized.some((role) => role.includes('cash') || role.includes('caja'))) return 'Caja';
  if (normalized.some((role) => role.includes('waiter') || role.includes('mozo'))) return 'Salón';
  return 'Equipo operativo';
};

export function StaffHomeScreen({ standalone = false }: { standalone?: boolean }) {
  const { status, user } = useSession();
  const notifications = useMobileNotifications();
  const [branchId, setBranchId] = useState<number | null>(null);
  const branches = useResource<Branch[]>({
    key: isStaffUser(user) ? 'staff:branches' : null,
    fetcher: geoApi.branches,
    cacheMs: 5 * 60_000,
  });

  const allowedBranches = useMemo(() => {
    const all = branches.data ?? [];
    if (user?.isSuperAdmin || !user?.branchIds.length) return all;
    return all.filter((branch) => user.branchIds.includes(branch.id));
  }, [branches.data, user]);

  useEffect(() => {
    if (!branchId && allowedBranches[0]) setBranchId(allowedBranches[0].id);
    if (branchId && !allowedBranches.some((branch) => branch.id === branchId)) {
      setBranchId(allowedBranches[0]?.id ?? null);
    }
  }, [allowedBranches, branchId]);

  if (status === 'bootstrapping') {
    return <ScreenScaffold><View style={styles.loading}><Skeleton width="100%" height={170} rounded="lg" /><Skeleton width="100%" height={92} rounded="lg" /><Skeleton width="100%" height={92} rounded="lg" /></View></ScreenScaffold>;
  }

  if (status !== 'authenticated' || !user || !isStaffUser(user)) {
    return (
      <ScreenScaffold title="Panel de equipo" padded>
        <EmptyState
          icon="shield-lock-outline"
          title="Esta cuenta no tiene funciones operativas"
          message="El centro de operaciones aparece únicamente al personal con un rol y permisos asignados."
        />
      </ScreenScaffold>
    );
  }

  const available = STAFF_MODULES.filter((module) => canAccessStaffModule(module, user));
  const activeBranch = allowedBranches.find((branch) => branch.id === branchId) ?? null;
  const liveTools = available.filter((module) => module.live).length;
  const currentRole = roleLabel(user.roles, user.isSuperAdmin);

  return (
    <ScreenScaffold
      title={standalone ? 'Centro de operaciones' : undefined}
      subtitle={standalone ? (activeBranch?.name ?? 'Selecciona un local') : undefined}
      showBack={standalone}
      onBack={standalone ? () => router.replace('/(tabs)/account') : undefined}
      background="#f3f7f4"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View pointerEvents="none" style={styles.heroOrb} />
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="storefront-outline" size={30} color={colors.surface} />
            </View>
            <StatusPill label={currentRole} tone="success" live />
          </View>
          <Text style={styles.eyebrow}>CENTRO DE OPERACIONES</Text>
          <Text style={styles.title}>Hola, {user.firstName || 'equipo'}</Text>
          <Text style={styles.subtitle}>Prioridades, herramientas y locales de tu jornada en un solo lugar.</Text>
          {standalone ? (
            <Pressable onPress={() => router.replace('/(tabs)/account')} style={styles.clientLink}>
              <MaterialCommunityIcons name="account-arrow-left-outline" size={18} color={colors.onDark} />
              <Text style={styles.clientLinkText}>Volver a mi cuenta</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.snapshot}>
          <View style={styles.snapshotMain}>
            <Text style={styles.snapshotEyebrow}>TU ESPACIO DE TRABAJO</Text>
            <Text style={styles.snapshotTitle}>{available.length} herramientas disponibles</Text>
            <Text style={styles.snapshotCopy}>Cada acción usa los mismos permisos y datos que el panel web.</Text>
          </View>
          <View style={styles.snapshotSide}>
            <Text style={styles.snapshotNumber}>{allowedBranches.length}</Text>
            <Text style={styles.snapshotLabel}>{allowedBranches.length === 1 ? 'local' : 'locales'}</Text>
          </View>
        </View>

        <View style={styles.priorityRail}>
          <View style={styles.priorityCard}>
            <MaterialCommunityIcons name="access-point" size={22} color={colors.brand700} />
            <Text style={styles.priorityValue}>{liveTools}</Text>
            <Text style={styles.priorityLabel}>tableros en vivo</Text>
          </View>
          <View style={styles.priorityCard}>
            <MaterialCommunityIcons name="shield-check-outline" size={22} color={colors.brand700} />
            <Text style={styles.priorityValue}>{user.permissions.length}</Text>
            <Text style={styles.priorityLabel}>permisos activos</Text>
          </View>
        </View>

        <View style={[styles.notificationCard, shadow.sm]}>
          <View style={[styles.notificationIcon, notifications.status !== 'enabled' && styles.notificationIconOff]}>
            <MaterialCommunityIcons
              name={notifications.status === 'enabled' ? 'bell-check-outline' : 'bell-ring-outline'}
              size={25}
              color={notifications.status === 'enabled' ? colors.surface : colors.brand700}
            />
          </View>
          <View style={styles.notificationCopy}>
            <Text style={styles.notificationTitle}>
              {notifications.status === 'enabled' ? 'Alertas operativas activas' : 'Activa las alertas operativas'}
            </Text>
            <Text style={styles.notificationText}>
              {notifications.status === 'enabled'
                ? 'Recibirás avisos según tus permisos y únicamente de los locales que tienes asignados.'
                : notifications.error || 'Cocina puede avisarte aunque la aplicación esté en segundo plano.'}
            </Text>
          </View>
          {notifications.status !== 'enabled' ? (
            <PrimaryButton
              label="Activar"
              loading={notifications.status === 'busy'}
              disabled={notifications.status === 'unsupported' || notifications.status === 'configuration-required'}
              onPress={() => void notifications.enable()}
              style={styles.notificationAction}
            />
          ) : null}
        </View>

        {allowedBranches.length > 0 ? (
          <View style={styles.branchSection}>
            <Text style={styles.sectionLabel}>LOCAL ACTIVO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchRail}>
              {allowedBranches.map((branch) => {
                const selected = branch.id === branchId;
                return (
                  <Pressable key={branch.id} onPress={() => setBranchId(branch.id)} style={[styles.branchChip, selected && styles.branchChipActive]}>
                    <MaterialCommunityIcons name="store-marker-outline" size={18} color={selected ? colors.surface : colors.brand700} />
                    <Text style={[styles.branchChipText, selected && styles.branchChipTextActive]}>{branch.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {activeBranch ? <Text style={styles.branchAddress}>{activeBranch.addressLine}</Text> : null}
          </View>
        ) : branches.loading ? <ActivityIndicator color={colors.brand600} /> : branches.error ? (
          <View style={styles.branchError}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={24} color={colors.danger} />
            <View style={styles.branchErrorCopy}><Text style={styles.branchErrorTitle}>No pudimos cargar tus locales</Text><Text style={styles.branchErrorText}>{branches.error.message}</Text></View>
            <Pressable onPress={() => void branches.refetch()} style={styles.retryButton}><MaterialCommunityIcons name="refresh" size={21} color={colors.brand700} /></Pressable>
          </View>
        ) : (
          <View style={styles.branchError}>
            <MaterialCommunityIcons name="store-alert-outline" size={24} color={colors.warning} />
            <View style={styles.branchErrorCopy}><Text style={styles.branchErrorTitle}>No tienes un local asignado</Text><Text style={styles.branchErrorText}>Asigna al menos una sede desde usuarios y roles para operar módulos locales.</Text></View>
          </View>
        )}

        {GROUPS.map((group) => {
          const modules = available.filter((module) => module.group === group);
          if (!modules.length) return null;
          return (
            <View key={group} style={styles.group}>
              <Text style={styles.sectionLabel}>{STAFF_GROUP_LABELS[group]}</Text>
              <View style={styles.moduleList}>
                {modules.map((module) => (
                  <Pressable
                    key={module.key}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir ${module.title}`}
                    onPress={() => router.push(module.key === 'business'
                      ? '/staff/business-editor' as Href
                      : `/staff/${module.key}${branchId ? `?branchId=${branchId}&branchName=${encodeURIComponent(activeBranch?.name ?? '')}` : ''}` as Href)}
                    style={({ pressed }) => [styles.moduleCard, shadow.sm, module.live && styles.moduleCardLive, pressed && styles.pressed]}
                  >
                    <View style={[styles.moduleIcon, module.live && styles.moduleIconLive]}>
                      <MaterialCommunityIcons name={module.icon} size={24} color={module.live ? colors.surface : colors.brand700} />
                    </View>
                    <View style={styles.moduleCopy}>
                      <View style={styles.moduleTitleRow}>
                        <Text style={styles.moduleTitle}>{module.title}</Text>
                        {module.live ? <StatusPill label="En vivo" tone="success" live /> : null}
                      </View>
                      <Text numberOfLines={2} style={styles.moduleDescription}>{module.description}</Text>
                    </View>
                    <View style={styles.moduleArrow}>
                      <MaterialCommunityIcons name="chevron-right" size={23} color={colors.brand700} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ScreenScaffold>
  );
}

export default function StaffTabEntry() {
  return <StaffHomeScreen standalone />;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loading: { flex: 1, gap: spacing.md, padding: spacing.md },
  hero: { position: 'relative', overflow: 'hidden', backgroundColor: colors.brand950, padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxl, borderBottomLeftRadius: radius.xl + 8, borderBottomRightRadius: radius.xl + 8 },
  heroOrb: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -90, top: -90, backgroundColor: 'rgba(35,124,82,.32)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand600 },
  eyebrow: { ...type.label, color: colors.brand100, letterSpacing: 1.2 },
  title: { ...type.hero, color: colors.onDark, marginTop: 5 },
  subtitle: { ...type.body, color: colors.onDarkMuted, marginTop: spacing.sm, maxWidth: 500 },
  clientLink: { alignSelf: 'flex-start', minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceDarkRaised, paddingHorizontal: 14, marginTop: spacing.lg },
  clientLinkText: { ...type.bodySm, color: colors.onDark, fontWeight: '800' },
  snapshot: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md, marginHorizontal: spacing.md, marginTop: -spacing.lg, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, ...shadow.md },
  snapshotMain: { flex: 1 },
  snapshotEyebrow: { ...type.label, color: colors.brand600 },
  snapshotTitle: { ...type.heading, color: colors.ink, marginTop: 4 },
  snapshotCopy: { ...type.bodySm, color: colors.inkMuted, marginTop: 4 },
  snapshotSide: { minWidth: 76, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.accent50 },
  snapshotNumber: { ...type.title, color: colors.accent600 },
  snapshotLabel: { ...type.caption, color: colors.warning },
  priorityRail: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.md },
  priorityCard: { flex: 1, minHeight: 94, justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand100, backgroundColor: colors.brand50, padding: spacing.md },
  priorityValue: { ...type.heading, color: colors.brand900, marginTop: 4 },
  priorityLabel: { ...type.caption, color: colors.inkMuted, marginTop: 2 },
  notificationCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand100, backgroundColor: colors.surface, padding: spacing.md },
  notificationIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.brand600 },
  notificationIconOff: { backgroundColor: colors.brand50 },
  notificationCopy: { flex: 1 },
  notificationTitle: { ...type.bodySm, color: colors.ink, fontWeight: '900' },
  notificationText: { ...type.caption, color: colors.inkMuted, marginTop: 3 },
  notificationAction: { minWidth: 92 },
  branchSection: { marginHorizontal: spacing.md, marginTop: spacing.xl, marginBottom: spacing.lg },
  sectionLabel: { ...type.label, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: spacing.sm },
  branchRail: { gap: spacing.sm, paddingRight: spacing.md },
  branchChip: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 15 },
  branchChipActive: { backgroundColor: colors.brand700, borderColor: colors.brand700 },
  branchChipText: { ...type.bodySm, color: colors.brand700, fontWeight: '800' },
  branchChipTextActive: { color: colors.surface },
  branchAddress: { ...type.caption, color: colors.inkMuted, marginTop: spacing.sm },
  branchError: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md },
  branchErrorCopy: { flex: 1 },
  branchErrorTitle: { ...type.bodySm, color: colors.ink, fontWeight: '900' },
  branchErrorText: { ...type.caption, color: colors.inkMuted, marginTop: 2 },
  retryButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.brand50 },
  group: { marginHorizontal: spacing.md, marginBottom: spacing.xl },
  moduleList: { gap: spacing.sm + spacing.xs },
  moduleCard: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md },
  moduleCardLive: { borderColor: colors.brand100 },
  moduleIcon: { width: 48, height: 48, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 },
  moduleIconLive: { backgroundColor: colors.brand600 },
  moduleCopy: { flex: 1 },
  moduleTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  moduleTitle: { ...type.heading, flexShrink: 1, color: colors.ink },
  moduleDescription: { ...type.bodySm, color: colors.inkMuted, marginTop: 4 },
  moduleArrow: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
});
