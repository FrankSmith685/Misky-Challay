import type { DiningReceipt, DiningTableRow } from '../types';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const money = (value: number) => `S/ ${value.toFixed(2)}`;

const openPrint = (title: string, body: string) => {
  const popup = window.open('', '_blank', 'width=520,height=760');
  if (!popup) throw new Error('Permite las ventanas emergentes para imprimir');
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    *{box-sizing:border-box}body{font:14px system-ui;margin:0;padding:28px;color:#12251c}h1{font-size:22px;margin:0}h2{font-size:14px;margin:4px 0 24px;color:#52645a}.row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px dashed #ccd7d0}.muted{color:#62736a;font-size:12px}.total{font-size:20px;font-weight:800;border-top:2px solid #183f2c;margin-top:12px;padding-top:12px}.center{text-align:center}.tag{display:inline-block;padding:5px 9px;background:#e5f5ec;border-radius:99px;font-size:11px;font-weight:700}@media print{body{padding:0}}
  </style></head><body>${body}<script>window.onload=()=>{window.print()}</script></body></html>`);
  popup.document.close();
};

export const printPrebill = (table: DiningTableRow, branchName: string) => {
  if (!table.command) return;
  openPrint(`Precuenta ${table.command.orderNumber}`, `
    <div class="center"><h1>Verde Bowl</h1><h2>${escapeHtml(branchName)}</h2><span class="tag">PRECUENTA · NO ES COMPROBANTE</span></div>
    <p><b>${escapeHtml(table.code)}</b> · ${escapeHtml(table.command.guestName || 'Cliente')}</p>
    <p class="muted">Comanda ${escapeHtml(table.command.orderNumber)} · Atiende ${escapeHtml(table.command.waiterName || 'QR de mesa')}</p>
    ${table.command.items.map((item) => `<div class="row"><span>${item.quantity} × ${escapeHtml(item.name)}</span><b>${money(item.total)}</b></div>`).join('')}
    <div class="row"><span>Op. gravada</span><span>${money(table.command.taxableBase)}</span></div>
    <div class="row"><span>IGV incluido</span><span>${money(table.command.taxTotal)}</span></div>
    <div class="row total"><span>Total</span><span>${money(table.command.total)}</span></div>
    <p class="center muted">Solicita boleta o factura antes del pago.</p>`);
};

export const printDiningReceipt = (receipt: DiningReceipt, internalOnly = false) => {
  const title = internalOnly ? 'Ticket interno' : receipt.documentType;
  openPrint(`${title} ${receipt.orderNumber}`, `
    <div class="center"><h1>Verde Bowl</h1><h2>${escapeHtml(receipt.branchName)}</h2><span class="tag">${escapeHtml(title)}</span>${internalOnly ? '<p class="muted"><b>NO ES COMPROBANTE DE PAGO</b><br>Sin valor tributario</p>' : ''}</div>
    <p><b>${escapeHtml(receipt.tableCode || 'Salón')}</b> · ${escapeHtml(receipt.guestName || 'Cliente')}</p>
    <p class="muted">Pedido ${escapeHtml(receipt.orderNumber)} · ${new Date(receipt.issuedAt).toLocaleString('es-PE')}</p>
    ${receipt.billingDocNumber ? `<p class="muted">${escapeHtml(receipt.billingDocType)} ${escapeHtml(receipt.billingDocNumber)} · ${escapeHtml(receipt.billingName)}</p>` : ''}
    ${receipt.items.map((item) => `<div class="row"><span>${item.quantity} × ${escapeHtml(item.name)}</span><b>${money(item.total)}</b></div>`).join('')}
    <div class="row"><span>Op. gravada</span><span>${money(receipt.taxableBase)}</span></div>
    <div class="row"><span>IGV incluido</span><span>${money(receipt.taxTotal)}</span></div>
    <div class="row total"><span>Total</span><span>${money(receipt.total)}</span></div>
    <p class="muted">Pago: ${receipt.payments.map((part) => `${escapeHtml(part.method)} ${money(part.amount)}`).join(' · ')}</p>
    <p class="center">Gracias por visitarnos.</p>`);
};

export const printTableQrCard = (table: DiningTableRow, branchName: string, url: string, qrImage: string) => {
  openPrint(`QR ${table.code}`, `<div class="center"><h1>Verde Bowl</h1><h2>${escapeHtml(branchName)}</h2><p style="font-size:36px;font-weight:900;margin:24px">${escapeHtml(table.code)}</p><img src="${escapeHtml(qrImage)}" alt="QR de ${escapeHtml(table.code)}" style="width:280px;max-width:90%;margin:auto"><p>Escanea para ver la carta y pedir desde tu mesa.</p><p style="word-break:break-all;font-weight:700">${escapeHtml(url)}</p><p class="muted">El personal puede desactivar o renovar este enlace desde el panel.</p></div>`);
};
