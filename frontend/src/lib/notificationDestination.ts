import { ROUTES } from '@constants/routes';

type NotificationLink = {
  actionUrl?: string | null;
  order?: { orderNumber: string } | null;
  template?: string;
};

const safePart = /^[A-Za-z0-9-]+$/;
const branchQuery = (url: URL): string => {
  const result = new URLSearchParams();
  for (const key of ['branchId', 'tarea', 'solicitud', 'reparto', 'proyecto', 'suscripcion']) {
    const value = url.searchParams.get(key);
    if (value && /^\d+$/.test(value)) result.set(key, value);
  }
  const order = url.searchParams.get('pedido');
  if (order && safePart.test(order)) result.set('pedido', order);
  const section = url.searchParams.get('seccion');
  if (section && ['production', 'designs', 'capacity', 'commissions', 'finance'].includes(section)) result.set('seccion', section);
  return result.size ? `?${result}` : '';
};

/** Traduce destinos históricos de la app y acepta solo rutas web conocidas. */
export const notificationDestination = ({ actionUrl, order, template }: NotificationLink): string | null => {
  if (actionUrl?.startsWith('/') && !actionUrl.startsWith('//') && !actionUrl.includes('\\')) {
    const url = new URL(actionUrl, 'https://misky.local');
    const path = url.pathname.replace(/\/$/, '') || '/';

    const orderMatch = /^\/(?:order|cuenta\/pedidos)\/([A-Za-z0-9-]+)$/.exec(path);
    if (orderMatch) return ROUTES.accountOrderDetail(encodeURIComponent(orderMatch[1]));

    const productMatch = /^\/(?:product|menu|tortas)\/([A-Za-z0-9-]+)$/.exec(path);
    if (productMatch) return path.startsWith('/tortas/') ? ROUTES.cake(productMatch[1]) : ROUTES.product(productMatch[1]);

    if (path === '/wallet' || path === ROUTES.accountWallet) return ROUTES.accountWallet;
    if (path === '/support' || path === ROUTES.complaints) return ROUTES.complaints;
    if (path === '/cakes' || path === '/cakes/design' || path === ROUTES.designRequests) {
      const requestId = url.searchParams.get('solicitud');
      return `${ROUTES.designRequests}${requestId && /^\d+$/.test(requestId) ? `?solicitud=${requestId}` : ''}`;
    }
    if (path === '/plans' || path === ROUTES.plans) return ROUTES.plans;
    if (path === ROUTES.menu) return ROUTES.menu;
    if (path === ROUTES.accountOrders) return ROUTES.accountOrders;

    if (path === '/staff/kitchen' || path === ROUTES.adminKitchen) return `${ROUTES.adminKitchen}${branchQuery(url)}`;
    if (path === '/staff/procurement' || path === '/admin/procurement' || path === ROUTES.adminProcurement) return `${ROUTES.adminProcurement}${branchQuery(url)}`;
    if (path === '/staff/inventory' || path === '/admin/inventory' || path === ROUTES.adminInventory) return `${ROUTES.adminInventory}${branchQuery(url)}`;
    if ([ROUTES.adminOrders, ROUTES.adminCakes, ROUTES.adminDirectPayments, ROUTES.adminDelivery, ROUTES.adminPlans, '/admin/experiencias-qr', ROUTES.accountSubscriptions].includes(path)) return `${path}${branchQuery(url)}`;
  }

  if (order?.orderNumber && safePart.test(order.orderNumber)) return ROUTES.accountOrderDetail(encodeURIComponent(order.orderNumber));
  if (template === 'PLAN_ACTIVATED') return ROUTES.accountWallet;
  if (template?.startsWith('COMPLAINT_')) return ROUTES.complaints;
  if (template === 'PRODUCT_AVAILABLE') return ROUTES.menu;
  return null;
};
