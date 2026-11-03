import { Op, type Transaction } from 'sequelize';
import {
  Allergen, CakeProductProfile, CustomizationGroup, CustomizationOption, InventoryItem, Product,
  ProductAllergen, ProductCustomizationGroup, ProductDietaryTag, ProductVariant,
  Recipe, RecipeItem, sequelize,
} from '@database/models';

/** Recalcula la lista conservadora de alérgenos posibles para todas las presentaciones. */
export const refreshCakeAllergens = async (productId: number, transaction?: Transaction) => {
  const profile = await CakeProductProfile.findByPk(productId, { transaction });
  if (!profile) return { missingItems: [] as string[], complete: false };

  const variants = await ProductVariant.findAll({ where: { productId, isActive: true }, attributes: ['id'], transaction });
  const recipes = variants.length ? await Recipe.findAll({
    where: { variantId: { [Op.in]: variants.map((variant) => variant.id) }, isActive: true },
    attributes: ['id', 'variantId'], transaction,
  }) : [];
  const lines = recipes.length ? await RecipeItem.findAll({
    where: { recipeId: { [Op.in]: recipes.map((recipe) => recipe.id) } },
    attributes: ['recipeId', 'inventoryItemId'], transaction,
  }) : [];
  const links = await ProductCustomizationGroup.findAll({ where: { productId, isActive: true }, attributes: ['groupId', 'minSelectionOverride'], transaction });
  const groupIds = [...new Set(links.map((link) => link.groupId))];
  const groups = groupIds.length ? await CustomizationGroup.findAll({
    where: { id: { [Op.in]: groupIds }, isActive: true }, attributes: ['id', 'minSelection'], transaction,
  }) : [];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const options = groupIds.length ? await CustomizationOption.findAll({
    where: { groupId: { [Op.in]: groupIds }, status: 'ACTIVE' },
    attributes: ['groupId', 'inventoryItemId', 'allergens'], transaction,
  }) : [];
  const itemIds = [...new Set([
    ...lines.map((line) => line.inventoryItemId),
    ...options.map((option) => option.inventoryItemId).filter((id): id is number => id !== null),
  ])];
  const items = itemIds.length ? await InventoryItem.findAll({ where: { id: { [Op.in]: itemIds } }, attributes: ['id', 'name', 'allergens'], transaction }) : [];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const missingItems = itemIds.filter((id) => !Array.isArray(itemById.get(id)?.allergens))
    .map((id) => itemById.get(id)?.name ?? `Insumo ${id}`);
  const codes = new Set([
    ...items.flatMap((item) => Array.isArray(item.allergens) ? item.allergens : []),
    ...options.flatMap((option) => Array.isArray(option.allergens) ? option.allergens : []),
  ]);
  const master = await Allergen.findAll({ attributes: ['id', 'code'], transaction });
  const knownCodes = new Set(master.map((allergen) => allergen.code));
  const optionsComplete = profile.saleMode !== 'SEMI_CUSTOM' || (links.length > 0 && links.every((link) => {
    const group = groupById.get(link.groupId);
    return group && options.filter((option) => option.groupId === link.groupId).length
      >= Math.max(1, link.minSelectionOverride ?? group.minSelection);
  }));
  const complete = variants.length > 0 && recipes.length === variants.length
    && recipes.every((recipe) => lines.some((line) => line.recipeId === recipe.id))
    && optionsComplete
    && missingItems.length === 0 && [...codes].every((code) => knownCodes.has(code))
    && master.length > 0;
  const nextIds = complete ? master.filter((allergen) => codes.has(allergen.code)).map((allergen) => allergen.id) : [];

  const save = async (tx: Transaction) => {
    const previous = await ProductAllergen.findAll({ where: { productId }, attributes: ['allergenId'], transaction: tx });
    const previousIds = previous.map((row) => row.allergenId);
    if (previousIds.length !== nextIds.length || previousIds.some((id) => !nextIds.includes(id))) {
      await ProductAllergen.destroy({ where: { productId }, transaction: tx });
      if (nextIds.length) await ProductAllergen.bulkCreate(nextIds.map((allergenId) => ({ productId, allergenId, level: 'CONTAINS' })), { transaction: tx });
      await ProductDietaryTag.destroy({ where: { productId }, transaction: tx });
    }
    await Product.update({ allergensReviewedAt: complete ? new Date() : null }, { where: { id: productId }, transaction: tx });
  };
  if (transaction) await save(transaction);
  else await sequelize.transaction(save);
  return { missingItems, complete };
};

export const refreshCakesUsingInventoryItem = async (inventoryItemId: number, transaction?: Transaction): Promise<void> => {
  const recipeLines = await RecipeItem.findAll({ where: { inventoryItemId }, attributes: ['recipeId'], transaction });
  const recipeIds = [...new Set(recipeLines.map((line) => line.recipeId))];
  const recipes = recipeIds.length ? await Recipe.findAll({ where: { id: { [Op.in]: recipeIds } }, attributes: ['productId'], transaction }) : [];
  const options = await CustomizationOption.findAll({ where: { inventoryItemId }, attributes: ['groupId'], transaction });
  const groupIds = [...new Set(options.map((option) => option.groupId))];
  const links = groupIds.length ? await ProductCustomizationGroup.findAll({
    where: { groupId: { [Op.in]: groupIds } }, attributes: ['productId'], transaction,
  }) : [];
  for (const productId of new Set([...recipes.map((recipe) => recipe.productId), ...links.map((link) => link.productId)])) {
    await refreshCakeAllergens(productId, transaction);
  }
};
