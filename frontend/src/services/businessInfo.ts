import { useEffect, useState } from 'react';
import api from '@services/api/client';
import { DATA_CHANGED } from '@services/realtime';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';

/**
 * IDENTIDAD DEL NEGOCIO
 * ---------------------------------------------------------------------------
 * Los datos legales del proveedor (razon social, RUC, domicilio) viven en el
 * backend y se sirven en /settings/public. El frontend los lee una sola vez y los
 * cachea en memoria: aparecen en el footer, las paginas legales y el Libro de
 * Reclamaciones sin repetir la razon social en el codigo del cliente.
 *
 * Hay un valor de reserva por si el backend no responde: las paginas legales no
 * pueden quedar en blanco, aunque muestren datos genericos hasta que cargue.
 */
export interface BusinessInfo {
  legalName: string;
  commercialName: string;
  ruc: string;
  address: string;
  phone: string;
  whatsappPhone?: string;
  email: string;
  supportEmail: string;
  complaintResponseDays: number;
}

/** Configuracion publica del pago contra entrega. */
export interface CodSettings {
  enabled: boolean;
  maxAmount: number;
}

/** Reglas de facturacion visibles al cliente. */
export interface InvoicingSettings {
  /** Importe a partir del cual la boleta pide DNI (regla SUNAT). */
  boletaDniThreshold: number;
}

export interface LocalPaymentSettings {
  paymentWindowMinutes?: number;
  reviewAlertMinutes?: number;
  yapeEnabled: boolean; yapePhone: string; yapeRecipient: string; yapeQrImageUrl: string;
  plinEnabled: boolean; plinPhone: string; plinRecipient: string; plinQrImageUrl: string;
  instructions: string;
}

/**
 * Pago con tarjeta. Antes la unica condicion posible era «hay importe que
 * cobrar»: un negocio sin pasarela configurada seguia ofreciendo un medio que el
 * backend rechazaria al confirmar, con el carrito ya lleno.
 */
export interface OnlinePaymentSettings {
  onlineEnabled: boolean;
  onlineProvider?: string;
}

export interface ReceiptSettings {
  mode: 'INTERNAL_ONLY' | 'EXTERNAL_MANUAL' | 'INTEGRATED';
  autoPrintKitchenTicket: boolean;
  autoPrintCustomerTicket: boolean;
  paperWidth: 58 | 80;
}

interface PublicSettings {
  business: BusinessInfo;
  cod: CodSettings;
  invoicing: InvoicingSettings;
  localPayments: LocalPaymentSettings;
  payments: OnlinePaymentSettings;
  receipts: ReceiptSettings;
}

const FALLBACK: PublicSettings = {
  business: {
    legalName: 'Misky Challay (datos legales pendientes)',
    commercialName: 'Misky Challay',
    ruc: '20600000000',
    address: 'Miraflores, Lima',
    phone: '+51 999 999 999',
    email: 'contacto@ejemplo.com',
    supportEmail: 'reclamos@ejemplo.com',
    complaintResponseDays: 15,
  },
  cod: { enabled: false, maxAmount: 300 },
  invoicing: { boletaDniThreshold: 700 },
  localPayments: {
    yapeEnabled: false, yapePhone: '', yapeRecipient: '', yapeQrImageUrl: '',
    plinEnabled: false, plinPhone: '', plinRecipient: '', plinQrImageUrl: '',
    instructions: 'Paga el importe exacto e ingresa el codigo de operacion.',
  },
  // El respaldo asume que si: sin respuesta del servidor es mejor ofrecer la
  // tarjeta y que falle al confirmar que dejar al cliente sin medio de pago.
  payments: { onlineEnabled: true },
  receipts: { mode: 'INTERNAL_ONLY', autoPrintKitchenTicket: true, autoPrintCustomerTicket: false, paperWidth: 80 },
};

// Promesa compartida: aunque varios componentes la pidan a la vez, se hace una sola
// peticion.
let cache: PublicSettings | null = null;
let loadedAt = 0;
let inflight: Promise<PublicSettings> | null = null;

const loadSettings = async (): Promise<PublicSettings> => {
  if (cache && Date.now() - loadedAt < 30000) return cache;
  if (inflight) return inflight;

  inflight = api
    .get<ApiSuccess<PublicSettings>>(ENDPOINTS.settings.public)
    .then((response) => {
      cache = {
        business: response.data.data.business,
        cod: response.data.data.cod ?? FALLBACK.cod,
        invoicing: response.data.data.invoicing ?? FALLBACK.invoicing,
        localPayments: response.data.data.localPayments ?? FALLBACK.localPayments,
        payments: response.data.data.payments ?? FALLBACK.payments,
        receipts: response.data.data.receipts ?? FALLBACK.receipts,
      };
      loadedAt = Date.now();
      window.dispatchEvent(new CustomEvent('business-info-updated', { detail: cache }));
      return cache;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = null;
    });

  return inflight;
};

/** Refresca la fuente pública después de que el superadmin guarda cambios. */
export const refreshBusinessInfo = async (): Promise<BusinessInfo> => {
  loadedAt = 0;
  const loaded = await loadSettings();
  localStorage.setItem('dulceflow:settings-version', String(Date.now()));
  return loaded.business;
};

const useSettings = (): PublicSettings => {
  const [settings, setSettings] = useState<PublicSettings>(cache ?? FALLBACK);

  useEffect(() => {
    let active = true;
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<PublicSettings>).detail;
      if (active && detail) setSettings(detail);
    };
    window.addEventListener('business-info-updated', handleUpdate);
    const revalidate = () => { if (!document.hidden) void loadSettings().then((loaded) => { if (active) setSettings(loaded); }); };
    const invalidate = (event: Event) => {
      if (event.type === DATA_CHANGED && !(event as CustomEvent<string[]>).detail?.some((topic) => ['settings', 'resync'].includes(topic))) return;
      if (event.type === 'storage' && (event as StorageEvent).key !== 'dulceflow:settings-version') return;
      loadedAt = 0; revalidate();
    };
    window.addEventListener('focus', revalidate); window.addEventListener('online', revalidate);
    window.addEventListener('storage', invalidate); window.addEventListener(DATA_CHANGED, invalidate);
    const timer = window.setInterval(revalidate, 30000);
    void loadSettings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    return () => {
      active = false;
      window.removeEventListener('business-info-updated', handleUpdate);
      clearInterval(timer); window.removeEventListener('focus', revalidate); window.removeEventListener('online', revalidate); window.removeEventListener('storage', invalidate); window.removeEventListener(DATA_CHANGED, invalidate);
    };
  }, []);

  return settings;
};

/** La info del negocio, con el fallback disponible desde el primer render. */
export const useBusinessInfo = (): BusinessInfo => useSettings().business;

/** Configuracion del pago contra entrega (activo y tope). */
export const useCodSettings = (): CodSettings => useSettings().cod;

/** Reglas de facturacion (umbral de DNI en boleta). */
export const useInvoicingSettings = (): InvoicingSettings => useSettings().invoicing;

export const useLocalPaymentSettings = (): LocalPaymentSettings => useSettings().localPayments;

/** Si la pasarela esta configurada y se puede ofrecer el pago con tarjeta. */
export const useOnlinePaymentSettings = (): OnlinePaymentSettings => useSettings().payments;

export const useReceiptSettings = (): ReceiptSettings => useSettings().receipts;
