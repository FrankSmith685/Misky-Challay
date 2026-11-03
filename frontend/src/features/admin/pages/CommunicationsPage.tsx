import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle, RefreshCw, Send, ArrowLeft } from 'lucide-react';
import { CommunicationsConfiguration } from '../components/CommunicationsConfiguration';
import { PageHeader } from '@components/common/PageHeader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { FormSection } from '@components/ui/FormSection';
import { Tabs } from '@components/ui/Tabs';
import { useConfirm } from '@components/ui/ConfirmDialog';
import toast from '@components/mui/MuiToast';
import { getApiErrorMessage } from '@services/api/client';
import { formatDate } from '@lib/format';
import { usePermissions } from '@/hooks/usePermissions';
import { useAppSelector } from '@app/hooks';
import { PERM } from '@constants/permissions';
import {
  subscribeCommunications,
  communicationsApi,
  DELIVERY_LABELS,
  EVENT_LABELS,
  type Conversation,
  type ConversationDetail,
  type Delivery,
  type MessagingSettings,
  type Paged,
} from '../services/communications.service';

export default function CommunicationsPage() {
  const { can, canAny, isSuperAdmin } = usePermissions();
  const actorId = useAppSelector((state) => state.auth.user?.id);
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'inbox';
  const selectedId = Number(params.get('conversation')) || null;
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [conversations, setConversations] = useState<Paged<Conversation> | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [deliveries, setDeliveries] = useState<Paged<Delivery> | null>(null);
  const [search, setSearch] = useState('');
  const [conversationPage, setConversationPage] = useState(1);
  const [page, setPage] = useState(1);
  const [state, setState] = useState('');
  const [channel, setChannel] = useState('');
  const [deliveryEvent, setDeliveryEvent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [reply, setReply] = useState('');
  const replyKey = useRef(crypto.randomUUID());
  const logRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [testPhone, setTestPhone] = useState('');
  const [testText, setTestText] = useState('hola');
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState('');
  const canReply = can(PERM.COMMUNICATION_REPLY);
  const canRead = canAny(PERM.COMMUNICATION_READ, PERM.COMMUNICATION_REPLY);
  const refresh = () => setVersion((value) => value + 1);
  useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    communicationsApi
      .settings()
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch((cause) => {
        if (active) setError(getApiErrorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin, version]);
  useEffect(() => {
    if (!canRead || !['inbox', 'history'].includes(tab)) return;
    let active = true;
    const load = async () => {
      try {
        if (tab === 'inbox') {
          const [list, conversation] = await Promise.all([
            communicationsApi.conversations(search, conversationPage),
            selectedId ? communicationsApi.conversation(selectedId) : null,
          ]);
          if (active) {
            setConversations(list);
            setDetail((current) => {
              if (!conversation || current?.conversation.id !== conversation.conversation.id)
                return conversation;
              const earliest = conversation.messages[0]?.id ?? Infinity;
              const older = current.messages.filter((message) => message.id < earliest);
              return older.length
                ? {
                    ...conversation,
                    messages: [...older, ...conversation.messages],
                    hasMore: current.hasMore,
                  }
                : conversation;
            });
          }
        } else {
          const list = await communicationsApi.deliveries(page, state, channel, deliveryEvent);
          if (active) setDeliveries(list);
        }
        if (active) setError('');
      } catch (cause) {
        if (active) setError(getApiErrorMessage(cause));
      }
    };
    const start = window.setTimeout(() => void load(), 200);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 10000);
    return () => {
      active = false;
      clearTimeout(start);
      clearInterval(poll);
    };
  }, [
    tab,
    search,
    selectedId,
    conversationPage,
    page,
    state,
    channel,
    deliveryEvent,
    version,
    canRead,
  ]);
  useEffect(() => {
    if (!canRead || !['inbox', 'history'].includes(tab)) return;
    let debounce: ReturnType<typeof setTimeout>;
    const stop = subscribeCommunications(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => setVersion((value) => value + 1), 300);
    });
    return () => {
      stop();
      clearTimeout(debounce);
    };
  }, [canRead, tab]);
  useEffect(() => {
    setReply('');
    replyKey.current = crypto.randomUUID();
    setDetail(null);
    followLatest.current = true;
  }, [selectedId]);
  useEffect(() => {
    if (followLatest.current && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [detail?.messages.length]);
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setVersion((value) => value + 1);
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, []);
  const select = (id: number | null) =>
    setParams(id ? { tab: 'inbox', conversation: String(id) } : { tab: 'inbox' });
  const testDelivery = async (method: 'EMAIL' | 'WHATSAPP') => {
    if (!settings) return;
    if (!settings.config.testMode) {
      const result = await confirm({
        title: 'Enviar prueba real',
        message: `Se enviará un mensaje de prueba a ${method === 'EMAIL' ? testEmail : testPhone}.`,
        confirmLabel: 'Enviar prueba real',
      });
      if (!result.confirmed) return;
    }
    await run(async () => {
      const result = await communicationsApi.test(
        method,
        method === 'EMAIL' ? testEmail : testPhone,
      );
      setTestResult(
        result.simulation
          ? 'Prueba simulada registrada. No se enviaron mensajes reales.'
          : 'Prueba en cola. Consulta el resultado en Historial de envíos.',
      );
    });
  };
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader
        className="mb-0"
        title="Comunicaciones"
        eyebrow="Atención y avisos"
        description="Atiende WhatsApp y consulta los avisos de pagos y pedidos."
        icon={MessageCircle}
        action={
          <Button variant="outline" leftIcon={<RefreshCw className="size-4" />} onClick={refresh}>
            Actualizar
          </Button>
        }
      />
      {settings && tab !== 'settings' && (
        <div role="status" className="rounded-card border border-line bg-surface-muted p-3 text-sm">
          <b>
            {!settings.config.enabled
              ? 'Envíos pausados'
              : settings.config.testMode
                ? 'Modo de prueba: sin envíos reales'
                : 'Modo real'}
          </b>
          <span className="ml-2 text-ink-muted">
            WhatsApp:{' '}
            {settings.connectionReady && settings.webhookReady
              ? 'conexión configurada'
              : 'completa la conexión con Meta'}
            . Correo: {settings.smtpConfigured ? 'SMTP configurado' : 'configura SMTP'}.
          </span>
        </div>
      )}
      <nav aria-label="Secciones de comunicaciones" className="min-w-0">
        <Tabs
          value={tab}
          onChange={(value) => setParams({ tab: value })}
          items={[
            { value: 'inbox', label: 'Conversaciones' },
            { value: 'history', label: 'Historial de envíos' },
            ...(isSuperAdmin
              ? [
                  { value: 'tests', label: 'Probar el flujo' },
                  { value: 'settings', label: 'Configuración' },
                ]
              : []),
          ]}
        />
      </nav>
      {error && (
        <div
          role="alert"
          className="rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
          <Button variant="ghost" size="sm" onClick={refresh}>
            Reintentar
          </Button>
        </div>
      )}
      {tab === 'inbox' && (
        <div className="grid min-w-0 items-start gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
          <section
            aria-label="Conversaciones de WhatsApp"
            className={`${selectedId ? 'hidden md:block' : ''} min-w-0 rounded-card border border-line bg-white p-3`}
          >
            <Input
              label="Buscar conversación"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setConversationPage(1);
              }}
            />
            <div className="mt-3 grid gap-2">
              {conversations?.items.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => select(conversation.id)}
                  className={`min-w-0 rounded-card border p-3 text-left ${selectedId === conversation.id ? 'border-brand-500 bg-brand-50' : 'border-line'}`}
                >
                  <span className="block truncate text-sm font-bold">
                    {conversation.name || conversation.phone}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {conversation.phone} · {conversation.isTest ? 'Prueba' : 'Real'} ·{' '}
                    {conversation.mode === 'HUMAN' ? 'Atención humana' : 'Bot'}
                  </span>
                  <span className="mt-1 block truncate text-xs">{conversation.lastMessage}</span>
                  {conversation.unread > 0 && (
                    <span className="text-xs font-bold text-brand-700">
                      {conversation.unread} pendientes
                    </span>
                  )}
                </button>
              ))}
              {conversations?.items.length === 0 && (
                <p className="p-3 text-sm text-ink-muted">
                  Todavía no hay conversaciones.{' '}
                  {isSuperAdmin ? 'Puedes simular una desde Probar el flujo.' : ''}
                </p>
              )}
            </div>
            {conversations && conversations.total > 30 && (
              <div className="mt-3 flex items-center justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={conversationPage <= 1}
                  onClick={() => setConversationPage((value) => value - 1)}
                >
                  Anterior
                </Button>
                <span className="text-xs">{conversationPage}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={conversationPage * 30 >= conversations.total}
                  onClick={() => setConversationPage((value) => value + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </section>
          <section
            aria-label="Detalle de conversación"
            className="min-w-0 rounded-card border border-line bg-white p-4"
          >
            <Button
              className="md:!hidden"
              variant="ghost"
              size="sm"
              leftIcon={<ArrowLeft className="size-4" />}
              onClick={() => select(null)}
            >
              Conversaciones
            </Button>
            {!detail ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                {selectedId
                  ? 'Cargando conversación…'
                  : 'Elige una conversación para ver sus mensajes y atenderla.'}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                  <div>
                    <h2 className="font-bold">
                      {detail.conversation.name || detail.conversation.phone}
                    </h2>
                    <p className="text-xs text-ink-muted">
                      {detail.conversation.phone} ·{' '}
                      {detail.conversation.isTest ? 'Prueba sin envío real' : 'Conversación real'} ·{' '}
                      {detail.conversation.mode === 'BOT' ? 'Bot activo' : 'Bot pausado'}
                    </p>
                  </div>
                  {canReply && (
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={busy}
                      disabled={Boolean(
                        detail.conversation.assignedTo &&
                        detail.conversation.assignedTo !== actorId &&
                        !isSuperAdmin,
                      )}
                      onClick={() =>
                        void run(() =>
                          communicationsApi.mode(
                            detail.conversation.id,
                            detail.conversation.mode === 'BOT' || !detail.conversation.assignedTo
                              ? 'HUMAN'
                              : 'BOT',
                          ),
                        )
                      }
                    >
                      {detail.conversation.mode === 'BOT' || !detail.conversation.assignedTo
                        ? 'Tomar conversación'
                        : 'Devolver al bot'}
                    </Button>
                  )}
                </div>
                <div
                  ref={logRef}
                  onScroll={(event) => {
                    const log = event.currentTarget;
                    followLatest.current = log.scrollHeight - log.clientHeight - log.scrollTop < 80;
                  }}
                  role="log"
                  aria-label="Mensajes de WhatsApp"
                  className="my-3 grid max-h-[55vh] min-h-40 content-start gap-3 overflow-y-auto rounded-card bg-surface-muted p-3"
                >
                  {detail.hasMore && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void run(async () => {
                          followLatest.current = false;
                          const previous = await communicationsApi.conversation(
                            detail.conversation.id,
                            detail.messages[0]?.id,
                          );
                          setDetail({
                            ...previous,
                            messages: [...previous.messages, ...detail.messages],
                          });
                        })
                      }
                    >
                      Cargar mensajes anteriores
                    </Button>
                  )}
                  {detail.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`min-w-0 max-w-[95%] rounded-card border border-line p-3 text-sm sm:max-w-[85%] ${message.direction === 'OUT' ? 'justify-self-end bg-brand-50' : 'justify-self-start bg-white'}`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      <p className="mt-2 text-[11px] text-ink-muted">
                        {message.direction === 'OUT'
                          ? message.actorId
                            ? 'Equipo'
                            : 'Bot'
                          : 'Cliente'}{' '}
                        · {formatDate(message.createdAt)} ·{' '}
                        {DELIVERY_LABELS[message.state] ?? message.state}
                      </p>
                    </article>
                  ))}
                </div>
                {detail.conversation.optedOutAt && (
                  <p role="status" className="mb-3 text-sm text-amber-800">
                    El cliente desactivó los mensajes. Debe escribir ALTA para permitirlos de nuevo.
                  </p>
                )}
                {detail.conversation.lastInboundAt &&
                  Date.now() - Date.parse(detail.conversation.lastInboundAt) >= 24 * 3600000 && (
                    <p className="mb-3 text-sm text-amber-800">
                      La ventana de atención terminó. Espera un nuevo mensaje del cliente para
                      responder desde aquí.
                    </p>
                  )}
                {canReply && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        await communicationsApi.reply(
                          detail.conversation.id,
                          reply,
                          replyKey.current,
                        );
                        setReply('');
                        replyKey.current = crypto.randomUUID();
                        toast.success('Respuesta en cola');
                      });
                    }}
                    className="grid gap-3"
                  >
                    <Textarea
                      label="Respuesta al cliente"
                      rows={3}
                      value={reply}
                      onChange={(event) => {
                        setReply(event.target.value);
                        replyKey.current = crypto.randomUUID();
                      }}
                      maxLength={4000}
                      disabled={
                        busy ||
                        detail.conversation.mode !== 'HUMAN' ||
                        Boolean(detail.conversation.optedOutAt)
                      }
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-ink-muted">
                        Toma la conversación para responder. El bot permanecerá pausado.
                      </p>
                      <Button
                        type="submit"
                        leftIcon={<Send className="size-4" />}
                        isLoading={busy}
                        disabled={
                          !reply.trim() ||
                          detail.conversation.mode !== 'HUMAN' ||
                          Boolean(detail.conversation.optedOutAt) ||
                          (detail.conversation.assignedTo !== actorId && !isSuperAdmin)
                        }
                      >
                        Enviar respuesta
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {tab === 'history' && (
        <section className="grid min-w-0 gap-3 rounded-card border border-line bg-white p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-semibold">
              Canal
              <select
                aria-label="Filtrar por canal"
                className="min-h-11 rounded-field border border-line bg-white px-3"
                value={channel}
                onChange={(event) => {
                  setChannel(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                <option value="EMAIL">Correo</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold">
              Estado
              <select
                aria-label="Filtrar por estado"
                className="min-h-11 rounded-field border border-line bg-white px-3"
                value={state}
                onChange={(event) => {
                  setState(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {Object.entries(DELIVERY_LABELS)
                  .filter(([key]) => key !== 'RECEIVED')
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-semibold">
              Tipo de aviso
              <select
                aria-label="Filtrar por tipo de aviso"
                className="min-h-11 min-w-0 rounded-field border border-line bg-white px-3"
                value={deliveryEvent}
                onChange={(event) => {
                  setDeliveryEvent(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos los avisos</option>
                {Object.entries(EVENT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-ink-muted">
            «Aceptado» significa que el proveedor recibió la solicitud. La entrega o lectura de
            WhatsApp se confirma cuando Meta lo comunica. Para correo, comprueba también el buzón
            del destinatario.
          </p>
          {deliveries?.items.map((delivery) => (
            <article key={delivery.id} className="min-w-0 rounded-card border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="break-words text-sm font-bold">{delivery.subject}</h2>
                  <p className="break-all text-xs text-ink-muted">
                    {delivery.channel === 'EMAIL' ? 'Correo' : 'WhatsApp'} · {delivery.recipient} ·{' '}
                    {formatDate(delivery.createdAt)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-brand-800">
                    {DELIVERY_LABELS[delivery.state] ?? delivery.state} · {delivery.attempts}{' '}
                    intentos
                  </p>
                </div>
                {canReply && ['FAILED', 'BLOCKED', 'UNKNOWN'].includes(delivery.state) && (
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={busy}
                    onClick={() =>
                      void run(async () => {
                        const answer = await confirm({
                          title: 'Reintentar aviso',
                          message:
                            delivery.state === 'UNKNOWN'
                              ? 'El proveedor pudo recibir el mensaje anterior. Comprueba primero su historial para evitar un duplicado. ¿Ya lo revisaste y deseas reintentar?'
                              : 'Corrige la configuración o la causa del error antes de reintentar.',
                          confirmLabel:
                            delivery.state === 'UNKNOWN'
                              ? 'Ya revisé, reintentar'
                              : 'Reintentar aviso',
                        });
                        if (answer.confirmed)
                          await communicationsApi.retry(delivery.id, delivery.state === 'UNKNOWN');
                      })
                    }
                  >
                    Reintentar
                  </Button>
                )}
              </div>
              {delivery.error && <p className="mt-2 text-xs text-amber-800">{delivery.error}</p>}
            </article>
          ))}
          {deliveries?.items.length === 0 && (
            <p className="py-5 text-center text-sm text-ink-muted">
              No hay envíos con estos filtros.
            </p>
          )}
          {deliveries && (
            <div className="flex items-center justify-between">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </Button>
              <span className="text-xs">
                Página {page} · {deliveries.total} avisos
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page * 30 >= deliveries.total}
                onClick={() => setPage((value) => value + 1)}
              >
                Siguiente
              </Button>
            </div>
          )}
        </section>
      )}
      {tab === 'tests' && isSuperAdmin && settings && (
        <div className="grid gap-4 lg:grid-cols-2">
          <FormSection
            title="Simular una conversación"
            description="Prueba el bot, la atención humana y BAJA/ALTA. Estas conversaciones quedan marcadas como prueba."
          >
            <Input
              label="Celular de prueba"
              value={testPhone}
              onChange={(event) => setTestPhone(event.target.value)}
              placeholder="9 dígitos"
            />
            <Textarea
              label="Mensaje simulado del cliente"
              rows={2}
              value={testText}
              onChange={(event) => setTestText(event.target.value)}
            />
            <p className="text-xs text-ink-muted">Opciones: hola, 1, 2, 3, 4, BAJA o ALTA.</p>
            <Button
              className="!mt-3"
              isLoading={busy}
              disabled={!settings.config.testMode || !testPhone || !testText.trim()}
              onClick={() =>
                void run(async () => {
                  const result = await communicationsApi.simulate(testPhone, testText);
                  select(result.conversationId);
                })
              }
            >
              Simular mensaje
            </Button>
          </FormSection>
          <FormSection
            title="Probar un aviso"
            description="En modo de prueba solo se registra la simulación. Para envíos reales, configura las conexiones y desactiva el modo de prueba."
          >
            <Input
              label="Correo de prueba"
              type="email"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
            />
            <Button
              className="!mt-3"
              variant="outline"
              isLoading={busy}
              disabled={!testEmail}
              onClick={() => void testDelivery('EMAIL')}
            >
              {settings.config.testMode ? 'Simular correo' : 'Enviar correo real de prueba'}
            </Button>
            <div className="mt-4">
              <Input
                label="Celular para aviso de prueba"
                value={testPhone}
                onChange={(event) => setTestPhone(event.target.value)}
                hint="Para una prueba real usa un destinatario que acepte recibirla, distinto del número emisor."
              />
              <Button
                className="!mt-3"
                variant="outline"
                isLoading={busy}
                disabled={!testPhone}
                onClick={() => void testDelivery('WHATSAPP')}
              >
                {settings.config.testMode
                  ? 'Simular aviso de WhatsApp'
                  : 'Enviar WhatsApp real de prueba'}
              </Button>
            </div>
            {testResult && (
              <p role="status" className="mt-3 text-sm text-brand-800">
                {testResult}
              </p>
            )}
          </FormSection>
        </div>
      )}
      {tab === 'settings' && isSuperAdmin && settings && (
        <CommunicationsConfiguration key={actorId} settings={settings} saved={setSettings} />
      )}
      {['settings', 'tests'].includes(tab) && isSuperAdmin && !settings && !error && (
        <p className="p-4 text-sm text-ink-muted">Cargando configuración…</p>
      )}
    </div>
  );
}
