import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';
import { env } from '../config/env';
import type { StaffRow } from '../services/api/staff.service';

const record = (value: unknown): StaffRow =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as StaffRow : {};
const escape = (value: unknown): string => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const amount = (value: unknown): string => `S/ ${Number(value ?? 0).toFixed(2)}`;

/**
 * `QRCode.toDataURL` usa un canvas del navegador. React Native no tiene DOM ni
 * canvas, por eso imprimir desde Android terminaba con "You need to specify a
 * canvas element". La matriz QR, en cambio, es JavaScript puro; la convertimos
 * en SVG y Expo Print puede incluirla directamente en el ticket/PDF.
 */
const qrSvgDataUrl = (value: string): string => {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const path = Array.from(qr.modules.data)
    .map((dark, index) => dark
      ? `M${index % size} ${Math.floor(index / size)}h1v1h-1z`
      : '')
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${size + 4} ${size + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${size + 4}" height="${size + 4}" fill="#fff"/><path d="${path}" fill="#13231b"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const receiptHtml = async (order: StaffRow): Promise<string> => {
  const items = Array.isArray(order.detailItems) ? order.detailItems.map(record) : [];
  const payments = Array.isArray(order.payments) ? order.payments.map(record) : [];
  const address = record(order.addressSnapshotJson);
  const branch = record(order.branch);
  const settings = record(order.receiptSettings);
  const trackingUrl = `${env.webUrl}/cuenta/pedidos/${encodeURIComponent(String(order.orderNumber))}`;
  const qr = qrSvgDataUrl(trackingUrl);
  const methods = payments
    .filter((payment) => payment.status === 'SUCCEEDED' || payment.status === 'PENDING')
    .map((payment) => `${payment.method || payment.provider}${payment.status === 'PENDING' ? ' (pendiente)' : ''}`)
    .join(' + ') || 'No disponible';
  const paperWidth = Number(settings.paperWidth) === 58 ? 58 : 80;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:${paperWidth}mm auto;margin:0}*{box-sizing:border-box}body{margin:0;color:#13231b;font-family:Arial,sans-serif;font-size:11px}
    .ticket{width:${paperWidth}mm;padding:4mm}.center{text-align:center}.brand{font-size:20px;font-weight:900;color:#176842}.box{border:2px solid #176842;border-radius:10px;padding:9px;margin-top:8px}
    .warning{font-weight:900;color:#b42318;text-transform:uppercase}.meta{margin:10px 0;padding:8px;background:#f1f6f3;border-radius:8px;line-height:1.55}
    table{width:100%;border-collapse:collapse}th{background:#176842;color:#fff;text-align:left;padding:6px}td{padding:7px 5px;border-bottom:1px solid #dbe5df;vertical-align:top}.right{text-align:right}.total{font-size:16px;font-weight:900;border-top:2px solid #176842;padding-top:7px}.qr{width:72px;height:72px}.footer{display:flex;justify-content:space-between;align-items:end;margin-top:12px;padding-top:8px;border-top:1px solid #dbe5df}
  </style></head><body><main class="ticket">
    <header class="center"><div class="brand">Verde Bowl</div><div>${escape(branch.name)}</div><div class="box"><b>TICKET INTERNO</b><div style="font-size:16px;font-weight:900;margin:4px">Pedido ${escape(order.orderNumber)}</div><div class="warning">No es un comprobante de pago</div></div></header>
    <section class="meta"><div><b>Fecha:</b> ${escape(order.placedAt)}</div><div><b>Cliente:</b> ${escape(order.contactName || 'Sin nombre')}</div><div><b>Telefono:</b> ${escape(order.contactPhone || 'Sin telefono')}</div><div><b>Canal:</b> ${escape(order.deliveryType)}</div><div><b>Pago:</b> ${escape(methods)}</div>${address.line1 ? `<div><b>Direccion:</b> ${escape(address.line1)}${address.reference ? ` · ${escape(address.reference)}` : ''}</div>` : ''}${order.notes ? `<div><b>Indicaciones:</b> ${escape(order.notes)}</div>` : ''}</section>
    <table><thead><tr><th>Producto</th><th>Cant.</th><th class="right">Importe</th></tr></thead><tbody>${items.map((item) => `<tr><td><b>${escape(item.productNameSnapshot)}</b>${item.variantNameSnapshot ? `<br><small>${escape(item.variantNameSnapshot)}</small>` : ''}${item.specialInstructions ? `<br><small>Nota: ${escape(item.specialInstructions)}</small>` : ''}</td><td>${escape(item.quantity)}</td><td class="right">${amount(item.lineTotal)}</td></tr>`).join('')}</tbody></table>
    <div style="margin-top:10px"><div class="right">Subtotal: ${amount(order.subtotal)}</div>${Number(order.deliveryFee) > 0 ? `<div class="right">Delivery: ${amount(order.deliveryFee)}</div>` : ''}${Number(order.discountTotal) > 0 ? `<div class="right">Descuentos: -${amount(order.discountTotal)}</div>` : ''}<div class="right total">Total: ${amount(Number(order.grandTotal ?? 0) + Number(order.walletAmount ?? 0))}</div></div>
    <footer class="footer"><div><b>Gracias por tu pedido.</b><br>Documento operativo sin valor tributario.</div><img class="qr" src="${qr}"></footer>
  </main></body></html>`;
};

export const printInternalReceipt = async (order: StaffRow): Promise<void> => {
  await Print.printAsync({ html: await receiptHtml(order) });
};

export const shareInternalReceiptPdf = async (order: StaffRow): Promise<void> => {
  const file = await Print.printToFileAsync({ html: await receiptHtml(order), base64: false });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este dispositivo no permite compartir archivos.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Ticket interno ${String(order.orderNumber ?? '')}`,
    UTI: 'com.adobe.pdf',
  });
};
