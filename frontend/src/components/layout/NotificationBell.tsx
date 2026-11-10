import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Box, Chip, Divider, IconButton, ListItemIcon, Popover, Stack, Typography } from '@mui/material';
import {
  Bell,
  BellRing,
  CircleAlert,
  CreditCard,
  Gift,
  LockKeyhole,
  PackageCheck,
  SearchCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { getApiErrorMessage } from '@services/api/client';
import { announceDataChanged, useLiveRefresh } from '@services/realtime';
import { formatDate } from '@lib/format';
import { notificationDestination } from '@lib/notificationDestination';
import { ROUTES } from '@constants/routes';
import { accountApi, type AccountNotification } from '@features/account/services/account.service';
import { notificationCategory, notificationCategoryLabel, type NotificationCategory } from '@features/account/notificationMeta';

const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
  ORDER: PackageCheck,
  PAYMENT: CreditCard,
  PLAN: Gift,
  COMPLAINT: SearchCheck,
  AVAILABILITY: BellRing,
  SECURITY: LockKeyhole,
  OTHER: Bell,
};

export const NotificationBell = ({ audience = 'CUSTOMER' }: { audience?: 'CUSTOMER' | 'STAFF' }) => {
  const [items, setItems] = useState<AccountNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [newestId, setNewestId] = useState(0);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await accountApi.notificationFeed(audience, page, 15);
      if (request !== sequence.current) return;
      setItems(result.items);
      setUnread(result.unreadCount);
      setPages(result.totalPages);
      setNewestId(result.newestId);
      setError(null);
    } catch (cause) {
      if (request === sequence.current) setError(getApiErrorMessage(cause));
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [audience, page]);

  useEffect(() => {
    setLoading(true);
    void load();
    const cancelPendingReads = () => { sequence.current++; };
    return cancelPendingReads;
  }, [load]);

  useLiveRefresh(['notifications'], load);

  const close = () => setAnchor(null);
  const read = async (item?: AccountNotification) => {
    try {
      await accountApi.markNotificationsRead(item ? { ids: [item.id], audience } : { all: true, audience, throughId: newestId });
      announceDataChanged(['notifications']);
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  };

  return (
    <>
      <IconButton aria-label={`Ver notificaciones${unread ? ` (${unread} nuevas)` : ''}`} onClick={(event) => { setAnchor(event.currentTarget); void load(); }} sx={{ width: 44, height: 44 }}>
        <Badge badgeContent={unread} color="primary" max={99}><Bell size={20} /></Badge>
      </IconButton>

      <Popover
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        // El encabezado es sticky y el cliente debe poder consultar avisos sin
        // que MUI bloquee el body y cambie la posición de scroll de la página.
        disableScrollLock
        // El foco automático del modal podía reajustar el scroll cuando la
        // campana se abría o se cerraba al final de una página larga.
        disableAutoFocus
        disableRestoreFocus
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, width: 'min(94vw, 420px)', overflow: 'hidden', border: '1px solid var(--color-line)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-e3)' } } }}
      >
        <Box>
          <Box sx={{ px: 2, py: 1.75, bgcolor: 'background.paper' }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: 'center' }}>
                <Box sx={{ display: 'grid', placeItems: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 'var(--radius-card)', bgcolor: 'var(--color-brand-50)', color: 'var(--color-brand-700)' }}>
                  <BellRing size={19} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 850, lineHeight: 1.2 }}>Notificaciones</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>{audience === 'STAFF' ? 'Avisos de tu trabajo y tus sucursales' : 'Pedidos, pagos y avisos de tu cuenta'}</Typography>
                </Box>
              </Stack>
              <Chip size="small" label={unread ? `${unread} sin leer` : 'Todo al día'} color={unread ? 'primary' : 'default'} />
            </Stack>
          </Box>

          <Divider />

          <Box sx={{ maxHeight: 390, overflowY: 'auto', p: 1 }}>
            {loading && <Box sx={{ px: 1.5, py: 3, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">Cargando avisos...</Typography></Box>}
            {error && (
              <Box sx={{ p: 1.5 }} role="alert">
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}><CircleAlert size={17} /><Typography variant="body2">{error}</Typography></Stack>
                <Button size="sm" variant="outline" onClick={() => void load()} className="mt-3">Reintentar</Button>
              </Box>
            )}
            {!loading && !items.length && !error && <Box sx={{ px: 1.5, py: 3, textAlign: 'center' }}><Bell size={22} className="mx-auto text-brand-600" /><Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>No tienes actualizaciones todavía</Typography><Typography variant="caption" color="text.secondary">Te avisaremos cuando haya algo importante.</Typography></Box>}

            {items.map((item) => {
              const category = notificationCategory(item);
              const Icon = CATEGORY_ICONS[category];
              const destination = notificationDestination(item);
              const content = (
                <Stack direction="row" spacing={1.25} sx={{ width: '100%', alignItems: 'flex-start' }}>
                  <ListItemIcon sx={{ minWidth: 32, mt: .25, color: item.readAt ? 'text.secondary' : 'primary.main' }}><Icon size={19} /></ListItemIcon>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 750 }}>{notificationCategoryLabel[category]}</Typography>
                      {!item.readAt && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main' }} aria-label="No leída" />}
                    </Stack>
                    <Typography variant="body2" sx={{ mt: .25, fontWeight: item.readAt ? 550 : 800, lineHeight: 1.35 }}>{item.subject}</Typography>
                    {item.body && <Typography variant="caption" component="p" sx={{ mt: .35, lineHeight: 1.45 }}>{item.body}</Typography>}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .55 }}>{formatDate(item.sentAt ?? item.createdAt)}</Typography>
                  </Box>
                </Stack>
              );
              const sx = { display: 'flex', width: '100%', whiteSpace: 'normal', alignItems: 'flex-start', px: 1.25, py: 1.25, mb: .5, borderRadius: 'var(--radius-field)', bgcolor: item.readAt ? 'transparent' : 'var(--color-brand-50)', '&:hover': { bgcolor: item.readAt ? 'var(--color-surface-muted)' : 'var(--color-brand-100)' } } as const;
              return destination ? <Box key={item.id} component={Link} to={destination} onClick={() => { if (!item.readAt) void read(item); close(); }} sx={sx}>{content}</Box> : <Box key={item.id} component="button" type="button" onClick={() => { if (!item.readAt) void read(item); }} sx={{ ...sx, border: 0, textAlign: 'left', font: 'inherit', cursor: item.readAt ? 'default' : 'pointer' }}>{content}</Box>;
            })}
          </Box>

          <Divider />

          <Box sx={{ p: 1.5, bgcolor: 'background.paper' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Button size="sm" variant="ghost" disabled={!unread || !items.length} onClick={() => void read()}>Marcar todo como leído</Button>
              <Button component={Link} to={ROUTES.accountNotifications} size="sm" variant="outline" onClick={close}>Ver todas</Button>
            </Stack>
            {pages > 1 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
                <Typography variant="caption" color="text.secondary">{page}/{pages}</Typography>
                <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Siguiente</Button>
              </Stack>
            )}
          </Box>
        </Box>
      </Popover>
    </>
  );
};
