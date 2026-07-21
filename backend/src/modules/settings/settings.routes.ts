import { Router } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { businessInfo } from '@config/business';
import { env } from '@config/env';

/**
 * Modulo SETTINGS - configuracion publica del sitio.
 * Prefijo: /api/v1/settings
 *
 * Sirve los datos del proveedor que por ley deben estar a la vista (footer, paginas
 * legales, Libro de Reclamaciones). Una sola fuente para el frontend, en vez de
 * repetir la razon social y el RUC en el codigo del cliente.
 */
const router = Router();

router.get(
  '/public',
  asyncHandler(async (_req, res) =>
    ok(res, {
      business: businessInfo,
      igvRate: env.IGV_RATE,
      // Pago contra entrega: el checkout lo ofrece solo si esta activo y bajo el tope.
      cod: {
        enabled: env.COD_ENABLED,
        maxAmount: env.COD_MAX_AMOUNT,
      },
      // A partir de este importe la boleta pide el DNI del comprador (regla SUNAT).
      invoicing: {
        boletaDniThreshold: env.BOLETA_DNI_THRESHOLD,
      },
    }),
  ),
);

export default router;
