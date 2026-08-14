import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar, IconButton, Tooltip } from '@mui/material';
import {
  ClipboardList,
  Heart,
  Home,
  LayoutDashboard,
  LogOut,
  MapPin,
  User2,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
  Salad,
  Star,
} from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { usePermissions } from '@hooks/usePermissions';
import { useLogout } from '@hooks/useLogout';
import { useAppSelector } from '@app/hooks';
import { Header } from './Header';
import { Footer } from './Footer';
import { cn } from '@lib/cn';
import { RouteEffects } from './RouteEffects';
import { CookieConsent } from './CookieConsent';
import { ActiveOrderPill } from './ActiveOrderPill';
import { resolveStaffAccess } from '@features/auth/staffAccess';

interface AccountLink {
  to: string;
  label: string;
  icon: typeof User2;
  section: 'ACTIVIDAD' | 'CUENTA';
  /** Solo el indice: sin `end`, /cuenta se marcaria activo en todas sus hijas. */
  end?: boolean;
}

/* El orden es el de uso real: a una tienda de comida se entra a ver el pedido, no a
 * editar el perfil. Ademas deja "Mis pedidos" al principio del carrusel movil, donde
 * antes salia cortado. */
const ACCOUNT_LINKS: AccountLink[] = [
  { to: ROUTES.account, label: 'Inicio', icon: Home, section: 'ACTIVIDAD', end: true },
  { to: ROUTES.accountOrders, label: 'Mis pedidos', icon: ClipboardList, section: 'ACTIVIDAD' },
  { to: ROUTES.accountWallet, label: 'Mi saldo', icon: Wallet, section: 'ACTIVIDAD' },
  { to: ROUTES.accountFavorites, label: 'Mis favoritos', icon: Heart, section: 'ACTIVIDAD' },
  { to: ROUTES.accountSavedBowls, label: 'Bowls guardados', icon: Salad, section: 'ACTIVIDAD' },
  { to: ROUTES.accountReviews, label: 'Mis opiniones', icon: Star, section: 'ACTIVIDAD' },
  { to: ROUTES.accountProfile, label: 'Mi perfil', icon: User2, section: 'CUENTA' },
  { to: ROUTES.accountAddresses, label: 'Mis direcciones', icon: MapPin, section: 'CUENTA' },
];

const ACCOUNT_SECTIONS = [
  { id: 'ACTIVIDAD', label: 'Actividad' },
  { id: 'CUENTA', label: 'Cuenta' },
] as const;

const ACCOUNT_SIDEBAR_KEY = 'verde-bowl.account.sidebar-collapsed';

export const AccountLayout = () => {
  const { isStaff } = usePermissions();
  const logout = useLogout();
  const user = useAppSelector((state) => state.auth.user);
  const staffAccess = resolveStaffAccess({ roles: user?.roles, permissions: user?.permissions, isSuperAdmin: user?.isSuperAdmin });
  const { pathname } = useLocation();
  const mobileNavRef = useRef<HTMLElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(ACCOUNT_SIDEBAR_KEY) === 'true',
  );
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Mi cuenta';
  const initials = [user?.firstName, user?.lastName].filter(Boolean).map((part) => part?.[0]).join('').slice(0, 2).toUpperCase() || 'VB';

  /* Entrando directo a una seccion, su pill podia quedar fuera del carrusel y la
   * navegacion parecia no tener nada activo. Se mueve solo el scroll horizontal de la
   * nav: scrollIntoView arrastraria tambien la pagina, que acaba de subirse al tope. */
  useEffect(() => {
    const nav = mobileNavRef.current;
    const active = nav?.querySelector('[aria-current="page"]');
    if (!nav || !(active instanceof HTMLElement)) return;
    nav.scrollTo({
      left: active.offsetLeft - (nav.clientWidth - active.clientWidth) / 2,
      behavior: 'smooth',
    });
  }, [pathname]);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      localStorage.setItem(ACCOUNT_SIDEBAR_KEY, String(!current));
      return !current;
    });
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-11 items-center rounded-field text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted',
      sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
      isActive && 'bg-brand-600 text-white hover:bg-brand-600',
    );

  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <RouteEffects />
      <a href="#account-content" className="skip-link">Saltar al contenido</a>
      <Header />
      <ActiveOrderPill />

      {/* El sidebar entra en lg, no en md: en tablet vertical se comia 288px y dejaba
        * el contenido en una columna de ~400px, con las reglas sm: troceando el texto. */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-5 lg:flex-row lg:gap-8 lg:px-6 lg:py-9">
        <div className="flex items-center gap-3 rounded-card border border-line bg-white p-3 shadow-sm lg:hidden">
          <Avatar src={user?.avatarUrl ?? undefined} alt={fullName} sx={{ width: 40, height: 40, bgcolor: 'primary.dark', color: 'white', fontSize: 12, fontWeight: 800 }}>{initials}</Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-ink">{fullName}</p>
            <p className="truncate text-xs text-ink-muted">{user?.email}</p>
          </div>
          <IconButton size="small" color="error" onClick={() => void logout()} aria-label="Cerrar sesión">
            <LogOut className="size-[18px]" />
          </IconButton>
        </div>

        {/* Navegacion movil y tablet: fila horizontal desplazable. El top-16 sigue al
          * Toolbar, que crece a 72px en el md de MUI (900px), no en el de Tailwind. */}
        <nav
          ref={mobileNavRef}
          aria-label="Secciones de mi cuenta"
          className="sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto border-y border-line bg-surface/95 px-4 py-3 backdrop-blur [scrollbar-width:none] min-[900px]:top-[72px] lg:hidden"
        >
          {ACCOUNT_LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-pill border px-3.5 py-2 text-xs font-semibold transition-colors',
                  isActive ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-line bg-surface text-ink-muted',
                )
              }
            >
              <Icon className="size-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Navegacion de escritorio, expandida o en modo solo iconos. */}
        <aside className={cn('hidden shrink-0 transition-[width] duration-300 lg:sticky lg:top-24 lg:block lg:h-fit', sidebarCollapsed ? 'w-20' : 'w-64')}>
          <div className={cn('mb-4 overflow-hidden rounded-card bg-gradient-to-br from-brand-700 to-brand-900 text-white shadow-lg shadow-brand-900/10', sidebarCollapsed ? 'grid place-items-center p-3' : 'p-5')}>
            <Tooltip title={sidebarCollapsed ? `${fullName} · ${user?.email ?? ''}` : ''} placement="right">
              <Avatar src={user?.avatarUrl ?? undefined} alt={fullName} sx={{ width: 44, height: 44, bgcolor: 'rgba(255,255,255,.16)', color: 'white', fontSize: 13, fontWeight: 800, border: '1px solid rgba(255,255,255,.2)' }}>{initials}</Avatar>
            </Tooltip>
            {!sidebarCollapsed && (
              <>
                <p className="mt-4 truncate text-lg font-bold">{fullName}</p>
                <p className="mt-0.5 truncate text-xs text-brand-100">{user?.email}</p>
                <p className="mt-3 text-xs leading-5 text-brand-100">Pedidos, saldo, direcciones y preferencias en un solo lugar.</p>
              </>
            )}
          </div>

          <nav className={cn('rounded-card border border-line bg-surface shadow-e2', sidebarCollapsed ? 'p-2' : 'p-2.5')} aria-label="Navegación de mi cuenta">
            {ACCOUNT_SECTIONS.map((section, index) => (
              <div key={section.id} className={cn(index > 0 && 'mt-3 border-t border-line pt-3')}>
                {/* Sin opacidad: al 65% estos rotulos de 10px se quedaban en ~2.7:1. */}
                {!sidebarCollapsed && <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ink-muted">{section.label}</p>}
                <div className="grid gap-1">
                  {ACCOUNT_LINKS.filter((link) => link.section === section.id).map(({ to, label, icon: Icon, end }) => (
                    <Tooltip key={to} title={sidebarCollapsed ? label : ''} placement="right" arrow>
                      <span className="block w-full">
                        <NavLink
                          to={to}
                          end={end}
                          aria-label={label}
                          className={({ isActive }) =>
                            cn(
                              'flex min-h-11 w-full items-center rounded-field text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted',
                              sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                              isActive && 'bg-brand-600 text-white hover:bg-brand-600',
                            )
                          }
                        >
                          <Icon className="size-[18px] shrink-0" />
                          {!sidebarCollapsed && <span>{label}</span>}
                        </NavLink>
                      </span>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}

            {isStaff && (
              <div className="mt-3 border-t border-line pt-3">
                <Tooltip title={sidebarCollapsed ? staffAccess.menuLabel : ''} placement="right" arrow>
                  <span className="block w-full">
                    <NavLink to={staffAccess.to} className={linkClass} aria-label={staffAccess.menuLabel}>
                      <LayoutDashboard className="size-[18px] shrink-0" />
                      {!sidebarCollapsed && staffAccess.menuLabel}
                    </NavLink>
                  </span>
                </Tooltip>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
              <Tooltip title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'} placement="right">
                <IconButton size="small" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}>
                  {sidebarCollapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Cerrar sesión" placement="right">
                <IconButton size="small" color="error" onClick={() => void logout()} aria-label="Cerrar sesión">
                  <LogOut className="size-[18px]" />
                </IconButton>
              </Tooltip>
            </div>
          </nav>
        </aside>

        <main id="account-content" tabIndex={-1} className="min-h-[560px] min-w-0 flex-1 rounded-card border border-line/80 bg-surface p-4 shadow-e2 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <Footer />
      {/* Tambien aqui: el consentimiento no puede aparecer y desaparecer segun la seccion. */}
      <CookieConsent />
    </div>
  );
};
