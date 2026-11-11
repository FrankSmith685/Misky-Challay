import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, Clock, Download, LayoutDashboard, Lock, MapPinned, Percent, Play, RefreshCw, ScanLine, ShoppingBag, Smartphone, TrendingUp, WalletCards, WifiOff, XCircle } from 'lucide-react';
import { Card, CardDescription } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { formatCurrency, formatRelative } from '@lib/format';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import type { Reports } from '../types';
import { ROUTES } from '@constants/routes';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { accessApi, type TeamsOverview } from '../services/access.service';

/** Clases literales: el JIT de Tailwind no ve un `xl:grid-cols-${n}` interpolado. */
const TILE_COLUMNS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  5: 'sm:grid-cols-2 xl:grid-cols-5',
  7: 'sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7',
};

type RangePreset = '7' | '30' | 'month' | 'custom';

const limaDate = (date: Date): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

const shiftIsoDate = (iso: string, days: number): string => {
  const date = new Date(`${iso}T12:00:00-05:00`);
  date.setDate(date.getDate() + days);
  return limaDate(date);
};

/**
 * Resumen operativo de los ultimos 30 dias (seccion 18.3).
 *
 * Era la pantalla de aterrizaje del Administrador de sucursal y le salia EN BLANCO
 * cada dia: el endpoint exigia `report.sales.read`, ese rol solo tiene
 * `report.operations.read`, y el 403 acababa en un `if (!data) return null`. Ahora
 * el servidor lo deja entrar y omite el bloque de dinero, y cuando de verdad falla
 * algo se ve el fallo con un boton de reintento.
 */
const AdminDashboardPage = () => {
  const { can } = usePermissions();
  const { branchId, branches, setBranchId, setGlobalScope, isLoadingBranches, branchesError, reloadBranches } =
    useActiveBranch({ allowAll: true });
  const [rangePreset, setRangePreset] = useState<RangePreset>('30');
  const today = limaDate(new Date());
  const [customFrom, setCustomFrom] = useState(() => shiftIsoDate(today, -30));
  const [customTo, setCustomTo] = useState(today);
  const reportRange = useMemo(() => {
    if (rangePreset === '7') return { from: shiftIsoDate(today, -6), to: today };
    if (rangePreset === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
    if (rangePreset === 'custom') return { from: customFrom, to: customTo };
    return { from: shiftIsoDate(today, -29), to: today };
  }, [customFrom, customTo, rangePreset, today]);
  const rangeLabel = rangePreset === '7' ? 'Últimos 7 días'
    : rangePreset === 'month' ? 'Mes actual'
      : rangePreset === 'custom' ? `${reportRange.from} · ${reportRange.to}`
        : 'Últimos 30 días';
  const fetcher = useCallback(
    (signal: AbortSignal) => adminApi.reports(branchId ?? undefined, signal, reportRange),
    [branchId, reportRange],
  );
  const { data, error, isLoading, lastSuccessAt, isStale, refresh } = usePolling<Reports>(
    fetcher,
    30000,
  );
  const [isExporting, setIsExporting] = useState(false);
  const [operationalOverview, setOperationalOverview] = useState<TeamsOverview | null>(null);

  useEffect(() => {
    if (!can(PERM.USER_READ)) return;
    void accessApi.teamsOverview().then(setOperationalOverview).catch(() => setOperationalOverview(null));
  }, [can]);

  const exportReport = async () => {
    setIsExporting(true);
    try {
      const file = await adminApi.exportReports(branchId ?? undefined, reportRange);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `misky-challay-reporte-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const header = (
    <PageHeader
      eyebrow="Vista general"
      icon={LayoutDashboard}
      title="Tu negocio, de un vistazo"
      description={`${branchId === null ? 'Todas las sucursales' : 'Sucursal seleccionada'} · ${rangeLabel}.`}
      action={
        <>
          <BranchSelector
            value={branchId}
            branches={branches}
            onChange={setBranchId}
            allowAll
            onSelectAll={setGlobalScope}
            hasError={Boolean(branchesError)}
          />
          <label className="sr-only" htmlFor="admin-dashboard-range">Periodo del resumen</label>
          <select id="admin-dashboard-range" aria-label="Periodo del resumen" value={rangePreset} onChange={(event) => setRangePreset(event.target.value as RangePreset)} className="h-10 rounded-field border border-line bg-white px-3 text-sm font-semibold text-ink">
            <option value="7">7 días</option><option value="30">30 días</option><option value="month">Mes actual</option><option value="custom">Personalizado</option>
          </select>
          {rangePreset === 'custom' && <div className="flex items-center gap-1"><input aria-label="Desde" type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} className="h-10 rounded-field border border-line bg-white px-2 text-xs" /><input aria-label="Hasta" type="date" value={customTo} min={customFrom} max={today} onChange={(event) => setCustomTo(event.target.value)} className="h-10 rounded-field border border-line bg-white px-2 text-xs" /></div>}
          <Button
            variant="outline"
            size="sm"
            isLoading={isLoading && data !== null}
            leftIcon={<RefreshCw className="size-4" />}
            onClick={() => refresh()}
          >
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            isLoading={isExporting}
            leftIcon={<Download className="size-4" />}
            onClick={() => void exportReport()}
          >
            Exportar CSV
          </Button>
        </>
      }
    />
  );

  if (branchesError) {
    return (
      <div>
        {header}
        <LoadError message={branchesError} onRetry={() => void reloadBranches()} />
      </div>
    );
  }

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;

  // Antes esto era `return null`: area vacia, sin mensaje, con el 403 repitiendose
  // cada 30 s y nadie leyendo el `error` que el polling si calculaba.
  if (!data) {
    return (
      <div>
        {header}
        <LoadError
          title="No pudimos cargar el resumen"
          message={error ?? 'El servidor no devolvio datos para este periodo.'}
          onRetry={() => refresh()}
        />
      </div>
    );
  }

  // Sin `report.sales.read` el bloque de dinero NO viaja: los tiles de importes
  // desaparecen en vez de imprimir "S/ NaN".
  const sales = data.sales;

  const tiles = [
    ...(sales
      ? [
          {
            icon: ShoppingBag,
            label: 'Pedidos vendidos',
            value: String(sales.orders),
            hint: rangeLabel,
          },
          {
            icon: TrendingUp,
            label: 'Ventas',
            value: formatCurrency(sales.revenue),
            hint: `Ticket promedio ${formatCurrency(sales.averageTicket)}`,
          },
          {
            icon: Percent,
            label: 'Descuentos',
            value: formatCurrency(sales.discounts),
            hint: `${sales.deliveryShare}% de los pedidos son delivery`,
          },
          ...(data.platform ? [{
            icon: WalletCards,
            label: `Comisión ${Math.round((data.platform?.rate ?? 0.15) * 100)}% pendiente`,
            value: formatCurrency(data.platform.outstanding),
            hint: `${formatCurrency(data.platform.accrued)} generada · ${formatCurrency(data.platform.settled)} transferida`,
          }] : []),
        ]
      : []),
    {
      icon: Smartphone,
      label: 'Pagos por verificar',
      value: String(data.pendingPayments.count),
      hint: data.pendingPayments.count ? `${formatCurrency(data.pendingPayments.amount)} en Yape o Plin` : 'Sin transferencias pendientes',
    },
    {
      icon: Clock,
      label: 'Preparacion promedio',
      value: `${data.operations.avgPrepMinutes} min`,
      hint: `${data.operations.ticketsMeasured} tickets medidos`,
    },
    {
      icon: XCircle,
      label: 'Cancelaciones',
      value: String(data.quality.cancelled),
      hint: `${data.quality.cancellationRate}% de los pedidos`,
    },
  ];

  const experienceScope = branchId ? 'Solo esta cocina' : 'Todas las cocinas';
  // CHECKOUT_STEP se emite al obtener una cotización móvil válida; así el
  // denominador no mezcla los intentos web que usan CHECKOUT_START.
  const checkoutStarts = data.experience?.CHECKOUT_STEP ?? 0;
  const completedOrders = data.experience?.ORDER_COMPLETED ?? 0;
  const mobileConversion = checkoutStarts ? Math.min(100, Math.round((completedOrders / checkoutStarts) * 100)) : 0;
  const arQrOpens = data.experience?.AR_QR_OPEN ?? 0;
  const arTargetsFound = data.experience?.AR_TARGET_FOUND ?? 0;
  const arCameraErrors = data.experience?.AR_CAMERA_ERROR ?? 0;
  const videoQrOpens = data.experience?.VIDEO_QR_OPEN ?? 0;
  const videoPlays = data.experience?.VIDEO_PLAY ?? 0;
  const videoHalfway = data.experience?.VIDEO_PROGRESS ?? 0;
  const videoCompletes = data.experience?.VIDEO_COMPLETE ?? 0;
  const videoShares = data.experience?.VIDEO_SHARE ?? 0;

  return (
    <div>
      {header}

      {/* Banda de datos viejos: sin ella una red caida se pintaba como un negocio
          parado, con los mismos numeros congelados durante toda la jornada. */}
      {isStale && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <WifiOff className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Sin conexion con el servidor. Lo que ves es de{' '}
            {lastSuccessAt ? formatRelative(new Date(lastSuccessAt)) : 'antes'}.
          </span>
          <Button size="sm" variant="outline" onClick={() => refresh()}>
            Reintentar
          </Button>
        </div>
      )}

      {data.pendingPayments.count > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Smartphone className="size-4 shrink-0" />
          <p className="min-w-0 flex-1"><strong>{data.pendingPayments.count} pago{data.pendingPayments.count === 1 ? '' : 's'} por verificar</strong> por {formatCurrency(data.pendingPayments.amount)} en Yape o Plin.</p>
          <Link className="font-bold underline underline-offset-2" to={ROUTES.adminDirectPayments}>Revisar pagos</Link>
        </div>
      )}

      {operationalOverview && (
        <Card className="mb-4 border-amber-200 bg-amber-50/45 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.14em] text-amber-800">Centro de pendientes</p>
              <h2 className="mt-1 text-base font-black text-ink">Lo que necesita atención ahora</h2>
              <p className="mt-1 text-xs text-ink-muted">Indicadores operativos consolidados de todas las sucursales.</p>
            </div>
            <Link to={ROUTES.adminTeams} className="text-xs font-bold text-brand-700 underline underline-offset-2">Revisar cobertura</Link>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: 'Pedidos', value: operationalOverview.metrics.pendingOrders, to: ROUTES.adminOrders },
              { label: 'Cocina', value: operationalOverview.metrics.openKitchenTickets, to: ROUTES.adminKitchen },
              { label: 'Repartos sin asignar', value: operationalOverview.metrics.unassignedDeliveries, to: ROUTES.adminDelivery },
              { label: 'Compras', value: operationalOverview.metrics.pendingPurchases, to: ROUTES.adminProcurement },
              { label: 'Reclamos', value: operationalOverview.metrics.openComplaints, to: ROUTES.adminComplaints },
            ].map((item) => (
              <Link key={item.label} to={item.to} className="rounded-xl border border-amber-200 bg-white px-3 py-2.5 transition hover:border-brand-300 hover:shadow-sm">
                <span className="text-xs text-ink-muted">{item.label}</span>
                <strong className="mt-1 block text-xl font-black text-ink">{item.value}</strong>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {!sales && (
        <div className="mb-4 flex items-start gap-3 rounded-card border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>
            Los importes de venta no se muestran porque tu rol no incluye el permiso de reportes de
            ventas. El resto del resumen es tuyo.
          </p>
        </div>
      )}

      <div className={`grid gap-3 ${TILE_COLUMNS[tiles.length] ?? 'sm:grid-cols-2'}`}>
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <Card key={label} className="group p-4 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-e3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
                <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
              </div>
              <span className="grid size-9 place-items-center rounded-card bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white"><Icon className="size-[18px]" /></span>
            </div>
            <CardDescription className="mt-2 text-xs">{hint}</CardDescription>
          </Card>
        ))}
      </div>

      <Card className="mt-5 p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-semibold text-ink">Productos más vendidos</h2><p className="mt-0.5 text-xs text-ink-muted">Preferencias de tus clientes · {rangeLabel}</p></div><BarChart3 className="size-5 text-brand-500" /></div>

        {data.topProducts.length === 0 ? (
          <CardDescription>Aun no hay ventas en este periodo.</CardDescription>
        ) : (
          <ul className="space-y-3">
            {data.topProducts.map((product) => {
              const max = data.topProducts[0].units || 1;
              const percent = Math.round((product.units / max) * 100);

              return (
                <li key={product.name}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-ink">{product.name}</span>
                    <span className="text-ink-muted">
                      {product.units} und
                      {/* El importe por producto es dinero: el servidor lo anula sin
                          `report.sales.read` y aqui ni se ofrece el hueco. */}
                      {sales ? ` · ${formatCurrency(product.revenue)}` : ''}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-pill bg-surface-muted">
                    <div
                      className="h-2 rounded-pill bg-gradient-to-r from-brand-600 to-brand-400 transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-ink">Canales de venta</h2><p className="text-xs text-ink-muted">Dónde se originan tus pedidos</p></div><ShoppingBag className="size-5 text-brand-500" /></div>
          <div className="space-y-3">
            {data.channelBreakdown.length === 0 ? <CardDescription>Sin pedidos en el periodo.</CardDescription> : data.channelBreakdown.map((channel) => {
              const maxOrders = Math.max(...data.channelBreakdown.map((item) => item.orders), 1);
              return <div key={channel.channel}><div className="flex justify-between text-sm"><span className="font-semibold text-ink">{channel.channel}</span><span className="text-ink-muted">{channel.orders} pedidos{sales ? ` · ${formatCurrency(channel.revenue)}` : ''}</span></div><div className="mt-1.5 h-2 rounded-pill bg-surface-muted"><div className="h-2 rounded-pill bg-brand-500" style={{ width: `${Math.round(channel.orders / maxOrders * 100)}%` }} /></div></div>;
            })}
          </div>
        </Card>
        {sales && data.paymentBreakdown && <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-ink">Medios de pago</h2><p className="text-xs text-ink-muted">Cobros registrados en el periodo</p></div><TrendingUp className="size-5 text-brand-500" /></div><div className="space-y-3">{data.paymentBreakdown.length === 0 ? <CardDescription>Sin cobros registrados.</CardDescription> : data.paymentBreakdown.map((payment) => <div key={payment.method} className="flex items-center justify-between rounded-card bg-surface-muted px-3 py-2.5"><span className="text-sm font-semibold text-ink">{payment.method}</span><span className="text-right text-xs text-ink-muted">{payment.transactions} operaciones<br /><strong className="text-sm text-ink">{formatCurrency(payment.amount)}</strong></span></div>)}</div></Card>}
        <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-ink">Horas de mayor demanda</h2><p className="text-xs text-ink-muted">Distribución por hora local</p></div><Clock className="size-5 text-brand-500" /></div><div className="space-y-2.5">{data.hourlySales.length === 0 ? <CardDescription>Sin pedidos en el periodo.</CardDescription> : data.hourlySales.slice().sort((a, b) => b.orders - a.orders).slice(0, 5).map((hour) => <div key={hour.hour} className="flex items-center justify-between text-sm"><span className="font-semibold text-ink">{String(hour.hour).padStart(2, '0')}:00</span><span className="text-ink-muted">{hour.orders} pedidos{sales ? ` · ${formatCurrency(hour.revenue)}` : ''}</span></div>)}</div></Card>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><ScanLine className="size-5" /></span><div><h2 className="font-bold text-ink">Experiencias AR</h2><p className="text-xs text-ink-muted">Recorrido de la tarjeta QR · {experienceScope}</p></div></div>
          <div className="mt-4 grid grid-cols-3 gap-3"><div className="rounded-card bg-surface-muted p-3"><p className="text-2xl font-black text-ink">{arQrOpens}</p><p className="text-xs text-ink-muted">QR abiertos</p></div><div className="rounded-card bg-brand-50 p-3"><p className="text-2xl font-black text-brand-800">{arTargetsFound}</p><p className="text-xs text-brand-700">marcadores detectados</p></div><div className="rounded-card bg-red-50 p-3"><p className="text-2xl font-black text-red-800">{arCameraErrors}</p><p className="text-xs text-red-700">errores de cámara</p></div></div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-card bg-accent-50 text-accent-700"><Play className="size-5" /></span><div><h2 className="font-bold text-ink">Experiencias de video</h2><p className="text-xs text-ink-muted">Piloto horizontal con QR · {experienceScope}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4"><div className="rounded-card bg-surface-muted p-3"><p className="text-2xl font-black text-ink">{videoQrOpens}</p><p className="text-xs text-ink-muted">QR abiertos</p></div><div className="rounded-card bg-accent-50 p-3"><p className="text-2xl font-black text-accent-800">{videoPlays}</p><p className="text-xs text-accent-700">reproducciones</p></div><div className="rounded-card bg-brand-50 p-3"><p className="text-2xl font-black text-brand-800">{videoHalfway}</p><p className="text-xs text-brand-700">hitos de progreso</p></div><div className="rounded-card bg-emerald-50 p-3"><p className="text-2xl font-black text-emerald-800">{videoCompletes}</p><p className="text-xs text-emerald-700">completados</p></div></div>
          <p className="mt-3 text-xs text-ink-muted">Compartidos: <strong className="text-ink">{videoShares}</strong>. El progreso registra los hitos 25/50/75/90 %.</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><MapPinned className="size-5" /></span><div><h2 className="font-bold text-ink">Calidad de cobertura</h2><p className="text-xs text-ink-muted">Validaciones reales del cliente · {experienceScope}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-card bg-brand-50 p-3"><p className="text-2xl font-black text-brand-800">{data.experience?.COVERAGE_SUCCESS ?? 0}</p><p className="text-xs text-brand-700">direcciones cubiertas</p></div><div className="rounded-card bg-amber-50 p-3"><p className="text-2xl font-black text-amber-900">{data.experience?.COVERAGE_FAIL ?? 0}</p><p className="text-xs text-amber-800">fuera de cobertura</p></div></div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-card bg-red-50 text-red-700"><AlertTriangle className="size-5" /></span><div><h2 className="font-bold text-ink">Fricción de compra</h2><p className="text-xs text-ink-muted">Errores que requieren atención · {experienceScope}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-card bg-surface-muted p-3"><p className="text-2xl font-black text-ink">{data.experience?.CHECKOUT_START ?? 0}</p><p className="text-xs text-ink-muted">intentos de pago</p></div><div className="rounded-card bg-red-50 p-3"><p className="text-2xl font-black text-red-800">{data.experience?.CHECKOUT_ERROR ?? 0}</p><p className="text-xs text-red-700">errores de checkout</p></div></div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><TrendingUp className="size-5" /></span><div><h2 className="font-bold text-ink">Embudo móvil</h2><p className="text-xs text-ink-muted">Medición con consentimiento · {experienceScope}</p></div></div>
          <div className="mt-4 grid grid-cols-3 gap-3"><div className="rounded-card bg-surface-muted p-3"><p className="text-2xl font-black text-ink">{checkoutStarts}</p><p className="text-xs text-ink-muted">cotizados</p></div><div className="rounded-card bg-brand-50 p-3"><p className="text-2xl font-black text-brand-800">{completedOrders}</p><p className="text-xs text-brand-700">pedidos</p></div><div className="rounded-card bg-tertiary-50 p-3"><p className="text-2xl font-black text-tertiary-800">{mobileConversion}%</p><p className="text-xs text-tertiary-700">conversión</p></div></div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-card bg-amber-50 text-amber-800"><BarChart3 className="size-5" /></span><div><h2 className="font-bold text-ink">Interacción y fidelidad</h2><p className="text-xs text-ink-muted">Señales voluntarias del cliente · {experienceScope}</p></div></div>
          <div className="mt-4 grid grid-cols-3 gap-3"><div className="rounded-card bg-red-50 p-3"><p className="text-2xl font-black text-red-800">{data.experience?.FAVORITE_ADD ?? 0}</p><p className="text-xs text-red-700">favoritos</p></div><div className="rounded-card bg-amber-50 p-3"><p className="text-2xl font-black text-amber-900">{data.experience?.REVIEW_SUBMITTED ?? 0}</p><p className="text-xs text-amber-800">reseñas</p></div><div className="rounded-card bg-brand-50 p-3"><p className="text-2xl font-black text-brand-800">{data.experience?.RECOMMENDATION_OPEN ?? 0}</p><p className="text-xs text-brand-700">recomendaciones</p></div></div>
        </Card>
      </div>

      {/* Nota honesta: un evento sin cocina identificada no se atribuye a la
          seleccionada, asi que estos dos bloques pueden quedar por debajo del total. */}
      {branchId !== null && (
        <p className="mt-3 text-xs text-ink-muted">
          Los eventos de experiencia que no se pudieron atribuir a una cocina quedan fuera de este
          recuento.
        </p>
      )}
    </div>
  );
};

export default AdminDashboardPage;
