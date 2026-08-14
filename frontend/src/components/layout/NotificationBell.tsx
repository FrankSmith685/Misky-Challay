import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Box, Divider, IconButton, Menu, MenuItem, Stack, Typography } from '@mui/material';
import { Bell, RefreshCw } from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { Button } from '@components/ui/Button';
import { getApiErrorMessage } from '@services/api/client';
import { formatDate } from '@lib/format';
import { accountApi, type AccountNotification } from '@features/account/services/account.service';

/** Cuantas se ven sin desplegar. El resto sale con "Ver todas". */
const VISIBLE_LIMIT = 8;

/** Campana de notificaciones: carga las actualizaciones de pedidos y las muestra en un menú. */
export const NotificationBell = () => {
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  /* Abrir el menu marca todo como leido, asi que para cuando se dibujaba ya no
   * quedaba ninguna sin leer y "nueva" y "vista" se pintaban igual. Esta foto del
   * momento de abrir es la que se resalta. */
  const [newIds, setNewIds] = useState<Set<number>>(() => new Set());
  const hasLoadedOnce = useRef(false);
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const list = await accountApi.listNotifications();
        if (cancelled) return;
        hasLoadedOnce.current = true;
        setNotifications(list);
        setLoadError(null);
      } catch (error) {
        // Un refresco caido no borra lo que ya se veia: el aviso de error solo
        // aparece cuando nunca llegamos a tener lista, para no confundir "vacio"
        // con "no pudimos preguntar".
        if (cancelled || hasLoadedOnce.current) return;
        setLoadError(getApiErrorMessage(error));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [retryNonce]);

  const retry = () => {
    setIsLoading(true);
    setLoadError(null);
    setRetryNonce((nonce) => nonce + 1);
  };

  const close = () => {
    setAnchor(null);
    setShowAll(false);
  };

  const openNotifications = (element: HTMLElement) => {
    const unread = notifications.filter((notification) => !notification.readAt);
    setNewIds(new Set(unread.map((notification) => notification.id)));
    setAnchor(element);
    if (unread.length === 0) return;
    setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString() })));
    void accountApi.markNotificationsRead().catch(() => undefined);
  };

  const visible = showAll ? notifications : notifications.slice(0, VISIBLE_LIMIT);
  const hiddenCount = notifications.length - visible.length;

  return (
    <>
      {/* 44px: mismo paso `md` que el resto de controles de la cabecera. */}
      <IconButton
        aria-label={`Ver notificaciones${unreadCount ? ` (${unreadCount} nuevas)` : ''}`}
        onClick={(event) => openNotifications(event.currentTarget)}
        sx={{ width: 44, height: 44 }}
      >
        <Badge badgeContent={unreadCount} color="primary" max={9}>
          <Bell size={20} />
        </Badge>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} slotProps={{ paper: { sx: { width: 'min(92vw, 360px)', mt: 1, borderRadius: 'var(--radius-card)', maxHeight: 430 } } }}>
        <Box sx={{ px: 2, py: 1.2 }}>
          <Typography sx={{ fontWeight: 800 }}>Actualizaciones</Typography>
          <Typography variant="caption" color="text.secondary">Pedidos, planes y avisos de tu cuenta</Typography>
        </Box>
        <Divider />

        {isLoading && <MenuItem disabled>Cargando tus avisos…</MenuItem>}

        {!isLoading && loadError && (
          <Box sx={{ px: 2, py: 1.75 }}>
            <Typography variant="body2" sx={{ fontWeight: 750 }}>No pudimos cargar tus avisos</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .25, mb: 1.25 }}>{loadError}</Typography>
            <Button size="sm" variant="outline" leftIcon={<RefreshCw className="size-4" />} onClick={retry}>Reintentar</Button>
          </Box>
        )}

        {!isLoading && !loadError && notifications.length === 0 && (
          <MenuItem disabled sx={{ whiteSpace: 'normal' }}>No tienes actualizaciones todavía</MenuItem>
        )}

        {!loadError && visible.map((notification) => {
          const isNew = newIds.has(notification.id);
          const to = notification.actionUrl
            ?? (notification.order ? ROUTES.accountOrderDetail(notification.order.orderNumber) : null);
          const detail = (
            <>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                <Typography variant="body2" sx={{ flex: 1, fontWeight: isNew ? 800 : 600 }}>{notification.subject}</Typography>
                {/* El color solo no basta: el fondo de "nueva" es muy suave a proposito. */}
                {isNew && (
                  <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'primary.dark' }}>
                    Nuevo
                  </Typography>
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {formatDate(notification.sentAt ?? notification.createdAt)}
              </Typography>
            </>
          );

          return (
            <MenuItem
              key={notification.id}
              onClick={close}
              sx={{
                whiteSpace: 'normal',
                py: 1.25,
                borderLeft: '3px solid',
                borderColor: isNew ? 'primary.main' : 'transparent',
                bgcolor: isNew ? 'primary.50' : 'transparent',
              }}
            >
              {to ? (
                <Box component={Link} to={to} sx={{ display: 'block', width: '100%', color: 'inherit', textDecoration: 'none' }}>
                  {detail}
                </Box>
              ) : (
                <Box sx={{ width: '100%' }}>{detail}</Box>
              )}
            </MenuItem>
          );
        })}

        {!isLoading && !loadError && notifications.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            {hiddenCount > 0
              ? <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>Ver todas ({notifications.length})</Button>
              : <Box />}
            <Button size="sm" variant="ghost" component={Link} to={ROUTES.accountOrders} onClick={close}>
              Ir a mis pedidos
            </Button>
          </Box>
        )}
      </Menu>
    </>
  );
};
