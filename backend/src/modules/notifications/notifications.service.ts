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
  Product,
} from '@database/models';
import { createHash } from 'node:crypto';
import { Op } from 'sequelize';
import { settingsService } from '@modules/settings/settings.service';
import { NOTIFICATION_STATUS } from '@database/models/notification.model';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import {
  ORDER_STATUS,
  PAID_CREDIT_VALIDITY_DAYS,
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  PUSH_CHANNEL,
  PUSH_TEMPLATE,
  type OrderStatus,
  type PushChannelId,
  type PushTemplate,
} from '@config/constants';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { getMailProvider } from '@integrations/mail';
import { TEMPLATES, type OrderEmailData } from './templates';
import { mobilePushService } from './mobilePush.service';

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

type NotificationCategory = 'ORDER' | 'PLAN' | 'STAFF' | 'COMPLAINT' | 'SECURITY' | 'AVAILABILITY';

const eventIsEnabled = (
  category: NotificationCategory,
  settings: Awaited<ReturnType<typeof settingsService.getCommunicationSettings>>,
): boolean => {
  if (category === 'ORDER') return settings.orderUpdatesEnabled;
  if (category === 'PLAN') return settings.planUpdatesEnabled;
  if (category === 'STAFF') return settings.staffAccessEnabled;
  if (category === 'AVAILABILITY') return settings.availabilityAlertsEnabled;
  // Reclamos y recuperacion de cuenta son comunicaciones esenciales.
  return true;
};

/** Nunca lanza: que falle un correo no puede tumbar un pedido pagado. */
const deliver = async (input: {
  category: NotificationCategory;
  template: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  userId?: number | null;
  orderId?: number | null;
  idempotencyKey: string;
  actionUrl?: string | null;
  sendEmail?: boolean;
  createInApp?: boolean;
}): Promise<boolean> => {
  try {
    const settings = await settingsService.getCommunicationSettings();
    if (!eventIsEnabled(input.category, settings)) return false;

    const isEssentialEmail = input.category === 'COMPLAINT' || input.category === 'SECURITY';
    const shouldSendEmail = input.sendEmail !== false
      && Boolean(input.to)
      && (settings.emailNotificationsEnabled || isEssentialEmail);
    const shouldCreateInApp = input.createInApp !== false
      && Boolean(input.userId)
      && settings.inAppNotificationsEnabled;
    if (!shouldSendEmail && !shouldCreateInApp) return false;

    // Compatibilidad con avisos creados antes de separar correo y campana.
    const legacy = await Notification.findOne({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (legacy) return legacy.status === NOTIFICATION_STATUS.SENT;

    let delivered = false;

    if (shouldCreateInApp) {
      const inAppKey = `${input.idempotencyKey}:in-app`;
      const existingInApp = await Notification.findOne({ where: { idempotencyKey: inAppKey } });
      if (existingInApp?.status === NOTIFICATION_STATUS.SENT) delivered = true;
      else if (!existingInApp) {
        await Notification.create({
          userId: input.userId ?? null,
          orderId: input.orderId ?? null,
          channel: 'IN_APP',
          template: input.template,
          recipient: `user:${input.userId}`,
          subject: input.subject,
          actionUrl: input.actionUrl ?? null,
          status: NOTIFICATION_STATUS.SENT,
          provider: 'in_app',
          idempotencyKey: inAppKey,
          sentAt: new Date(),
        });
        delivered = true;
      }
    }

    if (!shouldSendEmail) return delivered;

    const provider = getMailProvider({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      user: settings.smtpUser || undefined,
      password: settings.smtpPassword,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      replyToEmail: settings.replyToEmail || undefined,
    });

    try {
      const result = await provider.send({
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });

      const emailKey = `${input.idempotencyKey}:email`;
      const existingEmail = await Notification.findOne({ where: { idempotencyKey: emailKey } });
      if (existingEmail?.status === NOTIFICATION_STATUS.SENT) return true;

      const notificationValues = {
        userId: null,
        orderId: input.orderId ?? null,
        channel: 'EMAIL',
        template: input.template,
        recipient: input.to,
        subject: input.subject,
        actionUrl: input.actionUrl ?? null,
        status: NOTIFICATION_STATUS.SENT,
        provider: provider.name,
        providerMessageId: result.messageId,
        errorMessage: null,
        idempotencyKey: emailKey,
        sentAt: new Date(),
      } as const;
      if (existingEmail) await existingEmail.update(notificationValues);
      else await Notification.create(notificationValues);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al enviar';
      const emailKey = `${input.idempotencyKey}:email`;
      const existingEmail = await Notification.findOne({ where: { idempotencyKey: emailKey } });
      const notificationValues = {
        userId: null,
        orderId: input.orderId ?? null,
        channel: 'EMAIL',
        template: input.template,
        recipient: input.to,
        subject: input.subject,
        actionUrl: input.actionUrl ?? null,
        status: NOTIFICATION_STATUS.FAILED,
        provider: provider.name,
        errorMessage: message,
        idempotencyKey: emailKey,
      } as const;
      if (existingEmail) await existingEmail.update(notificationValues);
      else await Notification.create(notificationValues);

      logger.error(`No se pudo enviar el correo ${input.template} a ${input.to}`, error);
      return delivered;
    }
  } catch (error) {
    logger.error('Fallo el registro de la notificacion', error);
    return false;
  }
};

/**
 * Aviso en la pantalla del telefono.
 *
 * Nunca lanza y respeta el mismo interruptor por categoria que el correo. El
 * consentimiento del cliente es el propio dispositivo registrado: la app lo crea
 * al activar las notificaciones y lo da de baja al desactivarlas, asi que aqui
 * solo hay que decidir si el negocio quiere mandar ese tipo de aviso.
 *
 * Devuelve si el aviso llego a algun telefono, para no repetirlo por otra via.
 */
const pushToPhone = async (input: {
  category: NotificationCategory;
  userId: number | null;
  title: string;
  body: string;
  actionUrl: string;
  channel: PushChannelId;
  template: PushTemplate;
  orderId?: number | null;
  idempotencyKey: string;
}): Promise<boolean> => {
  // Pedido de invitado o reclamo sin cuenta: no hay dispositivos a los que avisar.
  if (!input.userId) return false;
  try {
    const settings = await settingsService.getCommunicationSettings();
    if (!eventIsEnabled(input.category, settings)) return false;

    return await mobilePushService.sendToUser({
      userId: input.userId,
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl,
      channel: input.channel,
      template: input.template,
      orderId: input.orderId ?? null,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    logger.error('Fallo el aviso push movil', error);
    return false;
  }
};

const money = (value: number): string => `S/ ${value.toFixed(2)}`;

export const notificationsService = {
  async notifyProductAvailable(input: {
    subscriptionId: number;
    userId: number;
    productId: number;
    branchName: string;
    email: string;
    notifyEmail: boolean;
    notifyInApp: boolean;
  }): Promise<boolean> {
    const [product, settings] = await Promise.all([
      Product.findByPk(input.productId),
      settingsService.getCommunicationSettings(),
    ]);
    if (!product) return false;

    const content = TEMPLATES.PRODUCT_AVAILABLE({
      productName: product.name,
      productSlug: product.slug,
      branchName: input.branchName,
      subjectTemplate: settings.availabilityEmailSubject,
      bodyTemplate: settings.availabilityEmailBody,
    });

    const delivered = await deliver({
      category: 'AVAILABILITY',
      template: 'PRODUCT_AVAILABLE',
      to: input.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      userId: input.userId,
      idempotencyKey: `availability-${input.subscriptionId}`,
      actionUrl: `/menu/${product.slug}`,
      sendEmail: input.notifyEmail,
      createInApp: input.notifyInApp,
    });

    // El push es la version movil del aviso dentro de la app: sale si el cliente
    // pidio ese canal, nunca si eligio solo el correo. La ruta es la de la app,
    // distinta de la ruta web que guarda el aviso de la campana.
    const pushed = input.notifyInApp
      ? await pushToPhone({
        category: 'AVAILABILITY',
        userId: input.userId,
        title: content.subject,
        body: `${product.name} volvió a estar disponible en ${input.branchName}. Pídelo antes de que se agote.`,
        actionUrl: `/product/${product.slug}`,
        channel: PUSH_CHANNEL.AVAILABILITY,
        template: PUSH_TEMPLATE.PRODUCT_AVAILABLE,
        idempotencyKey: `availability-${input.subscriptionId}`,
      })
      : false;

    // Si el telefono ya recibio el aviso, la suscripcion esta cumplida aunque el
    // correo haya fallado: quien llama la cierra y no la reintenta.
    return delivered || pushed;
  },

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
      category: 'STAFF',
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
    const communicationSettings = await settingsService.getCommunicationSettings();
    if (!communicationSettings.orderUpdatesEnabled) return;

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
    if (!user) return;

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

    const businessInfo = status === ORDER_STATUS.CANCELLED
      ? await settingsService.getBusinessInfo()
      : null;
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
      supportEmail: businessInfo?.supportEmail,
    };

    const content = TEMPLATES[templateName](data as never);

    const actionUrl = `/order/${order.orderNumber}`;
    await deliver({
      category: 'ORDER',
      template: templateName,
      to: email ?? '',
      subject: content.subject,
      html: content.html,
      text: content.text,
      userId: order.userId,
      orderId: order.id,
      // Un aviso por pedido y estado: aunque el estado se toque dos veces, se manda uno.
      idempotencyKey: `order-${order.id}-${status}`,
      actionUrl,
    });
    await pushToPhone({
      category: 'ORDER',
      userId: user.id,
      title: content.subject,
      body: content.text,
      actionUrl,
      channel: PUSH_CHANNEL.ORDER_UPDATES,
      template: PUSH_TEMPLATE.ORDER_STATUS,
      orderId: order.id,
      idempotencyKey: `order-${order.id}-${status}`,
    });
  },

  /** Plan activado: el cliente ya tiene su saldo. */
  async notifyPlanActivated(userPlanId: number): Promise<void> {
    const userPlan = await UserPlan.findByPk(userPlanId);
    if (!userPlan) return;

    const user = await User.findByPk(userPlan.userId);
    if (!user) return;

    const credit = Number(userPlan.creditSnapshot);
    const content = TEMPLATES.PLAN_ACTIVATED({
      customerName: user.firstName,
      planName: userPlan.planNameSnapshot,
      credit,
      paidCredit: Number(userPlan.priceSnapshot),
      bonusCredit: Math.max(0, credit - Number(userPlan.priceSnapshot)),
      expiresAt: userPlan.expiresAt,
      paidExpiresAt: userPlan.activatedAt
        ? new Date(userPlan.activatedAt.getTime() + PAID_CREDIT_VALIDITY_DAYS * 24 * 60 * 60 * 1000)
        : null,
    });

    const idempotencyKey = `plan-${userPlan.id}-activated`;
    await deliver({
      category: 'PLAN',
      template: 'PLAN_ACTIVATED',
      to: user.email ?? '',
      subject: content.subject,
      html: content.html,
      text: content.text,
      userId: user.id,
      idempotencyKey,
    });

    // El plan se activa al confirmarse el pago, muchas veces con la app cerrada:
    // sin este aviso el cliente no sabe que su saldo ya esta disponible.
    await pushToPhone({
      category: 'PLAN',
      userId: user.id,
      title: content.subject,
      body: `Ya tienes ${money(credit)} de saldo en tu billetera para tus próximos pedidos.`,
      actionUrl: '/wallet',
      channel: PUSH_CHANNEL.PLAN_UPDATES,
      template: PUSH_TEMPLATE.PLAN_ACTIVATED,
      idempotencyKey,
    });
  },

  /**
   * Copia del reclamo al consumidor + aviso al negocio.
   * INDECOPI exige entregar constancia al consumidor; el aviso interno es para que
   * alguien lo atienda dentro del plazo.
   */
  async notifyComplaintReceived(complaint: Complaint): Promise<void> {
    const businessInfo = await settingsService.getBusinessInfo();
    const content = TEMPLATES.COMPLAINT_RECEIVED({
      code: complaint.code ?? '',
      type: complaint.type,
      consumerName: complaint.consumerName,
      dueAt: complaint.dueAt.toLocaleDateString('es-PE'),
    });

    await deliver({
      category: 'COMPLAINT',
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
      category: 'COMPLAINT',
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

    // La clave incluye respondedAt: si se responde otra vez (correccion), se reenvia.
    const idempotencyKey = `complaint-${complaint.id}-responded-${complaint.respondedAt?.getTime() ?? 'x'}`;
    await deliver({
      category: 'COMPLAINT',
      template: 'COMPLAINT_RESPONDED',
      to: complaint.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      userId: complaint.userId,
      idempotencyKey,
    });

    // Un reclamo tiene plazo legal de respuesta: el consumidor tiene que enterarse
    // el mismo dia, no cuando se le ocurra revisar el correo.
    await pushToPhone({
      category: 'COMPLAINT',
      userId: complaint.userId,
      title: content.subject,
      body: `Ya respondimos tu ${complaint.type === 'QUEJA' ? 'queja' : 'reclamo'} ${complaint.code ?? ''}. Entra a la app para leer la respuesta completa.`,
      actionUrl: '/support',
      channel: PUSH_CHANNEL.SUPPORT,
      template: PUSH_TEMPLATE.COMPLAINT_RESPONDED,
      idempotencyKey,
    });
  },

  /** Enlace de recuperacion de contrasena. El token en claro solo viaja en este correo. */
  async notifyPasswordReset(
    userId: number,
    rawToken: string,
    ttlMinutes: number,
    client: 'WEB' | 'MOBILE' = 'WEB',
  ): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.email) return;

    const base = env.FRONTEND_URL.replace(/\/$/, '');
    const resetUrl = client === 'MOBILE'
      ? `${base}/restablecer-clave/movil?token=${rawToken}`
      : `${base}/restablecer-clave?token=${rawToken}`;
    const content = TEMPLATES.PASSWORD_RESET({
      customerName: user.firstName,
      resetUrl,
      ttlMinutes,
    });

    await deliver({
      category: 'SECURITY',
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

  /**
   * Avisos que ve el cliente en su campana (web y movil).
   *
   * Se deja fuera el canal PUSH: cada aviso push guarda una fila por telefono para
   * no repetir el envio, pero es el mismo aviso que ya figura como IN_APP. Sin este
   * filtro, quien tenga dos telefonos ve el mismo texto tres veces.
   */
  async listForUser(userId: number) {
    return Notification.findAll({
      where: { userId, channel: { [Op.ne]: 'PUSH' } },
      include: [{ model: Order, as: 'order', attributes: ['orderNumber', 'status'] }],
      order: [['id', 'DESC']],
      limit: 50,
    });
  },

  async markAllRead(userId: number): Promise<void> {
    await Notification.update({ readAt: new Date() }, { where: { userId, readAt: null } });
  },
};

export type NotificationsService = typeof notificationsService;
