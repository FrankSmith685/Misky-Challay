import { env } from './env';
import { CURRENCY } from './constants';

/**
 * IDENTIDAD LEGAL DEL NEGOCIO
 * ---------------------------------------------------------------------------
 * Una unica fuente para los datos del proveedor que la ley peruana obliga a mostrar
 * al consumidor (Codigo de Proteccion y Defensa del Consumidor, art. 2): razon
 * social, RUC y domicilio. Los consume el footer, las paginas legales, el Libro de
 * Reclamaciones y los correos.
 *
 * Es publica a proposito: no hay ningun secreto aqui, son datos que por ley tienen
 * que estar a la vista.
 */
export const businessInfo = {
  legalName: env.BUSINESS_LEGAL_NAME,
  commercialName: env.BUSINESS_COMMERCIAL_NAME,
  ruc: env.BUSINESS_RUC,
  address: env.BUSINESS_ADDRESS,
  phone: env.BUSINESS_PHONE,
  email: env.BUSINESS_EMAIL,
  supportEmail: env.BUSINESS_SUPPORT_EMAIL,
  complaintResponseDays: env.COMPLAINT_RESPONSE_DAYS,
  timeZone: env.TZ,
  currency: CURRENCY,
  taxRate: env.IGV_RATE,
  platformCommissionRate: 0.15,
} as const;

export type BusinessInfo = typeof businessInfo;
