import type { KitchenTicket } from '../types';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const destinationOf = (ticket: KitchenTicket) => ticket.order?.deliveryType === 'DINE_IN'
  ? `SALÓN · ${ticket.order.diningTable?.code ?? 'MESA'}`
  : ticket.order?.deliveryType === 'PICKUP' ? 'RECOJO EN LOCAL' : 'DELIVERY';

/**
 * Comanda de 80 mm. El diálogo se puede volver silencioso iniciando Chrome/Edge
 * con `--kiosk-printing`; sin esa política el navegador exige confirmar impresora,
 * que es la restricción correcta en un equipo personal.
 */
export const printKitchenTicket = (ticket: KitchenTicket): void => {
  if (!ticket.order) return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'fixed', width: '1px', height: '1px', right: '0', bottom: '0',
    border: '0', opacity: '0', pointerEvents: 'none',
  });
  document.body.appendChild(frame);
  const document_ = frame.contentDocument;
  if (!document_) { frame.remove(); return; }

  const itemRows = ticket.order.items.map((item) => {
    const customizations = item.customizations.map((row) =>
      `<li>${escapeHtml(row.group)}: ${escapeHtml(row.option)}${row.quantity > 1 ? ` ×${row.quantity}` : ''}</li>`,
    ).join('');
    const allergens = item.allergens?.length
      ? `<p class="alert">ALÉRGENOS: ${escapeHtml(item.allergens.join(', '))}</p>` : '';
    const instruction = item.specialInstructions
      ? `<p class="note">NOTA: ${escapeHtml(item.specialInstructions)}</p>` : '';
    return `<section><h2>${item.quantity} × ${escapeHtml(item.name)}</h2>${customizations ? `<ul>${customizations}</ul>` : ''}${allergens}${instruction}</section>`;
  }).join('');

  document_.open();
  document_.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(ticket.order.orderNumber)}</title><style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body { width: 72mm; margin: 0; color: #000; font: 12px/1.35 ui-monospace, SFMono-Regular, Consolas, monospace; }
    header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; }
    h1 { margin: 0; font-size: 21px; } .destination { margin: 5px 0 0; font-size: 15px; font-weight: 900; }
    .meta { display: flex; justify-content: space-between; margin-top: 6px; font-size: 10px; }
    section { border-bottom: 1px dashed #000; padding: 9px 0; } h2 { margin: 0; font-size: 16px; }
    ul { margin: 5px 0 0; padding-left: 17px; } .alert { border: 2px solid #000; padding: 5px; font-weight: 900; }
    .note { border-left: 3px solid #000; padding-left: 6px; font-weight: 700; }
    footer { padding-top: 8px; text-align: center; font-size: 10px; }
  </style></head><body>
    <header><h1>${escapeHtml(ticket.order.orderNumber)}</h1><p class="destination">${escapeHtml(destinationOf(ticket))}</p><div class="meta"><span>${escapeHtml(ticket.order.contactName || 'Cliente')}</span><span>${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span></div></header>
    ${itemRows}
    ${ticket.order.notes ? `<section><strong>NOTA GENERAL</strong><p>${escapeHtml(ticket.order.notes)}</p></section>` : ''}
    <footer>Ticket #${ticket.id} · Misky Challay</footer>
  </body></html>`);
  document_.close();

  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1_500);
  }, 180);

};
