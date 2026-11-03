import { useState } from 'react';
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
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  ChevronRight,
  ClipboardList,
  Heart,
  Home,
  LayoutDashboard,
  LogIn,
  MapPin,
  Menu,
  CakeSlice,
  ShoppingBag,
  Store,
  User2,
  UserPlus,
  X,
} from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { usePermissions } from '@hooks/usePermissions';
import { useBumpOnChange } from '@hooks/useBumpOnChange';
import { UserMenu } from './UserMenu';
import { AppLogo } from '@components/common/AppLogo';
import { BUTTON_HEIGHT } from '@components/ui/Button';
import { NotificationBell } from './NotificationBell';
import { AddressPill } from './AddressPill';
import { resolveStaffAccess } from '@features/auth/staffAccess';

const NAV_LINKS = [
  { to: ROUTES.menu, label: 'Catálogo' },
  { to: ROUTES.menuMode('CUSTOM'), label: 'Crea tu torta' },
  { to: ROUTES.plans, label: 'Cajas mensuales' },
  { to: ROUTES.coverage, label: 'Zonas de entrega' },
  { to: ROUTES.business, label: 'Para empresas' },
];

const isMainNavActive = (to: string, pathname: string, search: string, customCakeEntry = false) => {
  if (pathname.startsWith('/tortas/') && (new URLSearchParams(search).has('diseno') || new URLSearchParams(search).get('canal') === 'empresas')) return to === ROUTES.business;
  if (to === ROUTES.menu || to === ROUTES.customCake) {
    if (pathname === ROUTES.menu) return to === ROUTES.menu;
    if (pathname === ROUTES.customCake || (pathname.startsWith('/tortas/') && customCakeEntry)) return to === ROUTES.customCake;
    return to === ROUTES.menu && (pathname.startsWith(`${ROUTES.menu}/`) || pathname.startsWith('/tortas/'));
  }
  if (to.includes('?')) return `${pathname}${search}` === to;
  return pathname === to || pathname.startsWith(`${to}/`);
};

/* La cuenta tambien se alcanza desde el drawer: en movil el menu de usuario es un
 * avatar de 32px, y direcciones, favoritos y bowls guardados solo existian si ya
 * estabas dentro de /cuenta. Mismo orden y etiquetas que la navegacion de cuenta. */
const ACCOUNT_DRAWER_LINKS = [
  { to: ROUTES.account, label: 'Inicio de mi cuenta', icon: Home },
  { to: ROUTES.accountOrders, label: 'Mis pedidos', icon: ClipboardList },
  { to: ROUTES.accountFavorites, label: 'Mis favoritos', icon: Heart },
  { to: ROUTES.designRequests, label: 'Mis diseños', icon: CakeSlice },
  { to: ROUTES.accountProfile, label: 'Mi perfil', icon: User2 },
  { to: ROUTES.accountAddresses, label: 'Mis direcciones', icon: MapPin },
];

/* La escala de alturas se importa de components/ui/Button: cuando el header
 * guardaba su propia copia, su `sm` se quedo en 36px y el pill de la cabecera
 * dejo de casar con el resto de botones al unificarse la escala. */

/** Navegación principal responsive construida con AppBar, Drawer y controles MUI. */
export const Header = () => {
  const items = useAppSelector((state) => state.cart.items);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const user = useAppSelector((state) => state.auth.user);
  const { address, deliveryType, pickupBranch, openLocationModal } = useAppState();
  const { isStaff } = usePermissions();
  const staffAccess = resolveStaffAccess({ roles: user?.roles, permissions: user?.permissions, isSuperAdmin: user?.isSuperAdmin });
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const totalItems = items.reduce((total, item) => total + item.quantity, 0);
  const cartBump = useBumpOnChange(totalItems);
  // Una version anterior permitia contexto de compra anonimo. Aunque la limpieza
  // se ejecuta al montar, la cabecera tampoco debe mostrarlo ni un solo frame.
  const isPickup = isAuthenticated && deliveryType === 'PICKUP';
  const destinationLabel = isAuthenticated
    ? isPickup
      ? pickupBranch ? `Recojo · ${pickupBranch.name}` : null
      : address?.label
    : null;

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
        bgcolor: 'rgba(255,255,255,.96)',
        color: 'text.primary',
        backdropFilter: 'blur(18px)',
        boxShadow: '0 2px 12px rgba(23,50,77,.035)',
      }}
    >
      <Container maxWidth="xl">
        {/* El hueco entre bloques baja en movil: ahi conviven el contexto de entrega,
          * el carrito, la campana y la cuenta en 360px de ancho. */}
        <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 72 }, gap: { xs: 1, md: 2 }, flexWrap: { md: 'wrap', xl: 'nowrap' } }}>
          <IconButton
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir navegación"
            aria-expanded={mobileOpen}
            sx={{ display: { md: 'none' }, ml: -1, width: BUTTON_HEIGHT.md, height: BUTTON_HEIGHT.md }}
          >
            <Menu size={21} />
          </IconButton>

          {/* Sin el nombre de marca en xs caben el pill de entrega y la cuenta. */}
          <AppLogo compact="xs" />

          <Stack
            component="nav"
            direction="row"
            spacing={.5}
            aria-label="Navegación principal"
            sx={{ display: { xs: 'none', md: 'flex' }, ml: 'auto', mr: 'auto', order: { md: 3, xl: 0 }, width: { md: '100%', xl: 'auto' }, justifyContent: 'center' }}
          >
            {NAV_LINKS.map((item) => {
              const active = isMainNavActive(item.to, location.pathname, location.search, location.state?.customCakeEntry === true);
              return (
                <Button
                  key={item.to}
                  component={Link}
                  to={item.to}
                  color="inherit"
                  variant="text"
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    minHeight: BUTTON_HEIGHT.md,
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

          <Stack direction="row" spacing={.5} sx={{ ml: { xs: 'auto', xl: 0 }, alignItems: 'center' }}>
            {isStaff && (
              <Button
                component={Link}
                to={staffAccess.to}
                variant="outlined"
                startIcon={<LayoutDashboard size={16} />}
                sx={{ display: { xs: 'none', lg: 'inline-flex' }, minHeight: BUTTON_HEIGHT.sm, px: 1.5 }}
              >
                {staffAccess.shortLabel}
              </Button>
            )}

            {destinationLabel && (
              <AddressPill
                label={destinationLabel}
                deliveryType={isPickup ? 'PICKUP' : 'DELIVERY'}
                onClick={selectAddress}
              />
            )}

            <IconButton
              component={Link}
              to={ROUTES.cart}
              aria-label={`Ver carrito, ${totalItems} productos`}
              sx={{ width: BUTTON_HEIGHT.md, height: BUTTON_HEIGHT.md }}
            >
              <Box component="span" className={cartBump ? 'animate-bump' : undefined} sx={{ display: 'inline-flex' }}>
                <Badge badgeContent={totalItems} color="secondary" max={99}>
                  <ShoppingBag size={20} />
                </Badge>
              </Box>
            </IconButton>

            {isAuthenticated && <NotificationBell />}

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
            const active = isMainNavActive(item.to, location.pathname, location.search, location.state?.customCakeEntry === true);
            return (
              <ListItemButton
                key={item.to}
                component={Link}
                to={item.to}
                selected={active}
                onClick={() => setMobileOpen(false)}
                sx={{ mb: .5, borderRadius: 'var(--radius-field)' }}
              >
                <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: active ? 750 : 600 } } }} />
                <ChevronRight size={17} />
              </ListItemButton>
            );
          })}
        </List>
        {destinationLabel && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <ListItemButton onClick={selectAddress} sx={{ borderRadius: 'var(--radius-field)' }}>
          <ListItemIcon sx={{ minWidth: 36 }}>
            {isPickup ? <Store size={18} /> : <MapPin size={18} />}
          </ListItemIcon>
          <ListItemText
            primary={isPickup ? 'Local de recojo' : 'Dirección de entrega'}
            secondary={
              isPickup
                ? pickupBranch
                  ? `${pickupBranch.name} · ${pickupBranch.addressLine}`
                  : 'Selecciona el local donde recogerás tu pedido'
                : address?.label ?? 'Selecciona dónde recibirás tu pedido'
            }
            slotProps={{
              primary: { sx: { fontWeight: 700, fontSize: 14 } },
              secondary: { sx: { fontSize: 12 } },
            }}
          />
            </ListItemButton>
          </>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="overline" color="text.secondary" sx={{ px: 2, fontWeight: 750 }}>
          Mi cuenta
        </Typography>
        {isAuthenticated ? (
          <List sx={{ py: 1 }}>
            {ACCOUNT_DRAWER_LINKS.map(({ to, label, icon: Icon }) => (
              <ListItemButton
                key={to}
                component={NavLink}
                to={to}
                // Sin `end`, /cuenta se marcaria activo en todas sus hijas.
                end={to === ROUTES.account}
                selected={to === ROUTES.account ? location.pathname === to : location.pathname.startsWith(to)}
                onClick={() => setMobileOpen(false)}
                sx={{ minHeight: 44, mb: .5, borderRadius: 'var(--radius-field)' }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}><Icon size={18} /></ListItemIcon>
                <ListItemText primary={label} slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 14 } } }} />
              </ListItemButton>
            ))}
          </List>
        ) : (
          <List sx={{ py: 1 }}>
            <ListItemButton
              component={Link}
              to={ROUTES.login}
              onClick={() => setMobileOpen(false)}
              sx={{ minHeight: 44, mb: .5, borderRadius: 'var(--radius-field)' }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}><LogIn size={18} /></ListItemIcon>
              <ListItemText
                primary="Ingresar"
                secondary="Tus pedidos, direcciones y saldo"
                slotProps={{ primary: { sx: { fontWeight: 700, fontSize: 14 } }, secondary: { sx: { fontSize: 12 } } }}
              />
            </ListItemButton>
            <ListItemButton
              component={Link}
              to={ROUTES.register}
              onClick={() => setMobileOpen(false)}
              sx={{ minHeight: 44, borderRadius: 'var(--radius-field)' }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}><UserPlus size={18} /></ListItemIcon>
              <ListItemText primary="Crear cuenta" slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 14 } } }} />
            </ListItemButton>
          </List>
        )}

        {isStaff && (
          <Button
            component={Link}
            to={staffAccess.to}
            onClick={() => setMobileOpen(false)}
            variant="contained"
            startIcon={<LayoutDashboard size={17} />}
            fullWidth
            sx={{ mt: 'auto' }}
          >
            {staffAccess.actionLabel}
          </Button>
        )}
      </Drawer>
    </AppBar>
  );
};
