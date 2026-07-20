import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Avatar, IconButton, Tooltip } from '@mui/material';
import {
  ClipboardList,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  User2,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
  Salad,
} from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { usePermissions } from '@hooks/usePermissions';
import { useLogout } from '@hooks/useLogout';
import { useAppSelector } from '@app/hooks';
import { Header } from './Header';
import { Footer } from './Footer';
import { cn } from '@lib/cn';
import { RouteEffects } from './RouteEffects';

const ACCOUNT_LINKS = [
  { to: ROUTES.accountProfile, label: 'Mi perfil', icon: User2, section: 'CUENTA' },
  { to: ROUTES.accountAddresses, label: 'Mis direcciones', icon: MapPin, section: 'CUENTA' },
  { to: ROUTES.accountOrders, label: 'Mis pedidos', icon: ClipboardList, section: 'ACTIVIDAD' },
  { to: ROUTES.accountWallet, label: 'Mi saldo', icon: Wallet, section: 'ACTIVIDAD' },
  { to: ROUTES.accountFavorites, label: 'Mis favoritos', icon: Heart, section: 'ACTIVIDAD' },
  { to: ROUTES.accountSavedBowls, label: 'Bowls guardados', icon: Salad, section: 'ACTIVIDAD' },
];

const ACCOUNT_SECTIONS = [
  { id: 'CUENTA', label: 'Cuenta' },
  { id: 'ACTIVIDAD', label: 'Actividad' },
] as const;

const ACCOUNT_SIDEBAR_KEY = 'verde-bowl.account.sidebar-collapsed';

export const AccountLayout = () => {
  const { isStaff } = usePermissions();
  const logout = useLogout();
  const user = useAppSelector((state) => state.auth.user);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(ACCOUNT_SIDEBAR_KEY) === 'true',
  );
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Mi cuenta';
  const initials = [user?.firstName, user?.lastName].filter(Boolean).map((part) => part?.[0]).join('').slice(0, 2).toUpperCase() || 'VB';

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      localStorage.setItem(ACCOUNT_SIDEBAR_KEY, String(!current));
      return !current;
    });
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-11 items-center rounded-xl text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted',
      sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
      isActive && 'bg-brand-600 text-white hover:bg-brand-600',
    );

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f9f8]">
      <RouteEffects />
      <a href="#account-content" className="skip-link">Saltar al contenido</a>
      <Header />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:py-10 lg:px-6">
        {/* Navegacion movil: fila horizontal desplazable */}
        <nav className="sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          {ACCOUNT_LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors',
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
        <aside className={cn('hidden shrink-0 transition-[width] duration-300 md:block', sidebarCollapsed ? 'w-20' : 'w-64')}>
          <div className={cn('mb-4 overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-brand-700 to-brand-900 text-white shadow-lg shadow-brand-900/10', sidebarCollapsed ? 'grid place-items-center p-3' : 'p-5')}>
            <Tooltip title={sidebarCollapsed ? `${fullName} · ${user?.email ?? ''}` : ''} placement="right">
              <Avatar sx={{ width: 44, height: 44, bgcolor: 'rgba(255,255,255,.16)', color: 'white', fontSize: 13, fontWeight: 800, border: '1px solid rgba(255,255,255,.2)' }}>{initials}</Avatar>
            </Tooltip>
            {!sidebarCollapsed && (
              <>
                <p className="mt-4 truncate text-lg font-bold">{fullName}</p>
                <p className="mt-0.5 truncate text-xs text-brand-100">{user?.email}</p>
                <p className="mt-3 text-xs leading-5 text-brand-100">Pedidos, saldo, direcciones y preferencias en un solo lugar.</p>
              </>
            )}
          </div>

          <nav className={cn('rounded-[1.25rem] border border-line bg-surface shadow-[0_10px_30px_rgba(20,32,26,.05)]', sidebarCollapsed ? 'p-2' : 'p-2.5')} aria-label="Navegación de mi cuenta">
            {ACCOUNT_SECTIONS.map((section, index) => (
              <div key={section.id} className={cn(index > 0 && 'mt-3 border-t border-line pt-3')}>
                {!sidebarCollapsed && <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ink-muted/65">{section.label}</p>}
                <div className="space-y-1">
                  {ACCOUNT_LINKS.filter((link) => link.section === section.id).map(({ to, label, icon: Icon }) => (
                    <Tooltip key={to} title={sidebarCollapsed ? label : ''} placement="right" arrow>
                      <span className="block w-full">
                        <NavLink
                          to={to}
                          aria-label={label}
                          className={({ isActive }) =>
                            cn(
                              'flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted',
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
                <Tooltip title={sidebarCollapsed ? 'Panel de gestión' : ''} placement="right" arrow>
                  <span className="block w-full">
                    <NavLink to={ROUTES.admin} className={linkClass} aria-label="Panel de gestión">
                      <LayoutDashboard className="size-[18px] shrink-0" />
                      {!sidebarCollapsed && 'Panel de gestión'}
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

        <main id="account-content" tabIndex={-1} className="min-w-0 flex-1 rounded-[1.5rem] border border-line/80 bg-surface p-4 shadow-[0_12px_40px_rgba(20,32,26,.045)] sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  );
};
