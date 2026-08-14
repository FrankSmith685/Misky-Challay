import { Op, Transaction } from 'sequelize';
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

/**
 * Escribe el movimiento y deja el saldo resultante (libro inmutable).
 *
 * `quantity` llega con el SENTIDO ya resuelto por el tipo, salvo en ADJUSTMENT:
 * ese es el unico movimiento que puede ir en las dos direcciones (el conteo
 * fisico da mas o da menos que el sistema), asi que ahi el signo es el dato y se
 * guarda tal cual. Sin el, un ajuste a la baja quedaba registrado como si hubiera
 * sumado.
 */
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
 *
 * Esta fila la comparte con el bloqueo MANUAL del panel, y esta funcion se dispara
 * en cada movimiento (reserva, liberacion, consumo, ajuste). De ahi las dos
 * cautelas:
 *
 *  - Una opcion SIN consumo declarado no depende del stock. Antes `needed <= 0`
 *    la daba por disponible en cada movimiento, asi que registrar una simple
 *    compra reactivaba opciones que alguien acababa de agotar a mano.
 *  - No se crea fila para decir "disponible": sin fila ya manda el estado global
 *    de la opcion. La fila solo se crea para AGOTAR.
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
    if (!(needed > 0)) continue;

    const isAvailable = stock.available >= needed;

    const row = await BranchOptionAvailability.findOne({
      where: { branchId, optionId: option.id },
      transaction,
    });

    if (!row) {
      if (isAvailable) continue;
      await BranchOptionAvailability.create(
        { branchId, optionId: option.id, isAvailable: false, priceOverride: null },
        { transaction },
      );
      logger.warn(`Opcion "${option.name}" AGOTADA en la sucursal ${branchId}`);
      continue;
    }

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
   * Maestro de insumos con la marca de cuales ya se controlan en esta cocina.
   *
   * El insumo se crea UNA vez para todo el negocio, pero el stock es por sucursal.
   * Sin esta lista, el administrador de una cocina no tenia forma de empezar a
   * controlar un insumo creado en otra: "Nuevo insumo" chocaba contra el codigo
   * unico y su unica salida era duplicarlo con un codigo inventado.
   */
  async listMasterItems(branchId: number) {
    const [items, enabledRows] = await Promise.all([
      InventoryItem.findAll({ where: { isActive: true }, order: [['name', 'ASC']] }),
      BranchInventory.findAll({ where: { branchId }, attributes: ['inventoryItemId'] }),
    ]);

    const enabled = new Set(enabledRows.map((row) => row.inventoryItemId));

    return items.map((item) => ({
      inventoryItemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      minLevel: Number(item.minLevel),
      isEnabledInBranch: enabled.has(item.id),
    }));
  },

  /**
   * Habilita en una cocina un insumo que ya existe en el maestro: es el mismo
   * `findOrCreate` que `adjust` hacia de refilon, pero explicito, para que la fila
   * aparezca en el inventario sin tener que inventarse un movimiento.
   * Idempotente: si ya estaba habilitado no toca nada y lo dice.
   */
  async enableItem(input: {
    branchId: number;
    inventoryItemId: number;
    initialStock: number;
    actorId: number;
  }) {
    const item = await InventoryItem.findByPk(input.inventoryItemId);
    if (!item || !item.isActive) throw ApiError.notFound('Insumo no encontrado');

    return sequelize.transaction(async (transaction) => {
      const [stock, created] = await BranchInventory.findOrCreate({
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

      if (!created) return { stock, item, created: false };

      if (input.initialStock > 0) {
        stock.onHand = round2(input.initialStock);
        await stock.save({ transaction });

        await writeMovement(
          stock,
          MOVEMENT_TYPE.PURCHASE,
          input.initialStock,
          { actorId: input.actorId, reason: `Stock inicial al habilitar ${item.name} en la cocina` },
          transaction,
        );
      }

      await syncOptionAvailability(input.branchId, input.inventoryItemId, transaction);
      return { stock, item, created: true };
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
    const existingReservations = await InventoryMovement.findAll({
      where: { orderId: order.id, type: MOVEMENT_TYPE.RESERVE },
      attributes: ['inventoryItemId', 'quantity'],
      transaction,
    });
    const requirements = await calculateRequirements(order.id, transaction);
    const alreadyReserved = new Map<number, number>();
    for (const movement of existingReservations) {
      alreadyReserved.set(
        movement.inventoryItemId,
        round2((alreadyReserved.get(movement.inventoryItemId) ?? 0) + Number(movement.quantity)),
      );
    }
    const shortages: Array<{ item: string; missing: number; unit: string }> = [];

    for (const [inventoryItemId, totalRequired] of requirements) {
      // Una comanda de salÃ³n puede crecer mientras cocina aÃºn no la prepara.
      // Solo reservamos el delta: repetir la operaciÃ³n sigue siendo idempotente.
      const quantity = round2(Math.max(0, totalRequired - (alreadyReserved.get(inventoryItemId) ?? 0)));
      if (quantity <= 0) continue;
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

    const reservedByItem = new Map<number, { branchId: number; quantity: number }>();
    for (const movement of movements) {
      const current = reservedByItem.get(movement.inventoryItemId);
      reservedByItem.set(movement.inventoryItemId, {
        branchId: movement.branchId,
        quantity: round2((current?.quantity ?? 0) + Number(movement.quantity)),
      });
    }

    for (const [inventoryItemId, reservation] of reservedByItem) {
      const released = await InventoryMovement.sum('quantity', {
        where: {
          orderId: order.id,
          branchId: reservation.branchId,
          inventoryItemId,
          type: MOVEMENT_TYPE.RELEASE,
        },
        transaction,
      });
      const pendingRelease = Math.max(0, reservation.quantity - Number(released ?? 0));
      if (pendingRelease <= 0) continue;
      const stock = await BranchInventory.findOne({
        where: { branchId: reservation.branchId, inventoryItemId },
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

  /**
   * Entrada de stock, merma o ajuste manual desde el panel.
   *
   * EL AJUSTE LLEVA SIGNO. Antes "Ajuste" ejecutaba exactamente la misma linea que
   * "Entrada" (`onHand + quantity`) y la cantidad venia forzada a positiva desde la
   * ruta: cuando el conteo fisico daba MENOS que el sistema no existia la operacion
   * correcta, la etiqueta prometia lo contrario de lo que hacia y la unica salida
   * era anotar la diferencia como merma, ensuciando el indicador de mermas.
   *
   * Un ajuste a la baja no puede comerse lo RESERVADO: esos gramos ya estan
   * comprometidos con pedidos pagados que la cocina todavia tiene que preparar.
   */
  async adjust(input: {
    branchId: number;
    inventoryItemId: number;
    type: MovementType;
    quantity: number;
    actorId: number;
    reason: string;
  }) {
    if (input.type === MOVEMENT_TYPE.ADJUSTMENT) {
      if (input.quantity === 0) {
        throw ApiError.badRequest('El conteo coincide con el sistema: no hay nada que ajustar');
      }
    } else if (input.quantity <= 0) {
      throw ApiError.badRequest('La cantidad debe ser positiva');
    }

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

      if (input.type === MOVEMENT_TYPE.PURCHASE) {
        stock.onHand = round2(current + input.quantity);
      } else if (input.type === MOVEMENT_TYPE.ADJUSTMENT) {
        // El sentido viaja en el signo de la cantidad, ya calculado contra el
        // conteo fisico. Se resuelve DENTRO de la transaccion y con la fila
        // bloqueada, asi que un consumo simultaneo no puede colar un saldo mentiroso.
        const next = round2(current + input.quantity);
        const reserved = round2(Number(stock.reserved));
        if (next < reserved) {
          throw ApiError.unprocessable(
            `No puedes dejar el stock en ${next}: hay ${reserved} reservados para pedidos ya pagados`,
          );
        }
        stock.onHand = next;
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
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [impacted, recentConsumption] = await Promise.all([
      itemIds.length ? CustomizationOption.findAll({ where: { inventoryItemId: itemIds } }) : [],
      itemIds.length
        ? InventoryMovement.findAll({
            where: {
              branchId,
              inventoryItemId: itemIds,
              type: [MOVEMENT_TYPE.CONSUME, MOVEMENT_TYPE.WASTE],
              createdAt: { [Op.gte]: since },
            },
            attributes: ['inventoryItemId', 'quantity'],
          })
        : [],
    ]);
    const consumedByItem = new Map<number, number>();
    recentConsumption.forEach((movement) => {
      consumedByItem.set(
        movement.inventoryItemId,
        round2((consumedByItem.get(movement.inventoryItemId) ?? 0) + Math.abs(Number(movement.quantity))),
      );
    });
    const groupIds = [...new Set(impacted.map((option) => option.groupId))];
    const alternatives = groupIds.length ? await CustomizationOption.findAll({ where: { groupId: groupIds, status: 'ACTIVE' } }) : [];

    return rows.map((row) => {
      const item = row.item;
      const impactedOptions = impacted.filter((option) => option.inventoryItemId === row.inventoryItemId);
      const impactedIds = new Set(impactedOptions.map((option) => option.id));
      const substituteNames = [...new Set(impactedOptions.flatMap((option) => alternatives
        .filter((candidate) => candidate.groupId === option.groupId && !impactedIds.has(candidate.id))
        .map((candidate) => candidate.name)))].slice(0, 4);
      const available = round2(row.available);
      const minLevel = Number(item?.minLevel ?? 0);
      const consumedLast7Days = consumedByItem.get(row.inventoryItemId) ?? 0;
      const averageDailyUsage = round2(consumedLast7Days / 7);
      const daysRemaining = averageDailyUsage > 0
        ? round2(Math.max(0, available) / averageDailyUsage)
        : null;
      const targetLevel = round2(Math.max(
        minLevel * 2,
        averageDailyUsage * 7,
        available <= 0 ? 1 : 0,
      ));
      const suggestedPurchase = round2(Math.max(0, targetLevel - available));
      const stockStatus = available <= 0
        ? 'OUT'
        : available <= minLevel * 0.5 || (daysRemaining !== null && daysRemaining <= 1)
          ? 'CRITICAL'
          : available <= minLevel || (daysRemaining !== null && daysRemaining <= 3)
            ? 'LOW'
            : 'HEALTHY';

      return {
        inventoryItemId: row.inventoryItemId,
        name: item?.name ?? '',
        unit: item?.unit ?? '',
        onHand: Number(row.onHand),
        reserved: Number(row.reserved),
        available,
        minLevel,
        isLow: stockStatus !== 'HEALTHY',
        stockStatus,
        consumedLast7Days,
        averageDailyUsage,
        daysRemaining,
        targetLevel,
        suggestedPurchase,
        impactedOptions: impactedOptions.map((option) => option.name),
        suggestedSubstitutes: substituteNames,
      };
    });
  },
};

export type InventoryService = typeof inventoryService;
