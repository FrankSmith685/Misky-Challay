import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  ExternalLink,
  Gift,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  SearchCheck,
} from 'lucide-react';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { Skeleton } from '@components/ui/Skeleton';
import { announceDataChanged, useLiveRefresh } from '@services/realtime';
import { getApiErrorMessage } from '@services/api/client';
import { formatDate } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { accountApi, type AccountNotification } from '../services/account.service';
import {
  notificationCategory,
  notificationCategoryLabel,
  notificationCategoryTone,
  type NotificationCategory,
} from '../notificationMeta';
import { notificationDestination } from '@lib/notificationDestination';

type NotificationFilter = 'ALL' | 'UNREAD' | NotificationCategory;

const CATEGORY_ORDER: NotificationCategory[] = ['ORDER', 'PAYMENT', 'PLAN', 'COMPLAINT', 'AVAILABILITY', 'SECURITY', 'OTHER'];
const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
  ORDER: PackageCheck,
  PAYMENT: CreditCard,
  PLAN: Gift,
  COMPLAINT: SearchCheck,
  AVAILABILITY: BellRing,
  SECURITY: LockKeyhole,
  OTHER: Bell,
};

const filterLabel = (filter: NotificationFilter) => {
  if (filter === 'ALL') return 'Todas';
  if (filter === 'UNREAD') return 'No leídas';
  return notificationCategoryLabel[filter];
};

const NotificationsPage = () => {
  const [items, setItems] = useState<AccountNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [newestId, setNewestId] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState<NotificationFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await accountApi.notificationFeed('CUSTOMER', page, 30);
      setItems(result.items);
      setUnread(result.unreadCount);
      setNewestId(result.newestId);
      setPages(result.totalPages);
      setError(null);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useLiveRefresh(['notifications'], load);

  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter === 'UNREAD') return !item.readAt;
    if (filter === 'ALL') return true;
    return notificationCategory(item) === filter;
  }), [filter, items]);

  const markOneRead = async (id: number) => {
    const item = items.find((entry) => entry.id === id);
    if (!item || item.readAt) return;
    try {
      await accountApi.markNotificationsRead({ ids: [id], audience: 'CUSTOMER' });
      setItems((current) => current.map((entry) => entry.id === id ? { ...entry, readAt: new Date().toISOString() } : entry));
      setUnread((current) => Math.max(0, current - 1));
      announceDataChanged(['notifications']);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  };

  const markAllRead = async () => {
    if (!unread) return;
    try {
      await accountApi.markNotificationsRead({ all: true, throughId: newestId, audience: 'CUSTOMER' });
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }));
      setUnread(0);
      announceDataChanged(['notifications']);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  };

  const header = (
    <PageHeader
      eyebrow="Mi cuenta"
      title="Notificaciones"
      description="Consulta los avisos de tus pedidos, pagos, planes y cuenta desde un solo lugar."
      icon={Bell}
      crumbs={[{ label: 'Inicio', to: ROUTES.home }, { label: 'Mi cuenta', to: ROUTES.account }, { label: 'Notificaciones' }]}
      action={
        <Button variant="outline" size="sm" disabled={!unread || refreshing} onClick={() => void markAllRead()} leftIcon={<CheckCheck className="size-4" />}>
          Marcar todo como leído
        </Button>
      }
      className="mb-6"
    />
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="grid gap-4">
          <Skeleton className="h-24 w-full rounded-card" />
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-card" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="notification-center">
      {header}

      <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="Resumen de notificaciones">
        <div className="rounded-card border border-brand-100 bg-brand-50/65 p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-brand-700">Pendientes</p>
          <p className="mt-2 text-2xl font-black text-ink">{unread}</p>
          <p className="mt-1 text-xs text-ink-muted">Avisos sin leer</p>
        </div>
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-ink-muted">En esta página</p>
          <p className="mt-2 text-2xl font-black text-ink">{visibleItems.length}</p>
          <p className="mt-1 text-xs text-ink-muted">Según el filtro seleccionado</p>
        </div>
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-ink-muted">Actualización</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-black text-ink"><Clock3 className="size-4 text-brand-700" /> En tiempo real</p>
          <p className="mt-1 text-xs text-ink-muted">Recibimos nuevos avisos automáticamente</p>
        </div>
      </section>

      {error && (
        <div className="mb-5 flex flex-col gap-3 rounded-card border border-tertiary-200 bg-tertiary-50 p-4 text-sm text-tertiary-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()} leftIcon={<RefreshCw className="size-4" />}>Reintentar</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-line pb-4" role="tablist" aria-label="Filtrar notificaciones">
        {(['ALL', 'UNREAD', ...CATEGORY_ORDER] as NotificationFilter[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={filter === option}
            onClick={() => { setFilter(option); setPage(1); }}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3.5 text-xs font-bold transition ${filter === option ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-muted hover:border-brand-300 hover:text-brand-700'}`}
          >
            {option === 'UNREAD' && <BellRing className="size-3.5" />}
            {option !== 'ALL' && option !== 'UNREAD' && (() => { const Icon = CATEGORY_ICONS[option]; return <Icon className="size-3.5" />; })()}
            {filterLabel(option)}
          </button>
        ))}
      </div>

      {visibleItems.length === 0 ? (
        <EmptyState
          variant="inset"
          icon={filter === 'UNREAD' ? CheckCheck : Bell}
          title={filter === 'UNREAD' ? 'Todo está al día' : 'Todavía no tienes notificaciones'}
          description={filter === 'UNREAD' ? 'Cuando llegue un aviso nuevo aparecerá aquí.' : 'Aquí aparecerán los avisos importantes de tu cuenta.'}
          action={filter !== 'ALL' ? <Button variant="outline" onClick={() => setFilter('ALL')}>Ver todas</Button> : undefined}
        />
      ) : (
        <div className="mt-4 grid gap-3" aria-live="polite">
          {visibleItems.map((item) => {
            const category = notificationCategory(item);
            const Icon = CATEGORY_ICONS[category];
            const destination = notificationDestination(item);
            const content = (
              <>
                <span className={`grid size-10 shrink-0 place-items-center rounded-card ${notificationCategoryTone[category]}`}><Icon className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-[.12em] ${item.readAt ? 'text-ink-muted' : 'text-brand-700'}`}>{notificationCategoryLabel[category]}</span>
                    {!item.readAt && <span className="size-1.5 rounded-full bg-brand-600" aria-label="No leída" />}
                  </span>
                  <strong className={`mt-1 block text-sm leading-5 ${item.readAt ? 'font-semibold text-ink' : 'font-black text-ink'}`}>{item.subject}</strong>
                  {item.body && <span className="mt-1 block text-sm leading-6 text-ink-muted">{item.body}</span>}
                  <span className="mt-2 block text-xs text-ink-muted">{formatDate(item.sentAt ?? item.createdAt)}</span>
                </span>
                {destination && <ExternalLink className="size-4 shrink-0 text-brand-600" aria-hidden="true" />}
              </>
            );
            const className = `flex items-start gap-3 rounded-card border p-4 text-left transition sm:p-5 ${item.readAt ? 'border-line bg-white hover:border-brand-200 hover:shadow-e1' : 'border-brand-200 bg-brand-50/45 shadow-e1'}`;
            return destination ? (
              <Link key={item.id} to={destination} onClick={() => void markOneRead(item.id)} className={className}>{content}</Link>
            ) : (
              <button key={item.id} type="button" onClick={() => void markOneRead(item.id)} className={`w-full ${className}`}>{content}</button>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <Button variant="outline" size="sm" disabled={page <= 1 || refreshing} onClick={() => setPage((value) => value - 1)} leftIcon={<ChevronLeft className="size-4" />}>Anterior</Button>
          <span className="text-xs font-bold text-ink-muted">Página {page} de {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages || refreshing} onClick={() => setPage((value) => value + 1)}>Siguiente <ChevronRight className="size-4" /></Button>
        </div>
      )}

      <div className="mt-6 rounded-card border border-brand-100 bg-brand-50/55 p-4 text-xs leading-5 text-ink-muted">
        Puedes ajustar los canales de correo, WhatsApp y teléfono desde{' '}
        <Link to={ROUTES.accountProfile} className="font-bold text-brand-700 underline underline-offset-2">Mi perfil</Link>.
        Los avisos críticos de seguridad y atención se mantienen activos para proteger tu cuenta.
      </div>
    </div>
  );
};

export default NotificationsPage;
