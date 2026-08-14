import { env } from '@config/env';

/**
 * PLANTILLAS DE CORREO
 * ---------------------------------------------------------------------------
 * HTML simple y en linea a proposito: los clientes de correo (Gmail, Outlook)
 * ignoran hojas de estilo externas y muchas etiquetas modernas.
 */

const money = (value: number): string => `S/ ${value.toFixed(2)}`;

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character] ?? character);

const layout = (title: string, body: string, cta?: { label: string; url: string }): string => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14201a">
  <div style="background:#237c52;padding:20px;text-align:center">
    <span style="color:#fff;font-size:20px;font-weight:bold">Verde Bowl</span>
  </div>
  <div style="padding:24px;background:#ffffff;border:1px solid #e3e8e5;border-top:none">
    <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
    ${body}
    ${
      cta
        ? `<p style="margin:24px 0 0">
            <a href="${cta.url}" style="background:#237c52;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;display:inline-block">${cta.label}</a>
          </p>`
        : ''
    }
  </div>
  <p style="font-size:12px;color:#5d6b64;text-align:center;padding:16px">
    Verde Bowl - comida saludable a tu medida
  </p>
</div>`;

export interface OrderEmailData {
  orderNumber: string;
  customerName: string | null;
  grandTotal: number;
  branchName?: string | null;
  etaMinutes?: number | null;
  items: Array<{ quantity: number; name: string }>;
  /** Pago contra entrega: monto en efectivo a cobrar al recibir. */
  cashDue?: number | null;
  supportEmail?: string;
}

export interface PlanEmailData {
  customerName: string | null;
  planName: string;
  credit: number;
  paidCredit: number;
  bonusCredit: number;
  expiresAt: Date | null;
  paidExpiresAt: Date | null;
}

export interface ComplaintEmailData {
  code: string;
  type: 'RECLAMO' | 'QUEJA';
  consumerName: string | null;
  /** Ya formateada como texto (es-PE), para no arrastrar Date a la plantilla. */
  dueAt: string;
}

const itemsList = (items: OrderEmailData['items']): string =>
  `<ul style="padding-left:18px;color:#5d6b64">${items
    .map((item) => `<li>${item.quantity}x ${item.name}</li>`)
    .join('')}</ul>`;

/**
 * Seguimiento del pedido. NO apunta a /checkout/confirmacion: esa pantalla esta
 * escrita para el retorno inmediato de la pasarela y muestra "Estamos esperando la
 * confirmacion del banco, no cierres esta pagina" en cualquier estado que no sea
 * CONFIRMED o CANCELLED. Un correo de "va en camino" que lleva ahi hace creer al
 * cliente que le cobraron sin generar el pedido.
 */
const orderUrl = (orderNumber: string): string =>
  `${env.FRONTEND_URL}/cuenta/pedidos/${orderNumber}`;

export const TEMPLATES = {
  PRODUCT_AVAILABLE: (data: {
    productName: string;
    branchName: string;
    productSlug: string;
    subjectTemplate?: string;
    bodyTemplate?: string;
  }) => {
    const replaceVariables = (template: string) => template
      .replaceAll('{{product}}', data.productName)
      .replaceAll('{{branch}}', data.branchName);
    const subject = replaceVariables(data.subjectTemplate ?? '{{product}} volvio a estar disponible');
    const body = replaceVariables(
      data.bodyTemplate
        ?? 'El plato {{product}} ya esta disponible nuevamente en {{branch}}. Puedes pedirlo antes de que se agote.',
    );
    return {
      subject,
      text: `${body} ${env.FRONTEND_URL}/menu/${data.productSlug}`,
      html: layout(
        'Tu plato volvio',
        `<p>${escapeHtml(body).replaceAll('\n', '<br/>')}</p><p style="color:#5d6b64">Este aviso se envia una sola vez por solicitud.</p>`,
        { label: 'Ver el plato', url: `${env.FRONTEND_URL}/menu/${data.productSlug}` },
      ),
    };
  },

  ORDER_CONFIRMED: (data: OrderEmailData) => {
    const isCash = data.cashDue != null && data.cashDue > 0;
    return {
      subject: `Tu pedido ${data.orderNumber} esta confirmado`,
      text: isCash
        ? `Hola${data.customerName ? ` ${data.customerName}` : ''}, confirmamos tu pedido ${data.orderNumber} y ya esta en cocina. Paga ${money(data.cashDue!)} en efectivo al recibirlo.`
        : `Hola${data.customerName ? ` ${data.customerName}` : ''}, recibimos tu pago. Tu pedido ${data.orderNumber} (${money(data.grandTotal)}) ya esta en cocina.`,
      html: layout(
        'Pedido confirmado',
        `<p>Hola${data.customerName ? ` <strong>${data.customerName}</strong>` : ''}, ${isCash ? 'confirmamos tu pedido y ya estamos preparandolo.' : 'recibimos tu pago y ya estamos preparando tu pedido.'}</p>
         ${itemsList(data.items)}
         <p style="margin-top:16px"><strong>Total:</strong> ${money(data.grandTotal)}<br/>
         ${data.branchName ? `<strong>Prepara:</strong> ${data.branchName}<br/>` : ''}
         ${data.etaMinutes ? `<strong>Llega en:</strong> ~${data.etaMinutes} minutos` : ''}</p>
         ${isCash ? `<p style="margin-top:16px;padding:12px 16px;background:#f3f6f4;border-left:3px solid #237c52"><strong>Pago contra entrega:</strong> ten listos ${money(data.cashDue!)} en efectivo para pagar al recibir tu pedido.</p>` : ''}`,
        { label: 'Seguir mi pedido', url: orderUrl(data.orderNumber) },
      ),
    };
  },

  ORDER_PREPARING: (data: OrderEmailData) => ({
    subject: `Estamos preparando tu pedido ${data.orderNumber}`,
    text: `Tu pedido ${data.orderNumber} entro a cocina. Te avisamos cuando salga.`,
    html: layout(
      'Manos a la obra',
      `<p>Tu pedido <strong>${data.orderNumber}</strong> ya esta en la cocina. Te avisamos apenas salga.</p>`,
      { label: 'Ver el estado', url: orderUrl(data.orderNumber) },
    ),
  }),

  ORDER_OUT_FOR_DELIVERY: (data: OrderEmailData) => ({
    subject: `Tu pedido ${data.orderNumber} va en camino`,
    text: `Tu pedido ${data.orderNumber} salio a reparto.`,
    html: layout(
      'Va en camino',
      `<p>Tu pedido <strong>${data.orderNumber}</strong> ya salio. Atento a la puerta.</p>`,
      { label: 'Ver el estado', url: orderUrl(data.orderNumber) },
    ),
  }),

  ORDER_DELIVERED: (data: OrderEmailData) => ({
    subject: `Entregado: ${data.orderNumber}`,
    text: `Tu pedido ${data.orderNumber} fue entregado. Buen provecho.`,
    html: layout(
      'Buen provecho',
      `<p>Tu pedido <strong>${data.orderNumber}</strong> fue entregado. Esperamos que lo disfrutes.</p>`,
    ),
  }),

  ORDER_CANCELLED: (data: OrderEmailData & { reason?: string | null }) => ({
    subject: `Tu pedido ${data.orderNumber} fue cancelado`,
    text: `Tu pedido ${data.orderNumber} fue cancelado. ${data.reason ?? ''}`,
    html: layout(
      'Pedido cancelado',
      // El saldo y el cupon si se liberan solos al cancelar; el cobro con tarjeta
      // todavia NO se devuelve de forma automatica. No se puede afirmar por escrito
      // un reembolso que el sistema no ejecuta: eso es material de reclamo.
      `<p>Tu pedido <strong>${data.orderNumber}</strong> fue cancelado.</p>
       ${data.reason ? `<p style="color:#5d6b64">Motivo: ${data.reason}</p>` : ''}
       <p>Si usaste saldo de tu plan o un cupon, ya estan disponibles de nuevo en tu cuenta.</p>
       <p style="color:#5d6b64">Si pagaste con tarjeta, escribenos a ${data.supportEmail ?? 'nuestro canal de soporte'} con el numero de tu pedido y gestionamos la devolucion.</p>`,
      { label: 'Volver al menu', url: `${env.FRONTEND_URL}/menu` },
    ),
  }),

  PASSWORD_RESET: (data: { customerName: string | null; resetUrl: string; ttlMinutes: number }) => ({
    subject: 'Restablece tu contrasena de Verde Bowl',
    text: `Hola${data.customerName ? ` ${data.customerName}` : ''}, recibimos una solicitud para restablecer tu contrasena. Abre este enlace (vence en ${data.ttlMinutes} minutos): ${data.resetUrl}. Si no fuiste tu, ignora este correo.`,
    html: layout(
      'Restablece tu contrasena',
      `<p>Hola${data.customerName ? ` <strong>${data.customerName}</strong>` : ''}, recibimos una solicitud para restablecer la contrasena de tu cuenta.</p>
       <p>El enlace vence en <strong>${data.ttlMinutes} minutos</strong>. Si no lo pediste tu, ignora este correo: tu contrasena no cambia.</p>`,
      { label: 'Crear una contrasena nueva', url: data.resetUrl },
    ),
  }),

  PLAN_ACTIVATED: (data: PlanEmailData) => ({
    subject: `Tu ${data.planName} esta activo`,
    text: `Tu plan ${data.planName} está activo con ${money(data.credit)} de saldo: ${money(data.paidCredit)} pagados y ${money(data.bonusCredit)} de bono.`,
    html: layout(
      'Tu plan esta activo',
      `<p>Hola${data.customerName ? ` <strong>${data.customerName}</strong>` : ''}, tu <strong>${data.planName}</strong> ya esta activo.</p>
       <p style="font-size:24px;color:#237c52;font-weight:bold;margin:16px 0">${money(data.credit)} de saldo</p>
       <p style="color:#5d6b64"><strong>${money(data.paidCredit)}</strong> corresponden a dinero pagado${data.paidExpiresAt ? ` y vencen el ${data.paidExpiresAt.toLocaleDateString('es-PE')}` : ''}.</p>
       <p style="color:#5d6b64"><strong>${money(data.bonusCredit)}</strong> son bono promocional${data.expiresAt ? ` y vencen el ${data.expiresAt.toLocaleDateString('es-PE')}, junto con los beneficios` : ''}.</p>
       <p style="color:#5d6b64">Tus pedidos usarán primero el saldo que venza antes. Consulta cada lote en Mi saldo.</p>`,
      { label: 'Ver mi saldo', url: `${env.FRONTEND_URL}/cuenta/saldo` },
    ),
  }),

  // --- Libro de Reclamaciones ---
  COMPLAINT_RECEIVED: (data: ComplaintEmailData) => ({
    subject: `Recibimos tu ${data.type === 'QUEJA' ? 'queja' : 'reclamo'} ${data.code}`,
    text: `Registramos tu ${data.type === 'QUEJA' ? 'queja' : 'reclamo'} ${data.code}. Te responderemos a mas tardar el ${data.dueAt}.`,
    html: layout(
      'Constancia de tu registro',
      `<p>Hola${data.consumerName ? ` <strong>${data.consumerName}</strong>` : ''}, dejamos constancia de tu ${data.type === 'QUEJA' ? 'queja' : 'reclamo'} en nuestro Libro de Reclamaciones.</p>
       <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
         <tr><td style="padding:6px 0;color:#5d6b64">Codigo</td><td style="padding:6px 0;text-align:right;font-weight:bold">${data.code}</td></tr>
         <tr><td style="padding:6px 0;color:#5d6b64">Tipo</td><td style="padding:6px 0;text-align:right">${data.type === 'QUEJA' ? 'Queja' : 'Reclamo'}</td></tr>
         <tr><td style="padding:6px 0;color:#5d6b64">Respuesta a mas tardar</td><td style="padding:6px 0;text-align:right">${data.dueAt}</td></tr>
       </table>
       <p style="color:#5d6b64">Guarda este codigo: con el y tu numero de documento puedes consultar el estado en cualquier momento. La respuesta a tu ${data.type === 'QUEJA' ? 'queja' : 'reclamo'} no impide que acudas a otras instancias que la ley te reconoce.</p>`,
      { label: 'Consultar el estado', url: `${env.FRONTEND_URL}/libro-de-reclamaciones` },
    ),
  }),

  COMPLAINT_RESPONDED: (data: ComplaintEmailData & { response: string }) => ({
    subject: `Respuesta a tu ${data.type === 'QUEJA' ? 'queja' : 'reclamo'} ${data.code}`,
    text: `Respondimos tu ${data.code}: ${data.response}`,
    html: layout(
      'Tenemos una respuesta',
      `<p>Hola${data.consumerName ? ` <strong>${data.consumerName}</strong>` : ''}, esta es nuestra respuesta a tu ${data.type === 'QUEJA' ? 'queja' : 'reclamo'} <strong>${data.code}</strong>:</p>
       <div style="background:#f3f6f4;border-left:3px solid #237c52;padding:12px 16px;margin:16px 0;white-space:pre-line">${data.response}</div>
       <p style="color:#5d6b64">Si no estas conforme, puedes acudir a las instancias que la ley te reconoce (INDECOPI).</p>`,
      { label: 'Ver el estado', url: `${env.FRONTEND_URL}/libro-de-reclamaciones` },
    ),
  }),
};

export type TemplateName = keyof typeof TEMPLATES;
