import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Info, Printer, ReceiptText } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Modal } from '@components/ui/Modal';
import { formatCurrency, formatDate } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { useBusinessInfo } from '@services/businessInfo';
import { adminApi } from '../services/admin.service';
import type { AdminOrderDetail } from '../types';

interface OrderReceiptModalProps {
  order: AdminOrderDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onPrinted?: () => void;
}

const paymentLabel = (order: AdminOrderDetail): string => {
  const successful = order.payments.filter((payment) => payment.status === 'SUCCEEDED');
  if (successful.length) return successful.map((payment) => payment.method || payment.provider).join(' + ');
  const pending = order.payments.find((payment) => payment.status === 'PENDING');
  return pending ? `${pending.method || pending.provider} · pendiente` : 'No disponible';
};

/** Resumen operativo: nunca usa serie fiscal ni se presenta como CPE. */
export const OrderReceiptModal = ({ order, isOpen, onClose, onPrinted }: OrderReceiptModalProps) => {
  const business = useBusinessInfo();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  const trackingUrl = useMemo(
    () => order ? `${window.location.origin}/cuenta/pedidos/${encodeURIComponent(order.orderNumber)}` : '',
    [order],
  );

  useEffect(() => {
    if (!trackingUrl) return;
    let active = true;
    void QRCode.toDataURL(trackingUrl, { width: 180, margin: 1, color: { dark: '#123d2a', light: '#ffffff' } })
      .then((value) => { if (active) setQrDataUrl(value); })
      .catch(() => { if (active) setQrDataUrl(''); });
    return () => { active = false; };
  }, [trackingUrl]);

  useEffect(() => () => document.body.classList.remove('admin-receipt-printing'), []);
  if (!order) return null;

  const address = order.addressSnapshotJson;
  const print = async () => {
    setIsPrinting(true);
    try {
      await adminApi.recordInternalReceiptPrint(order.orderNumber);
      onPrinted?.();
      document.body.classList.add('admin-receipt-printing');
      const cleanup = () => document.body.classList.remove('admin-receipt-printing');
      window.addEventListener('afterprint', cleanup, { once: true });
      window.print();
      window.setTimeout(cleanup, 1_500);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ticket interno del pedido"
      description="Resumen para entregar o archivar. No reemplaza una boleta ni una factura."
      icon={ReceiptText}
      eyebrow="Documento operativo"
      maxWidth="md"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button variant="outline" leftIcon={<Download className="size-4" />} isLoading={isPrinting} onClick={() => void print()}>Guardar como PDF</Button>
          <Button leftIcon={<Printer className="size-4" />} isLoading={isPrinting} onClick={() => void print()}>{order.internalReceiptPrintCount > 0 ? 'Reimprimir ticket' : 'Imprimir ticket'}</Button>
        </>
      }
    >
      <article data-admin-receipt data-paper-width={order.receiptSettings.paperWidth} className="mx-auto max-w-2xl bg-white text-ink">
        <header className="border-b-2 border-brand-700 pb-4 text-center">
          <p className="text-xl font-black text-brand-800">{business.commercialName}</p>
          <p className="mt-1 text-xs text-ink-muted">{order.branch?.name ?? business.legalName}</p>
          <div className="mx-auto mt-3 max-w-sm rounded-card border-2 border-brand-700 p-3">
            <p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">Ticket interno</p>
            <p className="mt-1 text-xl font-black">Pedido {order.orderNumber}</p>
            <p className="mt-1 text-[11px] font-bold uppercase text-red-700">No es un comprobante de pago</p>
          </div>
        </header>

        <div className="mt-4 flex items-start gap-2 rounded-card border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>Este documento resume la operacion y sirve para identificar la entrega. No tiene serie fiscal ni correlativo SUNAT.</p>
        </div>

        <section className="mt-4 grid gap-2 rounded-card bg-surface-muted p-3 text-sm sm:grid-cols-2">
          <div><b>Fecha:</b> {formatDate(order.placedAt)}</div>
          <div><b>Canal:</b> {order.deliveryType === 'DELIVERY' ? 'Delivery' : order.deliveryType === 'DINE_IN' ? 'Salon' : 'Recojo'}</div>
          <div><b>Cliente:</b> {order.contactName || 'Sin nombre'}</div>
          <div><b>Telefono:</b> {order.contactPhone || 'Sin telefono'}</div>
          <div><b>Pago:</b> {paymentLabel(order)}</div>
          <div><b>Estado:</b> {order.status.replaceAll('_', ' ')}</div>
          {address?.line1 && <div className="sm:col-span-2"><b>Direccion:</b> {address.line1}{address.reference ? ` · ${address.reference}` : ''}</div>}
          {order.notes && <div className="sm:col-span-2"><b>Indicaciones:</b> {order.notes}</div>}
        </section>

        <section className="mt-4 overflow-hidden rounded-card border border-line">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-brand-700 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white">
            <span>Producto</span><span>Cant.</span><span>Importe</span>
          </div>
          <ul className="divide-y divide-line">
            {order.detailItems.map((item) => (
              <li key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{item.productNameSnapshot}</p>
                  {item.variantNameSnapshot && <p className="text-xs text-ink-muted">{item.variantNameSnapshot}</p>}
                  {item.customizations.map((customization, index) => <p key={`${customization.option}-${index}`} className="text-xs text-ink-muted">{customization.group}: {customization.option}{customization.quantity > 1 ? ` x${customization.quantity}` : ''}</p>)}
                  {item.specialInstructions && <p className="mt-1 text-xs font-semibold">Nota: {item.specialInstructions}</p>}
                </div>
                <span>{item.quantity}</span>
                <span className="min-w-20 text-right font-semibold">{formatCurrency(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ml-auto mt-4 max-w-sm text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
          {order.deliveryFee > 0 && <div className="mt-1 flex justify-between"><span>Delivery</span><span>{formatCurrency(order.deliveryFee)}</span></div>}
          {order.discountTotal > 0 && <div className="mt-1 flex justify-between text-brand-700"><span>Descuentos</span><span>- {formatCurrency(order.discountTotal)}</span></div>}
          {order.walletAmount > 0 && <div className="mt-1 flex justify-between"><span>Saldo utilizado</span><span>{formatCurrency(order.walletAmount)}</span></div>}
          <div className="mt-2 flex justify-between border-t-2 border-brand-700 pt-2 text-lg font-black"><span>Total</span><span>{formatCurrency(order.grandTotal + order.walletAmount)}</span></div>
        </section>

        <footer className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4">
          <div className="text-xs leading-relaxed text-ink-muted">
            <p className="font-bold text-ink">Gracias por tu pedido.</p>
            <p>{business.supportEmail} · {business.phone}</p>
            {order.internalReceiptPrintCount > 0 && <p>Reimpresiones previas: {order.internalReceiptPrintCount}</p>}
          </div>
          {qrDataUrl && <img className="size-20" src={qrDataUrl} alt="QR para consultar el pedido" />}
        </footer>
      </article>
    </Modal>
  );
};
