import { Op, type Transaction } from 'sequelize';
import {
  Allergen,
  BranchProductAvailability,
  Category,
  DietaryTag,
  Product,
  ProductAllergen,
  ProductDietaryTag,
  ProductNutrition,
  ProductVariant,
  sequelize,
} from '@database/models';
import { PRODUCT_STATUS, type ProductStatus } from '@database/models/product.model';
import { PRODUCT_TYPE, type ProductType } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';

/**
 * CATALOGO desde el panel (M04 / seccion 9.7).
 *
 * Cada operacion es independiente para que los permisos puedan serlo tambien:
 * el gestor de catalogo cambia precios, el nutricionista cambia calorias, y
 * ninguno de los dos puede hacer lo del otro.
 */

export interface NutritionInput {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const catalogAdminService = {
  /** Listado del panel: incluye borradores e inactivos (a diferencia del menu publico). */
  async listProducts(filters: { search?: string; categoryId?: number; status?: string }) {
    const where: Record<string, unknown> = {};

    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.status) where.status = filters.status;
    if (filters.search) where.name = { [Op.like]: `%${filters.search}%` };

    const products = await Product.findAll({
      where,
      include: [
        {
          model: ProductVariant,
          as: 'variants',
          required: false,
          include: [{ model: ProductNutrition, as: 'nutrition', required: false }],
        },
        { model: Category, as: 'category', attributes: ['id', 'name'] },
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
      status: product.status,
      isFeatured: product.isFeatured,
      imageUrl: product.imageUrl,
      category: product.get('category') as { id: number; name: string } | undefined,
      variants: (product.variants ?? []).map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        basePrice: Number(variant.basePrice),
        isDefault: variant.isDefault,
        isActive: variant.isActive,
        nutrition: variant.nutrition
          ? {
              calories: Number(variant.nutrition.calories),
              protein: Number(variant.nutrition.protein),
              carbs: Number(variant.nutrition.carbs),
              fat: Number(variant.nutrition.fat),
              fiber: Number(variant.nutrition.fiber),
              sodium: Number(variant.nutrition.sodium),
            }
          : null,
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
    description?: string;
    imageUrl?: string | null;
    variantName: string;
    basePrice: number;
  }) {
    const slug = slugify(input.name);

    const existing = await Product.findOne({ where: { slug } });
    if (existing) throw ApiError.conflict('Ya existe un producto con ese nombre');

    return sequelize.transaction(async (transaction) => {
      const product = await Product.create(
        {
          name: input.name,
          slug,
          categoryId: input.categoryId,
          type: input.type,
          description: input.description ?? null,
          // Nace como BORRADOR: publicarlo es un permiso aparte (catalog.product.publish).
          status: PRODUCT_STATUS.DRAFT,
          imageUrl: input.imageUrl ?? null,
          sortOrder: 0,
        },
        { transaction },
      );

      const variant = await ProductVariant.create(
        {
          productId: product.id,
          name: input.variantName,
          sku: `${slug.toUpperCase().slice(0, 20)}-${product.id}`,
          basePrice: input.basePrice,
          isDefault: true,
          servingSize: null,
          servingUnit: 'g',
        },
        { transaction },
      );

      // Nutricion en cero: la completa el nutricionista.
      await ProductNutrition.create(
        {
          productId: product.id,
          variantId: variant.id,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
          sodium: 0,
        },
        { transaction },
      );

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
      isFeatured?: boolean;
      imageUrl?: string | null;
    },
  ) {
    const product = await catalogAdminService.getProductOrFail(productId);
    const before = {
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      isFeatured: product.isFeatured,
    };

    if (input.name !== undefined) product.name = input.name;
    if (input.description !== undefined) product.description = input.description;
    if (input.categoryId !== undefined) product.categoryId = input.categoryId;
    if (input.isFeatured !== undefined) product.isFeatured = input.isFeatured;
    if (input.imageUrl !== undefined) product.imageUrl = input.imageUrl;

    await product.save();
    return { product, before };
  },

  /** Publicar / despublicar. Permiso aparte: no todo el que edita puede publicar. */
  async changeStatus(productId: number, status: ProductStatus) {
    const product = await catalogAdminService.getProductOrFail(productId);
    const before = { status: product.status };

    product.status = status;
    await product.save();

    return { product, before };
  },

  /** PRECIO: cambio sensible, siempre auditado (RN-021). */
  async updateVariant(
    variantId: number,
    input: { name?: string; basePrice?: number; isActive?: boolean },
  ) {
    const variant = await ProductVariant.findByPk(variantId);
    if (!variant) throw ApiError.notFound('Variante no encontrada');

    const before = {
      name: variant.name,
      basePrice: Number(variant.basePrice),
      isActive: variant.isActive,
    };

    if (input.name !== undefined) variant.name = input.name;
    if (input.basePrice !== undefined) variant.basePrice = input.basePrice;
    if (input.isActive !== undefined) variant.isActive = input.isActive;

    await variant.save();
    return { variant, before };
  },

  async addVariant(productId: number, input: { name: string; basePrice: number }) {
    const product = await catalogAdminService.getProductOrFail(productId);

    const count = await ProductVariant.count({ where: { productId } });

    return sequelize.transaction(async (transaction) => {
      const variant = await ProductVariant.create(
        {
          productId,
          name: input.name,
          sku: `${product.slug.toUpperCase().slice(0, 20)}-V${count + 1}`,
          basePrice: input.basePrice,
          isDefault: count === 0,
          servingSize: null,
          servingUnit: 'g',
        },
        { transaction },
      );

      await ProductNutrition.create(
        {
          productId,
          variantId: variant.id,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
          sodium: 0,
        },
        { transaction },
      );

      return variant;
    });
  },

  /**
   * NUTRICION (permiso nutrition.write).
   * Esto es lo unico que toca el nutricionista: ni precios, ni estados, ni pedidos.
   */
  async updateNutrition(variantId: number, input: NutritionInput) {
    const variant = await ProductVariant.findByPk(variantId);
    if (!variant) throw ApiError.notFound('Variante no encontrada');

    const [row] = await ProductNutrition.findOrCreate({
      where: { variantId },
      defaults: {
        productId: variant.productId,
        variantId,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sodium: 0,
      },
    });

    const before = {
      calories: Number(row.calories),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
    };

    await row.update({
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      fiber: input.fiber ?? Number(row.fiber),
      sodium: input.sodium ?? Number(row.sodium),
    });

    return { nutrition: row, before };
  },

  /** Alergenos declarados del producto (RN-009: el sistema informa, no garantiza). */
  async setAllergens(productId: number, allergenIds: number[]) {
    await catalogAdminService.getProductOrFail(productId);

    const before = (await ProductAllergen.findAll({ where: { productId } })).map(
      (row) => row.allergenId,
    );

    await sequelize.transaction(async (transaction) => {
      await ProductAllergen.destroy({ where: { productId }, transaction });

      for (const allergenId of allergenIds) {
        await ProductAllergen.create(
          { productId, allergenId, level: 'CONTAINS' },
          { transaction },
        );
      }
    });

    return { before, after: allergenIds };
  },

  /** Etiquetas dietarias: alimentan los filtros del menu. */
  async setDietaryTags(productId: number, tagIds: number[]) {
    await catalogAdminService.getProductOrFail(productId);

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

    const [row] = await BranchProductAvailability.findOrCreate({
      where: { branchId, productId },
      defaults: { branchId, productId, isAvailable, unavailableReason: reason ?? null },
    });

    const before = { isAvailable: row.isAvailable };

    await row.update({ isAvailable, unavailableReason: isAvailable ? null : (reason ?? null) });
    return { row, before };
  },

  async listBranchAvailability(productId: number) {
    return BranchProductAvailability.findAll({ where: { productId } });
  },

  // --- Categorias ---
  async listCategories() {
    return Category.findAll({ order: [['sortOrder', 'ASC']] });
  },

  async createCategory(input: { name: string; sortOrder?: number }) {
    const slug = slugify(input.name);

    const existing = await Category.findOne({ where: { slug } });
    if (existing) throw ApiError.conflict('Ya existe una categoria con ese nombre');

    return Category.create({
      name: input.name,
      slug,
      sortOrder: input.sortOrder ?? 0,
      parentId: null,
      description: null,
      imageUrl: null,
    });
  },

  async updateCategory(categoryId: number, input: { name?: string; isActive?: boolean }) {
    const category = await Category.findByPk(categoryId);
    if (!category) throw ApiError.notFound('Categoria no encontrada');

    if (input.name !== undefined) category.name = input.name;
    if (input.isActive !== undefined) category.isActive = input.isActive;

    await category.save();
    return category;
  },
};

export const PRODUCT_STATUSES = Object.values(PRODUCT_STATUS);
export const PRODUCT_TYPES = Object.values(PRODUCT_TYPE);

export type CatalogAdminService = typeof catalogAdminService;
