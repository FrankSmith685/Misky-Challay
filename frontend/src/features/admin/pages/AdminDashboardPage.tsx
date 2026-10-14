import { useCallback } from 'react';
import { AlertTriangle, BarChart3, Clock, LayoutDashboard, Lock, MapPinned, Percent, RefreshCw, ShoppingBag, TrendingUp, WifiOff, XCircle } from 'lucide-react';
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

/** Clases literales: el JIT de Tailwind no ve un `xl:grid-cols-${n}` interpolado. */
const TILE_COLUMNS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  5: 'sm:grid-cols-2 xl:grid-cols-5',
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
  const { branchId, branches, setBranchId, isLoadingBranches, branchesError, reloadBranches } =
    useActiveBranch();
  const fetcher = useCallback(
    (signal: AbortSignal) => adminApi.reports(branchId ?? undefined, signal),
    [branchId],
  );
  const { data, error, isLoading, lastSuccessAt, isStale, refresh } = usePolling<Reports>(
    fetcher,
    30000,
  );

  const header = (
    <PageHeader
      eyebrow="Vista general"
      icon={LayoutDashboard}
      title="Tu negocio, de un vistazo"
      description="Rendimiento de los ultimos 30 dias."
      action={
        <>
          <BranchSelector
            value={branchId}
            branches={branches}
            onChange={setBranchId}
            hasError={Boolean(branchesError)}
          />
          <Button
            variant="outline"
            size="sm"
            isLoading={isLoading && data !== null}
            leftIcon={<RefreshCw className="size-4" />}
            onClick={() => refresh()}
          >
            Actualizar
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
            hint: 'Ultimos 30 dias',
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
        ]
      : []),
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
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-semibold text-ink">Productos mas vendidos</h2><p className="mt-0.5 text-xs text-ink-muted">Preferencias de tus clientes este mes</p></div><BarChart3 className="size-5 text-brand-500" /></div>

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

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
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
