import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar, Box, Button as MuiButton, Drawer, IconButton, Tooltip } from '@mui/material';
import {
  Crown,
  LogOut,
  Menu,
  Store,
  X,
  ChevronRight,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  CircleUserRound,
} from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { PERM } from '@constants/permissions';
import { ADMIN_NAV, ADMIN_NAV_GROUPS, type AdminNavEntry } from '@constants/adminNav';
import { rolesLabel } from '@constants/roles';
import { usePermissions } from '@hooks/usePermissions';
import { useLogout } from '@hooks/useLogout';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useAppSelector } from '@app/hooks';
import { cn } from '@lib/cn';
import { AppLogo } from '@components/common/AppLogo';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { RouteEffects } from './RouteEffects';
import { AdminOrderNotifications } from '@features/admin/components/AdminOrderNotifications';

/**
 * MENU DEL PANEL
 * ---------------------------------------------------------------------------
 * Las entradas salen de `constants/adminNav.ts`, la MISMA tabla que usan el
 * recibidor, el resumen de accesos y el router. Cada fila declara que permisos
 * necesita y el menu se arma con las que el usuario puede usar.
 *
 * Por eso el nutricionista y el superadmin entran al MISMO /admin y ven cosas
 * distintas: es el mismo edificio, distintas llaves.
 *
 * Cuando esta tabla vivia aqui habia tres copias divergentes de las mismas
 * pantallas y el menu prometia accesos que el router luego negaba.
 */
const SIDEBAR_STORAGE_KEY = 'verde-bowl.admin.sidebar-collapsed';

/**
 * El corte del armazon esta en 900 px, no en 1024.
 *
 * Con `lg` (1024) toda la franja de tablet se quedaba SIN cabecera: entre 768 y
 * 1023 px solo sobrevivia la barra movil, que decia "Panel" y nada mas. Un
 * despachador con varias sucursales trabajaba el turno entero sin saber sobre
 * cual estaba operando.
 *
 * 900 px es el `md` de MUI, asi que el drawer y el armazon cortan en el mismo
 * punto (`display: { md: 'none' }` mas abajo) en vez de mezclar dos escalas.
 * Entre 900 y 1023 el menu cabe, pero solo en iconos: a ancho completo dejaria
 * el contenido en 620 px. Esa franja es la unica que necesita saberse en JS
 * (el ancho lo resuelven las clases `min-[900px]:`), porque cambia el CONTENIDO
 * de la barra —iconos en vez de etiquetas—, no solo su tamano.
 */
const SIDEBAR_VISIBLE_QUERY = '(min-width: 900px)';
const NARROW_SIDEBAR_QUERY = '(min-width: 900px) and (max-width: 1023.98px)';

/**
 * Bloques del menu con las entradas que este usuario SI puede abrir, ya sin los
 * bloques vacios. Una fila sin `group` (o con uno que no exista) no puede
 * desaparecer del menu por un descuido de la tabla: cae en un bloque final sin
 * titulo, que es visible aunque no este etiquetado.
 */
const visibleGroups = (links: AdminNavEntry[]) => {
  const known = new Set<string>(ADMIN_NAV_GROUPS.map((group) => group.id));
  const groups = ADMIN_NAV_GROUPS.map((group) => ({
    id: group.id as string,
    label: group.label as string,
    entries: links.filter((link) => link.group === group.id),
  }));

  const orphans = links.filter((link) => !link.group || !known.has(link.group));
  if (orphans.length > 0) groups.push({ id: 'sin-bloque', label: '', entries: orphans });

  return groups.filter((group) => group.entries.length > 0);
};

export const AdminLayout = () => {
  const { can, canAny, isSuperAdmin, branchIds } = usePermissions();
  const user = useAppSelector((state) => state.auth.user);
  const logout = useLogout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true',
  );
  const location = useLocation();

  /**
   * Entre 900 y 1023 px el menu solo cabe en iconos; por debajo de 900 no cabe y
   * se va al drawer. Fuera de esa franja manda la preferencia guardada.
   */
  const isNarrow = useMediaQuery(NARROW_SIDEBAR_QUERY);
  const sidebarVisible = useMediaQuery(SIDEBAR_VISIBLE_QUERY);
  const sidebarCompact = sidebarCollapsed || isNarrow;

  // Girar la tablet con el drawer abierto lo ocultaba por CSS pero dejaba el
  // cuerpo bloqueado por el modal de MUI: la pantalla no scrolleaba y no habia
  // nada visible que cerrar.
  useEffect(() => {
    if (sidebarVisible) setDrawerOpen(false);
  }, [sidebarVisible]);

  const links = ADMIN_NAV.filter((link) =>
    link.superAdminOnly ? isSuperAdmin : canAny(...link.anyOf),
  );

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
            <IconButton onClick={toggleSidebar} aria-label="Contraer menú lateral">
              <PanelLeftClose className="size-[18px]" />
            </IconButton>
          </Tooltip>
        )}
      </div>

      {compact ? (
        <Tooltip title={`${fullName} · ${roleText} · ${scopeText}`} placement="right">
          <div className="my-5 flex justify-center">
            <Avatar src={user?.avatarUrl ?? undefined} alt={[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Usuario'} sx={{ width: 40, height: 40, bgcolor: 'primary.light', color: 'primary.dark', fontSize: 12, fontWeight: 800, border: '2px solid white', boxShadow: 2 }}>
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
        {visibleGroups(links).map(({ id, label: sectionLabel, entries }, visibleIndex) => {
          return (
            /* El separador se cuenta sobre los bloques VISIBLES: al cocinero, que
             * no ve "Vista general", el indice crudo le pintaba una linea suelta
             * encima de la primera entrada del menu. */
            <div key={id} className={cn(visibleIndex > 0 && (compact ? 'mt-3 border-t border-line pt-3' : 'mt-5'))}>
              {!compact && sectionLabel && (
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted/65">
                  {sectionLabel}
                </p>
              )}
              <div className="grid gap-1">
                {entries.map(({ to, label, icon: Icon }) => (
                  <Tooltip key={to} title={compact ? label : ''} placement="right" arrow>
                    <span className="block w-full">
                      <NavLink
                        to={to}
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
            {/* Entre 900 y 1023 px el menu ancho dejaria el contenido en ~620 px:
                ahi no hay nada que expandir y el boton solo enganaria. */}
            {!isNarrow && (
              <Tooltip title="Expandir menú" placement="right">
                <IconButton onClick={toggleSidebar} aria-label="Expandir menú lateral" sx={{ display: 'flex', mx: 'auto', mb: 0.5 }}>
                  <PanelLeftOpen className="size-[18px]" />
                </IconButton>
              </Tooltip>
            )}
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
    <div className="admin-shell flex min-h-screen bg-[radial-gradient(circle_at_100%_0%,rgba(96,32,96,.055),transparent_28%),#f8f6f8]">
      <RouteEffects />
      <a href="#admin-content" className="skip-link">Saltar al contenido</a>
      {/* Barra lateral: desde 900 px (tablet horizontal), en iconos hasta 1024. */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 border-r border-line/80 bg-surface transition-[width,padding] duration-300 min-[900px]:block',
          sidebarCompact ? 'w-[88px] px-3 py-5' : 'w-[280px] p-5',
        )}
      >
        <SidebarContent compact={sidebarCompact} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Barra superior por debajo de 900 px: abre el drawer y, sobre todo, dice
          DONDE esta y SOBRE QUE opera. Antes ponia "Panel" fijo y una campana con
          punto permanente que no llevaba a ningun sitio, asi que un despachador
          con varias sucursales pasaba el turno entero sin saber en cual estaba.
          La campana abre ahora la bandeja operativa de pedidos y solo aparece a
          quien tiene `order.read`.
        */}
        <div className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur min-[900px]:hidden">
          <MuiButton
            onClick={() => setDrawerOpen(true)}
            color="inherit"
            startIcon={<Menu className="size-5" />}
            aria-label="Abrir menú del panel"
            sx={{ color: 'primary.dark', fontWeight: 750, minHeight: 44, flexShrink: 0 }}
          >
            Menú
          </MuiButton>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight text-ink">{activeLink?.label ?? 'Panel'}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] leading-tight text-ink-muted">
              <Store className="size-3 shrink-0" />
              <span className="truncate">{scopeText}</span>
            </p>
          </div>
          {!sidebarVisible && user && can(PERM.ORDER_READ) && <AdminOrderNotifications userId={user.id} />}
          <Tooltip title={`${fullName} · ${roleText}`}>
            <Avatar src={user?.avatarUrl ?? undefined} alt={[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Usuario'} sx={{ width: 34, height: 34, flexShrink: 0, bgcolor: 'primary.light', color: 'primary.dark', fontSize: 12, fontWeight: 800 }}>{initials}</Avatar>
          </Tooltip>
        </div>

        <header className="hidden h-[76px] items-center justify-between gap-3 border-b border-line/80 bg-surface/90 px-5 backdrop-blur min-[900px]:flex lg:px-8">
          <div className="min-w-0">
            <Breadcrumbs
              className="text-xs"
              items={[
                { label: 'Panel de administración', to: ROUTES.admin },
                { label: activeLink?.label ?? 'Inicio' },
              ]}
            />
            <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Store className="size-3.5 shrink-0 text-ink-muted" />
              {scopeText}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <MuiButton component={Link} to={ROUTES.home} variant="outlined" size="small" endIcon={<ExternalLink className="size-3.5" />} sx={{ mr: 1.5 }}>Ver tienda</MuiButton>
            {sidebarVisible && user && can(PERM.ORDER_READ) && <AdminOrderNotifications userId={user.id} />}
            <Tooltip title={`${fullName} · ${roleText}`}>
              <Avatar src={user?.avatarUrl ?? undefined} alt={[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Usuario'} sx={{ ml: .5, width: 36, height: 36, bgcolor: 'primary.light', color: 'primary.dark', fontSize: 12, fontWeight: 800 }}>{initials}</Avatar>
            </Tooltip>
          </div>
        </header>

        <main id="admin-content" tabIndex={-1} className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1500px] animate-fade-in"><Outlet /></div>
        </main>
      </div>

      {/* Drawer móvil con foco, teclado y backdrop gestionados por MUI.
          `md` de MUI son 900 px: el mismo corte que la barra lateral, para no
          mezclar la escala de MUI con la de Tailwind y dejar un hueco sin menu. */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ display: { md: 'none' } }}
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
