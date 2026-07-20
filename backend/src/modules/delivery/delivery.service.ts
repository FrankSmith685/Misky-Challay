import { Op, Transaction } from 'sequelize';
import {
  Delivery,
  DeliveryEvent,
  Driver,
  Order,
  sequelize,
} from '@database/models';
import {
  DELIVERY_CARRIER,
  DELIVERY_FLOW,
  DELIVERY_STATUS,
  type DeliveryStatus,
} from '@database/models/delivery.model';
import { DRIVER_STATUS } from '@database/models/driver.model';
import { DELIVERY_TYPE, ORDER_STATUS } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import type { BranchScopeCheck } from '@shared/utils/scope';
import { ordersService } from '@modules/orders/orders.service';

/** El estado del reparto arrastra al del pedido. */
const ORDER_STATUS_FOR_DELIVERY: Partial<Record<DeliveryStatus, string>> = {
  ON_ROUTE: ORDER_STATUS.OUT_FOR_DELIVERY,
  DELIVERED: ORDER_STATUS.DELIVERED,
};

export const deliveryService = {
  /** Se crea junto con el ticket de cocina, solo si el pedido es delivery. */
  async openForOrder(order: Order, transaction: Transaction): Promise<Delivery | null> {
    if (order.deliveryType !== DELIVERY_TYPE.DELIVERY) return null;

    const existing = await Delivery.findOne({ where: { orderId: order.id }, transaction });
    if (existing) return existing;

    const delivery = await Delivery.create(
      {
        orderId: order.id,
        branchId: order.branchId,
        carrier: DELIVERY_CARRIER.OWN,
        status: DELIVERY_STATUS.PENDING,
        cost: Number(order.deliveryFee),
      },
      { transaction },
    );

    await DeliveryEvent.create(
      { deliveryId: delivery.id, fromStatus: null, toStatus: DELIVERY_STATUS.PENDING },
      { transaction },
    );

    return delivery;
  },

  /** Repartos pendientes o en curso de una sucursal (vista del despachador). */
  async board(branchId: number) {
    const deliveries = await Delivery.findAll({
      where: {
        branchId,
        status: {
          [Op.in]: [
            DELIVERY_STATUS.PENDING,
            DELIVERY_STATUS.ASSIGNED,
            DELIVERY_STATUS.PICKED_UP,
            DELIVERY_STATUS.ON_ROUTE,
          ],
        },
      },
      include: [
        {
          model: Order,
          as: 'order',
          attributes: ['id', 'orderNumber', 'status', 'contactName', 'contactPhone', 'addressSnapshotJson', 'grandTotal'],
        },
        { model: Driver, as: 'driver', attributes: ['id', 'fullName', 'phone', 'vehicle'] },
      ],
      order: [['id', 'ASC']],
    });

    return deliveries;
  },

  async listDrivers(branchId: number) {
    return Driver.findAll({
      where: { branchId, isActive: true },
      order: [['fullName', 'ASC']],
    });
  },

  /** Asigna un repartidor propio. El pedido debe estar listo o en preparacion. */
  async assignDriver(
    deliveryId: number,
    driverId: number,
    actorId: number,
    scope?: BranchScopeCheck,
  ) {
    const delivery = await Delivery.findByPk(deliveryId);
    if (!delivery) throw ApiError.notFound('Reparto no encontrado');
    scope?.(delivery.branchId);

    const driver = await Driver.findOne({
      where: { id: driverId, branchId: delivery.branchId, isActive: true },
    });
    if (!driver) throw ApiError.notFound('Repartidor no encontrado en esta sucursal');
    if (driver.status === DRIVER_STATUS.OFFLINE) {
      throw ApiError.unprocessable('Ese repartidor no esta disponible');
    }

    return sequelize.transaction(async (transaction) => {
      await deliveryService.changeStatus(delivery, DELIVERY_STATUS.ASSIGNED, actorId, transaction, {
        driverId,
        comment: `Asignado a ${driver.fullName}`,
      });

      driver.status = DRIVER_STATUS.BUSY;
      await driver.save({ transaction });

      return delivery;
    });
  },

  /** Delivery con proveedor externo: se guarda su referencia para el seguimiento. */
  async assignExternal(
    deliveryId: number,
    provider: string,
    reference: string,
    actorId: number,
    scope?: BranchScopeCheck,
  ) {
    const delivery = await Delivery.findByPk(deliveryId);
    if (!delivery) throw ApiError.notFound('Reparto no encontrado');
    scope?.(delivery.branchId);

    return sequelize.transaction(async (transaction) => {
      delivery.carrier = DELIVERY_CARRIER.EXTERNAL;
      delivery.externalProvider = provider;
      delivery.externalReference = reference;
      await delivery.save({ transaction });

      await deliveryService.changeStatus(delivery, DELIVERY_STATUS.ASSIGNED, actorId, transaction, {
        comment: `Asignado a ${provider} (${reference})`,
      });

      return delivery;
    });
  },

  /**
   * Avanza el reparto validando la transicion y arrastrando el estado del pedido.
   * Al entregar, libera al repartidor y cierra el pedido (DELIVERED).
   */
  async changeStatus(
    delivery: Delivery,
    next: DeliveryStatus,
    actorId: number,
    externalTransaction?: Transaction,
    options: {
      driverId?: number;
      comment?: string;
      proof?: Record<string, unknown>;
      failureReason?: string;
    } = {},
  ): Promise<Delivery> {
    const current: DeliveryStatus = delivery.status;
    const allowed = DELIVERY_FLOW[current] ?? [];

    if (!allowed.includes(next)) {
      throw ApiError.unprocessable(`No se puede pasar el reparto de ${current} a ${next}`);
    }

    const run = async (transaction: Transaction) => {
      const now = new Date();

      if (options.driverId) delivery.driverId = options.driverId;
      if (next === DELIVERY_STATUS.ASSIGNED) delivery.assignedAt = now;
      if (next === DELIVERY_STATUS.PICKED_UP) delivery.pickedUpAt = now;
      if (next === DELIVERY_STATUS.DELIVERED) {
        delivery.deliveredAt = now;
        delivery.proofJson = options.proof ?? null;
      }
      if (next === DELIVERY_STATUS.FAILED) {
        delivery.failureReason = options.failureReason ?? 'Entrega fallida';
      }

      delivery.status = next;
      await delivery.save({ transaction });

      await DeliveryEvent.create(
        {
          deliveryId: delivery.id,
          fromStatus: current,
          toStatus: next,
          actorId,
          comment: options.comment ?? null,
        },
        { transaction },
      );

      // Al cerrar el reparto, el repartidor vuelve a estar disponible.
      if (
        (next === DELIVERY_STATUS.DELIVERED || next === DELIVERY_STATUS.FAILED) &&
        delivery.driverId
      ) {
        const driver = await Driver.findByPk(delivery.driverId, { transaction });
        if (driver) {
          driver.status = DRIVER_STATUS.AVAILABLE;
          await driver.save({ transaction });
        }
      }

      const nextOrderStatus = ORDER_STATUS_FOR_DELIVERY[next];
      if (nextOrderStatus) {
        const order = await Order.findByPk(delivery.orderId, { transaction });
        if (order) {
          await ordersService.changeStatus(order, nextOrderStatus as never, {
            actorId,
            source: 'DELIVERY',
            comment: options.comment ?? null,
            transaction,
          });
        }
      }
    };

    if (externalTransaction) await run(externalTransaction);
    else await sequelize.transaction(run);

    return delivery;
  },

  async advance(
    deliveryId: number,
    next: DeliveryStatus,
    actorId: number,
    comment?: string,
    scope?: BranchScopeCheck,
  ) {
    const delivery = await Delivery.findByPk(deliveryId);
    if (!delivery) throw ApiError.notFound('Reparto no encontrado');
    scope?.(delivery.branchId);
    return deliveryService.changeStatus(delivery, next, actorId, undefined, { comment });
  },
};

export type DeliveryService = typeof deliveryService;
