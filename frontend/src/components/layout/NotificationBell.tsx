import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Box, Divider, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import { Bell } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { getApiErrorMessage } from '@services/api/client';
import { announceDataChanged, useLiveRefresh } from '@services/realtime';
import { formatDate } from '@lib/format';
import { notificationDestination } from '@lib/notificationDestination';
import { accountApi, type AccountNotification } from '@features/account/services/account.service';

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
      const result = await accountApi.notificationFeed(audience, page);
      if (request !== sequence.current) return;
      setItems(result.items); setUnread(result.unreadCount); setPages(result.totalPages); setNewestId(result.newestId); setError(null);
    } catch (cause) { if (request === sequence.current) setError(getApiErrorMessage(cause)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [audience, page]);
  useEffect(() => {
    setLoading(true); void load();
    const cancelPendingReads = () => { sequence.current++; };
    return cancelPendingReads;
  }, [load]);
  useLiveRefresh(['notifications'], load);
  const read = async (item?: AccountNotification) => {
    try {
      await accountApi.markNotificationsRead(item ? { ids: [item.id], audience } : { all: true, audience, throughId: newestId });
      announceDataChanged(['notifications']); await load();
    } catch (cause) { setError(getApiErrorMessage(cause)); }
  };
  return <>
    <IconButton aria-label={`Ver notificaciones${unread ? ` (${unread} nuevas)` : ''}`} onClick={(event) => { setAnchor(event.currentTarget); void load(); }} sx={{ width: 44, height: 44 }}><Badge badgeContent={unread} color="primary" max={99}><Bell size={20} /></Badge></IconButton>
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { width: 'min(92vw, 380px)', maxHeight: 480 } } }}>
      <Box sx={{ px: 2, py: 1.5 }}><Typography sx={{ fontWeight: 800 }}>Actualizaciones</Typography><Typography variant="caption">{audience === 'STAFF' ? 'Avisos de tu trabajo y tus sucursales' : 'Pedidos, planes y avisos de tu cuenta'}</Typography></Box><Divider />
      {loading && <MenuItem disabled>Cargando avisos...</MenuItem>}
      {error && <Box sx={{ p: 2 }} role="alert"><Typography variant="body2">{error}</Typography><Button size="sm" variant="outline" onClick={() => void load()}>Reintentar</Button></Box>}
      {!loading && !items.length && !error && <MenuItem disabled>No tienes actualizaciones todavía</MenuItem>}
      {items.map((item) => {
        const to = notificationDestination(item);
        const content = <Box><Typography variant="body2" sx={{ fontWeight: item.readAt ? 500 : 800 }}>{!item.readAt && '● '}{item.subject}</Typography>{item.body && <Typography variant="caption" component="p">{item.body}</Typography>}<Typography variant="caption" color="text.secondary">{formatDate(item.sentAt ?? item.createdAt)}</Typography></Box>;
        const sx = { whiteSpace: 'normal', py: 1.5, bgcolor: item.readAt ? undefined : 'action.hover' } as const;
        return to ? <MenuItem key={item.id} component={Link} to={to} sx={sx} onClick={() => { if (!item.readAt) void read(item); setAnchor(null); }}>{content}</MenuItem> : <MenuItem key={item.id} sx={sx} onClick={() => void read(item)}>{content}</MenuItem>;
      })}
      <Divider /><Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" disabled={!unread || !items.length} onClick={() => void read()}>Marcar todo como leído</Button>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Typography variant="caption">{page}/{pages}</Typography><Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Siguiente</Button>
      </Box>
    </Menu>
  </>;
};
