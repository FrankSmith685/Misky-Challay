import { Op } from 'sequelize';
import { logger } from '@config/logger';
import { Branch, Product, ProductVariant, SubscriptionPlan } from '../models';

/** Cajas iniciales. La ficha en Superadmin es la fuente de verdad tras crearlas. */
const STARTER_PLANS = [
  {
    code: 'CAJA_DULCE', name: 'Caja Dulce',
    description: 'Una caja de mini alfajores y una caja de brownies de almendras para disfrutar cada mes.',
    monthlyPrice: 57, leadDays: 2, maxActiveSubscribers: 30, maxDailyPickups: 6,
    skus: ['MINI-ALFAJORES-DE-MA-47', 'BROWNIES-DE-ALMENDRA-50'],
  },
  {
    code: 'CAJA_COMPARTIR', name: 'Caja Compartir',
    description: 'Mini alfajores, trufas de cacao y brownies de almendras para compartir.',
    monthlyPrice: 91, leadDays: 2, maxActiveSubscribers: 25, maxDailyPickups: 5,
    skus: ['MINI-ALFAJORES-DE-MA-47', 'TRUFAS-DE-CACAO-48', 'BROWNIES-DE-ALMENDRA-50'],
  },
  {
    code: 'CAJA_CELEBRACION', name: 'Caja Celebración',
    description: 'Mini alfajores, trufas, dos turrones y una porción de chocolate para una celebración mensual.',
    monthlyPrice: 150, leadDays: 3, maxActiveSubscribers: 20, maxDailyPickups: 4,
    skus: ['MINI-ALFAJORES-DE-MA-47', 'TRUFAS-DE-CACAO-48', 'TURRON-DE-DONA-PEPA-45', 'TURRON-DE-ALMENDRAS--46', 'FATIA-DE-CHOCOLATE-I-44'],
  },
] as const;

export const seedSubscriptionPlans = async (): Promise<void> => {
  const branch = await Branch.findOne({ where: { slug: 'dulceflow-miraflores', isActive: true, acceptsPickup: true } });
  if (!branch) {
    logger.warn('Cajas mensuales: falta la sucursal de recojo Miraflores; créala desde el panel');
    return;
  }

  const missingPlans = [];
  for (const definition of STARTER_PLANS) {
    // Nunca sobreescribir un plan que un administrador editó o desactivó.
    if (await SubscriptionPlan.findOne({ where: { code: definition.code } })) continue;
    const variants = await ProductVariant.findAll({
      where: { sku: { [Op.in]: [...definition.skus] }, isActive: true },
      include: [{ model: Product, as: 'product', where: { status: 'ACTIVE', type: 'FIXED', family: { [Op.ne]: 'CAKE' } } }],
    });
    if (variants.length !== definition.skus.length) {
      missingPlans.push(definition.code);
      continue;
    }
    const retail = variants.reduce((sum, variant) => sum + Number(variant.basePrice), 0);
    if (retail <= definition.monthlyPrice) {
      logger.warn(`Caja ${definition.code}: revisa el precio mensual frente al catálogo antes de publicarla`);
      missingPlans.push(definition.code);
      continue;
    }
    await SubscriptionPlan.findOrCreate({
      where: { code: definition.code },
      defaults: {
        code: definition.code, name: definition.name, description: definition.description,
        monthlyPrice: definition.monthlyPrice,
        itemsJson: definition.skus.map((sku) => ({ variantId: variants.find((variant) => variant.sku === sku)!.id, quantity: 1 })),
        branchIdsJson: [branch.id], leadDays: definition.leadDays,
        maxActiveSubscribers: definition.maxActiveSubscribers, maxDailyPickups: definition.maxDailyPickups,
        isActive: true, sortOrder: STARTER_PLANS.indexOf(definition) + 1,
      },
    });
  }
  if (missingPlans.length) logger.warn(`Cajas mensuales omitidas por catálogo incompleto: ${missingPlans.join(', ')}`);
  logger.success('Cajas mensuales iniciales revisadas');
};
