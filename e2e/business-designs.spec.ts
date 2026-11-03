import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const basicProduct = {
  id: 101,
  name: 'Torta clásica',
  slug: 'torta-clasica',
  categoryId: 1,
  description: 'Una receta clásica.',
  family: 'CAKE',
  preparationMode: 'MADE_TO_ORDER',
  type: 'FIXED',
  cakeSaleMode: 'STANDARD',
  minLeadHours: 24,
  imageUrl: '/images/cakes/custom.svg',
  isFeatured: true,
  priceFrom: 80,
  defaultVariantId: 201,
  defaultVariantName: '8 porciones',
  defaultVariantPrice: 80,
  dietaryTags: [],
  allergens: [],
  isAvailable: true,
};
const customProduct = {
  ...basicProduct,
  id: 102,
  name: 'Crea tu torta',
  slug: 'crea-tu-torta',
  type: 'CUSTOMIZABLE',
  cakeSaleMode: 'SEMI_CUSTOM',
  minLeadHours: 72,
};
const advancedProduct = {
  ...customProduct,
  id: 103,
  name: 'Proyecto especial',
  slug: 'proyecto-especial',
  cakeSaleMode: 'ADVANCED',
  minLeadHours: 96,
  priceFrom: 280,
};
const variants = [
  {
    id: 201,
    name: '8 porciones',
    sku: 'TEST-8',
    basePrice: 80,
    servingSize: 8,
    servingUnit: 'porciones',
    isDefault: true,
    isActive: true,
  },
];
const initialThemes = [
  {
    id: 1,
    version: 1,
    slug: 'aniversario',
    name: 'Aniversario de equipo',
    theme: 'Aniversarios',
    description: 'Para celebrar con tu equipo.',
    productId: 102,
    productSlug: 'crea-tu-torta',
    imageUrls: ['/images/cakes/custom.svg'],
    saleMode: 'CONFIGURED',
    minLeadHours: 72,
    minServings: 8,
    maxServings: 40,
    priceFrom: 120,
    variantRules: [{ variantId: 201, priceDelta: 40, excludedOptionIds: [], hiddenGroupIds: [] }],
    variants,
    allergens: [],
    allergenNames: [],
    isAvailable: true,
  },
  {
    id: 2,
    version: 1,
    slug: 'logo',
    name: 'Logo de tu empresa',
    theme: 'Marca',
    description: 'Comparte tu identidad corporativa.',
    productId: 102,
    productSlug: 'crea-tu-torta',
    imageUrls: ['/images/cakes/custom.svg'],
    saleMode: 'QUOTE',
    minLeadHours: 96,
    minServings: 8,
    maxServings: 100,
    priceFrom: null,
    variantRules: [],
    variants,
    allergens: [],
    allergenNames: [],
    isAvailable: true,
  },
  {
    id: 3,
    version: 1,
    slug: 'bienvenida',
    name: 'Bienvenida al equipo',
    theme: 'Marca',
    description: 'Una bienvenida especial.',
    productId: 102,
    productSlug: 'crea-tu-torta',
    imageUrls: ['/images/cakes/custom.svg'],
    saleMode: 'CONFIGURED',
    minLeadHours: 72,
    minServings: 8,
    maxServings: 40,
    priceFrom: 100,
    variantRules: [{ variantId: 201, priceDelta: 20, excludedOptionIds: [], hiddenGroupIds: [] }],
    variants,
    allergens: [],
    allergenNames: [],
    isAvailable: true,
  },
];
const user = {
  id: 999,
  email: 'business@example.test',
  phone: '999111222',
  firstName: 'Prueba',
  lastName: 'Empresa',
  avatarUrl: null,
  roles: ['CUSTOMER'],
  permissions: [],
  isSuperAdmin: false,
  branchIds: [],
};

async function prepare(page: Page, { admin = false, readOnly = false, failThemes = false } = {}) {
  const session = {
    ...user,
    roles: admin ? ['ADMIN'] : user.roles,
    isSuperAdmin: admin && !readOnly,
    permissions: readOnly ? ['catalog.product.read'] : [],
  };
  const themes = initialThemes.map((theme) => ({
    ...structuredClone(theme),
    isActive: true,
    sortOrder: theme.id,
    imageUrlsJson: theme.imageUrls,
    variantRulesJson: theme.variantRules,
  }));
  const requests: Array<{
    path: string;
    method: string;
    audience: string | null;
    body: Record<string, unknown> | null;
  }> = [];
  let fail = failThemes;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    const body = ['POST', 'PUT'].includes(method) ? route.request().postDataJSON() : null;
    requests.push({ path, method, audience: url.searchParams.get('audience'), body });
    let data: unknown = [];
    if (path === '/auth/me') data = session;
    if (path === '/settings/public')
      data = {
        business: {
          commercialName: 'Misky Challay',
          legalName: 'Prueba',
          ruc: '20600000000',
          phone: '999000000',
          address: 'Lima',
          email: 'tienda@example.test',
          supportEmail: 'tienda@example.test',
          complaintResponseDays: 15,
        },
        receipts: { mode: 'INTERNAL_ONLY' },
      };
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    // Devuelve también el proyecto en el catálogo para comprobar la separación en la vista.
    if (path === '/catalog/products')
      data =
        url.searchParams.get('audience') === 'BUSINESS'
          ? [advancedProduct]
          : [basicProduct, customProduct, advancedProduct];
    if (path === '/catalog/categories')
      data = [{ id: 1, name: 'Tortas', slug: 'tortas', sortOrder: 0 }];
    if (path === '/cake-themes') {
      if (fail) {
        await route.fulfill({
          status: 503,
          json: { success: false, message: 'No se pudo cargar la galería' },
        });
        return;
      }
      data = themes
        .filter((theme) => theme.isActive)
        .map((theme) => ({ ...theme, imageUrls: theme.imageUrlsJson }));
    }
    if (path === '/cake-themes/admin') data = themes;
    if (/^\/cake-themes\/\d+$/.test(path) && method === 'PUT') {
      const theme = themes.find((entry) => entry.id === Number(path.split('/').at(-1)))!;
      Object.assign(theme, body, { version: theme.version + 1 });
      data = theme;
    }
    if (/^\/cake-themes\/\d+\/archive$/.test(path)) {
      const theme = themes.find((entry) => entry.id === Number(path.split('/')[2]))!;
      theme.isActive = false;
      theme.version += 1;
      data = theme;
    }
    if (path === '/cakes/configuration')
      data = [
        {
          product: customProduct,
          profile: { productId: 102, minLeadHours: 72, saleMode: 'SEMI_CUSTOM', isActive: true },
          variants,
          options: [],
        },
      ];
    if (path === '/cakes/recipes') data = { inventoryItems: [], recipes: [] };
    if (path === '/customizations/102')
      data = { product: customProduct, variants, groups: [], presets: [] };
    if (path.startsWith('/cake-themes/') && !/\/admin$|\/\d+(\/archive)?$/.test(path))
      data = themes.find((entry) => entry.slug === path.split('/').at(-1));
    if (path === '/catalog/products/crea-tu-torta')
      data = { ...customProduct, variants, dietaryTags: [], allergens: [] };
    if (path === '/cakes/products/102/profile')
      data = {
        productId: 102,
        minLeadHours: 72,
        saleMode: 'SEMI_CUSTOM',
        baseEffortJson: {},
        stationOffsetsJson: {},
      };
    if (path === '/cakes/visual-preview/capabilities') data = { enabled: false, maxPerHour: 0 };
    if (path === '/customizations/quote')
      data = {
        productId: 102,
        variantId: 201,
        quantity: 1,
        basePrice: 80,
        extrasTotal: 40,
        lineTotal: 120,
        selections: [],
        theme: {
          id: 1,
          version: 1,
          name: 'Aniversario de equipo',
          slug: 'aniversario',
          priceDelta: 40,
          imageUrl: null,
        },
        description: '8 porciones',
      };
    await route.fulfill({ json: { success: true, data } });
  });
  if (admin)
    await page.addInitScript((session) => {
      localStorage.setItem('verde-bowl:accessToken', 'business-test-token');
      localStorage.setItem(
        'verde-bowl:state',
        JSON.stringify({
          auth: { user: session, isAuthenticated: true, status: 'succeeded', error: null },
        }),
      );
    }, session);
  return { requests, recover: () => { fail = false; } };
}

async function dismissCookies(page: Page) {
  const cookies = page.getByRole('button', { name: 'Solo necesario', exact: true });
  if (await cookies.isVisible()) await cookies.click();
}
const gallery = (page: Page) => page.getByRole('region', { name: 'Para empresas', exact: true });
async function select(page: Page, label: string, value: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

test('el catálogo ya no muestra ni solicita la galería de diseños especiales', async ({ page }) => {
  const { requests } = await prepare(page);
  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Torta clásica', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Diseños especiales', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { name: 'Proyecto especial', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('heading', { name: 'Aniversario de equipo', exact: true }),
  ).toHaveCount(0);
  expect(requests.some((request) => request.path === '/cake-themes')).toBe(false);
});

for (const width of [390, 1024, 1440, 1920])
  test(`Para empresas se alcanza desde el menú y conserva el diseño adaptable (${width}px)`, async ({
    page,
  }, testInfo) => {
    const { requests } = await prepare(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/menu');
    await expect(page.getByRole('heading', { name: 'Torta clásica', exact: true })).toBeVisible();
    await dismissCookies(page);
    if (width < 900)
      await page.getByRole('button', { name: 'Abrir navegación', exact: true }).click();
    await page
      .getByRole('link', { name: 'Para empresas', exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/empresas$/);
    await expect(
      page.getByRole('heading', { name: 'Diseños especiales para tu empresa', exact: true }),
    ).toBeVisible();
    await expect(gallery(page).getByRole('article')).toHaveCount(4);
    await expect(
      gallery(page).getByRole('heading', { name: 'Torta clásica', exact: true }),
    ).toHaveCount(0);
    expect(
      requests.some(
        (request) => request.path === '/catalog/products' && request.audience === 'BUSINESS',
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    if (width >= 900)
      await expect(
        page
          .getByRole('navigation', { name: 'Navegación principal', exact: true })
          .getByRole('link', { name: 'Para empresas', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: testInfo.outputPath('empresas.png'), fullPage: true });
  });

test('busca, filtra por temática y tipo de pedido y ordena precios conservando cotizaciones', async ({
  page,
}) => {
  await prepare(page);
  await page.goto('/empresas');
  await expect(gallery(page).getByRole('article')).toHaveCount(4);
  await dismissCookies(page);
  await page.getByRole('searchbox', { name: 'Buscar diseño', exact: true }).fill('corporativa');
  await expect(gallery(page).getByRole('article')).toHaveCount(1);
  await expect(
    gallery(page).getByRole('heading', { name: 'Logo de tu empresa', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await select(page, 'Temática', 'Aniversarios');
  await expect(gallery(page).getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await select(page, 'Tipo de pedido', 'Personalizar y comprar');
  await expect(gallery(page).getByRole('article')).toHaveCount(2);
  await select(page, 'Ordenar', 'Menor precio');
  await expect(gallery(page).getByRole('article').first()).toContainText('Bienvenida al equipo');
  await page.reload();
  await expect(gallery(page).getByRole('article')).toHaveCount(2);
  await expect(gallery(page).getByRole('article').first()).toContainText('Bienvenida al equipo');
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await select(page, 'Tipo de pedido', 'Solicitar cotización');
  await expect(gallery(page).getByRole('article')).toHaveCount(2);
});

test('los enlaces antiguos del catálogo redirigen a empresas', async ({ page }) => {
  await prepare(page);
  for (const url of ['/menu?coleccion=DESIGNS', '/menu?modo=ADVANCED']) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/empresas$/);
    await expect(gallery(page).getByRole('article')).toHaveCount(4);
  }
});

test('abrir un diseño conserva el contexto de empresas y el regreso a la galería', async ({
  page,
}) => {
  await prepare(page);
  await page.goto('/empresas');
  await dismissCookies(page);
  await gallery(page)
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Aniversario de equipo', exact: true }) })
    .getByRole('link', { name: 'Elegir este diseño' })
    .click();
  await expect(page).toHaveURL(/\/tortas\/crea-tu-torta\?diseno=aniversario/);
  await expect(
    page
      .getByRole('navigation', { name: 'Ruta de navegación', exact: true })
      .getByRole('link', { name: 'Para empresas', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación principal', exact: true })
      .getByRole('link', { name: 'Para empresas', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Ver otros diseños', exact: true }).click();
  await expect(page).toHaveURL(/\/empresas$/);
});

test('la galería explica errores y permite reintentar sin mostrar resultados antiguos', async ({
  page,
}) => {
  const fixture = await prepare(page, { failThemes: true });
  await page.goto('/empresas');
  await expect(
    page.getByRole('heading', { name: 'No pudimos cargar los diseños para empresas', exact: true }),
  ).toBeVisible();
  fixture.recover();
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(gallery(page).getByRole('article')).toHaveCount(4);
});

test('el panel gestiona el contenido de empresas y retirar un diseño lo oculta solo de la oferta nueva', async ({
  page,
}) => {
  const { requests } = await prepare(page, { admin: true });
  await page.goto('/admin/empresas');
  await expect(
    page.getByRole('heading', { name: 'Diseños para empresas', exact: true }),
  ).toBeVisible();
  await dismissCookies(page);
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Logo de tu empresa', exact: true }) });
  await card.getByRole('button', { name: 'Editar diseño', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Nombre del diseño', exact: true })
    .fill('Logo corporativo actualizado');
  await dialog.getByRole('button', { name: 'Guardar diseño', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Logo corporativo actualizado', exact: true }),
  ).toBeVisible();
  expect(requests.find((request) => request.method === 'PUT')?.body).toMatchObject({
    name: 'Logo corporativo actualizado',
    expectedVersion: 1,
    isActive: true,
  });
  await page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Aniversario de equipo', exact: true }) })
    .getByRole('button', { name: 'Retirar', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirar', exact: true }).click();
  await expect
    .poll(() => requests.some((request) => request.path === '/cake-themes/1/archive'))
    .toBe(true);
  await page.getByRole('link', { name: 'Ver página de empresas', exact: true }).click();
  await expect(
    gallery(page).getByRole('heading', { name: 'Logo corporativo actualizado', exact: true }),
  ).toBeVisible();
  await expect(
    gallery(page).getByRole('heading', { name: 'Aniversario de equipo', exact: true }),
  ).toHaveCount(0);
});

test('el permiso de lectura permite consultar empresas sin pedir configuración de producción', async ({
  page,
}) => {
  const { requests } = await prepare(page, { admin: true, readOnly: true });
  await page.goto('/admin/catalogo/disenos');
  await expect(page).toHaveURL(/\/admin\/empresas$/);
  await expect(
    page.getByRole('heading', { name: 'Logo de tu empresa', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo diseño', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Editar diseño', exact: true }).first(),
  ).toBeDisabled();
  expect(
    requests.some(
      (request) => request.path === '/cakes/configuration' || request.path === '/cakes/recipes',
    ),
  ).toBe(false);
});
