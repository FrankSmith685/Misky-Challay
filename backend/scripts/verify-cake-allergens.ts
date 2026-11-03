/** Verifica el cálculo con datos reales y revierte todas las escrituras de prueba. */
import { Allergen, Branch, CakeProductProfile, Product, ProductAllergen, registerModels, sequelize } from '../src/database/models';
import { env } from '../src/config/env';
import { refreshCakeAllergens } from '../src/modules/catalog/cakeAllergens.service';
import { inventoryService } from '../src/modules/operations/inventory.service';

const main = async (): Promise<void> => {
  if (env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST)
    || env.DB_NAME !== 'DulceFlow' || env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Esta verificación solo se permite en la base local de desarrollo');
  }
  registerModels();
  await sequelize.authenticate();
  const profiles = await CakeProductProfile.findAll({ attributes: ['productId'] });
  const branch = await Branch.findOne({ where: { isActive: true }, attributes: ['id'] });
  const stock = branch ? await inventoryService.listStock(branch.id) : [];
  const results = [];
  for (const profile of profiles) {
    const persistedProduct = await Product.findByPk(profile.productId, { attributes: ['allergensReviewedAt'] });
    const persistedLinks = await ProductAllergen.findAll({ where: { productId: profile.productId }, attributes: ['allergenId'] });
    const persistedCodes = persistedLinks.length ? await Allergen.findAll({
      where: { id: persistedLinks.map((link) => link.allergenId) }, attributes: ['code'], order: [['code', 'ASC']],
    }) : [];
    const transaction = await sequelize.transaction();
    try {
      const result = await refreshCakeAllergens(profile.productId, transaction);
      const product = await Product.findByPk(profile.productId, { transaction, attributes: ['name', 'status', 'allergensReviewedAt'] });
      results.push({
        productId: profile.productId, name: product?.name, status: product?.status,
        allergensReviewedAt: persistedProduct?.allergensReviewedAt ?? null,
        declaredAllergens: persistedCodes.map((row) => row.code), ...result,
      });
    } finally {
      await transaction.rollback();
    }
  }
  console.log(JSON.stringify({
    branchId: branch?.id ?? null,
    inventoryRows: stock.length,
    inventoryPending: stock.filter((row) => row.allergens === null).length,
    cakeInventoryPending: stock.filter((row) => row.usedInCake && row.allergens === null).length,
    cakes: results,
  }, null, 2));
};

main().catch((error) => { console.error(`Verificación falló: ${error.message}`); process.exitCode = 1; })
  .finally(async () => { await sequelize.close(); });
