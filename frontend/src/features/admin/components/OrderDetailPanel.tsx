import { OrderCustomerJourney } from '@features/orders/components/OrderCustomerJourney';
import { useLiveRefresh } from '@services/realtime';
import { OrderTermsEvidence } from '@features/orders/components/OrderTermsEvidence';
import { OrderCustomerContact } from './OrderCustomerContact';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { CalendarClock, ChefHat, ClipboardList, CreditCard, FileCheck2, ReceiptText, Store, Undo2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from '@components/mui/MuiToast';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Modal } from '@components/ui/Modal';
import { Input } from '@components/ui/Input';
import { Spinner } from '@components/ui/Spinner';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { LoadError } from '@components/common/LoadError';
import { ORDER_STATUS, OrderStatusBadge } from '@features/orders/components/OrderStatusBadge';
import { CakeThemeReference } from '@features/cakes/components/CakeThemeBanner';
import { OrderCakeReference } from '@features/cakes/components/OrderCakeReference';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { ROUTES } from '@constants/routes';
import { adminApi } from '../services/admin.service';
import { KITCHEN_STATUS, KitchenStatusBadge } from './StatusBadges';
import { DeliveryDestination } from './DeliveryDestination';
import { DeliveryEvidence } from './DeliveryEvidence';
import { OrderReceiptModal } from './OrderReceiptModal';
import type { AdminOrderDetail, AdminOrderPayment } from '../types';

interface OrderDetailPanelProps {
  /** Número del pedido a mostrar. `null` cierra el modal. */
  orderNumber: string | null;
  onClose: () => void;
  /** Se llama cuando la ficha cambia algo del pedido (un reembolso). */
  onChanged?: () => void;
}

type DetailSection = 'summary' | 'payments' | 'documents' | 'history';
const DETAIL_SECTIONS: Array<{ id: DetailSection; label: string }> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'payments', label: 'Pago y devoluciones' },
  { id: 'documents', label: 'Ticket y comprobante' },
  { id: 'history', label: 'Historial' },
];

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Iniciado',
  PENDING: 'Pendiente',
  SUCCEEDED: 'Cobrado',
  FAILED: 'Rechazado',
  REFUNDED: 'Devuelto',
};

const REFUND_STATUS_LABEL: Record<string, string> = {
  PENDING: 'En curso',
  SUCCEEDED: 'Devuelto',
  FAILED: 'Fallido',
};
const PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  cash: 'Efectivo', yape: 'Yape', plin: 'Plin', stripe: 'Tarjeta', mercadopago: 'Mercado Pago', wallet: 'Saldo del cliente',
};
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  credit_card: 'Tarjeta de crédito', debit_card: 'Tarjeta de débito', cash: 'Efectivo', wallet: 'Saldo',
};
const manualRefund = (provider: string) => ['cash', 'yape', 'plin'].includes(provider.toLowerCase());
const statusLabel = (value: string) => ORDER_STATUS[value]?.label ?? value.replaceAll('_', ' ');
const sourceLabel: Record<string, string> = { STAFF: 'Personal', SYSTEM: 'Sistema', PAYMENT: 'Pago', WEBHOOK: 'Pago', CUSTOMER: 'Cliente', KITCHEN: 'Cocina', DELIVERY: 'Reparto' };
const webUrlError = (value: string): string | undefined => {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? undefined : 'Usa un enlace web que empiece por https:// o http://.';
  } catch {
    return 'Escribe una URL completa, por ejemplo https://proveedor.com/archivo.pdf.';
  }
};
const orderGuidance = (order: AdminOrderDetail): { title: string; description: string } => {
  if (order.status === 'PENDING_PAYMENT') return { title: 'Primero verifica el pago', description: 'Revisa el cobro en Pago y devoluciones. Si es efectivo, confírmalo solo después de recibirlo. El pedido no debe pasar a preparación mientras siga esperando pago.' };
  if (order.status === 'CONFIRMED' && order.kitchenTicket && order.kitchenTicket.status !== 'CANCELLED') return { title: 'Cocina ya recibió la comanda', description: 'Revisa el estado operativo y las indicaciones en Cocina antes de intervenir en la preparación o la entrega.' };
  if (order.status === 'CONFIRMED' && order.cakeTasks?.length) {
    const pending = order.cakeTasks.filter((task) => task.status !== 'DONE');
    return pending.length
      ? { title: 'Torta en el plan de producción', description: `${order.cakeTasks.length - pending.length} de ${order.cakeTasks.length} etapas terminadas. La siguiente está prevista para ${pending[0].workDate}. Asigna y revisa las etapas desde Producción; la comanda de cierre aparecerá antes de la entrega.` }
      : { title: 'Producción terminada', description: 'Las etapas de la torta están completas. Revisa la comanda de cierre y la entrega.' };
  }
  if (order.status === 'CONFIRMED' && order.serviceMode === 'SCHEDULED' && order.scheduledAt) {
    const releaseAt = order.kitchenReleaseAt ? new Date(order.kitchenReleaseAt).getTime() : new Date(order.scheduledAt).getTime() - (order.branch?.prepMinutes ?? 20) * 60_000;
    return releaseAt <= Date.now()
      ? { title: 'Revisar ingreso a Cocina', description: `Está confirmado para ${formatDate(order.scheduledAt)}, pero ya pasó la hora prevista para entrar a Cocina. Comprueba el tablero de Programados y la cola activa.` }
      : { title: 'Pedido programado', description: `Está confirmado para ${formatDate(order.scheduledAt)}. Cocina lo activará cuando llegue su margen de preparación; revisa contacto e indicaciones antes de ese momento.` };
  }
  if (order.status === 'CONFIRMED') return { title: 'Esperando a Cocina', description: 'El pago está confirmado. Cocina debe aceptar la comanda y comenzar la preparación.' };
  if (order.status === 'PREPARING') return { title: 'En preparación', description: 'Cocina está trabajando en el pedido. Consulta la comanda y sus indicaciones; Cocina lo marcará como listo.' };
  if (order.status === 'READY') return { title: 'Listo para entregar', description: order.deliveryType === 'DELIVERY' ? 'Reparto debe recogerlo y completar la entrega.' : order.deliveryType === 'DINE_IN' ? 'Salón debe servirlo y completar la atención de la mesa.' : 'Entrega el pedido al cliente en el mostrador y confirma la entrega desde el flujo operativo.' };
  if (order.status === 'OUT_FOR_DELIVERY') return { title: 'En camino al cliente', description: 'Consulta a Reparto para seguir el envío. Cuando el cliente reciba el pedido, confirma la entrega en el flujo correspondiente.' };
  if (order.status === 'DELIVERED') return { title: 'Entrega completada', description: 'Comprueba el cobro y el documento entregado. Puedes consultar o imprimir el ticket interno y revisar el comprobante fiscal si corresponde.' };
  if (order.status === 'CANCELLED') return { title: 'Pedido cancelado', description: 'La preparación y la entrega se cerraron. Comprueba en Pago si había un cobro que aún requiera devolución.' };
  return { title: 'Pedido cerrado', description: 'Consulta aquí el historial, el pago y la devolución registrada.' };
};

const kitchenGuidance = (order: AdminOrderDetail, releaseAt: Date | null): { title: string; description: string } => {
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
    if (order.kitchenTicket && !['CANCELLED', 'DISPATCHED'].includes(order.kitchenTicket.status)) return { title: 'Revisar comanda de un pedido cerrado', description: 'El pedido está cerrado, pero su comanda aún figura activa. Comprueba en Cocina que no continúe preparándose.' };
    return { title: 'Sin preparación pendiente', description: 'El pedido está cerrado; no debe seguir preparándose en Cocina.' };
  }
  if (order.kitchenTicket) {
    const status = order.kitchenTicket.status;
    const title = `Comanda ${KITCHEN_STATUS[status]?.label.toLowerCase() ?? status.toLowerCase()}`;
    if (status === 'CANCELLED') return { title, description: 'La comanda está cancelada y no debe prepararse.' };
    if (status === 'DISPATCHED') return { title, description: 'La comanda ya salió de Cocina. Continúa el seguimiento en entrega o Reparto.' };
    if (status === 'READY') return { title, description: 'La preparación terminó. Revisa el paso de entrega correspondiente.' };
    return { title, description: 'Consulta el avance y las indicaciones de esta comanda en el tablero de Cocina.' };
  }
  if (order.status === 'PENDING_PAYMENT') return { title: 'Cocina espera el pago', description: 'Todavía no debe prepararse. Revisa el cobro en la sección Pago y devoluciones.' };
  if (['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status)) return { title: 'Sin comanda activa', description: 'El pedido ya está cerrado; no hay preparación pendiente para Cocina.' };
  if (order.status === 'CONFIRMED' && order.serviceMode === 'SCHEDULED' && order.scheduledAt) {
    if (releaseAt && releaseAt.getTime() <= Date.now()) return { title: 'Revisar la cola de Cocina', description: `La hora prevista de ingreso fue ${formatDate(releaseAt)} y aún no se ve una comanda activa. Comprueba Programados y la cola de Cocina.` };
    if (order.cakeTasks?.length) return { title: 'Producción visible desde ahora', description: `La torta ya está en Producción por etapas. La comanda de cierre entrará a la cola ${releaseAt ? formatDate(releaseAt) : 'antes de la entrega'}.` };
    return { title: 'Programado para Cocina', description: `Aparece en Programados. Se prevé su ingreso a la cola ${releaseAt ? formatDate(releaseAt) : 'al comenzar el margen de preparación'} para entregarse ${formatDate(order.scheduledAt)}.` };
  }
  if (order.status === 'CONFIRMED') return { title: 'Pendiente de comanda', description: 'El pedido está confirmado; revisa que aparezca en la cola activa de Cocina.' };
  return { title: 'Sin comanda activa', description: 'Consulta el estado del pedido antes de iniciar una preparación.' };
};

/** Lo que queda por devolver de un cobro: lo cobrado menos lo ya comprometido. */
const remainingToRefund = (payment: AdminOrderPayment): number => {
  const committed = payment.refunds
    .filter((refund) => refund.status !== 'FAILED')
    .reduce((total, refund) => total + Number(refund.amount), 0);
  return Math.round((Number(payment.amount) - committed) * 100) / 100;
};

/**
 * FICHA DEL PEDIDO
 * ---------------------------------------------------------------------------
 * Soporte atendia al cliente POR TELEFONO sin ver ni una personalizacion, ni el
 * historial de estados, ni el pago: solo la fila del tablero. El telefono, la
 * direccion y las notas ya viajaban en la respuesta de `/admin/orders` sin que
 * nadie los pintara; el resto lo trae `GET /admin/orders/:n`.
 *
 * Tambien es el unico sitio del producto donde `payment.refund` tiene interfaz:
 * el endpoint existia y no lo llamaba nadie.
 */
export const OrderDetailPanel = ({ orderNumber, onClose, onChanged }: OrderDetailPanelProps) => {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [section, setSection] = useState<DetailSection>('summary');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refundingId, setRefundingId] = useState<number | null>(null);
  const [capturingId, setCapturingId] = useState<number | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [showExternalFiscal, setShowExternalFiscal] = useState(false);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [invoiceForm, setInvoiceForm] = useState({ series: '', number: '', providerReference: '', pdfUrl: '', xmlUrl: '' });
  const [invoiceAttempted, setInvoiceAttempted] = useState(false);
  const [isRegisteringInvoice, setIsRegisteringInvoice] = useState(false);
  // Token de secuencia: abrir un pedido y cambiar a otro deja la primera peticion
  // en vuelo, y ganaba la ultima en RESOLVER, no la ultima pedida.
  const requestId = useRef(0);

  const load = useCallback(async (background = false) => {
    if (!orderNumber) return;
    const id = ++requestId.current;
    if (!background) setIsLoading(true);
    try {
      const data = await adminApi.orderDetail(orderNumber);
      if (id !== requestId.current) return;
      setDetail(data);
      setError(null);
    } catch (fetchError) {
      if (id !== requestId.current) return;
      if (!background) setDetail(null);
      setError(getApiErrorMessage(fetchError));
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    // Al cambiar de pedido se limpia lo anterior: sin esto el panel muestra la
    // ficha del pedido previo mientras carga la nueva, con sus botones activos.
    setDetail(null);
    setError(null);
    setAmounts({});
    setInvoiceForm({ series: '', number: '', providerReference: '', pdfUrl: '', xmlUrl: '' });
    setInvoiceAttempted(false);
    setShowExternalFiscal(false);
    setSection('summary');
    if (!orderNumber) {
      requestId.current += 1;
      setIsLoading(false);
      setReceiptOpen(false);
      return;
    }
    void load();
  }, [load, orderNumber]);

  useLiveRefresh(['orders', 'payments', 'delivery', 'production', 'finance'], () => load(true), { enabled: Boolean(orderNumber) });

  const refundErrorFor = (payment: AdminOrderPayment): string | undefined => {
    const raw = amounts[payment.id] ?? remainingToRefund(payment).toFixed(2);
    const normalized = raw.trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
      return 'Escribe un importe mayor que 0 con hasta 2 decimales.';
    }
    if (Number(normalized) > remainingToRefund(payment)) {
      return `Máximo disponible: ${formatCurrency(remainingToRefund(payment))}.`;
    }
    return undefined;
  };

  const handleRefund = async (payment: AdminOrderPayment) => {
    const remaining = remainingToRefund(payment);
    const raw = amounts[payment.id] ?? remaining.toFixed(2);
    const validationError = refundErrorFor(payment);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const amount = Number(raw.replace(',', '.'));

    const { confirmed, reason } = await confirm({
      title: `Devolver ${formatCurrency(amount)}`,
      message: manualRefund(payment.provider)
        ? 'Esta acción registrará la devolución como realizada. Entrega o transfiere el dinero al cliente antes de confirmar; el sistema no mueve dinero por este medio.'
        : 'Se solicitará la devolución al proveedor de pago. Comprueba el resultado en el historial; esta acción no se puede deshacer desde el panel.',
      confirmLabel: manualRefund(payment.provider) ? 'Ya devolví el dinero' : 'Solicitar devolución',
      tone: 'danger',
      reasonLabel: 'Motivo de la devolución',
      reasonRequired: true,
      reasonMinLength: 3, reasonMaxLength: 255,
      reasonHint: 'De 3 a 255 caracteres. El motivo se guardará con el reembolso.',
    });
    if (!confirmed) return;

    setRefundingId(payment.id);
    try {
      await adminApi.refundPayment(payment.id, { amount, reason });
      toast.success(manualRefund(payment.provider) ? 'Devolución manual registrada' : 'Devolución procesada');
      await load();
      onChanged?.();
    } catch (refundError) {
      toast.error(getApiErrorMessage(refundError));
    } finally {
      setRefundingId(null);
    }
  };

  const handleCaptureCash = async (payment: AdminOrderPayment) => {
    const { confirmed, reason } = await confirm({
      title: `Confirmar cobro de ${formatCurrency(payment.amount)}`,
      message: 'Este botón marcará el efectivo como cobrado y puede confirmar el pedido. Úsalo solo después de tener el dinero del cliente.',
      confirmLabel: 'Confirmar efectivo', reasonLabel: 'Referencia del recibo', reasonRequired: true,
      reasonMinLength: 3, reasonMaxLength: 120,
      reasonHint: 'De 3 a 120 caracteres. Escribe el número o referencia que quedará asociado al cobro.',
    });
    if (!confirmed) return;
    setCapturingId(payment.id);
    try { await adminApi.captureCash(payment.id, reason); toast.success('Efectivo registrado'); await load(); onChanged?.(); }
    catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setCapturingId(null); }
  };

  const expectedSeriesPrefix = detail?.documentType === 'FACTURA' ? 'F' : 'B';
  const invoiceSeriesError = !new RegExp(`^${expectedSeriesPrefix}[A-Z0-9]{3}$`).test(invoiceForm.series.trim())
    ? `Usa una serie de 4 caracteres que empiece por ${expectedSeriesPrefix}, por ejemplo ${expectedSeriesPrefix}001.` : undefined;
  const invoiceNumberError = !/^\d{1,8}$/.test(invoiceForm.number.trim())
    ? 'Escribe de 1 a 8 dígitos del correlativo emitido.' : undefined;
  const invoiceReferenceError = invoiceForm.providerReference.trim().length > 100
    ? 'La referencia admite hasta 100 caracteres.' : undefined;
  const invoicePdfError = invoiceForm.pdfUrl.trim().length > 500 ? 'El enlace admite hasta 500 caracteres.' : webUrlError(invoiceForm.pdfUrl);
  const invoiceXmlError = invoiceForm.xmlUrl.trim().length > 500 ? 'El enlace admite hasta 500 caracteres.' : webUrlError(invoiceForm.xmlUrl);

  const handleRegisterInvoice = async () => {
    if (!detail) return;
    setInvoiceAttempted(true);
    if (invoiceSeriesError || invoiceNumberError || invoiceReferenceError || invoicePdfError || invoiceXmlError) {
      toast.error('Revisa los datos señalados del comprobante emitido');
      return;
    }
    const answer = await confirm({
      title: 'Registrar comprobante emitido',
      message: `Se guardará ${invoiceForm.series.toUpperCase()}-${invoiceForm.number}. Hazlo solo después de que tu OSE o integrador confirme la emisión.`,
      confirmLabel: 'Registrar emisión',
      tone: 'default',
    });
    if (!answer.confirmed) return;

    setIsRegisteringInvoice(true);
    try {
      await adminApi.registerInvoice(detail.orderNumber, {
        series: invoiceForm.series,
        number: invoiceForm.number,
        providerReference: invoiceForm.providerReference || undefined,
        pdfUrl: invoiceForm.pdfUrl || undefined,
        xmlUrl: invoiceForm.xmlUrl || undefined,
      });
      toast.success('Comprobante emitido registrado');
      setInvoiceForm({ series: '', number: '', providerReference: '', pdfUrl: '', xmlUrl: '' });
      setInvoiceAttempted(false);
      await load();
      onChanged?.();
    } catch (invoiceError) {
      toast.error(getApiErrorMessage(invoiceError));
    } finally {
      setIsRegisteringInvoice(false);
    }
  };

  const address = detail?.addressSnapshotJson ?? null;
  const scheduledReleaseAt = detail?.scheduledAt
    ? detail.kitchenReleaseAt ? new Date(detail.kitchenReleaseAt) : new Date(new Date(detail.scheduledAt).getTime() - (detail.branch?.prepMinutes ?? 20) * 60_000)
    : null;
  const guidance = detail ? orderGuidance(detail) : null;
  const kitchen = detail ? kitchenGuidance(detail, scheduledReleaseAt) : null;
  const operationalLink = detail && (
    (detail.status === 'PENDING_PAYMENT' && can(PERM.PAYMENT_VERIFY))
      ? { to: ROUTES.adminCash, label: 'Revisar pago en Caja' }
      : (detail.status === 'CONFIRMED' && !detail.kitchenTicket && Boolean(detail.cakeTasks?.length) && can(PERM.KITCHEN_READ))
      ? { to: `${ROUTES.adminCakes}?seccion=production&pedido=${encodeURIComponent(detail.orderNumber)}&branchId=${detail.branch?.id ?? ''}`, label: 'Abrir Producción de tortas' }
      : (['CONFIRMED', 'PREPARING'].includes(detail.status) && (can(PERM.KITCHEN_READ) || can(PERM.KITCHEN_OPERATE)))
      ? { to: `${ROUTES.adminKitchen}?pedido=${encodeURIComponent(detail.orderNumber)}&branchId=${detail.branch?.id ?? ''}`, label: 'Abrir en Cocina' }
      : (detail.status === 'READY' || detail.status === 'OUT_FOR_DELIVERY') && detail.deliveryType === 'DELIVERY' && (can(PERM.DELIVERY_READ) || can(PERM.DELIVERY_ASSIGN) || can(PERM.DELIVERY_OPERATE))
        ? { to: ROUTES.adminDelivery, label: 'Abrir Reparto' }
        : detail.status === 'READY' && detail.deliveryType === 'DINE_IN' && (can(PERM.DINING_READ) || can(PERM.DINING_OPERATE))
          ? { to: ROUTES.adminDining, label: 'Abrir Salón' }
          : null
  );
  const closePanel = async (): Promise<boolean> => {
    if (isRegisteringInvoice || refundingId !== null || capturingId !== null) return false;
    if (Object.values(invoiceForm).some((value) => value.trim())) {
      const { confirmed } = await confirm({
        title: '¿Descartar datos del comprobante?',
        message: 'Hay datos escritos que todavía no se registraron. Si cierras, tendrás que escribirlos otra vez.',
        confirmLabel: 'Descartar datos', cancelLabel: 'Seguir editando', tone: 'danger',
      });
      if (!confirmed) return false;
    }
    onClose();
    return true;
  };

  const openOperationalArea = async (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (await closePanel()) navigate(path);
  };

  return (
    <>
    <Modal
      isOpen={orderNumber !== null}
      onClose={() => void closePanel()}
      title={orderNumber ? `Pedido ${orderNumber}` : 'Detalle del pedido'}
      description={detail ? `Recibido el ${formatDate(detail.placedAt)}` : undefined}
      eyebrow="OPERACIÓN · DETALLE"
      icon={ClipboardList}
      maxWidth="lg"
      actions={<Button variant="outline" onClick={() => void closePanel()}>Cerrar detalle</Button>}
    >
      {isLoading && !detail && (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}

      {!isLoading && error && <LoadError message={error} onRetry={() => void load()} />}

      {detail && (
        <div className="grid gap-5">
          <section className="flex flex-wrap items-center gap-2 rounded-card bg-surface-muted px-4 py-3" aria-label="Estado y entrega del pedido">
            <OrderStatusBadge status={detail.status} />
            {detail.kitchenTicket && <KitchenStatusBadge status={detail.kitchenTicket.status} />}
            <Badge variant="outline">
              {detail.deliveryType === 'DELIVERY' ? (detail.deliveryVehicleType === 'CAR' ? 'Entrega en auto' : 'Delivery') : detail.deliveryType === 'DINE_IN' ? 'Consumo en salón' : 'Recojo en taller'}
            </Badge>
            {detail.serviceMode === 'SCHEDULED' && detail.scheduledAt && (
              <Badge variant="accent">Programado {formatDate(detail.scheduledAt)}</Badge>
            )}
          </section>

          <nav aria-label="Secciones del pedido" className="grid grid-cols-2 gap-2 border-b border-line pb-2 sm:flex sm:flex-wrap">
            {DETAIL_SECTIONS.map((item) => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)} className={`min-h-11 rounded-lg px-3 py-2 text-center text-sm font-bold leading-tight transition-colors ${section === item.id ? 'bg-brand-700 text-white' : 'bg-surface-muted text-ink-muted hover:bg-brand-50 hover:text-brand-800'}`}>{item.label}{item.id === 'documents' && Object.values(invoiceForm).some((value) => value.trim()) ? ' · sin guardar' : ''}</button>)}
          </nav>

          {section === 'summary' && <div className="grid gap-4 lg:grid-cols-2">
          {guidance && <section className="rounded-card border border-brand-200 bg-brand-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-brand-700">Qué significa el estado actual</p>
            <h3 className="mt-1 text-base font-black text-ink">{guidance.title}</h3>
            <p className="mt-1 text-sm leading-6 text-ink-muted">{guidance.description}</p>
            {operationalLink && <Link to={operationalLink.to} onClick={(event) => void openOperationalArea(event, operationalLink.to)} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-brand-300 bg-white px-3 text-sm font-bold text-brand-700 hover:bg-brand-100">{operationalLink.label} →</Link>}
          </section>}

          <section className="flex items-start gap-3 rounded-card border border-accent-200 bg-accent-50 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-100 text-accent-700">
              {detail.kitchenTicket ? <ChefHat className="size-5" /> : <CalendarClock className="size-5" />}
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-accent-700">Estado operativo de Cocina</p>
              <p className="mt-1 font-extrabold text-ink">{kitchen?.title}</p>
              <p className="mt-1 text-sm leading-5 text-ink-muted">{kitchen?.description}</p>
            </div>
          </section>
          {Boolean(detail.cakeTasks?.length) && <section className="rounded-card border border-line bg-white p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-ink">Plan de producción de la torta</h3><span className="text-xs font-bold text-brand-700">{detail.cakeTasks?.filter((task) => task.status === 'DONE').length} de {detail.cakeTasks?.length} etapas terminadas</span></div>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{detail.cakeTasks?.map((task) => <li key={task.id} className={`rounded-lg border p-3 text-sm ${task.status === 'BLOCKED' ? 'border-red-300 bg-red-50' : task.status === 'DONE' ? 'border-green-200 bg-green-50' : 'border-line bg-surface-muted'}`}><p className="font-bold text-ink">{({ DESIGN: 'Diseño', BAKING: 'Horneado', COOLING: 'Enfriado', FILLING: 'Relleno', DECORATING: 'Decoración', QA: 'Calidad', DISPATCH: 'Despacho' } as Record<string, string>)[task.station] ?? task.station}</p><p className="mt-1 text-xs text-ink-muted">{task.workDate} · {task.status === 'DONE' ? 'Terminada' : task.status === 'IN_PROGRESS' ? 'En proceso' : task.status === 'BLOCKED' ? 'Bloqueada' : task.assigned ? 'Asignada' : 'Sin responsable'}</p></li>)}</ol>
          </section>}
          </div>}

          {section === 'documents' && <>
          {detail.receiptMode !== 'INTERNAL_ONLY' && <section className="rounded-card border border-line bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Ticket interno</p>
            <p className="mt-1 text-sm text-ink-muted">Resumen para identificar la entrega. No sustituye la boleta o factura.</p>
            <Button className="mt-3" size="sm" variant="outline" leftIcon={<ReceiptText className="size-4" />} onClick={() => setReceiptOpen(true)}>Ver e imprimir ticket</Button>
          </section>}
          {detail.receiptMode === 'INTERNAL_ONLY' && (
            <section className="rounded-card border border-brand-200 bg-brand-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Ticket interno disponible</p>
                  <p className="mt-1 font-extrabold text-ink">Pedido {detail.orderNumber}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">Resumen operativo para la entrega. No es un comprobante de pago y no usa serie ni correlativo SUNAT.</p>
                </div>
                <Badge variant="brand">No fiscal</Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand-200 pt-3">
                <Button size="sm" leftIcon={<ReceiptText className="size-4" />} onClick={() => setReceiptOpen(true)}>{detail.internalReceiptPrintCount > 0 ? 'Reimprimir ticket' : 'Ver e imprimir ticket'}</Button>
                {can(PERM.INVOICE_MANAGE) && <Button size="sm" variant="ghost" onClick={() => setShowExternalFiscal((value) => !value)}>{showExternalFiscal ? 'Ocultar contingencia fiscal' : 'Registrar CPE externo'}</Button>}
                <span className="text-xs text-ink-muted">{detail.internalReceiptPrintCount ? `${detail.internalReceiptPrintCount} apertura${detail.internalReceiptPrintCount === 1 ? '' : 's'} de impresión registrada${detail.internalReceiptPrintCount === 1 ? '' : 's'}` : 'Aún no se abrió la impresión'}</span>
              </div>
            </section>
          )}

          {(detail.receiptMode !== 'INTERNAL_ONLY' || showExternalFiscal) && <section className="rounded-card border border-line bg-gradient-to-r from-surface-muted to-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Contingencia fiscal externa</p>
                <p className="mt-1 font-bold text-ink">{detail.documentType === 'FACTURA' ? 'Factura electrónica' : 'Boleta de venta electrónica'}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{detail.billingName || detail.contactName || 'Consumidor final'}{detail.billingDocNumber ? ` · ${detail.billingDocType} ${detail.billingDocNumber}` : ''}</p>
              </div>
              <Badge variant={detail.invoiceStatus === 'ISSUED' ? 'success' : detail.invoiceStatus === 'FAILED' ? 'danger' : 'accent'}>
                {detail.invoiceStatus === 'ISSUED' ? 'Emitido' : detail.invoiceStatus === 'FAILED' ? 'Falló la emisión' : detail.invoiceStatus === 'VOIDED' ? 'Anulado' : 'Pendiente de emisión'}
              </Badge>
            </div>
            {detail.invoiceStatus === 'ISSUED' ? (
              <div className="mt-3 border-t border-line pt-3 text-sm">
                <p className="font-extrabold text-ink">{detail.invoiceSeries}-{detail.invoiceNumber}</p>
                <p className="mt-1 text-xs text-ink-muted">Emitido {detail.invoiceIssuedAt ? formatDate(detail.invoiceIssuedAt) : ''}{detail.invoiceProviderReference ? ` · Ref. ${detail.invoiceProviderReference}` : ''}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {detail.invoicePdfUrl && <a className="text-xs font-bold text-brand-700 underline" href={detail.invoicePdfUrl} target="_blank" rel="noreferrer">Abrir PDF</a>}
                  {detail.invoiceXmlUrl && <a className="text-xs font-bold text-brand-700 underline" href={detail.invoiceXmlUrl} target="_blank" rel="noreferrer">Abrir XML</a>}
                </div>
              </div>
            ) : (
              <>
                <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">Este panel no emite ni envía el comprobante fiscal. Primero emítelo con tu OSE o integrador SUNAT; luego registra aquí la serie, el correlativo y, si los tienes, los enlaces a los archivos emitidos.</p>
                {can(PERM.INVOICE_MANAGE) && !['PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'].includes(detail.status) && (
                  <div className="mt-4 grid gap-3 rounded-card border border-brand-200 bg-brand-50/60 p-3 sm:grid-cols-2">
                    <p className="text-xs leading-5 text-brand-900 sm:col-span-2">Copia exactamente los datos del comprobante ya emitido. Registrarlo aquí marcará el pedido como «Emitido», pero no genera un documento nuevo.</p>
                    <Input label="Serie" required maxLength={4} placeholder={detail.documentType === 'FACTURA' ? 'F001' : 'B001'} value={invoiceForm.series}
                      error={invoiceAttempted || invoiceForm.series ? invoiceSeriesError : undefined}
                      hint={`4 caracteres; debe comenzar por ${expectedSeriesPrefix}.`}
                      onChange={(event) => setInvoiceForm((current) => ({ ...current, series: event.target.value.toUpperCase() }))} />
                    <Input label="Correlativo" required maxLength={8} placeholder="00001234" inputMode="numeric" value={invoiceForm.number}
                      error={invoiceAttempted || invoiceForm.number ? invoiceNumberError : undefined}
                      hint="Número de 1 a 8 dígitos del comprobante emitido."
                      onChange={(event) => setInvoiceForm((current) => ({ ...current, number: event.target.value.replace(/\D/g, '').slice(0, 8) }))} />
                    <Input label="Referencia OSE (opcional)" maxLength={100} value={invoiceForm.providerReference}
                      error={invoiceAttempted ? invoiceReferenceError : undefined}
                      hint="Identificador que entregó tu proveedor de emisión."
                      onChange={(event) => setInvoiceForm((current) => ({ ...current, providerReference: event.target.value }))} />
                    <Input label="URL del PDF (opcional)" type="url" maxLength={500} value={invoiceForm.pdfUrl}
                      error={invoiceAttempted || invoiceForm.pdfUrl ? invoicePdfError : undefined}
                      hint="Enlace completo al PDF que ya emitiste."
                      onChange={(event) => setInvoiceForm((current) => ({ ...current, pdfUrl: event.target.value }))} />
                    <Input className="sm:col-span-2" label="URL del XML (opcional)" type="url" maxLength={500} value={invoiceForm.xmlUrl}
                      error={invoiceAttempted || invoiceForm.xmlUrl ? invoiceXmlError : undefined}
                      hint="Enlace completo al XML del mismo comprobante."
                      onChange={(event) => setInvoiceForm((current) => ({ ...current, xmlUrl: event.target.value }))} />
                    <Button className="sm:col-span-2" size="sm" leftIcon={<FileCheck2 className="size-4" />} isLoading={isRegisteringInvoice} onClick={() => void handleRegisterInvoice()}>Registrar constancia emitida</Button>
                  </div>
                )}
              </>
            )}
          </section>}
          </>}

          {section === 'summary' && <>
          <OrderTermsEvidence acceptance={detail.termsAcceptanceJson} />
          {detail.cancelReason && (
            <p className="rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Motivo de la cancelación: {detail.cancelReason}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* --- Contacto: lo primero que necesita quien atiende la llamada --- */}
          <section className="order-1 rounded-card border border-line bg-white p-4">
            <SectionTitle>Contacto y entrega</SectionTitle>
            <div className="grid gap-2.5 text-sm">
              <p className="flex items-center gap-2 rounded-field border border-line bg-surface-muted px-3 py-2 text-ink">
                <Store className="size-4 shrink-0 text-brand-700" />
                <span>
                  <span className="text-xs text-ink-muted">Sale de</span>{' '}
                  <strong>{detail.branch?.name ?? 'Sucursal no disponible'}</strong>
                </span>
              </p>
              <p className="font-medium text-ink">{detail.contactName ?? 'Sin nombre'}</p>
              <OrderCustomerJourney order={detail} staff onChanged={() => void load(true)} />
              <OrderCustomerContact key={detail.orderNumber} order={detail} onRecorded={async () => { await load(true); onChanged?.(); }} />
              {detail.deliveryType === 'DELIVERY' ? (
                <div className="space-y-4"><DeliveryDestination address={address} notes={detail.notes} />
                  {detail.deliveryVehicleType === 'CAR' && <p className="text-sm text-ink-muted">{detail.deliveryHandlingInstructions}</p>}
                  {detail.deliveryProof?.recipientName && <p className="text-sm">Recibió: {detail.deliveryProof.recipientName}</p>}
                  {detail.deliveryProof && detail.deliveryProof.evidence.length > 0 && can(PERM.DELIVERY_READ) && <DeliveryEvidence deliveryId={detail.deliveryProof.id} status={detail.deliveryProof.status} evidence={detail.deliveryProof.evidence} canUpload={false} />}
                </div>
              ) : detail.deliveryType === 'DINE_IN' ? (
                <div className="rounded-card border border-brand-200 bg-brand-50 p-3">
                  <p className="font-bold text-brand-900">{detail.diningTable?.code ?? 'Mesa del salón'}</p>
                  <p className="mt-1 text-xs text-brand-800">{detail.diningTable?.area ?? 'Área no especificada'} · comanda tomada dentro del local</p>
                  {detail.notes && <p className="mt-2 border-t border-brand-200 pt-2 text-sm text-brand-900">Nota: {detail.notes}</p>}
                </div>
              ) : detail.notes ? (
                <p className="rounded-card bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Nota del cliente: {detail.notes}
                </p>
              ) : null}
            </div>
          </section>

          {/* --- Lineas con su personalizacion completa --- */}
          <section className="order-3 rounded-card border border-line bg-white p-4 lg:col-span-2">
            <SectionTitle>Platos ({detail.detailItems.length})</SectionTitle>
            <ul className="grid gap-3">
              {detail.detailItems.map((item) => (
                <li key={item.id} className="rounded-card border border-line p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium text-ink">
                      {item.quantity}x {item.productNameSnapshot}
                      {item.variantNameSnapshot ? ` · ${item.variantNameSnapshot}` : ''}
                    </p>
                    <span className="shrink-0 text-sm font-medium">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </div>

                  {item.themeSnapshotJson && <CakeThemeReference theme={item.themeSnapshotJson} />}
                  {item.descriptionSnapshot && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-muted">{item.descriptionSnapshot}</p>}
                  {item.customizations.length > 0 && (
                    <ul className="mt-2 grid gap-0.5 text-sm text-ink-muted">
                      {item.customizations.map((customization, index) => (
                        <li key={`${item.id}-${index}`}>
                          {customization.group}: {customization.option}
                          {customization.quantity > 1 ? ` x${customization.quantity}` : ''}
                          {customization.priceDelta > 0
                            ? ` (+${formatCurrency(customization.priceDelta)})`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  )}

                  {item.allergens.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1">
                      {item.allergens.map((allergen) => (
                        <Badge key={allergen} variant="danger">
                          {allergen}
                        </Badge>
                      ))}
                    </p>
                  )}

                  {item.specialInstructions && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
                      {item.specialInstructions}
                    </p>
                  )}
                  <OrderCakeReference orderNumber={detail.orderNumber} itemId={item.id} images={item.designImages} hasReference={Boolean(item.hasReference)} />
                </li>
              ))}
            </ul>
          </section>

          {/* --- Importes --- */}
          <section className="order-2 rounded-card border border-line bg-white p-4">
            <SectionTitle>Importes</SectionTitle>
            <dl className="grid gap-1.5 text-sm">
              <Amount label="Subtotal" value={detail.subtotal} />
              {detail.deliveryFee > 0 && <Amount label={detail.deliveryVehicleType === 'CAR' ? 'Entrega en auto' : 'Delivery'} value={detail.deliveryFee} />}
              {detail.discountTotal > 0 && (
                <Amount label="Descuentos" value={-detail.discountTotal} />
              )}
              {detail.walletAmount > 0 && (
                <Amount label="Pagado con saldo" value={-detail.walletAmount} />
              )}
              <Amount label="Total" value={detail.grandTotal} strong />
              {detail.taxTotal > 0 && (
                <p className="text-xs text-ink-muted">
                  Incluye IGV {formatCurrency(detail.taxTotal)}
                </p>
              )}
            </dl>
          </section>
          </div>
          </>}

          {section === 'payments' && <>
          {/* --- Pago y devoluciones --- */}
          <section className="rounded-card border border-line bg-white p-4 sm:p-5">
            <SectionTitle>Pago</SectionTitle>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface-muted px-4 py-3 text-sm"><span className="text-ink-muted">Total del pedido</span><strong className="text-lg text-ink">{formatCurrency(detail.grandTotal)}</strong></div>
            <p className="mb-3 text-xs leading-5 text-ink-muted">Aquí ves si el dinero fue cobrado, sigue pendiente o se devolvió. El estado del cobro puede requerir atención incluso después de cancelar el pedido.</p>
            {detail.payments.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {can(PERM.PAYMENT_READ) || can(PERM.PAYMENT_REFUND)
                  ? 'Este pedido no tiene ningun cobro registrado.'
                  : 'Tu rol no incluye el permiso para ver los cobros.'}
              </p>
            ) : (
              <ul className="grid gap-3">
                {detail.payments.map((payment) => {
                  const remaining = remainingToRefund(payment);
                  const canRefund =
                    can(PERM.PAYMENT_REFUND) && payment.provider !== 'wallet' && payment.status === 'SUCCEEDED' && remaining > 0;

                  return (
                    <li key={payment.id} className="rounded-card border border-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                          <CreditCard className="size-4" />
                          {PAYMENT_PROVIDER_LABEL[payment.provider.toLowerCase()] ?? payment.provider}
                          {payment.method && payment.method.toLowerCase() !== payment.provider.toLowerCase() ? ` · ${PAYMENT_METHOD_LABEL[payment.method.toLowerCase()] ?? payment.method}` : ''}
                        </p>
                        <Badge
                          variant={
                            payment.status === 'SUCCEEDED'
                              ? 'success'
                              : payment.status === 'FAILED'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                        </Badge>
                      </div>

                      <p className="mt-1 text-sm text-ink-muted">
                        {formatCurrency(payment.amount)} · {formatDate(payment.createdAt)}
                      </p>
                      {payment.failureReason && (
                        <p className="mt-1 text-sm text-red-700">{payment.failureReason}</p>
                      )}
                      {payment.mobileClaim && (
                        <div className="mt-3 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                          <strong>{payment.mobileClaim.status === 'PENDING' ? 'Pago móvil por validar' : payment.mobileClaim.status === 'OBSERVED' ? 'Corrección solicitada' : payment.mobileClaim.status === 'APPROVED' ? 'Pago móvil validado' : 'Pago móvil rechazado'}</strong>
                          <p>Código reportado: {payment.mobileClaim.operationCode}{payment.mobileClaim.payerPhone ? ` · Teléfono: ${payment.mobileClaim.payerPhone}` : ''}</p>
                          {payment.mobileClaim.status === 'PENDING' && <p>Contrasta este código en la aplicación de pago antes de aprobarlo. El pedido seguirá esperando pago hasta la validación.</p>}
                          {['PENDING', 'OBSERVED'].includes(payment.mobileClaim.status) && can(PERM.PAYMENT_VERIFY) && <Link to={ROUTES.adminDirectPayments} onClick={(event) => void openOperationalArea(event, ROUTES.adminDirectPayments)} className="mt-1 inline-block font-bold text-brand-700 underline">Abrir revisión de pagos</Link>}
                          {payment.mobileClaim.rejectionReason && <p>Motivo: {payment.mobileClaim.rejectionReason}</p>}
                        </div>
                      )}

                      {payment.provider === 'cash' && payment.status === 'PENDING' && can(PERM.PAYMENT_VERIFY) && (
                        <div className="mt-3">
                          <p className="mb-2 text-xs text-ink-muted">Si ya recibiste el efectivo, confirma el cobro e indica la referencia del recibo. Esta acción puede confirmar el pedido para Cocina.</p>
                          <Button size="sm" isLoading={capturingId === payment.id} onClick={() => void handleCaptureCash(payment)}>Confirmar efectivo recibido</Button>
                        </div>
                      )}

                      {payment.refunds.length > 0 && (
                        <ul className="mt-2 grid gap-1 border-t border-line pt-2 text-sm text-ink-muted">
                          {payment.refunds.map((refund) => (
                            <li key={refund.id}>
                              {formatCurrency(refund.amount)} ·{' '}
                              {REFUND_STATUS_LABEL[refund.status] ?? refund.status} ·{' '}
                              {refund.reason}
                            </li>
                          ))}
                        </ul>
                      )}

                      {['yape', 'plin'].includes(payment.provider) && (can(PERM.PAYMENT_VERIFY) || can(PERM.PAYMENT_REFUND)) && <div className="mt-3 border-t border-line pt-3"><Button variant="outline" size="sm" onClick={() => navigate(`${ROUTES.adminDirectPayments}?pedido=${encodeURIComponent(detail.orderNumber)}`)}>Ver reporte y devoluciones de {payment.provider === 'yape' ? 'Yape' : 'Plin'}</Button></div>}
                      {canRefund && !['yape', 'plin'].includes(payment.provider) && (
                        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                          {/* El importe es OBLIGATORIO en el esquema del servidor:
                              no hay reembolso "total" implicito. Se precarga con lo
                              que queda para que el caso normal sea un solo toque. */}
                          <div className="w-44">
                            <Input
                              label="A devolver (S/)"
                              inputMode="decimal"
                              value={amounts[payment.id] ?? remaining.toFixed(2)}
                              error={refundErrorFor(payment)}
                              hint={`Máximo ${formatCurrency(remaining)}.`}
                              onChange={(event) =>
                                setAmounts((current) => ({
                                  ...current,
                                  [payment.id]: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <Button
                            variant="danger"
                            leftIcon={<Undo2 className="size-4" />}
                            isLoading={refundingId === payment.id}
                            disabled={Boolean(refundErrorFor(payment))}
                            onClick={() => void handleRefund(payment)}
                          >
                            Devolver
                          </Button>
                          <p className="w-full text-xs text-ink-muted">
                            {manualRefund(payment.provider)
                              ? `Quedan ${formatCurrency(remaining)}. Entrega o transfiere el dinero antes de registrar la devolución; el sistema solo deja constancia.`
                              : `Quedan ${formatCurrency(remaining)}. La devolución se solicitará al proveedor de pago.`}
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          </>}

          {section === 'history' && <>
          {/* --- Historial: quien lo movio, cuando y por que --- */}
          <section className="rounded-card border border-line bg-white p-4 sm:p-5">
            <SectionTitle>Historial</SectionTitle>
            <p className="mb-3 text-xs text-ink-muted">Muestra cuándo cambió el pedido, quién inició el cambio y cualquier motivo guardado.</p>
            <ol className="grid gap-2 text-sm">
              {detail.statusHistory.map((entry) => (
                <li key={entry.id} className="border-l-2 border-line pl-3">
                  <p className="text-ink">
                    {entry.fromStatus ? `${statusLabel(entry.fromStatus)} → ` : ''}
                    {statusLabel(entry.toStatus)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDate(entry.createdAt)} · {sourceLabel[entry.source] ?? entry.source}
                    {entry.comment ? ` · ${entry.comment}` : ''}
                  </p>
                </li>
              ))}
              {detail.statusHistory.length === 0 && (
                <li className="text-ink-muted">Sin cambios de estado registrados.</li>
              )}
            </ol>
          </section>
          </>}
        </div>
      )}
    </Modal>
    <OrderReceiptModal order={detail} isOpen={receiptOpen && detail !== null} onClose={() => setReceiptOpen(false)} onPrinted={() => void load()} />
    </>
  );
};

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</h3>
);

const Amount = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</dt>
    <dd className={strong ? 'font-bold text-ink' : 'text-ink'}>{formatCurrency(value)}</dd>
  </div>
);
