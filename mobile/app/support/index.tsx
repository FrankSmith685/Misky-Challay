import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Chip } from '../../src/components/Chip';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import {
  complaintsApi,
  type ComplaintInput,
  type ComplaintReceipt,
} from '../../src/services/api/complaints.service';
import { businessApi } from '../../src/services/api/business.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { PublicSettings } from '../../src/types/domain';

/**
 * Ayuda, documentos legales y Libro de Reclamaciones.
 *
 * La hoja que se envía es un documento legal, así que el formulario recoge lo
 * mismo que la web: tipo de documento (antes iba fijo a DNI, lo que hacía
 * imposible reclamar con carné de extranjería, pasaporte o RUC), si el consumidor
 * es menor de edad —antes el backend guardaba `false` por omisión, es decir una
 * afirmación que nadie había hecho—, el bien reclamado y el monto.
 */

type ComplaintType = ComplaintInput['type'];
type ItemType = ComplaintInput['itemType'];
type DocType = ComplaintInput['docType'];

interface DocRule {
  value: DocType;
  /** Etiqueta corta del chip: cuatro opciones tienen que caber en dos filas. */
  chip: string;
  name: string;
  hint: string;
  numeric: boolean;
  minLength: number;
  maxLength: number;
}

const DOC_RULES: readonly DocRule[] = [
  { value: 'DNI', chip: 'DNI', name: 'DNI', hint: '8 dígitos', numeric: true, minLength: 8, maxLength: 8 },
  {
    value: 'CE',
    chip: 'Carné ext.',
    name: 'Carné de extranjería',
    hint: 'Entre 8 y 12 caracteres',
    numeric: false,
    minLength: 8,
    maxLength: 12,
  },
  {
    value: 'PASAPORTE',
    chip: 'Pasaporte',
    name: 'Pasaporte',
    hint: 'Entre 6 y 12 caracteres',
    numeric: false,
    minLength: 6,
    maxLength: 12,
  },
  { value: 'RUC', chip: 'RUC', name: 'RUC', hint: '11 dígitos', numeric: true, minLength: 11, maxLength: 11 },
];

const TYPE_HELP: Record<ComplaintType, string> = {
  RECLAMO: 'Reclamo: disconformidad con el producto o el servicio recibido.',
  QUEJA: 'Queja: disconformidad con la atención, no con el producto en sí.',
};

const LEGAL_LINKS: ReadonlyArray<{
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  caption: string;
  to: Href;
}> = [
  {
    icon: 'shield-lock-outline',
    label: 'Privacidad',
    caption: 'Qué datos usamos',
    to: '/legal/privacidad' as Href,
  },
  {
    icon: 'file-document-outline',
    label: 'Términos',
    caption: 'Compras y planes',
    to: '/legal/terminos' as Href,
  },
  {
    icon: 'cellphone-cog',
    label: 'Almacenamiento',
    caption: 'Datos en tu teléfono',
    to: '/legal/cookies' as Href,
  },
  {
    icon: 'help-circle-outline',
    label: 'Preguntas frecuentes',
    caption: 'Dudas más comunes',
    to: '/legal/preguntas-frecuentes' as Href,
  },
];

const TRACK_ROUTE = '/support/track' as Href;
const ACCOUNT_ROUTE = '/account' as Href;

/**
 * La consulta de estado admite el código y el documento por la ruta para que el
 * comprobante recién emitido no obligue a teclearlos otra vez.
 */
const trackRouteFor = (code: string, docNumber: string): Href =>
  `/support/track?code=${encodeURIComponent(code)}&doc=${encodeURIComponent(docNumber)}` as Href;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Deja pasar dígitos y un único separador decimal con dos cifras como mucho. */
const sanitizeAmount = (raw: string): string => {
  const cleaned = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  const head = whole.slice(0, 7);
  if (rest.length === 0) return head;
  return `${head || '0'}.${rest.join('').slice(0, 2)}`;
};

type FieldKey =
  | 'name'
  | 'docNumber'
  | 'email'
  | 'guardianName'
  | 'claimedAmount'
  | 'detail'
  | 'request';

type Errors = Partial<Record<FieldKey, string>>;

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.segment}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segmentButton,
              active && styles.segmentActive,
              pressed && !active && styles.pressed,
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SupportScreen() {
  const { user } = useSession();
  const toast = useToast();

  const settings = useResource<PublicSettings>({
    key: 'settings:public',
    fetcher: () => businessApi.publicSettings(),
    cacheMs: 10 * 60_000,
  });

  // Se llama `complaintType` y no `type` para no tapar dentro del componente al
  // `type` de los tokens tipográficos, que se importa arriba.
  const [complaintType, setComplaintType] = useState<ComplaintType>('RECLAMO');
  const [itemType, setItemType] = useState<ItemType>('PRODUCTO');
  const [docType, setDocType] = useState<DocType>('DNI');
  const [name, setName] = useState([user?.firstName, user?.lastName].filter(Boolean).join(' '));
  const [docNumber, setDocNumber] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [address, setAddress] = useState('');
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [detail, setDetail] = useState('');
  const [request, setRequest] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ComplaintReceipt | null>(null);

  const rule = useMemo(
    () => DOC_RULES.find((entry) => entry.value === docType) ?? DOC_RULES[0],
    [docType],
  );

  const changeDocType = (next: DocType) => {
    setDocType(next);
    // El formato cambia con el tipo: mantener los dígitos del DNI dentro de un
    // campo de pasaporte solo produce un error del servidor más adelante.
    setDocNumber('');
    setErrors((current) => ({ ...current, docNumber: undefined }));
  };

  const changeDocNumber = (raw: string) => {
    const cleaned = rule.numeric
      ? raw.replace(/\D/g, '')
      : raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setDocNumber(cleaned.slice(0, rule.maxLength));
  };

  const openWhatsApp = async () => {
    const digits = (settings.data?.business.phone ?? '').replace(/\D/g, '');
    if (!digits) {
      toast.show({
        message: 'El negocio todavía no configuró su número de atención.',
        tone: 'warning',
      });
      return;
    }

    const text = encodeURIComponent(
      orderNumber.trim()
        ? `Hola Verde Bowl, necesito ayuda con el pedido ${orderNumber.trim()}.`
        : 'Hola Verde Bowl, necesito ayuda con mi compra.',
    );

    try {
      await Linking.openURL(`https://wa.me/${digits}?text=${text}`);
    } catch {
      toast.show({ message: 'No pudimos abrir WhatsApp en este dispositivo.', tone: 'error' });
    }
  };

  const validate = (): Errors => {
    const next: Errors = {};

    if (name.trim().length < 3) next.name = 'Escribe tu nombre completo.';

    if (docNumber.trim().length < rule.minLength) {
      next.docNumber = `Tu ${rule.name} necesita ${rule.hint.toLowerCase()}.`;
    }

    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Ingresa un correo válido.';

    if (isMinor && guardianName.trim().length < 3) {
      next.guardianName = 'Indica el nombre del padre, la madre o el apoderado.';
    }

    if (claimedAmount.trim() && !Number.isFinite(Number(claimedAmount))) {
      next.claimedAmount = 'Escribe solo el importe, sin letras.';
    }

    if (detail.trim().length < 10) next.detail = 'Cuéntanos con más detalle qué pasó.';
    if (request.trim().length < 5) next.request = 'Indica qué solución esperas.';

    return next;
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);

    if (Object.keys(found).length > 0) {
      toast.show({ message: 'Revisa los campos marcados.', tone: 'error', placement: 'top' });
      return;
    }

    setBusy(true);
    try {
      const amount = claimedAmount.trim() ? Number(claimedAmount) : undefined;
      const body: ComplaintInput = {
        type: complaintType,
        itemType,
        consumerName: name.trim(),
        docType,
        docNumber: docNumber.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        isMinor,
        guardianName: isMinor ? guardianName.trim() : undefined,
        itemDescription: itemDescription.trim() || undefined,
        claimedAmount: amount,
        detail: detail.trim(),
        request: request.trim(),
        orderNumber: orderNumber.trim() || undefined,
      };

      const created = await complaintsApi.submit(body);

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReceipt(created);
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos registrar la solicitud.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setReceipt(null);
    setDetail('');
    setRequest('');
    setItemDescription('');
    setClaimedAmount('');
    setOrderNumber('');
    setErrors({});
  };

  if (receipt) {
    const dueDate = new Date(receipt.dueAt);
    const dueLabel = Number.isNaN(dueDate.getTime())
      ? 'el plazo legal configurado'
      : `el ${dueDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

    return (
      <ScreenScaffold title="Solicitud registrada" showBack={false}>
        <ScrollView contentContainerStyle={styles.receiptContent} showsVerticalScrollIndicator={false}>
          <View style={styles.receiptIcon}>
            <MaterialCommunityIcons name="file-check-outline" size={44} color={colors.surface} />
          </View>

          <Text style={styles.receiptEyebrow}>LIBRO DE RECLAMACIONES</Text>
          <Text style={styles.receiptTitle}>
            Registramos tu {complaintType === 'QUEJA' ? 'queja' : 'reclamo'}
          </Text>
          <Text style={styles.receiptCopy}>
            Guarda este código: con él y tu {rule.name} puedes consultar la respuesta cuando quieras.
            Te enviamos una copia a {email.trim()} y responderemos como máximo {dueLabel}.
          </Text>

          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>CÓDIGO DE SEGUIMIENTO</Text>
            <Text style={styles.code}>{receipt.code}</Text>
            <Text style={styles.codeStatus}>Estado inicial: recibido</Text>
          </View>

          <PrimaryButton
            label="Consultar el estado"
            onPress={() => router.push(trackRouteFor(receipt.code, docNumber.trim()))}
            style={styles.receiptAction}
          />
          <PrimaryButton
            label="Presentar otra solicitud"
            variant="secondary"
            onPress={resetForm}
            style={styles.receiptAction}
          />
          <PrimaryButton
            label="Volver a mi cuenta"
            variant="ghost"
            onPress={() => router.replace(ACCOUNT_ROUTE)}
            style={styles.receiptAction}
          />

          <Text style={styles.legalNotice}>
            Presentar un reclamo no impide acudir a INDECOPI ni a otros mecanismos de solución de
            controversias.
          </Text>
        </ScrollView>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Ayuda y derechos" subtitle="Atención, documentos y reclamaciones">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Escribir por WhatsApp al negocio"
            onPress={() => void openWhatsApp()}
            style={({ pressed }) => [styles.whatsapp, pressed && styles.pressed]}
          >
            <View style={styles.whatsappIcon}>
              <MaterialCommunityIcons name="whatsapp" size={26} color={colors.surface} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.whatsappTitle}>Atención rápida por WhatsApp</Text>
              <Text style={styles.whatsappCopy}>
                Para una consulta operativa sobre un pedido. Si tienes el número, escríbelo abajo
                antes de abrir el chat.
              </Text>
            </View>
            <MaterialCommunityIcons name="open-in-new" size={20} color={colors.brand700} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Consultar el estado de un reclamo"
            onPress={() => router.push(TRACK_ROUTE)}
            style={({ pressed }) => [styles.trackRow, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="file-search-outline" size={24} color={colors.brand700} />
            <View style={styles.flex}>
              <Text style={styles.trackTitle}>¿Ya presentaste un reclamo?</Text>
              <Text style={styles.trackCopy}>Consulta su estado con tu código</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkMuted} />
          </Pressable>

          <Text style={styles.sectionLabel}>DOCUMENTOS</Text>
          <View style={styles.linkGrid}>
            {LEGAL_LINKS.map((link) => (
              <Pressable
                key={link.label}
                accessibilityRole="button"
                accessibilityLabel={link.label}
                onPress={() => router.push(link.to)}
                style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name={link.icon} size={24} color={colors.brand700} />
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkCaption}>{link.caption}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formEyebrow}>LIBRO DE RECLAMACIONES VIRTUAL</Text>
            <Text style={styles.formTitle}>Presentar una solicitud formal</Text>
            {settings.data ? (
              <Text style={styles.formCopy}>
                {settings.data.business.legalName} · RUC {settings.data.business.ruc} ·{' '}
                {settings.data.business.address}
              </Text>
            ) : null}

            <Text style={styles.fieldLabel}>Tipo de solicitud</Text>
            <Segmented
              accessibilityLabel="Tipo de solicitud"
              value={complaintType}
              onChange={setComplaintType}
              options={[
                { value: 'RECLAMO', label: 'Reclamo' },
                { value: 'QUEJA', label: 'Queja' },
              ]}
            />
            <Text style={styles.fieldHelp}>{TYPE_HELP[complaintType]}</Text>

            <Text style={styles.fieldLabel}>¿Sobre qué reclamas?</Text>
            <Segmented
              accessibilityLabel="Bien contratado"
              value={itemType}
              onChange={setItemType}
              options={[
                { value: 'PRODUCTO', label: 'Un producto' },
                { value: 'SERVICIO', label: 'Un servicio' },
              ]}
            />

            <Text style={styles.groupTitle}>Tus datos</Text>

            <FormField
              label="Nombre completo"
              value={name}
              onChangeText={setName}
              error={errors.name}
              icon="account-outline"
              autoCapitalize="words"
              autoComplete="name"
            />

            <Text style={styles.fieldLabel}>Tipo de documento</Text>
            <View style={styles.docTypes}>
              {DOC_RULES.map((entry) => (
                <Chip
                  key={entry.value}
                  label={entry.chip}
                  selected={entry.value === docType}
                  onPress={() => changeDocType(entry.value)}
                />
              ))}
            </View>

            <FormField
              label={`Número de ${rule.name}`}
              value={docNumber}
              onChangeText={changeDocNumber}
              error={errors.docNumber}
              hint={rule.hint}
              keyboardType={rule.numeric ? 'number-pad' : 'default'}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={rule.maxLength}
              icon="card-account-details-outline"
            />

            <FormField
              label="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              hint="Ahí recibirás la copia y la respuesta"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              icon="email-outline"
            />

            <FormField
              label="Teléfono (opcional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              icon="phone-outline"
            />

            <FormField
              label="Dirección (opcional)"
              value={address}
              onChangeText={setAddress}
              icon="map-marker-outline"
            />

            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.switchTitle}>El consumidor es menor de edad</Text>
                <Text style={styles.switchCopy}>
                  Si activas esto tendrás que indicar quién lo representa.
                </Text>
              </View>
              <Switch
                accessibilityLabel="El consumidor es menor de edad"
                value={isMinor}
                onValueChange={(value) => {
                  void Haptics.selectionAsync();
                  setIsMinor(value);
                  if (!value) setErrors((current) => ({ ...current, guardianName: undefined }));
                }}
                trackColor={{ false: colors.line, true: colors.brand100 }}
                thumbColor={isMinor ? colors.brand600 : colors.surface}
              />
            </View>

            {isMinor ? (
              <FormField
                label="Nombre del padre, madre o apoderado"
                value={guardianName}
                onChangeText={setGuardianName}
                error={errors.guardianName}
                autoCapitalize="words"
                icon="account-child-outline"
              />
            ) : null}

            <Text style={styles.groupTitle}>Detalle</Text>

            <FormField
              label="Número de pedido (opcional)"
              value={orderNumber}
              onChangeText={(value) => setOrderNumber(value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              placeholder="VB-XXXX-0000"
              icon="receipt-text-outline"
            />

            <FormField
              label={`${itemType === 'PRODUCTO' ? 'Producto' : 'Servicio'} contratado (opcional)`}
              value={itemDescription}
              onChangeText={setItemDescription}
              maxLength={255}
              icon="bowl-mix-outline"
            />

            <FormField
              label="Monto reclamado (opcional)"
              value={claimedAmount}
              onChangeText={(value) => setClaimedAmount(sanitizeAmount(value))}
              error={errors.claimedAmount}
              hint="En soles, solo si reclamas un importe"
              keyboardType="decimal-pad"
              icon="cash"
            />

            <FormField
              label="¿Qué ocurrió?"
              value={detail}
              onChangeText={setDetail}
              error={errors.detail}
              hint={`${detail.length}/3000 caracteres`}
              multiline
              maxLength={3000}
              style={styles.textArea}
              icon="text-box-outline"
            />

            <FormField
              label="¿Qué solución esperas?"
              value={request}
              onChangeText={setRequest}
              error={errors.request}
              multiline
              maxLength={2000}
              style={styles.textAreaSm}
              icon="hand-heart-outline"
            />

            <PrimaryButton
              label="Registrar en el Libro"
              loading={busy}
              onPress={() => void submit()}
              style={styles.submit}
            />

            <Text style={styles.legalNotice}>
              Conforme al Código de Protección y Defensa del Consumidor. Presentar un reclamo no
              impide acudir a INDECOPI ni a otros mecanismos de solución.
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
    paddingBottom: spacing.xxl,
  },
  whatsapp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: '#eaf9ef',
    borderWidth: 1,
    borderColor: '#bce7ca',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  whatsappIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#168c4b',
  },
  whatsappTitle: {
    ...type.body,
    color: '#0f5230',
    fontWeight: '800',
  },
  whatsappCopy: {
    ...type.bodySm,
    color: '#3a6a51',
    marginTop: 3,
  },
  trackRow: {
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
    marginTop: spacing.sm + spacing.xs,
    ...shadow.sm,
  },
  trackTitle: {
    ...type.body,
    color: colors.ink,
    fontWeight: '800',
  },
  trackCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  sectionLabel: {
    ...type.label,
    color: colors.inkMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  linkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + spacing.xs,
  },
  linkCard: {
    // Dos por fila: la mitad del ancho menos la mitad del hueco de 12.
    width: '48%',
    flexGrow: 1,
    minHeight: 108,
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    ...shadow.sm,
  },
  linkLabel: {
    ...type.body,
    color: colors.ink,
    fontWeight: '800',
  },
  linkCaption: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  formCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginTop: spacing.lg,
    ...shadow.sm,
  },
  formEyebrow: {
    ...type.label,
    color: colors.brand600,
  },
  formTitle: {
    ...type.title,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  formCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  fieldLabel: {
    ...type.body,
    color: colors.ink,
    fontWeight: '800',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  fieldHelp: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  groupTitle: {
    ...type.heading,
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 2,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  segmentText: {
    ...type.body,
    color: colors.inkMuted,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.brand700,
    fontWeight: '800',
  },
  docTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.minTouch + 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
  },
  switchTitle: {
    ...type.body,
    color: colors.ink,
    fontWeight: '700',
  },
  switchCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  textAreaSm: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  submit: {
    marginTop: spacing.sm,
  },
  legalNotice: {
    ...type.caption,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: spacing.md,
  },
  receiptContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.lg,
  },
  receiptIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.lg + 6,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  receiptEyebrow: {
    ...type.label,
    color: colors.brand600,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  receiptTitle: {
    ...type.display,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  receiptCopy: {
    ...type.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  codeCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  codeLabel: {
    ...type.label,
    color: colors.onDarkMuted,
  },
  code: {
    ...type.display,
    color: colors.onDark,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  codeStatus: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: spacing.xs,
  },
  receiptAction: {
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
