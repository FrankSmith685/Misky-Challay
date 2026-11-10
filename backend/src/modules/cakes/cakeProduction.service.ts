import { CustomerOrderCase } from '@database/models/customerJourney.model';
import { Op, type Transaction } from 'sequelize';
import {
  CakeCapacityReservation, CakeDesignQuote, CakeDesignRequest, CakeProductProfile, CakeProductionTask, CakeStationCapacity,
  CustomizationOption, CakeOrderCostSnapshot, BranchSchedule, Order, OrderItem, OrderItemCustomization, OrderItemReference, Permission, Product, ProductVariant, RolePermission, User, UserRole, sequelize,
} from '@database/models';
import { ORDER_STATUS, PERMISSIONS, USER_STATUS } from '@config/constants';
import { CAKE_STATIONS, type CakeEffort, type CakeStation } from '@database/models/cakeProduction.model';
import { ApiError } from '@shared/errors/ApiError';
import { inventoryService } from '@modules/operations/inventory.service';
import { resolveCakeCustomServings } from './cakeCustomServings';
import { resolveCakeTheme } from './cakeThemeRules';

export interface CakeSelection { optionId: number; quantity: number }
export interface CakeLine { productId: number; variantId: number; quantity: number; requestedServings?: number; selections?: CakeSelection[]; designQuoteId?: number; themeId?: number; themeVersion?: number }
export interface CakeCapacityNeed { station: CakeStation; workDate: string; minutes: number }
const DEFAULT_CAPACITY: Record<CakeStation, number> = { DESIGN: 120, BAKING: 180, COOLING: 180, FILLING: 180, DECORATING: 180, QA: 90, DISPATCH: 90 };

export const dayInLima = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (part: string) => parts.find((entry) => entry.type === part)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const asEffort = (value: CakeEffort): CakeEffort => {
  const result: CakeEffort = {};
  for (const station of CAKE_STATIONS) {
    const minutes = Number(value?.[station] ?? 0);
    if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 1440) {
      throw ApiError.unprocessable(`Minutos invalidos para ${station}`);
    }
    if (minutes > 0) result[station] = minutes;
  }
  return result;
};

const dateForOffset = (deliveryAt: Date, daysBefore: number): string =>
  dayInLima(new Date(deliveryAt.getTime() - daysBefore * 24 * 60 * 60_000));

export const needsFromEffort = (effort: CakeEffort, offsets: Partial<Record<CakeStation, number>>, deliveryAt: Date, quantity: number): CakeCapacityNeed[] =>
  CAKE_STATIONS.flatMap((station) => {
    const minutes = Math.ceil((effort[station] ?? 0) * quantity);
    if (minutes === 0) return [];
    const offset = Number(offsets?.[station] ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 30) throw ApiError.unprocessable('Calendario de produccion invalido');
    return [{ station, workDate: dateForOffset(deliveryAt, offset), minutes }];
  });

export const cakeProductionService = {
  async estimateItem(line: CakeLine, deliveryAt: Date): Promise<CakeCapacityNeed[]> {
    const profile = await CakeProductProfile.findOne({ where: { productId: line.productId, isActive: true } });
    if (!profile) return [];
    if (line.designQuoteId && line.themeId) throw ApiError.unprocessable('La cotización aprobada ya incluye su diseño');
    const theme = await resolveCakeTheme(line);
    if (!Number.isFinite(deliveryAt.getTime())) throw ApiError.badRequest('Fecha de entrega invalida');
    if (profile.saleMode === 'ADVANCED' && !line.designQuoteId) throw ApiError.unprocessable('Este diseno requiere una cotizacion aprobada antes de comprar');
    if (line.designQuoteId) {
      const quote = await CakeDesignQuote.findByPk(line.designQuoteId);
      const request = quote ? await CakeDesignRequest.findByPk(quote.requestId, { attributes: { exclude: ['referenceBytes'] } }) : null;
      if (!quote || !request || quote.status !== 'ACCEPTED' || quote.expiresAt <= new Date()
        || request.productId !== line.productId || request.variantId !== line.variantId || line.quantity !== 1
        || quote.proposedAt.getTime() !== deliveryAt.getTime()) {
        throw ApiError.unprocessable('La cotizacion aprobada ya no corresponde a esta torta, fecha o presentacion');
      }
      return needsFromEffort(asEffort(quote.effortJson), profile.stationOffsetsJson, deliveryAt, 1);
    }
    const product = await Product.findByPk(line.productId);
    if (product?.preparationMode === 'READY_STOCK') {
      if (profile.saleMode !== 'STANDARD' || line.requestedServings != null || line.selections?.length) throw ApiError.unprocessable('Este producto se vende preparado, sin personalización');
      return [];
    }
    const minLeadHours = Math.max(profile.minLeadHours, theme?.minLeadHours ?? 0);
    if (!line.designQuoteId && profile.saleMode !== 'ADVANCED' && deliveryAt.getTime() < Date.now() + minLeadHours * 60 * 60_000) {
      throw ApiError.unprocessable(`Este producto requiere al menos ${minLeadHours} horas de anticipación`);
    }
    if (!product) throw ApiError.badRequest('Producto no encontrado');
    const variant = await ProductVariant.findByPk(line.variantId);
    if (!variant || variant.productId !== line.productId) throw ApiError.badRequest('Presentacion de torta invalida');
    const servingRule = await resolveCakeCustomServings(line.productId, line.variantId, line.requestedServings);
    const effort = asEffort(Object.values(variant.productionMinutesJson ?? {}).some((value) => Number(value) > 0)
      ? variant.productionMinutesJson : profile.baseEffortJson);
    for (const station of CAKE_STATIONS) if (effort[station]) effort[station] = Math.ceil(effort[station]! * servingRule.scale);
    for (const station of CAKE_STATIONS) if (theme?.rule.effort[station]) effort[station] = (effort[station] ?? 0) + theme.rule.effort[station]!;
    const selections = line.selections ?? [];
    if (selections.length) {
      const options = await CustomizationOption.findAll({ where: { id: [...new Set(selections.map((entry) => entry.optionId))] } });
      const byId = new Map(options.map((option) => [option.id, option]));
      for (const selection of selections) {
        const option = byId.get(selection.optionId);
        if (!option) throw ApiError.badRequest('Opcion de torta no encontrada');
        const optionEffort = asEffort(option.productionMinutesJson);
        for (const station of CAKE_STATIONS) {
          effort[station] = (effort[station] ?? 0) + (optionEffort[station] ?? 0) * selection.quantity * (option.cakeScaleWithServings ? servingRule.scale : 1);
        }
      }
    }
    if (!Object.values(effort).some((value) => value > 0)) {
      throw ApiError.unprocessable('La receta de produccion de esta torta aun no esta configurada');
    }
    return needsFromEffort(effort, profile.stationOffsetsJson, deliveryAt, line.quantity);
  },

  async estimateOrder(lines: CakeLine[], deliveryAt: Date): Promise<CakeCapacityNeed[]> {
    const grouped = new Map<string, CakeCapacityNeed>();
    for (const line of lines) {
      for (const need of await cakeProductionService.estimateItem(line, deliveryAt)) {
        const key = `${need.workDate}:${need.station}`;
        const current = grouped.get(key);
        grouped.set(key, { ...need, minutes: need.minutes + (current?.minutes ?? 0) });
      }
    }
    return [...grouped.values()].sort((a, b) => `${a.workDate}:${a.station}`.localeCompare(`${b.workDate}:${b.station}`));
  },

  async availability(branchId: number, lines: CakeLine[], deliveryAt: Date) {
    const needs = await cakeProductionService.estimateOrder(lines, deliveryAt);
    await inventoryService.assertCartAvailability(branchId, lines);
    return cakeProductionService.availabilityForNeeds(branchId, needs);
  },

  async availabilityForNeeds(branchId: number, needs: CakeCapacityNeed[], excludeOrderId?: number) {
    const details = [];
    for (const need of needs) {
      const capacity = await CakeStationCapacity.findOne({ where: { branchId, workDate: need.workDate, station: need.station } });
      const credit = excludeOrderId && capacity ? Number(await CakeCapacityReservation.sum('minutes', { where: { orderId: excludeOrderId, capacityId: capacity.id, status: ['HELD', 'CONFIRMED'] } }) ?? 0) : 0;
      const remaining = capacity ? Math.max(0, capacity.capacityMinutes - capacity.reservedMinutes - capacity.confirmedMinutes + credit) : 0;
      details.push({ ...need, availableMinutes: remaining, configured: Boolean(capacity), available: remaining >= need.minutes });
    }
    return { available: details.every((entry) => entry.available), stations: details };
  },

  async availabilityForDesign(branchId: number, productId: number, effort: CakeEffort, deliveryAt: Date, enforceLead = true) {
    const profile = await CakeProductProfile.findByPk(productId);
    if (!profile || !profile.isActive || !['ADVANCED', 'SEMI_CUSTOM'].includes(profile.saleMode)) throw ApiError.badRequest('Este producto no recibe solicitudes a medida');
    if (deliveryAt.getTime() <= Date.now()) throw ApiError.unprocessable('La fecha de entrega ya pasó');
    if (enforceLead && deliveryAt.getTime() < Date.now() + profile.minLeadHours * 60 * 60_000) throw ApiError.unprocessable('La fecha no cumple la anticipacion minima');
    return cakeProductionService.availabilityForNeeds(branchId, needsFromEffort(asEffort(effort), profile.stationOffsetsJson, deliveryAt, 1));
  },

  async reserveForOrder(order: Order, lines: CakeLine[], transaction: Transaction): Promise<void> {
    const profiles = await CakeProductProfile.findAll({ where: { productId: { [Op.in]: lines.map((entry) => entry.productId) }, isActive: true }, transaction });
    if (!profiles.length) return;
    const products = await Product.findAll({
      where: { id: [...new Set(lines.map((entry) => entry.productId))] },
      attributes: ['id', 'preparationMode'],
      transaction,
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const profileById = new Map(profiles.map((profile) => [profile.productId, profile]));
    const linesToProduce = lines.filter((line) => {
      const product = productById.get(line.productId);
      const profile = profileById.get(line.productId);
      if (!product) return Boolean(line.designQuoteId || line.themeId) || Boolean(profile && profile.saleMode !== 'STANDARD');
      return product.preparationMode !== 'READY_STOCK'
        || Boolean(line.designQuoteId || line.themeId)
        || Boolean(profile && profile.saleMode !== 'STANDARD');
    });
    if (!linesToProduce.length) return;
    if (!order.scheduledAt) throw ApiError.unprocessable('Las tortas requieren una fecha de entrega programada');
    const needs = await cakeProductionService.estimateOrder(linesToProduce, order.scheduledAt);
    for (const need of needs) {
      const capacity = await CakeStationCapacity.findOne({
        where: { branchId: order.branchId, workDate: need.workDate, station: need.station },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!capacity || capacity.capacityMinutes - capacity.reservedMinutes - capacity.confirmedMinutes < need.minutes) {
        throw ApiError.unprocessable(`No hay capacidad de ${need.station} para el ${need.workDate}`);
      }
      capacity.reservedMinutes += need.minutes;
      await capacity.save({ transaction });
      const previous = await CakeCapacityReservation.findOne({ where: { orderId: order.id, capacityId: capacity.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (previous) {
        if (previous.status !== 'RELEASED') throw ApiError.conflict('La capacidad del pedido ya está reservada.');
        await previous.update({ minutes: need.minutes, status: 'HELD' }, { transaction });
      } else await CakeCapacityReservation.create({ orderId: order.id, capacityId: capacity.id, minutes: need.minutes, status: 'HELD' }, { transaction });
    }
  },

  async confirmForOrder(order: Order, transaction: Transaction): Promise<void> {
    const holds = await CakeCapacityReservation.findAll({ where: { orderId: order.id, status: 'HELD' }, transaction, lock: transaction.LOCK.UPDATE });
    const planned: Array<CakeCapacityNeed> = [];
    for (const hold of holds) {
      const capacity = await CakeStationCapacity.findByPk(hold.capacityId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!capacity) throw ApiError.internal('La capacidad reservada ya no existe');
      capacity.reservedMinutes -= hold.minutes;
      capacity.confirmedMinutes += hold.minutes;
      await capacity.save({ transaction });
      hold.status = 'CONFIRMED';
      await hold.save({ transaction });
      planned.push({ station: capacity.station, workDate: capacity.workDate, minutes: hold.minutes });
    }
    const sorted = planned.sort((a, b) => CAKE_STATIONS.indexOf(a.station) - CAKE_STATIONS.indexOf(b.station));
    // Se usa la fotografía hecha al comprar, no la receta editable actual.
    const snapshot = await CakeOrderCostSnapshot.findByPk(order.id, { transaction });
    const materialPlan: Record<string, number> = Object.fromEntries((snapshot?.materialsJson ?? []).map((line) => [line.itemId, line.quantity]));
    const materialsStage = sorted.findIndex((task) => !['DESIGN', 'QA', 'DISPATCH'].includes(task.station));
    for (const [index, task] of sorted.entries()) {
      await CakeProductionTask.create({
        orderId: order.id,
        branchId: order.branchId,
        station: task.station,
        workDate: task.workDate,
        plannedMinutes: task.minutes,
        sequence: index + 1,
        materialPlanJson: index === (materialsStage >= 0 ? materialsStage : 0) ? materialPlan : null,
        materialConsumedJson: null,
        materialWasteJson: null,
      }, { transaction });
    }
  },

  async releaseForOrder(order: Order, transaction: Transaction): Promise<void> {
    const reservations = await CakeCapacityReservation.findAll({ where: { orderId: order.id, status: { [Op.in]: ['HELD', 'CONFIRMED'] } }, transaction, lock: transaction.LOCK.UPDATE });
    for (const reservation of reservations) {
      const capacity = await CakeStationCapacity.findByPk(reservation.capacityId, { transaction, lock: transaction.LOCK.UPDATE });
      if (capacity) {
        if (reservation.status === 'HELD') capacity.reservedMinutes = Math.max(0, capacity.reservedMinutes - reservation.minutes);
        else capacity.confirmedMinutes = Math.max(0, capacity.confirmedMinutes - reservation.minutes);
        await capacity.save({ transaction });
      }
      reservation.status = 'RELEASED';
      await reservation.save({ transaction });
    }
  },

  async setCapacity(branchId: number, workDate: string, station: CakeStation, capacityMinutes: number) {
    return sequelize.transaction(async (transaction) => {
      const [row] = await CakeStationCapacity.findOrCreate({
        where: { branchId, workDate, station }, defaults: { branchId, workDate, station, capacityMinutes }, transaction,
      });
      const locked = await CakeStationCapacity.findByPk(row.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!locked) throw ApiError.internal('Capacidad no encontrada');
      if (capacityMinutes < locked.reservedMinutes + locked.confirmedMinutes) {
        throw ApiError.conflict('La nueva capacidad es menor que los minutos ya comprometidos');
      }
      locked.capacityMinutes = capacityMinutes;
      await locked.save({ transaction });
      return locked;
    });
  },

  async restoreCapacity(branchId: number, workDate: string, station: CakeStation) {
    return sequelize.transaction(async (transaction) => {
      const existing = await CakeStationCapacity.findOne({ where: { branchId, workDate, station }, transaction, lock: transaction.LOCK.UPDATE });
      if (existing && existing.reservedMinutes + existing.confirmedMinutes > 0) {
        throw ApiError.conflict('No puedes restaurar la capacidad mientras haya minutos reservados o confirmados');
      }
      const weekday = new Date(`${workDate}T12:00:00-05:00`).getDay();
      const exception = await BranchSchedule.findOne({ where: { branchId, exceptionDate: workDate }, transaction });
      const regular = exception ? null : await BranchSchedule.findOne({ where: { branchId, exceptionDate: null, weekday }, transaction });
      const capacityMinutes = (exception ?? regular)?.isClosed ? 0 : DEFAULT_CAPACITY[station];
      if (existing) {
        existing.capacityMinutes = capacityMinutes;
        await existing.save({ transaction });
        return existing;
      }
      return CakeStationCapacity.create({ branchId, workDate, station, capacityMinutes }, { transaction });
    });
  },

  async listTasks(branchId: number, workDate?: string, assignedTo?: number) {
    return CakeProductionTask.findAll({ where: { branchId, ...(workDate ? { workDate } : {}), ...(assignedTo ? { assignedTo } : {}) }, include: [{ model: Order, as: 'order', attributes: ['id', 'orderNumber', 'status', 'scheduledAt', 'contactName', 'notes', 'deliveryType'], required: true, where: { status: { [Op.notIn]: [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] } }, include: [{ model: OrderItem, as: 'items', where: { itemKind: 'PRODUCT' }, required: false, attributes: ['id', 'quantity', 'productNameSnapshot', 'variantNameSnapshot', 'requestedServings', 'descriptionSnapshot', 'specialInstructions', 'allergenSnapshotJson', 'themeSnapshotJson'], include: [{ model: OrderItemCustomization, as: 'customizations' }, { model: OrderItemReference, as: 'reference', attributes: ['id'] }, { model: OrderItemReference, as: 'designImages', attributes: ['id', 'kind', 'position'] }] }] }], attributes: { exclude: ['evidenceBytes'] }, order: [['workDate', 'ASC'], ['sequence', 'ASC'], ['id', 'ASC']] });
  },

  async recordMaterials(taskId: number, branchId: number, actorId: number, consumed: Record<string, number>, waste: Record<string, number>, expectedMaterials?: { consumed: Record<string, number>; waste: Record<string, number> }) {
    return sequelize.transaction(async (transaction) => {
      const task = await CakeProductionTask.findOne({ where: { id: taskId, branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!task) throw ApiError.notFound('Tarea no encontrada');
      if (task.status === 'DONE') throw ApiError.conflict('La tarea completada no se puede modificar');
      if (task.status === 'PENDING') throw ApiError.conflict('Inicia la tarea antes de registrar materiales');
      const plan = task.materialPlanJson ?? {};
      const clean = (input: Record<string, number>) => Object.fromEntries(Object.entries(input).map(([key, value]) => {
        const itemId = Number(key);
        const amount = Number(value);
        if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(amount) || amount < 0 || amount > 100000) {
          throw ApiError.badRequest('Material o cantidad invalida');
        }
        return [String(itemId), Math.round(amount * 100) / 100];
      }).filter(([, value]) => Number(value) > 0));
      const actualConsumed = clean(consumed);
      const actualWaste = clean(waste);
      const previousConsumed = clean(task.materialConsumedJson ?? {});
      const previousWaste = clean(task.materialWasteJson ?? {});
      const fingerprint = (value: Record<string, number>) => JSON.stringify(Object.entries(clean(value)).sort(([a], [b]) => a.localeCompare(b)));
      if (expectedMaterials && (fingerprint(expectedMaterials.consumed) !== fingerprint(previousConsumed) || fingerprint(expectedMaterials.waste) !== fingerprint(previousWaste))) {
        throw ApiError.conflict('Otra persona actualizó los materiales. Recarga y revisa las cantidades antes de guardar.');
      }
      const keys = new Set([...Object.keys(plan), ...Object.keys(previousConsumed), ...Object.keys(previousWaste), ...Object.keys(actualConsumed), ...Object.keys(actualWaste)]);
      for (const itemId of keys) {
        const amount = Number(actualConsumed[itemId] ?? 0) + Number(actualWaste[itemId] ?? 0);
        const planned = Number(plan[itemId] ?? 0);
        if (!planned && amount > 0) throw ApiError.unprocessable(`El insumo ${itemId} no pertenece a la receta reservada`);
        if (planned > 0 && amount > planned * 2) {
          throw ApiError.unprocessable(`El consumo del insumo ${itemId} supera el doble de la receta reservada`);
        }
      }
      if (!Object.values(actualConsumed).some((value) => Number(value) > 0) && !Object.values(actualWaste).some((value) => Number(value) > 0)) throw ApiError.unprocessable('Registra el consumo real antes de guardar');
      const order = await Order.findByPk(task.orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order || order.status === ORDER_STATUS.CANCELLED || order.status === ORDER_STATUS.REFUNDED) throw ApiError.conflict('El pedido ya no esta activo');
      for (const itemId of keys) {
        const planned = Number(plan[itemId] ?? 0);
        const before = !Object.keys(previousConsumed).length && !Object.keys(previousWaste).length
          ? planned : Number(previousConsumed[itemId] ?? 0) + Number(previousWaste[itemId] ?? 0);
        const after = Number(actualConsumed[itemId] ?? 0) + Number(actualWaste[itemId] ?? 0);
        const delta = Math.round((after - before) * 100) / 100;
        if (delta !== 0) await inventoryService.correctOrderMaterial(order, Number(itemId), delta, Math.max(0, Number(actualWaste[itemId] ?? 0) - Number(previousWaste[itemId] ?? 0)), actorId, transaction);
      }
      task.materialConsumedJson = actualConsumed;
      task.materialWasteJson = actualWaste;
      await task.save({ transaction });
      return CakeProductionTask.findByPk(task.id, { attributes: { exclude: ['evidenceBytes'] }, transaction });
    });
  },

  async setEvidence(taskId: number, branchId: number, dataUrl: string) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) throw ApiError.badRequest('Adjunta una foto JPG, PNG o WebP');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 5_000_000) throw ApiError.badRequest('La foto debe pesar menos de 5 MB');
    const mime = match[1];
    const valid = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw ApiError.badRequest('El archivo no coincide con su formato declarado');
    return sequelize.transaction(async (transaction) => {
      const task = await CakeProductionTask.findOne({ where: { id: taskId, branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!task) throw ApiError.notFound('Tarea no encontrada');
      if (task.station !== 'QA') throw ApiError.unprocessable('La foto final corresponde al control de calidad');
      if (task.status === 'DONE') throw ApiError.conflict('El control de calidad completado no se puede modificar');
      task.evidenceMime = mime;
      task.evidenceBytes = bytes;
      await task.save({ transaction });
      return { id: task.id, hasEvidence: true };
    });
  },

  async evidence(taskId: number, branchId: number) {
    const task = await CakeProductionTask.findOne({ where: { id: taskId, branchId } });
    if (!task?.evidenceBytes || !task.evidenceMime) throw ApiError.notFound('Foto no encontrada');
    return { mime: task.evidenceMime, bytes: task.evidenceBytes };
  },

  async updateTask(taskId: number, branchId: number, actorId: number, input: { status?: 'IN_PROGRESS' | 'DONE' | 'BLOCKED'; assignedTo?: number | null; checklistJson?: Record<string, boolean>; evidenceUrl?: string | null; incidentReason?: string | null }) {
    return sequelize.transaction(async (transaction) => {
      const task = await CakeProductionTask.findOne({ where: { id: taskId, branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!task) throw ApiError.notFound('Tarea no encontrada');
      if (task.status === 'DONE') throw ApiError.conflict('Una etapa completada no se puede modificar');
      const order = await Order.findByPk(task.orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order || order.status === ORDER_STATUS.PENDING_PAYMENT || order.status === ORDER_STATUS.CANCELLED || order.status === ORDER_STATUS.REFUNDED) {
        throw ApiError.conflict('El pedido no está confirmado para producción');
      }
      if (input.assignedTo !== undefined && input.assignedTo !== null) {
        const worker = await User.findByPk(input.assignedTo, { transaction });
        if (!worker || worker.status !== USER_STATUS.ACTIVE) throw ApiError.unprocessable('El responsable debe tener una cuenta activa');
        if (!worker.isSuperAdmin) {
          const permission = await Permission.findOne({ where: { code: PERMISSIONS.KITCHEN_OPERATE }, transaction });
          const assignments = await UserRole.findAll({ where: { userId: worker.id, branchId: { [Op.or]: [null, branchId] } }, transaction });
          const authorized = permission && assignments.length && await RolePermission.count({ where: { roleId: { [Op.in]: assignments.map((entry) => entry.roleId) }, permissionId: permission.id }, transaction });
          if (!authorized) throw ApiError.unprocessable('El responsable no opera producción en esta sucursal');
        }
      }
      if (input.assignedTo !== undefined) task.assignedTo = input.assignedTo;
      if (input.checklistJson !== undefined) task.checklistJson = input.checklistJson;
      if (input.evidenceUrl !== undefined) task.evidenceUrl = input.evidenceUrl;
      if (input.status === 'BLOCKED') {
        const reason = input.incidentReason?.trim() ?? '';
        if (reason.length < 5) throw ApiError.unprocessable('Indica el motivo del bloqueo para que la incidencia pueda resolverse');
        task.incidentReason = reason.slice(0, 500);
        task.incidentAt = new Date();
        task.incidentBy = actorId;
      }
      if (input.status === 'DONE' || input.status === 'IN_PROGRESS') {
        const previous = await CakeProductionTask.count({ where: { orderId: task.orderId, sequence: { [Op.lt]: task.sequence }, status: { [Op.ne]: 'DONE' } }, transaction });
        if (previous) throw ApiError.conflict('Completa las etapas anteriores primero');
        if (!task.assignedTo) throw ApiError.unprocessable('Asigna un responsable antes de iniciar esta etapa');
      }
      if (input.status === 'DONE') {
        if (task.status !== 'IN_PROGRESS') throw ApiError.conflict('Inicia la etapa antes de marcarla como terminada');
        if (task.station === 'QA') {
          const hasSpecialDesign = await CakeDesignQuote.count({ where: { orderId: task.orderId }, transaction }) > 0;
          const required = ['size', 'message', 'colors', 'allergens', 'packaging', ...(hasSpecialDesign ? ['reference'] : [])];
          if (!required.every((key) => task.checklistJson?.[key]) || !task.evidenceBytes) {
            throw ApiError.unprocessable('El control de calidad requiere checklist completo y foto final');
          }
        }
        task.completedAt = new Date();
      }
      // El diseño se puede revisar días antes sin gastar ingredientes. Al empezar
      // la primera etapa física, el consumo de la reserva del checkout queda
      // registrado; la futura comanda de cierre reutiliza esa misma operación.
      if (input.status === 'IN_PROGRESS' && task.station !== 'DESIGN') {
        await inventoryService.consumeForOrder(order, input.assignedTo ?? task.assignedTo, transaction);
      }
      if (input.status === 'IN_PROGRESS' && await CustomerOrderCase.count({ where: { orderId: order.id, kind: ['DESIGN', 'CHANGE'], status: 'AWAITING_CUSTOMER' }, transaction })) throw ApiError.conflict('Hay una propuesta pendiente de aprobación del cliente.');
      if (input.status === 'IN_PROGRESS' && !task.startedAt) task.startedAt = new Date();
      if (input.status) task.status = input.status;
      await task.save({ transaction });
      return CakeProductionTask.findByPk(task.id, { attributes: { exclude: ['evidenceBytes'] }, transaction });
    });
  },

  async assertQualityComplete(orderId: number, transaction?: Transaction) {
    const count = await CakeProductionTask.count({ where: { orderId, station: 'QA' }, transaction });
    if (!count) return;
    const undone = await CakeProductionTask.count({ where: { orderId, station: { [Op.ne]: 'DISPATCH' }, status: { [Op.ne]: 'DONE' } }, transaction });
    if (undone) throw ApiError.conflict('La torta necesita completar produccion y control de calidad antes de estar lista');
  },

  async assertDispatchComplete(orderId: number, transaction?: Transaction) {
    const count = await CakeProductionTask.count({ where: { orderId, station: 'DISPATCH' }, transaction });
    if (!count) return;
    const undone = await CakeProductionTask.count({ where: { orderId, station: 'DISPATCH', status: { [Op.ne]: 'DONE' } }, transaction });
    if (undone) throw ApiError.conflict('Completa la entrega de la torta a despacho antes de cerrar o enviar el pedido');
  },
};
