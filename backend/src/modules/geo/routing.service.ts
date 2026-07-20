import { env } from '@config/env';
import { logger } from '@config/logger';

interface Coordinate { latitude: number; longitude: number }

/** Ruta OSRM-compatible opcional. Sin proveedor, el flujo conserva una estimacion local funcional. */
export const routingService = {
  async route(origin: Coordinate, destination: Coordinate): Promise<{ minutes: number; distanceKm: number; source: 'LIVE_ROUTE' } | null> {
    if (!env.ROUTING_BASE_URL) return null;
    const base = env.ROUTING_BASE_URL.replace(/\/$/, '');
    const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    try {
      const response = await fetch(`${base}/route/v1/driving/${coordinates}?overview=false&steps=false`, {
        headers: { 'User-Agent': 'VerdeBowl/1.0' },
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) return null;
      const payload = await response.json() as { routes?: Array<{ duration: number; distance: number }> };
      const route = payload.routes?.[0];
      if (!route) return null;
      return { minutes: Math.max(1, Math.ceil(route.duration / 60)), distanceKm: Math.round(route.distance / 100) / 10, source: 'LIVE_ROUTE' };
    } catch (error) {
      logger.warn('Proveedor de rutas no disponible; se usa el ETA local', error);
      return null;
    }
  },
};
