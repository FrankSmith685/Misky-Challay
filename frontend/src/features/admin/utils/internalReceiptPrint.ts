import QRCode from 'qrcode';
import { formatCurrency, formatDate } from '@lib/format';
import type { AdminOrderDetail } from '../types';

const escape = (value: unknown): string => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

/** Llena una ventana abierta por el gesto del operario y lanza el dialogo nativo. */
export const printInternalReceiptWindow = async (
  order: AdminOrderDetail,
  target: Window,
): Promise<void> => {
  const trackingUrl = `${window.location.origin}/cuenta/pedidos/${encodeURIComponent(order.orderNumber)}`;
  const qr = await QRCode.toDataURL(trackingUrl, { width: 160, margin: 1 });
  const paperWidth = order.receiptSettings.paperWidth === 58 ? 58 : 80;
  target.document.open();
  target.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${escape(order.orderNumber)}</title><style>
    @page{size:${paperWidth}mm auto;margin:0}*{box-sizing:border-box}body{margin:0;font:11px Arial;color:#17324d}.ticket{width:${paperWidth}mm;padding:4mm}.center{text-align:center}.brand{font-size:20px;font-weight:900;color:#0057a6}.box{border:2px solid #0057a6;border-radius:9px;padding:8px;margin-top:8px}.danger{color:#b42318;font-weight:900;text-transform:uppercase}.meta{margin:10px 0;padding:8px;background:#ebf3fb;line-height:1.55}table{width:100%;border-collapse:collapse}th{background:#0057a6;color:white;text-align:left;padding:6px}td{padding:7px 5px;border-bottom:1px solid #dce6ef;vertical-align:top}.right{text-align:right}.total{font-size:16px;font-weight:900;border-top:2px solid #0057a6;padding-top:7px}.footer{display:flex;justify-content:space-between;align-items:end;margin-top:12px;border-top:1px solid #dce6ef;padding-top:8px}.qr{width:70px;height:70px}</style></head><body><main class="ticket">
    <header class="center"><div class="brand">Misky Challay</div><div>${escape(order.branch?.name)}</div><div class="box"><b>TICKET INTERNO</b><div style="font-size:16px;font-weight:900;margin:4px">Pedido ${escape(order.orderNumber)}</div><div class="danger">No es un comprobante de pago</div></div></header>
    <section class="meta"><div><b>Fecha:</b> ${escape(formatDate(order.placedAt))}</div><div><b>Cliente:</b> ${escape(order.contactName || 'Sin nombre')}</div><div><b>Canal:</b> ${escape(order.deliveryType)}</div>${order.addressSnapshotJson?.line1 ? `<div><b>Direccion:</b> ${escape(order.addressSnapshotJson.line1)} ${escape(order.addressSnapshotJson.reference || '')}</div>` : ''}${order.notes ? `<div><b>Indicaciones:</b> ${escape(order.notes)}</div>` : ''}</section>
    <table><thead><tr><th>Producto</th><th>Cant.</th><th class="right">Importe</th></tr></thead><tbody>${order.detailItems.map((item) => `<tr><td><b>${escape(item.productNameSnapshot)}</b>${item.variantNameSnapshot ? `<br><small>${escape(item.variantNameSnapshot)}</small>` : ''}${item.specialInstructions ? `<br><small>Nota: ${escape(item.specialInstructions)}</small>` : ''}</td><td>${item.quantity}</td><td class="right">${formatCurrency(item.lineTotal)}</td></tr>`).join('')}</tbody></table>
    <div class="right" style="margin-top:10px">Subtotal: ${formatCurrency(order.subtotal)}</div>${order.deliveryFee > 0 ? `<div class="right">Delivery: ${formatCurrency(order.deliveryFee)}</div>` : ''}${order.discountTotal > 0 ? `<div class="right">Descuentos: -${formatCurrency(order.discountTotal)}</div>` : ''}<div class="right total">Total: ${formatCurrency(order.grandTotal + order.walletAmount)}</div>
    <footer class="footer"><div><b>Gracias por tu pedido.</b><br>Documento operativo sin valor tributario.</div><img class="qr" src="${qr}"></footer>
  </main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));window.addEventListener('afterprint',()=>window.close());</script></body></html>`);
  target.document.close();
};
