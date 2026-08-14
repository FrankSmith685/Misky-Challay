import {
  Branch,
  BranchProductAvailability,
  Product,
  ProductAvailabilitySubscription,
  User,
} from '@database/models';
import { AVAILABILITY_SUBSCRIPTION_STATUS } from '@database/models/productAvailabilitySubscription.model';
import { PRODUCT_STATUS } from '@database/models/product.model';
import { ApiError } from '@shared/errors/ApiError';
import { logger } from '@config/logger';
import { settingsService } from '@modules/settings/settings.service';
import { notificationsService } from '@modules/notifications/notifications.service';

export const availabilityAlertsService = {
  async get(userId: number, productId: number, branchId: number) {
    return ProductAvailabilitySubscription.findOne({
      where: { userId, productId, branchId },
      attributes: ['id', 'productId', 'branchId', 'notifyEmail', 'notifyInApp', 'status', 'notifiedAt', 'createdAt'],
    });
  },

  async subscribe(input: {
    userId: number;
    productId: number;
    branchId: number;
    notifyEmail: boolean;
    notifyInApp: boolean;
  }) {
    if (!input.notifyEmail && !input.notifyInApp) {
      throw ApiError.badRequest('Elige al menos un canal para recibir el aviso');
    }

    const settings = await settingsService.getCommunicationSettings();
    if (!settings.availabilityAlertsEnabled) {
      throw ApiError.conflict('Las alertas de disponibilidad estan pausadas temporalmente');
    }

    const [user, product, branch, availability] = await Promise.all([
      User.findByPk(input.userId),
      Product.findOne({ where: { id: input.productId, status: PRODUCT_STATUS.ACTIVE } }),
      Branch.findOne({ where: { id: input.branchId, isActive: true } }),
      BranchProductAvailability.findOne({
        where: { productId: input.productId, branchId: input.branchId },
      }),
    ]);

    if (!user) throw ApiError.unauthorized();
    if (!product) throw ApiError.notFound('Producto no encontrado');
    if (!branch) throw ApiError.notFound('Local no encontrado');
    if (input.notifyEmail && !user.email) {
      throw ApiError.badRequest('Agrega un correo a tu cuenta o elige solo la notificacion web');
    }
    if (!availability || availability.isAvailable) {
      throw ApiError.conflict('El plato ya esta disponible en el local seleccionado');
    }

    const [subscription] = await ProductAvailabilitySubscription.findOrCreate({
      where: { userId: input.userId, productId: input.productId, branchId: input.branchId },
      defaults: {
        userId: input.userId,
        productId: input.productId,
        branchId: input.branchId,
        notifyEmail: input.notifyEmail,
        notifyInApp: input.notifyInApp,
      },
    });

    await subscription.update({
      notifyEmail: input.notifyEmail,
      notifyInApp: input.notifyInApp,
      status: AVAILABILITY_SUBSCRIPTION_STATUS.WAITING,
      notifiedAt: null,
      cancelledAt: null,
    });
    return subscription;
  },

  async cancel(userId: number, productId: number, branchId: number): Promise<void> {
    const subscription = await ProductAvailabilitySubscription.findOne({
      where: { userId, productId, branchId },
    });
    if (!subscription) return;
    await subscription.update({
      status: AVAILABILITY_SUBSCRIPTION_STATUS.CANCELLED,
      cancelledAt: new Date(),
    });
  },

  /** Procesa solamente solicitudes pendientes y las cierra cuando al menos un canal se entrego. */
  async notifyWaiting(productId: number, branchId: number): Promise<void> {
    const [branch, subscriptions] = await Promise.all([
      Branch.findByPk(branchId),
      ProductAvailabilitySubscription.findAll({
        where: { productId, branchId, status: AVAILABILITY_SUBSCRIPTION_STATUS.WAITING },
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
      }),
    ]);
    if (!branch || subscriptions.length === 0) return;

    await Promise.all(subscriptions.map(async (subscription) => {
      const user = subscription.get('user') as User | undefined;
      if (!user) return;
      try {
        const delivered = await notificationsService.notifyProductAvailable({
          subscriptionId: subscription.id,
          userId: subscription.userId,
          productId,
          branchName: branch.name,
          email: user.email ?? '',
          notifyEmail: subscription.notifyEmail,
          notifyInApp: subscription.notifyInApp,
        });
        if (delivered) {
          await subscription.update({
            status: AVAILABILITY_SUBSCRIPTION_STATUS.NOTIFIED,
            notifiedAt: new Date(),
            cancelledAt: new Date(),
          });
        }
      } catch (error) {
        logger.error(`No se pudo procesar la alerta de disponibilidad ${subscription.id}`, error);
      }
    }));
  },
};

export type AvailabilityAlertsService = typeof availabilityAlertsService;
