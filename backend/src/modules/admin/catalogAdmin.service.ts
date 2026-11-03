import { Op, type Transaction } from 'sequelize';
import {
  Allergen,
  BranchProductAvailability,
  Category,
  DietaryTag,
  Product,
  ProductAllergen,
  ProductDietaryTag,
  ProductVariant,
  CakeProductProfile,
  CustomizationGroup,
  CustomizationOption,
  Recipe,
  RecipeItem,
  InventoryItem,
  ProductCustomizationGroup,
  ProductReview,
  OrderItem,
  CakeDesignRequest,
  sequelize,
} from '@database/models';
import { PRODUCT_STATUS, type ProductStatus, type ProductFamily, type PreparationMode } from '@database/models/product.model';
import { PRODUCT_TYPE, type ProductType } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { availabilityAlertsService } from '@modules/catalog/availabilityAlerts.service';
import { logger } from '@config/logger';
import { refreshCakeAllergens } from '@modules/catalog/cakeAllergens.service';

/**
 * CATALOGO desde el panel (M04 / seccion 9.7).
 *
 * Cada operacion es independiente para que los permisos puedan serlo tambien.
 */

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const assertFinishedRecipe = async (recipeId: number) => {
  const lines = await RecipeItem.findAll({ where: { recipeId } });
  const itemIds = [...new Set(lines.map((line) => line.inventoryItemId))];
  const finished = await InventoryItem.count({ where: { id: { [Op.in]: itemIds }, itemType: 'FINISHED_PRODUCT', isActive: true } });
  if (!itemIds.length || finished !== itemIds.length) throw ApiError.unprocessable('Para venta de productos preparados, conecta la receta con artículos de Inventario clasificados como Producto terminado');
};

export const catalogAdminService = {
  /** Listado del panel: incluye borradores e inactivos (a diferencia del menu publico). */
  async listProducts(filters: { search?: string; categoryId?: number; status?: string; archived?: boolean }) {
    const where: Record<string, unknown> = {};

    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.status) where.status = filters.status;
    if (filters.search) where.name = { [Op.like]: `%${filters.search}%` };
    if (filters.archived) where.deletedAt = { [Op.not]: null };

    const products = await Product.findAll({
      where,
      paranoid: !filters.archived,
      include: [
        {
          model: ProductVariant,
          as: 'variants',
          required: false,
          include: [],
        },
        { model: Category, as: 'category', attributes: ['id', 'name'] },
        { model: CakeProductProfile, as: 'cakeProfile', attributes: ['isActive', 'saleMode', 'minLeadHours'], required: false },
        { model: DietaryTag, as: 'dietaryTags', through: { attributes: [] } },
        { model: Allergen, as: 'allergens', through: { attributes: [] } },
      ],
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC'],
      ],
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      type: product.type,
      family: product.family,
      preparationMode: product.preparationMode,
      status: product.status,
      archivedAt: product.deletedAt,
      allergensReviewedAt: product.allergensReviewedAt,
      isFeatured: product.isFeatured,
      imageUrl: product.imageUrl,
      imageAlt: product.imageAlt,
      category: product.get('category') as { id: number; name: string } | undefined,
      cakeProfile: (() => {
        const profile = product.get('cakeProfile') as CakeProductProfile | undefined;
        return profile ? { isActive: profile.isActive, saleMode: profile.saleMode, minLeadHours: profile.minLeadHours } : null;
      })(),
      variants: (product.variants ?? []).map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        basePrice: Number(variant.basePrice),
        servingSize: variant.servingSize === null ? null : Number(variant.servingSize),
        servingUnit: variant.servingUnit,
        isDefault: variant.isDefault,
        isActive: variant.isActive,
      })),
      dietaryTags: ((product.get('dietaryTags') as DietaryTag[] | undefined) ?? []).map((tag) => ({
        id: tag.id,
        code: tag.code,
        name: tag.name,
      })),
      allergens: ((product.get('allergens') as Allergen[] | undefined) ?? []).map((allergen) => ({
        id: allergen.id,
        code: allergen.code,
        name: allergen.name,
      })),
    }));
  },

  /** Crea el producto con su primera variante (un producto sin variante no se puede vender). */
  async createProduct(input: {
    name: string;
    categoryId: number;
    type: ProductType;
    family?: ProductFamily;
    preparationMode?: PreparationMode;
    minLeadHours?: number;
    servingSize?: number | null;
    servingUnit?: string;
    description?: string;
    imageUrl?: string | null;
    variantName: string;
    basePrice: number;
  }) {
    const slug = slugify(input.name);
    const category = await Category.findOne({ where: { id: input.categoryId, isActive: true } });
    if (!category) throw ApiError.unprocessable('Elige una categoría activa');
    if (input.preparationMode === 'READY_STOCK' && input.type !== 'FIXED') throw ApiError.unprocessable('Los productos listos para venta se ofrecen sin personalización');

    const existing = await Product.findOne({ where: { slug }, paranoid: false });
    if (existing) throw ApiError.conflict(existing.deletedAt
      ? 'Ya existe un producto archivado con ese nombre. Restáuralo desde Archivados.'
      : 'Ya existe un producto con ese nombre');

    return sequelize.transaction(async (transaction) => {
      const product = await Product.create(
        {
          name: input.name,
          slug,
          categoryId: input.categoryId,
          type: input.type,
          family: input.family ?? 'CAKE',
          preparationMode: input.preparationMode ?? 'MADE_TO_ORDER',
          description: input.description ?? null,
          // Nace como BORRADOR: publicarlo es un permiso aparte (catalog.product.publish).
          status: PRODUCT_STATUS.DRAFT,
          imageUrl: input.imageUrl ?? null,
          sortOrder: 0,
        },
        { transaction },
      );

      await ProductVariant.create(
        {
          productId: product.id,
          name: input.variantName,
          sku: `${slug.toUpperCase().slice(0, 20)}-${product.id}`,
          basePrice: input.basePrice,
          isDefault: true,
          servingSize: input.servingSize ?? null,
          servingUnit: input.servingUnit ?? (input.family && input.family !== 'CAKE' ? 'unidades' : 'porciones'),
        },
        { transaction },
      );

      await CakeProductProfile.create({ productId: product.id, saleMode: input.type === 'CUSTOMIZABLE' ? 'SEMI_CUSTOM' : 'STANDARD',
        minLeadHours: input.minLeadHours ?? 24, baseEffortJson: {}, stationOffsetsJson: {}, isActive: true }, { transaction });
      return product;
    });
  },

  async getProductOrFail(productId: number, transaction?: Transaction) {
    const product = await Product.findByPk(productId, { transaction });
    if (!product) throw ApiError.notFound('Producto no encontrado');
    return product;
  },

  /** Datos comerciales del producto (nombre, descripcion, categoria, destacado). */
  async updateProduct(
    productId: number,
    input: {
      name?: string;
      description?: string | null;
      categoryId?: number;
      family?: ProductFamily;
      preparationMode?: PreparationMode;
      isFeatured?: boolean;
      imageUrl?: string | null;
    },
  ) {
    const product = await catalogAdminService.getProductOrFail(productId);
    if (((input.family !== undefined && input.family !== product.family) || (input.preparationMode !== undefined && input.preparationMode !== product.preparationMode)) && product.status === PRODUCT_STATUS.ACTIVE) {
      throw ApiError.unprocessable('Retira primero el producto para cambiar su familia o forma de preparación; revisa su receta antes de publicarlo de nuevo');
    }
    if (input.categoryId !== undefined && !await Category.findOne({ where: { id: input.categoryId, isActive: true } })) throw ApiError.unprocessable('Elige una categoría activa');
    if (input.preparationMode === 'READY_STOCK' && product.type !== 'FIXED') throw ApiError.unprocessable('Los productos listos para venta se ofrecen sin personalización');
    if (input.family && input.family !== 'CAKE') {
      const profile = await CakeProductProfile.findByPk(productId);
      if (profile?.saleMode === 'ADVANCED' || profile?.customServingsJson?.enabled) throw ApiError.unprocessable('Desactiva las porciones libres o el diseño por cotización antes de cambiar la familia de esta torta');
    }
    const before = {
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      family: product.family,
      preparationMode: product.preparationMode,
      isFeatured: product.isFeatured,
    };

    if (input.name !== undefined) product.name = input.name;
    if (input.description !== undefined) product.description = input.description;
    if (input.categoryId !== undefined) product.categoryId = input.categoryId;
    if (input.family !== undefined) product.family = input.family;
    if (input.preparationMode !== undefined) product.preparationMode = input.preparationMode;
    if (input.isFeatured !== undefined) product.isFeatured = input.isFeatured;
    if (input.imageUrl !== undefined) product.imageUrl = input.imageUrl;

    await product.save();
    return { product, before };
  },

  /** Publicar / despublicar. Permiso aparte: no todo el que edita puede publicar. */
  async changeStatus(productId: number, status: ProductStatus) {
    if (status === PRODUCT_STATUS.DRAFT) throw ApiError.conflict('Un producto existente no puede volver a borrador');
    const product = await catalogAdminService.getProductOrFail(productId);
    const before = { status: product.status };

    if (status === PRODUCT_STATUS.ACTIVE && !await ProductVariant.count({ where: { productId, isActive: true } })) {
      throw ApiError.unprocessable('Activa al menos una presentación con precio antes de publicar el producto');
    }

    if (status === PRODUCT_STATUS.ACTIVE && await CakeProductProfile.findByPk(productId)) {
      const profile = await CakeProductProfile.findByPk(productId);
      if (!profile?.isActive || (product.preparationMode !== 'READY_STOCK' && !Object.values(profile.baseEffortJson ?? {}).some((minutes) => Number(minutes) > 0))) {
        throw ApiError.unprocessable('Configura las reglas y tiempos de producción antes de publicar este producto');
      }
      if (product.preparationMode === 'READY_STOCK' && profile.saleMode !== 'STANDARD') throw ApiError.unprocessable('Los productos listos para venta no admiten personalización');
      const variants = await ProductVariant.findAll({ where: { productId, isActive: true } });
      if (!variants.length) throw ApiError.unprocessable('La torta necesita una presentacion activa');
      for (const variant of variants) {
        const recipe = await Recipe.findOne({ where: { variantId: variant.id, isActive: true } });
        if (!recipe || !await RecipeItem.count({ where: { recipeId: recipe.id } })) {
          throw ApiError.unprocessable(`Completa la receta de ${variant.name} antes de publicar`);
        }
        if (product.preparationMode === 'READY_STOCK') {
          await assertFinishedRecipe(recipe.id);
        }
      }
      if (profile.saleMode === 'SEMI_CUSTOM') {
        const links = await ProductCustomizationGroup.findAll({ where: { productId, isActive: true }, attributes: ['groupId', 'minSelectionOverride'] });
        if (!links.length) throw ApiError.unprocessable('Conecta al menos un grupo de opciones antes de publicar esta torta personalizable');
        for (const link of links) {
          const group = await CustomizationGroup.findOne({ where: { id: link.groupId, isActive: true } });
          const activeOptions = await CustomizationOption.count({ where: { groupId: link.groupId, status: 'ACTIVE' } });
          if (!group || activeOptions < Math.max(1, link.minSelectionOverride ?? group.minSelection)) {
            throw ApiError.unprocessable('Cada grupo de la torta necesita suficientes opciones activas antes de publicar');
          }
        }
      }
      const foodInfo = await refreshCakeAllergens(productId);
      if (!foodInfo.complete) {
        throw ApiError.unprocessable(foodInfo.missingItems.length
          ? `Clasifica los alérgenos de estos insumos en Inventario antes de publicar: ${foodInfo.missingItems.join(', ')}`
          : 'Completa la información de alérgenos de los insumos y opciones antes de publicar');
      }
      await product.reload();
    }

    product.status = status;
    await product.save();

    return { product, before };
  },

  /** El borrado físico solo está permitido para borradores sin trazabilidad. */
  async deleteDraftProduct(productId: number) {
    return sequelize.transaction(async (transaction) => {
      const product = await Product.findByPk(productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) throw ApiError.notFound('Producto no encontrado');
      if (product.status !== PRODUCT_STATUS.DRAFT) {
        throw ApiError.conflict('Solo se pueden eliminar productos que todavía están en borrador');
      }

      const [reviewCount, designRequestCount, orderCount] = await Promise.all([
        ProductReview.count({ where: { productId }, transaction }),
        CakeDesignRequest.count({ where: { productId }, transaction }),
        OrderItem.count({ where: { productId }, transaction }),
      ]);
      if (reviewCount > 0 || designRequestCount > 0 || orderCount > 0) {
        throw ApiError.conflict('Este borrador ya tiene historial asociado. Retíralo del catálogo para conservar la trazabilidad.');
      }

      // El perfil de torta es configuración editable y puede quedar creado
      // durante un alta incompleta; se limpia junto con el borrador.
      await CakeProductProfile.destroy({ where: { productId }, transaction, force: true });
      const deleted = { id: product.id, name: product.name, status: product.status };
      await product.destroy({ transaction, force: true });
      return deleted;
    });
  },

  /** Oculta un producto retirado de las listas sin perder sus relaciones históricas. */
  async archiveProduct(productId: number) {
    return sequelize.transaction(async (transaction) => {
      const product = await Product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!product) throw ApiError.notFound('Producto no encontrado');
      if (product.status !== PRODUCT_STATUS.INACTIVE) {
        throw ApiError.conflict('Retira el producto antes de archivarlo');
      }
      const archived = { id: product.id, name: product.name, status: product.status };
      await product.destroy({ transaction });
      return archived;
    });
  },

  /** Recupera la ficha archivada como retirada; nunca vuelve a publicarla. */
  async restoreProduct(productId: number) {
    return sequelize.transaction(async (transaction) => {
      const product = await Product.findByPk(productId, {
        paranoid: false, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!product) throw ApiError.notFound('Producto no encontrado');
      if (!product.deletedAt || product.status !== PRODUCT_STATUS.INACTIVE) {
        throw ApiError.conflict('Solo se pueden restaurar productos retirados y archivados');
      }
      await product.restore({ transaction });
      return { id: product.id, name: product.name, status: product.status };
    });
  },

  /** PRECIO: cambio sensible, siempre auditado (RN-021). */
  async updateVariant(
    variantId: number,
    input: { name?: string; basePrice?: number; servingSize?: number | null; servingUnit?: string; isActive?: boolean },
  ) {
    const variant = await ProductVariant.findByPk(variantId);
    if (!variant) throw ApiError.notFound('Variante no encontrada');

    if ((input.servingSize !== undefined && input.servingSize !== Number(variant.servingSize)) || (input.servingUnit !== undefined && input.servingUnit !== variant.servingUnit)) {
      const product = await catalogAdminService.getProductOrFail(variant.productId);
      const cakeProfile = await CakeProductProfile.findOne({ where: { productId: product.id, isActive: true } });
      if (product.status === PRODUCT_STATUS.ACTIVE && cakeProfile && variant.isActive) {
        throw ApiError.unprocessable('Desactiva primero esta presentación y actualiza su receta antes de cambiar las porciones');
      }
    }

    if (input.isActive !== undefined && input.isActive !== variant.isActive) {
      const product = await catalogAdminService.getProductOrFail(variant.productId);
      if (product.status === PRODUCT_STATUS.ACTIVE
        && input.isActive === false
        && await ProductVariant.count({ where: { productId: variant.productId, isActive: true } }) <= 1) {
        throw ApiError.unprocessable('Retira primero el producto o activa otra presentación antes de desactivar la última');
      }
      if (product.status === PRODUCT_STATUS.ACTIVE && input.isActive === true
        && await CakeProductProfile.findOne({ where: { productId: product.id, isActive: true } })) {
        const recipe = await Recipe.findOne({ where: { variantId, isActive: true } });
        if (!recipe || !await RecipeItem.count({ where: { recipeId: recipe.id } })) {
          throw ApiError.unprocessable('Completa la receta de esta presentación en Producción de tortas antes de activarla');
        }
        if (product.preparationMode === 'READY_STOCK') await assertFinishedRecipe(recipe.id);
      }
    }

    const before = {
      name: variant.name,
      basePrice: Number(variant.basePrice),
      servingSize: variant.servingSize === null ? null : Number(variant.servingSize),
      isActive: variant.isActive,
    };

    if (input.name !== undefined) variant.name = input.name;
    if (input.basePrice !== undefined) variant.basePrice = input.basePrice;
    if (input.servingSize !== undefined) {
      variant.servingSize = input.servingSize;
    }
    if (input.servingUnit !== undefined) variant.servingUnit = input.servingUnit;
    if (input.isActive !== undefined) variant.isActive = input.isActive;

    await variant.save();
    if (input.isActive !== undefined && input.isActive !== before.isActive
      && await CakeProductProfile.findByPk(variant.productId)) {
      await refreshCakeAllergens(variant.productId);
    }
    return { variant, before };
  },

  async addVariant(productId: number, input: { name: string; basePrice: number; servingSize?: number | null; servingUnit?: string }) {
    const product = await catalogAdminService.getProductOrFail(productId);

    const count = await ProductVariant.count({ where: { productId } });
    const needsRecipeFirst = product.status === PRODUCT_STATUS.ACTIVE
      && Boolean(await CakeProductProfile.findOne({ where: { productId, isActive: true } }));
    const isCake = product.family === 'CAKE';

    return sequelize.transaction(async (transaction) => {
      const variant = await ProductVariant.create(
        {
          productId,
          name: input.name,
          sku: `${product.slug.toUpperCase().slice(0, 20)}-V${count + 1}`,
          basePrice: input.basePrice,
          isDefault: count === 0,
          isActive: !needsRecipeFirst,
          servingSize: input.servingSize ?? null,
          servingUnit: input.servingUnit ?? (isCake ? 'porciones' : 'unidades'),
        },
        { transaction },
      );

      return variant;
    });
  },

  /** Alergenos declarados del producto (RN-009: el sistema informa, no garantiza). */
  async setAllergens(productId: number, allergenIds: number[]) {
    const product = await catalogAdminService.getProductOrFail(productId);
    if (await CakeProductProfile.findByPk(productId)) {
      throw ApiError.unprocessable('Los alérgenos de las tortas se calculan desde Inventario y Constructor');
    }
    const available = await Allergen.findAll({ attributes: ['id', 'code'] });
    if (!available.length) throw ApiError.unprocessable('No hay opciones de alérgenos configuradas para revisar');
    const validIds = new Set(available.map((row) => row.id));
    if (new Set(allergenIds).size !== allergenIds.length || allergenIds.some((id) => !validIds.has(id))) {
      throw ApiError.unprocessable('La selección contiene alérgenos repetidos o inexistentes');
    }

    // En una torta personalizable, los alergenos declarados en las opciones
    // activas forman parte del consolidado del producto. El equipo sigue
    // confirmando la receta base y el contacto cruzado, pero no puede olvidar
    // una opcion que ya fue revisada en Constructor.
    let consolidatedIds = [...allergenIds];
    if (product.type === PRODUCT_TYPE.CUSTOMIZABLE) {
      const links = await ProductCustomizationGroup.findAll({
        where: { productId, isActive: true },
        attributes: ['groupId'],
      });
      const groupIds = [...new Set(links.map((link) => link.groupId))];
      if (groupIds.length > 0) {
        const options = await CustomizationOption.findAll({
          where: { groupId: { [Op.in]: groupIds }, status: 'ACTIVE' },
          attributes: ['allergens'],
        });
        const optionCodes = new Set(
          options.flatMap((option) => (Array.isArray(option.allergens) ? option.allergens : [])),
        );
        const optionIds = available
          .filter((allergen) => optionCodes.has(allergen.code))
          .map((allergen) => allergen.id);
        consolidatedIds = [...new Set([...consolidatedIds, ...optionIds])];
      }
    }

    const before = (await ProductAllergen.findAll({ where: { productId } })).map(
      (row) => row.allergenId,
    );

    await sequelize.transaction(async (transaction) => {
      await ProductAllergen.destroy({ where: { productId }, transaction });
      if (before.length !== consolidatedIds.length || before.some((id) => !consolidatedIds.includes(id))) {
        await ProductDietaryTag.destroy({ where: { productId }, transaction });
      }

      for (const allergenId of consolidatedIds) {
        await ProductAllergen.create(
          { productId, allergenId, level: 'CONTAINS' },
          { transaction },
        );
      }
      product.allergensReviewedAt = new Date();
      await product.save({ transaction });
    });

    return { before, after: consolidatedIds };
  },

  /** Etiquetas dietarias: alimentan los filtros del menu. */
  async setDietaryTags(productId: number, tagIds: number[]) {
    const product = await catalogAdminService.getProductOrFail(productId);
    const available = await DietaryTag.findAll({ attributes: ['id'] });
    const validIds = new Set(available.map((row) => row.id));
    if (new Set(tagIds).size !== tagIds.length || tagIds.some((id) => !validIds.has(id))) {
      throw ApiError.unprocessable('La selección contiene etiquetas repetidas o inexistentes');
    }
    if (tagIds.length && !product.allergensReviewedAt) {
      throw ApiError.unprocessable('Revisa primero los alérgenos de la receta antes de declarar características dietarias');
    }
    if (tagIds.length) {
      const [tags, links] = await Promise.all([
        DietaryTag.findAll({ where: { id: { [Op.in]: tagIds } }, attributes: ['code'] }),
        ProductAllergen.findAll({ where: { productId }, attributes: ['allergenId'] }),
      ]);
      const allergens = links.length ? await Allergen.findAll({ where: { id: { [Op.in]: links.map((link) => link.allergenId) } }, attributes: ['code'] }) : [];
      const codes = new Set(allergens.map((row) => row.code));
      const claims = new Set(tags.map((row) => row.code));
      if ((claims.has('sin-gluten') && codes.has('gluten'))
        || (claims.has('vegano') && ['lacteos', 'huevo', 'pescado', 'mariscos'].some((code) => codes.has(code)))
        || (claims.has('vegetariano') && ['pescado', 'mariscos'].some((code) => codes.has(code)))) {
        throw ApiError.unprocessable('Las etiquetas elegidas contradicen los alérgenos declarados');
      }
    }

    const before = (await ProductDietaryTag.findAll({ where: { productId } })).map(
      (row) => row.dietaryTagId,
    );

    await sequelize.transaction(async (transaction) => {
      await ProductDietaryTag.destroy({ where: { productId }, transaction });

      for (const dietaryTagId of tagIds) {
        await ProductDietaryTag.create({ productId, dietaryTagId }, { transaction });
      }
    });

    return { before, after: tagIds };
  },

  /** RN-005: sacar un plato del menu de UNA sucursal sin tocar el catalogo global. */
  async setBranchAvailability(
    productId: number,
    branchId: number,
    isAvailable: boolean,
    reason?: string,
  ) {
    await catalogAdminService.getProductOrFail(productId);

    const [row, created] = await BranchProductAvailability.findOrCreate({
      where: { branchId, productId },
      defaults: { branchId, productId, isAvailable, unavailableReason: reason ?? null },
    });

    // Si la fila acaba de nacer, el estado anterior no es el que trae `row` —que
    // ya son los valores nuevos— sino el implicito: sin fila = disponible. La
    // bitacora registraba "de disponible a disponible" en el caso mas comun.
    const before = created
      ? { isAvailable: true, unavailableReason: null }
      : { isAvailable: row.isAvailable, unavailableReason: row.unavailableReason };

    await row.update({ isAvailable, unavailableReason: isAvailable ? null : (reason ?? null) });
    if (isAvailable) {
      void availabilityAlertsService.notifyWaiting(productId, branchId).catch((error) => {
        logger.error(`No se pudieron procesar alertas para producto ${productId} y local ${branchId}`, error);
      });
    }
    return { row, before };
  },

  /**
   * Estado por sucursal del producto.
   *
   * Proyeccion explicita (y no la fila entera) porque esto alimenta el interruptor
   * "Disponible en <cocina>" del panel: sin fila, disponible. Las cocinas que no
   * aparecen aqui no estan retiradas, simplemente nunca se tocaron.
   */
  async listBranchAvailability(productId: number) {
    const rows = await BranchProductAvailability.findAll({
      where: { productId },
      order: [['branchId', 'ASC']],
    });

    return rows.map((row) => ({
      branchId: row.branchId,
      isAvailable: row.isAvailable,
      unavailableReason: row.unavailableReason,
      updatedAt: row.updatedAt,
    }));
  },

  // --- Categorias ---
  async listCategories() {
    const [categories, productCounts] = await Promise.all([
      Category.findAll({ order: [['sortOrder', 'ASC']] }),
      Product.findAll({
        attributes: ['categoryId', [sequelize.fn('COUNT', sequelize.col('id')), 'productCount']],
        group: ['categoryId'],
        // A category cannot be removed while it is referenced by a product,
        // even when that product is already archived.
        paranoid: false,
        raw: true,
      }) as unknown as Promise<Array<{ categoryId: number; productCount: string | number }>>,
    ]);

    const countByCategory = new Map(
      productCounts.map((row) => [Number(row.categoryId), Number(row.productCount)]),
    );

    return categories.map((category) => ({
      ...category.toJSON(),
      productCount: countByCategory.get(category.id) ?? 0,
    }));
  },

  async createCategory(input: { name: string; sortOrder?: number; imageUrl?: string | null; isActive?: boolean }) {
    const name = input.name.trim();
    const slug = slugify(name);
    if (!slug) throw ApiError.badRequest('El nombre de la categoria no es valido');

    const existing = await Category.findOne({ where: { slug } });
    if (existing) throw ApiError.conflict('Ya existe una categoria con ese nombre');

    return Category.create({
      name,
      slug,
      sortOrder: input.sortOrder ?? 0,
      parentId: null,
      description: null,
      imageUrl: input.imageUrl ?? null,
      isActive: input.isActive ?? true,
    });
  },

  async updateCategory(categoryId: number, input: { name?: string; isActive?: boolean; sortOrder?: number; imageUrl?: string | null }) {
    const category = await Category.findByPk(categoryId);
    if (!category) throw ApiError.notFound('Categoria no encontrada');

    if (input.name !== undefined) {
      const name = input.name.trim();
      const slug = slugify(name);
      const existing = await Category.findOne({
        where: { slug, id: { [Op.ne]: categoryId } },
        paranoid: false,
      });
      if (existing) throw ApiError.conflict('Ya existe una categoria con ese nombre');
      category.name = name;
      category.slug = slug;
    }
    if (input.isActive !== undefined) category.isActive = input.isActive;
    if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;
    if (input.imageUrl !== undefined) category.imageUrl = input.imageUrl;

    await category.save();
    return category;
  },

  /** Elimina una categoría solo cuando no conserva productos ni subcategorías. */
  async deleteCategory(categoryId: number) {
    return sequelize.transaction(async (transaction) => {
      const category = await Category.findByPk(categoryId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!category) throw ApiError.notFound('Categoria no encontrada');

      const [productCount, childCount] = await Promise.all([
        Product.count({
          where: { categoryId },
          // Product is paranoid; archived products still keep the FK alive.
          paranoid: false,
          transaction,
        }),
        Category.count({
          where: { parentId: categoryId },
          paranoid: false,
          transaction,
        }),
      ]);

      if (productCount > 0) {
        throw ApiError.conflict(
          `No se puede eliminar «${category.name}» porque tiene ${productCount} producto${productCount === 1 ? '' : 's'} asociado${productCount === 1 ? '' : 's'}. Reasigna esos productos a otra categoría y vuelve a intentarlo.`,
        );
      }
      if (childCount > 0) {
        throw ApiError.conflict('No se puede eliminar una categoria que tiene subcategorias');
      }

      const deleted = { id: category.id, name: category.name };
      // No quedan FKs que conservar, por lo que se elimina tambien la fila
      // archivada y el slug queda disponible para volver a usarlo.
      await category.destroy({ transaction, force: true });
      return deleted;
    });
  },
};

export const PRODUCT_STATUSES = Object.values(PRODUCT_STATUS);
export const PRODUCT_TYPES = Object.values(PRODUCT_TYPE);

export type CatalogAdminService = typeof catalogAdminService;
