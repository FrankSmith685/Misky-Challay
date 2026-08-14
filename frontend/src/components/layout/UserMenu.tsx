import { useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { ClipboardList, Heart, Home, LayoutDashboard, LogOut, MapPin, Salad, User2, Wallet } from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { rolesLabel } from '@constants/roles';
import { useAppSelector } from '@app/hooks';
import { usePermissions } from '@hooks/usePermissions';
import { useLogout } from '@hooks/useLogout';
import { useWalletBalance } from '@hooks/useWalletBalance';
import { formatCurrency } from '@lib/format';
import { resolveStaffAccess } from '@features/auth/staffAccess';

export const UserMenu = () => {
  const user = useAppSelector((state) => state.auth.user);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { isStaff } = usePermissions();
  const logout = useLogout();
  // El saldo se pide una sola vez por sesion y lo comparten carrito y cabecera.
  const { balance, isLoading: isBalanceLoading } = useWalletBalance();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!isAuthenticated || !user) {
    return (
      <Button component={Link} to={ROUTES.login} variant="contained" startIcon={<User2 size={17} />} sx={{ minHeight: 44, px: { xs: 1.5, sm: 2.25 } }}>
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Ingresar</Box>
      </Button>
    );
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Mi cuenta';
  const subtitle = user.isSuperAdmin ? 'Superadmin' : user.roles.length ? rolesLabel(user.roles) : 'Cliente';
  const staffAccess = resolveStaffAccess(user);
  const close = () => setAnchor(null);
  const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  const initial = (user.firstName?.[0] ?? user.email?.[0] ?? 'U').toUpperCase();

  const item = (
    to: string,
    label: string,
    Icon: typeof User2,
    options?: { highlight?: boolean; trailing?: ReactNode },
  ) => (
    <MenuItem
      component={Link}
      to={to}
      onClick={close}
      sx={{ minHeight: 44, color: options?.highlight ? 'primary.main' : 'text.primary' }}
    >
      <ListItemIcon sx={{ color: 'inherit' }}><Icon size={18} /></ListItemIcon>
      <ListItemText primary={label} slotProps={{ primary: { sx: { fontWeight: options?.highlight ? 750 : 550, fontSize: 14 } } }} />
      {options?.trailing}
    </MenuItem>
  );

  /* El saldo deja de aparecer por primera vez en el ultimo paso del checkout: aqui
   * ya se ve cuanto hay antes de empezar a comprar. Sin monedero (o si el API falla)
   * no se inventa un "S/ 0.00": simplemente no se muestra importe. */
  const walletAmount = isBalanceLoading
    ? <Skeleton variant="text" width={52} sx={{ fontSize: 13 }} />
    : balance === null
      ? null
      : (
        <Typography
          variant="caption"
          sx={{ ml: 1, fontWeight: 800, whiteSpace: 'nowrap', color: balance > 0 ? 'primary.dark' : 'text.secondary' }}
        >
          {formatCurrency(balance)}
        </Typography>
      );

  return (
    <>
      <Button
        onClick={open}
        color="inherit"
        variant="outlined"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        // En movil el boton es solo el avatar: sin esto su unico nombre accesible
        // seria la inicial suelta.
        aria-label={`Mi cuenta · ${fullName}`}
        sx={{ minWidth: 0, minHeight: 44, p: .45, pr: { xs: .45, sm: 1.25 }, gap: .75 }}
      >
        <Avatar src={user.avatarUrl ?? undefined} alt={fullName} sx={{ width: 32, height: 32, bgcolor: 'primary.light', color: 'primary.dark', fontSize: 13, fontWeight: 800 }}>
          {initial}
        </Avatar>
        <Box component="span" sx={{ display: { xs: 'none', sm: 'block' }, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.firstName ?? 'Mi cuenta'}
        </Box>
      </Button>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 260 } } }}
      >
        <Stack direction="row" spacing={1.25} sx={{ px: 2, py: 1.5, alignItems: 'center' }}>
          <Avatar src={user.avatarUrl ?? undefined} alt={fullName} sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontWeight: 800 }}>{initial}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 750 }}>{fullName}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{subtitle}</Typography>
          </Box>
        </Stack>
        <Divider />
        {isStaff && item(staffAccess.to, staffAccess.menuLabel, LayoutDashboard, { highlight: true })}
        {/* Mismo orden y mismas etiquetas que la navegacion de /cuenta: actividad
          * primero, datos despues. Favoritos, bowls y direcciones dejan de existir
          * solo dentro de /cuenta. */}
        {item(ROUTES.account, 'Inicio de mi cuenta', Home)}
        {item(ROUTES.accountOrders, 'Mis pedidos', ClipboardList)}
        {item(ROUTES.accountWallet, 'Mi saldo', Wallet, { trailing: walletAmount })}
        {item(ROUTES.accountFavorites, 'Mis favoritos', Heart)}
        {item(ROUTES.accountSavedBowls, 'Bowls guardados', Salad)}
        <Divider sx={{ my: .75 }} />
        {item(ROUTES.accountProfile, 'Mi perfil', User2)}
        {item(ROUTES.accountAddresses, 'Mis direcciones', MapPin)}
        <Divider sx={{ my: .75 }} />
        <MenuItem
          onClick={() => { close(); void logout(); }}
          sx={{ minHeight: 44, color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}><LogOut size={18} /></ListItemIcon>
          <ListItemText primary="Cerrar sesión" slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 650 } } }} />
        </MenuItem>
      </Menu>
    </>
  );
};
