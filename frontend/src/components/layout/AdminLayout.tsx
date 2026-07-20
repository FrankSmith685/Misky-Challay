import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar, Badge, Box, Button as MuiButton, Drawer, IconButton, Tooltip } from '@mui/material';
import {
  Bike,
  ChefHat,
  ClipboardList,
  Crown,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  Palette,
  Salad,
  ShieldCheck,
  Sliders,
  Store,
  Ticket,
  Users,
  Wallet,
  X,
  Bell,
  ChevronRight,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  CircleUserRound,
  Images,
} from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { PERM } from '@constants/permissions';
import { rolesLabel } from '@constants/roles';
import { usePermissions } from '@hooks/usePermissions';
import { useLogout } from '@hooks/useLogout';
import { useAppSelector } from '@app/hooks';
import { cn } from '@lib/cn';
import { AppLogo } from '@components/common/AppLogo';
import { RouteEffects } from './RouteEffects';

/**
 * MENU DEL PANEL
 * ---------------------------------------------------------------------------
 * No esta escrito a mano: cada entrada declara QUE PERMISOS necesita y el menu
 * se arma con las que el usuario puede usar.
 *
 * Por eso el nutricionista y el superadmin entran al MISMO /admin y ven cosas
 * distintas: es el mismo edificio, distintas llaves.
 */
const ADMIN_LINKS: Array<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  /** Le basta con uno de estos permisos para ver la entrada. */
  anyOf: string[];
  section: 'GENERAL' | 'OPERACION' | 'NEGOCIO' | 'GOBIERNO';
}> = [
  { to: ROUTES.adminDashboard, label: 'Resumen', icon: LayoutDashboard, end: false, anyOf: [PERM.REPORT_SALES_READ, PERM.REPORT_OPERATIONS_READ], section: 'GENERAL' },
  { to: ROUTES.adminOrders, label: 'Pedidos', icon: ClipboardList, end: false, anyOf: [PERM.ORDER_READ], section: 'OPERACION' },
  { to: ROUTES.adminKitchen, label: 'Cocina', icon: ChefHat, end: false, anyOf: [PERM.KITCHEN_READ], section: 'OPERACION' },
  { to: ROUTES.adminDelivery, label: 'Reparto', icon: Bike, end: false, anyOf: [PERM.DELIVERY_READ], section: 'OPERACION' },
  { to: ROUTES.adminInventory, label: 'Inventario', icon: Package, end: false, anyOf: [PERM.INVENTORY_READ], section: 'OPERACION' },
  // El nutricionista entra aqui: le basta con nutrition.read.
  { to: ROUTES.adminCatalog, label: 'Catalogo', icon: Salad, end: false, anyOf: [PERM.CATALOG_PRODUCT_READ, PERM.NUTRITION_READ], section: 'NEGOCIO' },
  { to: ROUTES.adminBuilder, label: 'Constructor', icon: Sliders, end: false, anyOf: [PERM.CATALOG_CUSTOMIZATION_WRITE], section: 'NEGOCIO' },
  { to: ROUTES.adminMedia, label: 'Biblioteca multimedia', icon: Images, end: false, anyOf: [PERM.CATALOG_PRODUCT_WRITE, PERM.CATALOG_CUSTOMIZATION_WRITE], section: 'NEGOCIO' },
  { to: ROUTES.adminCoupons, label: 'Cupones', icon: Ticket, end: false, anyOf: [PERM.PROMOTION_MANAGE], section: 'NEGOCIO' },
  { to: ROUTES.adminPlans, label: 'Planes', icon: Wallet, end: false, anyOf: [PERM.PLAN_MANAGE], section: 'NEGOCIO' },
  { to: ROUTES.adminCoverage, label: 'Cobertura y cocinas', icon: MapPin, end: false, anyOf: [PERM.GEO_READ, PERM.GEO_WRITE], section: 'GOBIERNO' },
  { to: ROUTES.adminUsers, label: 'Usuarios', icon: Users, end: false, anyOf: [PERM.USER_READ], section: 'GOBIERNO' },
  { to: ROUTES.adminRoles, label: 'Roles y permisos', icon: ShieldCheck, end: false, anyOf: [PERM.ROLE_READ], section: 'GOBIERNO' },
  { to: ROUTES.adminDesign, label: 'Sistema de diseno', icon: Palette, end: false, anyOf: [PERM.SETTINGS_MANAGE], section: 'GOBIERNO' },
];

const ADMIN_SECTIONS = [
  { id: 'GENERAL', label: 'Vista general' },
  { id: 'OPERACION', label: 'Operación' },
  { id: 'NEGOCIO', label: 'Negocio' },
  { id: 'GOBIERNO', label: 'Administración' },
] as const;

const SIDEBAR_STORAGE_KEY = 'verde-bowl.admin.sidebar-collapsed';

export const AdminLayout = () => {
  const { canAny, isSuperAdmin, branchIds } = usePermissions();
  const user = useAppSelector((state) => state.auth.user);
  const logout = useLogout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true',
  );
  const location = useLocation();

  const links = ADMIN_LINKS.filter((link) => canAny(...link.anyOf));

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email;
  const roleText = isSuperAdmin ? 'Superadmin' : (user?.roles.length ? rolesLabel(user.roles) : 'Sin rol');
  const scopeText = isSuperAdmin || branchIds.length === 0 ? 'Alcance global' : `Sucursal #${branchIds.join(', #')}`;
  const activeLink = links.find((link) => location.pathname.startsWith(link.to));
  const initials = [user?.firstName, user?.lastName].filter(Boolean).map((part) => part?.[0]).join('').slice(0, 2).toUpperCase() || 'VB';

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!current));
      return !current;
    });
  };

  // Escritorio puede contraerse a iconos; el drawer movil siempre usa etiquetas.
  const SidebarContent = ({
    onNavigate,
    compact = false,
  }: {
    onNavigate?: () => void;
    compact?: boolean;
  }) => (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('flex min-h-10 items-center', compact ? 'justify-center' : 'justify-between')}>
        <AppLogo compact={compact} onClick={onNavigate} />
        {!onNavigate && !compact && (
          <Tooltip title="Contraer menú">
            <IconButton size="small" onClick={toggleSidebar} aria-label="Contraer menú lateral">
              <PanelLeftClose className="size-[18px]" />
            </IconButton>
          </Tooltip>
        )}
      </div>

      {compact ? (
        <Tooltip title={`${fullName} · ${roleText} · ${scopeText}`} placement="right">
          <div className="my-5 flex justify-center">
            <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.light', color: 'primary.dark', fontSize: 12, fontWeight: 800, border: '2px solid white', boxShadow: 2 }}>
              {initials}
            </Avatar>
          </div>
        </Tooltip>
      ) : (
        <div className="mb-5 mt-5 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-3.5 shadow-sm">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
            {isSuperAdmin && <Crown className="size-3.5 shrink-0 text-accent-500" />}
            {fullName}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            <span className="font-semibold text-brand-700">{roleText}</span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
            <Store className="size-3" /> {scopeText}
          </p>
        </div>
      )}

      <nav className={cn('admin-scrollbar min-h-0 flex-1 overflow-y-auto', compact ? 'px-1' : 'pr-1')} aria-label="Navegación administrativa">
        {ADMIN_SECTIONS.map((section, sectionIndex) => {
          const sectionLinks = links.filter((link) => link.section === section.id);
          if (sectionLinks.length === 0) return null;

          return (
            <div key={section.id} className={cn(sectionIndex > 0 && (compact ? 'mt-3 border-t border-line pt-3' : 'mt-5'))}>
              {!compact && (
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted/65">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {sectionLinks.map(({ to, label, icon: Icon, end }) => (
                  <Tooltip key={to} title={compact ? label : ''} placement="right" arrow>
                    <span className="block w-full">
                      <NavLink
                        to={to}
                        end={end}
                        onClick={onNavigate}
                        aria-label={label}
                        className={({ isActive }) =>
                          cn(
                            'group flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-ink-muted transition-all hover:bg-surface-muted hover:text-ink',
                            compact ? 'justify-center px-2' : 'gap-3 px-3',
                            isActive && 'bg-brand-600 text-white shadow-sm shadow-brand-900/15 hover:bg-brand-600 hover:text-white',
                          )
                        }
                      >
                        <Icon className="size-[19px] shrink-0" />
                        {!compact && <span className="min-w-0 flex-1 truncate">{label}</span>}
                        {!compact && <ChevronRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-70" />}
                      </NavLink>
                    </span>
                  </Tooltip>
                ))}
              </div>
            </div>
          );
        })}

        {links.length === 0 && !compact && (
          <p className="mt-4 px-3 text-xs text-ink-muted">Tu usuario no tiene secciones asignadas.</p>
        )}
      </nav>

      <div className="mt-3 border-t border-line pt-3">
        {compact ? (
          <>
            <Tooltip title="Expandir menú" placement="right">
              <IconButton onClick={toggleSidebar} aria-label="Expandir menú lateral" sx={{ display: 'flex', mx: 'auto', mb: 0.5 }}>
                <PanelLeftOpen className="size-[18px]" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Mi perfil" placement="right">
              <IconButton component={Link} to={ROUTES.accountProfile} aria-label="Mi perfil" sx={{ display: 'flex', mx: 'auto', mb: 0.5 }}>
                <CircleUserRound className="size-[18px]" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Cerrar sesión" placement="right">
              <IconButton color="error" onClick={() => void logout()} aria-label="Cerrar sesión" sx={{ display: 'flex', mx: 'auto' }}>
                <LogOut className="size-[18px]" />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <>
            <MuiButton component={Link} to={ROUTES.accountProfile} onClick={onNavigate} color="inherit" variant="text" startIcon={<CircleUserRound className="size-4" />} fullWidth sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>
              Mi perfil
            </MuiButton>
            <MuiButton
              onClick={() => {
                onNavigate?.();
                void logout();
              }}
              color="error"
              variant="text"
              startIcon={<LogOut className="size-4" />}
              fullWidth
              sx={{ justifyContent: 'flex-start' }}
            >
              Cerrar sesión
            </MuiButton>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="admin-shell flex min-h-screen bg-[radial-gradient(circle_at_100%_0%,rgba(35,124,82,.055),transparent_28%),#f5f7f5]">
      <RouteEffects />
      <a href="#admin-content" className="skip-link">Saltar al contenido</a>
      {/* Barra lateral (escritorio) */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 border-r border-line/80 bg-surface transition-[width,padding] duration-300 lg:block',
          sidebarCollapsed ? 'w-[88px] px-3 py-5' : 'w-[280px] p-5',
        )}
      >
        <SidebarContent compact={sidebarCollapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior (movil): abre el drawer con la navegacion */}
        <div className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-line bg-surface/95 px-3 py-2 backdrop-blur lg:hidden">
          <MuiButton
            onClick={() => setDrawerOpen(true)}
            color="inherit"
            startIcon={<Menu className="size-5" />}
            aria-label="Abrir menu del panel"
            sx={{ color: 'primary.dark', fontWeight: 750 }}
          >
            Panel
          </MuiButton>
          <div className="flex items-center gap-1">
            <IconButton aria-label="Notificaciones"><Badge color="secondary" variant="dot"><Bell className="size-[18px]" /></Badge></IconButton>
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.light', color: 'primary.dark', fontSize: 12, fontWeight: 800 }}>{initials}</Avatar>
          </div>
        </div>

        <header className="hidden h-[76px] items-center justify-between border-b border-line/80 bg-surface/90 px-8 backdrop-blur lg:flex">
          <div><div className="flex items-center gap-2 text-xs text-ink-muted">Panel de administración <ChevronRight className="size-3" /><span className="font-medium text-ink">{activeLink?.label ?? 'Inicio'}</span></div><p className="mt-0.5 text-sm font-semibold text-ink">{scopeText}</p></div>
          <div className="flex items-center gap-1">
            <MuiButton component={Link} to={ROUTES.home} variant="outlined" size="small" endIcon={<ExternalLink className="size-3.5" />} sx={{ mr: 1.5 }}>Ver tienda</MuiButton>
            <Tooltip title="Notificaciones"><IconButton aria-label="Notificaciones"><Badge color="secondary" variant="dot"><Bell className="size-[18px]" /></Badge></IconButton></Tooltip>
            <Avatar sx={{ ml: .5, width: 36, height: 36, bgcolor: 'primary.light', color: 'primary.dark', fontSize: 12, fontWeight: 800 }}>{initials}</Avatar>
          </div>
        </header>

        <main id="admin-content" tabIndex={-1} className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1500px] animate-fade-in"><Outlet /></div>
        </main>
      </div>

      {/* Drawer móvil con foco, teclado y backdrop gestionados por MUI. */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ display: { lg: 'none' } }}
        slotProps={{ paper: { sx: { width: 'min(86vw, 304px)' } } }}
      >
        <Box sx={{ position: 'relative', height: '100%', p: 2.5 }}>
          <IconButton
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
            sx={{ position: 'absolute', right: 10, top: 10, zIndex: 1 }}
          >
            <X className="size-5" />
          </IconButton>
          <SidebarContent onNavigate={() => setDrawerOpen(false)} />
        </Box>
      </Drawer>
    </div>
  );
};
