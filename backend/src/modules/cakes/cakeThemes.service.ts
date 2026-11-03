import { Op } from 'sequelize';
import { Allergen, CakeTheme, Product, ProductVariant, CakeProductProfile, MediaAsset, BranchInventory, sequelize } from '@database/models';
import type { CakeThemeRule } from '@database/models/cakeTheme.model';
import { ApiError } from '@shared/errors/ApiError';
import { catalogService } from '@modules/catalog/catalog.service';
import { customizationService } from '@modules/customization/customization.service';
import { themeMaterials } from './cakeThemeRules';

export interface CakeThemeDraft {
  productId: number; name: string; theme: string; description: string; imageUrlsJson: string[];
  saleMode: 'CONFIGURED' | 'QUOTE'; minLeadHours: number; minServings: number; maxServings: number;
  variantRulesJson: CakeThemeRule[]; isActive: boolean; sortOrder: number;
}
const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const cakeThemesService = {
  async listAdmin() { return CakeTheme.findAll({ order: [['sortOrder', 'ASC'], ['name', 'ASC']] }); },

  async save(input: CakeThemeDraft, id?: number, expectedVersion?: number) {
    const [product, profile, variants] = await Promise.all([
      Product.findByPk(input.productId), CakeProductProfile.findByPk(input.productId), ProductVariant.findAll({ where: { productId: input.productId, isActive: true } }),
    ]);
    if (!product || product.family !== 'CAKE' || product.preparationMode !== 'MADE_TO_ORDER' || profile?.saleMode !== 'SEMI_CUSTOM') throw ApiError.unprocessable('Selecciona una torta personalizada por encargo como base');
    if (input.maxServings < input.minServings) throw ApiError.badRequest('El máximo de porciones debe ser mayor o igual al mínimo');
    if (new Set(input.variantRulesJson.map((rule) => rule.variantId)).size !== input.variantRulesJson.length) throw ApiError.badRequest('No repitas presentaciones');
    if (input.variantRulesJson.some((rule) => !variants.some((variant) => variant.id === rule.variantId))) throw ApiError.unprocessable('Elige presentaciones activas de la torta base');
    for (const url of input.imageUrlsJson) {
      if (!url.startsWith('/api/v1/media/files/') || !await MediaAsset.findOne({ where: { url } })) throw ApiError.badRequest('Selecciona las imágenes desde la biblioteca de medios');
    }
    if (input.isActive) {
      if (product.status !== 'ACTIVE' || !product.allergensReviewedAt || !profile.isActive) throw ApiError.unprocessable('Publica y completa los alérgenos de la torta base antes de publicar el diseño');
      if (!input.imageUrlsJson.length) throw ApiError.unprocessable('Agrega al menos una imagen de referencia');
      if (input.saleMode === 'CONFIGURED' && !input.variantRulesJson.length) throw ApiError.unprocessable('Configura al menos una presentación para la venta directa');
      const config = input.saleMode === 'CONFIGURED' ? await customizationService.getConfig(input.productId) : null;
      for (const rule of input.saleMode === 'CONFIGURED' ? input.variantRulesJson : []) {
        if (!rule.materials.length || !Object.values(rule.effort).some((minutes) => Number(minutes) > 0)) throw ApiError.unprocessable('Registra materiales y tiempo adicional para cada presentación del diseño');
        await themeMaterials(rule);
        const groups = config!.groups.filter((group) => group.variantId === null || group.variantId === rule.variantId);
        const optionIds = new Set(groups.flatMap((group) => group.options.map((option) => option.id)));
        const groupIds = new Set(groups.map((group) => group.id));
        if (new Set(rule.hiddenGroupIds ?? []).size !== (rule.hiddenGroupIds ?? []).length || (rule.hiddenGroupIds ?? []).some((groupId) => !groupIds.has(groupId))) throw ApiError.unprocessable('Los pasos fijados por el diseño deben pertenecer a esta presentación');
        if (rule.excludedOptionIds.some((optionId) => !optionIds.has(optionId))) throw ApiError.unprocessable('Las restricciones deben usar opciones de esta presentación');
        if (groups.some((group) => !(rule.hiddenGroupIds ?? []).includes(group.id) && group.options.filter((option) => option.isAvailable && !rule.excludedOptionIds.includes(option.id)).reduce((sum, option) => sum + option.maxPerItem, 0) < group.minSelection)) throw ApiError.unprocessable('Las restricciones dejan un grupo obligatorio sin suficientes opciones');
      }
    }
    return sequelize.transaction(async (transaction) => {
      if (id) {
        const row = await CakeTheme.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!row) throw ApiError.notFound('Diseño no encontrado');
        if (row.version !== expectedVersion) throw ApiError.conflict('El diseño cambió mientras lo editabas. Recarga para continuar');
        await row.update({ ...input, version: row.version + 1 }, { transaction });
        return row;
      }
      const stem = slugify(input.name);
      if (!stem) throw ApiError.badRequest('El nombre debe contener letras o números');
      const row = await CakeTheme.create({ ...input, slug: `${stem}-${Date.now().toString(36)}` }, { transaction });
      return row;
    });
  },

  async archive(id: number, expectedVersion: number) {
    return sequelize.transaction(async (transaction) => {
      const row = await CakeTheme.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw ApiError.notFound('Diseño no encontrado');
      if (row.version !== expectedVersion) throw ApiError.conflict('El diseño cambió. Recarga para continuar');
      await row.update({ isActive: false, version: row.version + 1 }, { transaction });
      return row;
    });
  },

  async listPublic(branchId?: number) {
    const products = await catalogService.listProducts({ branchId });
    const byId = new Map(products.filter((product) => product.family === 'CAKE' && product.cakeSaleMode === 'SEMI_CUSTOM').map((product) => [product.id, product]));
    const rows = await CakeTheme.findAll({ where: { isActive: true, productId: { [Op.in]: [...byId.keys()] } }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
    const output = [];
    const allergenNames = new Map((await Allergen.findAll({ attributes: ['code', 'name'] })).map((item) => [item.code, item.name]));
    for (const row of rows) {
      const product = byId.get(row.productId)!;
      const variants = await ProductVariant.findAll({ where: { productId: row.productId, isActive: true } });
      const rules = row.variantRulesJson.filter((rule) => variants.some((variant) => variant.id === rule.variantId));
      let materialsValid = true;
      let materialsAvailable = false;
      const allergens = new Set(product.allergens);
      for (const rule of rules) {
        try { for (const code of await themeMaterials(rule)) allergens.add(code); }
        catch { materialsValid = false; }
        const stock = branchId ? await BranchInventory.findAll({ where: { branchId, inventoryItemId: rule.materials.map((line) => line.inventoryItemId) } }) : [];
        if (!branchId || rule.materials.every((line) => Number(stock.find((entry) => entry.inventoryItemId === line.inventoryItemId)?.available ?? 0) >= line.quantity)) materialsAvailable = true;
      }
      if (row.saleMode === 'CONFIGURED' && (!rules.length || !materialsValid)) continue;
      const prices = rules.map((rule) => Number(variants.find((variant) => variant.id === rule.variantId)!.basePrice) + Number(rule.priceDelta));
      output.push({
        id: row.id, version: row.version, slug: row.slug, name: row.name, theme: row.theme, description: row.description,
        productId: row.productId, productSlug: product.slug, imageUrls: row.imageUrlsJson,
        saleMode: row.saleMode, minLeadHours: Math.max(product.minLeadHours, row.minLeadHours), minServings: row.minServings, maxServings: row.maxServings,
        variantRules: rules.map((rule) => ({ variantId: rule.variantId, priceDelta: Number(rule.priceDelta), excludedOptionIds: rule.excludedOptionIds, hiddenGroupIds: rule.hiddenGroupIds ?? [] })),
        variants: variants.map((variant) => ({ id: variant.id, name: variant.name, servingSize: variant.servingSize, basePrice: Number(variant.basePrice) })),
        priceFrom: row.saleMode === 'CONFIGURED' ? Math.min(...prices) : null,
        allergens: [...allergens], allergenNames: [...allergens].map((code) => allergenNames.get(code) ?? code), isAvailable: product.isAvailable && (row.saleMode === 'QUOTE' || materialsAvailable),
      });
    }
    return output;
  },

  async getPublic(slug: string, branchId?: number) {
    const row = (await cakeThemesService.listPublic(branchId)).find((entry) => entry.slug === slug);
    if (!row) throw ApiError.notFound('Este diseño no está publicado');
    return row;
  },
};
