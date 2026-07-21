import { useEffect, useState } from 'react';
import api from '@services/api/client';
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

interface PublicSettings {
  business: BusinessInfo;
  cod: CodSettings;
  invoicing: InvoicingSettings;
}

const FALLBACK: PublicSettings = {
  business: {
    legalName: 'Verde Bowl S.A.C.',
    commercialName: 'Verde Bowl',
    ruc: '20600000000',
    address: 'Miraflores, Lima',
    phone: '+51 999 999 999',
    email: 'hola@verdebowl.com',
    supportEmail: 'reclamos@verdebowl.com',
    complaintResponseDays: 15,
  },
  cod: { enabled: true, maxAmount: 300 },
  invoicing: { boletaDniThreshold: 700 },
};

// Promesa compartida: aunque varios componentes la pidan a la vez, se hace una sola
// peticion.
let cache: PublicSettings | null = null;
let inflight: Promise<PublicSettings> | null = null;

const loadSettings = async (): Promise<PublicSettings> => {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = api
    .get<ApiSuccess<PublicSettings>>(ENDPOINTS.settings.public)
    .then((response) => {
      cache = {
        business: response.data.data.business,
        cod: response.data.data.cod ?? FALLBACK.cod,
        invoicing: response.data.data.invoicing ?? FALLBACK.invoicing,
      };
      return cache;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = null;
    });

  return inflight;
};

const useSettings = (): PublicSettings => {
  const [settings, setSettings] = useState<PublicSettings>(cache ?? FALLBACK);

  useEffect(() => {
    let active = true;
    void loadSettings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    return () => {
      active = false;
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
