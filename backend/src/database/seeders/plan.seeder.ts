import { logger } from '@config/logger';
import { Plan, PlanBenefit } from '../models';
import { BENEFIT_TYPE, type BenefitType } from '../models/planBenefit.model';

/**
 * PLANES DE EJEMPLO
 * ---------------------------------------------------------------------------
 * Decisiones de Fase 0: el plan da SALDO CON BONIFICACION + DESCUENTO +
 * DELIVERY GRATIS. El bono vence con el plan; el capital pagado conserva 180 días.
 *
 * price         = lo que paga el cliente
 * grantedCredit = el saldo que recibe (la diferencia es la bonificacion)
 *
 * Todo esto es configurable desde datos: cambiar un plan no requiere tocar codigo.
 */
interface SeedPlan {
  code: string;
  name: string;
  description: string;
  price: number;
  grantedCredit: number;
  validityDays: number;
  isFeatured?: boolean;
  sortOrder: number;
  benefits: Array<{
    type: BenefitType;
    value: number;
    maxAmountPerOrder: number | null;
    description: string;
  }>;
}

const PLANS: SeedPlan[] = [
  {
    code: 'PRUEBA',
    name: 'Plan Prueba',
    description: 'Para conocernos: recarga S/ 150 y recibe S/ 165 de saldo.',
    price: 150,
    grantedCredit: 165, // +10% de bonificacion
    validityDays: 30,
    sortOrder: 1,
    benefits: [
      {
        type: BENEFIT_TYPE.FREE_DELIVERY,
        value: 0,
        maxAmountPerOrder: null,
        description: 'Delivery gratis en todos tus pedidos',
      },
    ],
  },
  {
    code: 'SEMANAL',
    name: 'Plan Semana Verde',
    description: 'Come saludable toda la semana: S/ 300 se convierten en S/ 345.',
    price: 300,
    grantedCredit: 345, // +15%
    validityDays: 45,
    isFeatured: true,
    sortOrder: 2,
    benefits: [
      {
        type: BENEFIT_TYPE.FREE_DELIVERY,
        value: 0,
        maxAmountPerOrder: null,
        description: 'Delivery gratis en todos tus pedidos',
      },
      {
        type: BENEFIT_TYPE.DISCOUNT_PERCENT,
        value: 5,
        maxAmountPerOrder: 10,
        description: '5% de descuento en cada pedido (hasta S/ 10)',
      },
    ],
  },
  {
    code: 'MENSUAL',
    name: 'Plan Mes Completo',
    description: 'El mejor precio por plato: S/ 600 se convierten en S/ 720.',
    price: 600,
    grantedCredit: 720, // +20%
    validityDays: 60,
    sortOrder: 3,
    benefits: [
      {
        type: BENEFIT_TYPE.FREE_DELIVERY,
        value: 0,
        maxAmountPerOrder: null,
        description: 'Delivery gratis en todos tus pedidos',
      },
      {
        type: BENEFIT_TYPE.DISCOUNT_PERCENT,
        value: 10,
        maxAmountPerOrder: 20,
        description: '10% de descuento en cada pedido (hasta S/ 20)',
      },
    ],
  },
];

export const seedPlans = async (): Promise<void> => {
  for (const seed of PLANS) {
    const [plan, created] = await Plan.findOrCreate({
      where: { code: seed.code },
      defaults: {
        code: seed.code,
        name: seed.name,
        description: seed.description,
        price: seed.price,
        grantedCredit: seed.grantedCredit,
        validityDays: seed.validityDays,
        isFeatured: seed.isFeatured ?? false,
        sortOrder: seed.sortOrder,
        cityId: null,
        isActive: true,
      },
    });

    // El seeder solo CREA lo que falta: nunca sobrescribe. Si alguien ajusta el
    // precio o la bonificacion de un plan, un reinicio no debe deshacerlo.
    void created;

    for (const benefit of seed.benefits) {
      await PlanBenefit.findOrCreate({
        where: { planId: plan.id, type: benefit.type },
        defaults: { ...benefit, planId: plan.id, isActive: true },
      });
    }
  }

  logger.success(`Planes listos: ${PLANS.map((plan) => plan.name).join(', ')}`);
};
