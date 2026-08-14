import {
  Allergen,
  BranchOptionAvailability,
  Branch,
  BuilderPreset,
  BuilderPresetItem,
  CustomizationGroup,
  CustomizationOption,
  InventoryItem,
  OptionIncompatibility,
  Product,
  ProductCustomizationGroup,
  sequelize,
} from '@database/models';
import { SELECTION_TYPE, type SelectionType } from '@database/models/customizationGroup.model';
import { OPTION_STATUS, type OptionStatus } from '@database/models/customizationOption.model';
import { ApiError } from '@shared/errors/ApiError';

/**
 * ABM DEL CONSTRUCTOR DE BOWLS (M05).
 *
 * Aqui se definen las REGLAS del builder sin tocar codigo: cuantas opciones se
 * pueden elegir en cada paso, cuantas van incluidas, que cuesta cada extra, que
 * combinaciones se prohiben y que insumo descuenta cada opcion.
 */

/**
 * Los alergenos del ingrediente son CODIGOS del maestro, no texto libre.
 *
 * El motor los cruza contra las preferencias del cliente comparando cadenas: un
 * "sesamo" con tilde o un "Mariscos" en mayuscula no cruzan con nada y el aviso
 * de alergia deja de aparecer sin que nadie lo note. Un alergeno que no avisa es
 * peor que no tenerlo, asi que aqui se rechaza en vez de guardarse.
 */
const assertKnownAllergens = async (codes: string[]): Promise<void> => {
  const wanted = [...new Set(codes)];
  if (wanted.length === 0) return;

  const master = await Allergen.findAll({ attributes: ['code'] });
  const known = new Set(master.map((allergen) => allergen.code));
  const unknown = wanted.filter((code) => !known.has(code));

  if (unknown.length > 0) {
    throw ApiError.badRequest(
      `Estos alergenos no existen en el maestro: ${unknown.join(', ')}`,
    );
  }
};

/**
 * RN-005: una opcion enlazada a un insumo TIENE que declarar cuanto descuenta.
 *
 * Con cantidad 0 el enlace es decorativo: `addRequirement` descarta las
 * cantidades <= 0, la opcion nunca se agota sola y la promesa de Inventario ("si
 * un insumo llega a cero, las opciones que lo usan se marcan agotadas") deja de
 * cumplirse en silencio, porque la tabla del constructor ni siquiera mostraba el
 * insumo.
 */
const assertConsumption = (inventoryItemId: number | null, consumptionQuantity: number): void => {
  if (inventoryItemId !== null && consumptionQuantity <= 0) {
    throw ApiError.badRequest(
      'Indica cuanto insumo descuenta la opcion: con cantidad 0 no se descuenta nada ni se agota nunca',
    );
  }
};

/**
 * El orden recibido tiene que describir EXACTAMENTE lo que hay hoy.
 *
 * Renumerar una lista incompleta —porque otro administrador acaba de añadir una
 * opcion mientras esta pantalla estaba abierta— dejaria filas empatadas otra vez,
 * que es justo el defecto que este endpoint viene a cerrar.
 */
const assertSameSet = (current: number[], received: number[], label: string): void => {
  const receivedSet = new Set(received);

  if (received.length !== receivedSet.size) {
    throw ApiError.badRequest(`El orden recibido repite ${label}`);
  }

  if (current.length !== receivedSet.size || current.some((id) => !receivedSet.has(id))) {
    throw ApiError.unprocessable(
      `El orden recibido no coincide con ${label} de ahora. Recarga la pantalla e intentalo de nuevo.`,
    );
  }
};
export const customizationAdminService = {
  /** Pasos con sus opciones y las reglas efectivas de un producto. */
  async getConfig(productId: number) {
    const product = await Product.findByPk(productId);
    if (!product) throw ApiError.notFound('Producto no encontrado');

    const links = await ProductCustomizationGroup.findAll({
      where: { productId },
      include: [
        {
          model: CustomizationGroup,
          as: 'group',
          include: [{ model: CustomizationOption, as: 'options' }],
        },
      ],
    });

    const optionIds = links.flatMap(
      (link) =>
        (link.get('group') as CustomizationGroup | undefined)?.options?.map(
          (option) => option.id,
        ) ?? [],
    );

    const incompatibilities = await OptionIncompatibility.findAll({
      where: { optionId: optionIds },
    });

    const inventoryItems = await InventoryItem.findAll({ where: { isActive: true } });
    const branches = await Branch.findAll({ where: { isActive: true }, order: [['name', 'ASC']] });
    const availability = optionIds.length
      ? await BranchOptionAvailability.findAll({ where: { optionId: optionIds } })
      : [];
    const presets = await BuilderPreset.findAll({
      where: { productId },
      include: [{ model: BuilderPresetItem, as: 'items', required: false }],
      order: [['sortOrder', 'ASC']],
    });

    const groups = links
      .map((link) => {
        const group = link.get('group') as CustomizationGroup;

        return {
          linkId: link.id,
          id: group.id,
          code: group.code,
          name: group.name,
          description: group.description,
          selectionType: group.selectionType,
          // Las reglas del producto mandan sobre las del grupo reutilizable.
          minSelection: link.minSelectionOverride ?? group.minSelection,
          maxSelection: link.maxSelectionOverride ?? group.maxSelection,
          freeQuantity: link.freeQuantityOverride ?? group.freeQuantity,
          hasOverrides:
            link.minSelectionOverride !== null ||
            link.maxSelectionOverride !== null ||
            link.freeQuantityOverride !== null,
          sortOrder: link.sortOrder,
          options: (group.options ?? [])
            .map((option) => ({
              id: option.id,
              name: option.name,
              description: option.description,
              imageUrl: option.imageUrl,
              imageAlt: option.imageAlt,
              imagePosition: option.imagePosition,
              dietaryTags: Array.isArray(option.dietaryTags) ? option.dietaryTags : [],
              allergens: Array.isArray(option.allergens) ? option.allergens : [],
              spiceLevel: option.spiceLevel,
              priceDelta: Number(option.priceDelta),
              chargeAlways: option.chargeAlways,
              calories: Number(option.calories),
              protein: Number(option.protein),
              carbs: Number(option.carbs),
              fat: Number(option.fat),
              maxPerItem: option.maxPerItem,
              status: option.status,
              inventoryItemId: option.inventoryItemId,
              consumptionQuantity: Number(option.consumptionQuantity),
              sortOrder: option.sortOrder,
              branchAvailability: availability
                .filter((row) => row.optionId === option.id)
                .map((row) => ({
                  branchId: row.branchId,
                  isAvailable: row.isAvailable,
                  priceOverride: row.priceOverride === null ? null : Number(row.priceOverride),
                  availableFrom: row.availableFrom,
                  availableUntil: row.availableUntil,
                })),
              incompatibleWith: incompatibilities
                .filter(
                  (row) =>
                    row.optionId === option.id || row.incompatibleOptionId === option.id,
                )
                .map((row) =>
                  row.optionId === option.id ? row.incompatibleOptionId : row.optionId,
                ),
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      product: { id: product.id, name: product.name, type: product.type },
      groups,
      inventoryItems: inventoryItems.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
      })),
      branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
      presets: presets.map((preset) => ({
        id: preset.id,
        code: preset.code,
        name: preset.name,
        description: preset.description,
        imageUrl: preset.imageUrl,
        badge: preset.badge,
        isFeatured: preset.isFeatured,
        isActive: preset.isActive,
        sortOrder: preset.sortOrder,
        selections: (preset.items ?? []).map((item) => ({ optionId: item.optionId, quantity: item.quantity })),
      })),
    };
  },

  /** Crea un paso nuevo y lo engancha al producto. */
  async createGroup(
    productId: number,
    input: {
      code: string;
      name: string;
      description?: string;
      selectionType: SelectionType;
      minSelection: number;
      maxSelection: number;
      freeQuantity: number;
      sortOrder: number;
    },
  ) {
    if (input.maxSelection < input.minSelection) {
      throw ApiError.badRequest('El maximo no puede ser menor que el minimo');
    }

    const existing = await CustomizationGroup.findOne({ where: { code: input.code } });
    if (existing) throw ApiError.conflict('Ya existe un paso con ese codigo');

    return sequelize.transaction(async (transaction) => {
      const group = await CustomizationGroup.create(
        {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          selectionType: input.selectionType,
          minSelection: input.minSelection,
          maxSelection: input.maxSelection,
          freeQuantity: input.freeQuantity,
          sortOrder: input.sortOrder,
        },
        { transaction },
      );

      await ProductCustomizationGroup.create(
        {
          productId,
          groupId: group.id,
          variantId: null,
          sortOrder: input.sortOrder,
          minSelectionOverride: null,
          maxSelectionOverride: null,
          freeQuantityOverride: null,
        },
        { transaction },
      );

      return group;
    });
  },

  /** Cambia las reglas del paso (min, max, incluidas). Afecta al builder al instante. */
  async updateGroup(
    groupId: number,
    input: {
      name?: string;
      description?: string | null;
      selectionType?: SelectionType;
      minSelection?: number;
      maxSelection?: number;
      freeQuantity?: number;
      sortOrder?: number;
    },
  ) {
    const group = await CustomizationGroup.findByPk(groupId);
    if (!group) throw ApiError.notFound('Paso no encontrado');

    const before = {
      minSelection: group.minSelection,
      maxSelection: group.maxSelection,
      freeQuantity: group.freeQuantity,
      selectionType: group.selectionType,
    };

    const min = input.minSelection ?? group.minSelection;
    const max = input.maxSelection ?? group.maxSelection;
    if (max < min) throw ApiError.badRequest('El maximo no puede ser menor que el minimo');

    if (input.name !== undefined) group.name = input.name;
    if (input.description !== undefined) group.description = input.description;
    if (input.selectionType !== undefined) group.selectionType = input.selectionType;
    if (input.minSelection !== undefined) group.minSelection = input.minSelection;
    if (input.maxSelection !== undefined) group.maxSelection = input.maxSelection;
    if (input.freeQuantity !== undefined) group.freeQuantity = input.freeQuantity;
    if (input.sortOrder !== undefined) group.sortOrder = input.sortOrder;

    await group.save();
    if (input.sortOrder !== undefined) {
      await ProductCustomizationGroup.update(
        { sortOrder: input.sortOrder },
        { where: { groupId } },
      );
    }
    return { group, before };
  },

  /** No se borra un paso que todavia tiene opciones: primero se vacian. */
  async deleteGroup(groupId: number) {
    const options = await CustomizationOption.count({ where: { groupId } });
    if (options > 0) {
      throw ApiError.unprocessable(
        `Ese paso todavia tiene ${options} opciones. Borralas antes de eliminarlo.`,
      );
    }

    await ProductCustomizationGroup.destroy({ where: { groupId } });
    await CustomizationGroup.destroy({ where: { id: groupId } });
  },

  async createOption(
    groupId: number,
    input: {
      name: string;
      description?: string | null;
      imageUrl?: string | null;
      imageAlt?: string | null;
      imagePosition?: string;
      dietaryTags?: string[];
      allergens?: string[];
      spiceLevel?: number;
      sortOrder?: number;
      priceDelta: number;
      chargeAlways: boolean;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      maxPerItem: number;
      inventoryItemId?: number | null;
      consumptionQuantity?: number;
    },
  ) {
    const group = await CustomizationGroup.findByPk(groupId);
    if (!group) throw ApiError.notFound('Paso no encontrado');

    const existing = await CustomizationOption.findOne({
      where: { groupId, name: input.name },
    });
    if (existing) throw ApiError.conflict('Ese paso ya tiene una opcion con ese nombre');

    const inventoryItemId = input.inventoryItemId ?? null;
    const consumptionQuantity = input.consumptionQuantity ?? 0;
    assertConsumption(inventoryItemId, consumptionQuantity);
    await assertKnownAllergens(input.allergens ?? []);

    const sortOrder = input.sortOrder ?? await CustomizationOption.count({ where: { groupId } });

    return CustomizationOption.create({
      groupId,
      name: input.name,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      imageAlt: input.imageAlt ?? null,
      imagePosition: input.imagePosition ?? '50% 50%',
      dietaryTags: input.dietaryTags ?? [],
      allergens: input.allergens ?? [],
      spiceLevel: input.spiceLevel ?? 0,
      sortOrder,
      priceDelta: input.priceDelta,
      chargeAlways: input.chargeAlways,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      maxPerItem: input.maxPerItem,
      inventoryItemId,
      // Sin insumo enlazado la cantidad no significa nada: se guarda en cero para
      // que no reaparezca al volver a enlazarlo.
      consumptionQuantity: inventoryItemId === null ? 0 : consumptionQuantity,
      ingredientId: null,
    });
  },

  /** Cambiar el precio o el suplemento de una opcion: se audita en el controlador. */
  async updateOption(
    optionId: number,
    input: {
      name?: string;
      description?: string | null;
      imageUrl?: string | null;
      imageAlt?: string | null;
      imagePosition?: string;
      dietaryTags?: string[];
      allergens?: string[];
      spiceLevel?: number;
      sortOrder?: number;
      priceDelta?: number;
      chargeAlways?: boolean;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      maxPerItem?: number;
      status?: OptionStatus;
      inventoryItemId?: number | null;
      consumptionQuantity?: number;
    },
  ) {
    const option = await CustomizationOption.findByPk(optionId);
    if (!option) throw ApiError.notFound('Opcion no encontrada');

    const before = {
      priceDelta: Number(option.priceDelta),
      chargeAlways: option.chargeAlways,
      status: option.status,
      calories: Number(option.calories),
    };

    /* El enlace con el insumo se valida solo cuando ESTE cambio lo toca: asi una
     * correccion de macros o de alergenos no queda bloqueada por una fila antigua
     * que ya venia con cantidad 0. */
    let nextConsumption = input.consumptionQuantity;
    if (input.inventoryItemId !== undefined || input.consumptionQuantity !== undefined) {
      const inventoryItemId =
        input.inventoryItemId !== undefined ? input.inventoryItemId : option.inventoryItemId;
      const consumptionQuantity =
        input.consumptionQuantity !== undefined
          ? input.consumptionQuantity
          : Number(option.consumptionQuantity);

      assertConsumption(inventoryItemId, consumptionQuantity);
      nextConsumption = inventoryItemId === null ? 0 : consumptionQuantity;
    }

    if (input.allergens !== undefined) await assertKnownAllergens(input.allergens);

    if (input.name !== undefined) option.name = input.name;
    if (input.description !== undefined) option.description = input.description;
    if (input.imageUrl !== undefined) option.imageUrl = input.imageUrl;
    if (input.imageAlt !== undefined) option.imageAlt = input.imageAlt;
    if (input.imagePosition !== undefined) option.imagePosition = input.imagePosition;
    if (input.dietaryTags !== undefined) option.dietaryTags = input.dietaryTags;
    if (input.allergens !== undefined) option.allergens = input.allergens;
    if (input.spiceLevel !== undefined) option.spiceLevel = input.spiceLevel;
    if (input.sortOrder !== undefined) option.sortOrder = input.sortOrder;
    if (input.priceDelta !== undefined) option.priceDelta = input.priceDelta;
    if (input.chargeAlways !== undefined) option.chargeAlways = input.chargeAlways;
    if (input.calories !== undefined) option.calories = input.calories;
    if (input.protein !== undefined) option.protein = input.protein;
    if (input.carbs !== undefined) option.carbs = input.carbs;
    if (input.fat !== undefined) option.fat = input.fat;
    if (input.maxPerItem !== undefined) option.maxPerItem = input.maxPerItem;
    if (input.status !== undefined) option.status = input.status;
    if (input.inventoryItemId !== undefined) option.inventoryItemId = input.inventoryItemId;
    if (nextConsumption !== undefined) option.consumptionQuantity = nextConsumption;

    await option.save();
    return { option, before };
  },

  async deleteOption(optionId: number) {
    const option = await CustomizationOption.findByPk(optionId);
    if (!option) throw ApiError.notFound('Opcion no encontrada');

    await sequelize.transaction(async (transaction) => {
      await OptionIncompatibility.destroy({
        where: { optionId },
        transaction,
      });
      await OptionIncompatibility.destroy({ where: { incompatibleOptionId: optionId }, transaction });
      await BuilderPresetItem.destroy({ where: { optionId }, transaction });
      await BranchOptionAvailability.destroy({ where: { optionId }, transaction });
      await option.destroy({ transaction });
    });
  },

  /** RN-006: prohibir una combinacion (ej. dos pescados crudos juntos). */
  async addIncompatibility(optionId: number, incompatibleOptionId: number, reason?: string) {
    if (optionId === incompatibleOptionId) {
      throw ApiError.badRequest('Una opcion no puede ser incompatible consigo misma');
    }

    const [a, b] = await Promise.all([
      CustomizationOption.findByPk(optionId),
      CustomizationOption.findByPk(incompatibleOptionId),
    ]);

    if (!a || !b) throw ApiError.notFound('Alguna de las opciones no existe');

    const [row] = await OptionIncompatibility.findOrCreate({
      where: { optionId, incompatibleOptionId },
      defaults: { optionId, incompatibleOptionId, reason: reason ?? null },
    });

    return row;
  },

  async removeIncompatibility(optionId: number, incompatibleOptionId: number) {
    // La regla es simetrica: se borra en cualquiera de los dos sentidos.
    await OptionIncompatibility.destroy({
      where: { optionId, incompatibleOptionId },
    });
    await OptionIncompatibility.destroy({
      where: { optionId: incompatibleOptionId, incompatibleOptionId: optionId },
    });
  },

  /** RN-005: agotar una opcion en UNA sucursal (sin tocar el catalogo global). */
  async setOptionAvailability(branchId: number, optionId: number, isAvailable: boolean) {
    const [row] = await BranchOptionAvailability.findOrCreate({
      where: { branchId, optionId },
      defaults: { branchId, optionId, isAvailable, priceOverride: null },
    });

    const before = { isAvailable: row.isAvailable };
    await row.update({ isAvailable });

    return { row, before };
  },

  async duplicateOption(optionId: number) {
    const source = await CustomizationOption.findByPk(optionId);
    if (!source) throw ApiError.notFound('Opcion no encontrada');

    // La copia va al FINAL del paso. Antes heredaba `sortOrder + 1`, que empataba
    // con la opcion siguiente y dejaba las flechas de orden sin efecto.
    const sortOrder = await CustomizationOption.count({ where: { groupId: source.groupId } });

    const copy = await CustomizationOption.create({
      groupId: source.groupId,
      ingredientId: source.ingredientId,
      name: `${source.name} (copia)`.slice(0, 80),
      description: source.description,
      imageUrl: source.imageUrl,
      imageAlt: source.imageAlt,
      imagePosition: source.imagePosition,
      dietaryTags: source.dietaryTags,
      allergens: source.allergens,
      spiceLevel: source.spiceLevel,
      priceDelta: source.priceDelta,
      chargeAlways: source.chargeAlways,
      calories: source.calories,
      protein: source.protein,
      carbs: source.carbs,
      fat: source.fat,
      maxPerItem: source.maxPerItem,
      inventoryItemId: source.inventoryItemId,
      consumptionQuantity: source.consumptionQuantity,
      status: OPTION_STATUS.INACTIVE,
      sortOrder,
    });
    return copy;
  },

  /**
   * REORDENAMIENTO POR RENUMERACION
   * -------------------------------------------------------------------------
   * Se recibe la lista completa de ids en el orden deseado y se reescribe
   * `sortOrder` de 0 a n-1.
   *
   * Antes el panel INTERCAMBIABA el `sortOrder` de dos filas, lo que solo mueve
   * algo si los valores son distintos; y no lo eran, porque `duplicateOption`
   * copiaba `sortOrder + 1` y `createOption` usaba el conteo del paso. Con dos
   * filas empatadas el desempate pasa a ser alfabetico: el usuario pulsaba la
   * flecha, leia "Orden actualizado" y la fila no se movia. Renumerar deja la
   * lista sin empates a la primera y de paso repara las que ya los tenian.
   */
  async reorderGroups(productId: number, groupIds: number[]) {
    const links = await ProductCustomizationGroup.findAll({ where: { productId } });
    assertSameSet(links.map((link) => link.groupId), groupIds, 'los pasos');

    await sequelize.transaction(async (transaction) => {
      for (const [index, groupId] of groupIds.entries()) {
        // El orden efectivo lo manda el enlace producto-paso; el del grupo se
        // mantiene alineado para que un paso reutilizado no se contradiga.
        await ProductCustomizationGroup.update(
          { sortOrder: index },
          { where: { productId, groupId }, transaction },
        );
        await CustomizationGroup.update({ sortOrder: index }, { where: { id: groupId }, transaction });
      }
    });

    return { ordered: groupIds.length };
  },

  async reorderOptions(groupId: number, optionIds: number[]) {
    const options = await CustomizationOption.findAll({ where: { groupId }, attributes: ['id'] });
    assertSameSet(options.map((option) => option.id), optionIds, 'las opciones del paso');

    await sequelize.transaction(async (transaction) => {
      for (const [index, optionId] of optionIds.entries()) {
        await CustomizationOption.update(
          { sortOrder: index },
          { where: { id: optionId, groupId }, transaction },
        );
      }
    });

    return { ordered: optionIds.length };
  },

  async reorderPresets(productId: number, presetIds: number[]) {
    const presets = await BuilderPreset.findAll({ where: { productId }, attributes: ['id'] });
    assertSameSet(presets.map((preset) => preset.id), presetIds, 'las recomendaciones');

    await sequelize.transaction(async (transaction) => {
      for (const [index, presetId] of presetIds.entries()) {
        await BuilderPreset.update(
          { sortOrder: index },
          { where: { id: presetId, productId }, transaction },
        );
      }
    });

    return { ordered: presetIds.length };
  },

  async bulkUpdateOptions(optionIds: number[], input: { status?: OptionStatus }) {
    if (input.status) await CustomizationOption.update({ status: input.status }, { where: { id: optionIds } });
    return { updated: optionIds.length };
  },

  async setOptionSchedule(optionId: number, input: {
    branchId: number;
    isAvailable: boolean;
    priceOverride?: number | null;
    availableFrom?: Date | null;
    availableUntil?: Date | null;
  }) {
    const [row] = await BranchOptionAvailability.findOrCreate({
      where: { branchId: input.branchId, optionId },
      defaults: { branchId: input.branchId, optionId, isAvailable: input.isAvailable },
    });
    await row.update({
      isAvailable: input.isAvailable,
      priceOverride: input.priceOverride ?? null,
      availableFrom: input.availableFrom ?? null,
      availableUntil: input.availableUntil ?? null,
    });
    return row;
  },

  async createPreset(productId: number, input: {
    code: string;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
    badge?: string | null;
    isFeatured?: boolean;
    isActive?: boolean;
    sortOrder?: number;
    selections: Array<{ optionId: number; quantity: number }>;
  }) {
    return sequelize.transaction(async (transaction) => {
      const preset = await BuilderPreset.create({
        productId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        badge: input.badge ?? null,
        isFeatured: input.isFeatured ?? false,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      }, { transaction });
      await BuilderPresetItem.bulkCreate(input.selections.map((entry, index) => ({
        presetId: preset.id,
        optionId: entry.optionId,
        quantity: entry.quantity,
        sortOrder: index,
      })), { transaction });
      return preset;
    });
  },

  async updatePreset(presetId: number, input: {
    name?: string;
    description?: string | null;
    imageUrl?: string | null;
    badge?: string | null;
    isFeatured?: boolean;
    isActive?: boolean;
    sortOrder?: number;
    selections?: Array<{ optionId: number; quantity: number }>;
  }) {
    const preset = await BuilderPreset.findByPk(presetId);
    if (!preset) throw ApiError.notFound('Recomendacion no encontrada');
    return sequelize.transaction(async (transaction) => {
      await preset.update(input, { transaction });
      if (input.selections) {
        await BuilderPresetItem.destroy({ where: { presetId }, transaction });
        await BuilderPresetItem.bulkCreate(input.selections.map((entry, index) => ({
          presetId,
          optionId: entry.optionId,
          quantity: entry.quantity,
          sortOrder: index,
        })), { transaction });
      }
      return preset;
    });
  },

  async deletePreset(presetId: number) {
    const preset = await BuilderPreset.findByPk(presetId);
    if (!preset) throw ApiError.notFound('Recomendacion no encontrada');
    await sequelize.transaction(async (transaction) => {
      await BuilderPresetItem.destroy({ where: { presetId }, transaction });
      await preset.destroy({ transaction });
    });
  },
};

export const SELECTION_TYPES = Object.values(SELECTION_TYPE);
export const OPTION_STATUSES = Object.values(OPTION_STATUS);

export type CustomizationAdminService = typeof customizationAdminService;
