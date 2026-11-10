import { CustomerPoliciesSettings } from '../components/CustomerPoliciesSettings';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bell,
  Building2,
  CheckCircle2,
  FileCheck2,
  History,
  KeyRound,
  QrCode,
  Mail,
  PlugZap,
  Printer,
  RefreshCw,
  ReceiptText,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { LoadError } from '@components/common/LoadError';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { Alert } from '@components/ui/Alert';
import { Button } from '@components/ui/Button';
import { FormGrid, FormSection } from '@components/ui/FormSection';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Switch } from '@components/ui/Switch';
import { cn } from '@lib/cn';
import { formatDate } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { refreshBusinessInfo, type BusinessInfo } from '@services/businessInfo';
import { isValidRuc } from '@lib/peruDocs';
import { isDemoDirectQr } from '@features/checkout/directPayments';
import {
  settingsAdminApi,
  type BusinessSettingsState,
  type CommunicationSettingsInput,
  type CommunicationSettingsState,
  type NotificationOverview,
  type LocalPaymentSettings,
  type LocalPaymentSettingsState,
  type ReceiptSettings,
  type ReceiptSettingsState,
  type IntegrationStatus,
  type SettingRevision,
} from '../services/settingsAdmin.service';

type TabId = 'business' | 'payments' | 'receipts' | 'communication' | 'integrations' | 'history' | 'terms';
type BusinessErrors = Partial<Record<keyof BusinessInfo, string>>;
type CommunicationErrors = Partial<Record<'smtpPort' | 'fromEmail' | 'fromName' | 'replyToEmail', string>>;

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const validateBusiness = (business: BusinessInfo): BusinessErrors => {
  const errors: BusinessErrors = {};
  if (business.legalName.trim().length < 3) errors.legalName = 'Ingresa la razón social completa';
  if (business.commercialName.trim().length < 2) errors.commercialName = 'Ingresa el nombre comercial';
  if (!isValidRuc(business.ruc)) errors.ruc = 'Ingresa un RUC peruano válido';
  if (business.address.trim().length < 8) errors.address = 'Ingresa el domicilio legal completo';
  if (business.phone.trim().length < 6) errors.phone = 'Ingresa un teléfono válido';
  if (!EMAIL_PATTERN.test(business.email)) errors.email = 'Ingresa un correo válido';
  if (!EMAIL_PATTERN.test(business.supportEmail)) errors.supportEmail = 'Ingresa un correo válido';
  if (business.complaintResponseDays < 1 || business.complaintResponseDays > 15) {
    errors.complaintResponseDays = 'Debe estar entre 1 y 15 días hábiles';
  }
  if (!business.timeZone.trim()) errors.timeZone = 'Selecciona una zona horaria';
  if (business.currency !== 'PEN') errors.currency = 'La operación actual solo admite PEN';
  if (business.taxRate < 0 || business.taxRate > 1) errors.taxRate = 'Usa un porcentaje entre 0% y 100%';
  if (business.platformCommissionRate < 0 || business.platformCommissionRate > 1) errors.platformCommissionRate = 'Usa una comisión entre 0% y 100%';
  return errors;
};

const validateCommunication = (form: CommunicationSettingsInput): CommunicationErrors => {
  const errors: CommunicationErrors = {};
  if (form.smtpPort < 1 || form.smtpPort > 65535) errors.smtpPort = 'Usa un puerto entre 1 y 65535';
  if (!EMAIL_PATTERN.test(form.fromEmail)) errors.fromEmail = 'Ingresa un remitente válido';
  if (form.fromName.trim().length < 2) errors.fromName = 'Ingresa el nombre del remitente';
  if (form.replyToEmail && !EMAIL_PATTERN.test(form.replyToEmail)) errors.replyToEmail = 'Ingresa un correo válido';
  return errors;
};

const toCommunicationForm = (state: CommunicationSettingsState): CommunicationSettingsInput => ({
  emailNotificationsEnabled: state.communication.emailNotificationsEnabled,
  inAppNotificationsEnabled: state.communication.inAppNotificationsEnabled,
  orderUpdatesEnabled: state.communication.orderUpdatesEnabled,
  whatsappUpdatesEnabled: state.communication.whatsappUpdatesEnabled,
  planUpdatesEnabled: state.communication.planUpdatesEnabled,
  staffAccessEnabled: state.communication.staffAccessEnabled,
  availabilityAlertsEnabled: state.communication.availabilityAlertsEnabled,
  availabilityEmailSubject: state.communication.availabilityEmailSubject,
  availabilityEmailBody: state.communication.availabilityEmailBody,
  smtpHost: state.communication.smtpHost,
  smtpPort: state.communication.smtpPort,
  smtpSecure: state.communication.smtpSecure,
  smtpUser: state.communication.smtpUser,
  fromEmail: state.communication.fromEmail,
  fromName: state.communication.fromName,
  replyToEmail: state.communication.replyToEmail,
  smtpPassword: '',
  clearSmtpPassword: false,
});

/** El formato lo pone `lib/format`; aqui solo se resuelve el caso "todavia no pasó". */
const formatStamp = (value: string | null | undefined) => (value ? formatDate(value) : 'Sin registro');

const BusinessSettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: TabId = ['payments', 'receipts', 'communication', 'integrations', 'history', 'terms'].includes(requestedTab ?? '') ? requestedTab as TabId : 'business';
  const setActiveTab = (tab: TabId) => setSearchParams({ tab }, { replace: true });
  const [businessState, setBusinessState] = useState<BusinessSettingsState | null>(null);
  const [businessForm, setBusinessForm] = useState<BusinessInfo | null>(null);
  const [communicationState, setCommunicationState] = useState<CommunicationSettingsState | null>(null);
  const [communicationForm, setCommunicationForm] = useState<CommunicationSettingsInput | null>(null);
  const [localPaymentState, setLocalPaymentState] = useState<LocalPaymentSettingsState | null>(null);
  const [localPaymentForm, setLocalPaymentForm] = useState<LocalPaymentSettings | null>(null);
  const [receiptState, setReceiptState] = useState<ReceiptSettingsState | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptSettings | null>(null);
  const [history, setHistory] = useState<NotificationOverview | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [integrationsError, setIntegrationsError] = useState('');
  const [settingRevisions, setSettingRevisions] = useState<SettingRevision[]>([]);
  const [businessErrors, setBusinessErrors] = useState<BusinessErrors>({});
  const [communicationErrors, setCommunicationErrors] = useState<CommunicationErrors>({});
  const [testRecipient, setTestRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await settingsAdminApi.getNotificationHistory());
      setSettingRevisions(await settingsAdminApi.revisions('business'));
      setHistoryError('');
    } catch (error) {
      // Sin esto, un historial caido se leia como "todavia no existen envios".
      setHistory(null);
      setHistoryError(getApiErrorMessage(error));
    }
  }, []);

  const loadIntegrations = useCallback(async () => {
    try {
      setIntegrations(await settingsAdminApi.getIntegrations());
      setIntegrationsError('');
    } catch (error) {
      setIntegrations(null);
      setIntegrationsError(getApiErrorMessage(error));
    }
  }, []);

  /**
   * El historial va aparte de los dos bloques configurables: es informativo, y
   * arrastrar toda la pantalla a un error por un `Promise.all` que incluia una
   * consulta accesoria era parte de por que el superadmin veia el area vacia.
   */
  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [business, communication, localPayments, receipts] = await Promise.all([
        settingsAdminApi.getBusiness(),
        settingsAdminApi.getCommunication(),
        settingsAdminApi.getLocalPayments(),
        settingsAdminApi.getReceipts(),
      ]);
      setBusinessState(business);
      setBusinessForm(business.business);
      setCommunicationState(communication);
      setCommunicationForm(toCommunicationForm(communication));
      setLocalPaymentState(localPayments);
      setLocalPaymentForm(localPayments.localPayments);
      setReceiptState(receipts);
      setReceiptForm(receipts.receipts);
      setTestRecipient(business.business.email);
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
    await loadHistory();
    await loadIntegrations();
  }, [loadHistory, loadIntegrations]);

  useEffect(() => { void load(); }, [load]);

  const businessDirty = useMemo(
    () => Boolean(businessForm && businessState && JSON.stringify(businessForm) !== JSON.stringify(businessState.business)),
    [businessForm, businessState],
  );
  const communicationDirty = useMemo(
    () => Boolean(
      communicationForm
      && communicationState
      && JSON.stringify(communicationForm) !== JSON.stringify(toCommunicationForm(communicationState)),
    ),
    [communicationForm, communicationState],
  );
  const localPaymentDirty = useMemo(
    () => Boolean(localPaymentForm && localPaymentState && JSON.stringify(localPaymentForm) !== JSON.stringify(localPaymentState.localPayments)),
    [localPaymentForm, localPaymentState],
  );
  const receiptDirty = useMemo(
    () => Boolean(receiptForm && receiptState && JSON.stringify(receiptForm) !== JSON.stringify(receiptState.receipts)),
    [receiptForm, receiptState],
  );

  if (isLoading) return <PageLoader />;
  /* Antes esto era `return null`: si la carga fallaba, el superadmin se quedaba
   * mirando un area LITERALMENTE vacia, sin mensaje y sin forma de reintentar. */
  if (!businessForm || !businessState || !communicationForm || !communicationState || !localPaymentForm || !localPaymentState || !receiptForm || !receiptState) {
    return (
      <div className="mx-auto max-w-8xl">
        <PageHeader
          eyebrow="Configuración central"
          title="Negocio y comunicaciones"
          description="Administra desde un solo lugar los datos legales, el correo saliente y los avisos que recibe cada usuario."
          icon={ShieldCheck}
        />
        <LoadError
          title="No pudimos cargar la configuración"
          message={loadError || 'El servidor no devolvió los datos del negocio.'}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const changeBusiness = <K extends keyof BusinessInfo>(field: K, value: BusinessInfo[K]) => {
    setBusinessForm((current) => (current ? { ...current, [field]: value } : current));
    setBusinessErrors((current) => ({ ...current, [field]: undefined }));
  };

  const changeCommunication = <K extends keyof CommunicationSettingsInput>(
    field: K,
    value: CommunicationSettingsInput[K],
  ) => {
    setCommunicationForm((current) => (current ? { ...current, [field]: value } : current));
    setCommunicationErrors((current) => ({ ...current, [field]: undefined }));
  };

  const changeLocalPayment = <K extends keyof LocalPaymentSettings>(field: K, value: LocalPaymentSettings[K]) => {
    setLocalPaymentForm((current) => (current ? { ...current, [field]: value } : current));
  };

  const changeReceipt = <K extends keyof ReceiptSettings>(field: K, value: ReceiptSettings[K]) => {
    setReceiptForm((current) => (current ? { ...current, [field]: value } : current));
  };

  const saveReceipts = async () => {
    setIsSaving(true);
    try {
      const updated = await settingsAdminApi.updateReceipts(receiptForm, receiptState.isConfigured ? receiptState.version : undefined);
      setReceiptState(updated);
      setReceiptForm(updated.receipts);
      toast.success('Modo de tickets actualizado');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const saveLocalPayments = async () => {
    const paymentMinutes = localPaymentForm.paymentWindowMinutes ?? 15;
    const reviewMinutes = localPaymentForm.reviewAlertMinutes ?? 10;
    if (!Number.isInteger(paymentMinutes) || paymentMinutes < 5 || paymentMinutes > 120) return toast.error('El plazo para pagar debe estar entre 5 y 120 minutos.');
    if (!Number.isInteger(reviewMinutes) || reviewMinutes < 1 || reviewMinutes > 120) return toast.error('El aviso a caja debe estar entre 1 y 120 minutos.');
    for (const provider of ['yape', 'plin'] as const) {
      if (!localPaymentForm[`${provider}Enabled`]) continue;
      if (localPaymentForm[`${provider}Phone`].replace(/\D/g, '').length < 9) return toast.error(`Completa el telefono de ${provider === 'yape' ? 'Yape' : 'Plin'}`);
      if (localPaymentForm[`${provider}Recipient`].trim().length < 3) return toast.error(`Completa el titular de ${provider === 'yape' ? 'Yape' : 'Plin'}`);
    }
    setIsSaving(true);
    try {
      const updated = await settingsAdminApi.updateLocalPayments(localPaymentForm, localPaymentState.isConfigured ? localPaymentState.version : undefined);
      setLocalPaymentState(updated);
      setLocalPaymentForm(updated.localPayments);
      await refreshBusinessInfo();
      toast.success('Yape y Plin publicados en el checkout');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const saveBusiness = async () => {
    const errors = validateBusiness(businessForm);
    setBusinessErrors(errors);
    if (Object.keys(errors).length) return toast.error('Revisa los datos del negocio');

    setIsSaving(true);
    try {
      const updated = await settingsAdminApi.updateBusiness(businessForm, businessState.isConfigured ? businessState.version : undefined);
      setBusinessState(updated);
      setBusinessForm(updated.business);
      await refreshBusinessInfo();
      toast.success('Datos del negocio publicados en toda la web');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const persistCommunication = async (showSuccess = true): Promise<boolean> => {
    const errors = validateCommunication(communicationForm);
    setCommunicationErrors(errors);
    if (Object.keys(errors).length) {
      toast.error('Revisa la configuración de correo');
      return false;
    }

    setIsSaving(true);
    try {
      const updated = await settingsAdminApi.updateCommunication(communicationForm, communicationState.isConfigured ? communicationState.version : undefined);
      setCommunicationState(updated);
      setCommunicationForm(toCommunicationForm(updated));
      if (showSuccess) toast.success('Correo y notificaciones actualizados');
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const testEmail = async () => {
    if (!EMAIL_PATTERN.test(testRecipient)) return toast.error('Ingresa un destinatario válido');
    setIsTesting(true);
    try {
      if (communicationDirty && !(await persistCommunication(false))) return;
      const result = await settingsAdminApi.sendTestEmail(testRecipient);
      toast.success(result.provider === 'console' ? 'Prueba generada en la consola del servidor' : 'Correo de prueba enviado');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsTesting(false);
    }
  };

  const refreshHistory = async () => {
    setIsRefreshing(true);
    await loadHistory();
    setIsRefreshing(false);
  };

  const rollbackBusiness = async (revision: SettingRevision) => {
    if (!businessState || !window.confirm(`¿Restaurar la versión ${revision.version} de los datos del negocio?`)) return;
    setIsRefreshing(true);
    try { await settingsAdminApi.rollback('business', revision.id, businessState.version); await load(); toast.success('Versión restaurada'); }
    catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setIsRefreshing(false); }
  };

  const refreshIntegrations = async () => {
    setIsRefreshing(true);
    try { setIntegrations(await settingsAdminApi.checkIntegrations()); toast.success('Integraciones comprobadas'); }
    catch (error) { setIntegrationsError(getApiErrorMessage(error)); }
    finally { setIsRefreshing(false); }
  };

  const tabs: Array<{ id: TabId; label: string; icon: typeof Building2 }> = [
    { id: 'business', label: 'Datos del negocio', icon: Building2 },
    { id: 'terms', label: 'Términos y condiciones', icon: FileCheck2 },
    { id: 'payments', label: 'Yape y Plin', icon: QrCode },
    { id: 'receipts', label: 'Tickets', icon: ReceiptText },
    { id: 'communication', label: 'Correo y avisos', icon: SlidersHorizontal },
    { id: 'integrations', label: 'Integraciones', icon: PlugZap },
    { id: 'history', label: 'Historial', icon: History },
  ];

  const deliveryStatus = communicationState.communication.deliveryMode;

  return (
    <div className="mx-auto max-w-8xl">
      <PageHeader
        eyebrow="Configuración central"
        title="Negocio y comunicaciones"
        description="Administra desde un solo lugar los datos legales, el correo saliente y los avisos que recibe cada usuario."
        icon={ShieldCheck}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={QrCode}
          label="Pagos móviles"
          value={localPaymentForm.yapeEnabled || localPaymentForm.plinEnabled ? 'Disponibles' : 'Por configurar'}
          tone={localPaymentForm.yapeEnabled || localPaymentForm.plinEnabled ? 'success' : 'warning'}
        />
        <StatusCard
          icon={FileCheck2}
          label="Datos públicos"
          value={businessState.isConfigured ? 'Configurados' : 'Pendientes'}
          tone={businessState.isConfigured ? 'success' : 'warning'}
        />
        <StatusCard
          icon={Mail}
          label="Entrega de correo"
          value={deliveryStatus === 'smtp' ? 'SMTP activo' : deliveryStatus === 'console' ? 'Modo desarrollo' : 'No disponible'}
          tone={deliveryStatus === 'smtp' ? 'success' : 'warning'}
        />
        <StatusCard
          icon={Bell}
          label="Avisos en la web"
          value={communicationForm.inAppNotificationsEnabled ? 'Activos' : 'Desactivados'}
          tone={communicationForm.inAppNotificationsEnabled ? 'success' : 'warning'}
        />
      </div>

      <nav aria-label="Secciones de configuración" className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-card border border-line bg-white p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex min-h-10 shrink-0 items-center gap-2 rounded-field px-3 text-sm font-bold transition-colors sm:flex-1 sm:justify-center',
              activeTab === id ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      {activeTab === 'terms' && <CustomerPoliciesSettings />}

      {activeTab === 'business' && (
        <div className="grid gap-4">
          <Alert variant={businessState.isConfigured ? 'success' : 'warning'} className="rounded-card" title={businessState.isConfigured ? 'Información publicada' : 'Completa la configuración inicial'}>
            {businessState.isConfigured
              ? `Última actualización: ${formatStamp(businessState.updatedAt)}. Los cambios se reflejan en el footer, documentos legales y Libro de Reclamaciones.`
              : 'Se muestran valores de respaldo de .env. Reemplázalos por los datos reales antes de publicar.'}
          </Alert>

          <FormSection icon={FileCheck2} title="Identificación del proveedor" description="Información oficial visible para clientes y autoridades.">
            <FormGrid>
              <Input label="Razón social" value={businessForm.legalName} error={businessErrors.legalName} onChange={(event) => changeBusiness('legalName', event.target.value)} />
              <Input label="Nombre comercial" value={businessForm.commercialName} error={businessErrors.commercialName} onChange={(event) => changeBusiness('commercialName', event.target.value)} />
              <Input label="RUC" inputMode="numeric" maxLength={11} value={businessForm.ruc} error={businessErrors.ruc} onChange={(event) => changeBusiness('ruc', event.target.value.replace(/\D/g, '').slice(0, 11))} />
            </FormGrid>
            <div className="pt-4">
              <Input label="Domicilio legal" value={businessForm.address} error={businessErrors.address} onChange={(event) => changeBusiness('address', event.target.value)} />
            </div>
          </FormSection>

          <FormSection icon={Mail} title="Canales oficiales" description="Correos y teléfono publicados en atención, privacidad y reclamos.">
            <FormGrid>
              <Input label="Teléfono" value={businessForm.phone} error={businessErrors.phone} onChange={(event) => changeBusiness('phone', event.target.value)} />
              <Input label="Correo general" type="email" value={businessForm.email} error={businessErrors.email} onChange={(event) => changeBusiness('email', event.target.value)} />
              <Input label="Correo de soporte, privacidad y reclamos" type="email" value={businessForm.supportEmail} error={businessErrors.supportEmail} onChange={(event) => changeBusiness('supportEmail', event.target.value)} />
              <Input label="Respuesta de reclamos (días hábiles)" type="number" min={1} max={15} value={businessForm.complaintResponseDays} error={businessErrors.complaintResponseDays} onChange={(event) => changeBusiness('complaintResponseDays', Number(event.target.value))} />
            </FormGrid>
          </FormSection>

          <FormSection icon={SlidersHorizontal} title="Política operativa" description="Estos valores se congelan en cada pedido para que el desglose tributario sea trazable. Los horarios de atención se gestionan por sucursal en Cobertura.">
            <FormGrid>
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Zona horaria predeterminada
                <select className="h-11 rounded-field border border-line bg-white px-3 text-sm font-normal text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" value={businessForm.timeZone} onChange={(event) => changeBusiness('timeZone', event.target.value)}>
                  <option value="America/Lima">America/Lima (Perú)</option>
                  <option value="America/Bogota">America/Bogota (Colombia)</option>
                  <option value="America/Santiago">America/Santiago (Chile)</option>
                  <option value="America/Mexico_City">America/Mexico_City (México)</option>
                  <option value="America/New_York">America/New_York (Este de EE. UU.)</option>
                  <option value="UTC">UTC</option>
                </select>
                {businessErrors.timeZone && <span className="text-xs font-medium text-red-700">{businessErrors.timeZone}</span>}
              </label>
                <Input label="IGV / impuesto incluido (%)" type="number" min={0} max={100} step={0.01} value={Number((businessForm.taxRate * 100).toFixed(2))} error={businessErrors.taxRate} onChange={(event) => changeBusiness('taxRate', Number(event.target.value) / 100)} />
                <Input label="Comisión de plataforma (%)" type="number" min={0} max={100} step={0.01} value={Number((businessForm.platformCommissionRate * 100).toFixed(2))} error={businessErrors.platformCommissionRate} hint="Se aplica a nuevos cobros; las liquidaciones existentes conservan su tasa." onChange={(event) => changeBusiness('platformCommissionRate', Number(event.target.value) / 100)} />
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Moneda operativa
                <select disabled className="h-11 rounded-field border border-line bg-surface-muted px-3 text-sm font-normal text-ink" value={businessForm.currency} onChange={(event) => changeBusiness('currency', event.target.value)}>
                  <option value="PEN">PEN · Sol peruano</option>
                </select>
                {businessErrors.currency && <span className="text-xs font-medium text-red-700">{businessErrors.currency}</span>}
              </label>
            </FormGrid>
            <p className="mt-3 text-xs leading-5 text-ink-muted">La moneda permanece en PEN porque Yape, Plin, Mercado Pago y los saldos actuales operan en soles. La zona horaria de cada sucursal puede sobrescribir este valor desde Cobertura.</p>
            <div className="mt-3"><Link to="/admin/cobertura" className="text-sm font-bold text-brand-700 underline">Gestionar horarios, feriados y excepciones por sucursal</Link></div>
          </FormSection>

          <SaveBar dirty={businessDirty || !businessState.isConfigured} loading={isSaving} onSave={() => void saveBusiness()} />
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="grid gap-4">
          <Alert variant={localPaymentState.isConfigured ? 'success' : 'warning'} className="rounded-card" title={localPaymentState.isConfigured ? 'Configuración publicada' : 'Configura tus cuentas reales'}>
            Una cuenta por método para todo el taller. El cliente verá sus datos después de crear el pedido. Caja verificará el movimiento antes de confirmar el pago.
          </Alert>

          <div className="flex justify-end"><Button size="sm" variant="outline" leftIcon={<ShieldCheck className="size-4" />} isLoading={isRefreshing} onClick={async () => { setIsRefreshing(true); try { const result = await settingsAdminApi.checkLocalPayments(); const invalid = result.providers.filter((item) => item.enabled && !item.valid); toast[invalid.length ? 'warning' : 'success'](invalid.length ? 'Hay métodos de pago incompletos' : 'Yape y Plin están correctamente configurados'); } catch (error) { toast.error(getApiErrorMessage(error)); } finally { setIsRefreshing(false); } }}>Comprobar cuentas</Button></div>

          {(['yape', 'plin'] as const).map((provider) => {
            const name = provider === 'yape' ? 'Yape' : 'Plin';
            return (
              <FormSection key={provider} icon={QrCode} title={name} description={`Número, titular y QR oficial de la cuenta ${name} del negocio.`}>
                <Switch
                  checked={localPaymentForm[`${provider}Enabled`]}
                  onChange={(value) => changeLocalPayment(`${provider}Enabled`, value)}
                  label={`Aceptar ${name} en pedidos`}
                  description="Los pagos quedarán pendientes hasta que Caja los contraste y apruebe."
                />
                <div className="pt-4"><FormGrid>
                  <Input label="Teléfono asociado" value={localPaymentForm[`${provider}Phone`]} placeholder="999 999 999" onChange={(event) => changeLocalPayment(`${provider}Phone`, event.target.value)} />
                  <Input label="Titular visible" value={localPaymentForm[`${provider}Recipient`]} placeholder="Misky Challay S.A.C." onChange={(event) => changeLocalPayment(`${provider}Recipient`, event.target.value)} />
                  <Input label="URL pública de la imagen QR (opcional)" value={localPaymentForm[`${provider}QrImageUrl`]} placeholder="https://.../qr.png" onChange={(event) => changeLocalPayment(`${provider}QrImageUrl`, event.target.value)} />
                </FormGrid></div>
                {localPaymentForm[`${provider}QrImageUrl`] && <div className="mt-4 flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface-muted p-3">
                  <img src={localPaymentForm[`${provider}QrImageUrl`]} alt={`QR de ${name}`} className="h-44 w-40 rounded-card bg-white object-contain" />
                  <p className="max-w-md text-xs leading-5 text-ink-muted">{isDemoDirectQr(localPaymentForm[`${provider}QrImageUrl`])
                    ? 'QR de demostración: no admite pagos. El cliente puede transferir al número publicado. Reemplaza esta imagen por el QR oficial de cobro cuando lo tengas.'
                    : `El cliente verá este QR al continuar con ${name}.`}</p>
                </div>}
              </FormSection>
            );
          })}

          <FormSection icon={ShieldCheck} title="Instrucción al cliente" description="Mensaje mostrado junto al importe y el campo del código de operación.">
            <Textarea value={localPaymentForm.instructions} maxLength={500} onChange={(event) => changeLocalPayment('instructions', event.target.value)} />
            <div className="mt-4"><FormGrid>
              <Input label="Plazo para pagar (minutos)" type="number" min={5} max={120} value={localPaymentForm.paymentWindowMinutes ?? 15} onChange={(event) => changeLocalPayment('paymentWindowMinutes', Number(event.target.value))} />
              <Input label="Aviso a caja tras (minutos)" type="number" min={1} max={120} value={localPaymentForm.reviewAlertMinutes ?? 10} onChange={(event) => changeLocalPayment('reviewAlertMinutes', Number(event.target.value))} />
            </FormGrid></div>
            <p className="mt-3 text-xs text-ink-muted">El aviso destaca revisiones demoradas. Un reporte en revisión o con una corrección solicitada conserva su reserva y no se cancela por vencer el plazo de pago.</p>
          </FormSection>
          <SaveBar dirty={localPaymentDirty || !localPaymentState.isConfigured} loading={isSaving} onSave={() => void saveLocalPayments()} />
        </div>
      )}

      {activeTab === 'receipts' && (
        <div className="grid gap-4">
          <Alert variant="info" className="rounded-card" title="Ticket interno separado de SUNAT">
            En el modo seleccionado el pedido usa su propio numero como identificador. El documento se marca claramente como interno y nunca se presenta como boleta o factura.
          </Alert>

          <FormSection icon={ReceiptText} title="Modo de documentos" description="Define el flujo principal visible para Caja, Cocina y administracion.">
            <div className="grid gap-3 md:grid-cols-3">
              {([
                ['INTERNAL_ONLY', 'Solo ticket interno', 'Resumen operativo imprimible. No es comprobante de pago.'],
                ['EXTERNAL_MANUAL', 'CPE externo manual', 'La emision ocurre fuera y aqui se registra su constancia.'],
                ['INTEGRATED', 'Integracion fiscal', 'Reservado para un proveedor OSE/PSE conectado.'],
              ] as const).map(([mode, label, description]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeReceipt('mode', mode)}
                  className={cn('rounded-card border p-4 text-left transition', receiptForm.mode === mode ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-line bg-white hover:border-brand-300')}
                >
                  <span className="block text-sm font-extrabold text-ink">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-muted">{description}</span>
                </button>
              ))}
            </div>
          </FormSection>

          <FormSection icon={Printer} title="Impresion por local" description="El navegador o el telefono mostraran el dialogo del sistema; la impresion silenciosa requiere un puente ESC/POS.">
            <div className="grid gap-3 md:grid-cols-2">
              <SettingToggle checked={receiptForm.autoPrintKitchenTicket} onChange={(value) => changeReceipt('autoPrintKitchenTicket', value)} label="Comanda al entrar a Cocina" description="Abre la impresion de la comanda cuando llega un pedido nuevo." />
              <SettingToggle checked={receiptForm.autoPrintCustomerTicket} onChange={(value) => changeReceipt('autoPrintCustomerTicket', value)} label="Ticket al marcar listo" description="Solicita la impresion del resumen interno al pasar el pedido a Listo." />
            </div>
            <div className="mt-4 max-w-xs">
              <label className="text-sm font-bold text-ink" htmlFor="receipt-paper-width">Ancho de papel</label>
              <select id="receipt-paper-width" value={receiptForm.paperWidth} onChange={(event) => changeReceipt('paperWidth', Number(event.target.value) as 58 | 80)} className="mt-2 min-h-11 w-full rounded-field border border-line bg-white px-3 text-sm">
                <option value={58}>58 mm</option>
                <option value={80}>80 mm</option>
              </select>
            </div>
          </FormSection>

          <SaveBar dirty={receiptDirty || !receiptState.isConfigured} loading={isSaving} onSave={() => void saveReceipts()} />
        </div>
      )}

      {activeTab === 'communication' && (
        <div className="grid gap-4">
          <div className="rounded-card border border-line bg-white p-4 text-sm"><p className="font-bold">WhatsApp, bot y seguimiento de envíos</p><p className="mt-1 text-ink-muted">Configura Meta, las plantillas y la atención humana desde Comunicaciones. El modo de prueba permite validar el flujo sin envíos reales.</p><Link to="/admin/comunicaciones?tab=settings" className="mt-2 inline-block font-bold text-brand-700 underline">Abrir Comunicaciones</Link></div>
          <Alert
            variant={deliveryStatus === 'smtp' ? 'success' : 'warning'}
            className="rounded-card"
            title={deliveryStatus === 'smtp' ? 'Proveedor SMTP listo' : 'El correo real todavía no está activo'}
          >
            {deliveryStatus === 'smtp'
              ? `Los mensajes salen como ${communicationForm.fromName} <${communicationForm.fromEmail}>.`
              : 'En desarrollo los correos se muestran en la consola. Configura un servidor SMTP y realiza una prueba antes de producción.'}
          </Alert>

          <FormSection icon={Bell} title="Canales y eventos" description="Decide qué avisos informativos genera la plataforma.">
            <div className="grid gap-3 md:grid-cols-2">
              <SettingToggle checked={communicationForm.emailNotificationsEnabled} onChange={(value) => changeCommunication('emailNotificationsEnabled', value)} label="Correos informativos" description="Estados de pedidos, planes activados y accesos del personal." />
              <SettingToggle checked={communicationForm.inAppNotificationsEnabled} onChange={(value) => changeCommunication('inAppNotificationsEnabled', value)} label="Avisos dentro de la web" description="Muestra novedades en la campana de la cuenta del cliente." />
              <SettingToggle checked={communicationForm.orderUpdatesEnabled} onChange={(value) => changeCommunication('orderUpdatesEnabled', value)} label="Cambios de pedidos" description="Confirmado, en preparación, en reparto, entregado o cancelado." />
              <SettingToggle checked={communicationForm.whatsappUpdatesEnabled} onChange={(value) => changeCommunication('whatsappUpdatesEnabled', value)} label="Avisos por WhatsApp" description="Envía confirmación, listo, reparto y cotizaciones solo con consentimiento y conexión Meta activa." />
              <SettingToggle checked={communicationForm.planUpdatesEnabled} onChange={(value) => changeCommunication('planUpdatesEnabled', value)} label="Activación de planes" description="Confirma saldo, bonos y fechas de vigencia al cliente." />
              <SettingToggle checked={communicationForm.staffAccessEnabled} onChange={(value) => changeCommunication('staffAccessEnabled', value)} label="Acceso de personal" description="Entrega credenciales temporales al crear un usuario interno." />
              <SettingToggle checked={communicationForm.availabilityAlertsEnabled} onChange={(value) => changeCommunication('availabilityAlertsEnabled', value)} label="Platos nuevamente disponibles" description="Permite que clientes soliciten un unico aviso por producto y local." />
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-card bg-blue-50 p-3 text-xs leading-5 text-blue-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              Recuperación de contraseña y constancias del Libro de Reclamaciones permanecen activas por seguridad y cumplimiento.
            </p>
          </FormSection>

          <FormSection icon={Bell} title="Plantilla de disponibilidad" description="Personaliza el aviso enviado cuando un plato agotado vuelve al local elegido.">
            <div className="grid gap-4">
              <Input
                label="Asunto del correo"
                value={communicationForm.availabilityEmailSubject}
                onChange={(event) => changeCommunication('availabilityEmailSubject', event.target.value)}
                hint="Variables disponibles: {{product}} y {{branch}}"
              />
              <Textarea
                label="Mensaje"
                rows={4}
                maxLength={2000}
                value={communicationForm.availabilityEmailBody}
                onChange={(event) => changeCommunication('availabilityEmailBody', event.target.value)}
                hint="Se agregara automaticamente el boton para abrir el plato."
              />
            </div>
          </FormSection>

          <FormSection icon={KeyRound} title="Servidor SMTP" description="Compatible con Gmail, Microsoft 365, SendGrid, Resend, Mailgun y otros proveedores SMTP.">
            <FormGrid>
              <Input label="Servidor SMTP" placeholder="smtp.proveedor.com" value={communicationForm.smtpHost} onChange={(event) => changeCommunication('smtpHost', event.target.value)} />
              <Input label="Puerto" type="number" min={1} max={65535} value={communicationForm.smtpPort} error={communicationErrors.smtpPort} onChange={(event) => changeCommunication('smtpPort', Number(event.target.value))} />
              <Input label="Usuario SMTP" autoComplete="off" value={communicationForm.smtpUser} onChange={(event) => changeCommunication('smtpUser', event.target.value)} />
              <Input
                label="Contraseña SMTP"
                type="password"
                autoComplete="new-password"
                placeholder={communicationState.communication.smtpPasswordConfigured ? '•••••••• (guardada)' : 'Ingresa la credencial'}
                value={communicationForm.smtpPassword ?? ''}
                hint={communicationState.communication.smtpPasswordConfigured ? 'Déjala vacía para conservar la credencial actual.' : 'Se cifrará antes de guardarse.'}
                onChange={(event) => changeCommunication('smtpPassword', event.target.value)}
              />
            </FormGrid>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Switch checked={communicationForm.smtpSecure} onChange={(value) => changeCommunication('smtpSecure', value)} label="Conexión segura SSL/TLS" description="Normalmente activa con puerto 465; STARTTLS suele usar 587." />
              {communicationState.communication.smtpPasswordConfigured && (
                <Button size="sm" variant="ghost" onClick={() => changeCommunication('clearSmtpPassword', !communicationForm.clearSmtpPassword)}>
                  {communicationForm.clearSmtpPassword ? 'Conservar credencial' : 'Quitar credencial guardada'}
                </Button>
              )}
            </div>
            {communicationForm.clearSmtpPassword && <div className="pt-3"><Alert className="rounded-card" variant="warning">La credencial SMTP se eliminará al guardar.</Alert></div>}
          </FormSection>

          <FormSection icon={Send} title="Remitente y prueba" description="Identidad que verá el destinatario en su bandeja de entrada.">
            <FormGrid>
              <Input label="Nombre del remitente" value={communicationForm.fromName} error={communicationErrors.fromName} onChange={(event) => changeCommunication('fromName', event.target.value)} />
              <Input label="Correo del remitente" type="email" value={communicationForm.fromEmail} error={communicationErrors.fromEmail} onChange={(event) => changeCommunication('fromEmail', event.target.value)} />
              <Input label="Responder a (opcional)" type="email" value={communicationForm.replyToEmail} error={communicationErrors.replyToEmail} onChange={(event) => changeCommunication('replyToEmail', event.target.value)} />
              <Input label="Enviar prueba a" type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} />
            </FormGrid>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" leftIcon={<Send className="size-4" />} isLoading={isTesting} onClick={() => void testEmail()}>
                Guardar y enviar correo real de prueba
              </Button>
            </div>
          </FormSection>

          <SaveBar dirty={communicationDirty || !communicationState.isConfigured} loading={isSaving} onSave={() => void persistCommunication()} />
          <p className="text-xs text-ink-muted">La prueba SMTP de esta pantalla envía un correo real si hay servidor configurado. Para simular avisos sin contactar con nadie, usa Comunicaciones → Probar el flujo. Los correos esenciales de recuperación de acceso y reclamaciones conservan su entrega directa.</p>
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className="grid gap-4">
          <Alert variant={integrations?.integrations.every((item) => item.status === 'READY') ? 'success' : 'warning'} className="rounded-card" title="Salud de las conexiones">
            Revisa aquí si correo, pagos, avisos de cocina y la aplicación móvil están listos para operar.
          </Alert>
          <div className="flex justify-end"><Button size="sm" variant="outline" leftIcon={<RefreshCw className="size-4" />} isLoading={isRefreshing} onClick={() => void refreshIntegrations()}>Comprobar conexiones</Button></div>
          {integrationsError && <LoadError title="No pudimos consultar integraciones" message={integrationsError} onRetry={() => void loadIntegrations()} />}
          <div className="grid gap-3 md:grid-cols-2">
            {integrations?.integrations.map((item) => (
              <article key={item.key} className="rounded-card border border-line bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-extrabold text-ink">{item.name}</p><p className="mt-1 text-xs text-ink-muted">{item.provider}</p></div>
                  <span className={cn('rounded-pill px-2.5 py-1 text-xs font-black', item.status === 'READY' ? 'bg-brand-50 text-brand-800' : item.status === 'DEVELOPMENT' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-900')}>
                    {item.status === 'READY' ? 'Listo' : item.status === 'DEVELOPMENT' ? 'Desarrollo' : 'Requiere acción'}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-ink-muted">{item.detail}</p>
              </article>
            ))}
          </div>
          <p className="text-xs text-ink-muted">Última comprobación: {formatStamp(integrations?.checkedAt)}</p>
        </div>
      )}

      {/* El historial caido no puede pintarse como "todavia no hay envios": eso
          es justo lo contrario de lo que esta pantalla sirve para detectar. */}
      {activeTab === 'history' && historyError && (
        <LoadError
          title="No pudimos cargar el historial de envíos"
          message={historyError}
          onRetry={() => void refreshHistory()}
        />
      )}

      {activeTab === 'history' && !historyError && (
        <div className="grid gap-4">
          <section className="rounded-card border border-line bg-white p-4"><div className="flex items-center justify-between"><div><h2 className="font-extrabold text-ink">Versiones de configuración legal</h2><p className="mt-0.5 text-xs text-ink-muted">Cada guardado conserva una copia cifrada para restaurar si el cambio fue incorrecto.</p></div></div><div className="mt-3 grid gap-2">{settingRevisions.length === 0 ? <p className="text-sm text-ink-muted">Aún no hay versiones registradas.</p> : settingRevisions.map((revision) => <div key={revision.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface-muted p-3 text-sm"><span><strong>Versión {revision.version}</strong> · {formatStamp(revision.createdAt)}<span className="ml-2 text-xs text-ink-muted">{revision.reason}</span></span><Button size="sm" variant="outline" onClick={() => void rollbackBusiness(revision)}>Restaurar</Button></div>)}</div></section>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard icon={CheckCircle2} label="Entregas registradas" value={history?.totals.sent ?? 0} tone="success" />
            <MetricCard icon={TriangleAlert} label="Envíos fallidos" value={history?.totals.failed ?? 0} tone="danger" />
          </div>

          <section className="rounded-card border border-line bg-white">
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-extrabold text-ink">Últimas notificaciones</h2>
                <p className="mt-0.5 text-xs text-ink-muted">Permite detectar errores de entrega sin revisar los logs del servidor.</p>
              </div>
              <Button size="sm" variant="outline" leftIcon={<RefreshCw className={cn('size-4', isRefreshing && 'animate-spin')} />} disabled={isRefreshing} onClick={() => void refreshHistory()}>
                Actualizar
              </Button>
            </div>
            <div className="divide-y divide-line">
              {!history?.recent.length && <p className="p-8 text-center text-sm text-ink-muted">Todavía no existen envíos registrados.</p>}
              {history?.recent.map((item) => (
                <article key={item.id} className="grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_180px_120px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{item.subject}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{item.recipient} · {item.template}</p>
                    {item.errorMessage && <p className="mt-1 line-clamp-2 text-xs text-red-700">{item.errorMessage}</p>}
                  </div>
                  <div className="text-xs text-ink-muted">
                    <p>{item.provider ?? 'Sin proveedor'} · {item.channel.replaceAll('_', ' + ')}</p>
                    <p>{formatStamp(item.sentAt ?? item.createdAt)}</p>
                  </div>
                  <span className={cn('w-fit rounded-pill px-2 py-1 text-xs font-bold', item.status === 'SENT' ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-800')}>
                    {item.status === 'SENT' ? 'Enviado' : 'Falló'}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

const StatusCard = ({ icon: Icon, label, value, tone }: { icon: typeof Building2; label: string; value: string; tone: 'success' | 'warning' }) => (
  <div className="flex items-center gap-3 rounded-card border border-line bg-white p-3.5">
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-card', tone === 'success' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700')}><Icon className="size-4" /></span>
    <div className="min-w-0"><p className="text-xs text-ink-muted">{label}</p><p className="truncate text-sm font-extrabold text-ink">{value}</p></div>
  </div>
);

const MetricCard = ({ icon: Icon, label, value, tone }: { icon: typeof Building2; label: string; value: number; tone: 'success' | 'danger' }) => (
  <div className="flex items-center justify-between rounded-card border border-line bg-white p-4">
    <div><p className="text-xs font-medium text-ink-muted">{label}</p><p className="mt-1 text-2xl font-black text-ink">{value}</p></div>
    <Icon className={cn('size-6', tone === 'success' ? 'text-brand-700' : 'text-red-700')} />
  </div>
);

const SettingToggle = ({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string }) => (
  <div className="rounded-card border border-line p-3.5">
    <Switch checked={checked} onChange={onChange} label={label} description={description} />
  </div>
);

const SaveBar = ({ dirty, loading, onSave }: { dirty: boolean; loading: boolean; onSave: () => void }) => (
  <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-card border border-line bg-white/95 p-3 shadow-e3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
    <p className="flex items-center gap-2 text-xs leading-5 text-ink-muted">
      <ShieldCheck className="size-4 shrink-0 text-brand-700" />
      Solo el superadmin puede publicar cambios; toda acción queda auditada.
    </p>
    <Button leftIcon={<Save className="size-4" />} disabled={!dirty} isLoading={loading} onClick={onSave}>Guardar cambios</Button>
  </div>
);

export default BusinessSettingsPage;
