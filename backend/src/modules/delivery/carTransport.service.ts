import { Op, type Transaction } from 'sequelize';
import { Branch, Delivery, DeliverySlot, Driver, Order, Product, sequelize } from '@database/models';
import type { VehicleType } from '@database/models/driver.model';
import { ApiError } from '@shared/errors/ApiError';

const released = ['CANCELLED', 'REFUNDED'];
export const carTransport = {
  async requiresCar(productIds: number[], deliveryType: string) {
    return deliveryType === 'DELIVERY' && await Product.count({ where: { id: [...new Set(productIds)], family: 'CAKE' } }) > 0;
  },
  async hasFleet(branchId: number, transaction?: Transaction) {
    return await Driver.count({ where: { branchId, isActive: true, vehicleType: 'CAR' }, transaction }) > 0;
  },
  async booked(slotId: number, transaction?: Transaction) {
    return Order.count({ where: { deliverySlotId: slotId, deliveryVehicleType: 'CAR', status: { [Op.notIn]: released } }, transaction });
  },
  /** Called while holding the slot lock in checkout; pickup uses only the general capacity. */
  async assertSlot(slot: DeliverySlot, branchId: number, transaction?: Transaction, zoneId?: number | null) {
    if (slot.coverageZoneId && slot.coverageZoneId !== zoneId) throw ApiError.unprocessable('Esta franja no atiende tu zona de entrega');
    if (!await carTransport.hasFleet(branchId, transaction)) throw ApiError.unprocessable('No hay transporte en auto configurado para este taller. Puedes elegir recojo en taller.');
    if (Number(slot.carCapacity) <= await carTransport.booked(slot.id, transaction))
      throw ApiError.unprocessable('Se agotaron los cupos de entrega en auto. Elige otro horario o recojo en taller.');
  },
  async settings(branchId: number) {
    const branch = await Branch.findByPk(branchId);
    if (!branch) throw ApiError.notFound('Taller no encontrado');
    const slots = await DeliverySlot.findAll({ where: { branchId, isActive: true, orderCutoffAt: { [Op.gt]: new Date() } }, order: [['startsAt', 'ASC']], limit: 100 });
    return { instructions: branch.carDeliveryInstructions, defaultCarCapacity: branch.defaultCarCapacity, hasCars: await carTransport.hasFleet(branchId),
      slots: await Promise.all(slots.map(async (slot) => ({ id: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt,
        capacity: slot.capacity, carCapacity: slot.carCapacity, booked: await carTransport.booked(slot.id) }))) };
  },
  async updateSettings(branchId: number, input: { instructions?: string; defaultCarCapacity?: number; slots?: Array<{ id: number; carCapacity: number }> }) {
    return sequelize.transaction(async (transaction) => {
      const branch = await Branch.findByPk(branchId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!branch) throw ApiError.notFound('Taller no encontrado');
      if (input.defaultCarCapacity !== undefined && (!Number.isSafeInteger(input.defaultCarCapacity) || input.defaultCarCapacity < 0 || input.defaultCarCapacity > 500)) throw ApiError.unprocessable('Indica un cupo predeterminado entre 0 y 500');
      if (input.instructions !== undefined) branch.carDeliveryInstructions = input.instructions;
      if (input.defaultCarCapacity !== undefined) branch.defaultCarCapacity = input.defaultCarCapacity;
      if (input.instructions !== undefined || input.defaultCarCapacity !== undefined) await branch.save({ transaction });
      for (const change of [...(input.slots ?? [])].sort((a, b) => a.id - b.id)) {
        const slot = await DeliverySlot.findOne({ where: { id: change.id, branchId, isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
        if (!slot) throw ApiError.notFound('Franja no encontrada en este taller');
        if (change.carCapacity > slot.capacity) throw ApiError.unprocessable('Los cupos de auto no pueden superar la capacidad total de la franja');
        if (change.carCapacity < await carTransport.booked(slot.id, transaction)) throw ApiError.unprocessable('La franja ya tiene más entregas en auto reservadas que el nuevo límite');
        slot.carCapacity = change.carCapacity;
        await slot.save({ transaction });
      }
    });
  },
  async updateDriver(id: number, branchId: number, input: { vehicleType: VehicleType; vehicle?: string | null; status?: 'AVAILABLE' | 'BUSY' | 'OFFLINE'; maxActiveDeliveries?: number }) {
    return sequelize.transaction(async (transaction) => {
      const driver = await Driver.findOne({ where: { id, branchId, isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!driver) throw ApiError.notFound('Conductor no encontrado');
      if (driver.vehicleType === 'CAR' && input.vehicleType !== 'CAR') {
        const active = await Delivery.count({ where: { driverId: id, status: ['ASSIGNED', 'PICKED_UP', 'ON_ROUTE'] }, transaction });
        if (active) throw ApiError.unprocessable('Reasigna las entregas del conductor antes de cambiar su vehículo');
        const others = await Driver.count({ where: { id: { [Op.ne]: id }, branchId, isActive: true, vehicleType: 'CAR' }, transaction });
        if (!others && await Order.count({ where: { branchId, deliveryVehicleType: 'CAR', status: { [Op.notIn]: [...released, 'DELIVERED'] } }, transaction }))
          throw ApiError.unprocessable('Registra otro auto antes de retirar el último: hay entregas comprometidas');
      }
      driver.vehicleType = input.vehicleType;
      if (input.vehicle !== undefined) driver.vehicle = input.vehicle;
      if (input.status !== undefined) driver.status = input.status;
      if (input.maxActiveDeliveries !== undefined) driver.maxActiveDeliveries = input.maxActiveDeliveries;
      await driver.save({ transaction });
      return driver;
    });
  },
};
