import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { accountApi } from '../../src/services/api/account.service';
import { catalogApi } from '../../src/services/api/catalog.service';
import { engagementApi } from '../../src/services/api/engagement.service';
import { mobileAnalytics } from '../../src/services/analytics';
import { colors, layout, radius, spacing, type } from '../../src/theme/tokens';
import type {
  Allergen,
  DietaryTag,
  FoodPreferences,
  NewsletterStatus,
} from '../../src/types/domain';

/** Límites de updateFoodPreferencesSchema en el backend. */
const CALORIE_RANGE = { min: 300, max: 5000 } as const;
const PROTEIN_RANGE = { min: 0, max: 500 } as const;

const EMPTY_PREFERENCES: FoodPreferences = {
  allergens: [],
  dietaryTags: [],
  dislikedOptionIds: [],
  calorieTarget: null,
  proteinTarget: null,
};

/** El texto del campo numérico se guarda tal cual se teclea; solo al enviar se convierte. */
const toTargetText = (value: number | null): string => (value === null ? '' : String(value));

const parseTarget = (text: string): number | null => {
  const digits = text.replace(/[^0-9]/g, '');
  if (digits === '') return null;
  return Number(digits);
};

const sameList = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((code) => right.includes(code));

export default function PreferencesScreen() {
  const { status } = useSession();
  const toast = useToast();

  const authenticated = status === 'authenticated';

  const allergens = useResource<Allergen[]>({
    key: 'catalog:allergens',
    fetcher: () => catalogApi.allergens(),
    cacheMs: 10 * 60_000,
  });

  const dietaryTags = useResource<DietaryTag[]>({
    key: 'catalog:dietary-tags',
    fetcher: () => catalogApi.dietaryTags(),
    cacheMs: 10 * 60_000,
  });

  const saved = useResource<FoodPreferences>({
    key: authenticated ? 'account:food-preferences' : null,
    fetcher: () => accountApi.foodPreferences(),
  });

  const newsletter = useResource<NewsletterStatus>({
    key: authenticated ? 'engagement:newsletter' : null,
    fetcher: () => engagementApi.newsletter(),
  });

  const [draft, setDraft] = useState<FoodPreferences>(EMPTY_PREFERENCES);
  const [calorieText, setCalorieText] = useState('');
  const [proteinText, setProteinText] = useState('');
  const [savingFood, setSavingFood] = useState(false);

  const [newsletterOn, setNewsletterOn] = useState(false);
  const [savingNewsletter, setSavingNewsletter] = useState(false);

  const [analyticsOn, setAnalyticsOn] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace({ pathname: '/(auth)/login', params: { returnTo: '/preferences' } });
    }
  }, [status]);

  useEffect(() => {
    void mobileAnalytics.consent().then(setAnalyticsOn);
  }, []);

  useEffect(() => {
    if (!saved.data) return;
    setDraft(saved.data);
    setCalorieText(toTargetText(saved.data.calorieTarget));
    setProteinText(toTargetText(saved.data.proteinTarget));
  }, [saved.data]);

  useEffect(() => {
    if (newsletter.data) setNewsletterOn(newsletter.data.subscribed);
  }, [newsletter.data]);

  const calorieTarget = parseTarget(calorieText);
  const proteinTarget = parseTarget(proteinText);

  const calorieError =
    calorieTarget !== null &&
    (calorieTarget < CALORIE_RANGE.min || calorieTarget > CALORIE_RANGE.max)
      ? `Entre ${CALORIE_RANGE.min} y ${CALORIE_RANGE.max} kcal.`
      : '';
  const proteinError =
    proteinTarget !== null && proteinTarget > PROTEIN_RANGE.max
      ? `Como máximo ${PROTEIN_RANGE.max} g.`
      : '';

  const foodDirty = useMemo(() => {
    const base = saved.data ?? EMPTY_PREFERENCES;
    return (
      !sameList(draft.allergens, base.allergens) ||
      !sameList(draft.dietaryTags, base.dietaryTags) ||
      calorieTarget !== base.calorieTarget ||
      proteinTarget !== base.proteinTarget
    );
  }, [calorieTarget, draft, proteinTarget, saved.data]);

  const toggle = (key: 'allergens' | 'dietaryTags', code: string) => {
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(code)
        ? current[key].filter((entry) => entry !== code)
        : [...current[key], code],
    }));
  };

  const saveFood = async () => {
    if (calorieError || proteinError) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show({ message: 'Revisa las metas: están fuera de rango.', tone: 'warning' });
      return;
    }

    setSavingFood(true);
    try {
      const result = await accountApi.saveFoodPreferences({
        allergens: draft.allergens,
        dietaryTags: draft.dietaryTags,
        dislikedOptionIds: draft.dislikedOptionIds,
        calorieTarget,
        proteinTarget,
      });

      saved.mutate(result);
      // El menú filtra con estas preferencias: que las relea al volver a él.
      invalidateResource('catalog:products', { prefix: true });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ message: 'Guardamos tu perfil alimentario.', tone: 'success' });
    } catch (caught) {
      toast.show({
        message:
          caught instanceof Error ? caught.message : 'No pudimos guardar tus preferencias.',
        tone: 'error',
      });
    } finally {
      setSavingFood(false);
    }
  };

  const changeNewsletter = async (value: boolean) => {
    setNewsletterOn(value);
    setSavingNewsletter(true);
    try {
      const result = await engagementApi.setNewsletter(value);
      newsletter.mutate(result);
      setNewsletterOn(result.subscribed);
      toast.show({
        message: result.subscribed
          ? 'Listo, te escribiremos con las novedades.'
          : 'No volverás a recibir nuestros correos de novedades.',
        tone: 'success',
      });
    } catch (caught) {
      // Devolvemos el interruptor a su sitio: mostrar activado lo que no se guardó
      // es peor que no haberlo movido.
      setNewsletterOn(!value);
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos guardar el cambio.',
        tone: 'error',
      });
    } finally {
      setSavingNewsletter(false);
    }
  };

  const changeAnalytics = async (value: boolean) => {
    setAnalyticsOn(value);
    await mobileAnalytics.setConsent(value);
    if (value) void mobileAnalytics.track('APP_OPEN', { consentGranted: true });
    toast.show({
      message: value
        ? 'Gracias: tus eventos anónimos nos ayudan a mejorar la app.'
        : 'Dejamos de medir tu navegación en este teléfono.',
      tone: 'info',
    });
  };

  const catalogFailed =
    allergens.error !== null &&
    dietaryTags.error !== null &&
    allergens.data === null &&
    dietaryTags.data === null;

  const loadingProfile = saved.loading || (allergens.loading && dietaryTags.loading);
  const selectedCount = draft.allergens.length + draft.dietaryTags.length;

  const footer = foodDirty ? (
    <View style={styles.footer}>
      <PrimaryButton
        label="Guardar perfil alimentario"
        loading={savingFood}
        onPress={() => void saveFood()}
      />
    </View>
  ) : undefined;

  return (
    <ScreenScaffold
      title="Preferencias y privacidad"
      subtitle="Tú decides qué te mostramos y qué medimos"
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
          <View style={styles.hero}>
            <MaterialCommunityIcons
              name="shield-account-outline"
              size={30}
              color={colors.onDark}
            />
            <Text style={styles.heroTitle}>Control claro de tus datos</Text>
            <Text style={styles.heroCopy}>
              Los avisos de tus pedidos son independientes de la publicidad y de la medición
              opcional: nunca dejarás de enterarte de que tu bowl salió del local.
            </Text>
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.section}>PERFIL ALIMENTARIO</Text>
            {selectedCount > 0 && (
              <View style={styles.counter}>
                <Text style={styles.counterText}>{selectedCount} activas</Text>
              </View>
            )}
          </View>

          {loadingProfile ? (
            <View style={styles.loading}>
              <Skeleton height={128} rounded="md" count={2} gap={spacing.sm} />
            </View>
          ) : catalogFailed ? (
            <EmptyState
              icon="cloud-alert-outline"
              title="No pudimos cargar el catálogo"
              message="Sin la lista de alérgenos y etiquetas no podemos mostrarte el perfil alimentario."
              actionLabel="Reintentar"
              fill={false}
              onAction={() => {
                void allergens.refetch();
                void dietaryTags.refetch();
              }}
            />
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Alérgenos que necesito evitar</Text>
                <Text style={styles.cardCopy}>
                  Te avisaremos cuando un plato los contenga. No sustituye consultar en el local
                  si tu alergia es severa: preparamos todo en la misma cocina.
                </Text>

                <View style={styles.chips}>
                  {(allergens.data ?? []).map((item) => (
                    <Chip
                      key={item.id}
                      label={item.name}
                      tone="danger"
                      icon={draft.allergens.includes(item.code) ? 'check' : 'alert-outline'}
                      selected={draft.allergens.includes(item.code)}
                      onPress={() => toggle('allergens', item.code)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Mi estilo de alimentación</Text>
                <Text style={styles.cardCopy}>
                  Con esto ordenamos el menú y las recomendaciones a tu favor.
                </Text>

                <View style={styles.chips}>
                  {(dietaryTags.data ?? []).map((item) => (
                    <Chip
                      key={item.id}
                      label={item.name}
                      icon={draft.dietaryTags.includes(item.code) ? 'check' : 'leaf'}
                      selected={draft.dietaryTags.includes(item.code)}
                      onPress={() => toggle('dietaryTags', item.code)}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Metas orientativas por bowl</Text>
                <Text style={styles.cardCopy}>
                  Son una guía para destacar platos, no un límite: siempre podrás pedir lo que
                  quieras.
                </Text>

                <View style={styles.targets}>
                  <View style={styles.target}>
                    <Text style={styles.targetLabel}>Máximo de calorías</Text>
                    <View style={[styles.targetField, calorieError !== '' && styles.targetError]}>
                      <TextInput
                        accessibilityLabel="Máximo de calorías por bowl"
                        value={calorieText}
                        onChangeText={(value) => setCalorieText(value.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        maxLength={4}
                        placeholder="650"
                        placeholderTextColor={colors.inkMuted}
                        style={styles.targetInput}
                      />
                      <Text style={styles.targetUnit}>kcal</Text>
                    </View>
                    <Text style={[styles.targetHint, calorieError !== '' && styles.targetHintBad]}>
                      {calorieError || `Entre ${CALORIE_RANGE.min} y ${CALORIE_RANGE.max}`}
                    </Text>
                  </View>

                  <View style={styles.target}>
                    <Text style={styles.targetLabel}>Mínimo de proteína</Text>
                    <View style={[styles.targetField, proteinError !== '' && styles.targetError]}>
                      <TextInput
                        accessibilityLabel="Mínimo de proteína por bowl"
                        value={proteinText}
                        onChangeText={(value) => setProteinText(value.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="30"
                        placeholderTextColor={colors.inkMuted}
                        style={styles.targetInput}
                      />
                      <Text style={styles.targetUnit}>g</Text>
                    </View>
                    <Text style={[styles.targetHint, proteinError !== '' && styles.targetHintBad]}>
                      {proteinError || `Hasta ${PROTEIN_RANGE.max}`}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          )}

          <Text style={styles.section}>COMUNICACIONES</Text>

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchIcon}>
                <MaterialCommunityIcons
                  name="email-heart-outline"
                  size={22}
                  color={colors.brand700}
                />
              </View>

              <View style={styles.switchCopy}>
                <Text style={styles.switchTitle}>Novedades y promociones</Text>
                <Text style={styles.switchText}>
                  Lanzamientos y beneficios en {newsletter.data?.email ?? 'tu correo'}. Puedes
                  darte de baja cuando quieras.
                </Text>
              </View>

              <Switch
                accessibilityLabel="Recibir novedades y promociones"
                disabled={savingNewsletter || newsletter.loading}
                value={newsletterOn}
                onValueChange={(value) => void changeNewsletter(value)}
                trackColor={{ false: '#ccd3cf', true: '#83bda0' }}
                thumbColor={newsletterOn ? colors.brand700 : '#f7f7f7'}
              />
            </View>
          </View>

          <Text style={styles.section}>MEDICIÓN OPCIONAL</Text>

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchIcon}>
                <MaterialCommunityIcons
                  name="chart-timeline-variant"
                  size={22}
                  color={colors.brand700}
                />
              </View>

              <View style={styles.switchCopy}>
                <Text style={styles.switchTitle}>Ayudar a mejorar la app</Text>
                <Text style={styles.switchText}>
                  Envía eventos técnicos de navegación. No enviamos contraseñas, direcciones,
                  notas ni datos de pago.
                </Text>
              </View>

              <Switch
                accessibilityLabel="Ayudar a mejorar la app"
                value={analyticsOn}
                onValueChange={(value) => void changeAnalytics(value)}
                trackColor={{ false: '#ccd3cf', true: '#83bda0' }}
                thumbColor={analyticsOn ? colors.brand700 : '#f7f7f7'}
              />
            </View>
          </View>

          <View style={styles.note}>
            <MaterialCommunityIcons name="information-outline" size={20} color={colors.brand700} />
            <Text style={styles.noteText}>
              Desactivar la medición no afecta precios, pedidos, saldo, cobertura ni las
              recomendaciones que salen de tu propia cuenta.
            </Text>
          </View>
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
  hero: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.lg,
    padding: spacing.md + spacing.xs,
  },
  heroTitle: {
    ...type.heading,
    color: colors.onDark,
    marginTop: spacing.sm + spacing.xs,
  },
  heroCopy: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: spacing.xs + 2,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    ...type.label,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  counter: {
    borderRadius: radius.pill,
    backgroundColor: colors.brand100,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: 3,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  counterText: {
    ...type.caption,
    color: colors.brand700,
  },
  loading: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  cardCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  targets: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    marginTop: spacing.md,
  },
  target: {
    flex: 1,
  },
  targetLabel: {
    ...type.label,
    color: colors.ink,
    marginBottom: spacing.xs + 2,
  },
  targetField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: layout.minTouch + 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + spacing.xs,
  },
  targetError: {
    borderColor: colors.danger,
    backgroundColor: '#fffafa',
  },
  targetInput: {
    ...type.body,
    flex: 1,
    color: colors.ink,
    paddingVertical: spacing.sm + spacing.xs,
  },
  targetUnit: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  targetHint: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  targetHintBad: {
    color: colors.danger,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  switchIcon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  switchCopy: {
    flex: 1,
  },
  switchTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  switchText: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noteText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
  },
  footer: {
    paddingBottom: spacing.sm,
  },
});
