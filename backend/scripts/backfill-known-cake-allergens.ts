/**
 * Clasifica insumos del catálogo local de ejemplo Misky Challay. Los preparados
 * requieren --demo-assumptions: sus perfiles son supuestos para demostración,
 * no fichas técnicas de proveedores. Nunca reemplaza una clasificación existente.
 *
 * Uso: tsx scripts/backfill-known-cake-allergens.ts [--demo-assumptions] [--execute]
 */
import { Allergen, InventoryItem, registerModels, sequelize } from '../src/database/models';
import { env } from '../src/config/env';
import { refreshCakesUsingInventoryItem } from '../src/modules/catalog/cakeAllergens.service';

const known: Record<string, string[]> = {
  'MC-HARINA-TRIGO': ['gluten'],
  'MC-HUEVO': ['huevo'],
  'MC-MANTEQUILLA': ['lacteos'],
  'MC-LECHE': ['lacteos'],
  'MC-CREMA-LECHE': ['lacteos'],
  'MC-AZUCAR': [],
  'MC-SAL': [],
  'MC-CACAO': [],
  'MC-ZANAHORIA': [],
  'MC-PLATANO': [],
  'MC-ARANDANOS': [],
  'MC-NARANJA': [],
  'MC-CAJA-TORTA': [],
  'MC-BASE-TORTA': [],
  // Ferrero enumera avellanas, leche y lecitina de soya en la crema Nutella.
  // https://www.nutella.com/us/en/inside-nutella/faqs/products/spread
  'MC-NUTELLA': ['frutos-secos', 'lacteos', 'soya'],
};

// Supuestos exclusivos de este catálogo de demostración. Revisar la etiqueta o
// receta real de cada insumo antes de reutilizar estas fichas en una tienda real.
const demoAssumptions: Record<string, string[]> = {
  'MC-BUTTERCREAM': ['lacteos'],
  'MC-CAFE': [],
  'MC-CANELA': [],
  'MC-CHOCOLATE-CHIPS': ['lacteos', 'soya'],
  'MC-CHOCOLATE-COBERTURA': ['lacteos', 'soya'],
  'MC-COLORANTE-ROJO': [],
  'MC-COLORANTES': [],
  'MC-FONDANT': [],
  'MC-FROSTING-CHOCOLATE': ['lacteos', 'soya'],
  'MC-FROSTING-ESPECIAL': ['lacteos'],
  'MC-FROSTING-OREO': ['gluten', 'lacteos', 'soya'],
  'MC-FRUTAS-CONFITADAS': ['sulfitos'],
  'MC-FRUTOS-SECOS': ['frutos-secos'],
  'MC-FUDGE': ['lacteos', 'soya'],
  'MC-GALLETAS-OREO': ['gluten', 'soya'],
  'MC-GANACHE-CAFE': ['lacteos', 'soya'],
  'MC-GANACHE-MARACUYA': ['lacteos', 'soya'],
  'MC-GANACHE-PISTACHO': ['frutos-secos', 'lacteos', 'soya'],
  'MC-GRAGEAS': [],
  'MC-MANJAR': ['lacteos'],
  'MC-MANJAR-PISTACHO': ['frutos-secos', 'lacteos'],
  'MC-MARACUYA': [],
  'MC-MERMELADA-ARANDANOS': [],
  'MC-MERMELADA-FRESA': [],
  'MC-PISTACHO': ['frutos-secos'],
  'MC-POLVO-HORNEAR': [],
  'MC-VAINILLA': [],
  'MC-VINAGRE': [],
};

const main = async (): Promise<void> => {
  if (env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST)
    || env.DB_NAME !== 'DulceFlow' || env.SEED_DEMO_DATA !== false || env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite en la base DulceFlow local de desarrollo sin pagos reales');
  }
  registerModels();
  await sequelize.authenticate();
  const includeDemoAssumptions = process.argv.includes('--demo-assumptions');
  const classifications = includeDemoAssumptions ? { ...known, ...demoAssumptions } : known;
  const items = await InventoryItem.findAll({ where: { code: Object.keys(classifications) }, order: [['code', 'ASC']] });
  const master = new Set((await Allergen.findAll({ attributes: ['code'] })).map((item) => item.code));
  const invalid = Object.values(classifications).flat().filter((code) => !master.has(code));
  if (invalid.length) throw new Error(`Faltan alérgenos maestros: ${[...new Set(invalid)].join(', ')}`);
  const plan = items.filter((item) => item.allergens === null)
    .map((item) => ({ id: item.id, code: item.code, name: item.name, allergens: classifications[item.code] }));
  console.log(JSON.stringify({ mode: process.argv.includes('--execute') ? 'execute' : 'dry-run', demoAssumptions: includeDemoAssumptions, plan }, null, 2));
  if (!process.argv.includes('--execute')) return;

  await sequelize.transaction(async (transaction) => {
    for (const entry of plan) {
      const [updated] = await InventoryItem.update({ allergens: entry.allergens }, {
        where: { id: entry.id, code: entry.code, name: entry.name, allergens: null }, transaction,
      });
      if (updated !== 1) throw new Error(`El insumo ${entry.code} cambió durante la clasificación`);
      await refreshCakesUsingInventoryItem(entry.id, transaction);
    }
  });
  console.log(`Clasificados ${plan.length} insumos de demostración.`);
};

main().catch((error) => { console.error(`Clasificación falló: ${error.message}`); process.exitCode = 1; })
  .finally(async () => { await sequelize.close(); });
