import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useResource } from '../../src/hooks/useResource';
import { useToast } from '../../src/providers/ToastProvider';
import {
  complaintsApi,
  type ComplaintStatusResult,
} from '../../src/services/api/complaints.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';

/**
 * Consulta pública del Libro de Reclamaciones.
 *
 * GET /complaints/track existe desde el primer día y ninguna pantalla del móvil
 * lo llamaba: el cliente recibía un código y no tenía dónde usarlo. El backend
 * solo exige código y número de documento, así que se consulta sin sesión.
 */

type ComplaintTrackStatus = ComplaintStatusResult['status'];

interface TrackQuery {
  code: string;
  docNumber: string;
}

const SUPPORT_ROUTE = '/support' as Href;

const STEPS: ReadonlyArray<{
  status: ComplaintTrackStatus;
  label: string;
  copy: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  {
    status: 'RECEIVED',
    label: 'Recibido',
    copy: 'Tu hoja quedó registrada con su correlativo.',
    icon: 'inbox-arrow-down-outline',
  },
  {
    status: 'IN_PROGRESS',
    label: 'En proceso',
    copy: 'Estamos revisando lo ocurrido para responderte.',
    icon: 'progress-clock',
  },
  {
    status: 'RESOLVED',
    label: 'Respondido',
    copy: 'Ya tienes la respuesta formal del negocio.',
    icon: 'check-decagram-outline',
  },
];

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * El correlativo que entrega el backend es `LR-000123`. Mucha gente apunta solo
 * el número, así que si escriben dígitos sueltos lo completamos por ellos en vez
 * de devolver un «no encontrado» que en realidad es un problema de formato.
 */
const normalizeCode = (raw: string): string => {
  const value = raw.trim().toUpperCase();
  if (/^\d+$/.test(value)) return `LR-${value.padStart(6, '0')}`;
  return value;
};

const readParam = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value : '';

export default function ComplaintTrackScreen() {
  const params = useLocalSearchParams<{ code?: string; doc?: string }>();
  const toast = useToast();

  const [code, setCode] = useState(() => readParam(params.code));
  const [docNumber, setDocNumber] = useState(() => readParam(params.doc));
  const [query, setQuery] = useState<TrackQuery | null>(null);

  const canSearch = useMemo(
    () => code.trim().length >= 3 && docNumber.trim().length >= 6,
    [code, docNumber],
  );

  const result = useResource<ComplaintStatusResult>({
    key: query ? `complaints:track:${query.code}:${query.docNumber}` : null,
    fetcher: () => complaintsApi.track(query?.code ?? '', query?.docNumber ?? ''),
    // Es un dato personal: se guarda lo justo para volver a la pantalla sin
    // repetir la consulta, no para quedarse en memoria toda la sesión.
    cacheMs: 30_000,
  });

  // Cuando se llega desde el comprobante recién emitido ya traemos los dos
  // datos: buscar solo por haber navegado ahorra al cliente teclear su documento.
  useEffect(() => {
    const initialCode = readParam(params.code);
    const initialDoc = readParam(params.doc);
    if (initialCode.trim().length >= 3 && initialDoc.trim().length >= 6) {
      setQuery({ code: normalizeCode(initialCode), docNumber: initialDoc.trim() });
    }
  }, [params.code, params.doc]);

  const search = () => {
    if (!canSearch) {
      toast.show({
        message: 'Escribe el código del reclamo y tu número de documento.',
        tone: 'warning',
      });
      return;
    }
    const normalized = normalizeCode(code);
    setCode(normalized);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery({ code: normalized, docNumber: docNumber.trim() });
  };

  const activeIndex = result.data ? STEPS.findIndex((step) => step.status === result.data?.status) : -1;

  return (
    <ScreenScaffold title="Estado de tu reclamo" subtitle="Libro de Reclamaciones" showBack>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Consulta con tu código</Text>
            <Text style={styles.cardCopy}>
              Ingresa el código que te dimos al registrar la solicitud y el número de documento con
              el que la presentaste.
            </Text>

            <FormField
              label="Código del reclamo"
              value={code}
              onChangeText={(value) => setCode(value.toUpperCase())}
              onBlur={() => setCode((current) => normalizeCode(current))}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="LR-000123"
              maxLength={20}
              icon="pound"
              hint="Si solo apuntaste el número, escríbelo igual: lo completamos."
            />

            <FormField
              label="Número de documento"
              value={docNumber}
              onChangeText={(value) => setDocNumber(value.replace(/\s/g, '').toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              icon="card-account-details-outline"
              hint="El mismo que usaste al presentar el reclamo."
            />

            <PrimaryButton
              label="Consultar estado"
              loading={result.loading || result.refreshing}
              disabled={!canSearch}
              onPress={search}
            />
          </View>

          {result.loading ? (
            <View style={styles.card}>
              <Skeleton width="45%" height={22} rounded="sm" />
              <Skeleton width="100%" height={14} count={3} style={styles.skeletonGap} />
              <Skeleton width="70%" height={14} style={styles.skeletonGap} />
            </View>
          ) : null}

          {result.error && !result.loading ? (
            <View style={styles.errorCard}>
              <MaterialCommunityIcons name="file-search-outline" size={34} color={colors.danger} />
              <Text style={styles.errorTitle}>No encontramos ese reclamo</Text>
              <Text style={styles.errorCopy}>{result.error.message}</Text>
              <Text style={styles.errorHint}>
                Revisa que el código y el documento sean los mismos que registraste. Si presentaste
                el reclamo hace un momento, vuelve a intentarlo en unos segundos.
              </Text>
              <PrimaryButton
                label="Reintentar"
                variant="secondary"
                onPress={() => void result.refetch()}
                style={styles.errorAction}
              />
            </View>
          ) : null}

          {result.data && !result.error ? (
            <View style={styles.card}>
              <View style={styles.resultHead}>
                <View style={styles.flex}>
                  <Text style={styles.resultEyebrow}>
                    {result.data.type === 'QUEJA' ? 'QUEJA' : 'RECLAMO'}
                  </Text>
                  <Text style={styles.resultCode}>{result.data.code}</Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    result.data.status === 'RESOLVED' ? styles.badgeDone : styles.badgeOpen,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      result.data.status === 'RESOLVED'
                        ? styles.badgeTextDone
                        : styles.badgeTextOpen,
                    ]}
                  >
                    {STEPS.find((step) => step.status === result.data?.status)?.label ?? 'Recibido'}
                  </Text>
                </View>
              </View>

              <View style={styles.dates}>
                <View style={styles.dateItem}>
                  <Text style={styles.dateLabel}>PRESENTADO</Text>
                  <Text style={styles.dateValue}>{formatDate(result.data.createdAt)}</Text>
                </View>
                <View style={styles.dateItem}>
                  <Text style={styles.dateLabel}>RESPUESTA COMPROMETIDA</Text>
                  <Text style={styles.dateValue}>{formatDate(result.data.dueAt)}</Text>
                </View>
              </View>

              <View style={styles.timeline}>
                {STEPS.map((step, index) => {
                  const reached = index <= activeIndex;

                  return (
                    <View key={step.status} style={styles.step}>
                      <View style={styles.stepRail}>
                        <View style={[styles.stepDot, reached && styles.stepDotOn]}>
                          <MaterialCommunityIcons
                            name={step.icon}
                            size={18}
                            color={reached ? colors.surface : colors.inkMuted}
                          />
                        </View>
                        {index < STEPS.length - 1 ? (
                          <View style={[styles.stepLine, index < activeIndex && styles.stepLineOn]} />
                        ) : null}
                      </View>

                      <View style={styles.stepText}>
                        <Text style={[styles.stepLabel, reached && styles.stepLabelOn]}>
                          {step.label}
                        </Text>
                        <Text style={styles.stepCopy}>{step.copy}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {result.data.response ? (
                <View style={styles.answer}>
                  <View style={styles.answerHead}>
                    <MaterialCommunityIcons
                      name="shield-check-outline"
                      size={20}
                      color={colors.success}
                    />
                    <Text style={styles.answerTitle}>
                      Respuesta del negocio
                      {result.data.respondedAt ? ` · ${formatDate(result.data.respondedAt)}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.answerBody}>{result.data.response}</Text>
                </View>
              ) : (
                <View style={styles.pending}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color={colors.brand700} />
                  <Text style={styles.pendingText}>
                    Todavía estamos trabajando en tu caso. Te avisaremos por correo apenas tengamos
                    una respuesta.
                  </Text>
                </View>
              )}

              <Text style={styles.legalNotice}>
                Presentar un reclamo no impide acudir a INDECOPI ni a otros mecanismos de solución
                de controversias.
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Presentar un nuevo reclamo"
            onPress={() => router.push(SUPPORT_ROUTE)}
            style={({ pressed }) => [styles.newRow, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="book-plus-outline" size={22} color={colors.brand700} />
            <View style={styles.flex}>
              <Text style={styles.newTitle}>Presentar otra solicitud</Text>
              <Text style={styles.newCopy}>Vuelve al Libro de Reclamaciones</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkMuted} />
          </Pressable>
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
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardTitle: {
    ...type.heading,
    color: colors.ink,
  },
  cardCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  skeletonGap: {
    marginTop: spacing.md,
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: '#fff4f4',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#f3d3d3',
    padding: spacing.lg,
  },
  errorTitle: {
    ...type.heading,
    color: colors.ink,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorCopy: {
    ...type.body,
    color: colors.danger,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  errorHint: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorAction: {
    marginTop: spacing.md,
    minWidth: 180,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultEyebrow: {
    ...type.label,
    color: colors.brand600,
  },
  resultCode: {
    ...type.title,
    color: colors.ink,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  badgeOpen: {
    backgroundColor: colors.brand50,
  },
  badgeDone: {
    backgroundColor: '#e2f5ec',
  },
  badgeText: {
    ...type.label,
  },
  badgeTextOpen: {
    color: colors.brand700,
  },
  badgeTextDone: {
    color: colors.success,
  },
  dates: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  dateItem: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 12,
  },
  dateLabel: {
    ...type.caption,
    color: colors.inkMuted,
    letterSpacing: 0.4,
  },
  dateValue: {
    ...type.body,
    color: colors.ink,
    fontWeight: '800',
    marginTop: 3,
  },
  timeline: {
    marginTop: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  stepRail: {
    alignItems: 'center',
    width: 34,
  },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.line,
  },
  stepDotOn: {
    backgroundColor: colors.brand600,
  },
  stepLine: {
    flex: 1,
    width: 2,
    minHeight: 20,
    backgroundColor: colors.line,
  },
  stepLineOn: {
    backgroundColor: colors.brand600,
  },
  stepText: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  stepLabel: {
    ...type.body,
    color: colors.inkMuted,
    fontWeight: '800',
  },
  stepLabelOn: {
    color: colors.ink,
  },
  stepCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  answer: {
    backgroundColor: '#eef8f2',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#c8e6d6',
    padding: spacing.md,
  },
  answerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  answerTitle: {
    ...type.label,
    flex: 1,
    color: colors.success,
  },
  answerBody: {
    ...type.body,
    color: colors.ink,
    marginTop: spacing.sm,
    lineHeight: 24,
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pendingText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand800,
  },
  legalNotice: {
    ...type.caption,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: layout.minTouch + 16,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  newTitle: {
    ...type.body,
    color: colors.ink,
    fontWeight: '800',
  },
  newCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
