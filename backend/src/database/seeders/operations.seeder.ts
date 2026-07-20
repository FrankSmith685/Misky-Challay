import { logger } from '@config/logger';
import {
  Branch,
  BranchInventory,
  CustomizationOption,
  Driver,
  InventoryItem,
  Product,
  ProductVariant,
  Recipe,
  RecipeItem,
} from '../models';

/**
 * INSUMOS, RECETAS Y REPARTIDORES (ejemplo)
 * ---------------------------------------------------------------------------
 * Cada insumo tiene stock inicial en la sucursal. Las recetas dicen cuanto
 * consume cada plato fijo; las opciones del constructor descuentan su insumo
 * directamente. Con esto el inventario se mueve solo al vender (RN-016).
 */

/** [codigo, nombre, unidad, costo por unidad, nivel minimo, stock inicial] */
const ITEMS: Array<[string, string, string, number, number, number]> = [
  ['ARROZ-BLANCO', 'Arroz blanco', 'g', 0.004, 2000, 20000],
  ['ARROZ-INTEGRAL', 'Arroz integral', 'g', 0.006, 1500, 12000],
  ['QUINOA', 'Quinoa', 'g', 0.018, 1000, 8000],
  ['HOJAS-VERDES', 'Hojas verdes', 'g', 0.012, 800, 6000],
  ['POLLO', 'Pollo grillado', 'g', 0.022, 1500, 12000],
  ['SALMON', 'Salmon fresco', 'g', 0.09, 800, 4000],
  ['ATUN', 'Atun fresco', 'g', 0.085, 800, 3500],
  ['LANGOSTINOS', 'Langostinos', 'g', 0.095, 500, 2000],
  ['TOFU', 'Tofu marinado', 'g', 0.025, 600, 3000],
  ['GARBANZOS', 'Garbanzos especiados', 'g', 0.012, 600, 4000],
  ['PALTA', 'Palta', 'g', 0.03, 1000, 5000],
  ['EDAMAME', 'Edamame', 'g', 0.024, 800, 4000],
  ['MANGO', 'Mango', 'g', 0.018, 600, 3000],
  ['PEPINO', 'Pepino', 'g', 0.008, 600, 4000],
  ['ZANAHORIA', 'Zanahoria', 'g', 0.007, 600, 4000],
  ['TOMATE-CHERRY', 'Tomate cherry', 'g', 0.02, 500, 3000],
  ['CHOCLO', 'Choclo', 'g', 0.012, 500, 3000],
  ['WAKAME', 'Algas wakame', 'g', 0.05, 300, 1500],
  ['KALE', 'Kale', 'g', 0.015, 400, 2500],
  ['CAMOTE', 'Camote', 'g', 0.009, 800, 5000],
  ['SALSA-PONZU', 'Salsa ponzu', 'ml', 0.02, 500, 3000],
  ['SALSA-SRIRACHA', 'Sriracha mayo', 'ml', 0.025, 400, 2500],
  ['SALSA-TERIYAKI', 'Salsa teriyaki', 'ml', 0.022, 400, 2500],
  ['HUMMUS', 'Hummus', 'g', 0.03, 400, 2000],
  ['YOGURT-LIMON', 'Salsa de yogurt y limon', 'ml', 0.02, 300, 2000],
  ['ACEITE-OLIVA', 'Aceite de oliva', 'ml', 0.04, 300, 2000],
  ['AJONJOLI', 'Ajonjoli tostado', 'g', 0.03, 200, 1200],
  ['MANI', 'Mani crocante', 'g', 0.028, 300, 1500],
  ['CEBOLLA-CRISPY', 'Cebolla crispy', 'g', 0.035, 200, 1200],
  ['WONTON', 'Chips de wonton', 'g', 0.03, 200, 1200],
  ['FURIKAKE', 'Furikake', 'g', 0.06, 150, 800],
  ['TORTILLA', 'Tortilla integral', 'unidad', 0.9, 30, 150],
  ['CUSCUS', 'Cuscus integral', 'g', 0.01, 800, 5000],
  ['FALAFEL', 'Falafel', 'unidad', 1.2, 40, 200],
];

/** Insumo que consume cada opcion del constructor, por unidad elegida. */
const OPTION_CONSUMPTION: Record<string, [string, number]> = {
  'Arroz blanco': ['ARROZ-BLANCO', 200],
  'Arroz integral': ['ARROZ-INTEGRAL', 200],
  Quinoa: ['QUINOA', 180],
  'Hojas verdes': ['HOJAS-VERDES', 120],
  'Mitad arroz / mitad hojas': ['ARROZ-BLANCO', 100],
  'Pollo grillado': ['POLLO', 120],
  'Salmon fresco': ['SALMON', 110],
  'Atun fresco': ['ATUN', 110],
  Langostinos: ['LANGOSTINOS', 100],
  'Tofu marinado': ['TOFU', 120],
  'Garbanzos especiados': ['GARBANZOS', 100],
  Ponzu: ['SALSA-PONZU', 30],
  'Sriracha mayo': ['SALSA-SRIRACHA', 30],
  Teriyaki: ['SALSA-TERIYAKI', 30],
  Hummus: ['HUMMUS', 40],
  'Yogurt y limon': ['YOGURT-LIMON', 30],
  'Aceite de oliva y limon': ['ACEITE-OLIVA', 15],
  Palta: ['PALTA', 60],
  Edamame: ['EDAMAME', 50],
  Mango: ['MANGO', 50],
  Pepino: ['PEPINO', 40],
  'Zanahoria rallada': ['ZANAHORIA', 40],
  'Tomate cherry': ['TOMATE-CHERRY', 40],
  Choclo: ['CHOCLO', 50],
  'Algas wakame': ['WAKAME', 25],
  Kale: ['KALE', 40],
  'Camote al horno': ['CAMOTE', 60],
  'Ajonjoli tostado': ['AJONJOLI', 10],
  'Mani crocante': ['MANI', 20],
  'Cebolla crispy': ['CEBOLLA-CRISPY', 15],
  'Chips de wonton': ['WONTON', 20],
  Furikake: ['FURIKAKE', 8],
};

/** Recetas de los platos fijos: [slug del producto, [[insumo, cantidad, merma%]]] */
const RECIPES: Array<[string, Array<[string, number, number]>]> = [
  [
    'poke-clasico-salmon',
    [
      ['ARROZ-BLANCO', 200, 3],
      ['SALMON', 120, 5],
      ['PALTA', 60, 8],
      ['EDAMAME', 50, 2],
      ['WAKAME', 25, 2],
      ['SALSA-PONZU', 30, 0],
    ],
  ],
  [
    'bowl-pollo-teriyaki',
    [
      ['ARROZ-INTEGRAL', 200, 3],
      ['POLLO', 140, 5],
      ['ZANAHORIA', 50, 5],
      ['SALSA-TERIYAKI', 40, 0],
      ['AJONJOLI', 10, 0],
    ],
  ],
  [
    'bowl-vegano-quinoa',
    [
      ['QUINOA', 180, 3],
      ['GARBANZOS', 100, 2],
      ['CAMOTE', 80, 8],
      ['KALE', 50, 5],
      ['PALTA', 50, 8],
      ['HUMMUS', 40, 0],
    ],
  ],
  [
    'bowl-mediterraneo',
    [
      ['CUSCUS', 180, 3],
      ['POLLO', 120, 5],
      ['TOMATE-CHERRY', 60, 5],
      ['PEPINO', 50, 5],
      ['YOGURT-LIMON', 40, 0],
    ],
  ],
  [
    'wrap-de-pollo',
    [
      ['TORTILLA', 1, 0],
      ['POLLO', 110, 5],
      ['PALTA', 40, 8],
      ['HOJAS-VERDES', 40, 5],
      ['YOGURT-LIMON', 30, 0],
    ],
  ],
  [
    'wrap-veggie',
    [
      ['TORTILLA', 1, 0],
      ['FALAFEL', 3, 0],
      ['HUMMUS', 50, 0],
      ['PEPINO', 40, 5],
      ['TOMATE-CHERRY', 40, 5],
    ],
  ],
  ['edamame-al-vapor', [['EDAMAME', 150, 2]]],
  ['chips-de-camote', [['CAMOTE', 150, 10]]],
];

const DRIVERS = [
  { fullName: 'Luis Ramirez', phone: '+51 987 111 222', vehicle: 'Moto' },
  { fullName: 'Ana Quispe', phone: '+51 987 333 444', vehicle: 'Moto' },
  { fullName: 'Carlos Diaz', phone: '+51 987 555 666', vehicle: 'Bicicleta' },
];

export const seedOperations = async (): Promise<void> => {
  const branch = await Branch.findOne({ where: { slug: 'verde-bowl-miraflores' } });
  if (!branch) {
    logger.warn('No hay sucursal: se omite el seeder de operaciones');
    return;
  }

  // 1) Insumos + stock inicial de la sucursal
  const itemByCode = new Map<string, number>();

  for (const [code, name, unit, unitCost, minLevel, initialStock] of ITEMS) {
    const [item] = await InventoryItem.findOrCreate({
      where: { code },
      defaults: { code, name, unit, unitCost, minLevel, isActive: true },
    });
    itemByCode.set(code, item.id);

    await BranchInventory.findOrCreate({
      where: { branchId: branch.id, inventoryItemId: item.id },
      defaults: {
        branchId: branch.id,
        inventoryItemId: item.id,
        onHand: initialStock,
        reserved: 0,
      },
    });
  }

  // 2) Cada opcion del constructor descuenta su insumo
  for (const [optionName, [code, quantity]] of Object.entries(OPTION_CONSUMPTION)) {
    const inventoryItemId = itemByCode.get(code);
    if (!inventoryItemId) continue;

    await CustomizationOption.update(
      { inventoryItemId, consumptionQuantity: quantity },
      { where: { name: optionName } },
    );
  }

  // 3) Recetas de los platos fijos
  for (const [slug, lines] of RECIPES) {
    const product = await Product.findOne({ where: { slug } });
    if (!product) continue;

    const variant = await ProductVariant.findOne({ where: { productId: product.id } });
    if (!variant) continue;

    const [recipe] = await Recipe.findOrCreate({
      where: { variantId: variant.id },
      defaults: { productId: product.id, variantId: variant.id, yieldQuantity: 1, isActive: true },
    });

    for (const [code, quantity, wastePercent] of lines) {
      const inventoryItemId = itemByCode.get(code);
      if (!inventoryItemId) continue;

      await RecipeItem.findOrCreate({
        where: { recipeId: recipe.id, inventoryItemId },
        defaults: { recipeId: recipe.id, inventoryItemId, quantity, wastePercent },
      });
    }
  }

  // 4) Repartidores de la flota propia
  for (const driver of DRIVERS) {
    await Driver.findOrCreate({
      where: { branchId: branch.id, fullName: driver.fullName },
      defaults: { ...driver, branchId: branch.id, userId: null },
    });
  }

  logger.success(
    `Operaciones listas: ${ITEMS.length} insumos, ${RECIPES.length} recetas, ${DRIVERS.length} repartidores`,
  );
};
