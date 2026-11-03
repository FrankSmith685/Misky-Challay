const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const base = 'http://127.0.0.1:4000/api/v1';
async function main() {
  assert.ok(process.argv.includes('--apply'), 'Ejecuta con --apply para cargar los ejemplos');
  assert.equal(process.env.NODE_ENV, 'development');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST));
  let token;
  const api = async (method, endpoint, data) => {
    const response = await fetch(base + endpoint, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const result = await response.json();
    if (!response.ok) throw Error(`${method} ${endpoint}: ${response.status} ${result.message}`);
    return result.data;
  };
  const session = await api('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  assert.equal(session.user.isSuperAdmin, true);
  token = session.accessToken;
  const bases = await api('GET', '/cakes/configuration');
  const cake = bases.find((entry) => entry.product.status === 'ACTIVE' && entry.profile.saleMode === 'SEMI_CUSTOM' && entry.product.family === 'CAKE');
  assert.ok(cake, 'Publica la torta personalizada antes de cargar diseños');
  const branches = await api('GET', '/locations/branches');
  const branchId = branches[0].id;
  let items = await api('GET', `/operations/inventory?branchId=${branchId}`);
  let topper = items.find((item) => item.code === 'MC-DEMO-TOPPER-TEMATICO');
  if (!topper) {
    const existing = (await api('GET', `/operations/inventory/items?branchId=${branchId}`)).find((item) => item.code === 'MC-DEMO-TOPPER-TEMATICO');
    if (existing) await api('POST', '/operations/inventory/items/enable', { branchId, inventoryItemId: existing.inventoryItemId, initialStock: 40 });
    else await api('POST', '/operations/inventory/items', { branchId, code: 'MC-DEMO-TOPPER-TEMATICO', name: 'Topper temático decorativo', unit: 'und', itemType: 'INGREDIENT', allergens: [], unitCost: 4, minLevel: 5, initialStock: 40 });
    items = await api('GET', `/operations/inventory?branchId=${branchId}`);
    topper = items.find((item) => item.code === 'MC-DEMO-TOPPER-TEMATICO');
  }
  const fondant = items.find((item) => item.code === 'MC-FONDANT');
  const buttercream = items.find((item) => item.code === 'MC-BUTTERCREAM');
  assert.ok(topper && fondant && buttercream, 'Faltan artículos de decoración en Inventario');
  const existingThemes = await api('GET', '/cake-themes/admin');
  const media = await api('GET', '/media?search=misky-theme-demo&limit=100');
  const config = await api('GET', `/customizations/${cake.product.id}`);
  let created = 0;
  for (const definition of [
    { slug: 'hombre-arana', name: 'Hombre Araña clásico', theme: 'Superhéroes', saleMode: 'CONFIGURED', description: 'Acabado rojo y azul con telarañas y topper temático. Elige tus sabores y las porciones disponibles.', min: 1, max: 500 },
    { slug: 'flores-delicadas', name: 'Flores delicadas', theme: 'Flores y celebraciones', saleMode: 'CONFIGURED', description: 'Tonos suaves, flores de crema y un acabado delicado para celebrar. Personaliza los sabores y el mensaje.', min: 1, max: 500 },
    { slug: 'dinosaurio-3d', name: 'Dinosaurio en 3D', theme: 'Infantiles', saleMode: 'QUOTE', description: 'Una figura de dinosaurio y detalles de naturaleza. Revisaremos contigo el tamaño, la decoración y la fecha.', min: 15, max: 100 },
    { slug: 'celebracion-dos-pisos', name: 'Celebración de dos pisos', theme: 'Flores y celebraciones', saleMode: 'QUOTE', description: 'Dos pisos con un acabado elegante. Preparamos una propuesta según las porciones, los colores y los detalles de tu celebración.', min: 30, max: 150 },
  ]) {
    if (existingThemes.some((entry) => entry.name === definition.name && entry.productId === cake.product.id)) { console.log(`Ya existe: ${definition.name}`); continue; }
    const fileName = `misky-theme-demo-${definition.slug}.png`;
    let asset = media.find((entry) => entry.originalName === fileName);
    if (!asset) {
      const bytes = fs.readFileSync(path.resolve(__dirname, `../../frontend/public/images/cake-themes/${definition.slug}.png`));
      asset = await api('POST', '/media', { fileName, mimeType: 'image/png', category: 'products', altText: `Ilustración de referencia: ${definition.name}`, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` });
    }
    const rules = definition.saleMode === 'QUOTE' ? [] : cake.variants.filter((variant) => variant.isActive).map((variant) => {
      const servings = Number(variant.servingSize);
      const decorationGroups = config.groups.filter((group) => (group.variantId === null || group.variantId === variant.id) && /decoraci/i.test(group.name));
      const excludedOptionIds = decorationGroups.flatMap((group) => group.options.filter((option, index) => index > 0).map((option) => option.id));
      const hiddenGroupIds = decorationGroups.map((group) => group.id);
      return { variantId: variant.id, priceDelta: servings <= 8 ? 35 : servings <= 12 ? 45 : 65,
        materials: [{ inventoryItemId: definition.slug === 'hombre-arana' ? fondant.inventoryItemId : buttercream.inventoryItemId, quantity: servings * 6 }, { inventoryItemId: topper.inventoryItemId, quantity: 1 }],
        effort: { DESIGN: 5, DECORATING: servings <= 8 ? 20 : servings <= 12 ? 30 : 45 }, excludedOptionIds, hiddenGroupIds,
      };
    });
    await api('POST', '/cake-themes', { productId: cake.product.id, name: definition.name, theme: definition.theme, description: definition.description, imageUrlsJson: [asset.url], saleMode: definition.saleMode,
      minLeadHours: definition.saleMode === 'QUOTE' ? 96 : 72, minServings: definition.min, maxServings: definition.max, variantRulesJson: rules, isActive: true, sortOrder: created,
    });
    created++;
    console.log(`Publicado: ${definition.name}`);
  }
  const published = await api('GET', '/cake-themes');
  console.log(JSON.stringify({ created, published: published.length, configured: published.filter((entry) => entry.saleMode === 'CONFIGURED').length, quotation: published.filter((entry) => entry.saleMode === 'QUOTE').length, baseProducts: 1 }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
