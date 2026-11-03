import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardCheck, MapPin, Smartphone, Store, Truck } from 'lucide-react';
import { PageHeader } from '@components/common/PageHeader';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { ROUTES } from '@constants/routes';
import { formatCurrency, formatDate } from '@lib/format';
import type { OrderDetail } from '../types';
import { PAYMENT_STAGE_LABELS, type DirectPaymentDetail } from '../directPayments';
import { DirectPaymentCard } from './DirectPaymentCard';

export const DirectPaymentCheckout = ({
  order,
  payment,
  onReported,
  onUpdate,
}: {
  order: OrderDetail;
  payment: DirectPaymentDetail;
  onReported: () => void;
  onUpdate: (data: DirectPaymentDetail) => void;
}) => {
  const method = payment.provider === 'yape' ? 'Yape' : 'Plin';
  const description =
    payment.state === 'REVIEW'
      ? 'Tu reporte está en revisión. El taller verificará la transferencia; no necesitas volver a pagar.'
      : payment.state === 'OBSERVED'
        ? 'Revisa la observación y corrige los datos del mismo pago. No hagas otra transferencia.'
        : payment.state === 'CONFIRMED'
          ? 'El taller verificó tu pago. Ya puedes consultar los avances y la entrega de tu pedido.'
          : ['EXPIRED', 'REJECTED', 'REFUND_PENDING', 'REFUNDED'].includes(payment.state)
            ? 'Revisa el estado del pago y su historial. Si ya transferiste, consulta al taller antes de volver a pagar.'
            : 'Revisa el estado y las indicaciones de tu pago. Su verificación y el seguimiento quedan guardados en Mis pedidos.';
  return (
    <div className="container-shell py-6 sm:py-8">
      <PageHeader
        eyebrow="Pago directo al taller"
        icon={Smartphone}
        title={`Tu pago con ${method}`}
        description={description}
        crumbs={[
          { label: 'Mis pedidos', to: ROUTES.accountOrders },
          { label: order.orderNumber, to: ROUTES.accountOrderDetail(order.orderNumber) },
          { label: `Pago con ${method}` },
        ]}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DirectPaymentCard
          key={payment.paymentId}
          paymentId={payment.paymentId}
          initial={payment}
          onChange={onReported}
          onUpdate={onUpdate}
        />
        <aside
          aria-label="Resumen del pedido y seguimiento"
          className="grid min-w-0 gap-4 lg:sticky lg:top-24"
        >
          <Card shadow="e1">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-brand-700">
              Tu pedido
            </p>
            <h2 className="mt-1 text-lg font-bold text-ink">Resumen del pedido</h2>
            <p className="mt-1 break-all text-xs text-ink-muted">{order.orderNumber}</p>
            {order.items.length > 0 && (
              <ul className="mt-4 space-y-3 border-t border-line pt-4">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {item.quantity} × {item.productNameSnapshot}
                      </p>
                      {item.variantNameSnapshot && (
                        <p className="mt-0.5 text-xs text-ink-muted">{item.variantNameSnapshot}</p>
                      )}
                    </div>
                    <span className="shrink-0 tabular-nums text-ink">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              {Number.isFinite(order.subtotal) && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Productos</dt>
                  <dd className="font-medium tabular-nums">{formatCurrency(order.subtotal)}</dd>
                </div>
              )}
              {Number.isFinite(order.deliveryFee) && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">
                    {order.deliveryType === 'PICKUP' ? 'Recojo en taller' : order.deliveryVehicleType === 'CAR' ? 'Entrega en auto' : 'Delivery'}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {order.deliveryFee === 0 ? 'Sin costo' : formatCurrency(order.deliveryFee)}
                  </dd>
                </div>
              )}
              {order.discountTotal > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Descuentos</dt>
                  <dd className="font-medium tabular-nums">
                    − {formatCurrency(order.discountTotal)}
                  </dd>
                </div>
              )}
              {(order.walletAmount ?? 0) > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Saldo del plan aplicado</dt>
                  <dd className="font-medium tabular-nums">
                    − {formatCurrency(order.walletAmount!)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-line pt-3 font-bold text-ink">
                <dt>Total del pedido</dt>
                <dd className="tabular-nums">{formatCurrency(order.grandTotal)}</dd>
              </div>
              {payment.stage !== 'FULL' && (
                <div className="flex justify-between gap-3 rounded-card bg-brand-50 p-3 font-semibold text-brand-800">
                  <dt>{PAYMENT_STAGE_LABELS[payment.stage]}</dt>
                  <dd className="tabular-nums">{formatCurrency(payment.amount)}</dd>
                </div>
              )}
            </dl>
            {order.taxTotal > 0 && (
              <p className="mt-2 text-[11px] text-ink-muted">
                Incluye IGV: {formatCurrency(order.taxTotal)}
              </p>
            )}
            <div className="mt-4 space-y-3 border-t border-line pt-4 text-xs leading-5 text-ink-muted">
              {order.branch && (
                <p className="flex items-start gap-2">
                  <Store className="mt-0.5 size-4 shrink-0 text-brand-700" />
                  <span>{order.branch.name}</span>
                </p>
              )}
              {order.scheduledAt && (
                <p className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-brand-700" />
                  <span>{formatDate(order.scheduledAt)}</span>
                </p>
              )}
              {order.addressSnapshotJson?.line1 && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" />
                  <span>
                    {order.addressSnapshotJson.line1}
                    {order.addressSnapshotJson.districtName
                      ? ` · ${order.addressSnapshotJson.districtName}`
                      : ''}
                  </span>
                </p>
              )}
              {order.deliveryType === 'PICKUP' && order.branch?.addressLine && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" />
                  <span>{order.branch.addressLine}</span>
                </p>
              )}
            </div>
            <Button
              component={Link}
              to={ROUTES.accountOrderDetail(order.orderNumber)}
              variant="outline"
              className="mt-5 w-full"
              sx={{ whiteSpace: 'normal' }}
              leftIcon={<Truck className="size-4" />}
            >
              Ver seguimiento del pedido
            </Button>
          </Card>
          <Card shadow="none" className="bg-brand-50/40">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <ClipboardCheck className="size-4 text-brand-700" />
              ¿Qué pasa después?
            </h2>
            <ol className="mt-3 space-y-3 text-xs leading-5 text-ink-muted">
              <li>
                <span className="font-semibold text-ink">1. Envías el reporte.</span> El código y la
                constancia ayudan a identificar tu transferencia.
              </li>
              <li>
                <span className="font-semibold text-ink">2. El taller lo verifica.</span> Reportar
                un pago todavía no significa que esté confirmado.
              </li>
              <li>
                <span className="font-semibold text-ink">3. Sigues tu pedido.</span> La verificación
                y sus avances quedan en Mis pedidos.
              </li>
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
};
