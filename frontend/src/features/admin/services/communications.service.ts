import { DATA_CHANGED, openAuthenticatedStream } from '@services/realtime';
import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export const EVENT_LABELS: Record<string, string> = {
  PAYMENT_PENDING: 'Pedido pendiente de pago',
  PAYMENT_REMINDER: 'Recordatorio de pago pendiente',
  PAYMENT_FAILED: 'Intento de pago no completado',
  PAYMENT_EXPIRED: 'Plazo de pago vencido',
  PAYMENT_REPORTED: 'Pago reportado',
  PAYMENT_OBSERVED: 'Corrección solicitada',
  PAYMENT_APPROVED: 'Pago verificado',
  PAYMENT_REJECTED: 'Reporte rechazado',
  PAYMENT_REFUNDED: 'Devolución registrada',
  EXPERIENCE_REVIEW_READY: 'Experiencia QR lista para revisi?n',
  EXPERIENCE_PUBLISHED: 'Experiencia QR publicada',
  ORDER_CONFIRMED: 'Pedido confirmado',
  ORDER_RECEIVED: 'Pedido recibido · contacto inicial',
  ORDER_PREPARING: 'En preparación',
  ORDER_READY: 'Listo para entregar',
  ORDER_OUT_FOR_DELIVERY: 'En reparto',
  ORDER_DELIVERED: 'Entregado · agradecimiento',
  ORDER_CANCELLED: 'Cancelado',
  DESIGN_QUOTED: 'Diseño cotizado',
};
export const ORDER_TEMPLATE_SUGGESTIONS: Record<string, string> = {
  ORDER_RECEIVED: 'Hola, somos Misky Challay. Recibimos tu pedido {{1}}. El pago está pendiente de confirmación. Escríbenos para coordinar el diseño, las referencias y la entrega o el recojo. Detalle: {{2}}',
  ORDER_CONFIRMED: 'Hola, somos Misky Challay. Tu pedido {{1}} está confirmado. Coordinemos contigo el diseño, las referencias y la entrega o el recojo. Puedes responder a este mensaje. Detalle: {{2}}',
  ORDER_DELIVERED: 'Tu pedido {{1}} fue entregado. Gracias por confiar en Misky Challay. Esperamos que disfrutes tu celebración. Si necesitas ayuda, contáctanos. Detalle: {{2}}',
};
export const DELIVERY_LABELS: Record<string, string> = {
  QUEUED: 'En cola',
  PROCESSING: 'Enviando',
  ACCEPTED: 'Aceptado por el proveedor',
  DELIVERED: 'Entregado',
  READ: 'Leído',
  FAILED: 'Falló',
  BLOCKED: 'Requiere configuración',
  UNKNOWN: 'Resultado por comprobar',
  SIMULATED: 'Simulado · sin envío real',
  SKIPPED: 'Omitido',
  RECEIVED: 'Recibido',
};
export interface MessagingConfig {
  enabled: boolean;
  testMode: boolean;
  supportPhone: string;
  botEnabled: boolean;
  paymentReminders: {
    enabled: boolean;
    delayMinutes: number;
    activatedAt: string | null;
  };
  phoneNumberId: string;
  graphVersion: string;
  language: string;
  welcome: string;
  deliveryInfo: string;
  humanReply: string;
  closedReply: string;
  openingTime: string;
  closingTime: string;
  workingDays: number[];
  events: Record<
    string,
    { email: boolean; whatsapp: boolean; template: string; emailText?: string }
  >;
}
export interface MessagingSettings {
  config: MessagingConfig;
  accessTokenConfigured: boolean;
  appSecretConfigured: boolean;
  verifyToken: string;
  connectionReady: boolean;
  webhookReady: boolean;
  smtpConfigured?: boolean;
  whatsappUpdatesEnabled?: boolean;
  emailNotificationsEnabled?: boolean;
  webhookPath?: string;
}
export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  isTest: boolean;
  mode: 'BOT' | 'HUMAN';
  assignedTo: number | null;
  optedOutAt: string | null;
  lastInboundAt: string | null;
  lastMessage: string;
  unread: number;
}
export interface ChatMessage {
  id: number;
  direction: 'IN' | 'OUT';
  body: string;
  state: string;
  actorId: number | null;
  createdAt: string;
}
export interface ConversationDetail {
  conversation: Conversation;
  messages: ChatMessage[];
  hasMore: boolean;
}
export interface Delivery {
  id: number;
  channel: 'EMAIL' | 'WHATSAPP';
  recipient: string;
  subject: string;
  event: string;
  state: string;
  simulation: boolean;
  attempts: number;
  error: string | null;
  createdAt: string;
  providerMessageId: string | null;
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
const base = '/communications';
/** El sondeo continúa si el proxy corta la conexión de eventos. */
export const subscribeCommunications = (onChange: () => void): (() => void) => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connect = async () => {
    try {
      const response = await openAuthenticatedStream(`${base}/events`, controller.signal);
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const result = await reader.read();
        if (result.done) break;
        buffer = `${buffer}${decoder.decode(result.value, { stream: true })}`.slice(-65536);
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        if (blocks.some((block) => block.includes('event: change'))) onChange();
      }
    } catch {
      /* Se conserva la actualización periódica. */
    } finally {
      if (!controller.signal.aborted) timer = setTimeout(() => void connect(), 5000);
    }
  };
  const onActivity = (event: Event) => { if ((event as CustomEvent<string[]>).detail?.some((topic) => ['communications', 'resync'].includes(topic))) onChange(); };
  window.addEventListener(DATA_CHANGED, onActivity);
  void connect();
  return () => {
    window.removeEventListener(DATA_CHANGED, onActivity);
    controller.abort();
    if (timer) clearTimeout(timer);
  };
};
export const communicationsApi = {
  async checkConnection() {
    return (
      await api.post<
        ApiSuccess<{ displayPhone: string; verifiedName: string; matchesSupportPhone: boolean }>
      >(`${base}/connection/check`)
    ).data.data;
  },
  async settings() {
    return (await api.get<ApiSuccess<MessagingSettings>>(`${base}/settings`)).data.data;
  },
  async save(
    config: MessagingConfig,
    secrets: {
      accessToken: string;
      appSecret: string;
      clearAccessToken: boolean;
      clearAppSecret: boolean;
      rotateVerifyToken: boolean;
    },
  ) {
    return (
      await api.put<ApiSuccess<MessagingSettings>>(`${base}/settings`, { config, ...secrets })
    ).data.data;
  },
  async conversations(search = '', page = 1) {
    return (
      await api.get<ApiSuccess<Paged<Conversation>>>(`${base}/conversations`, {
        params: { search, page },
      })
    ).data.data;
  },
  async conversation(id: number, before?: number) {
    return (
      await api.get<ApiSuccess<ConversationDetail>>(`${base}/conversations/${id}`, {
        params: { before },
      })
    ).data.data;
  },
  async mode(id: number, mode: 'BOT' | 'HUMAN') {
    await api.post(`${base}/conversations/${id}/mode`, { mode });
  },
  async reply(id: number, text: string, key: string) {
    await api.post(`${base}/conversations/${id}/reply`, { text, key });
  },
  async deliveries(page = 1, state = '', channel = '', event = '') {
    return (
      await api.get<ApiSuccess<Paged<Delivery>>>(`${base}/deliveries`, {
        params: {
          page,
          state: state || undefined,
          channel: channel || undefined,
          event: event || undefined,
        },
      })
    ).data.data;
  },
  async retry(id: number, acknowledgeUnknown: boolean) {
    await api.post(`${base}/deliveries/${id}/retry`, { acknowledgeUnknown });
  },
  async simulate(phone: string, text: string) {
    return (
      await api.post<ApiSuccess<{ conversationId: number }>>(`${base}/test/incoming`, {
        phone,
        text,
      })
    ).data.data;
  },
  async test(channel: 'EMAIL' | 'WHATSAPP', recipient: string) {
    return (
      await api.post<ApiSuccess<{ simulation: boolean; deliveryId: number }>>(
        `${base}/test/delivery`,
        { channel, recipient },
      )
    ).data.data;
  },
};
