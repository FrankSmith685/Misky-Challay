import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge as MuiBadge, Box, Divider, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import { BellRing, ChefHat, CircleCheck, Clock3, MapPin, RefreshCw, Truck } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { OrderStatusBadge } from '@features/orders/components/OrderStatusBadge';
import { ROUTES } from '@constants/routes';
import { formatRelative } from '@lib/format';
import { adminApi } from '../services/admin.service';
import type { AdminOrderRow } from '../types';

const ACTIVE_STATUSES = 'CONFIRMED,PREPARING,READY,OUT_FOR_DELIVERY';
const POLL_MS = 15_000;
const eventKey = (order: AdminOrderRow) => `${order.id}:${order.status}`;

const iconFor = (status: string) => {
  if (status === 'PREPARING') return ChefHat;
  if (status === 'READY') return CircleCheck;
  if (status === 'OUT_FOR_DELIVERY') return Truck;
  return Clock3;
};

/** Bandeja viva: pedido + estado forman un evento operativo independiente. */
export const AdminOrderNotifications = ({ userId }: { userId: number }) => {
  const storageKey = `verde-bowl:admin-order-events-seen:${userId}`;
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[]); }
    catch { return new Set(); }
  });
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const previous = useRef<Set<string>>(new Set());
  const loadedOnce = useRef(false);

  const load = async () => {
    try {
      const { rows } = await adminApi.orders({ status: ACTIVE_STATUSES, page: 1, pageSize: 20 });
      const current = new Set(rows.map(eventKey));
      if (loadedOnce.current) {
        const incoming = rows.filter((order) => order.status === 'CONFIRMED' && !previous.current.has(eventKey(order)));
        if (incoming.length === 1) toast.warning(`Nuevo pedido ${incoming[0].orderNumber} esperando atención`);
        if (incoming.length > 1) toast.warning(`${incoming.length} pedidos nuevos esperando atención`);
      }
      previous.current = current;
      loadedOnce.current = true;
      setOrders(rows);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unread = orders.filter((order) => !seen.has(eventKey(order)));
  const open = (element: HTMLElement) => {
    setAnchor(element);
    const compact = [...new Set([...seen, ...orders.map(eventKey)])].slice(-250);
    localStorage.setItem(storageKey, JSON.stringify(compact));
    setSeen(new Set(compact));
  };

  return (
    <>
      <IconButton aria-label={`Alertas de pedidos${unread.length ? ` (${unread.length} nuevas)` : ''}`} onClick={(event) => open(event.currentTarget)} sx={{ width: 44, height: 44, color: unread.length ? 'primary.dark' : 'text.secondary' }}>
        <MuiBadge badgeContent={unread.length} color="error" max={9}><BellRing size={20} /></MuiBadge>
      </IconButton>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { width: 'min(94vw, 400px)', mt: 1, borderRadius: 'var(--radius-card)', maxHeight: 520 } } }}>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 850 }}>Centro de pedidos</Typography><Typography variant="caption" color="text.secondary">Se actualiza cada 15 segundos según tu alcance</Typography></Box>
          <IconButton size="small" aria-label="Actualizar alertas" onClick={() => void load()}><RefreshCw size={16} /></IconButton>
        </Box>
        <Divider />

        {isLoading && <MenuItem disabled>Cargando operación…</MenuItem>}
        {!isLoading && hasError && <Box sx={{ px: 2, py: 2 }}><Typography variant="body2" sx={{ fontWeight: 750 }}>No pudimos actualizar los pedidos</Typography><Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>Reintentar</Button></Box>}
        {!isLoading && !hasError && orders.length === 0 && <Box sx={{ px: 2, py: 3, textAlign: 'center' }}><CircleCheck size={28} className="mx-auto text-brand-600" /><Typography sx={{ mt: 1, fontWeight: 750 }}>Operación al día</Typography><Typography variant="caption" color="text.secondary">No hay pedidos activos esperando seguimiento.</Typography></Box>}

        {!hasError && orders.slice(0, 10).map((order) => {
          const Icon = iconFor(order.status);
          const isUnread = !seen.has(eventKey(order));
          const destination = order.deliveryType === 'DELIVERY'
            ? order.addressSnapshotJson?.districtName ?? 'Delivery'
            : order.deliveryType === 'DINE_IN'
              ? `${order.diningTable?.code ?? 'Mesa'} · ${order.branch?.name ?? 'Salón'}`
              : order.branch?.name ?? 'Recojo';
          return <MenuItem key={eventKey(order)} component={Link} to={`${ROUTES.adminOrders}?q=${encodeURIComponent(order.orderNumber)}`} onClick={() => setAnchor(null)} sx={{ alignItems: 'flex-start', gap: 1.25, whiteSpace: 'normal', py: 1.35, borderLeft: '3px solid', borderColor: isUnread ? 'primary.main' : 'transparent', bgcolor: isUnread ? 'primary.50' : 'transparent' }}>
            <Box sx={{ mt: .15, display: 'grid', width: 34, height: 34, flexShrink: 0, placeItems: 'center', borderRadius: 'var(--radius-card)', bgcolor: isUnread ? 'primary.main' : 'action.hover', color: isUnread ? 'primary.contrastText' : 'text.secondary' }}><Icon size={16} /></Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}><Typography variant="body2" sx={{ fontWeight: 850 }}>{order.orderNumber}</Typography><OrderStatusBadge status={order.status} /></Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: .4, display: 'flex', alignItems: 'center', gap: .5 }}><MapPin size={12} /> {destination} · {formatRelative(order.placedAt)}</Typography>
            </Box>
          </MenuItem>;
        })}

        <Box sx={{ position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', px: 1.5, py: 1 }}>
          <Typography variant="caption" color="text.secondary">{orders.length} activos</Typography>
          <Button size="sm" component={Link} to={ROUTES.adminOrders} onClick={() => setAnchor(null)}>Abrir tablero</Button>
        </Box>
      </Menu>
    </>
  );
};
