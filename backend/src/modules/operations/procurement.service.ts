import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import {
  InventoryItem,
  InventoryLot,
  InventoryMovement,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  sequelize,
} from '@database/models';
import { MOVEMENT_TYPE } from '@database/models/inventoryMovement.model';
import { INVENTORY_LOT_STATUS, PURCHASE_ORDER_STATUS } from '@database/models/procurement.model';
import { ApiError } from '@shared/errors/ApiError';
import { inventoryService } from './inventory.service';
import { notificationsService } from '@modules/notifications/notifications.service';
import { PERMISSIONS } from '@config/constants';
import { zonedParts } from '@shared/utils/datetime';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const numberValue = (value: unknown): number => Number(value ?? 0);

const supplierShape = (supplier: Supplier) => ({
  id: supplier.id,
  code: supplier.code,
  name: supplier.name,
  taxId: supplier.taxId,
  contactName: supplier.contactName,
  email: supplier.email,
  phone: supplier.phone,
  address: supplier.address,
  paymentTermsDays: supplier.paymentTermsDays,
  notes: supplier.notes,
  isActive: supplier.isActive,
});

const orderShape = (order: PurchaseOrder) => ({
  id: order.id,
  orderNumber: order.orderNumber,
  branchId: order.branchId,
  supplierId: order.supplierId,
  supplier: order.supplier ? supplierShape(order.supplier) : null,
  status: order.status,
  orderedAt: order.orderedAt,
  expectedAt: order.expectedAt,
  receivedAt: order.receivedAt,
  notes: order.notes,
  subtotal: numberValue(order.subtotal),
  tax: numberValue(order.tax),
  total: numberValue(order.total),
  items: ((order.get('items') as PurchaseOrderItem[] | undefined) ?? []).map((line) => ({
    id: line.id,
    inventoryItemId: line.inventoryItemId,
    item: line.item ? { id: line.item.id, code: line.item.code, name: line.item.name, unit: line.item.unit } : null,
    quantityOrdered: numberValue(line.quantityOrdered),
    quantityReceived: numberValue(line.quantityReceived),
    unitCost: numberValue(line.unitCost),
    lotCode: line.lotCode,
    expiresAt: line.expiresAt,
    notes: line.notes,
  })),
});

export const procurementService = {
  async listSuppliers(includeInactive = false) {
    const rows = await Supplier.findAll({
      where: includeInactive ? undefined : { isActive: true },
      order: [['isActive', 'DESC'], ['name', 'ASC']],
    });
    return rows.map(supplierShape);
  },

  async createSupplier(input: {
    code?: string; name: string; taxId?: string | null; contactName?: string | null;
    email?: string | null; phone?: string | null; address?: string | null;
    paymentTermsDays?: number; notes?: string | null;
  }) {
    const code = input.code?.trim().toUpperCase() || `PROV-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    if (await Supplier.findOne({ where: { code } })) throw ApiError.conflict('Ya existe un proveedor con ese código');
    const supplier = await Supplier.create({
      code, name: input.name.trim(), taxId: input.taxId?.trim() || null,
      contactName: input.contactName?.trim() || null, email: input.email?.trim() || null,
      phone: input.phone?.trim() || null, address: input.address?.trim() || null,
      paymentTermsDays: Math.max(0, Number(input.paymentTermsDays ?? 0)), notes: input.notes?.trim() || null,
      isActive: true,
    });
    return supplierShape(supplier);
  },

  async updateSupplier(id: number, input: Partial<{
    code: string; name: string; taxId: string | null; contactName: string | null;
    email: string | null; phone: string | null; address: string | null;
    paymentTermsDays: number; notes: string | null; isActive: boolean;
  }>) {
    const supplier = await Supplier.findByPk(id);
    if (!supplier) throw ApiError.notFound('Proveedor no encontrado');
    if (input.code && input.code.trim().toUpperCase() !== supplier.code) {
      const duplicate = await Supplier.findOne({ where: { code: input.code.trim().toUpperCase(), id: { [Op.ne]: id } } });
      if (duplicate) throw ApiError.conflict('Ya existe un proveedor con ese código');
      supplier.code = input.code.trim().toUpperCase();
    }
    if (input.name !== undefined) supplier.name = input.name.trim();
    if (input.taxId !== undefined) supplier.taxId = input.taxId?.trim() || null;
    if (input.contactName !== undefined) supplier.contactName = input.contactName?.trim() || null;
    if (input.email !== undefined) supplier.email = input.email?.trim() || null;
    if (input.phone !== undefined) supplier.phone = input.phone?.trim() || null;
    if (input.address !== undefined) supplier.address = input.address?.trim() || null;
    if (input.paymentTermsDays !== undefined) supplier.paymentTermsDays = Math.max(0, Number(input.paymentTermsDays));
    if (input.notes !== undefined) supplier.notes = input.notes?.trim() || null;
    if (input.isActive !== undefined) supplier.isActive = input.isActive;
    await supplier.save();
    return supplierShape(supplier);
  },

  async listPurchaseOrders(branchId: number, status?: string) {
    const rows = await PurchaseOrder.findAll({
      where: { branchId, ...(status ? { status } : {}) },
      include: [
        { model: Supplier, as: 'supplier' },
        { model: PurchaseOrderItem, as: 'items', include: [{ model: InventoryItem, as: 'item' }] },
      ],
      order: [['createdAt', 'DESC']],
    });
    return rows.map(orderShape);
  },

  async getPurchaseOrder(id: number, branchId: number) {
    const order = await PurchaseOrder.findOne({
      where: { id, branchId },
      include: [
        { model: Supplier, as: 'supplier' },
        { model: PurchaseOrderItem, as: 'items', include: [{ model: InventoryItem, as: 'item' }] },
      ],
    });
    if (!order) throw ApiError.notFound('Orden de compra no encontrada');
    return orderShape(order);
  },

  /** Cancela solo la parte pendiente; lo recibido conserva lotes, stock y costo. */
  async cancelPurchaseOrder(input: { orderId: number; branchId: number; reason: string }) {
    await sequelize.transaction(async (transaction) => {
      const order = await PurchaseOrder.findOne({ where: { id: input.orderId, branchId: input.branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw ApiError.notFound('Orden de compra no encontrada');
      if (order.status !== PURCHASE_ORDER_STATUS.ORDERED && order.status !== PURCHASE_ORDER_STATUS.PARTIALLY_RECEIVED) {
        throw ApiError.conflict('Esta orden ya no tiene entregas pendientes para cancelar');
      }
      order.status = PURCHASE_ORDER_STATUS.CANCELLED;
      order.notes = [order.notes, `Saldo pendiente cancelado: ${input.reason.trim()}`].filter(Boolean).join('\n');
      await order.save({ transaction });
    });
    return this.getPurchaseOrder(input.orderId, input.branchId);
  },

  async createPurchaseOrder(input: {
    branchId: number; supplierId: number; actorId: number; expectedAt?: string | null;
    notes?: string | null; tax?: number; items: Array<{ inventoryItemId: number; quantity: number; unitCost: number; notes?: string | null }>;
  }) {
    if (!input.items.length) throw ApiError.badRequest('Agrega al menos un insumo a la compra');
    const distinct = new Set(input.items.map((line) => line.inventoryItemId));
    if (distinct.size !== input.items.length) throw ApiError.badRequest('No repitas un insumo en la misma orden');
    const supplier = await Supplier.findOne({ where: { id: input.supplierId, isActive: true } });
    if (!supplier) throw ApiError.notFound('Proveedor activo no encontrado');
    const itemRows = await InventoryItem.findAll({ where: { id: [...distinct], isActive: true } });
    if (itemRows.length !== distinct.size) throw ApiError.notFound('Uno de los insumos no existe o está inactivo');
    for (const line of input.items) {
      if (!(line.quantity > 0) || line.unitCost < 0) throw ApiError.badRequest('Cantidad y costo deben ser válidos');
    }
    const subtotal = round2(input.items.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
    const tax = round2(Math.max(0, input.tax ?? 0));
    const total = round2(subtotal + tax);
    const date = new Date();
    const orderNumber = `OC-${zonedParts(date).isoDate.replace(/-/g, '')}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const order = await sequelize.transaction(async (transaction) => {
      const created = await PurchaseOrder.create({
        orderNumber, branchId: input.branchId, supplierId: input.supplierId,
        status: PURCHASE_ORDER_STATUS.ORDERED, orderedAt: date,
        // Mediodía UTC conserva la fecha elegida al mostrarse en hora de Perú.
        expectedAt: input.expectedAt ? new Date(`${input.expectedAt}T12:00:00Z`) : null,
        notes: input.notes?.trim() || null, subtotal, tax, total, createdBy: input.actorId,
      }, { transaction });
      await PurchaseOrderItem.bulkCreate(input.items.map((line) => ({
        purchaseOrderId: created.id, inventoryItemId: line.inventoryItemId,
        quantityOrdered: line.quantity, quantityReceived: 0, unitCost: line.unitCost,
        notes: line.notes?.trim() || null,
      })), { transaction });
      return created;
    });
    return this.getPurchaseOrder(order.id, input.branchId);
  },

  /** Una orden se corrige mientras todavía no se haya recibido ningún lote. */
  async updatePurchaseOrder(input: {
    orderId: number; branchId: number; supplierId: number; expectedAt?: string | null;
    notes?: string | null; tax?: number; items: Array<{ inventoryItemId: number; quantity: number; unitCost: number; notes?: string | null }>;
  }) {
    if (!input.items.length) throw ApiError.badRequest('Agrega al menos un insumo a la compra');
    const distinct = new Set(input.items.map((line) => line.inventoryItemId));
    if (distinct.size !== input.items.length) throw ApiError.badRequest('No repitas un insumo en la misma orden');
    if (input.items.some((line) => !(line.quantity > 0) || line.unitCost < 0)) throw ApiError.badRequest('Cantidad y costo deben ser válidos');
    const supplier = await Supplier.findByPk(input.supplierId);
    if (!supplier) throw ApiError.notFound('Proveedor no encontrado');
    const itemRows = await InventoryItem.findAll({ where: { id: [...distinct], isActive: true } });
    if (itemRows.length !== distinct.size) throw ApiError.notFound('Uno de los insumos no existe o está inactivo');
    await sequelize.transaction(async (transaction) => {
      const order = await PurchaseOrder.findOne({ where: { id: input.orderId, branchId: input.branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw ApiError.notFound('Orden de compra no encontrada');
      if (order.status !== PURCHASE_ORDER_STATUS.ORDERED) throw ApiError.conflict('Solo se puede editar una orden sin recepciones');
      if (!supplier.isActive && supplier.id !== order.supplierId) throw ApiError.conflict('Selecciona un proveedor activo');
      const [received, lots] = await Promise.all([
        PurchaseOrderItem.count({ where: { purchaseOrderId: order.id, quantityReceived: { [Op.gt]: 0 } }, transaction }),
        InventoryLot.count({ where: { purchaseOrderId: order.id }, transaction }),
      ]);
      if (received || lots) throw ApiError.conflict('La orden ya tiene lotes recibidos. Conserva ese historial y crea una nueva orden para cambios posteriores.');
      const subtotal = round2(input.items.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
      const tax = round2(input.tax ?? 0);
      await order.update({
        supplierId: input.supplierId, expectedAt: input.expectedAt ? new Date(`${input.expectedAt}T12:00:00Z`) : null,
        notes: input.notes?.trim() || null, subtotal, tax, total: round2(subtotal + tax),
      }, { transaction });
      await PurchaseOrderItem.destroy({ where: { purchaseOrderId: order.id }, transaction });
      await PurchaseOrderItem.bulkCreate(input.items.map((line) => ({
        purchaseOrderId: order.id, inventoryItemId: line.inventoryItemId,
        quantityOrdered: line.quantity, quantityReceived: 0, unitCost: line.unitCost,
        notes: line.notes?.trim() || null,
      })), { transaction });
    });
    return this.getPurchaseOrder(input.orderId, input.branchId);
  },

  async receivePurchaseOrder(input: {
    branchId: number; orderId: number; actorId: number;
    lines: Array<{ purchaseOrderItemId: number; quantity: number; lotCode: string; expiresAt?: string | null; unitCost?: number }>;
  }) {
    if (!input.lines.length) throw ApiError.badRequest('Agrega al menos un lote recibido');
    const received = await sequelize.transaction(async (transaction) => {
      const order = await PurchaseOrder.findOne({
        where: { id: input.orderId, branchId: input.branchId },
        include: [{ model: Supplier, as: 'supplier' }, { model: PurchaseOrderItem, as: 'items', include: [{ model: InventoryItem, as: 'item' }] }],
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!order) throw ApiError.notFound('Orden de compra no encontrada');
      if ([PURCHASE_ORDER_STATUS.CANCELLED, PURCHASE_ORDER_STATUS.RECEIVED].includes(order.status as 'CANCELLED' | 'RECEIVED')) throw ApiError.conflict('La orden ya no admite recepción');
      const items = (order.get('items') as PurchaseOrderItem[] | undefined) ?? [];
      const byId = new Map(items.map((line) => [line.id, line]));
      for (const line of input.lines) {
        if (!(line.quantity > 0) || !line.lotCode.trim()) throw ApiError.badRequest('Cada recepción requiere cantidad y código de lote');
        if (line.expiresAt && line.expiresAt < zonedParts(new Date()).isoDate) throw ApiError.badRequest('No se puede recibir un lote vencido');
        const item = byId.get(line.purchaseOrderItemId);
        if (!item) throw ApiError.notFound('Línea de compra no encontrada');
        const remaining = round2(numberValue(item.quantityOrdered) - numberValue(item.quantityReceived));
        if (line.quantity > remaining) throw ApiError.unprocessable(`La recepción supera lo pendiente para ${item.item?.name ?? 'el insumo'}`);
        const lotCode = line.lotCode.trim();
        const duplicate = await InventoryLot.findOne({ where: { branchId: input.branchId, inventoryItemId: item.inventoryItemId, lotCode }, transaction, lock: transaction.LOCK.UPDATE });
        if (duplicate) throw ApiError.conflict(`El lote ${lotCode} ya existe para este insumo`);
        const unitCost = line.unitCost ?? numberValue(item.unitCost);
        if (unitCost < 0) throw ApiError.badRequest('El costo unitario no puede ser negativo');
        const lot = await InventoryLot.create({
          branchId: input.branchId, inventoryItemId: item.inventoryItemId, supplierId: order.supplierId,
          purchaseOrderId: order.id, purchaseOrderItemId: item.id, lotCode,
          receivedAt: new Date(), expiresAt: line.expiresAt ? new Date(line.expiresAt) : null,
          quantityReceived: line.quantity, quantityAvailable: line.quantity, unitCost,
          status: INVENTORY_LOT_STATUS.ACTIVE,
        }, { transaction });
        await inventoryService.receiveLot({ branchId: input.branchId, inventoryItemId: item.inventoryItemId, lotId: lot.id, quantity: line.quantity, unitCost, purchaseOrderId: order.id, actorId: input.actorId, reason: `Recepción ${order.orderNumber} · lote ${lotCode}` }, transaction);
        item.quantityReceived = round2(numberValue(item.quantityReceived) + line.quantity);
        item.lotCode = lotCode;
        item.expiresAt = line.expiresAt ? new Date(line.expiresAt) : null;
        await item.save({ transaction });
      }
      const complete = items.every((item) => numberValue(item.quantityReceived) >= numberValue(item.quantityOrdered));
      order.status = complete ? PURCHASE_ORDER_STATUS.RECEIVED : PURCHASE_ORDER_STATUS.PARTIALLY_RECEIVED;
      if (complete) order.receivedAt = new Date();
      order.receivedBy = input.actorId;
      await order.save({ transaction });
      return orderShape(order);
    });
    // La recepcion ya actualizo lotes, FIFO y costo dentro de la transaccion.
    // El aviso va fuera para que un SMTP caido no revierta stock valido.
    void notificationsService.notifyStaffOperational({
      branchId: input.branchId,
      permission: PERMISSIONS.PROCUREMENT_READ,
      title: `Compra recibida en ${received.supplier?.name ?? 'el local'}`,
      body: `${received.orderNumber} ya actualizo el inventario. Revisa los lotes y costos recibidos.`,
      actionUrl: `/admin/compras?branchId=${input.branchId}`,
      idempotencyKey: `procurement-received-${received.id}-${received.receivedAt?.getTime() ?? Date.now()}`,
    });
    return received;
  },

  async listLots(branchId: number, status?: string) {
    await inventoryService.expireLots(branchId);
    const rows = await InventoryLot.findAll({
      where: { branchId, ...(status ? { status } : {}) },
      include: [{ model: InventoryItem, as: 'item' }, { model: Supplier, as: 'supplier' }, { model: PurchaseOrder, as: 'purchaseOrder' }],
      order: [['expiresAt', 'ASC'], ['receivedAt', 'ASC']],
    });
    return rows.map((lot) => ({
      id: lot.id, lotCode: lot.lotCode, inventoryItemId: lot.inventoryItemId,
      item: lot.item ? { id: lot.item.id, code: lot.item.code, name: lot.item.name, unit: lot.item.unit } : null,
      supplier: lot.supplier ? supplierShape(lot.supplier) : null,
      purchaseOrderId: lot.purchaseOrderId, status: lot.status,
      receivedAt: lot.receivedAt, expiresAt: lot.expiresAt,
      quantityReceived: numberValue(lot.quantityReceived), quantityAvailable: numberValue(lot.quantityAvailable),
      unitCost: numberValue(lot.unitCost), stockValue: round2(numberValue(lot.quantityAvailable) * numberValue(lot.unitCost)),
    }));
  },

  async costSummary(branchId: number, from?: string, to?: string) {
    const dateWhere = from || to ? { createdAt: { ...(from ? { [Op.gte]: new Date(from) } : {}), ...(to ? { [Op.lte]: new Date(`${to}T23:59:59`) } : {}) } } : undefined;
    const [lots, movements] = await Promise.all([
      InventoryLot.findAll({ where: { branchId }, include: [{ model: InventoryItem, as: 'item' }] }),
      InventoryMovement.findAll({ where: { branchId, type: [MOVEMENT_TYPE.CONSUME, MOVEMENT_TYPE.WASTE], ...(dateWhere ?? {}) }, include: [{ model: InventoryItem, as: 'item' }] }),
    ]);
    const fromDate = from ? new Date(from).getTime() : -Infinity;
    const toDate = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
    const purchasedLots = lots.filter((lot) => { const received = new Date(lot.receivedAt).getTime(); return received >= fromDate && received <= toDate; });
    const purchasesTotal = round2(purchasedLots.reduce((sum, lot) => sum + numberValue(lot.quantityReceived) * numberValue(lot.unitCost), 0));
    const stockValue = round2(lots.filter((lot) => lot.status === INVENTORY_LOT_STATUS.ACTIVE).reduce((sum, lot) => sum + numberValue(lot.quantityAvailable) * numberValue(lot.unitCost), 0));
    const consumedCost = round2(movements.reduce((sum, movement) => sum + numberValue(movement.totalCost), 0));
    const byItem = new Map<number, { inventoryItemId: number; name: string; purchased: number; consumed: number; stockValue: number }>();
    for (const lot of lots) {
      const row = byItem.get(lot.inventoryItemId) ?? { inventoryItemId: lot.inventoryItemId, name: lot.item?.name ?? `Insumo ${lot.inventoryItemId}`, purchased: 0, consumed: 0, stockValue: 0 };
      if (purchasedLots.includes(lot)) row.purchased += numberValue(lot.quantityReceived) * numberValue(lot.unitCost);
      if (lot.status === INVENTORY_LOT_STATUS.ACTIVE) row.stockValue += numberValue(lot.quantityAvailable) * numberValue(lot.unitCost);
      byItem.set(lot.inventoryItemId, row);
    }
    for (const movement of movements) {
      const movementItem = movement.get('item') as InventoryItem | undefined;
      const row = byItem.get(movement.inventoryItemId) ?? { inventoryItemId: movement.inventoryItemId, name: movementItem?.name ?? `Insumo ${movement.inventoryItemId}`, purchased: 0, consumed: 0, stockValue: 0 };
      row.consumed += numberValue(movement.totalCost);
      byItem.set(movement.inventoryItemId, row);
    }
    return { purchasesTotal, stockValue, consumedCost, rows: [...byItem.values()].map((row) => ({ ...row, purchased: round2(row.purchased), consumed: round2(row.consumed), stockValue: round2(row.stockValue) })) };
  },
};

export type ProcurementService = typeof procurementService;
