import { useEffect, useRef, useState } from 'react';
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
  PhoneCall,
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
import { NotificationBell } from './NotificationBell';
import { resolveStaffAccess } from '@features/auth/staffAccess';
import { useBusinessInfo } from '@services/businessInfo';

const NAV_LINKS = [
  { to: ROUTES.menu, label: 'Catálogo' },
  { to: ROUTES.menuMode('CUSTOM'), label: 'Crea tu torta' },
  { to: ROUTES.plans, label: 'Cajas mensuales' },
];

const SECONDARY_NAV_LINKS = [
  { to: ROUTES.coverage, label: 'Zonas de entrega' },
  { to: ROUTES.business, label: 'Para empresas' },
];

const isMainNavActive = (to: string, pathname: string, search: string, customCakeEntry = false) => {
  const params = new URLSearchParams(search);
  if (pathname.startsWith('/tortas/') && (params.has('diseno') || params.get('canal') === 'empresas')) return to === ROUTES.business;
  if (pathname === ROUTES.specialCake || (pathname.startsWith('/tortas/') && params.get('solicitud') === 'especial')) return to === ROUTES.customCake;
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
  const { address, deliveryType, pickupBranch, hasCoverage, openLocationModal } = useAppState();
  const business = useBusinessInfo();
  const { isStaff } = usePermissions();
  const staffAccess = resolveStaffAccess({ roles: user?.roles, permissions: user?.permissions, isSuperAdmin: user?.isSuperAdmin });
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileScrollY = useRef(0);
  const hasMobileScrollPosition = useRef(false);
  const totalItems = items.reduce((total, item) => total + item.quantity, 0);
  const cartBump = useBumpOnChange(totalItems);
  // El destino temporal del invitado forma parte del contexto de compra y debe
  // verse igual que el destino de una cuenta hasta que se confirme el pago.
  const isPickup = deliveryType === 'PICKUP';
  const destinationLabel = hasCoverage && isPickup
    ? pickupBranch ? `Recojo · ${pickupBranch.name}` : null
    : hasCoverage ? address?.label : null;
  const utilityLabel = destinationLabel ?? 'Elige tu direcci\u00f3n';
  const phoneHref = business.phone.replace(/[^\d+]/g, '');

  const openMobileMenu = () => {
    mobileScrollY.current = window.scrollY;
    hasMobileScrollPosition.current = true;
    setMobileOpen(true);
  };

  const closeMobileMenu = () => {
    setMobileOpen(false);
  };

  useEffect(() => {
    if (!hasMobileScrollPosition.current) return undefined;
    const restoreScroll = () => window.scrollTo({ top: mobileScrollY.current, left: 0, behavior: 'auto' });
    restoreScroll();
    const frame = window.requestAnimationFrame(restoreScroll);
    const timeout = window.setTimeout(restoreScroll, 280);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [mobileOpen]);

  const selectAddress = () => {
    closeMobileMenu();
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
        '&::after': {
          content: '""',
          display: 'block',
          height: 3,
          background: 'linear-gradient(90deg, var(--color-brand-500), var(--color-accent-500), var(--color-tertiary-600))',
        },
      }}
    >
      <Box sx={{ bgcolor: 'var(--color-brand-900)', color: 'common.white' }}>
        <Container maxWidth="xl">
          <Stack direction="row" sx={{ minHeight: { xs: 32, sm: 34 }, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Button
              onClick={selectAddress}
              variant="text"
              startIcon={isPickup ? <Store size={14} /> : <MapPin size={14} />}
              aria-label={isPickup ? 'Elegir local de recojo' : 'Elegir tu direcci\u00f3n de entrega'}
              sx={{
                minWidth: 0,
                minHeight: 30,
                maxWidth: { xs: 220, sm: 360 },
                px: { xs: 0, sm: 1 },
                color: 'inherit',
                fontSize: { xs: 11, sm: 12 },
                fontWeight: 700,
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,.12)' },
                '& .MuiButton-startIcon': { mr: .5 },
              }}
            >
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{utilityLabel}</Box>
            </Button>
            <Button
              component="a"
              href={'tel:' + phoneHref}
              variant="text"
              startIcon={<PhoneCall size={14} />}
              sx={{ minWidth: 0, minHeight: 30, px: { xs: 0, sm: 1 }, color: 'inherit', fontSize: { xs: 11, sm: 12 }, fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,.12)' }, '& .MuiButton-startIcon': { mr: .5 } }}
            >
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: .5, whiteSpace: 'nowrap' }}>
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, opacity: .75 }}>{'Ll\u00e1manos'}</Box>
                <Box component="span">{business.phone}</Box>
              </Box>
            </Button>
          </Stack>
        </Container>
      </Box>
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ position: 'relative', minHeight: { xs: 62, sm: 68 }, gap: { xs: 1, md: 1.5 }, flexWrap: 'nowrap' }}>
          <IconButton
            onClick={openMobileMenu}
            aria-label="Abrir navegación"
            aria-expanded={mobileOpen}
            sx={{ display: { xs: 'inline-flex', lg: 'none' }, width: 42, height: 42, ml: { xs: -.75, sm: -1 } }}
          >
            <Menu size={21} />
          </IconButton>
          <AppLogo
            className="public-header-logo absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 [&>span]:h-14 [&>span]:w-[clamp(9rem,42vw,11rem)] [&>span]:max-w-[calc(100vw-8.5rem)] sm:[&>span]:h-16 sm:[&>span]:w-52 lg:[&>span]:h-16 lg:[&>span]:w-56"
          />
          <Stack
            component="nav"
            direction="row"
            spacing={.25}
            aria-label="Navegación principal"
            sx={{ display: { xs: 'none', lg: 'flex' }, flex: 1, minWidth: 0, justifyContent: 'center', alignItems: 'center', ml: { lg: 2, xl: 4 } }}
          >
            {[...NAV_LINKS, ...SECONDARY_NAV_LINKS].map((item) => {
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
                    position: 'relative',
                    minHeight: 44,
                    px: { lg: .85, xl: 1.15 },
                    borderRadius: 1.5,
                    color: active ? 'primary.main' : 'text.secondary',
                    fontSize: { lg: 12.5, xl: 13.5 },
                    fontWeight: active ? 800 : 650,
                    '&:hover': { bgcolor: 'primary.50', color: 'primary.main' },
                    '&::after': { content: '""', position: 'absolute', left: 12, right: 12, bottom: 4, height: 2, borderRadius: 2, bgcolor: 'primary.main', opacity: active ? 1 : 0, transform: active ? 'scaleX(1)' : 'scaleX(.4)', transition: 'all .2s ease' },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Stack>
          <Stack direction="row" spacing={{ xs: .25, sm: .5 }} sx={{ ml: { xs: 'auto', lg: 1 }, alignItems: 'center' }}>
            {isStaff && (
              <Button component={Link} to={staffAccess.to} variant="outlined" startIcon={<LayoutDashboard size={16} />} sx={{ display: { xs: 'none', xl: 'inline-flex' }, minHeight: 40, px: 1.25 }}>
                {staffAccess.shortLabel}
              </Button>
            )}
            <IconButton component={Link} to={ROUTES.cart} aria-label={'Ver carrito, ' + totalItems + ' productos'} sx={{ width: 42, height: 42 }}>
              <Box component="span" className={cartBump ? 'animate-bump' : undefined} sx={{ display: 'inline-flex' }}>
                <Badge badgeContent={totalItems} color="secondary" max={99}>
                  <ShoppingBag size={19} />
                </Badge>
              </Box>
            </IconButton>
            {isAuthenticated && <NotificationBell audience={isStaff ? 'STAFF' : 'CUSTOMER'} />}
            <UserMenu />
          </Stack>
        </Toolbar>
      </Container>
      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={closeMobileMenu}
        ModalProps={{ disableScrollLock: true, sx: { zIndex: (theme) => theme.zIndex.drawer + 2 } }}
        slotProps={{ paper: { sx: { width: { xs: 'min(86vw, 320px)', sm: 'min(72vw, 380px)' }, p: { xs: 1.75, sm: 2.25 }, overflowY: 'auto', bgcolor: 'background.paper' } } }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
          <AppLogo onClick={closeMobileMenu} className="[&>span]:h-12 [&>span]:w-40" />
          <IconButton onClick={closeMobileMenu} aria-label="Cerrar navegación"><X size={20} /></IconButton>
        </Stack>
        <Typography variant="overline" color="text.secondary" sx={{ px: 1, mt: .75, fontSize: 11, lineHeight: 1.2, fontWeight: 800, letterSpacing: '.08em' }}>
          Explora
        </Typography>
        <List sx={{ py: .75 }}>
          {NAV_LINKS.map((item) => {
            const active = isMainNavActive(item.to, location.pathname, location.search, location.state?.customCakeEntry === true);
            return (
              <ListItemButton
                key={item.to}
                component={Link}
                to={item.to}
                selected={active}
                onClick={closeMobileMenu}
                sx={{ minHeight: 44, mb: .25, px: 1.25, borderRadius: 2, '& .MuiListItemText-primary': { fontSize: { xs: 14, sm: 15 } } }}
              >
                <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: active ? 750 : 600, fontSize: { xs: 14, sm: 15 } } } }} />
                <ChevronRight size={17} />
              </ListItemButton>
            );
          })}
        </List>
        <Typography variant="overline" color="text.secondary" sx={{ px: 1, mt: 1.25, fontSize: 11, lineHeight: 1.2, fontWeight: 800, letterSpacing: '.08em' }}>
          Más opciones
        </Typography>
        <List sx={{ py: .75 }}>
          {SECONDARY_NAV_LINKS.map((item) => {
            const active = isMainNavActive(item.to, location.pathname, location.search, location.state?.customCakeEntry === true);
            return (
              <ListItemButton
                key={item.to}
                component={Link}
                to={item.to}
                selected={active}
                onClick={closeMobileMenu}
                sx={{ minHeight: 44, mb: .25, px: 1.25, borderRadius: 2, '& .MuiListItemText-primary': { fontSize: { xs: 14, sm: 15 } } }}
              >
                <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: active ? 750 : 600, fontSize: { xs: 14, sm: 15 } } } }} />
                <ChevronRight size={17} />
              </ListItemButton>
            );
          })}
        </List>
        {destinationLabel && (
          <>
            <Divider sx={{ my: 1.25 }} />
            <ListItemButton onClick={selectAddress} sx={{ minHeight: 52, flexGrow: 0, flexShrink: 0, px: 1.25, borderRadius: 2 }}>
          <ListItemIcon sx={{ minWidth: 34 }}>
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
              primary: { sx: { fontWeight: 700, fontSize: { xs: 13, sm: 14 } } },
              secondary: { sx: { fontSize: 11.5, lineHeight: 1.35 } },
            }}
          />
            </ListItemButton>
          </>
        )}

        <Divider sx={{ my: 1.25 }} />
        <Typography variant="overline" color="text.secondary" sx={{ px: 1, fontSize: 11, lineHeight: 1.2, fontWeight: 800, letterSpacing: '.08em' }}>
          Mi cuenta
        </Typography>
        {isAuthenticated ? (
          <List sx={{ py: .75 }}>
            {ACCOUNT_DRAWER_LINKS.map(({ to, label, icon: Icon }) => (
              <ListItemButton
                key={to}
                component={NavLink}
                to={to}
                // Sin `end`, /cuenta se marcaria activo en todas sus hijas.
                end={to === ROUTES.account}
                selected={to === ROUTES.account ? location.pathname === to : location.pathname.startsWith(to)}
                onClick={closeMobileMenu}
                sx={{ minHeight: 44, mb: .25, px: 1.25, borderRadius: 2, '& .MuiListItemText-primary': { fontSize: { xs: 14, sm: 15 } } }}
              >
                <ListItemIcon sx={{ minWidth: 34 }}><Icon size={18} /></ListItemIcon>
                <ListItemText primary={label} slotProps={{ primary: { sx: { fontWeight: 600, fontSize: { xs: 14, sm: 15 } } } }} />
              </ListItemButton>
            ))}
          </List>
        ) : (
          <List sx={{ py: .75 }}>
            <ListItemButton
              component={Link}
              to={ROUTES.login}
              onClick={closeMobileMenu}
              sx={{ minHeight: 44, mb: .25, px: 1.25, borderRadius: 2, '& .MuiListItemText-primary': { fontSize: { xs: 14, sm: 15 } } }}
            >
              <ListItemIcon sx={{ minWidth: 34 }}><LogIn size={18} /></ListItemIcon>
              <ListItemText
                primary="Ingresar"
                secondary="Tus pedidos, direcciones y saldo"
                slotProps={{ primary: { sx: { fontWeight: 700, fontSize: { xs: 14, sm: 15 } } }, secondary: { sx: { fontSize: 11.5 } } }}
              />
            </ListItemButton>
            <ListItemButton
              component={Link}
              to={ROUTES.register}
              onClick={closeMobileMenu}
              sx={{ minHeight: 44, px: 1.25, borderRadius: 2, '& .MuiListItemText-primary': { fontSize: { xs: 14, sm: 15 } } }}
            >
              <ListItemIcon sx={{ minWidth: 34 }}><UserPlus size={18} /></ListItemIcon>
              <ListItemText primary="Crear cuenta" slotProps={{ primary: { sx: { fontWeight: 600, fontSize: { xs: 14, sm: 15 } } } }} />
            </ListItemButton>
          </List>
        )}

        {isStaff && (
          <Button
            component={Link}
            to={staffAccess.to}
            onClick={closeMobileMenu}
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
