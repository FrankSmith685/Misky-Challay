import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Mail,
  BellRing,
  MessageCircle,
  Radio,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { Alert, type AlertVariant } from '@components/ui/Alert';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Checkbox } from '@components/ui/Checkbox';
import { FormSection } from '@components/ui/FormSection';
import { Input } from '@components/ui/Input';
import { Switch } from '@components/ui/Switch';
import { Tabs } from '@components/ui/Tabs';
import { Textarea } from '@components/ui/Textarea';
import { useConfirm } from '@components/ui/ConfirmDialog';
import toast from '@components/mui/MuiToast';
import { ROUTES } from '@constants/routes';
import { api, getApiErrorMessage } from '@services/api/client';
import { refreshBusinessInfo } from '@services/businessInfo';
import {
  communicationsApi,
  EVENT_LABELS,
  ORDER_TEMPLATE_SUGGESTIONS,
  type MessagingConfig,
  type MessagingSettings,
} from '../services/communications.service';

const emptySecrets = () => ({
  accessToken: '',
  appSecret: '',
  clearAccessToken: false,
  clearAppSecret: false,
  rotateVerifyToken: false,
});
const channelSettingsUrl = `${ROUTES.adminBusiness}?tab=communication`;
const weekDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function ChannelCard({
  icon: Icon,
  title,
  status,
  ready,
  children,
}: {
  icon: LucideIcon;
  title: string;
  status: string;
  ready: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <Icon className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
          {title}
        </p>
        <Badge variant={ready ? 'brand' : 'warning'}>{status}</Badge>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

function CopyField({
  label,
  value,
  secret = false,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold text-ink">{label}</p>
      <div className="flex min-w-0 items-start gap-1 rounded-field border border-line bg-white p-2">
        <code className="min-w-0 flex-1 break-all px-1 py-2 text-xs leading-5 text-ink-muted">
          {value
            ? secret && !visible
              ? '••••••••••••••••••••••••'
              : value
            : 'Se generará al guardar'}
        </code>
        {secret && value && (
          <Button
            variant="ghost"
            size="sm"
            sx={{ minWidth: 40, px: 1 }}
            aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          sx={{ minWidth: 40, px: 1 }}
          aria-label={`Copiar ${label.toLowerCase()}`}
          disabled={!value}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast.success(`${label} copiado`);
            } catch {
              toast.error('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
            }
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function EventRules({
  events,
  change,
}: {
  events: MessagingConfig['events'];
  change: (events: MessagingConfig['events']) => void;
}) {
  const [group, setGroup] = useState('all');
  const [expanded, setExpanded] = useState<string[]>([]);
  const entries = Object.entries(EVENT_LABELS);
  const groups = [
    { value: 'all', label: `Todos (${entries.length})` },
    { value: 'PAYMENT_', label: 'Pagos' },
    { value: 'ORDER_', label: 'Pedidos' },
    { value: 'DESIGN_', label: 'Diseños' },
  ];
  return (
    <div className="grid min-w-0 gap-4">
      <Tabs items={groups} value={group} onChange={setGroup} />
      <div className="hidden grid-cols-[minmax(0,1fr)_220px_minmax(220px,1fr)] gap-4 px-4 text-xs font-semibold text-ink-muted xl:grid">
        <span>Momento del aviso</span>
        <span>Canales</span>
        <span>Plantilla de WhatsApp</span>
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line">
        {entries
          .filter(([key]) => group === 'all' || key.startsWith(group))
          .map(([key, label]) => {
            const rule = events[key] ?? {
              email: true,
              whatsapp: true,
              template: '',
              emailText: '',
            };
            const changeRule = (patch: Partial<typeof rule>) =>
              change({ ...events, [key]: { ...rule, ...patch } });
            return (
              <div key={key} className="min-w-0 bg-white p-4">
                <div className="grid min-w-0 items-center gap-x-4 gap-y-3 xl:grid-cols-[minmax(0,1fr)_220px_minmax(220px,1fr)]">
                  <div>
                    <p className="text-sm font-bold text-ink">{label}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      sx={{ minHeight: 32, px: 0, fontSize: 12, color: 'primary.main' }}
                      leftIcon={<Mail className="size-3.5" />}
                      aria-label={`Personalizar correo: ${label}`}
                      aria-expanded={expanded.includes(key)}
                      aria-controls={`email-${key}`}
                      onClick={() =>
                        setExpanded((current) =>
                          current.includes(key)
                            ? current.filter((value) => value !== key)
                            : [...current, key],
                        )
                      }
                    >
                      {rule.emailText ? 'Editar correo' : 'Personalizar correo'}
                      <ChevronDown
                        className={`ml-1 size-3.5 transition-transform ${expanded.includes(key) ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3">
                    <Checkbox
                      label="Correo"
                      aria-label={`Correo: ${label}`}
                      checked={rule.email}
                      onChange={(event) => changeRule({ email: event.target.checked })}
                    />
                    <Checkbox
                      label="WhatsApp"
                      aria-label={`WhatsApp: ${label}`}
                      checked={rule.whatsapp}
                      onChange={(event) => changeRule({ whatsapp: event.target.checked })}
                    />
                  </div>
                  <Input
                    label={`Plantilla: ${label}`}
                    value={rule.template}
                    placeholder="nombre_aprobado_en_meta"
                    maxLength={60}
                    onChange={(event) => changeRule({ template: event.target.value })}
                  />
                </div>
                {expanded.includes(key) && (
                  <div
                    id={`email-${key}`}
                    className="mt-3 grid gap-2 rounded-field bg-surface-muted p-3 text-xs text-ink-muted"
                  >
                    <Textarea
                      label={`Texto de correo: ${label}`}
                      rows={3}
                      value={rule.emailText ?? ''}
                      placeholder="Vacío: usar el mensaje del sistema"
                      onChange={(event) => changeRule({ emailText: event.target.value })}
                      maxLength={2000}
                    />
                    <p className="leading-relaxed">
                      Variables: {'{{mensaje}}'} y {'{{enlace}}'}. Para pagos también puedes usar{' '}
                      {'{{pedido}}'}, {'{{importe}}'}, {'{{etapa}}'} y {'{{motivo}}'}.
                    </p>
                    {ORDER_TEMPLATE_SUGGESTIONS[key] && <div className="mt-2 border-t border-line pt-3">
                      <p className="font-semibold text-ink">Mensaje sugerido para WhatsApp</p>
                      <p className="mt-2 whitespace-pre-wrap leading-6">{ORDER_TEMPLATE_SUGGESTIONS[key]}</p>
                      <p className="mt-2 leading-5">Usa este texto al configurar la plantilla en Meta y coloca arriba su nombre aprobado. Las variables son el número del pedido y el enlace al detalle. El agradecimiento corresponde al evento Entregado.</p>
                      <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(ORDER_TEMPLATE_SUGGESTIONS[key]).then(() => toast.success('Texto copiado')).catch(() => toast.error('No se pudo copiar el texto')); }}>Copiar texto para WhatsApp</Button>
                    </div>}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export function CommunicationsConfiguration({
  settings,
  saved,
}: {
  settings: MessagingSettings;
  saved: (value: MessagingSettings) => void;
}) {
  const [config, setConfig] = useState(settings.config);
  const [baseline, setBaseline] = useState(settings.config);
  const [secrets, setSecrets] = useState(emptySecrets);
  const [saving, setSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    tone: AlertVariant;
    text: string;
  } | null>(null);
  const confirm = useConfirm();
  const dirty =
    JSON.stringify(config) !== JSON.stringify(baseline) || Object.values(secrets).some(Boolean);
  const connectionChanged =
    ['supportPhone', 'phoneNumberId', 'graphVersion'].some(
      (key) => config[key as keyof MessagingConfig] !== baseline[key as keyof MessagingConfig],
    ) ||
    Boolean(
      secrets.accessToken ||
      secrets.appSecret ||
      secrets.clearAccessToken ||
      secrets.clearAppSecret,
    );
  const emailReady = Boolean(settings.smtpConfigured && settings.emailNotificationsEnabled);
  const whatsappReady = Boolean(
    settings.connectionReady && settings.webhookReady && settings.templatesReady && settings.whatsappUpdatesEnabled,
  );
  const modeLabel = !settings.config.enabled
    ? 'Envíos pausados'
    : settings.config.testMode
      ? 'Modo de prueba'
      : 'Envíos reales';
  const change = <K extends keyof MessagingConfig>(key: K, value: MessagingConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    if (['supportPhone', 'phoneNumberId', 'graphVersion'].includes(key)) setConnectionResult(null);
  };
  const webhookUrl = new URL(
    `${String(api.defaults.baseURL ?? '/api/v1').replace(/\/$/, '')}/communications/webhook`,
    window.location.origin,
  ).toString();
  const save = async () => {
    if (!dirty || saving) return;
    if (config.enabled && !config.testMode && settings.config.testMode && settings.whatsappUpdatesEnabled !== false && !settings.readyToSend) {
      toast.error('Completa la conexión con Meta, el webhook y las plantillas antes de activar envíos reales.');
      return;
    }
    if (settings.config.testMode && !config.testMode && config.enabled) {
      const result = await confirm({
        title: 'Activar envíos reales',
        message:
          'Los nuevos avisos se enviarán a clientes con los canales habilitados. Los avisos creados como simulación seguirán siendo pruebas. Comprueba SMTP, la conexión de Meta y las plantillas antes de activar.',
        confirmLabel: 'Activar envíos reales',
      });
      if (!result.confirmed) return;
    }
    setSaving(true);
    try {
      const result = await communicationsApi.save(config, secrets);
      saved({ ...settings, ...result });
      setConfig(result.config);
      setBaseline(result.config);
      setSecrets(emptySecrets());
      setConnectionResult(null);
      setHasSaved(true);
      void refreshBusinessInfo().catch(() => undefined);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const verifyConnection = async () => {
    setChecking(true);
    setConnectionResult(null);
    try {
      const result = await communicationsApi.checkConnection();
      setConnectionResult({
        tone: result.matchesSupportPhone ? 'success' : 'warning',
        text: `${result.matchesSupportPhone ? 'Número correcto' : 'El número no coincide con el WhatsApp de atención'}: ${result.displayPhone} · ${result.verifiedName}`,
      });
    } catch (error) {
      setConnectionResult({ tone: 'danger', text: getApiErrorMessage(error) });
    } finally {
      setChecking(false);
    }
  };
  return (
    <form
      aria-label="Configuración de comunicaciones"
      className="min-w-0"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={saving} className="grid min-w-0 gap-5">
        <legend className="sr-only">Preferencias de comunicaciones</legend>
        <div
          className="grid min-w-0 gap-3 lg:grid-cols-3"
          aria-label="Estado guardado de los canales"
        >
          <ChannelCard
            icon={settings.config.testMode ? FlaskConical : Radio}
            title="Estado de los envíos"
            status={modeLabel}
            ready={settings.config.enabled && !settings.config.testMode}
          >
            {!settings.config.enabled
              ? 'Las comunicaciones están desactivadas.'
              : settings.config.testMode
                ? 'Los avisos se registran como simulación. No llegan al cliente.'
                : 'Se procesan avisos reales en los canales habilitados.'}
          </ChannelCard>
          <ChannelCard
            icon={Mail}
            title="Correo electrónico"
            ready={emailReady}
            status={
              !settings.smtpConfigured
                ? 'Falta SMTP'
                : settings.emailNotificationsEnabled
                  ? 'Configurado'
                  : 'Canal desactivado'
            }
          >
            {emailReady
              ? 'SMTP y avisos habilitados. Comprueba la recepción con una prueba.'
              : 'Configura el remitente y activa los avisos en Correo y avisos.'}
          </ChannelCard>
          <ChannelCard
            icon={MessageCircle}
            title="WhatsApp"
            ready={whatsappReady}
            status={
              !settings.connectionReady || !settings.webhookReady
                ? 'Falta conectar Meta'
                : settings.whatsappUpdatesEnabled
                  ? 'Configurado'
                  : 'Canal desactivado'
            }
          >
            {whatsappReady
              ? 'Requiere plantillas aprobadas y el consentimiento del cliente.'
              : 'Completa la conexión de Meta y habilita este canal para enviar avisos.'}
          </ChannelCard>
        </div>
        {!settings.config.testMode && settings.whatsappUpdatesEnabled !== false && !settings.readyToSend && (
          <Alert variant="warning">
            Los envíos reales están activos, pero WhatsApp todavía no está listo. Revisa la conexión,
            el webhook y las plantillas antes de mantener este canal habilitado.
            {settings.missingWhatsappTemplates.length > 0 && ` Faltan: ${settings.missingWhatsappTemplates.join(', ')}.`}
          </Alert>
        )}

        <FormSection
          title="Envíos y atención"
          icon={Settings2}
          description="Define si el sistema envía avisos reales o solo registra pruebas."
        >
          <div className="grid items-start gap-3 lg:grid-cols-2">
            <Switch
              label="Activar comunicaciones"
              description="Habilita el servicio de avisos y atención."
              checked={config.enabled}
              onChange={(value) => change('enabled', value)}
            />
            <Switch
              label="Modo de prueba (sin envíos reales)"
              description="Simula los avisos de correo y WhatsApp sin contactar al cliente."
              checked={config.testMode}
              onChange={(value) => change('testMode', value)}
            />
          </div>
          <div className="mt-4 grid items-start gap-4 border-t border-line pt-5 lg:grid-cols-2">
            <Input
              label="WhatsApp de atención"
              value={config.supportPhone}
              onChange={(event) => change('supportPhone', event.target.value)}
              maxLength={9}
              inputMode="numeric"
              startAdornment={<span className="text-sm text-ink-muted">+51</span>}
              hint="Número de atención del taller. Es distinto del identificador de Meta."
            />
            <div className="min-w-0 rounded-field bg-surface-muted p-3.5">
              <p className="text-sm font-semibold text-ink">Remitente y permisos de cada canal</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                El servidor SMTP y los interruptores generales de correo y WhatsApp se gestionan en
                Datos del negocio.
              </p>
              <Link
                className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-bold text-brand-700 underline underline-offset-4"
                to={channelSettingsUrl}
              >
                Configurar correo y habilitar avisos por canal
                <ArrowUpRight className="size-3.5 shrink-0" />
              </Link>
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Recordatorios y seguimiento de pagos"
          icon={BellRing}
          description="Ayuda al cliente a retomar un pedido registrado cuyo pago todavía no se completó."
        >
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Switch
              label="Recordar pagos pendientes"
              checked={config.paymentReminders.enabled}
              description="Como máximo un recordatorio por pedido, mediante los canales elegidos abajo."
              onChange={(enabled) =>
                change('paymentReminders', { ...config.paymentReminders, enabled })
              }
            />
            <Input
              label="Espera antes del recordatorio (minutos)"
              type="number"
              min={1}
              max={60}
              step={1}
              required
              value={config.paymentReminders.delayMinutes}
              onChange={(event) =>
                change('paymentReminders', {
                  ...config.paymentReminders,
                  delayMinutes: Number(event.target.value),
                })
              }
              hint="De 1 a 60 minutos desde que se crea el pedido. La revisión automática se ejecuta cada minuto."
            />
          </div>
          <div className="mt-4 grid gap-3 rounded-field bg-surface-muted p-4 text-xs leading-relaxed text-ink-muted">
            <p>
              <strong className="text-ink">Solo pedidos nuevos:</strong> se consideran los pedidos
              creados después de activar y guardar esta opción. La espera no amplía su plazo de
              pago.
            </p>
            <p>
              <strong className="text-ink">Se comprueba antes de enviar:</strong> si el pago está
              confirmado, procesándose, reportado en Yape/Plin o el pedido ya venció, se omite el
              recordatorio.
            </p>
            <p>
              <strong className="text-ink">Canales y mensajes:</strong> configura «Recordatorio de
              pago pendiente», «Intento de pago no completado» y «Plazo de pago vencido» en Avisos
              por evento. Puedes revisar los resultados en Historial de envíos.
            </p>
          </div>
        </FormSection>

        <FormSection
          title="Conexión de WhatsApp con Meta"
          icon={KeyRound}
          description="Conecta tu aplicación para enviar y recibir mensajes de WhatsApp."
        >
          <div className="grid min-w-0 gap-5">
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Input
                label="Identificador del número en Meta"
                value={config.phoneNumberId}
                inputMode="numeric"
                maxLength={60}
                onChange={(event) => change('phoneNumberId', event.target.value)}
                hint="Phone number ID de Meta; no es el número de celular."
              />
              <Input
                label="Versión Graph de tu aplicación"
                placeholder="vXX.X"
                value={config.graphVersion}
                onChange={(event) => change('graphVersion', event.target.value)}
                hint="Usa la versión de tu aplicación en Meta."
              />
              <Input
                label="Idioma de las plantillas"
                value={config.language}
                onChange={(event) => change('language', event.target.value)}
                hint="Debe coincidir con la plantilla, por ejemplo: es."
              />
            </div>
            <div className="grid items-start gap-4 md:grid-cols-2">
              <Input
                label="Access token de Meta"
                type="password"
                autoComplete="new-password"
                value={secrets.accessToken}
                maxLength={4000}
                placeholder={
                  settings.accessTokenConfigured
                    ? 'Deja vacío para conservar el actual'
                    : 'Pega el token de tu aplicación'
                }
                hint={
                  settings.accessTokenConfigured
                    ? 'Token guardado. Su contenido no se muestra.'
                    : 'Pendiente de configurar.'
                }
                onChange={(event) => {
                  setSecrets((value) => ({
                    ...value,
                    accessToken: event.target.value,
                    clearAccessToken: false,
                  }));
                  setConnectionResult(null);
                }}
              />
              <Input
                label="App secret de Meta"
                type="password"
                autoComplete="new-password"
                value={secrets.appSecret}
                maxLength={500}
                placeholder={
                  settings.appSecretConfigured
                    ? 'Deja vacío para conservar el actual'
                    : 'Pega el secreto de tu aplicación'
                }
                hint={
                  settings.appSecretConfigured
                    ? 'Secreto guardado. Su contenido no se muestra.'
                    : 'Pendiente de configurar.'
                }
                onChange={(event) => {
                  setSecrets((value) => ({
                    ...value,
                    appSecret: event.target.value,
                    clearAppSecret: false,
                  }));
                  setConnectionResult(null);
                }}
              />
            </div>
            {(settings.accessTokenConfigured || settings.appSecretConfigured) && (
              <details className="group rounded-field border border-line px-3 text-xs text-ink-muted">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold [&::-webkit-details-marker]:hidden">
                  Administrar credenciales guardadas
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="flex flex-wrap gap-x-5 border-t border-line py-2">
                  {settings.accessTokenConfigured && (
                    <Checkbox
                      label="Eliminar access token"
                      checked={secrets.clearAccessToken}
                      onChange={(event) => {
                        setSecrets((current) => ({
                          ...current,
                          clearAccessToken: event.target.checked,
                          accessToken: '',
                        }));
                        setConnectionResult(null);
                      }}
                    />
                  )}
                  {settings.appSecretConfigured && (
                    <Checkbox
                      label="Eliminar app secret"
                      checked={secrets.clearAppSecret}
                      onChange={(event) => {
                        setSecrets((current) => ({
                          ...current,
                          clearAppSecret: event.target.checked,
                          appSecret: '',
                        }));
                        setConnectionResult(null);
                      }}
                    />
                  )}
                </div>
              </details>
            )}
            <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0 text-xs leading-relaxed text-ink-muted">
                <p className="font-semibold text-ink">Comprueba el número conectado</p>
                <p>
                  {connectionChanged
                    ? 'Guarda los datos de conexión antes de verificar.'
                    : !settings.connectionReady
                      ? 'Completa y guarda el identificador, la versión Graph y el access token.'
                      : 'Consulta el número registrado en Meta. Esta acción no envía mensajes.'}
                </p>
              </div>
              <Button
                variant="outline"
                leftIcon={<ShieldCheck className="size-4" />}
                isLoading={checking}
                disabled={!settings.connectionReady || connectionChanged}
                onClick={() => void verifyConnection()}
              >
                Verificar conexión con Meta
              </Button>
            </div>
            {connectionResult && (
              <Alert variant={connectionResult.tone}>{connectionResult.text}</Alert>
            )}
            <details className="group min-w-0 rounded-field border border-line bg-surface-muted">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 p-3.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                <Webhook className="size-4 shrink-0 text-brand-700" />
                Datos para el webhook
                <ChevronDown className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid min-w-0 gap-4 border-t border-line p-4">
                <p className="text-xs leading-relaxed text-ink-muted">
                  Configura en Meta la suscripción a «messages». Usa una URL HTTPS pública que
                  llegue al backend; la dirección local solo sirve para pruebas del sistema.
                </p>
                <CopyField label="URL del webhook" value={webhookUrl} />
                <CopyField label="Token de verificación" value={settings.verifyToken} secret />
                <Checkbox
                  label="Generar otro token de verificación al guardar"
                  checked={secrets.rotateVerifyToken}
                  onChange={(event) =>
                    setSecrets((current) => ({
                      ...current,
                      rotateVerifyToken: event.target.checked,
                    }))
                  }
                />
                {secrets.rotateVerifyToken && (
                  <p className="text-xs text-amber-800">
                    Después de guardar, actualiza también el token de verificación en Meta.
                  </p>
                )}
              </div>
            </details>
          </div>
        </FormSection>

        <FormSection
          title="Respuestas del bot y horarios"
          icon={Bot}
          description="Personaliza la atención automática. El bot orienta al cliente; los pagos se verifican en caja."
        >
          <Switch
            label="Bot de opciones"
            checked={config.botEnabled}
            description="Responde con opciones de pedidos, pagos, delivery y atención humana."
            onChange={(value) => change('botEnabled', value)}
          />
          <div className="mt-5 grid min-w-0 gap-5 md:grid-cols-2">
            <Textarea
              label="Saludo del bot"
              rows={3}
              value={config.welcome}
              maxLength={1000}
              onChange={(event) => change('welcome', event.target.value)}
            />
            <Textarea
              label="Información de delivery"
              rows={3}
              value={config.deliveryInfo}
              maxLength={1000}
              onChange={(event) => change('deliveryInfo', event.target.value)}
            />
            <Textarea
              label="Respuesta al solicitar una persona"
              rows={3}
              value={config.humanReply}
              maxLength={1000}
              onChange={(event) => change('humanReply', event.target.value)}
            />
            <Textarea
              label="Respuesta fuera de horario"
              rows={3}
              value={config.closedReply}
              maxLength={1000}
              onChange={(event) => change('closedReply', event.target.value)}
            />
          </div>
          <div className="mt-5 grid gap-5 border-t border-line pt-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs font-bold text-ink">
                <Clock3 className="size-4 text-brand-700" />
                Horario de atención · Perú
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Apertura (Perú)"
                  type="time"
                  value={config.openingTime}
                  onChange={(event) => change('openingTime', event.target.value)}
                />
                <Input
                  label="Cierre (Perú)"
                  type="time"
                  value={config.closingTime}
                  onChange={(event) => change('closingTime', event.target.value)}
                />
              </div>
            </div>
            <fieldset className="min-w-0">
              <legend className="mb-3 text-xs font-bold text-ink">Días de atención</legend>
              <div className="flex flex-wrap gap-2">
                {weekDays.map((day, index) => (
                  <label
                    key={day}
                    className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-field border px-3 text-xs font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600 ${config.workingDays.includes(index) ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink-muted'}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={config.workingDays.includes(index)}
                      onChange={(event) =>
                        change(
                          'workingDays',
                          event.target.checked
                            ? [...config.workingDays, index].sort((a, b) => a - b)
                            : config.workingDays.filter((value) => value !== index),
                        )
                      }
                    />
                    {config.workingDays.includes(index) && (
                      <Check className="size-3.5" aria-hidden="true" />
                    )}
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </FormSection>

        <FormSection
          title="Avisos por evento"
          icon={SlidersHorizontal}
          description="Elige qué avisos recibe el cliente y por qué canal. Los permisos generales de cada canal también deben estar activos."
        >
          <div className="mb-4 flex items-start gap-2 rounded-field bg-surface-muted p-3 text-xs leading-relaxed text-ink-muted">
            <MessageCircle className="mt-0.5 size-4 shrink-0 text-brand-700" />
            <p>
              Para WhatsApp usa el nombre exacto de una plantilla aprobada en Meta, con dos
              variables: número de pedido y enlace al detalle. El cliente debe aceptar recibir estos
              avisos.
            </p>
          </div>
          <EventRules events={config.events} change={(events) => change('events', events)} />
        </FormSection>

        <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-card border border-line bg-white/95 p-3.5 shadow-e3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="flex items-center gap-2 text-xs text-ink-muted">
            {dirty ? (
              <Settings2 className="size-4 shrink-0 text-brand-700" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-brand-700" />
            )}
            {dirty
              ? 'Tienes cambios sin guardar.'
              : hasSaved
                ? 'Configuración guardada.'
                : 'Todos los cambios están guardados.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RotateCcw className="size-4" />}
                onClick={() => {
                  setConfig(baseline);
                  setSecrets(emptySecrets());
                  setConnectionResult(null);
                }}
              >
                Restablecer
              </Button>
            )}
            <Button
              type="submit"
              className="flex-1 sm:flex-none"
              leftIcon={<Save className="size-4" />}
              isLoading={saving}
              disabled={!dirty}
            >
              Guardar comunicaciones
            </Button>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
