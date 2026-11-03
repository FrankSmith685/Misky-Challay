import assert from 'node:assert/strict';
import { env } from '../src/config/env';
import { registerModels, CakeTheme, InventoryItem, BranchInventory, Order, OrderItem, OrderItemCustomization, CakeStationCapacity, CakeCapacityReservation, CakeOrderCostSnapshot } from '../src/database/models';
import { sequelize } from '../src/database/connection';
import { customizationService } from '../src/modules/customization/customization.service';
import { pricingService } from '../src/modules/pricing/pricing.service';
import { inventoryService, calculateRequirements } from '../src/modules/operations/inventory.service';
import { cakeProductionService } from '../src/modules/cakes/cakeProduction.service';
import { cakeFinanceService } from '../src/modules/cakes/cakeFinance.service';

async function main() {
  assert.equal(env.NODE_ENV, 'development');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST));
  registerModels();
  const example = await CakeTheme.findOne({ where: { isActive: true, saleMode: 'CONFIGURED' } });
  assert.ok(example, 'Carga primero los diseños de demostración');
  const suffix = Date.now().toString(36);
  let item: InventoryItem | undefined;
  let theme: CakeTheme | undefined;
  try {
    item = await InventoryItem.create({ code: `VFY-THEME-${suffix}`, name: `Verificación temporal ${suffix}`, unit: 'und', unitCost: 5, allergens: ['sesamo'] });
    await BranchInventory.create({ branchId: 1, inventoryItemId: item.id, onHand: 3, reserved: 0, averageUnitCost: 5 });
    const sourceRule = example.variantRulesJson[0];
    const rule = { ...sourceRule, priceDelta: 37, materials: [{ inventoryItemId: item.id, quantity: 2 }], effort: { DESIGN: 7, DECORATING: 23 } };
    theme = await CakeTheme.create({ ...example.toJSON(), id: undefined, slug: `vfy-theme-${suffix}`, name: `Verificación temporal ${suffix}`, version: 1, minLeadHours: 120, variantRulesJson: [rule] });
    const config = await customizationService.getConfig(theme.productId);
    const selections = config.groups.filter((group) => group.variantId === null || group.variantId === sourceRule.variantId).flatMap((group) => group.options.filter((option) => option.isAvailable && !rule.excludedOptionIds.includes(option.id)).slice(0, group.minSelection).map((option) => ({ optionId: option.id, quantity: 1 })));
    const base = { productId: theme.productId, variantId: rule.variantId, quantity: 1, selections };
    const line = { ...base, themeId: theme.id, themeVersion: theme.version };
    const baseline = await customizationService.quote(base);
    const quote = await customizationService.quote(line);
    assert.equal(quote.lineTotal, baseline.lineTotal + 37);
    assert.ok(quote.theme?.allergens.includes('sesamo'));
    const doubled = await pricingService.quoteOrder({ branchId: 1, deliveryType: 'PICKUP', items: [{ ...line, quantity: 2 }] });
    assert.equal(doubled.items[0].lineTotal, quote.lineTotal * 2);
    await assert.rejects(() => customizationService.quote({ ...line, themeVersion: 999 }));
    await assert.rejects(() => customizationService.quote({ ...line, requestedServings: 30 }));
    if (rule.excludedOptionIds[0]) await assert.rejects(() => customizationService.quote({ ...line, selections: [...selections, { optionId: rule.excludedOptionIds[0], quantity: 1 }] }));
    await assert.rejects(() => inventoryService.assertCartAvailability(1, [{ ...line, quantity: 2 }]));
    await inventoryService.assertCartAvailability(1, [line]);
    await assert.rejects(() => cakeProductionService.estimateItem(line, new Date(Date.now() + 100 * 3600000)));
    const deliveryAt = new Date(Date.now() + 12 * 86400000);
    const basicNeeds = await cakeProductionService.estimateItem(base, deliveryAt);
    const needs = await cakeProductionService.estimateItem(line, deliveryAt);
    const minutes = (rows: typeof needs) => rows.reduce((sum, row) => sum + row.minutes, 0);
    assert.equal(minutes(needs) - minutes(basicNeeds), 30);
    const transaction = await sequelize.transaction();
    try {
      const order = await Order.create({ orderNumber: `VFYTH${suffix}`, userId: null, branchId: 1, deliveryType: 'PICKUP', scheduledAt: deliveryAt, subtotal: quote.lineTotal, grandTotal: quote.lineTotal }, { transaction });
      const orderItem = await OrderItem.create({ orderId: order.id, productId: theme.productId, variantId: rule.variantId, productNameSnapshot: theme.name, quantity: 1, unitPrice: quote.unitPrice, lineTotal: quote.lineTotal, themeSnapshotJson: quote.theme }, { transaction });
      for (const choice of quote.selections) await OrderItemCustomization.create({ orderItemId: orderItem.id, groupId: choice.groupId, groupNameSnapshot: choice.groupName, optionId: choice.optionId, optionNameSnapshot: choice.optionName, quantity: choice.quantity, priceDelta: choice.priceDelta, lineExtra: choice.lineExtra, cakeScaleWithServings: choice.cakeScaleWithServings }, { transaction });
      for (const need of needs) {
        const [capacity] = await CakeStationCapacity.findOrCreate({ where: { branchId: 1, workDate: need.workDate, station: need.station }, defaults: { branchId: 1, workDate: need.workDate, station: need.station, capacityMinutes: 1440 }, transaction });
        await capacity.update({ capacityMinutes: Math.max(capacity.capacityMinutes, capacity.reservedMinutes + capacity.confirmedMinutes + need.minutes) }, { transaction });
      }
      await inventoryService.reserveForOrder(order, transaction, true);
      await cakeProductionService.reserveForOrder(order, [line], transaction);
      await cakeFinanceService.snapshotOrderEstimate(order, transaction);
      assert.equal(Number((await BranchInventory.findOne({ where: { branchId: 1, inventoryItemId: item.id }, transaction }))?.reserved), 2);
      const cost = await CakeOrderCostSnapshot.findByPk(order.id, { transaction });
      assert.equal(cost?.materialsJson.find((entry) => entry.itemId === item!.id)?.quantity, 2);
      assert.equal(cost?.materialsJson.find((entry) => entry.itemId === item!.id)?.unitCost, 5);
      assert.equal((await CakeCapacityReservation.findAll({ where: { orderId: order.id }, transaction })).reduce((sum, entry) => sum + entry.minutes, 0), minutes(needs));
      await theme.update({ version: 2, variantRulesJson: [{ ...rule, materials: [{ inventoryItemId: item.id, quantity: 9 }], priceDelta: 90 }] });
      assert.equal((await calculateRequirements(order.id, transaction)).get(item.id), 2, 'La edición del diseño no debe alterar pedidos anteriores');
      await assert.rejects(() => customizationService.quote(line));
      await inventoryService.releaseForOrder(order, transaction);
      await cakeProductionService.releaseForOrder(order, transaction);
      assert.equal(Number((await BranchInventory.findOne({ where: { branchId: 1, inventoryItemId: item.id }, transaction }))?.reserved), 0);
    } finally { await transaction.rollback(); }
    console.log(JSON.stringify({ price: quote.lineTotal, surcharge: 37, quantityPrice: doubled.items[0].lineTotal, extraMinutes: 30, stockShortageRejected: true, staleVersionRejected: true, savedMaterialsPreserved: true, reservationsReleased: true, persistedOrders: 0 }));
  } finally {
    if (theme) { assert.ok(theme.slug.startsWith('vfy-theme-')); await theme.destroy(); }
    if (item) { assert.ok(item.code.startsWith('VFY-THEME-')); await BranchInventory.destroy({ where: { inventoryItemId: item.id } }); await item.destroy(); }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await sequelize.close(); });
