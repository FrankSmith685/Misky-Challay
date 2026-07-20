import { Transaction } from 'sequelize';
import {
  BranchInventory,
  BranchOptionAvailability,
  CustomizationOption,
  InventoryItem,
  InventoryMovement,
  Order,
  OrderItem,
  OrderItemCustomization,
  Recipe,
  RecipeItem,
  sequelize,
} from '@database/models';
import { MOVEMENT_TYPE, type MovementType } from '@database/models/inventoryMovement.model';
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';

/** Cuanto de cada insumo necesita un pedido. */
export type Requirement = Map<number, number>;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const addRequirement = (requirements: Requirement, itemId: number, quantity: number): void => {
  if (quantity <= 0) return;
  requirements.set(itemId, (requirements.get(itemId) ?? 0) + quantity);
};

/**
 * Calcula el consumo de insumos de un pedido:
 *  - productos fijos -> por su receta (mas la merma estimada)
 *  - bowls personalizados -> por cada opcion elegida
 */
export const calculateRequirements = async (
  orderId: number,
  transaction?: Transaction,
): Promise<Requirement> => {
  const items = await OrderItem.findAll({
    where: { orderId },
    include: [{ model: OrderItemCustomization, as: 'customizations' }],
    transaction,
  });

  const requirements: Requirement = new Map();

  for (const item of items) {
    // 1) Receta de la variante (productos fijos)
    if (item.variantId) {
      const recipe = await Recipe.findOne({
        where: { variantId: item.variantId, isActive: true },
        include: [{ model: RecipeItem, as: 'items' }],
        transaction,
      });

      const recipeItems = (recipe?.get('items') as RecipeItem[] | undefined) ?? [];
      for (const line of recipeItems) {
        const waste = 1 + Number(line.wastePercent) / 100;
        addRequirement(
          requirements,
          line.inventoryItemId,
          round2(Number(line.quantity) * waste * item.quantity),
        );
      }
    }

    // 2) Opciones del constructor (bowls personalizados)
    const customizations = (item.get('customizations') as OrderItemCustomization[] | undefined) ?? [];
    const optionIds = customizations
      .map((customization) => customization.optionId)
      .filter((id): id is number => id !== null);

    if (optionIds.length === 0) continue;

    const options = await CustomizationOption.findAll({
      where: { id: optionIds },
      transaction,
    });
    const optionById = new Map(options.map((option) => [option.id, option]));

    for (const customization of customizations) {
      if (!customization.optionId) continue;
      const option = optionById.get(customization.optionId);
      if (!option?.inventoryItemId) continue;

      addRequirement(
        requirements,
        option.inventoryItemId,
        round2(Number(option.consumptionQuantity) * customization.quantity * item.quantity),
      );
    }
  }

  return requirements;
};

/** Escribe el movimiento y deja el saldo resultante (libro inmutable). */
const writeMovement = async (
  stock: BranchInventory,
  type: MovementType,
  quantity: number,
  context: { orderId?: number | null; actorId?: number | null; reason?: string },
  transaction: Transaction,
): Promise<void> => {
  await InventoryMovement.create(
    {
      branchId: stock.branchId,
      inventoryItemId: stock.inventoryItemId,
      type,
      quantity: round2(quantity),
      onHandAfter: round2(Number(stock.onHand)),
      reservedAfter: round2(Number(stock.reserved)),
      orderId: context.orderId ?? null,
      actorId: context.actorId ?? null,
      reason: context.reason ?? null,
    },
    { transaction },
  );
};

/**
 * Si un insumo se queda sin stock, las opciones que lo usan se marcan agotadas en
 * esa sucursal (RN-005): dejan de ofrecerse en el constructor de inmediato.
 */
const syncOptionAvailability = async (
  branchId: number,
  inventoryItemId: number,
  transaction: Transaction,
): Promise<void> => {
  const stock = await BranchInventory.findOne({
    where: { branchId, inventoryItemId },
    transaction,
  });
  if (!stock) return;

  const options = await CustomizationOption.findAll({
    where: { inventoryItemId },
    transaction,
  });

  for (const option of options) {
    const needed = Number(option.consumptionQuantity);
    const isAvailable = needed <= 0 || stock.available >= needed;

    const [row] = await BranchOptionAvailability.findOrCreate({
      where: { branchId, optionId: option.id },
      defaults: { branchId, optionId: option.id, isAvailable, priceOverride: null },
      transaction,
    });

    if (row.isAvailable !== isAvailable) {
      row.isAvailable = isAvailable;
      await row.save({ transaction });
      logger.warn(
        `Opcion "${option.name}" ${isAvailable ? 'disponible de nuevo' : 'AGOTADA'} en la sucursal ${branchId}`,
      );
    }
  }
};

export const inventoryService = {
  calculateRequirements,

  /** Comprueba insumos antes de mostrar el pago; evita vender una combinación que ya no puede prepararse. */
  async assertCartAvailability(
    branchId: number,
    items: Array<{ variantId: number; quantity: number; selections?: Array<{ optionId: number; quantity: number }> }>,
  ) {
    const requirements: Requirement = new Map();
    for (const item of items) {
      const recipe = await Recipe.findOne({ where: { variantId: item.variantId, isActive: true }, include: [{ model: RecipeItem, as: 'items' }] });
      for (const line of ((recipe?.get('items') as RecipeItem[] | undefined) ?? [])) {
        addRequirement(requirements, line.inventoryItemId, Number(line.quantity) * (1 + Number(line.wastePercent) / 100) * item.quantity);
      }
      const selections = item.selections ?? [];
      const options = selections.length ? await CustomizationOption.findAll({ where: { id: selections.map((selection) => selection.optionId) } }) : [];
      const byId = new Map(options.map((option) => [option.id, option]));
      for (const selection of selections) {
        const option = byId.get(selection.optionId);
        if (option?.inventoryItemId) addRequirement(requirements, option.inventoryItemId, Number(option.consumptionQuantity) * selection.quantity * item.quantity);
      }
    }

    const shortages: string[] = [];
    for (const [inventoryItemId, needed] of requirements) {
      const stock = await BranchInventory.findOne({ where: { branchId, inventoryItemId }, include: [{ model: InventoryItem, as: 'item' }] });
      if (!stock || stock.available < needed) shortages.push(stock?.item?.name ?? `Insumo ${inventoryItemId}`);
    }
    if (shortages.length) {
      throw ApiError.unprocessable(`Stock actualizado: ya no alcanza ${[...new Set(shortages)].join(', ')}. Retira o sustituye esos ingredientes`);
    }
  },

  /** Crea un insumo gestionable y lo habilita en el inventario de una cocina. */
  async createItem(input: {
    branchId: number;
    code: string;
    name: string;
    unit: string;
    unitCost: number;
    minLevel: number;
    initialStock: number;
    actorId: number;
  }) {
    const code = input.code.trim().toUpperCase();
    const existing = await InventoryItem.findOne({ where: { code } });
    if (existing) throw ApiError.conflict('Ya existe un insumo con ese codigo');

    return sequelize.transaction(async (transaction) => {
      const item = await InventoryItem.create(
        {
          code,
          name: input.name.trim(),
          unit: input.unit.trim().toLowerCase(),
          unitCost: input.unitCost,
          minLevel: input.minLevel,
          isActive: true,
        },
        { transaction },
      );

      const stock = await BranchInventory.create(
        {
          branchId: input.branchId,
          inventoryItemId: item.id,
          onHand: input.initialStock,
          reserved: 0,
        },
        { transaction },
      );

      if (input.initialStock > 0) {
        await writeMovement(
          stock,
          MOVEMENT_TYPE.PURCHASE,
          input.initialStock,
          { actorId: input.actorId, reason: 'Stock inicial del insumo' },
          transaction,
        );
      }

      return item;
    });
  },

  /**
   * RN-016: reserva stock durante el intento de pago. En modo estricto, cualquier
   * faltante revierte toda la transaccion; una confirmacion posterior es idempotente.
   */
  async reserveForOrder(
    order: Order,
    transaction: Transaction,
    strict = false,
  ): Promise<{ shortages: Array<{ item: string; missing: number; unit: string }> }> {
    const existingReservations = await InventoryMovement.count({
      where: { orderId: order.id, type: MOVEMENT_TYPE.RESERVE },
      transaction,
    });
    if (existingReservations > 0) return { shortages: [] };

    const requirements = await calculateRequirements(order.id, transaction);
    const shortages: Array<{ item: string; missing: number; unit: string }> = [];

    for (const [inventoryItemId, quantity] of requirements) {
      const [stock] = await BranchInventory.findOrCreate({
        where: { branchId: order.branchId, inventoryItemId },
        defaults: { branchId: order.branchId, inventoryItemId, onHand: 0, reserved: 0 },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const available = stock.available;
      const toReserve = Math.min(available, quantity);

      if (toReserve < quantity) {
        const item = await InventoryItem.findByPk(inventoryItemId, { transaction });
        shortages.push({
          item: item?.name ?? `Insumo ${inventoryItemId}`,
          missing: round2(quantity - toReserve),
          unit: item?.unit ?? '',
        });
        if (strict) {
          throw ApiError.unprocessable(`Stock actualizado: no alcanza ${item?.name ?? `el insumo ${inventoryItemId}`}. Elige una alternativa`);
        }
      }

      if (toReserve > 0) {
        stock.reserved = round2(Number(stock.reserved) + toReserve);
        await stock.save({ transaction });

        await writeMovement(
          stock,
          MOVEMENT_TYPE.RESERVE,
          toReserve,
          { orderId: order.id, reason: `Reserva del pedido ${order.orderNumber}` },
          transaction,
        );
      }

      await syncOptionAvailability(order.branchId, inventoryItemId, transaction);
    }

    return { shortages };
  },

  /** La cancelacion libera lo reservado y vuelve a poner las opciones disponibles. */
  async releaseForOrder(order: Order, transaction: Transaction): Promise<void> {
    const movements = await InventoryMovement.findAll({
      where: { orderId: order.id, type: MOVEMENT_TYPE.RESERVE },
      transaction,
    });

    for (const movement of movements) {
      const released = await InventoryMovement.sum('quantity', {
        where: {
          orderId: order.id,
          branchId: movement.branchId,
          inventoryItemId: movement.inventoryItemId,
          type: MOVEMENT_TYPE.RELEASE,
        },
        transaction,
      });
      const pendingRelease = Math.max(0, Number(movement.quantity) - Number(released ?? 0));
      if (pendingRelease <= 0) continue;
      const stock = await BranchInventory.findOne({
        where: { branchId: movement.branchId, inventoryItemId: movement.inventoryItemId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!stock) continue;

      const quantity = Math.min(Number(stock.reserved), pendingRelease);
      if (quantity <= 0) continue;

      stock.reserved = round2(Number(stock.reserved) - quantity);
      await stock.save({ transaction });

      await writeMovement(
        stock,
        MOVEMENT_TYPE.RELEASE,
        quantity,
        { orderId: order.id, reason: `Liberacion por cancelacion de ${order.orderNumber}` },
        transaction,
      );

      await syncOptionAvailability(stock.branchId, stock.inventoryItemId, transaction);
    }
  },

  /** Al preparar el pedido, el consumo se vuelve definitivo: baja onHand y reserved. */
  async consumeForOrder(order: Order, actorId: number | null, transaction: Transaction): Promise<void> {
    const movements = await InventoryMovement.findAll({
      where: { orderId: order.id, type: MOVEMENT_TYPE.RESERVE },
      transaction,
    });

    for (const movement of movements) {
      const stock = await BranchInventory.findOne({
        where: { branchId: movement.branchId, inventoryItemId: movement.inventoryItemId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!stock) continue;

      const quantity = Number(movement.quantity);

      stock.onHand = round2(Math.max(0, Number(stock.onHand) - quantity));
      stock.reserved = round2(Math.max(0, Number(stock.reserved) - quantity));
      await stock.save({ transaction });

      await writeMovement(
        stock,
        MOVEMENT_TYPE.CONSUME,
        quantity,
        { orderId: order.id, actorId, reason: `Preparacion del pedido ${order.orderNumber}` },
        transaction,
      );

      await syncOptionAvailability(stock.branchId, stock.inventoryItemId, transaction);
    }
  },

  /** Entrada de stock, merma o ajuste manual desde el panel. */
  async adjust(input: {
    branchId: number;
    inventoryItemId: number;
    type: MovementType;
    quantity: number;
    actorId: number;
    reason: string;
  }) {
    if (input.quantity <= 0) throw ApiError.badRequest('La cantidad debe ser positiva');

    return sequelize.transaction(async (transaction) => {
      const [stock] = await BranchInventory.findOrCreate({
        where: { branchId: input.branchId, inventoryItemId: input.inventoryItemId },
        defaults: {
          branchId: input.branchId,
          inventoryItemId: input.inventoryItemId,
          onHand: 0,
          reserved: 0,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const current = Number(stock.onHand);

      if (input.type === MOVEMENT_TYPE.PURCHASE || input.type === MOVEMENT_TYPE.ADJUSTMENT) {
        stock.onHand = round2(current + input.quantity);
      } else if (input.type === MOVEMENT_TYPE.WASTE) {
        if (input.quantity > stock.available) {
          throw ApiError.unprocessable('No puedes mermar mas de lo que hay disponible');
        }
        stock.onHand = round2(current - input.quantity);
      } else {
        throw ApiError.badRequest('Tipo de movimiento no permitido desde el panel');
      }

      await stock.save({ transaction });

      await writeMovement(
        stock,
        input.type,
        input.quantity,
        { actorId: input.actorId, reason: input.reason },
        transaction,
      );

      await syncOptionAvailability(input.branchId, input.inventoryItemId, transaction);
      return stock;
    });
  },

  /** Stock de una sucursal, con aviso de los insumos bajo el minimo. */
  async listStock(branchId: number) {
    const rows = await BranchInventory.findAll({
      where: { branchId },
      include: [{ model: InventoryItem, as: 'item' }],
      order: [['inventory_item_id', 'ASC']],
    });

    const itemIds = rows.map((row) => row.inventoryItemId);
    const impacted = itemIds.length ? await CustomizationOption.findAll({ where: { inventoryItemId: itemIds } }) : [];
    const groupIds = [...new Set(impacted.map((option) => option.groupId))];
    const alternatives = groupIds.length ? await CustomizationOption.findAll({ where: { groupId: groupIds, status: 'ACTIVE' } }) : [];

    return rows.map((row) => {
      const item = row.item;
      const impactedOptions = impacted.filter((option) => option.inventoryItemId === row.inventoryItemId);
      const impactedIds = new Set(impactedOptions.map((option) => option.id));
      const substituteNames = [...new Set(impactedOptions.flatMap((option) => alternatives
        .filter((candidate) => candidate.groupId === option.groupId && !impactedIds.has(candidate.id))
        .map((candidate) => candidate.name)))].slice(0, 4);
      return {
        inventoryItemId: row.inventoryItemId,
        name: item?.name ?? '',
        unit: item?.unit ?? '',
        onHand: Number(row.onHand),
        reserved: Number(row.reserved),
        available: row.available,
        minLevel: Number(item?.minLevel ?? 0),
        isLow: row.available <= Number(item?.minLevel ?? 0),
        impactedOptions: impactedOptions.map((option) => option.name),
        suggestedSubstitutes: substituteNames,
      };
    });
  },
};

export type InventoryService = typeof inventoryService;
