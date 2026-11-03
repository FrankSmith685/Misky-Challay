import { customizationService } from '../src/modules/customization/customization.service';
import { CakeProductProfile, registerModels } from '../src/database/models';
import { sequelize } from '../src/database/connection';
import { cakeProductionService } from '../src/modules/cakes/cakeProduction.service';
import { inventoryService } from '../src/modules/operations/inventory.service';
import { pricingService } from '../src/modules/pricing/pricing.service';

const fail = (message: string): never => { throw new Error(message); };

async function main() {
  registerModels();
  const productId = 26;
  const profile = await CakeProductProfile.findByPk(productId);
  const rule = profile?.customServingsJson;
  if (!rule?.enabled || !rule.baseVariantId) fail('La regla demo no esta activa');
  const config = await customizationService.getConfig(productId);
  const groups = config.groups.filter((group) => group.variantId === null || group.variantId === rule.baseVariantId);
  const selections = groups.flatMap((group) => {
    const available = group.options.filter((option) => option.isAvailable);
    if (available.length < group.minSelection) fail(`Faltan opciones: ${group.name}`);
    return available.slice(0, group.minSelection).map((option) => ({ optionId: option.id, quantity: 1 }));
  });
  const fixed = await customizationService.quote({ productId, variantId: rule.baseVariantId, quantity: 1, selections });
  const custom = await customizationService.quote({ productId, variantId: rule.baseVariantId, requestedServings: rule.minServings + 3, quantity: 1, selections });
  const baseServings = config.variants.find((variant) => variant.id === rule.baseVariantId)?.servingSize;
  if (!baseServings || custom.requestedServings !== rule.minServings + 3) fail('No se conservaron las porciones');
  const expectedBase = Math.round((fixed.basePrice + (custom.requestedServings - baseServings) * rule.pricePerExtraServing) * 100) / 100;
  if (custom.basePrice !== expectedBase || custom.lineTotal <= fixed.lineTotal) fail('Precio personalizado incorrecto');
  let rejected = false;
  try { await customizationService.quote({ productId, variantId: rule.baseVariantId, requestedServings: rule.maxServings + 1, quantity: 1, selections }); }
  catch { rejected = true; }
  if (!rejected) fail('Se aceptaron porciones fuera del rango');
  const deliveryAt = new Date(Date.now() + 10 * 24 * 60 * 60_000);
  const fixedNeeds = await cakeProductionService.estimateItem({ productId, variantId: rule.baseVariantId, quantity: 1, selections }, deliveryAt);
  const customNeeds = await cakeProductionService.estimateItem({ productId, variantId: rule.baseVariantId, requestedServings: custom.requestedServings, quantity: 1, selections }, deliveryAt);
  const minutes = (needs: typeof fixedNeeds) => needs.reduce((sum, need) => sum + need.minutes, 0);
  if (minutes(customNeeds) <= minutes(fixedNeeds)) fail('El tiempo de produccion no se escalo');
  const checkoutQuote = await pricingService.quoteOrder({ branchId: 1, deliveryType: 'PICKUP', items: [{ productId, variantId: rule.baseVariantId, requestedServings: custom.requestedServings, quantity: 1, selections }] });
  if (checkoutQuote.items[0]?.lineTotal !== custom.lineTotal || checkoutQuote.items[0]?.requestedServings !== custom.requestedServings) fail('El checkout no conservo el precio o las porciones');
  let stock = 'available';
  try { await inventoryService.assertCartAvailability(1, [{ productId, variantId: rule.baseVariantId, requestedServings: custom.requestedServings, quantity: 1, selections }]); }
  catch (error) { stock = error instanceof Error ? error.message : String(error); }
  console.log(JSON.stringify({ fixed: fixed.lineTotal, custom: custom.lineTotal, checkout: checkoutQuote.items[0]?.lineTotal, servings: custom.requestedServings, fixedMinutes: minutes(fixedNeeds), customMinutes: minutes(customNeeds), stock, outOfRangeRejected: rejected }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await sequelize.close(); });
