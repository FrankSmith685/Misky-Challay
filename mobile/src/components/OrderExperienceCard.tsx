import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PrimaryButton } from './PrimaryButton';
import { Skeleton } from './Skeleton';
import { useResource } from '../hooks/useResource';
import { useToast } from '../providers/ToastProvider';
import { experiencesApi, type ExperienceCustomer } from '../services/api/experiences.service';
import { env } from '../config/env';
import { colors, radius, spacing, type } from '../theme/tokens';

const LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En creación',
  AWAITING_APPROVAL: 'Pendiente de revisión',
  APPROVED: 'Aprobada',
  PUBLISHED: 'Publicada',
  PAUSED: 'Pausada',
  EXPIRED: 'Vencida',
};

export function OrderExperienceCard({ orderNumber }: { orderNumber: string }) {
  const toast = useToast();
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const resource = useResource<ExperienceCustomer | null>({
    key: orderNumber ? `experiences:order:${orderNumber}` : null,
    fetcher: () => experiencesApi.customer(orderNumber),
    cacheMs: 15_000,
  });

  const review = useCallback(async (approve: boolean) => {
    if (!resource.data) return;
    if (!approve && feedback.trim().length < 3) {
      toast.show({ tone: 'warning', message: 'Cuéntanos qué cambio necesitas para que el equipo pueda ayudarte.' });
      return;
    }
    setBusy(true);
    try {
      await experiencesApi.review(orderNumber, {
        expectedVersion: resource.data.version,
        approve,
        feedback: feedback.trim(),
      });
      setFeedback('');
      await resource.refetch();
      toast.show({ tone: 'success', message: approve ? 'Aprobaste la experiencia QR.' : 'Enviamos tus cambios al equipo.' });
    } catch (error) {
      toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos guardar tu respuesta.' });
    } finally {
      setBusy(false);
    }
  }, [feedback, orderNumber, resource, toast]);

  if (resource.loading && !resource.data) return <Skeleton height={170} rounded="lg" style={styles.skeleton} />;
  if (resource.error || !resource.data) return null;

  const experience = resource.data;
  const canReview = experience.status === 'AWAITING_APPROVAL' && Boolean(experience.scene);
  const publicUrl = experience.publicToken ? `${env.webUrl}/experiencias/${encodeURIComponent(experience.publicToken)}` : null;

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}><MaterialCommunityIcons name="qrcode" size={23} color={colors.surface} /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>EXPERIENCIA QR</Text>
          <Text style={styles.title}>{experience.package.name}</Text>
          <Text style={styles.status}>{LABELS[experience.status] ?? experience.status}</Text>
        </View>
      </View>

      <Text style={styles.copy}>
        {canReview ? 'Revisa la propuesta antes de publicarla.' : experience.status === 'PUBLISHED' ? 'Tu experiencia ya está disponible para compartir.' : 'El equipo está preparando tu propuesta.'}
      </Text>

      {publicUrl ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(publicUrl)} style={styles.link}>
          <MaterialCommunityIcons name="open-in-new" size={17} color={colors.brand700} />
          <Text style={styles.linkText}>Abrir experiencia publicada</Text>
        </Pressable>
      ) : null}

      {canReview ? (
        <>
          <TextInput
            value={feedback}
            onChangeText={setFeedback}
            placeholder="Comentarios opcionales o cambios que necesitas…"
            placeholderTextColor={colors.inkMuted}
            multiline
            maxLength={1000}
            style={styles.input}
          />
          <View style={styles.actions}>
            <PrimaryButton label="Pedir cambios" variant="secondary" disabled={busy} loading={busy} onPress={() => void review(false)} style={styles.action} />
            <PrimaryButton label="Aprobar" disabled={busy} loading={busy} onPress={() => void review(true)} style={styles.action} />
          </View>
        </>
      ) : experience.feedback ? <Text style={styles.feedback}>Tu comentario: {experience.feedback}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { marginTop: spacing.md },
  card: { marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand100, backgroundColor: colors.brand50, padding: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand700 },
  headingCopy: { flex: 1 },
  eyebrow: { ...type.caption, color: colors.brand700, fontWeight: '900', letterSpacing: 1 },
  title: { ...type.heading, color: colors.ink, marginTop: 2 },
  status: { ...type.caption, color: colors.inkMuted, marginTop: 2 },
  copy: { ...type.bodySm, color: colors.ink, marginTop: spacing.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: 7 },
  linkText: { ...type.bodySm, color: colors.brand700, fontWeight: '800', textDecorationLine: 'underline' },
  input: { minHeight: 86, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.sm, marginTop: spacing.sm, color: colors.ink, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
  feedback: { ...type.bodySm, color: colors.inkMuted, marginTop: spacing.sm },
});
