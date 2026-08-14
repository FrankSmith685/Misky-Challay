import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { AppImage } from '../../src/components/AppImage';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { accountApi } from '../../src/services/api/account.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { Profile } from '../../src/types/domain';

/**
 * Mismas reglas que el formulario de la web (ProfilePage.tsx) y que el esquema
 * del backend (account.validation.ts): si aquí fueran más laxas, el cliente
 * escribiría, pulsaría guardar y recibiría el error del servidor sin saber por qué.
 */
const NAME_MIN_LENGTH = 2;
const PHONE_PATTERN = /^[0-9+\s-]{6,20}$/;

interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
}

type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

const EMPTY_FORM: ProfileForm = { firstName: '', lastName: '', phone: '' };

const toForm = (profile: Profile): ProfileForm => ({
  firstName: profile.firstName ?? '',
  lastName: profile.lastName ?? '',
  phone: profile.phone ?? '',
});

const validate = (form: ProfileForm): ProfileErrors => {
  const errors: ProfileErrors = {};

  if (form.firstName.trim().length < NAME_MIN_LENGTH) {
    errors.firstName = 'Escribe tu nombre (mínimo 2 letras).';
  }
  if (form.lastName.trim().length < NAME_MIN_LENGTH) {
    errors.lastName = 'Escribe tu apellido (mínimo 2 letras).';
  }
  // El teléfono es opcional: vacío significa «bórralo», no «está mal escrito».
  if (form.phone.trim() !== '' && !PHONE_PATTERN.test(form.phone.trim())) {
    errors.phone = 'Usa solo números, espacios, guiones o +, entre 6 y 20 caracteres.';
  }

  return errors;
};

export default function ProfileScreen() {
  const { status, user, refreshUser } = useSession();
  const toast = useToast();

  const profile = useResource<Profile>({
    key: status === 'authenticated' ? 'account:profile' : null,
    fetcher: () => accountApi.profile(),
  });

  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<ProfileForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  /** Mientras el cliente escribe, una revalidación en segundo plano no le pisa el texto. */
  const editingRef = useRef(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace({ pathname: '/(auth)/login', params: { returnTo: '/profile' } });
    }
  }, [status]);

  useEffect(() => {
    if (!profile.data) return;
    const next = toForm(profile.data);
    setBaseline(next);
    if (!editingRef.current) setForm(next);
  }, [profile.data]);

  const dirty = useMemo(
    () =>
      form.firstName !== baseline.firstName ||
      form.lastName !== baseline.lastName ||
      form.phone !== baseline.phone,
    [baseline, form],
  );

  const change = (field: keyof ProfileForm, value: string) => {
    editingRef.current = true;
    setForm((current) => ({ ...current, [field]: value }));
    // El error desaparece en cuanto el cliente empieza a corregir, no al reenviar.
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const save = async () => {
    Keyboard.dismiss();
    const found = validate(form);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show({ message: 'Revisa los datos marcados en rojo.', tone: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const updated = await accountApi.updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
      });

      editingRef.current = false;
      profile.mutate(updated);
      setBaseline(toForm(updated));
      setForm(toForm(updated));
      // La cabecera de la cuenta saluda con el nombre: que no se quede con el viejo.
      invalidateResource('account:', { prefix: true });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ message: 'Tus datos quedaron actualizados.', tone: 'success' });
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos guardar tus datos.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;

    const image = result.assets[0];
    const mimeType = image.mimeType ?? 'image/jpeg';
    if (!image.base64 || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      toast.show({ message: 'Elige una foto JPG, PNG o WebP.', tone: 'error' });
      return;
    }

    setSavingAvatar(true);
    try {
      const updated = await accountApi.updateAvatar({
        fileName: image.fileName ?? `perfil-${Date.now()}.jpg`,
        mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        dataUrl: `data:${mimeType};base64,${image.base64}`,
      });
      profile.mutate(updated);
      invalidateResource('account:profile');
      await refreshUser();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ message: 'Foto de perfil actualizada.', tone: 'success' });
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos guardar la foto.',
        tone: 'error',
      });
    } finally {
      setSavingAvatar(false);
    }
  };

  const email = profile.data?.email ?? user?.email ?? '';
  const fullName = [form.firstName, form.lastName].filter(Boolean).join(' ').trim();
  const initials =
    [form.firstName, form.lastName]
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'VB';
  const completed = [form.firstName, form.lastName, email, form.phone].filter(
    (value) => value.trim() !== '',
  ).length;

  const shortcuts: Array<{
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    title: string;
    copy: string;
    to: Href;
  }> = [
    {
      icon: 'lock-reset',
      title: 'Cambiar contraseña',
      copy: 'Actualízala sin cerrar sesión',
      to: '/profile/password' as Href,
    },
    {
      icon: 'map-marker-outline',
      title: 'Mis direcciones',
      copy: 'Dónde te entregamos',
      to: '/addresses' as Href,
    },
    {
      icon: 'food-apple-outline',
      title: 'Preferencias alimentarias',
      copy: 'Alérgenos, estilo y metas',
      to: '/preferences' as Href,
    },
  ];

  const footer = (
    <View style={styles.footer}>
      <Text style={styles.footerHint}>
        {dirty ? 'Tienes cambios sin guardar.' : 'Todo guardado.'}
      </Text>
      <PrimaryButton
        label="Guardar cambios"
        loading={saving}
        disabled={!dirty || profile.data === null}
        onPress={() => void save()}
      />
    </View>
  );

  return (
    <ScreenScaffold
      title="Datos personales"
      subtitle="Con estos datos te identificamos y te contactamos"
      footer={footer}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {profile.loading ? (
            <View style={styles.loading}>
              <Skeleton height={128} rounded="lg" />
              <Skeleton height={78} rounded="md" count={3} gap={spacing.md} />
            </View>
          ) : profile.error && profile.data === null ? (
            <EmptyState
              icon="cloud-alert-outline"
              title="No pudimos cargar tu perfil"
              message={profile.error.message}
              actionLabel="Reintentar"
              onAction={() => void profile.refetch()}
            />
          ) : (
            <>
              <View style={[styles.hero, shadow.md]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={profile.data?.avatarUrl ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}
                  disabled={savingAvatar}
                  onPress={() => void pickAvatar()}
                  style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
                >
                  {profile.data?.avatarUrl ? (
                    <AppImage
                      uri={profile.data.avatarUrl}
                      style={styles.avatarImage}
                      accessibilityLabel="Foto de perfil"
                      fallbackIcon="account-outline"
                      fallbackIconSize={30}
                    />
                  ) : (
                    <Text style={styles.avatarText}>{initials}</Text>
                  )}
                  <View style={styles.avatarCamera}>
                    <MaterialCommunityIcons
                      name={savingAvatar ? 'loading' : 'camera-outline'}
                      size={15}
                      color={colors.onDark}
                    />
                  </View>
                </Pressable>

                <View style={styles.heroCopy}>
                  <Text numberOfLines={1} style={styles.heroName}>
                    {fullName || 'Completa tu nombre'}
                  </Text>
                  <Text numberOfLines={1} style={styles.heroEmail}>
                    {email}
                  </Text>
                </View>

                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeValue}>{completed}/4</Text>
                  <Text style={styles.heroBadgeLabel}>datos</Text>
                </View>
              </View>

              <Text style={styles.section}>TU IDENTIDAD</Text>

              <View style={styles.card}>
                <FormField
                  label="Nombre"
                  value={form.firstName}
                  onChangeText={(value) => change('firstName', value)}
                  error={errors.firstName}
                  autoComplete="given-name"
                  textContentType="givenName"
                  autoCapitalize="words"
                  returnKeyType="next"
                  icon="account-outline"
                  placeholder="Tu nombre"
                />

                <FormField
                  label="Apellido"
                  value={form.lastName}
                  onChangeText={(value) => change('lastName', value)}
                  error={errors.lastName}
                  autoComplete="family-name"
                  textContentType="familyName"
                  autoCapitalize="words"
                  returnKeyType="next"
                  icon="account-outline"
                  placeholder="Tu apellido"
                />

                <FormField
                  label="Teléfono"
                  value={form.phone}
                  onChangeText={(value) => change('phone', value)}
                  error={errors.phone}
                  hint="Lo usa el repartidor si no te encuentra. Déjalo vacío para borrarlo."
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  icon="phone-outline"
                  placeholder="999 999 999"
                  onSubmitEditing={() => void save()}
                />
              </View>

              <View style={styles.emailNote}>
                <MaterialCommunityIcons
                  name="email-lock-outline"
                  size={20}
                  color={colors.brand700}
                />
                <Text style={styles.emailNoteText}>
                  Tu correo de acceso ({email || 'sin correo'}) no se cambia desde aquí. Si
                  necesitas otro, escríbenos desde Ayuda y lo migramos contigo.
                </Text>
              </View>

              <Text style={styles.section}>SEGURIDAD Y ENTREGA</Text>

              <View style={styles.menuCard}>
                {shortcuts.map((row, index) => (
                  <Pressable
                    key={row.title}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.title}. ${row.copy}`}
                    onPress={() => router.push(row.to)}
                    style={({ pressed }) => [
                      styles.menuRow,
                      index < shortcuts.length - 1 && styles.menuDivider,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.menuIcon}>
                      <MaterialCommunityIcons name={row.icon} size={21} color={colors.brand700} />
                    </View>

                    <View style={styles.menuCopy}>
                      <Text style={styles.menuTitle}>{row.title}</Text>
                      <Text style={styles.menuText}>{row.copy}</Text>
                    </View>

                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={22}
                      color={colors.inkMuted}
                    />
                  </Pressable>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Eliminar mi cuenta"
                onPress={() => router.push('/profile/delete' as Href)}
                style={({ pressed }) => [styles.dangerRow, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name="account-remove-outline"
                  size={21}
                  color={colors.danger}
                />
                <Text style={styles.dangerText}>Eliminar mi cuenta</Text>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.danger} />
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  loading: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.lg,
    padding: spacing.md + spacing.xs,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.md + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
    overflow: 'hidden',
  },
  avatarImage: {
    ...StyleSheet.absoluteFill,
  },
  avatarCamera: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  avatarText: {
    ...type.title,
    color: colors.onDark,
  },
  heroCopy: {
    flex: 1,
  },
  heroName: {
    ...type.heading,
    color: colors.onDark,
  },
  heroEmail: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: 3,
  },
  heroBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm + 4,
    backgroundColor: colors.surfaceDarkRaised,
  },
  heroBadgeValue: {
    ...type.heading,
    color: colors.onDark,
  },
  heroBadgeLabel: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  section: {
    ...type.label,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
  },
  emailNote: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    alignItems: 'flex-start',
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  emailNoteText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
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
  menuIcon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  menuCopy: {
    flex: 1,
  },
  menuTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  menuText: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f0c7c7',
    backgroundColor: '#fffafa',
    marginTop: spacing.md,
  },
  dangerText: {
    ...type.body,
    flex: 1,
    fontWeight: '800',
    color: colors.danger,
  },
  footer: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  footerHint: {
    ...type.bodySm,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
