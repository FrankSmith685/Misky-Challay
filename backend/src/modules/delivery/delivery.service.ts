import { Op, Transaction } from 'sequelize';
import {
  Delivery,
  DeliveryEvent,
  DeliveryEvidence,
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
import { cakeProductionService } from '@modules/cakes/cakeProduction.service';
import { operationsService } from '@modules/operations/operations.service';

/** El estado del reparto arrastra al del pedido. */
const ORDER_STATUS_FOR_DELIVERY: Partial<Record<DeliveryStatus, string>> = {
  ON_ROUTE: ORDER_STATUS.OUT_FOR_DELIVERY,
  DELIVERED: ORDER_STATUS.DELIVERED,
};

/** Estados en los que todavia tiene sentido cambiar de repartidor. */
const REASSIGNABLE: DeliveryStatus[] = [
  DELIVERY_STATUS.ASSIGNED,
  DELIVERY_STATUS.PICKED_UP,
  DELIVERY_STATUS.ON_ROUTE,
];

/** Un reparto cuenta como carga del repartidor mientras no se cierre. */
const OPEN_FOR_DRIVER: DeliveryStatus[] = [
  DELIVERY_STATUS.ASSIGNED,
  DELIVERY_STATUS.PICKED_UP,
  DELIVERY_STATUS.ON_ROUTE,
];

/**
 * Devuelve al repartidor a AVAILABLE, pero solo si no le queda ningun otro reparto
 * abierto: liberarlo a ciegas lo marcaba libre teniendo todavia dos entregas encima.
 * OFFLINE no se pisa nunca, porque eso lo decide el repartidor al cerrar turno.
 *
 * Quien llama tiene que haber guardado antes el reparto que acaba de cerrar o
 * reasignar: el recuento lee la tabla y ese ya no debe contarse.
 */
const releaseDriver = async (driverId: number, transaction: Transaction): Promise<void> => {
  const driver = await Driver.findByPk(driverId, { transaction });
  if (!driver || driver.status === DRIVER_STATUS.OFFLINE) return;

  const stillOpen = await Delivery.count({
    where: { driverId, status: { [Op.in]: OPEN_FOR_DRIVER } },
    transaction,
  });
  if (stillOpen > 0) return;

  driver.status = DRIVER_STATUS.AVAILABLE;
  await driver.save({ transaction });
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
        vehicleType: order.deliveryVehicleType ?? null,
      },
      { transaction },
    );

    await DeliveryEvent.create(
      { deliveryId: delivery.id, fromStatus: null, toStatus: DELIVERY_STATUS.PENDING },
      { transaction },
    );

    return delivery;
  },

  /**
   * Repartos pendientes o en curso de una sucursal (vista del despachador).
   *
   * `onlyDriverIds` acota el tablero al repartidor de calle. Sin ese filtro, el
   * tablero entregaba a cualquiera con `delivery.read` el nombre, el telefono, la
   * direccion exacta y el importe de TODOS los clientes de la sucursal, y ademas
   * permitia cerrar el reparto del companero. Un array vacio (cuenta de repartidor
   * sin fila en `drivers`) no devuelve nada, que es justo lo correcto.
   */
  async board(branchId: number, options: { onlyDriverIds?: number[] } = {}) {
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
        ...(options.onlyDriverIds ? { driverId: { [Op.in]: options.onlyDriverIds } } : {}),
      },
      include: [
        {
          model: Order,
          as: 'order',
          // `notes` es donde el cliente escribe "timbre malogrado, tocar la puerta":
          // sin ella el repartidor toca un timbre que no suena. La REFERENCIA, que
          // en Peru es lo que hace entregable el pedido, ya viaja dentro del snapshot.
          attributes: [
            'id',
            'orderNumber',
            'status',
            'contactName',
            'contactPhone',
            'notes',
            'addressSnapshotJson',
            'deliveryVehicleType',
            'deliveryHandlingInstructions',
            'grandTotal',
          ],
        },
        { model: Driver, as: 'driver', attributes: ['id', 'fullName', 'phone', 'vehicle', 'vehicleType'] },
      ],
      order: [['id', 'ASC']],
    });

    const photos = deliveries.length ? await DeliveryEvidence.findAll({ where: { deliveryId: deliveries.map((delivery) => delivery.id) }, attributes: ['deliveryId', 'stage'] }) : [];
    return deliveries.map((delivery) => ({ ...delivery.get({ plain: true }), evidence: photos.filter((photo) => photo.deliveryId === delivery.id).map((photo) => photo.stage) }));
  },

  async listDrivers(branchId: number) {
    return Driver.findAll({
      where: { branchId, isActive: true },
      order: [['fullName', 'ASC']],
    });
  },

  /**
   * Filas de `drivers` vinculadas a una cuenta (una por sucursal como mucho).
   *
   * `drivers.userId` es el UNICO vinculo entre la persona que inicia sesion y la
   * fila de la flota: sin el no se le puede asignar un reparto ni se puede saber
   * cuales son suyos. Lo puebla `accessService` al conceder el rol de repartidor;
   * mientras una cuenta no lo tenga, el tablero le sale vacio en vez de mostrarle
   * los repartos de los demas.
   */
  async driverIdsForUser(userId: number, branchId?: number): Promise<number[]> {
    const rows = await Driver.findAll({
      where: { userId, isActive: true, ...(branchId ? { branchId } : {}) },
      attributes: ['id'],
    });
    return rows.map((row) => row.id);
  },

  /**
   * Asigna —o REASIGNA— un repartidor propio.
   *
   * La reasignacion no puede pasar por `changeStatus`: `DELIVERY_FLOW.ASSIGNED` no
   * admite ASSIGNED, asi que cambiar de repartidor devolvia 422 y con la moto
   * pinchada el pedido se quedaba clavado en ese repartidor el resto del turno.
   * Aqui el estado NO se toca (sigue asignado, recogido o en ruta): lo que cambia
   * es quien lo lleva, y eso se registra como evento propio con su motivo.
   */
  async assignDriver(
    deliveryId: number,
    driverId: number,
    actorId: number,
    scope?: BranchScopeCheck,
    reason?: string,
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

    // Idempotente: reenviar la misma asignacion no genera evento ni toca a nadie.
    if (delivery.driverId === driverId && delivery.status !== DELIVERY_STATUS.PENDING) {
      return delivery;
    }

    const isReassignment = delivery.status !== DELIVERY_STATUS.PENDING;
    if (isReassignment && !REASSIGNABLE.includes(delivery.status)) {
      throw ApiError.unprocessable('Ese reparto ya esta cerrado: no se puede cambiar de repartidor');
    }

    return sequelize.transaction(async (transaction) => {
      const previousDriverId = delivery.driverId;
      const currentDriver = await Driver.findByPk(driverId, { transaction, lock: transaction.LOCK.UPDATE });
      const order = await Order.findByPk(delivery.orderId, { transaction });
      if (!currentDriver?.isActive || currentDriver.status === 'OFFLINE') throw ApiError.unprocessable('El conductor ya no está disponible');
      if (order?.deliveryVehicleType === 'CAR' && currentDriver.vehicleType !== 'CAR') throw ApiError.unprocessable('Esta torta requiere un conductor con auto. No se permite asignar una moto u otro vehículo.');
      delivery.vehicleType = currentDriver.vehicleType;

      if (isReassignment) {
        delivery.driverId = driverId;
        // Pasar a flota propia: si venia de un proveedor externo, ya no lo lleva el.
        delivery.carrier = DELIVERY_CARRIER.OWN;
        delivery.assignedAt = new Date(); // el reloj de la entrega arranca de nuevo
        await delivery.save({ transaction });

        await DeliveryEvent.create(
          {
            deliveryId: delivery.id,
            fromStatus: delivery.status,
            toStatus: delivery.status,
            actorId,
            comment: `Reasignado a ${driver.fullName}${reason ? `: ${reason}` : ''}`.slice(0, 255),
          },
          { transaction },
        );
      } else {
        await deliveryService.changeStatus(
          delivery,
          DELIVERY_STATUS.ASSIGNED,
          actorId,
          transaction,
          {
            driverId,
            comment: `Asignado a ${driver.fullName}${reason ? `: ${reason}` : ''}`.slice(0, 255),
          },
        );
      }

      driver.status = DRIVER_STATUS.BUSY;
      await driver.save({ transaction });

      // El anterior deja de cargar con este reparto. Se libera despues de guardar
      // el cambio, para que el recuento de `releaseDriver` ya no lo vea suyo.
      if (previousDriverId && previousDriverId !== driverId) {
        await releaseDriver(previousDriverId, transaction);
      }

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
    vehicleType?: string,
  ) {
    const delivery = await Delivery.findByPk(deliveryId);
    if (!delivery) throw ApiError.notFound('Reparto no encontrado');
    scope?.(delivery.branchId);

    return sequelize.transaction(async (transaction) => {
      const order = await Order.findByPk(delivery.orderId, { transaction });
      if (order?.deliveryVehicleType === 'CAR' && vehicleType !== 'CAR') throw ApiError.unprocessable('Confirma que el proveedor externo realizará la entrega en auto');
      delivery.carrier = DELIVERY_CARRIER.EXTERNAL;
      delivery.vehicleType = vehicleType ?? null;
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
    /** Null cuando el cambio no lo pide una persona (cancelacion del pedido). */
    actorId: number | null,
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
      let order: Order | null = null;
      if ([DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.ON_ROUTE, DELIVERY_STATUS.DELIVERED].includes(next as 'PICKED_UP' | 'ON_ROUTE' | 'DELIVERED')) {
        order = await Order.findByPk(delivery.orderId, { transaction });
        if (order?.deliveryVehicleType === 'CAR') {
          const assignedDriver = delivery.driverId ? await Driver.findByPk(delivery.driverId, { transaction }) : null;
          const actualVehicle = delivery.carrier === DELIVERY_CARRIER.OWN ? assignedDriver?.vehicleType : delivery.vehicleType;
          if (actualVehicle !== 'CAR') throw ApiError.unprocessable('Verifica la asignación de un auto antes de trasladar esta torta');
        }
      }

      // Asignar un repartidor mientras Cocina prepara sirve para ganar tiempo,
      // pero el retiro fisico solo puede ocurrir cuando el pedido esta READY.
      // La interfaz tambien lo bloquea; esta comprobacion es la frontera real para
      // clientes antiguos, integraciones o llamadas directas al endpoint.
      if (next === DELIVERY_STATUS.PICKED_UP) {
        order = await Order.findByPk(delivery.orderId, { transaction });
        if (!order) throw ApiError.notFound('El pedido del reparto no existe');
        if (order.status !== ORDER_STATUS.READY) {
          throw ApiError.unprocessable('Cocina todavia no ha marcado el pedido como listo');
        }
        await cakeProductionService.assertDispatchComplete(order.id, transaction);
        await operationsService.dispatchTicketForOrder(
          order.id,
          actorId,
          'Pedido entregado a Reparto',
          transaction,
        );
      }

      if (options.driverId) delivery.driverId = options.driverId;
      if (next === DELIVERY_STATUS.ASSIGNED) delivery.assignedAt = now;
      if (next === DELIVERY_STATUS.PICKED_UP) delivery.pickedUpAt = now;
      if (next === DELIVERY_STATUS.DELIVERED) {
        delivery.deliveredAt = now;
        delivery.proofJson = { ...delivery.proofJson, ...options.proof };
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
        await releaseDriver(delivery.driverId, transaction);
      }

      const nextOrderStatus = ORDER_STATUS_FOR_DELIVERY[next];
      if (nextOrderStatus) {
        order ??= await Order.findByPk(delivery.orderId, { transaction });
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

  /**
   * Avance pedido desde la calle.
   *
   * `onlyDriverIds` es el blindaje por PROPIEDAD: el alcance por sucursal no basta,
   * porque todos los repartidores de una cocina comparten sucursal y bastaba iterar
   * el id de la URL para marcar "Entregado" el reparto de otro.
   */
  async advance(
    deliveryId: number,
    next: DeliveryStatus,
    actorId: number,
    comment?: string,
    scope?: BranchScopeCheck,
    options: { onlyDriverIds?: number[]; proof?: Record<string, unknown> } = {},
  ) {
    const delivery = await Delivery.findByPk(deliveryId);
    if (!delivery) throw ApiError.notFound('Reparto no encontrado');
    scope?.(delivery.branchId);

    if (
      options.onlyDriverIds &&
      (delivery.driverId === null || !options.onlyDriverIds.includes(delivery.driverId))
    ) {
      throw ApiError.forbidden('Ese reparto esta asignado a otro repartidor');
    }

    return deliveryService.changeStatus(delivery, next, actorId, undefined, {
      comment,
      proof: options.proof,
      // El motivo es lo UNICO que explica por que no se pudo entregar. Viajaba solo
      // como comentario del evento y `failureReason` se quedaba en el texto por
      // defecto, asi que la ficha del reparto no decia nada util.
      failureReason: next === DELIVERY_STATUS.FAILED ? comment : undefined,
    });
  },

  /**
   * Cierra el reparto de un pedido que se cancela. Lo llama el modulo de pedidos
   * dentro de SU transaccion (paquete F).
   *
   * IDEMPOTENTE: sin reparto, o ya cerrado, no hace nada y no lanza. Cancelar dos
   * veces el mismo pedido no puede reventar ni liberar dos veces al repartidor.
   *
   * FAILED no arrastra el estado del pedido (no esta en ORDER_STATUS_FOR_DELIVERY),
   * asi que llamarlo desde la cancelacion del pedido no reentra en
   * `ordersService.changeStatus`.
   */
  async abortForOrder(orderId: number, reason: string, transaction?: Transaction): Promise<void> {
    const run = async (t: Transaction) => {
      const delivery = await Delivery.findOne({ where: { orderId }, transaction: t });
      if (!delivery) return;

      // DELIVERED y FAILED son terminales: no hay nada que abortar.
      const current: DeliveryStatus = delivery.status;
      if (!(DELIVERY_FLOW[current] ?? []).includes(DELIVERY_STATUS.FAILED)) return;

      await deliveryService.changeStatus(delivery, DELIVERY_STATUS.FAILED, null, t, {
        comment: reason,
        failureReason: reason,
      });
    };

    if (transaction) await run(transaction);
    else await sequelize.transaction(run);
  },
};

export type DeliveryService = typeof deliveryService;

/**
 * Contrato compartido con el modulo de pedidos, tambien como export suelto: al
 * cancelar un pedido hay que cerrar su reparto SIEMPRE, y una importacion directa
 * deja claro que es una dependencia del flujo de cancelacion y no una opcion.
 */
export const abortForOrder = deliveryService.abortForOrder;
