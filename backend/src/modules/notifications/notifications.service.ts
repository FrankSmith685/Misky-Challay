import {
  Branch,
  Complaint,
  Notification,
  Order,
  OrderItem,
  Payment,
  Role,
  User,
  UserPlan,
} from '@database/models';
import { createHash } from 'node:crypto';
import { businessInfo } from '@config/business';
import { NOTIFICATION_STATUS } from '@database/models/notification.model';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { ORDER_STATUS, PAYMENT_PROVIDER, PAYMENT_STATUS, type OrderStatus } from '@config/constants';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { getMailProvider } from '@integrations/mail';
import { TEMPLATES, type OrderEmailData } from './templates';

/** Que estado del pedido dispara que correo. Los que no estan aqui no avisan. */
const TEMPLATE_BY_STATUS: Partial<Record<OrderStatus, keyof typeof TEMPLATES>> = {
  [ORDER_STATUS.CONFIRMED]: 'ORDER_CONFIRMED',
  [ORDER_STATUS.PREPARING]: 'ORDER_PREPARING',
  [ORDER_STATUS.OUT_FOR_DELIVERY]: 'ORDER_OUT_FOR_DELIVERY',
  [ORDER_STATUS.DELIVERED]: 'ORDER_DELIVERED',
  [ORDER_STATUS.CANCELLED]: 'ORDER_CANCELLED',
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);

/** Nunca lanza: que falle un correo no puede tumbar un pedido pagado. */
const deliver = async (input: {
  template: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  userId?: number | null;
  orderId?: number | null;
  idempotencyKey: string;
}): Promise<void> => {
  try {
    // Idempotencia: el mismo aviso no se manda dos veces (RN-015 aplicado al correo).
    const existing = await Notification.findOne({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return;

    const provider = getMailProvider();

    try {
      const result = await provider.send({
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });

      await Notification.create({
        userId: input.userId ?? null,
        orderId: input.orderId ?? null,
        template: input.template,
        recipient: input.to,
        subject: input.subject,
        status: NOTIFICATION_STATUS.SENT,
        provider: provider.name,
        providerMessageId: result.messageId,
        idempotencyKey: input.idempotencyKey,
        sentAt: new Date(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al enviar';

      await Notification.create({
        userId: input.userId ?? null,
        orderId: input.orderId ?? null,
        template: input.template,
        recipient: input.to,
        subject: input.subject,
        status: NOTIFICATION_STATUS.FAILED,
        provider: provider.name,
        errorMessage: message,
        idempotencyKey: input.idempotencyKey,
      });

      logger.error(`No se pudo enviar el correo ${input.template} a ${input.to}`, error);
    }
  } catch (error) {
    logger.error('Fallo el registro de la notificacion', error);
  }
};

export const notificationsService = {
  /** Bienvenida del personal: explica por donde entra y con que alcance trabajara. */
  async notifyStaffAccess(input: {
    userId: number;
    temporaryPassword: string;
    roleIds: number[];
    branchId?: number | null;
  }): Promise<void> {
    const [user, roles, branch] = await Promise.all([
      User.findByPk(input.userId),
      Role.findAll({ where: { id: input.roleIds }, order: [['name', 'ASC']] }),
      input.branchId ? Branch.findByPk(input.branchId) : Promise.resolve(null),
    ]);
    if (!user?.email) return;

    const loginUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/ingresar`;
    const displayName = user.firstName || 'Hola';
    const roleNames = roles.map((role) => role.name).join(', ') || 'Personal interno';
    const scope = branch?.name ?? 'Todas las sucursales (alcance global)';
    const safeName = escapeHtml(displayName);
    const safeEmail = escapeHtml(user.email);
    const safePassword = escapeHtml(input.temporaryPassword);
    const safeRoles = escapeHtml(roleNames);
    const safeScope = escapeHtml(scope);
    const text = [
      `${displayName}, ya tienes acceso al panel de Verde Bowl.`,
      '',
      `Usuario: ${user.email}`,
      `Contraseña temporal: ${input.temporaryPassword}`,
      `Roles: ${roleNames}`,
      `Alcance: ${scope}`,
      `Ingresar: ${loginUrl}`,
      '',
      'Por seguridad, cambia la contraseña temporal desde Mi perfil después de ingresar.',
    ].join('\n');

    await deliver({
      template: 'STAFF_ACCESS_CREATED',
      to: user.email,
      subject: 'Tu acceso al panel de Verde Bowl',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#14201a">
        <h2 style="color:#1c6243">Tu acceso está listo</h2>
        <p>${safeName}, ya puedes ingresar al panel de trabajo de Verde Bowl.</p>
        <div style="background:#f0f9f4;border:1px solid #bbe5cd;border-radius:12px;padding:16px">
          <p><strong>Usuario:</strong> ${safeEmail}</p>
          <p><strong>Contraseña temporal:</strong> ${safePassword}</p>
          <p><strong>Roles:</strong> ${safeRoles}</p>
          <p><strong>Alcance:</strong> ${safeScope}</p>
        </div>
        <p><a href="${loginUrl}" style="display:inline-block;background:#237c52;color:white;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Ingresar al panel</a></p>
        <p style="font-size:13px;color:#5d6b64">Cambia la contraseña temporal desde Mi perfil después de ingresar.</p>
      </div>`,
      text,
      userId: user.id,
      idempotencyKey: `staff-${user.id}-access-created`,
    });
  },

  /**
   * Avisa al cliente del cambio de estado de su pedido.
   *
   * Se llama DESPUES de que el cambio ya esta guardado, y en segundo plano: el
   * pedido no debe esperar al correo, y si el correo falla, el pedido sigue vivo.
   */
  async notifyOrderStatus(orderId: number, status: OrderStatus): Promise<void> {
    const templateName = TEMPLATE_BY_STATUS[status];
    if (!templateName) return;

    const order = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: Branch, as: 'branch', attributes: ['name'] },
      ],
    });

    if (!order) return;

    // Sin correo no hay a quien avisar (checkout de invitado sin cuenta).
    const user = order.userId ? await User.findByPk(order.userId) : null;
    const email = user?.email;
    if (!email) return;

    // Pago contra entrega: el correo de confirmacion no puede decir "recibimos tu
    // pago" si el efectivo aun no se cobro. Se anota cuanto queda por pagar al recibir.
    let cashDue: number | null = null;
    if (status === ORDER_STATUS.CONFIRMED) {
      const cash = await Payment.findOne({
        where: {
          payableType: PAYABLE_TYPE.ORDER,
          payableId: order.id,
          provider: PAYMENT_PROVIDER.CASH,
          status: PAYMENT_STATUS.PENDING,
        },
      });
      if (cash) cashDue = Number(cash.amount);
    }

    const data: OrderEmailData & { reason?: string | null; cashDue?: number | null } = {
      orderNumber: order.orderNumber,
      customerName: order.contactName ?? user.firstName,
      grandTotal: Number(order.grandTotal),
      branchName: (order.get('branch') as { name: string } | undefined)?.name ?? null,
      items: (order.items ?? []).map((item) => ({
        quantity: item.quantity,
        name: item.productNameSnapshot,
      })),
      reason: order.cancelReason,
      cashDue,
    };

    const content = TEMPLATES[templateName](data as never);

    await deliver({
      template: templateName,
      to: email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      userId: order.userId,
      orderId: order.id,
      // Un aviso por pedido y estado: aunque el estado se toque dos veces, se manda uno.
      idempotencyKey: `order-${order.id}-${status}`,
    });
  },

  /** Plan activado: el cliente ya tiene su saldo. */
  async notifyPlanActivated(userPlanId: number): Promise<void> {
    const userPlan = await UserPlan.findByPk(userPlanId);
    if (!userPlan) return;

    const user = await User.findByPk(userPlan.userId);
    if (!user?.email) return;

    const content = TEMPLATES.PLAN_ACTIVATED({
      customerName: user.firstName,
      planName: userPlan.planNameSnapshot,
      credit: Number(userPlan.creditSnapshot),
      expiresAt: userPlan.expiresAt,
    });

    await deliver({
      template: 'PLAN_ACTIVATED',
      to: user.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      userId: user.id,
      idempotencyKey: `plan-${userPlan.id}-activated`,
    });
  },

  /**
   * Copia del reclamo al consumidor + aviso al negocio.
   * INDECOPI exige entregar constancia al consumidor; el aviso interno es para que
   * alguien lo atienda dentro del plazo.
   */
  async notifyComplaintReceived(complaint: Complaint): Promise<void> {
    const content = TEMPLATES.COMPLAINT_RECEIVED({
      code: complaint.code ?? '',
      type: complaint.type,
      consumerName: complaint.consumerName,
      dueAt: complaint.dueAt.toLocaleDateString('es-PE'),
    });

    await deliver({
      template: 'COMPLAINT_RECEIVED',
      to: complaint.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      userId: complaint.userId,
      idempotencyKey: `complaint-${complaint.id}-received`,
    });

    // Aviso interno al buzon de reclamos: el consumidor no debe esperar a que alguien
    // mire el panel por casualidad.
    await deliver({
      template: 'COMPLAINT_RECEIVED_INTERNAL',
      to: businessInfo.supportEmail,
      subject: `Nuevo ${complaint.type === 'QUEJA' ? 'queja' : 'reclamo'} ${complaint.code}`,
      html: content.html,
      text: `Nuevo registro ${complaint.code} de ${complaint.consumerName}. Responder antes del ${complaint.dueAt.toLocaleDateString('es-PE')}.`,
      idempotencyKey: `complaint-${complaint.id}-internal`,
    });
  },

  async notifyComplaintResponded(complaint: Complaint): Promise<void> {
    if (!complaint.response) return;

    const content = TEMPLATES.COMPLAINT_RESPONDED({
      code: complaint.code ?? '',
      type: complaint.type,
      consumerName: complaint.consumerName,
      dueAt: complaint.dueAt.toLocaleDateString('es-PE'),
      response: complaint.response,
    });

    await deliver({
      template: 'COMPLAINT_RESPONDED',
      to: complaint.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      userId: complaint.userId,
      // La clave incluye respondedAt: si se responde otra vez (correccion), se reenvia.
      idempotencyKey: `complaint-${complaint.id}-responded-${complaint.respondedAt?.getTime() ?? 'x'}`,
    });
  },

  /** Enlace de recuperacion de contrasena. El token en claro solo viaja en este correo. */
  async notifyPasswordReset(userId: number, rawToken: string, ttlMinutes: number): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.email) return;

    const base = env.FRONTEND_URL.replace(/\/$/, '');
    const resetUrl = `${base}/restablecer-clave?token=${rawToken}`;
    const content = TEMPLATES.PASSWORD_RESET({
      customerName: user.firstName,
      resetUrl,
      ttlMinutes,
    });

    await deliver({
      template: 'PASSWORD_RESET',
      to: user.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      userId: user.id,
      // La clave incluye un prefijo del hash del token: un reintento del mismo envio
      // no duplica, pero cada solicitud nueva (token nuevo) si manda un correo nuevo.
      idempotencyKey: `password-reset-${user.id}-${createHash('sha256').update(rawToken).digest('hex').slice(0, 16)}`,
    });
  },

  /** Historial de lo que se le mando a un cliente (soporte lo consulta). */
  async listForUser(userId: number) {
    return Notification.findAll({
      where: { userId },
      include: [{ model: Order, as: 'order', attributes: ['orderNumber', 'status'] }],
      order: [['id', 'DESC']],
      limit: 50,
    });
  },
};

export type NotificationsService = typeof notificationsService;
