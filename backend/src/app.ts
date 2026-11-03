import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';

import { env, isDevelopment } from '@config/env';
import { apiLimiter } from '@middlewares/rateLimit.middleware';
import { errorHandler, notFoundHandler } from '@middlewares/error.middleware';
import apiRoutes from './routes';
import { storefrontSeoRouter } from '@modules/settings/storefront.seo';

export const createApp = (): Application => {
  const app = express();

  // Detras de un proxy, req.ip debe ser la del cliente y no la del proxy: de ello dependen
  // el rate limiting por IP y la IP que queda registrada en audit_logs.
  app.set('trust proxy', env.TRUST_PROXY);

  // Seguridad y utilidades base
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  // El webhook de pagos necesita el body crudo para validar la firma (RN-015).
  app.use(`${env.API_PREFIX}/payments/webhooks`, express.raw({ type: '*/*' }));
  app.use(`${env.API_PREFIX}/communications/webhook`, express.raw({ type: 'application/json', limit: '2mb' }));
  // Las imagenes del panel llegan ya recortadas y optimizadas en WebP desde el navegador.
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Trazabilidad: correlation_id por peticion (seccion 17)
  app.use((req, res, next) => {
    req.correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    res.setHeader('x-correlation-id', req.correlationId);
    next();
  });

  if (isDevelopment) {
    app.use(morgan('dev'));
  } else {
    // Sin esto, en produccion no queda ni un log de acceso: los 4xx, los 429 y las
    // latencias son invisibles. Formato JSON para que lo lea el agregador.
    morgan.token('correlationId', (req) => (req as express.Request).correlationId ?? '-');
    app.use(
      morgan(
        (tokens, req, res) =>
          JSON.stringify({
            time: tokens.date(req, res, 'iso'),
            level: 'access',
            method: tokens.method(req, res),
            url: tokens.url(req, res),
            status: Number(tokens.status(req, res)),
            durationMs: Number(tokens['response-time'](req, res)),
            ip: tokens['remote-addr'](req, res),
            correlationId: tokens.correlationId?.(req, res),
          }),
        { skip: (_req, res) => res.statusCode === 200 && _req.url === '/health' },
      ),
    );
  }

  // Las sondas van ANTES del limitador: si el orquestador sondea cada pocos segundos
  // desde varias instancias, acabaria consumiendo la cuota y recibiendo 429. Un 429
  // en /ready se lee como "instancia enferma" y el balanceador retira nodos sanos:
  // la cascada clasica que convierte un pico de trafico en una caida completa.
  app.use(env.API_PREFIX, (req, res, next) => {
    if (req.path === '/live' || req.path === '/ready') return next();
    return apiLimiter(req, res, next);
  }, apiRoutes);

  app.use(storefrontSeoRouter);

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: 'Misky Challay API',
      docs: `${env.API_PREFIX}/health`,
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
