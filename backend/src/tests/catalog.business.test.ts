import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { Product, ProductVariant, CakeProductProfile } from '@database/models';
import { catalogService } from '../modules/catalog/catalog.service';
import { listProductsSchema } from '../modules/catalog/catalog.validation';

afterEach(() => mock.restoreAll());

function product(id: number, saleMode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED'): Product {
  const profile = CakeProductProfile.build({
    productId: id,
    saleMode,
    minLeadHours: 72,
    baseEffortJson: {},
    stationOffsetsJson: {},
    isActive: true,
  });
  const row = Product.build({
    id,
    name: `Producto ${id}`,
    slug: `producto-${id}`,
    categoryId: 1,
    status: 'ACTIVE',
    family: 'CAKE',
    preparationMode: 'MADE_TO_ORDER',
  });
  row.variants = [
    ProductVariant.build({
      id,
      productId: id,
      name: 'Individual',
      sku: `TEST-${id}`,
      basePrice: id * 10,
      servingSize: 8,
      isActive: true,
      isDefault: true,
    }),
  ];
  const originalGet = row.get.bind(row);
  mock.method(row, 'get', (key: string) => (key === 'cakeProfile' ? profile : originalGet(key)));
  return row;
}

function prepare() {
  const rows = [product(1, 'STANDARD'), product(2, 'SEMI_CUSTOM'), product(3, 'ADVANCED')];
  mock.method(Product, 'findAll', async () => rows);
  return rows;
}

test('la API de catálogo usa el canal general por defecto y valida la selección de empresas', () => {
  assert.equal(listProductsSchema.parse({ query: {} }).query.audience, 'RETAIL');
  assert.equal(
    listProductsSchema.parse({ query: { audience: 'BUSINESS' } }).query.audience,
    'BUSINESS',
  );
  assert.equal(listProductsSchema.safeParse({ query: { audience: 'ALL' } }).success, false);
});

test('el catálogo general excluye las cotizaciones especiales y conserva las tortas personalizables', async () => {
  prepare();
  const rows = await catalogService.listProducts({ audience: 'RETAIL' });
  assert.deepEqual(
    rows.map((row) => row.id),
    [1, 2],
  );
});

test('el canal de empresas solo devuelve los proyectos especiales publicados por catálogo', async () => {
  prepare();
  const rows = await catalogService.listProducts({ audience: 'BUSINESS' });
  assert.deepEqual(
    rows.map((row) => row.id),
    [3],
  );
  assert.equal(rows[0].cakeSaleMode, 'ADVANCED');
});

test('las consultas internas conservan los proyectos para favoritos e historial', async () => {
  prepare();
  const rows = await catalogService.listProducts({});
  assert.deepEqual(
    rows.map((row) => row.id),
    [1, 2, 3],
  );
});

test('la ficha del proyecto especial sigue disponible para configurar la cotización', async () => {
  const row = product(3, 'ADVANCED');
  mock.method(Product, 'findOne', async () => row);
  const detail = await catalogService.getProductBySlug(row.slug);
  assert.equal(detail.id, 3);
  assert.equal(detail.cakeSaleMode, 'ADVANCED');
});
