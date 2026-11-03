import type { SubscriptionPlan } from './subscriptionsApi';

export const retailTotal = (plan: SubscriptionPlan) => plan.items.reduce((sum, item) => sum + item.catalogPrice * item.quantity, 0);

export const planSavings = (plan: SubscriptionPlan) => Math.max(0, Math.round((retailTotal(plan) - plan.monthlyPrice) * 100) / 100);

export const boxImageFallbacks: Record<string, string> = {
  'mini-alfajores-de-manjar': '/images/pastry/mini-alfajores.png',
  'brownies-de-almendras-sin-azucar': '/images/pastry/brownie-almendras.png',
  'trufas-de-cacao': '/images/pastry/trufas-cacao.png',
  'turron-de-dona-pepa': '/images/pastry/turron-dona-pepa.png',
  'turron-de-almendras-y-miel': '/images/pastry/turron-almendras.png',
  'fatia-de-chocolate-intenso': '/images/pastry/fatia-chocolate.png',
};
