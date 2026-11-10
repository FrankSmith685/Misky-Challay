import { randomUUID } from 'node:crypto';
import { ForeignKeyConstraintError, Op, QueryTypes, Transaction } from 'sequelize';
import {
  BranchInventory,
  Allergen,
  BranchOptionAvailability,
  CakeProductProfile,
  CakeDesignQuote,
  CakeDesignRequest,
  CakeTheme,
  CustomizationOption,
  InventoryItem,
  InventoryMovement,
  InventoryTransfer,
  InventoryTransferItem,
  InventoryCountSession,
  InventoryCountItem,
  InventoryLot,
  Branch,
  MediaAsset,
  Order,
  OrderItem,
  OrderItemCustomization,
  Recipe,
  RecipeItem,
  ProductVariant,
  PurchaseOrder,
  PurchaseOrderItem,
  User,
  sequelize,
} from '@database/models';
import { MOVEMENT_TYPE, type MovementType } from '@database/models/inventoryMovement.model';
import { INVENTORY_TRANSFER_STATUS } from '@database/models/inventoryTransfer.model';
import { INVENTORY_COUNT_STATUS } from '@database/models/inventoryCount.model';
import { INVENTORY_LOT_STATUS } from '@database/models/procurement.model';
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';
import { refreshCakesUsingInventoryItem } from '@modules/catalog/cakeAllergens.service';
import { zonedParts } from '@shared/utils/datetime';
import { resolveCakeCustomServings } from '@modules/cakes/cakeCustomServings';
import { resolveCakeTheme } from '@modules/cakes/cakeThemeRules';
import type { BranchScopeCheck } from '@shared/utils/scope';

/** Cuanto de cada insumo necesita un pedido. */
export type Requirement = Map<number, number>;

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round4 = (value: number): number => Math.round(value * 10000) / 10000;
const usedInCakeTheme = async (itemId: number, transaction?: Transaction): Promise<boolean> =>
  (await CakeTheme.findAll({ attributes: ['variantRulesJson'], transaction })).some((theme) =>
    theme.variantRulesJson.some((rule) => rule.materials.some((material) => material.inventoryItemId === itemId)));
const generatedItemCode = (): string => `INS-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;

const validateAllergens = async (codes: string[] | null | undefined): Promise<void> => {
  if (codes === undefined || codes === null) return;
  const known = new Set((await Allergen.findAll({ attributes: ['code'] })).map((row) => row.code));
  if (new Set(codes).size !== codes.length || codes.some((code) => !known.has(code))) {
    throw ApiError.badRequest('Selecciona alérgenos válidos y sin duplicados');
  }
};

const validateItemImage = async (imageUrl: string | null | undefined, transaction?: Transaction): Promise<void> => {
  if (!imageUrl) return;
  if (!imageUrl.startsWith('/api/v1/media/files/')) throw ApiError.badRequest('Elige una imagen de la biblioteca');
  const asset = await MediaAsset.findOne({ where: { url: imageUrl }, transaction });
  if (!asset) throw ApiError.badRequest('La imagen no está disponible en la biblioteca');
};

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
  cakeOnly = false,
): Promise<Requirement> => {
  const items = await OrderItem.findAll({
    where: { orderId },
    include: [{ model: OrderItemCustomization, as: 'customizations' }],
    transaction,
  });

  const requirements: Requirement = new Map();
  const cakeIds = cakeOnly ? new Set((await CakeProductProfile.findAll({ attributes: ['productId'], transaction })).map((profile) => profile.productId)) : null;
  const quotes = await CakeDesignQuote.findAll({ where: { orderId }, transaction });
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const kinds = new Map<number, string>();
  for (const quote of quotes) {
    const request = await CakeDesignRequest.findByPk(quote.requestId, { attributes: ['requestKind'], transaction });
    kinds.set(quote.id, request?.requestKind ?? 'ADVANCED');
  }

  for (const item of items) {
    if (cakeIds && (!item.productId || !cakeIds.has(item.productId))) continue;
    for (const material of item.themeSnapshotJson?.materials ?? []) addRequirement(requirements, material.inventoryItemId, round2(material.quantity * item.quantity));
    const designQuote = item.designQuoteId ? quoteById.get(item.designQuoteId) : undefined;
    const isFreeform = Boolean(designQuote && kinds.get(designQuote.id) === 'FREEFORM');
    const variant = item.requestedServings && item.variantId ? await ProductVariant.findByPk(item.variantId, { transaction }) : null;
    const servingScale = item.requestedServings && variant?.servingSize ? item.requestedServings / Number(variant.servingSize) : 1;
    // 1) Receta de la variante (productos fijos)
    if (item.variantId && !isFreeform) {
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
          round2(Number(line.quantity) * waste * servingScale * item.quantity / Math.max(1, Number(recipe?.yieldQuantity ?? 1))),
        );
      }
    }

    // 2) Opciones del constructor (bowls personalizados)
    const customizations = isFreeform ? [] : (item.get('customizations') as OrderItemCustomization[] | undefined) ?? [];
    const optionIds = customizations
      .map((customization) => customization.optionId)
      .filter((id): id is number => id !== null);

    if (optionIds.length === 0) {
      for (const extra of designQuote?.materialExtrasJson ?? []) addRequirement(requirements, extra.inventoryItemId, round2(extra.quantity));
      continue;
    }

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
        round2(Number(option.consumptionQuantity) * customization.quantity * item.quantity * (customization.cakeScaleWithServings ? servingScale : 1)),
      );
    }
    for (const extra of designQuote?.materialExtrasJson ?? []) addRequirement(requirements, extra.inventoryItemId, round2(extra.quantity));
  }

  // Pedidos anteriores a la columna design_quote_id siguen consumiendo sus extras.
  for (const quote of quotes.filter((entry) => !items.some((item) => item.designQuoteId === entry.id))) {
    for (const extra of quote.materialExtrasJson ?? []) addRequirement(requirements, extra.inventoryItemId, round2(extra.quantity));
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
  context: { orderId?: number | null; actorId?: number | null; reason?: string; lotId?: number | null; purchaseOrderId?: number | null; unitCost?: number | null; totalCost?: number | null; idempotencyKey?: string | null },
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
      lotId: context.lotId ?? null,
      purchaseOrderId: context.purchaseOrderId ?? null,
      unitCost: context.unitCost ?? null,
      totalCost: context.totalCost ?? null,
      idempotencyKey: context.idempotencyKey ?? null,
    },
    { transaction },
  );
};

type LotAllocation = { lotId: number | null; quantity: number; unitCost: number };

/** FIFO: los insumos con vencimiento o recepción más antigua salen primero. */
const allocateLots = async (
  branchId: number,
  inventoryItemId: number,
  quantity: number,
  transaction: Transaction,
  includeUnavailable = false,
): Promise<LotAllocation[]> => {
  let remaining = round2(quantity);
  const lots = await InventoryLot.findAll({
    where: {
      branchId,
      inventoryItemId,
      status: includeUnavailable ? { [Op.in]: [INVENTORY_LOT_STATUS.ACTIVE, INVENTORY_LOT_STATUS.EXPIRED, INVENTORY_LOT_STATUS.BLOCKED] } : INVENTORY_LOT_STATUS.ACTIVE,
      quantityAvailable: { [Op.gt]: 0 },
      ...(!includeUnavailable ? { [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gte]: zonedParts(new Date()).isoDate } }] } : {}),
    },
    order: [[sequelize.literal('CASE WHEN `expires_at` IS NULL THEN 1 ELSE 0 END'), 'ASC'], ['expiresAt', 'ASC'], ['receivedAt', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const allocations: LotAllocation[] = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Number(lot.quantityAvailable);
    const used = round2(Math.min(available, remaining));
    if (used <= 0) continue;
    lot.quantityAvailable = round2(available - used);
    lot.status = lot.quantityAvailable <= 0 ? INVENTORY_LOT_STATUS.DEPLETED : lot.status;
    await lot.save({ transaction });
    allocations.push({ lotId: lot.id, quantity: used, unitCost: Number(lot.unitCost) });
    remaining = round2(remaining - used);
  }
  if (remaining > 0) allocations.push({ lotId: null, quantity: remaining, unitCost: 0 });
  return allocations;
};

const recalculateAverageCost = async (stock: BranchInventory, transaction: Transaction): Promise<void> => {
  const lots = await InventoryLot.findAll({
    where: { branchId: stock.branchId, inventoryItemId: stock.inventoryItemId, status: INVENTORY_LOT_STATUS.ACTIVE, quantityAvailable: { [Op.gt]: 0 } },
    attributes: ['quantityAvailable', 'unitCost'],
    transaction,
  });
  const quantity = lots.reduce((sum, lot) => sum + Number(lot.quantityAvailable), 0);
  const value = lots.reduce((sum, lot) => sum + Number(lot.quantityAvailable) * Number(lot.unitCost), 0);
  stock.averageUnitCost = quantity > 0 ? Math.round((value / quantity) * 10000) / 10000 : stock.averageUnitCost;
};

type GlobalStockAccumulator = {
  onHand: number;
  reserved: number;
  available: number;
  stockValue: number;
  consumedLast7Days: number;
  averageDailyUsage: number;
  minLevel: number;
  averageUnitCost: number;
  branchCount: number;
  branches: string[];
  [key: string]: unknown;
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

  /** Da de baja lotes vencidos una sola vez y registra su costo como merma. */
  async expireLots(branchId: number, existingTransaction?: Transaction): Promise<void> {
    const execute = async (transaction: Transaction) => {
      const today = zonedParts(new Date()).isoDate;
      const candidates = await InventoryLot.findAll({ where: {
        branchId, status: { [Op.in]: [INVENTORY_LOT_STATUS.ACTIVE, INVENTORY_LOT_STATUS.EXPIRED] },
        quantityAvailable: { [Op.gt]: 0 }, expiresAt: { [Op.lt]: today },
      }, attributes: ['id', 'inventoryItemId'], transaction });
      for (const candidate of candidates) {
        const stock = await BranchInventory.findOne({ where: { branchId, inventoryItemId: candidate.inventoryItemId }, transaction, lock: transaction.LOCK.UPDATE });
        const lot = await InventoryLot.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!lot || Number(lot.quantityAvailable) <= 0 || !lot.expiresAt || String(lot.expiresAt) >= today) continue;
        const quantity = Number(lot.quantityAvailable);
        lot.quantityAvailable = 0;
        lot.status = INVENTORY_LOT_STATUS.EXPIRED;
        await lot.save({ transaction });
        if (!stock) continue;
        stock.onHand = round2(Math.max(0, Number(stock.onHand) - quantity));
        await recalculateAverageCost(stock, transaction);
        await stock.save({ transaction });
        await writeMovement(stock, MOVEMENT_TYPE.WASTE, quantity, {
          lotId: lot.id, unitCost: Number(lot.unitCost), totalCost: round2(quantity * Number(lot.unitCost)), reason: `Vencimiento del lote ${lot.lotCode}`,
        }, transaction);
        await syncOptionAvailability(branchId, candidate.inventoryItemId, transaction);
      }
    };
    if (existingTransaction) await execute(existingTransaction);
    else await sequelize.transaction(execute);
  },

  /** Registra una entrada asociada a un lote de compra y actualiza el costo promedio. */
  async receiveLot(input: {
    branchId: number;
    inventoryItemId: number;
    lotId?: number | null;
    quantity: number;
    unitCost: number;
    purchaseOrderId?: number | null;
    actorId: number;
    reason?: string;
    idempotencyKey?: string;
  }, existingTransaction?: Transaction) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw ApiError.badRequest('La cantidad recibida debe ser mayor que cero');
    if (!Number.isFinite(input.unitCost) || input.unitCost < 0) throw ApiError.badRequest('El costo unitario no puede ser negativo');

    const execute = async (transaction: Transaction) => {
      const [stock] = await BranchInventory.findOrCreate({
        where: { branchId: input.branchId, inventoryItemId: input.inventoryItemId },
        defaults: { branchId: input.branchId, inventoryItemId: input.inventoryItemId, onHand: 0, reserved: 0 },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const oldOnHand = Number(stock.onHand);
      const oldAverage = Number(stock.averageUnitCost ?? input.unitCost);
      const nextOnHand = round2(oldOnHand + input.quantity);
      stock.onHand = nextOnHand;
      stock.averageUnitCost = Math.round(((((oldOnHand * oldAverage) + (input.quantity * input.unitCost)) / Math.max(nextOnHand, 1))) * 10000) / 10000;
      await stock.save({ transaction });
      await writeMovement(stock, MOVEMENT_TYPE.PURCHASE, input.quantity, {
        actorId: input.actorId,
        reason: input.reason ?? 'Recepción de compra',
        lotId: input.lotId ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        unitCost: input.unitCost,
        totalCost: round2(input.quantity * input.unitCost),
        idempotencyKey: input.idempotencyKey,
      }, transaction);
      await syncOptionAvailability(input.branchId, input.inventoryItemId, transaction);
      return stock;
    };
    return existingTransaction ? execute(existingTransaction) : sequelize.transaction(execute);
  },

  /** Comprueba insumos antes de mostrar el pago; evita vender una combinación que ya no puede prepararse. */
  async assertCartAvailability(
    branchId: number,
    items: Array<{ productId: number; variantId: number; quantity: number; requestedServings?: number; designQuoteId?: number; themeId?: number; themeVersion?: number; selections?: Array<{ optionId: number; quantity: number }> }>,
  ) {
    await inventoryService.expireLots(branchId);
    const requirements: Requirement = new Map();
    for (const item of items) {
      const theme = await resolveCakeTheme(item);
      for (const material of theme?.rule.materials ?? []) addRequirement(requirements, material.inventoryItemId, round2(material.quantity * item.quantity));
      const quote = item.designQuoteId ? await CakeDesignQuote.findByPk(item.designQuoteId) : null;
      const request = quote ? await CakeDesignRequest.findByPk(quote.requestId, { attributes: ['requestKind'] }) : null;
      const isFreeform = request?.requestKind === 'FREEFORM';
      const servingRule = await resolveCakeCustomServings(item.productId, item.variantId, item.requestedServings);
      if (!isFreeform) {
        const recipe = await Recipe.findOne({ where: { variantId: item.variantId, isActive: true }, include: [{ model: RecipeItem, as: 'items' }] });
        for (const line of ((recipe?.get('items') as RecipeItem[] | undefined) ?? [])) {
          addRequirement(requirements, line.inventoryItemId, round2(Number(line.quantity) * (1 + Number(line.wastePercent) / 100) * servingRule.scale * item.quantity / Math.max(1, Number(recipe?.yieldQuantity ?? 1))));
        }
      }
      const selections = isFreeform ? [] : item.selections ?? [];
      const options = selections.length ? await CustomizationOption.findAll({ where: { id: selections.map((selection) => selection.optionId) } }) : [];
      const byId = new Map(options.map((option) => [option.id, option]));
      for (const selection of selections) {
        const option = byId.get(selection.optionId);
        if (option?.inventoryItemId) addRequirement(requirements, option.inventoryItemId, round2(Number(option.consumptionQuantity) * selection.quantity * item.quantity * (option.cakeScaleWithServings ? servingRule.scale : 1)));
      }
      if (quote?.status === 'ACCEPTED') for (const extra of quote.materialExtrasJson ?? []) addRequirement(requirements, extra.inventoryItemId, round2(extra.quantity));
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
    code?: string;
    name: string;
    itemType?: 'INGREDIENT' | 'FINISHED_PRODUCT';
    unit: string;
    unitCost: number;
    imageUrl?: string | null;
    allergens?: string[] | null;
    minLevel: number;
    initialStock: number;
    actorId: number;
  }) {
    // Los clientes actuales pueden seguir enviando código; el panel nuevo lo genera aquí.
    const code = input.code?.trim().toUpperCase() || generatedItemCode();
    const existing = await InventoryItem.findOne({ where: { code } });
    if (existing) throw ApiError.conflict('Ya existe un insumo con ese código');
    const sameName = await InventoryItem.findOne({ where: { name: input.name.trim(), unit: input.unit.trim().toLowerCase() } });
    await validateAllergens(input.allergens);
    if (sameName) throw ApiError.conflict(sameName.isActive
      ? 'Ya existe un insumo con ese nombre y unidad. Búscalo en el maestro para habilitarlo en esta cocina.'
      : 'Ese insumo está archivado. Restáuralo desde el maestro en lugar de duplicarlo.');

    return sequelize.transaction(async (transaction) => {
      await validateItemImage(input.imageUrl, transaction);
      const item = await InventoryItem.create(
        {
          code,
          name: input.name.trim(),
          itemType: input.itemType ?? 'INGREDIENT',
          unit: input.unit.trim().toLowerCase(),
          unitCost: input.unitCost,
          imageUrl: input.imageUrl ?? null,
          allergens: input.allergens ?? null,
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
          averageUnitCost: input.unitCost,
        },
        { transaction },
      );

      if (input.initialStock > 0) {
        await writeMovement(
          stock,
          MOVEMENT_TYPE.PURCHASE,
          input.initialStock,
          { actorId: input.actorId, reason: 'Stock inicial del insumo', unitCost: input.unitCost, totalCost: round2(input.initialStock * input.unitCost) },
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
      InventoryItem.findAll({ order: [['isActive', 'DESC'], ['name', 'ASC']] }),
      BranchInventory.findAll({ where: { branchId }, attributes: ['inventoryItemId'] }),
    ]);

    const enabled = new Set(enabledRows.map((row) => row.inventoryItemId));

    return items.map((item) => ({
      inventoryItemId: item.id,
      code: item.code,
      name: item.name,
      itemType: item.itemType,
      unit: item.unit,
      minLevel: Number(item.minLevel),
      imageUrl: item.imageUrl,
      allergens: item.allergens,
      isActive: item.isActive,
      isEnabledInBranch: enabled.has(item.id),
    }));
  },

  /** El costo de referencia y el mínimo son del insumo; el costo promedio histórico del stock no se reescribe. */
  async updateItem(input: { branchId: number; inventoryItemId: number; name: string; itemType?: 'INGREDIENT' | 'FINISHED_PRODUCT'; unit: string; unitCost: number; minLevel: number; imageUrl?: string | null; allergens?: string[] | null }) {
    await validateAllergens(input.allergens);
    const updatedItem = await sequelize.transaction(async (transaction) => {
      const stock = await BranchInventory.findOne({ where: { branchId: input.branchId, inventoryItemId: input.inventoryItemId }, transaction });
      if (!stock) throw ApiError.notFound('Insumo no habilitado en esta cocina');
      const item = await InventoryItem.findByPk(input.inventoryItemId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!item || !item.isActive) throw ApiError.notFound('Insumo no encontrado');
      await validateItemImage(input.imageUrl, transaction);
      const unit = input.unit.trim().toLowerCase();
      const unitChanged = unit !== item.unit;
      const duplicate = await InventoryItem.findOne({ where: { name: input.name.trim(), unit, id: { [Op.ne]: item.id } }, transaction });
      if (duplicate) throw ApiError.conflict('Ya existe otro insumo con ese nombre y unidad');
      if (unitChanged) {
        const [balance, movement, lot, recipe, option, purchase] = await Promise.all([
          BranchInventory.findOne({ where: { inventoryItemId: item.id, [Op.or]: [{ onHand: { [Op.ne]: 0 } }, { reserved: { [Op.ne]: 0 } }] }, transaction }),
          InventoryMovement.findOne({ where: { inventoryItemId: item.id }, transaction }),
          InventoryLot.findOne({ where: { inventoryItemId: item.id }, transaction }),
          RecipeItem.findOne({ where: { inventoryItemId: item.id }, transaction }),
          CustomizationOption.findOne({ where: { inventoryItemId: item.id }, transaction }),
          PurchaseOrderItem.findOne({ where: { inventoryItemId: item.id }, transaction }),
        ]);
        if (balance || movement || lot || recipe || option || purchase || await usedInCakeTheme(item.id, transaction)) {
          throw ApiError.conflict('La unidad ya aparece en stock, movimientos, compras o recetas. Crea un insumo nuevo para usar otra unidad.');
        }
      }
      if (input.itemType && input.itemType !== item.itemType) {
        const usage = await RecipeItem.findOne({ where: { inventoryItemId: item.id }, transaction });
        if (usage || await usedInCakeTheme(item.id, transaction)) throw ApiError.conflict('Este artículo ya forma parte de una receta o diseño. Crea otro artículo para cambiar entre insumo y producto terminado.');
      }
      await item.update({ name: input.name.trim(), unit, itemType: input.itemType ?? item.itemType, unitCost: input.unitCost, minLevel: input.minLevel, ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}), ...(input.allergens !== undefined ? { allergens: input.allergens } : {}) }, { transaction });
      if (input.allergens !== undefined) await refreshCakesUsingInventoryItem(item.id, transaction);
      if (unitChanged) {
        await BranchInventory.update({ averageUnitCost: input.unitCost }, { where: { inventoryItemId: item.id }, transaction });
      }
      return item;
    });
    return updatedItem;
  },

  /** Oculta el insumo sin romper movimientos, compras o costos ya registrados. */
  async archiveItem(input: { branchId: number; inventoryItemId: number }) {
    return sequelize.transaction(async (transaction) => {
      const item = await InventoryItem.findByPk(input.inventoryItemId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!item || !item.isActive) throw ApiError.notFound('Insumo activo no encontrado');
      const enabled = await BranchInventory.findOne({ where: { branchId: input.branchId, inventoryItemId: item.id }, transaction });
      if (!enabled) throw ApiError.notFound('Insumo no habilitado en esta cocina');
      const [stock, lot, recipe, option, pendingPurchase] = await Promise.all([
        BranchInventory.findOne({ where: { inventoryItemId: item.id, [Op.or]: [{ onHand: { [Op.gt]: 0 } }, { reserved: { [Op.gt]: 0 } }] }, transaction }),
        InventoryLot.findOne({ where: { inventoryItemId: item.id, quantityAvailable: { [Op.gt]: 0 } }, transaction }),
        RecipeItem.findOne({ where: { inventoryItemId: item.id }, transaction }),
        CustomizationOption.findOne({ where: { inventoryItemId: item.id }, transaction }),
        PurchaseOrderItem.findOne({ where: { inventoryItemId: item.id }, include: [{ model: PurchaseOrder, as: 'purchaseOrder', required: true, where: { status: { [Op.in]: ['DRAFT', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'] } } }], transaction }),
      ]);
      if (stock) throw ApiError.conflict('Antes de archivar, deja el stock físico y reservado en cero en todas las cocinas');
      if (lot) throw ApiError.conflict('El insumo tiene lotes con saldo; ciérralos antes de archivarlo');
      if (recipe || option || await usedInCakeTheme(item.id, transaction)) throw ApiError.conflict('El insumo está vinculado a una receta, opción o diseño. Quita esa relación antes de archivarlo');
      if (pendingPurchase) throw ApiError.conflict('El insumo tiene una orden de compra pendiente');
      await item.update({ isActive: false }, { transaction });
      return item;
    });
  },

  /** El borrado físico solo corrige altas sin uso; nunca elimina trazabilidad. */
  async deleteArchivedItem(input: { branchId: number; inventoryItemId: number }) {
    try {
      return await sequelize.transaction(async (transaction) => {
        const item = await InventoryItem.findByPk(input.inventoryItemId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!item) throw ApiError.notFound('Insumo no encontrado');
        if (item.isActive) throw ApiError.conflict('Archiva el insumo antes de eliminarlo definitivamente');

        const stocks = await BranchInventory.findAll({ where: { inventoryItemId: item.id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!stocks.some((stock) => stock.branchId === input.branchId)) throw ApiError.notFound('Insumo no encontrado en esta cocina');
        if (stocks.some((stock) => Number(stock.onHand) !== 0 || Number(stock.reserved) !== 0)) {
          throw ApiError.conflict('No se puede eliminar: todavía hay stock físico o reservado en una cocina');
        }

        const [movement, lot, recipe, option, purchase] = await Promise.all([
          InventoryMovement.findOne({ where: { inventoryItemId: item.id }, transaction }),
          InventoryLot.findOne({ where: { inventoryItemId: item.id }, transaction }),
          RecipeItem.findOne({ where: { inventoryItemId: item.id }, transaction }),
          CustomizationOption.findOne({ where: { inventoryItemId: item.id }, transaction }),
          PurchaseOrderItem.findOne({ where: { inventoryItemId: item.id }, transaction }),
        ]);
        if (movement || lot || purchase) {
          throw ApiError.conflict('No se puede eliminar: el insumo tiene movimientos, lotes o compras. Consérvalo archivado para mantener el historial');
        }
        if (recipe || option || await usedInCakeTheme(item.id, transaction)) {
          throw ApiError.conflict('No se puede eliminar: el insumo está vinculado a una receta, opción o diseño. Quita la relación primero');
        }

        const [quote, costSnapshot] = await Promise.all([
          sequelize.query<{ id: number }>(
            'SELECT id FROM cake_design_quotes WHERE JSON_CONTAINS(material_extras_json, :needle) = 1 LIMIT 1',
            { replacements: { needle: JSON.stringify({ inventoryItemId: item.id }) }, type: QueryTypes.SELECT, transaction },
          ),
          sequelize.query<{ order_id: number }>(
            'SELECT order_id FROM cake_order_cost_snapshots WHERE JSON_CONTAINS(materials_json, :needle) = 1 LIMIT 1',
            { replacements: { needle: JSON.stringify({ itemId: item.id }) }, type: QueryTypes.SELECT, transaction },
          ),
        ]);
        if (quote.length || costSnapshot.length) {
          throw ApiError.conflict('No se puede eliminar: el insumo figura en un presupuesto o costo de torta. Consérvalo archivado');
        }

        const deleted = { id: item.id, code: item.code, name: item.name };
        await BranchInventory.destroy({ where: { inventoryItemId: item.id }, transaction });
        await item.destroy({ transaction });
        return deleted;
      });
    } catch (error) {
      if (error instanceof ForeignKeyConstraintError) {
        throw ApiError.conflict('No se puede eliminar: el insumo aún tiene registros relacionados. Consérvalo archivado');
      }
      throw error;
    }
  },

  async restoreItem(input: { branchId: number; inventoryItemId: number }) {
    const enabled = await BranchInventory.findOne({ where: { branchId: input.branchId, inventoryItemId: input.inventoryItemId } });
    if (!enabled) throw ApiError.notFound('Insumo no encontrado en esta cocina');
    const item = await InventoryItem.findByPk(input.inventoryItemId);
    if (!item) throw ApiError.notFound('Insumo no encontrado');
    if (!item.isActive) await item.update({ isActive: true });
    return item;
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
          averageUnitCost: Number(item.unitCost),
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
          { actorId: input.actorId, reason: `Stock inicial al habilitar ${item.name} en la cocina`, unitCost: Number(item.unitCost), totalCost: round2(input.initialStock * Number(item.unitCost)) },
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
    await inventoryService.expireLots(order.branchId, transaction);
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
      // Una comanda de salón puede crecer mientras cocina aún no la prepara.
      // Solo reservamos el delta: repetir la operación sigue siendo idempotente.
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
      const consumed = await InventoryMovement.sum('quantity', {
        where: {
          orderId: order.id,
          branchId: reservation.branchId,
          inventoryItemId,
          type: MOVEMENT_TYPE.CONSUME,
        },
        transaction,
      });
      // Una torta programada puede haber empezado su horneado antes de que la
      // comanda de entrega entre al KDS. No liberes la reserva ya consumida.
      const pendingRelease = Math.max(0, reservation.quantity - Number(released ?? 0) - Number(consumed ?? 0));
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

    const reservedByItem = new Map<string, { branchId: number; inventoryItemId: number; quantity: number }>();
    for (const movement of movements) {
      const key = `${movement.branchId}:${movement.inventoryItemId}`;
      const prior = reservedByItem.get(key);
      reservedByItem.set(key, { branchId: movement.branchId, inventoryItemId: movement.inventoryItemId, quantity: round2((prior?.quantity ?? 0) + Number(movement.quantity)) });
    }
    for (const movement of reservedByItem.values()) {
      const consumed = Number(await InventoryMovement.sum('quantity', { where: { orderId: order.id, branchId: movement.branchId, inventoryItemId: movement.inventoryItemId, type: MOVEMENT_TYPE.CONSUME }, transaction }) ?? 0);
      if (consumed >= movement.quantity) continue;
      const stock = await BranchInventory.findOne({
        where: { branchId: movement.branchId, inventoryItemId: movement.inventoryItemId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!stock) continue;

      const quantity = round2(movement.quantity - consumed);

      if (Number(stock.onHand) < quantity || Number(stock.reserved) < quantity) {
        throw ApiError.conflict(`El insumo ${stock.inventoryItemId} ya no alcanza para preparar ${order.orderNumber}; revisa los lotes y la reserva`);
      }

      stock.onHand = round2(Number(stock.onHand) - quantity);
      stock.reserved = round2(Number(stock.reserved) - quantity);
      const allocations = await allocateLots(stock.branchId, stock.inventoryItemId, quantity, transaction);
      await recalculateAverageCost(stock, transaction);
      await stock.save({ transaction });

      for (const allocation of allocations) {
        const unitCost = allocation.lotId ? allocation.unitCost : Number(stock.averageUnitCost || 0);
        await writeMovement(stock, MOVEMENT_TYPE.CONSUME, allocation.quantity, {
          orderId: order.id,
          actorId,
          reason: `Preparacion del pedido ${order.orderNumber}`,
          lotId: allocation.lotId,
          unitCost,
          totalCost: round2(allocation.quantity * unitCost),
        }, transaction);
      }

      await syncOptionAvailability(stock.branchId, stock.inventoryItemId, transaction);
    }
  },

  /** Ajusta la diferencia entre la receta congelada y el uso real sin duplicar movimientos. */
  async correctOrderMaterial(order: Order, itemId: number, delta: number, wasteDelta: number, actorId: number, transaction: Transaction): Promise<void> {
    const stock = await BranchInventory.findOne({ where: { branchId: order.branchId, inventoryItemId: itemId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!stock) throw ApiError.notFound('Insumo no encontrado en la sucursal');
    const baseline = Number(await InventoryMovement.sum('quantity', { where: { orderId: order.id, inventoryItemId: itemId, type: MOVEMENT_TYPE.CONSUME }, transaction }) ?? 0);
    if (baseline <= 0) throw ApiError.conflict('Inicia la preparacion en Cocina antes de registrar materiales reales');
    if (delta > 0) {
      if (delta > stock.available) throw ApiError.unprocessable('No hay stock disponible para el consumo adicional');
      stock.onHand = round2(Number(stock.onHand) - delta);
      const allocations = await allocateLots(order.branchId, itemId, delta, transaction);
      await recalculateAverageCost(stock, transaction);
      await stock.save({ transaction });
      let wasteLeft = round2(Math.min(delta, wasteDelta));
      for (const allocation of allocations) {
        const unitCost = allocation.lotId ? allocation.unitCost : Number(stock.averageUnitCost || 0);
        const wasteQuantity = Math.min(allocation.quantity, wasteLeft);
        const consumedQuantity = round2(allocation.quantity - wasteQuantity);
        if (wasteQuantity > 0) await writeMovement(stock, MOVEMENT_TYPE.WASTE, wasteQuantity, { orderId: order.id, actorId, lotId: allocation.lotId, unitCost, totalCost: round2(wasteQuantity * unitCost), reason: `Merma adicional de ${order.orderNumber}` }, transaction);
        if (consumedQuantity > 0) await writeMovement(stock, MOVEMENT_TYPE.CONSUME, consumedQuantity, { orderId: order.id, actorId, lotId: allocation.lotId, unitCost, totalCost: round2(consumedQuantity * unitCost), reason: `Consumo adicional de ${order.orderNumber}` }, transaction);
        wasteLeft = round2(wasteLeft - wasteQuantity);
      }
    } else if (delta < 0) {
      let remaining = round2(-delta);
      const consumed = await InventoryMovement.findAll({ where: { orderId: order.id, inventoryItemId: itemId, type: { [Op.in]: [MOVEMENT_TYPE.CONSUME, MOVEMENT_TYPE.WASTE] } }, order: [['id', 'DESC']], transaction });
      const returned = await InventoryMovement.findAll({ where: { orderId: order.id, inventoryItemId: itemId, type: MOVEMENT_TYPE.ADJUSTMENT, reason: { [Op.like]: 'Correccion de consumo%' } }, transaction });
      const returnedByLot = new Map<string, number>();
      for (const movement of returned) { const key = String(movement.lotId ?? 'none'); returnedByLot.set(key, round2((returnedByLot.get(key) ?? 0) + Number(movement.quantity))); }
      for (const movement of consumed) {
        if (remaining <= 0) break;
        const key = String(movement.lotId ?? 'none');
        const alreadyReturned = returnedByLot.get(key) ?? 0;
        const available = Math.max(0, Number(movement.quantity) - alreadyReturned);
        returnedByLot.set(key, Math.max(0, alreadyReturned - Number(movement.quantity)));
        const quantity = round2(Math.min(available, remaining));
        if (quantity <= 0) continue;
        if (movement.lotId) {
          const lot = await InventoryLot.findByPk(movement.lotId, { transaction, lock: transaction.LOCK.UPDATE });
          if (!lot || lot.status === INVENTORY_LOT_STATUS.EXPIRED || lot.status === INVENTORY_LOT_STATUS.BLOCKED || (lot.expiresAt && String(lot.expiresAt) < zonedParts(new Date()).isoDate)) throw ApiError.conflict('No se puede devolver material a un lote vencido o bloqueado');
          lot.quantityAvailable = round2(Number(lot.quantityAvailable) + quantity);
          lot.status = INVENTORY_LOT_STATUS.ACTIVE;
          await lot.save({ transaction });
        }
        stock.onHand = round2(Number(stock.onHand) + quantity);
        await recalculateAverageCost(stock, transaction);
        await stock.save({ transaction });
        const unitCost = Number(movement.unitCost ?? stock.averageUnitCost ?? 0);
        await writeMovement(stock, MOVEMENT_TYPE.ADJUSTMENT, quantity, { orderId: order.id, actorId, lotId: movement.lotId, unitCost, totalCost: -round2(quantity * unitCost), reason: `Correccion de consumo de ${order.orderNumber}` }, transaction);
        remaining = round2(remaining - quantity);
      }
      if (remaining > 0) throw ApiError.unprocessable('La devolucion supera lo consumido por este pedido');
    }
    await syncOptionAvailability(order.branchId, itemId, transaction);
  },

  /** Registra merma real adicional detectada al decorar una torta. */
  async registerWasteForOrder(order: Order, itemId: number, quantity: number, actorId: number | null, transaction: Transaction): Promise<void> {
    if (!Number.isFinite(quantity) || quantity <= 0) throw ApiError.badRequest('La merma debe ser mayor que cero');
    const stock = await BranchInventory.findOne({
      where: { branchId: order.branchId, inventoryItemId: itemId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!stock || quantity > stock.available) throw ApiError.unprocessable('No hay stock disponible para registrar esa merma');
    stock.onHand = round2(Number(stock.onHand) - quantity);
    const allocations = await allocateLots(stock.branchId, stock.inventoryItemId, quantity, transaction);
    await recalculateAverageCost(stock, transaction);
    await stock.save({ transaction });
    for (const allocation of allocations) {
      const unitCost = allocation.lotId ? allocation.unitCost : Number(stock.averageUnitCost || 0);
      await writeMovement(stock, MOVEMENT_TYPE.WASTE, allocation.quantity, {
        orderId: order.id,
        actorId,
        reason: `Merma real de materiales de ${order.orderNumber}`,
        lotId: allocation.lotId,
        unitCost,
        totalCost: round2(allocation.quantity * unitCost),
      }, transaction);
    }
    await syncOptionAvailability(stock.branchId, stock.inventoryItemId, transaction);
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
    expectedOnHand?: number;
    expectedReserved?: number;
    actorId: number;
    reason: string;
    idempotencyKey?: string;
  }) {
    if (!Number.isFinite(input.quantity) || Math.abs(input.quantity * 100 - Math.round(input.quantity * 100)) > 0.000001) {
      throw ApiError.badRequest('La cantidad debe tener como máximo dos decimales');
    }
    if (input.type === MOVEMENT_TYPE.ADJUSTMENT) {
      if (input.quantity === 0) {
        throw ApiError.badRequest('El conteo coincide con el sistema: no hay nada que ajustar');
      }
    } else if (input.quantity <= 0) {
      throw ApiError.badRequest('La cantidad debe ser positiva');
    }

    return sequelize.transaction(async (transaction) => {
      const item = await InventoryItem.findByPk(input.inventoryItemId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!item || !item.isActive) throw ApiError.notFound('Insumo activo no encontrado');
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

      if (input.idempotencyKey) {
        const previous = await InventoryMovement.findOne({
          where: { branchId: input.branchId, idempotencyKey: input.idempotencyKey },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (previous) {
          if (previous.inventoryItemId !== input.inventoryItemId || previous.type !== input.type) {
            throw ApiError.conflict('La clave de reintento ya fue usada para otro movimiento');
          }
          return stock;
        }
      }

      const current = Number(stock.onHand);

      if ((input.expectedOnHand !== undefined && round2(input.expectedOnHand) !== round2(current))
        || (input.expectedReserved !== undefined && round2(input.expectedReserved) !== round2(Number(stock.reserved)))) {
        throw ApiError.conflict('El stock o sus reservas cambiaron mientras registrabas el movimiento. Actualiza y vuelve a revisar el saldo.');
      }
      if ((input.type === MOVEMENT_TYPE.PURCHASE || input.type === MOVEMENT_TYPE.ADJUSTMENT && input.quantity > 0)
        && current + input.quantity > 9_999_999_999.99) {
        throw ApiError.unprocessable('El saldo final supera el máximo permitido');
      }

      if (input.type === MOVEMENT_TYPE.PURCHASE) {
        stock.onHand = round2(current + input.quantity);
        const unitCost = Number(item.unitCost ?? stock.averageUnitCost ?? 0);
        const previousCost = Number(stock.averageUnitCost) > 0 ? Number(stock.averageUnitCost) : unitCost;
        stock.averageUnitCost = round4(((current * previousCost) + (input.quantity * unitCost)) / Math.max(Number(stock.onHand), 1));
        await stock.save({ transaction });
        await writeMovement(stock, input.type, input.quantity, {
          actorId: input.actorId, reason: input.reason, unitCost, totalCost: round2(input.quantity * unitCost), idempotencyKey: input.idempotencyKey,
        }, transaction);
      } else if (input.type === MOVEMENT_TYPE.ADJUSTMENT || input.type === MOVEMENT_TYPE.WASTE) {
        // El ajuste llega con signo; la merma llega positiva. Ambos deben dejar
        // intactas las unidades reservadas para pedidos ya pagados.
        const reduction = input.type === MOVEMENT_TYPE.WASTE ? input.quantity : Math.max(0, -input.quantity);
        if (reduction > round2(stock.available)) {
          throw ApiError.unprocessable(`No puedes retirar ${reduction}: solo hay ${round2(stock.available)} disponibles y ${round2(Number(stock.reserved))} reservados`);
        }

        if (reduction > 0) {
          const fallbackUnitCost = Number(stock.averageUnitCost || item.unitCost || 0);
          let removedValue = 0;
          // La salida manual también agota lotes FIFO. De otro modo un lote
          // seguiría apareciendo disponible después de haberlo mermado físicamente.
          const allocations = await allocateLots(stock.branchId, stock.inventoryItemId, reduction, transaction, true);
          let movementRecorded = false;
          for (const allocation of allocations) {
            stock.onHand = round2(Number(stock.onHand) - allocation.quantity);
            await stock.save({ transaction });
            const unitCost = allocation.lotId ? allocation.unitCost : fallbackUnitCost;
            removedValue += allocation.quantity * unitCost;
            await writeMovement(stock, input.type, input.type === MOVEMENT_TYPE.WASTE ? allocation.quantity : -allocation.quantity, {
              actorId: input.actorId, reason: input.reason, lotId: allocation.lotId,
              unitCost, totalCost: round2(allocation.quantity * unitCost), idempotencyKey: movementRecorded ? null : input.idempotencyKey,
            }, transaction);
            movementRecorded = true;
          }
          // Conservar en el promedio el stock sin lote (entradas manuales o
          // saldos iniciales). Recalcular solo desde los lotes lo valoraría mal.
          stock.averageUnitCost = Number(stock.onHand) > 0
            ? round4(Math.max(0, (current * fallbackUnitCost - removedValue) / Number(stock.onHand)))
            : fallbackUnitCost;
          await stock.save({ transaction });
        } else {
          stock.onHand = round2(current + input.quantity);
          await stock.save({ transaction });
          const unitCost = Number(stock.averageUnitCost || item.unitCost || 0);
          await writeMovement(stock, input.type, input.quantity, {
            actorId: input.actorId, reason: input.reason, unitCost, totalCost: round2(input.quantity * unitCost), idempotencyKey: input.idempotencyKey,
          }, transaction);
        }
      } else {
        throw ApiError.badRequest('Tipo de movimiento no permitido desde el panel');
      }

      await syncOptionAvailability(input.branchId, input.inventoryItemId, transaction);
      return stock;
    });
  },

  async createTransfer(input: {
    sourceBranchId: number;
    destinationBranchId: number;
    notes?: string | null;
    actorId: number;
    items: Array<{ inventoryItemId: number; quantity: number }>;
  }) {
    if (input.sourceBranchId === input.destinationBranchId) throw ApiError.badRequest('La sucursal de origen y destino deben ser distintas');
    if (!input.items.length) throw ApiError.badRequest('Agrega al menos un insumo a la transferencia');
    const distinct = new Set(input.items.map((line) => line.inventoryItemId));
    if (distinct.size !== input.items.length || input.items.some((line) => !(line.quantity > 0))) throw ApiError.badRequest('No repitas insumos y usa cantidades mayores que cero');
    const [source, destination, items] = await Promise.all([
      Branch.findByPk(input.sourceBranchId), Branch.findByPk(input.destinationBranchId), InventoryItem.findAll({ where: { id: [...distinct], isActive: true } }),
    ]);
    if (!source?.isActive || !destination?.isActive) throw ApiError.notFound('Sucursal de transferencia no encontrada');
    if (items.length !== distinct.size) throw ApiError.notFound('Uno de los insumos no existe o está archivado');
    return sequelize.transaction(async (transaction) => {
      const transfer = await InventoryTransfer.create({
        transferNumber: `TR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        sourceBranchId: input.sourceBranchId, destinationBranchId: input.destinationBranchId,
        status: INVENTORY_TRANSFER_STATUS.REQUESTED, requestedBy: input.actorId, requestedAt: new Date(), notes: input.notes?.trim() || null,
      }, { transaction });
      await InventoryTransferItem.bulkCreate(input.items.map((line) => ({ transferId: transfer.id, inventoryItemId: line.inventoryItemId, quantityRequested: round2(line.quantity), quantityShipped: 0, quantityReceived: 0, unitCost: 0 })), { transaction });
      return this.getTransfer(transfer.id, undefined, transaction);
    });
  },

  async getTransfer(id: number, branchId?: number, transaction?: Transaction) {
    const transfer = await InventoryTransfer.findOne({
      where: branchId ? { id, [Op.or]: [{ sourceBranchId: branchId }, { destinationBranchId: branchId }] } : { id },
      include: [
        { model: Branch, as: 'sourceBranch', attributes: ['id', 'name'] },
        { model: Branch, as: 'destinationBranch', attributes: ['id', 'name'] },
        { model: InventoryTransferItem, as: 'items', include: [{ model: InventoryItem, as: 'item', attributes: ['id', 'code', 'name', 'unit'] }] },
      ], transaction,
    });
    if (!transfer) throw ApiError.notFound('Transferencia no encontrada');
    const source = transfer.get('sourceBranch') as Branch | undefined;
    const destination = transfer.get('destinationBranch') as Branch | undefined;
    const items = (transfer.get('items') as InventoryTransferItem[] | undefined) ?? [];
    return {
      id: transfer.id, transferNumber: transfer.transferNumber, sourceBranch: source ? { id: source.id, name: source.name } : null,
      destinationBranch: destination ? { id: destination.id, name: destination.name } : null, status: transfer.status,
      notes: transfer.notes, requestedAt: transfer.requestedAt, approvedAt: transfer.approvedAt, shippedAt: transfer.shippedAt, receivedAt: transfer.receivedAt,
      items: items.map((line) => ({ id: line.id, inventoryItemId: line.inventoryItemId, item: line.item ? { id: line.item.id, code: line.item.code, name: line.item.name, unit: line.item.unit } : null, quantityRequested: Number(line.quantityRequested), quantityShipped: Number(line.quantityShipped), quantityReceived: Number(line.quantityReceived), unitCost: Number(line.unitCost) })),
    };
  },

  async listTransfers(branchId?: number) {
    const rows = await InventoryTransfer.findAll({
      where: branchId ? { [Op.or]: [{ sourceBranchId: branchId }, { destinationBranchId: branchId }] } : undefined,
      order: [['id', 'DESC']], limit: 100,
      include: [
        { model: Branch, as: 'sourceBranch', attributes: ['id', 'name'] },
        { model: Branch, as: 'destinationBranch', attributes: ['id', 'name'] },
        { model: InventoryTransferItem, as: 'items', include: [{ model: InventoryItem, as: 'item', attributes: ['id', 'code', 'name', 'unit'] }] },
      ],
    });
    return Promise.all(rows.map((row) => this.getTransfer(row.id, branchId)));
  },

  async approveTransfer(id: number, actorId: number, scopeCheck?: BranchScopeCheck) {
    return sequelize.transaction(async (transaction) => {
      const transfer = await InventoryTransfer.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!transfer) throw ApiError.notFound('Transferencia no encontrada');
      scopeCheck?.(transfer.sourceBranchId); scopeCheck?.(transfer.destinationBranchId);
      if (transfer.status !== INVENTORY_TRANSFER_STATUS.REQUESTED) throw ApiError.conflict('La transferencia ya no está pendiente de aprobación');
      transfer.status = INVENTORY_TRANSFER_STATUS.APPROVED; transfer.approvedBy = actorId; transfer.approvedAt = new Date(); await transfer.save({ transaction });
      return this.getTransfer(id, undefined, transaction);
    });
  },

  async shipTransfer(id: number, actorId: number, scopeCheck?: BranchScopeCheck) {
    return sequelize.transaction(async (transaction) => {
      const transfer = await InventoryTransfer.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!transfer) throw ApiError.notFound('Transferencia no encontrada');
      scopeCheck?.(transfer.sourceBranchId);
      if (transfer.status !== INVENTORY_TRANSFER_STATUS.APPROVED) throw ApiError.conflict('La transferencia debe aprobarse antes de despacharla');
      const lines = await InventoryTransferItem.findAll({ where: { transferId: id }, transaction, lock: transaction.LOCK.UPDATE });
      for (const line of lines) {
        const stock = await BranchInventory.findOne({ where: { branchId: transfer.sourceBranchId, inventoryItemId: line.inventoryItemId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!stock || stock.available < Number(line.quantityRequested)) throw ApiError.unprocessable(`No hay disponible suficiente para el insumo ${line.inventoryItemId}`);
        const allocations = await allocateLots(transfer.sourceBranchId, line.inventoryItemId, Number(line.quantityRequested), transaction);
        let weightedCost = 0;
        for (const allocation of allocations) {
          const unitCost = allocation.lotId ? allocation.unitCost : Number(stock.averageUnitCost);
          stock.onHand = round2(Number(stock.onHand) - allocation.quantity); await stock.save({ transaction });
          weightedCost += allocation.quantity * unitCost;
          await writeMovement(stock, MOVEMENT_TYPE.TRANSFER_OUT, allocation.quantity, { actorId, reason: `Transferencia ${transfer.transferNumber}`, lotId: allocation.lotId, unitCost, totalCost: round2(allocation.quantity * unitCost) }, transaction);
        }
        line.quantityShipped = Number(line.quantityRequested); line.unitCost = round4(weightedCost / Math.max(Number(line.quantityShipped), 1)); await line.save({ transaction });
        await recalculateAverageCost(stock, transaction); await stock.save({ transaction });
        await syncOptionAvailability(transfer.sourceBranchId, line.inventoryItemId, transaction);
      }
      transfer.status = INVENTORY_TRANSFER_STATUS.IN_TRANSIT; transfer.shippedBy = actorId; transfer.shippedAt = new Date(); await transfer.save({ transaction });
      return this.getTransfer(id, undefined, transaction);
    });
  },

  async receiveTransfer(id: number, actorId: number, scopeCheck?: BranchScopeCheck) {
    return sequelize.transaction(async (transaction) => {
      const transfer = await InventoryTransfer.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!transfer) throw ApiError.notFound('Transferencia no encontrada');
      scopeCheck?.(transfer.destinationBranchId);
      if (transfer.status !== INVENTORY_TRANSFER_STATUS.IN_TRANSIT) throw ApiError.conflict('La transferencia no está en tránsito');
      const lines = await InventoryTransferItem.findAll({ where: { transferId: id }, transaction, lock: transaction.LOCK.UPDATE });
      for (const line of lines) {
        const quantity = round2(Number(line.quantityShipped) - Number(line.quantityReceived));
        if (quantity <= 0) continue;
        const [stock] = await BranchInventory.findOrCreate({ where: { branchId: transfer.destinationBranchId, inventoryItemId: line.inventoryItemId }, defaults: { branchId: transfer.destinationBranchId, inventoryItemId: line.inventoryItemId, onHand: 0, reserved: 0, averageUnitCost: Number(line.unitCost) }, transaction, lock: transaction.LOCK.UPDATE });
        const oldOnHand = Number(stock.onHand); const unitCost = Number(line.unitCost);
        stock.onHand = round2(oldOnHand + quantity); stock.averageUnitCost = round4(((oldOnHand * Number(stock.averageUnitCost || unitCost)) + quantity * unitCost) / Math.max(Number(stock.onHand), 1)); await stock.save({ transaction });
        const lot = await InventoryLot.create({ branchId: transfer.destinationBranchId, inventoryItemId: line.inventoryItemId, lotCode: `${transfer.transferNumber}-${line.inventoryItemId}`, receivedAt: new Date(), expiresAt: null, quantityReceived: quantity, quantityAvailable: quantity, unitCost, status: INVENTORY_LOT_STATUS.ACTIVE }, { transaction });
        await writeMovement(stock, MOVEMENT_TYPE.TRANSFER_IN, quantity, { actorId, reason: `Recepción de ${transfer.transferNumber}`, lotId: lot.id, unitCost, totalCost: round2(quantity * unitCost) }, transaction);
        line.quantityReceived = Number(line.quantityShipped); await line.save({ transaction }); await syncOptionAvailability(transfer.destinationBranchId, line.inventoryItemId, transaction);
      }
      transfer.status = INVENTORY_TRANSFER_STATUS.RECEIVED; transfer.receivedBy = actorId; transfer.receivedAt = new Date(); await transfer.save({ transaction });
      return this.getTransfer(id, undefined, transaction);
    });
  },

  async cancelTransfer(id: number, reason: string, actorId: number, scopeCheck?: BranchScopeCheck) {
    return sequelize.transaction(async (transaction) => {
      const transfer = await InventoryTransfer.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!transfer) throw ApiError.notFound('Transferencia no encontrada');
      scopeCheck?.(transfer.sourceBranchId); scopeCheck?.(transfer.destinationBranchId);
      if ([INVENTORY_TRANSFER_STATUS.IN_TRANSIT, INVENTORY_TRANSFER_STATUS.RECEIVED].includes(transfer.status as 'IN_TRANSIT' | 'RECEIVED')) throw ApiError.conflict('Una transferencia despachada no puede cancelarse');
      transfer.status = INVENTORY_TRANSFER_STATUS.CANCELLED; transfer.notes = [transfer.notes, `Cancelada: ${reason}`, `Por usuario #${actorId}`].filter(Boolean).join(' · '); await transfer.save({ transaction });
      return this.getTransfer(id, undefined, transaction);
    });
  },

  async startCount(input: { branchId: number; name: string; actorId: number; inventoryItemIds?: number[]; notes?: string | null }) {
    return sequelize.transaction(async (transaction) => {
      const rows = await BranchInventory.findAll({ where: { branchId: input.branchId, ...(input.inventoryItemIds?.length ? { inventoryItemId: input.inventoryItemIds } : {}) }, include: [{ model: InventoryItem, as: 'item', where: { isActive: true }, required: true }], transaction, lock: transaction.LOCK.UPDATE });
      if (!rows.length) throw ApiError.badRequest('No hay insumos activos para contar en esta sucursal');
      const session = await InventoryCountSession.create({ branchId: input.branchId, name: input.name.trim(), status: INVENTORY_COUNT_STATUS.OPEN, startedBy: input.actorId, startedAt: new Date(), notes: input.notes?.trim() || null }, { transaction });
      await InventoryCountItem.bulkCreate(rows.map((row) => ({ sessionId: session.id, inventoryItemId: row.inventoryItemId, expectedOnHand: Number(row.onHand), countedOnHand: null, variance: null })), { transaction });
      return this.getCount(session.id, transaction);
    });
  },

  async getCount(id: number, transaction?: Transaction) {
    const session = await InventoryCountSession.findByPk(id, { include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }, { model: InventoryCountItem, as: 'items', include: [{ model: InventoryItem, as: 'item', attributes: ['id', 'code', 'name', 'unit'] }] }], transaction });
    if (!session) throw ApiError.notFound('Conteo no encontrado');
    const branch = session.get('branch') as Branch | undefined; const items = (session.get('items') as InventoryCountItem[] | undefined) ?? [];
    return { id: session.id, branch: branch ? { id: branch.id, name: branch.name } : null, name: session.name, status: session.status, startedAt: session.startedAt, submittedAt: session.submittedAt, approvedAt: session.approvedAt, notes: session.notes, items: items.map((item) => ({ id: item.id, inventoryItemId: item.inventoryItemId, item: item.item ? { id: item.item.id, code: item.item.code, name: item.item.name, unit: item.item.unit } : null, expectedOnHand: Number(item.expectedOnHand), countedOnHand: item.countedOnHand == null ? null : Number(item.countedOnHand), variance: item.variance == null ? null : Number(item.variance) })) };
  },

  async listCounts(branchId?: number) {
    const rows = await InventoryCountSession.findAll({ where: branchId ? { branchId } : undefined, order: [['id', 'DESC']], limit: 100 });
    return Promise.all(rows.map((row) => this.getCount(row.id)));
  },

  async updateCountItem(sessionId: number, itemId: number, countedOnHand: number, scopeCheck?: BranchScopeCheck) {
    if (!Number.isFinite(countedOnHand) || countedOnHand < 0) throw ApiError.badRequest('El conteo no puede ser negativo');
    const item = await InventoryCountItem.findOne({ where: { id: itemId, sessionId }, include: [{ model: InventoryCountSession, as: 'session' }] });
    if (!item) throw ApiError.notFound('Línea de conteo no encontrada');
    const session = item.get('session') as InventoryCountSession | undefined;
    if (!session || session.status !== INVENTORY_COUNT_STATUS.OPEN) throw ApiError.conflict('El conteo ya no está abierto');
    scopeCheck?.(session.branchId);
    item.countedOnHand = round2(countedOnHand); item.variance = round2(countedOnHand - Number(item.expectedOnHand)); await item.save();
    return this.getCount(sessionId);
  },

  async submitCount(sessionId: number, actorId: number, scopeCheck?: BranchScopeCheck) {
    return sequelize.transaction(async (transaction) => {
      const session = await InventoryCountSession.findByPk(sessionId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!session || session.status !== INVENTORY_COUNT_STATUS.OPEN) throw ApiError.conflict('El conteo ya no está abierto');
      scopeCheck?.(session.branchId);
      const items = await InventoryCountItem.findAll({ where: { sessionId }, transaction, lock: transaction.LOCK.UPDATE });
      if (items.some((item) => item.countedOnHand == null)) throw ApiError.badRequest('Completa todos los conteos antes de enviar a aprobación');
      session.status = INVENTORY_COUNT_STATUS.SUBMITTED; session.submittedBy = actorId; session.submittedAt = new Date(); await session.save({ transaction });
      return this.getCount(sessionId, transaction);
    });
  },

  async approveCount(sessionId: number, actorId: number, scopeCheck?: BranchScopeCheck) {
    return sequelize.transaction(async (transaction) => {
      const session = await InventoryCountSession.findByPk(sessionId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!session || session.status !== INVENTORY_COUNT_STATUS.SUBMITTED) throw ApiError.conflict('El conteo no está pendiente de aprobación');
      scopeCheck?.(session.branchId);
      const items = await InventoryCountItem.findAll({ where: { sessionId }, transaction, lock: transaction.LOCK.UPDATE });
      for (const count of items) {
        const stock = await BranchInventory.findOne({ where: { branchId: session.branchId, inventoryItemId: count.inventoryItemId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!stock) throw ApiError.notFound(`No existe stock para el insumo ${count.inventoryItemId}`);
        const current = Number(stock.onHand); const variance = round2(Number(count.countedOnHand) - current);
        if (round2(current) !== round2(Number(count.expectedOnHand))) throw ApiError.conflict('El inventario cambió durante el conteo. Crea un nuevo conteo para conservar la trazabilidad.');
        if (variance < 0 && Math.abs(variance) > round2(stock.available)) throw ApiError.unprocessable(`El conteo dejaría reservas sin respaldo en el insumo ${count.inventoryItemId}`);
        if (variance !== 0) {
          if (variance < 0) {
            const fallbackCost = Number(stock.averageUnitCost || 0);
            const allocations = await allocateLots(session.branchId, count.inventoryItemId, Math.abs(variance), transaction, true);
            let removedValue = 0;
            for (const allocation of allocations) {
              const unitCost = allocation.lotId ? allocation.unitCost : fallbackCost;
              stock.onHand = round2(Number(stock.onHand) - allocation.quantity); await stock.save({ transaction });
              removedValue += allocation.quantity * unitCost;
              await writeMovement(stock, MOVEMENT_TYPE.ADJUSTMENT, -allocation.quantity, { actorId, reason: `Ajuste aprobado por conteo #${session.id}`, lotId: allocation.lotId, unitCost, totalCost: round2(allocation.quantity * unitCost) }, transaction);
            }
            stock.averageUnitCost = Number(stock.onHand) > 0 ? round4(Math.max(0, (current * fallbackCost - removedValue) / Number(stock.onHand))) : fallbackCost;
            await stock.save({ transaction });
          } else {
            stock.onHand = round2(current + variance); await stock.save({ transaction });
            const unitCost = Number(stock.averageUnitCost || 0);
            await writeMovement(stock, MOVEMENT_TYPE.ADJUSTMENT, variance, { actorId, reason: `Ajuste aprobado por conteo #${session.id}`, unitCost, totalCost: round2(variance * unitCost) }, transaction);
          }
          await syncOptionAvailability(session.branchId, count.inventoryItemId, transaction);
        }
        count.variance = variance; await count.save({ transaction });
      }
      session.status = INVENTORY_COUNT_STATUS.APPROVED; session.approvedBy = actorId; session.approvedAt = new Date(); await session.save({ transaction });
      return this.getCount(sessionId, transaction);
    });
  },

  async cancelCount(sessionId: number, scopeCheck?: BranchScopeCheck) {
    const session = await InventoryCountSession.findByPk(sessionId);
    if (!session) throw ApiError.notFound('Conteo no encontrado');
    scopeCheck?.(session.branchId);
    if (session.status === INVENTORY_COUNT_STATUS.APPROVED) throw ApiError.conflict('Un conteo aprobado no se puede cancelar');
    session.status = INVENTORY_COUNT_STATUS.CANCELLED; await session.save(); return this.getCount(sessionId);
  },

  /** Stock de una sucursal, con aviso de los insumos bajo el minimo. */
  async listStock(branchId: number) {
    const rows = await BranchInventory.findAll({
      where: { branchId },
      include: [{ model: InventoryItem, as: 'item', where: { isActive: true }, required: true }],
      order: [['inventory_item_id', 'ASC']],
    });

    const itemIds = rows.map((row) => row.inventoryItemId);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [impacted, recentConsumption, cakeIngredients, themes] = await Promise.all([
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
      itemIds.length ? sequelize.query<{ inventoryItemId: number }>(`
        SELECT ri.inventory_item_id AS inventoryItemId
        FROM recipe_items ri
        JOIN recipes r ON r.id = ri.recipe_id AND r.is_active = 1
        JOIN product_variants pv ON pv.id = r.variant_id AND pv.is_active = 1
        JOIN cake_product_profiles cpp ON cpp.product_id = r.product_id
        WHERE ri.inventory_item_id IN (:itemIds)
        UNION
        SELECT co.inventory_item_id AS inventoryItemId
        FROM customization_options co
        JOIN product_customization_groups pcg ON pcg.group_id = co.group_id AND pcg.is_active = 1
        JOIN cake_product_profiles cpp ON cpp.product_id = pcg.product_id
        WHERE co.inventory_item_id IN (:itemIds) AND co.status = 'ACTIVE'
      `, { replacements: { itemIds }, type: QueryTypes.SELECT }) : [],
      itemIds.length ? CakeTheme.findAll({ attributes: ['variantRulesJson'] }) : [],
    ]);
    const cakeIngredientIds = new Set(cakeIngredients.map((row) => Number(row.inventoryItemId)));
    themes.forEach((theme) => theme.variantRulesJson.forEach((rule) => rule.materials.forEach((line) => cakeIngredientIds.add(line.inventoryItemId))));
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
        code: item?.code ?? '',
        imageUrl: item?.imageUrl ?? null,
        allergens: item?.allergens ?? null,
        itemType: item?.itemType ?? 'INGREDIENT',
        usedInCake: cakeIngredientIds.has(row.inventoryItemId),
        name: item?.name ?? '',
        unit: item?.unit ?? '',
        onHand: Number(row.onHand),
        reserved: Number(row.reserved),
        available,
        unitCost: Number(item?.unitCost ?? 0),
        averageUnitCost: round4(Number(row.averageUnitCost ?? item?.unitCost ?? 0)),
        // El stock reservado sigue en el almacén: solo deja de estar disponible para nuevas ventas.
        stockValue: round2(Number(row.onHand) * (Number(row.averageUnitCost) > 0 ? Number(row.averageUnitCost) : Number(item?.unitCost ?? 0))),
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

  /** Resumen consolidado para el superadmin: suma sucursales sin habilitar mutaciones globales. */
  async listGlobalStock() {
    const branches = await Branch.findAll({ where: { isActive: true }, attributes: ['id', 'name'], order: [['name', 'ASC']] });
    const byItem = new Map<number, GlobalStockAccumulator>();
    for (const branch of branches) {
      const rows = await inventoryService.listStock(branch.id);
      for (const row of rows) {
        const current = byItem.get(row.inventoryItemId);
        if (!current) {
          byItem.set(row.inventoryItemId, { ...row, branchCount: 1, branches: [branch.name] });
          continue;
        }
        current.onHand = round2(current.onHand + row.onHand);
        current.reserved = round2(current.reserved + row.reserved);
        current.available = round2(current.available + row.available);
        current.stockValue = round2(current.stockValue + row.stockValue);
        current.consumedLast7Days = round2(current.consumedLast7Days + row.consumedLast7Days);
        current.averageDailyUsage = round2(current.averageDailyUsage + row.averageDailyUsage);
        current.branchCount += 1;
        current.branches.push(branch.name);
      }
    }
    return [...byItem.values()].map((row) => ({
      ...row,
      averageUnitCost: row.onHand > 0 ? round4(row.stockValue / row.onHand) : row.averageUnitCost,
      available: round2(row.onHand - row.reserved),
      stockStatus: row.available <= 0 ? 'OUT' : row.available <= row.minLevel * 0.5 || (row.averageDailyUsage > 0 && row.available / row.averageDailyUsage <= 1) ? 'CRITICAL' : row.available <= row.minLevel || (row.averageDailyUsage > 0 && row.available / row.averageDailyUsage <= 3) ? 'LOW' : 'HEALTHY',
      isLow: row.available <= row.minLevel || (row.averageDailyUsage > 0 && row.available / row.averageDailyUsage <= 3),
      daysRemaining: row.averageDailyUsage > 0 ? round2(row.available / row.averageDailyUsage) : null,
      targetLevel: round2(Math.max(row.minLevel * 2, row.averageDailyUsage * 7, row.available <= 0 ? 1 : 0)),
      suggestedPurchase: round2(Math.max(0, Math.max(row.minLevel * 2, row.averageDailyUsage * 7, row.available <= 0 ? 1 : 0) - row.available)),
    }));
  },

  async listMovements(branchId: number | undefined, inventoryItemId?: number, limit = 30, filters: { type?: MovementType; from?: string; to?: string } = {}) {
    const createdAt = filters.from || filters.to ? {
      ...(filters.from ? { [Op.gte]: new Date(`${filters.from}T00:00:00Z`) } : {}),
      ...(filters.to ? { [Op.lte]: new Date(`${filters.to}T23:59:59Z`) } : {}),
    } : undefined;
    const rows = await InventoryMovement.findAll({
      where: { ...(branchId ? { branchId } : {}), ...(inventoryItemId ? { inventoryItemId } : {}), ...(filters.type ? { type: filters.type } : {}), ...(createdAt ? { createdAt } : {}) },
      include: [{ model: InventoryItem, as: 'item', attributes: ['name', 'code', 'unit'] }, { model: Branch, as: 'branch', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']],
      limit,
    });
    const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is number => id != null))];
    const actors = actorIds.length
      ? await User.findAll({ where: { id: { [Op.in]: actorIds } }, attributes: ['id', 'firstName', 'lastName'], paranoid: false })
      : [];
    const actorNames = new Map(actors.map((actor) => [actor.id, actor.fullName || `Usuario #${actor.id}`]));
    return rows.map((row) => {
      const item = row.get('item') as InventoryItem | undefined;
      const branch = row.get('branch') as Branch | undefined;
      return {
        id: row.id, inventoryItemId: row.inventoryItemId,
        branchId: row.branchId, branchName: branch?.name ?? null,
        itemName: item?.name ?? `Insumo #${row.inventoryItemId}`,
        unit: item?.unit ?? '', type: row.type, quantity: Number(row.quantity),
        onHandAfter: Number(row.onHandAfter), reservedAfter: Number(row.reservedAfter),
        totalCost: row.totalCost == null ? null : Number(row.totalCost),
        reason: row.reason, orderId: row.orderId, purchaseOrderId: row.purchaseOrderId,
        lotId: row.lotId, createdAt: row.createdAt,
        actorName: row.actorId == null ? null : actorNames.get(row.actorId) ?? `Usuario #${row.actorId}`,
      };
    });
  },
};

export type InventoryService = typeof inventoryService;
