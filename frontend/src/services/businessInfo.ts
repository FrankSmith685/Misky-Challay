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

const FALLBACK: BusinessInfo = {
  legalName: 'Verde Bowl S.A.C.',
  commercialName: 'Verde Bowl',
  ruc: '20600000000',
  address: 'Miraflores, Lima',
  phone: '+51 999 999 999',
  email: 'hola@verdebowl.com',
  supportEmail: 'reclamos@verdebowl.com',
  complaintResponseDays: 15,
};

// Promesa compartida: aunque tres componentes pidan la info a la vez, se hace una
// sola peticion.
let cache: BusinessInfo | null = null;
let inflight: Promise<BusinessInfo> | null = null;

export const loadBusinessInfo = async (): Promise<BusinessInfo> => {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = api
    .get<ApiSuccess<{ business: BusinessInfo }>>(ENDPOINTS.settings.public)
    .then((response) => {
      cache = response.data.data.business;
      return cache;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = null;
    });

  return inflight;
};

/** La info del negocio, con el fallback disponible desde el primer render. */
export const useBusinessInfo = (): BusinessInfo => {
  const [info, setInfo] = useState<BusinessInfo>(cache ?? FALLBACK);

  useEffect(() => {
    let active = true;
    void loadBusinessInfo().then((loaded) => {
      if (active) setInfo(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  return info;
};
