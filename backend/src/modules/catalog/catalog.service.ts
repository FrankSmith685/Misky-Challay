import { Op, type WhereOptions } from 'sequelize';
import {
  Allergen,
  BranchProductAvailability,
  Category,
  DietaryTag,
  Product,
  ProductNutrition,
  ProductVariant,
} from '@database/models';
import { PRODUCT_STATUS } from '@database/models/product.model';
import { ApiError } from '@shared/errors/ApiError';

export interface CatalogFilters {
  branchId?: number;
  categoryId?: number;
  search?: string;
  dietaryTags?: string[];
  excludeAllergens?: string[];
  maxCalories?: number;
  minProtein?: number;
  featured?: boolean;
}

interface NutritionDto {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
}

export interface ProductListItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  categoryId: number;
  imageUrl: string | null;
  isFeatured: boolean;
  priceFrom: number;
  /** Variante por defecto: permite anadir un producto FIJO al carrito sin abrir su ficha. */
  defaultVariantId: number | null;
  defaultVariantName: string | null;
  defaultVariantPrice: number;
  nutrition: NutritionDto | null;
  dietaryTags: string[];
  allergens: string[];
  isAvailable: boolean;
}

const toNutrition = (row?: ProductNutrition | null): NutritionDto | null =>
  row
    ? {
        calories: Number(row.calories),
        protein: Number(row.protein),
        carbs: Number(row.carbs),
        fat: Number(row.fat),
        fiber: Number(row.fiber),
        sodium: Number(row.sodium),
      }
    : null;

/** Nutricion de la variante por defecto (o la primera): es la que se muestra en la tarjeta. */
const pickDefaultVariant = (variants: ProductVariant[]): ProductVariant | undefined =>
  variants.find((variant) => variant.isDefault) ?? variants[0];

const includeForProduct = () => [
  {
    model: ProductVariant,
    as: 'variants',
    required: false,
    where: { isActive: true },
    include: [{ model: ProductNutrition, as: 'nutrition', required: false }],
  },
  { model: DietaryTag, as: 'dietaryTags', through: { attributes: [] }, required: false },
  { model: Allergen, as: 'allergens', through: { attributes: [] }, required: false },
];

export const catalogService = {
  async listCategories() {
    return Category.findAll({
      where: { isActive: true },
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC'],
      ],
    });
  },

  async listAllergens() {
    return Allergen.findAll({ order: [['name', 'ASC']] });
  },

  async listDietaryTags() {
    return DietaryTag.findAll({ order: [['name', 'ASC']] });
  },

  /**
   * Menu con filtros (seccion 9.1).
   * RN-005: si se envia branchId, se ocultan los productos que esa cocina no puede preparar.
   */
  async listProducts(filters: CatalogFilters): Promise<ProductListItem[]> {
    const where: WhereOptions = { status: PRODUCT_STATUS.ACTIVE };

    if (filters.categoryId) Object.assign(where, { categoryId: filters.categoryId });
    if (filters.featured) Object.assign(where, { isFeatured: true });
    if (filters.search) {
      Object.assign(where, {
        [Op.or]: [
          { name: { [Op.like]: `%${filters.search}%` } },
          { description: { [Op.like]: `%${filters.search}%` } },
        ],
      });
    }

    const products = await Product.findAll({
      where,
      include: includeForProduct(),
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC'],
      ],
    });

    // Disponibilidad por sucursal (una consulta, no N+1).
    const unavailableIds = new Set<number>();
    if (filters.branchId) {
      const rows = await BranchProductAvailability.findAll({
        where: { branchId: filters.branchId, isAvailable: false },
        attributes: ['productId'],
      });
      rows.forEach((row) => unavailableIds.add(row.productId));
    }

    const items: ProductListItem[] = products.map((product) => {
      const variants = product.variants ?? [];
      const variant = pickDefaultVariant(variants);
      const tags = (product.get('dietaryTags') as DietaryTag[] | undefined) ?? [];
      const allergens = (product.get('allergens') as Allergen[] | undefined) ?? [];

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        type: product.type,
        categoryId: product.categoryId,
        imageUrl: product.imageUrl,
        isFeatured: product.isFeatured,
        priceFrom: variants.length
          ? Math.min(...variants.map((entry) => Number(entry.basePrice)))
          : 0,
        defaultVariantId: variant?.id ?? null,
        defaultVariantName: variant?.name ?? null,
        defaultVariantPrice: variant ? Number(variant.basePrice) : 0,
        nutrition: toNutrition(variant?.nutrition),
        dietaryTags: tags.map((tag) => tag.code),
        allergens: allergens.map((allergen) => allergen.code),
        isAvailable: !unavailableIds.has(product.id),
      };
    });

    // Filtros nutricionales y dietarios (se resuelven sobre el resultado ya cargado).
    return items.filter((item) => {
      if (filters.dietaryTags?.length) {
        const hasAll = filters.dietaryTags.every((tag) => item.dietaryTags.includes(tag));
        if (!hasAll) return false;
      }

      if (filters.excludeAllergens?.length) {
        const hasForbidden = filters.excludeAllergens.some((code) => item.allergens.includes(code));
        if (hasForbidden) return false;
      }

      if (filters.maxCalories !== undefined) {
        if (!item.nutrition || item.nutrition.calories > filters.maxCalories) return false;
      }

      if (filters.minProtein !== undefined) {
        if (!item.nutrition || item.nutrition.protein < filters.minProtein) return false;
      }

      return true;
    });
  },

  /** Ficha completa: variantes, nutricion por variante, alergenos y etiquetas. */
  async getProductBySlug(slug: string, branchId?: number) {
    const product = await Product.findOne({
      where: { slug, status: PRODUCT_STATUS.ACTIVE },
      include: includeForProduct(),
    });

    if (!product) throw ApiError.notFound('Producto no encontrado');

    let isAvailable = true;
    if (branchId) {
      const row = await BranchProductAvailability.findOne({
        where: { branchId, productId: product.id },
      });
      isAvailable = row ? row.isAvailable : true;
    }

    const variants = product.variants ?? [];
    const tags = (product.get('dietaryTags') as DietaryTag[] | undefined) ?? [];
    const allergens = (product.get('allergens') as Allergen[] | undefined) ?? [];

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      type: product.type,
      categoryId: product.categoryId,
      imageUrl: product.imageUrl,
      isAvailable,
      variants: variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        basePrice: Number(variant.basePrice),
        isDefault: variant.isDefault,
        nutrition: toNutrition(variant.nutrition),
      })),
      dietaryTags: tags.map((tag) => ({ code: tag.code, name: tag.name })),
      allergens: allergens.map((allergen) => ({
        code: allergen.code,
        name: allergen.name,
        warning: allergen.warning,
      })),
    };
  },
};

export type CatalogService = typeof catalogService;
