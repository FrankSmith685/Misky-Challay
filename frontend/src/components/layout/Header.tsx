import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  AppBar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu as MuiMenu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { Bell, ChevronRight, LayoutDashboard, MapPin, Menu, ShoppingBag, X } from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { usePermissions } from '@hooks/usePermissions';
import { UserMenu } from './UserMenu';
import { AppLogo } from '@components/common/AppLogo';
import { accountApi, type AccountNotification } from '@features/account/services/account.service';

const NAV_LINKS = [
  { to: ROUTES.menu, label: 'Menú' },
  { to: ROUTES.builder, label: 'Arma tu bowl' },
  { to: ROUTES.plans, label: 'Planes' },
  { to: ROUTES.coverage, label: 'Cobertura' },
];

/** Navegación principal responsive construida con AppBar, Drawer y controles MUI. */
export const Header = () => {
  const items = useAppSelector((state) => state.cart.items);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { address, openLocationModal } = useAppState();
  const { isStaff } = usePermissions();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [notificationAnchor, setNotificationAnchor] = useState<HTMLElement | null>(null);
  const totalItems = items.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const loadNotifications = () => accountApi.listNotifications().then(setNotifications).catch(() => undefined);
    void loadNotifications();
    const timer = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated]);

  const selectAddress = () => {
    setMobileOpen(false);
    openLocationModal();
  };

  return (
    <AppBar
      position="sticky"
      component="header"
      color="transparent"
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'rgba(255,255,255,.92)',
        color: 'text.primary',
        backdropFilter: 'blur(18px)',
        boxShadow: '0 1px 16px rgba(20,32,26,.045)',
      }}
    >
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 72 }, gap: 2 }}>
          <IconButton
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir navegación"
            aria-expanded={mobileOpen}
            sx={{ display: { md: 'none' }, ml: -1 }}
          >
            <Menu size={21} />
          </IconButton>

          <AppLogo />

          <Stack
            component="nav"
            direction="row"
            spacing={.5}
            aria-label="Navegación principal"
            sx={{ display: { xs: 'none', md: 'flex' }, ml: 'auto', mr: 'auto' }}
          >
            {NAV_LINKS.map((item) => {
              const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              return (
                <Button
                  key={item.to}
                  component={NavLink}
                  to={item.to}
                  color="inherit"
                  variant="text"
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    minHeight: 38,
                    px: 1.75,
                    color: active ? 'primary.main' : 'text.secondary',
                    fontWeight: active ? 750 : 600,
                    bgcolor: active ? 'action.hover' : 'transparent',
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Stack>

          <Stack direction="row" spacing={.5} sx={{ ml: { xs: 'auto', md: 0 }, alignItems: 'center' }}>
            {isStaff && (
              <Button
                component={Link}
                to={ROUTES.admin}
                size="small"
                variant="outlined"
                startIcon={<LayoutDashboard size={16} />}
                sx={{ display: { xs: 'none', lg: 'inline-flex' } }}
              >
                Panel
              </Button>
            )}

            <Button
              onClick={openLocationModal}
              color="inherit"
              variant="outlined"
              startIcon={<MapPin size={16} />}
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                maxWidth: 180,
                minHeight: 40,
                px: 1.75,
                color: 'text.secondary',
                '& .MuiButton-startIcon': { mr: .75 },
              }}
            >
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {address?.label ?? 'Elige tu dirección'}
              </Box>
            </Button>

            <IconButton component={Link} to={ROUTES.cart} aria-label={`Ver carrito, ${totalItems} productos`}>
              <Badge badgeContent={totalItems} color="secondary" max={99}>
                <ShoppingBag size={20} />
              </Badge>
            </IconButton>

            {isAuthenticated && (
              <>
                <IconButton aria-label="Ver actualizaciones de pedidos" onClick={(event) => setNotificationAnchor(event.currentTarget)}>
                  <Badge badgeContent={notifications.length} color="primary" max={9}>
                    <Bell size={20} />
                  </Badge>
                </IconButton>
                <MuiMenu anchorEl={notificationAnchor} open={Boolean(notificationAnchor)} onClose={() => setNotificationAnchor(null)} slotProps={{ paper: { sx: { width: 'min(92vw, 360px)', mt: 1, borderRadius: 3, maxHeight: 430 } } }}>
                  <Box sx={{ px: 2, py: 1.2 }}>
                    <Typography sx={{ fontWeight: 800 }}>Actualizaciones</Typography>
                    <Typography variant="caption" color="text.secondary">Cambios recientes de tus pedidos</Typography>
                  </Box>
                  <Divider />
                  {notifications.length === 0 && <MenuItem disabled>No tienes actualizaciones todavía</MenuItem>}
                  {notifications.slice(0, 8).map((notification) => (
                    <MenuItem key={notification.id} onClick={() => setNotificationAnchor(null)} sx={{ whiteSpace: 'normal', py: 1.25 }}>
                      {notification.order ? (
                        <Link to={ROUTES.accountOrderDetail(notification.order.orderNumber)} className="block w-full">
                          <span className="block text-sm font-bold text-ink">{notification.subject}</span>
                          <span className="mt-0.5 block text-xs text-ink-muted">{new Date(notification.sentAt ?? notification.createdAt).toLocaleString('es-PE')}</span>
                        </Link>
                      ) : (
                        <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{notification.subject}</Typography><Typography variant="caption" color="text.secondary">{new Date(notification.sentAt ?? notification.createdAt).toLocaleString('es-PE')}</Typography></Box>
                      )}
                    </MenuItem>
                  ))}
                </MuiMenu>
              </>
            )}

            <UserMenu />
          </Stack>
        </Toolbar>
      </Container>

      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{ paper: { sx: { width: 'min(88vw, 340px)', p: 2.5 } } }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <AppLogo onClick={() => setMobileOpen(false)} />
          <IconButton onClick={() => setMobileOpen(false)} aria-label="Cerrar navegación"><X size={20} /></IconButton>
        </Stack>
        <Typography variant="overline" color="text.secondary" sx={{ px: 2, mt: 1, fontWeight: 750 }}>
          Explora
        </Typography>
        <List sx={{ py: 1 }}>
          {NAV_LINKS.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <ListItemButton
                key={item.to}
                component={NavLink}
                to={item.to}
                selected={active}
                onClick={() => setMobileOpen(false)}
                sx={{ mb: .5, borderRadius: 2.5 }}
              >
                <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: active ? 750 : 600 } } }} />
                <ChevronRight size={17} />
              </ListItemButton>
            );
          })}
        </List>
        <Divider sx={{ my: 1.5 }} />
        <ListItemButton onClick={selectAddress} sx={{ borderRadius: 2.5 }}>
          <ListItemIcon sx={{ minWidth: 36 }}><MapPin size={18} /></ListItemIcon>
          <ListItemText
            primary="Dirección de entrega"
            secondary={address?.label ?? 'Selecciona dónde recibirás tu pedido'}
            slotProps={{
              primary: { sx: { fontWeight: 700, fontSize: 14 } },
              secondary: { sx: { fontSize: 12 } },
            }}
          />
        </ListItemButton>
        {isStaff && (
          <Button
            component={Link}
            to={ROUTES.admin}
            onClick={() => setMobileOpen(false)}
            variant="contained"
            startIcon={<LayoutDashboard size={17} />}
            fullWidth
            sx={{ mt: 'auto' }}
          >
            Ir al panel de gestión
          </Button>
        )}
      </Drawer>
    </AppBar>
  );
};
