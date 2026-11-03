/**
 * Carga demostrativa por las mismas API autenticadas que usa Superadmin.
 * Ejecutar: node scripts/seed-pastry-demo.cjs --apply (con la API local encendida).
 * Repetir no duplica productos, repone stock ni sobrescribe ediciones del panel.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const base = 'http://127.0.0.1:4000/api/v1';
const manifestPath = path.resolve(__dirname, '../tmp/pastry-demo-manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { products: {}, inventory: {} };
const save = () => { fs.mkdirSync(path.dirname(manifestPath), { recursive: true }); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n'); };
const slugify = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const mediaImages = new Map();
const image = (slug) => mediaImages.get(slug) || `/images/pastry/${slug}.svg`;
const finished = (code, name, allergens, cost, stock, asset) => ({ code: `MC-DEMO-PT-${code}`, name, allergens, unitCost: cost, initialStock: stock, minLevel: 8, itemType: 'FINISHED_PRODUCT', unit: 'und', imageUrl: image(asset) });
const ingredient = (code, name, allergens, cost, stock, unit = 'g') => ({ code: `MC-DEMO-${code}`, name, allergens, unitCost: cost, initialStock: stock, minLevel: unit === 'g' ? 200 : 5, itemType: 'INGREDIENT', unit });
const newItems = [
  finished('TIRAMISU', 'Fatia de tiramisú lista para venta', ['gluten', 'lacteos', 'huevo'], 7.5, 40, 'fatia-tiramisu'),
  finished('CHOCOLATE', 'Fatia de chocolate lista para venta', ['gluten', 'lacteos', 'huevo', 'soya'], 7, 40, 'fatia-chocolate'),
  finished('ALFAJOR', 'Mini alfajor de manjar listo para venta', ['gluten', 'lacteos', 'huevo'], .8, 240, 'mini-alfajores'),
  finished('TRUFA', 'Trufa de cacao lista para venta', ['lacteos', 'soya'], 1.1, 240, 'trufas-cacao'),
  finished('CHEESE-SAZ', 'Cheesecake de maracuyá sin azúcar listo', ['lacteos', 'huevo', 'frutos-secos'], 9, 30, 'cheesecake-maracuya'),
  finished('BROWNIE-SAZ', 'Brownie de almendras sin azúcar listo', ['huevo', 'lacteos', 'frutos-secos'], 3, 100, 'brownie-almendras'),
  ingredient('FRESA', 'Fresas frescas para repostería', [], .018, 5000),
  ingredient('MIEL-PANELA', 'Miel de panela preparada', [], .015, 6000),
  ingredient('MANTECA', 'Manteca vegetal para turrón', [], .014, 3000),
  ingredient('ANIS', 'Anís para turrón', [], .04, 500),
  ingredient('SESAMO', 'Ajonjolí tostado', ['sesamo'], .025, 1000),
  ingredient('ALMENDRA', 'Almendras peladas', ['frutos-secos'], .05, 4000),
  ingredient('MIEL', 'Miel de abeja', [], .025, 4000),
  ingredient('ALBUMINA', 'Clara de huevo en polvo', ['huevo'], .055, 1000),
  ingredient('CAJA-TURRON', 'Caja para turrón', [], 1.4, 100, 'und'),
];
const cakeBase = [['MC-HARINA-TRIGO', 220], ['MC-AZUCAR', 170], ['MC-HUEVO', 4], ['MC-MANTEQUILLA', 100], ['MC-LECHE', 140], ['MC-POLVO-HORNEAR', 8], ['MC-VAINILLA', 6], ['MC-CAJA-TORTA', 1], ['MC-BASE-TORTA', 1]];
const products = [
  { name: 'Torta de chocolate y fudge', category: 'tortas-24-horas', family: 'CAKE', asset: 'torta-chocolate', description: 'Bizcocho de cacao, relleno de fudge y una delicada cobertura de chocolate. Un clásico para celebrar.', variantName: 'Clásica · 8 porciones', servingSize: 8, servingUnit: 'porciones', price: 95, lead: 24, effort: { BAKING: 45, COOLING: 40, FILLING: 20, DECORATING: 20, QA: 5, DISPATCH: 5 }, recipe: [...cakeBase, ['MC-CACAO', 50], ['MC-FUDGE', 250], ['MC-CHOCOLATE-COBERTURA', 100]], featured: true },
  { name: 'Torta de vainilla y fresas', category: 'tortas-24-horas', family: 'CAKE', asset: 'torta-fresas', description: 'Suave bizcocho de vainilla, crema de mantequilla y fresas frescas. Una combinación ligera y delicada.', variantName: 'Clásica · 8 porciones', servingSize: 8, servingUnit: 'porciones', price: 99, lead: 24, effort: { BAKING: 40, COOLING: 40, FILLING: 20, DECORATING: 25, QA: 5, DISPATCH: 5 }, recipe: [...cakeBase, ['MC-BUTTERCREAM', 220], ['MC-DEMO-FRESA', 200]] },
  { name: 'Fatia de tiramisú', category: 'postres', family: 'DESSERT', asset: 'fatia-tiramisu', description: 'Capas de bizcocho al café, crema de mascarpone y cacao. Una porción elegante para disfrutar sin apuro.', variantName: 'Fatia individual', servingSize: 1, servingUnit: 'porciones', price: 18, lead: 2, stockCode: 'MC-DEMO-PT-TIRAMISU', consume: 1, featured: true },
  { name: 'Fatia de chocolate intenso', category: 'postres', family: 'DESSERT', asset: 'fatia-chocolate', description: 'Bizcocho húmedo de cacao y ganache de chocolate, terminado con un toque de frutos rojos.', variantName: 'Fatia individual', servingSize: 1, servingUnit: 'porciones', price: 20, lead: 2, stockCode: 'MC-DEMO-PT-CHOCOLATE', consume: 1 },
  { name: 'Turrón de Doña Pepa', category: 'turrones', family: 'NOUGAT', asset: 'turron-dona-pepa', description: 'Palitos de anís, miel de panela y grageas de colores. El sabor tradicional en una presentación para compartir.', variantName: 'Caja de 500 g', servingSize: 500, servingUnit: 'g', price: 32, lead: 24, effort: { BAKING: 30, COOLING: 20, DECORATING: 20, QA: 5, DISPATCH: 5 }, recipe: [['MC-HARINA-TRIGO', 220], ['MC-DEMO-MANTECA', 100], ['MC-DEMO-MIEL-PANELA', 150], ['MC-DEMO-ANIS', 4], ['MC-DEMO-SESAMO', 15], ['MC-GRAGEAS', 11], ['MC-DEMO-CAJA-TURRON', 1]] },
  { name: 'Turrón de almendras y miel', category: 'turrones', family: 'NOUGAT', asset: 'turron-almendras', description: 'Almendras tostadas y miel en un turrón de textura suave. Elaborado por encargo y presentado en caja.', variantName: 'Caja de 300 g', servingSize: 300, servingUnit: 'g', price: 38, lead: 24, effort: { BAKING: 20, COOLING: 30, DECORATING: 15, QA: 5, DISPATCH: 5 }, recipe: [['MC-DEMO-ALMENDRA', 140], ['MC-DEMO-MIEL', 110], ['MC-AZUCAR', 40], ['MC-DEMO-ALBUMINA', 10], ['MC-DEMO-CAJA-TURRON', 1]] },
  { name: 'Mini alfajores de manjar', category: 'bocaditos', family: 'BITES', asset: 'mini-alfajores', description: 'Galletitas delicadas, rellenas de manjar de olla y espolvoreadas con azúcar. Ideales para una mesa dulce.', variantName: 'Caja de 12 unidades', servingSize: 12, servingUnit: 'unidades', price: 32, lead: 2, stockCode: 'MC-DEMO-PT-ALFAJOR', consume: 12 },
  { name: 'Trufas de cacao', category: 'bocaditos', family: 'BITES', asset: 'trufas-cacao', description: 'Pequeños bocados de chocolate y crema, terminados con cacao. Una caja pensada para regalar o compartir.', variantName: 'Caja de 12 unidades', servingSize: 12, servingUnit: 'unidades', price: 36, lead: 2, stockCode: 'MC-DEMO-PT-TRUFA', consume: 12 },
  { name: 'Cheesecake de maracuyá sin azúcar', category: 'postres', family: 'DESSERT', asset: 'cheesecake-maracuya', description: 'Crema de queso, base de almendras y maracuyá, endulzado con eritritol. Fresco y cremoso en cada bocado.', variantName: 'Porción individual', servingSize: 1, servingUnit: 'porciones', price: 22, lead: 2, stockCode: 'MC-DEMO-PT-CHEESE-SAZ', consume: 1, sugarFree: true },
  { name: 'Brownies de almendras sin azúcar', category: 'bocaditos', family: 'BITES', asset: 'brownie-almendras', description: 'Cacao puro, harina de almendras y mantequilla, endulzados con eritritol. Cuatro bocados de textura húmeda.', variantName: 'Caja de 4 unidades', servingSize: 4, servingUnit: 'unidades', price: 28, lead: 2, stockCode: 'MC-DEMO-PT-BROWNIE-SAZ', consume: 4, sugarFree: true },
];
async function main() {
  assert.ok(process.argv.includes('--apply'), 'Revisa docs/CATALOGO_DEMO_PASTELERIA.md y ejecuta con --apply');
  assert.equal(process.env.NODE_ENV, 'development', 'Solo se permite en desarrollo');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Solo se permite una base local');
  for (const entry of products) assert.ok(fs.existsSync(path.resolve(__dirname, '../../frontend/public' + image(entry.asset))), `Falta la ilustración de ${entry.name}`);
  let token;
  const api = async (method, endpoint, body) => {
    const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(`${method} ${endpoint}: ${response.status} ${result.error?.message || result.message || JSON.stringify(result.errors || {})}`);
    return result.data;
  };
  const session = await api('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  assert.equal(session.user.isSuperAdmin, true, 'La sesión debe ser Superadmin');
  token = session.accessToken;
  const media = await api('GET', '/media?category=pastry-demo&limit=100');
  for (const definition of products) {
    const fileName = `misky-demo-${definition.asset}.png`;
    let asset = media.find((entry) => entry.originalName === fileName);
    if (!asset) {
      const bytes = fs.readFileSync(path.resolve(__dirname, `../../frontend/public/images/pastry/${definition.asset}.png`));
      asset = await api('POST', '/media', { fileName, mimeType: 'image/png', dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, altText: `Ilustración referencial: ${definition.name}`, category: 'pastry-demo' });
    }
    mediaImages.set(definition.asset, asset.url);
  }
  const branches = (await api('GET', '/locations/branches')).filter((entry) => entry.isActive);
  assert.ok(branches.length, 'No hay tiendas activas');
  let meta = await api('GET', '/admin/catalog/meta');
  if (!meta.categories.some((entry) => entry.slug === 'tortas-24-horas')) {
    await api('POST', '/admin/catalog/categories', { name: 'Tortas 24 horas', sortOrder: 1, isActive: true, imageUrl: image('torta-chocolate') });
    meta = await api('GET', '/admin/catalog/meta');
  }
  const inventory = new Map();
  for (const branch of branches) {
    const master = await api('GET', `/operations/inventory/items?branchId=${branch.id}`);
    const enabled = new Set(master.filter((entry) => entry.isEnabledInBranch).map((entry) => entry.inventoryItemId));
    for (const definition of newItems) {
      let item = master.find((entry) => entry.code === definition.code);
      if (!item) {
        const imageUrl = definition.imageUrl ? image(path.basename(definition.imageUrl, '.svg')) : undefined;
        const created = await api('POST', '/operations/inventory/items', { ...definition, imageUrl, branchId: branch.id });
        item = { ...definition, inventoryItemId: created.id, isActive: true };
        manifest.inventory[definition.code] = item.inventoryItemId;
        save();
      } else {
        assert.ok(item.isActive && item.itemType === definition.itemType && item.unit === definition.unit, `Revisar artículo existente ${definition.code}`);
        if (!enabled.has(item.inventoryItemId)) await api('POST', '/operations/inventory/items/enable', { branchId: branch.id, inventoryItemId: item.inventoryItemId, initialStock: definition.initialStock });
      }
      inventory.set(item.code, item.inventoryItemId);
    }
    const stock = await api('GET', `/operations/inventory?branchId=${branch.id}`);
    for (const item of stock) inventory.set(item.code, item.inventoryItemId);
  }
  let existing = await api('GET', '/admin/catalog/products');
  let createdCount = 0, publishedCount = 0;
  for (const definition of products) {
    const slug = slugify(definition.name);
    const previous = existing.find((entry) => entry.slug === slug);
    const owned = manifest.products[slug];
    if (previous && (!owned || owned.complete)) { console.log(`Ya existe: ${definition.name}`); continue; }
    if (previous) assert.equal(previous.id, owned.id, 'El manifiesto corresponde a otra base');
    const category = meta.categories.find((entry) => entry.slug === definition.category);
    assert.ok(category?.isActive, `Categoría inactiva o ausente: ${definition.category}`);
    const preparationMode = definition.stockCode ? 'READY_STOCK' : 'MADE_TO_ORDER';
    const product = previous || await api('POST', '/admin/catalog/products', {
      name: definition.name, description: definition.description, categoryId: category.id,
      family: definition.family, type: 'FIXED', preparationMode, minLeadHours: definition.lead,
      imageUrl: image(definition.asset), variantName: definition.variantName,
      servingSize: definition.servingSize, servingUnit: definition.servingUnit, basePrice: definition.price,
    });
    if (!previous) createdCount++;
    manifest.products[slug] = { id: product.id, complete: false };
    save();
    existing = await api('GET', '/admin/catalog/products');
    const stored = existing.find((entry) => entry.id === product.id);
    assert.equal(stored.variants.length, 1, 'Los productos nuevos deben tener una presentación');
    const lines = definition.stockCode ? [[definition.stockCode, definition.consume]] : definition.recipe;
    const items = lines.map(([code, quantity]) => {
      assert.ok(inventory.has(code), `Falta insumo ${code}`);
      return { inventoryItemId: inventory.get(code), quantity, wastePercent: 0 };
    });
    await api('PUT', `/cakes/recipes/${stored.variants[0].id}`, { yieldQuantity: 1, items });
    await api('PUT', `/cakes/products/${product.id}/profile`, { saleMode: 'STANDARD', minLeadHours: definition.lead, baseEffortJson: definition.effort || {}, stationOffsetsJson: {}, isActive: true });
    if (definition.featured) await api('PATCH', `/admin/catalog/products/${product.id}`, { isFeatured: true });
    if (definition.sugarFree) {
      const tag = meta.dietaryTags.find((entry) => entry.code === 'sin-azucar');
      assert.ok(tag, 'Falta la característica Sin azúcar');
      await api('PATCH', `/admin/catalog/products/${product.id}/dietary-tags`, { tagIds: [tag.id] });
    }
    await api('PATCH', `/admin/catalog/products/${product.id}/status`, { status: 'ACTIVE' });
    manifest.products[slug].complete = true;
    save();
    publishedCount++;
    console.log(`Publicado: ${definition.name}`);
  }
  // Solo crea días ausentes con los valores automáticos y el calendario de tienda.
  // DELETE /capacity es la acción existente "Restaurar capacidad automática" del panel.
  const day = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  let capacitiesCreated = 0;
  for (const branch of branches) {
    const from = day(new Date()), to = day(new Date(Date.now() + 21 * 86400000));
    const capacity = await api('GET', `/cakes/capacity?branchId=${branch.id}&from=${from}&to=${to}`);
    const configured = new Set(capacity.map((entry) => `${entry.workDate}:${entry.station}`));
    for (let offset = 0; offset <= 21; offset++) {
      const workDate = day(new Date(Date.now() + offset * 86400000));
      for (const station of ['DESIGN', 'BAKING', 'COOLING', 'FILLING', 'DECORATING', 'QA', 'DISPATCH']) {
        if (configured.has(`${workDate}:${station}`)) continue;
        await api('DELETE', '/cakes/capacity', { branchId: branch.id, workDate, station });
        capacitiesCreated++;
      }
    }
  }
  const publicProducts = await api('GET', '/catalog/products');
  assert.equal(publicProducts.filter((entry) => entry.cakeSaleMode === 'SEMI_CUSTOM').length, 1, 'Debe conservarse una sola torta personalizada');
  for (const definition of products) assert.ok(publicProducts.some((entry) => entry.slug === slugify(definition.name)), `No se publicó ${definition.name}`);
  console.log(JSON.stringify({ createdCount, publishedCount, capacitiesCreated, publicProducts: publicProducts.length, branches: branches.map((entry) => entry.name), customCakes: 1 }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
