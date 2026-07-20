import rateLimit from 'express-rate-limit';

/** Limite general del API. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas solicitudes', code: 'TOO_MANY_REQUESTS' },
});

/** Limite estricto para login, registro, recuperacion y cupones (seccion 17.1). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos, espera unos minutos',
    code: 'TOO_MANY_REQUESTS',
  },
});

/**
 * Limite para la cotizacion del checkout. Es holgado a proposito: un cliente
 * legitimo recotiza en cada cambio de direccion, franja o cantidad.
 */
export const quoteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas cotizaciones seguidas, espera un momento',
    code: 'TOO_MANY_REQUESTS',
  },
});

/**
 * Limite estricto para el canje de cupones. /checkout/quote es publico y responde
 * si un codigo existe y cuanto descuenta: sin esto es un oraculo gratuito para
 * enumerar los codigos de campana. Solo cuenta las peticiones que llevan cupon,
 * asi que no afecta a quien simplemente esta cotizando su pedido.
 */
export const couponLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const body = req.body as { couponCode?: unknown } | undefined;
    return !body || typeof body.couponCode !== 'string' || body.couponCode.trim() === '';
  },
  message: {
    success: false,
    message: 'Demasiados intentos con cupones, espera unos minutos',
    code: 'TOO_MANY_REQUESTS',
  },
});

/**
 * Limite para /refresh: mas holgado que el login (una sesion activa renueva cada
 * ~15 min) pero suficiente para frenar el abuso de un refresh token filtrado.
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas renovaciones de sesion, espera unos minutos',
    code: 'TOO_MANY_REQUESTS',
  },
});
