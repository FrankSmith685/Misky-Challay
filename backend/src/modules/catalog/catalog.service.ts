import { Op, type WhereOptions } from 'sequelize';
import {
  Allergen,
  CakeProductProfile,
  BranchProductAvailability,
  Category,
  DietaryTag,
  Product,
  ProductVariant,
  BranchInventory,
  InventoryItem,
  Recipe,
  RecipeItem,
} from '@database/models';
import { PRODUCT_STATUS, type ProductFamily, type PreparationMode } from '@database/models/product.model';
import { ApiError } from '@shared/errors/ApiError';

export interface CatalogFilters {
  branchId?: number;
  categoryId?: number;
  search?: string;
  dietaryTags?: string[];
  excludeAllergens?: string[];
  featured?: boolean;
  /** Canal de publicación. Sin filtro se conserva el catálogo para operaciones internas. */
  audience?: 'RETAIL' | 'BUSINESS';
}

export interface ProductListItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  family: ProductFamily;
  preparationMode: PreparationMode;
  minLeadHours: number;
  categoryId: number;
  imageUrl: string | null;
  isFeatured: boolean;
  priceFrom: number;
  /** Variante por defecto: permite anadir un producto FIJO al carrito sin abrir su ficha. */
  defaultVariantId: number | null;
  defaultVariantName: string | null;
  defaultVariantPrice: number;
  dietaryTags: string[];
  allergens: string[];
  isAvailable: boolean;
  cakeSaleMode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED';
}

const pickDefaultVariant = (variants: ProductVariant[]): ProductVariant | undefined =>
  variants.find((variant) => variant.isDefault) ?? variants[0];

const includeForProduct = () => [
  { model: CakeProductProfile, as: 'cakeProfile', required: true, where: { isActive: true } },
  { model: Category, as: 'category', required: true, where: { isActive: true }, attributes: ['id', 'name'] },
  {
    model: ProductVariant,
    as: 'variants',
    required: true,
    where: { isActive: true },
    include: [],
  },
  { model: DietaryTag, as: 'dietaryTags', through: { attributes: [] }, required: false },
  { model: Allergen, as: 'allergens', through: { attributes: [] }, required: false },
];

/** Comprueba las presentaciones preparadas en lote, descontando las reservas. */
const readyStockAvailability = async (products: Product[], branchId?: number) => {
  const result = new Map<number, boolean>();
  const ready = products.filter((product) => product.preparationMode === 'READY_STOCK');
  if (!branchId || !ready.length) return result;
  const variants = ready.flatMap((product) => product.variants ?? []);
  const recipes = await Recipe.findAll({ where: { variantId: { [Op.in]: variants.map((variant) => variant.id) }, isActive: true }, include: [{ model: RecipeItem, as: 'items' }] });
  const itemIds = [...new Set(recipes.flatMap((recipe) => (recipe.items ?? []).map((line) => line.inventoryItemId)))];
  const stocks = itemIds.length ? await BranchInventory.findAll({ where: { branchId, inventoryItemId: { [Op.in]: itemIds } }, include: [{ model: InventoryItem, as: 'item', where: { isActive: true, itemType: 'FINISHED_PRODUCT' }, required: true }] }) : [];
  const available = new Map(stocks.map((stock) => [stock.inventoryItemId, stock.available]));
  for (const product of ready) result.set(product.id, (product.variants ?? []).some((variant) => {
    const recipe = recipes.find((entry) => entry.variantId === variant.id);
    return Boolean(recipe?.items?.length && recipe.items.every((line) => (available.get(line.inventoryItemId) ?? 0)
      >= Number(line.quantity) * (1 + Number(line.wastePercent) / 100) / Math.max(1, Number(recipe.yieldQuantity))));
  }));
  return result;
};

export const catalogService = {
  async listCategories() {
    const profiles = await CakeProductProfile.findAll({ where: { isActive: true, saleMode: { [Op.ne]: 'ADVANCED' } }, attributes: ['productId'] });
    const products = await Product.findAll({ where: { id: { [Op.in]: profiles.map((profile) => profile.productId) }, status: PRODUCT_STATUS.ACTIVE, allergensReviewedAt: { [Op.ne]: null } }, attributes: ['categoryId'] });
    const categoryIds = [...new Set(products.map((product) => product.categoryId))];
    return Category.findAll({
      where: { isActive: true, id: { [Op.in]: categoryIds } },
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
    const where: WhereOptions = { status: PRODUCT_STATUS.ACTIVE, allergensReviewedAt: { [Op.ne]: null } };

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

    const readyAvailability = await readyStockAvailability(products, filters.branchId);
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
        family: product.family,
        preparationMode: product.preparationMode,
        minLeadHours: (product.get('cakeProfile') as CakeProductProfile).minLeadHours,
        categoryId: product.categoryId,
        imageUrl: product.imageUrl,
        isFeatured: product.isFeatured,
        priceFrom: variants.length
          ? Math.min(...variants.map((entry) => Number(entry.basePrice)))
          : 0,
        defaultVariantId: variant?.id ?? null,
        defaultVariantName: variant?.name ?? null,
        defaultVariantPrice: variant ? Number(variant.basePrice) : 0,
        dietaryTags: tags.map((tag) => tag.code),
        allergens: allergens.map((allergen) => allergen.code),
        isAvailable: !unavailableIds.has(product.id) && readyAvailability.get(product.id) !== false,
        cakeSaleMode: (product.get('cakeProfile') as CakeProductProfile).saleMode,
      };
    });

    // Filtros dietarios (se resuelven sobre el resultado ya cargado).
    return items.filter((item) => {
      if (filters.audience === 'RETAIL' && item.cakeSaleMode === 'ADVANCED') return false;
      if (filters.audience === 'BUSINESS' && item.cakeSaleMode !== 'ADVANCED') return false;
      if (filters.dietaryTags?.length) {
        const hasAll = filters.dietaryTags.every((tag) => item.dietaryTags.includes(tag));
        if (!hasAll) return false;
      }

      if (filters.excludeAllergens?.length) {
        const hasForbidden = filters.excludeAllergens.some((code) => item.allergens.includes(code));
        if (hasForbidden) return false;
      }

      return true;
    });
  },

  /** Ficha completa: variantes, alergenos y etiquetas. */
  async getProductBySlug(slug: string, branchId?: number) {
    const product = await Product.findOne({
      where: { slug, status: PRODUCT_STATUS.ACTIVE, allergensReviewedAt: { [Op.ne]: null } },
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
    const readyAvailability = await readyStockAvailability([product], branchId);
    isAvailable = isAvailable && readyAvailability.get(product.id) !== false;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      type: product.type,
      family: product.family,
      preparationMode: product.preparationMode,
      minLeadHours: (product.get('cakeProfile') as CakeProductProfile).minLeadHours,
      categoryId: product.categoryId,
      imageUrl: product.imageUrl,
      isAvailable,
      cakeSaleMode: (product.get('cakeProfile') as CakeProductProfile).saleMode,
      variants: variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        basePrice: Number(variant.basePrice),
        servingSize: variant.servingSize === null ? null : Number(variant.servingSize),
        servingUnit: variant.servingUnit,
        isDefault: variant.isDefault,
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
