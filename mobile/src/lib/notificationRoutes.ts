import { env } from '../config/env';
import type { Href } from 'expo-router';

/** Destinos válidos para avisos guardados y push, tanto nuevos como históricos. */
export const mobileNotificationHref = (actionUrl: string): Href | null => {
  if (!actionUrl.startsWith('/') || actionUrl.startsWith('//') || actionUrl.includes('\\')) return null;
  const url = new URL(actionUrl, 'https://misky.local');
  if (url.pathname === '/admin/tortas' && ['designs', 'capacity', 'finances', 'commissions', 'overview', 'recipes'].includes(url.searchParams.get('seccion') ?? '')) return `${env.webUrl}${url.pathname}${url.search}` as Href;
  const staff = /^\/(?:staff|admin)\/([a-z-]+)$/.exec(url.pathname);
  if (staff) {
    const names: Record<string, string> = { kitchen: 'kitchen', cocina: 'kitchen', procurement: 'procurement', compras: 'procurement', inventory: 'inventory', inventario: 'inventory', orders: 'orders', pedidos: 'orders', cakes: 'cakes', tortas: 'cakes', reparto: 'delivery', delivery: 'delivery', 'pagos-directos': 'cash', planes: 'web', 'experiencias-qr': 'web' };
    const module = names[staff[1]];
    if (!module) return null;
    if (module === 'web') return `${env.webUrl}${url.pathname}${url.search}` as Href;
    const params: Record<string, string> = { module };
    for (const key of ['branchId', 'tarea', 'solicitud', 'reparto', 'proyecto']) {
      const value = url.searchParams.get(key); if (value && /^\d+$/.test(value)) params[key] = value;
    }
    const pedido = url.searchParams.get('pedido');
    if (pedido && /^[A-Za-z0-9-]+$/.test(pedido)) params.pedido = pedido;
    const section = url.searchParams.get('seccion');
    if (section && ['production', 'designs', 'capacity'].includes(section)) params.seccion = section;
    return { pathname: '/staff/[module]', params } as Href;
  }
  if (url.pathname === '/cuenta/suscripciones') return { pathname: '/plans', params: { suscripcion: url.searchParams.get('suscripcion') ?? '' } } as Href;

  const order = /^\/(?:order|cuenta\/pedidos)\/([A-Za-z0-9-]+)$/.exec(actionUrl);
  if (order) return { pathname: '/order/[orderNumber]', params: { orderNumber: order[1] } } as Href;

  const product = /^\/(?:product|menu|tortas)\/([A-Za-z0-9-]+)$/.exec(actionUrl);
  if (product) return { pathname: '/product/[slug]', params: { slug: product[1] } } as Href;

  if (actionUrl === '/wallet' || actionUrl === '/cuenta/saldo') return '/wallet' as Href;
  if (actionUrl === '/support' || actionUrl === '/libro-de-reclamaciones') return '/support' as Href;
  if (actionUrl === '/plans' || actionUrl === '/planes') return '/plans' as Href;
  if (url.pathname === '/cuenta/disenos') { const id = url.searchParams.get('solicitud'); return (id && /^\d+$/.test(id) ? `/cakes?solicitud=${id}` : '/cakes') as Href; }
  if (actionUrl === '/cakes' || actionUrl === '/cakes/design' || /^\/cuenta\/disenos(?:\?solicitud=\d+)?$/.test(actionUrl)) return '/cakes' as Href;

  return null;
};
