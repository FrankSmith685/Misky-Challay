import { useState, type MouseEvent } from 'react';
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
  Stack,
  Typography,
} from '@mui/material';
import { ClipboardList, LayoutDashboard, LogOut, User2, Wallet } from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { rolesLabel } from '@constants/roles';
import { useAppSelector } from '@app/hooks';
import { usePermissions } from '@hooks/usePermissions';
import { useLogout } from '@hooks/useLogout';

export const UserMenu = () => {
  const user = useAppSelector((state) => state.auth.user);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { isStaff } = usePermissions();
  const logout = useLogout();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!isAuthenticated || !user) {
    return (
      <Button component={Link} to={ROUTES.login} variant="contained" startIcon={<User2 size={17} />} sx={{ px: { xs: 1.5, sm: 2.25 } }}>
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Ingresar</Box>
      </Button>
    );
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Mi cuenta';
  const subtitle = user.isSuperAdmin ? 'Superadmin' : user.roles.length ? rolesLabel(user.roles) : 'Cliente';
  const close = () => setAnchor(null);
  const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  const initial = (user.firstName?.[0] ?? user.email?.[0] ?? 'U').toUpperCase();

  const item = (to: string, label: string, Icon: typeof User2, highlight = false) => (
    <MenuItem component={Link} to={to} onClick={close} sx={{ color: highlight ? 'primary.main' : 'text.primary' }}>
      <ListItemIcon sx={{ color: 'inherit' }}><Icon size={18} /></ListItemIcon>
      <ListItemText primary={label} slotProps={{ primary: { sx: { fontWeight: highlight ? 750 : 550, fontSize: 14 } } }} />
    </MenuItem>
  );

  return (
    <>
      <Button
        onClick={open}
        color="inherit"
        variant="outlined"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        sx={{ minWidth: 0, p: .45, pr: { xs: .45, sm: 1.25 }, gap: .75 }}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light', color: 'primary.dark', fontSize: 13, fontWeight: 800 }}>
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
          <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontWeight: 800 }}>{initial}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 750 }}>{fullName}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{subtitle}</Typography>
          </Box>
        </Stack>
        <Divider />
        {isStaff && item(ROUTES.admin, 'Panel de gestión', LayoutDashboard, true)}
        {item(ROUTES.accountProfile, 'Mi perfil', User2)}
        {item(ROUTES.accountOrders, 'Mis pedidos', ClipboardList)}
        {item(ROUTES.accountWallet, 'Mi saldo', Wallet)}
        <Divider sx={{ my: .75 }} />
        <MenuItem
          onClick={() => { close(); void logout(); }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}><LogOut size={18} /></ListItemIcon>
          <ListItemText primary="Cerrar sesión" slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 650 } } }} />
        </MenuItem>
      </Menu>
    </>
  );
};
