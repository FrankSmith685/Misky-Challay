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
    }),
  ),
);

export default router;
