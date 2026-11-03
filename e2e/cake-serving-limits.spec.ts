import { expect, test, type Page } from '@playwright/test';

// Isolated demonstration data; these values never configure the live catalog.
const variants = [
  { id: 201, name: 'Pequeña', servingSize: 8, basePrice: 105, isDefault: true },
  { id: 202, name: 'Mediana', servingSize: 14, basePrice: 145, isDefault: false },
  { id: 203, name: 'Grande', servingSize: 25, basePrice: 205, isDefault: false },
  { id: 204, name: 'Cuarta presentación', servingSize: 35, basePrice: 272.5, isDefault: false },
].map((row) => ({ ...row, servingUnit: 'porciones' }));
const sizeGuides = variants.map((row, i) => ({
  variantId: row.id,
  diameterCm: [14, 18, 28, 32.5][i],
  minServings: [6, 12, 24, 26][i],
  maxServings: row.servingSize,
}));
const product = {
  id: 101,
  slug: 'servings-demo',
  name: 'Crea tu torta',
  type: 'CUSTOMIZABLE',
  family: 'CAKE',
  preparationMode: 'MADE_TO_ORDER',
  cakeSaleMode: 'SEMI_CUSTOM',
  minLeadHours: 2,
  categoryId: 1,
  description: 'Configurador de prueba',
  imageUrl: null,
  isAvailable: true,
  variants,
  dietaryTags: [],
  allergens: [],
};
const groups = [
  {
    id: 1,
    code: 'FLAVOR',
    name: 'Bizcocho',
    variantId: null,
    selectionType: 'SINGLE',
    minSelection: 1,
    maxSelection: 1,
    freeQuantity: 1,
    sortOrder: 1,
    options: [
      {
        id: 11,
        name: 'Vainilla',
        description: 'Sabor incluido',
        priceDelta: 0,
        chargeAlways: false,
        cakeScaleWithServings: false,
        imageUrl: null,
        imageAlt: null,
        imagePosition: 'center',
        dietaryTags: [],
        allergens: [],
        spiceLevel: 0,
        maxPerItem: 1,
        isAvailable: true,
        incompatibleWith: [],
        incompatibilities: [],
      },
    ],
  },
];

async function prepare(page: Page, maximum = 60) {
  const requestedQuotes: number[] = [];
  const rule = {
    enabled: true,
    baseVariantId: 204,
    minServings: 36,
    maxServings: maximum,
    pricePerExtraServing: 7.5,
    sizeGuides,
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/settings/public')
      data = {
        business: {
          legalName: 'Prueba',
          commercialName: 'Misky Challay',
          ruc: '20600000000',
          phone: '999111222',
          address: 'Dirección de prueba',
          email: 'demo@example.test',
          supportEmail: 'demo@example.test',
          complaintResponseDays: 15,
        },
        receipts: { mode: 'INTERNAL_ONLY' },
      };
    if (path === '/catalog/products/servings-demo') data = product;
    if (path === '/cakes/products/101/profile')
      data = {
        productId: 101,
        saleMode: 'SEMI_CUSTOM',
        minLeadHours: 2,
        baseEffortJson: {},
        stationOffsetsJson: {},
        customServingsJson: rule,
      };
    if (path === '/cakes/visual-preview/capabilities') data = { enabled: false, maxPerHour: 0 };
    if (path === '/customizations/101') data = { product, variants, groups, customServings: rule };
    if (path === '/customizations/quote') {
      const input = route.request().postDataJSON();
      requestedQuotes.push(input.requestedServings);
      const variant = variants.find((row) => row.id === input.variantId)!;
      const basePrice =
        variant.basePrice +
        (input.requestedServings ? (input.requestedServings - variant.servingSize) * 7.5 : 0);
      data = {
        productId: 101,
        variantId: variant.id,
        variantName: variant.name,
        quantity: input.quantity,
        requestedServings: input.requestedServings ?? null,
        basePrice,
        extrasTotal: 0,
        unitPrice: basePrice,
        lineTotal: basePrice * input.quantity,
        description: 'Torta de prueba',
        selections: [
          {
            groupId: 1,
            groupName: 'Bizcocho',
            optionId: 11,
            optionName: 'Vainilla',
            quantity: 1,
            chargedQuantity: 0,
            priceDelta: 0,
            lineExtra: 0,
          },
        ],
        theme: null,
      };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
    localStorage.setItem('verde-bowl:theme-cache-v4', 'done');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tortas/servings-demo');
  await expect(page.getByRole('heading', { level: 1, name: 'Crea tu torta' })).toBeVisible();
  return requestedQuotes;
}
const summary = (page: Page) => page.getByRole('complementary', { name: 'Resumen de tu torta' });

for (const width of [1440, 390])
  test(`cuarta presentación y Más porciones con máximo validado (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await prepare(page);
    const sizes = page.getByRole('radiogroup', { name: 'Tamaño de la torta' });
    await expect(sizes.getByRole('radio')).toHaveCount(5);
    const fourth = sizes.getByRole('radio', { name: /Cuarta presentación/ });
    await expect(fourth).toContainText('26–35');
    await fourth.click();
    await expect(fourth).toHaveAttribute('aria-checked', 'true');
    await expect(summary(page).locator('.cake-price')).toHaveText('S/ 272.50');
    const custom = sizes.getByRole('radio', { name: /Más porciones/ });
    await expect(custom).not.toContainText('36–60');
    await expect(custom).not.toContainText('60');
    await custom.click();
    const count = page.getByRole('spinbutton', { name: 'Número de porciones', exact: true });
    await expect(count).toHaveValue('36');
    await expect(page.getByText(/Elige entre.*60/)).toHaveCount(0);
    await count.fill('60');
    await expect(count).toHaveAttribute('aria-invalid', 'false');
    await count.press('ArrowUp');
    await expect(count).toHaveValue('61');
    await expect(
      page.getByText('El límite es de 60 porciones. Reduce la cantidad para continuar.'),
    ).toBeVisible();
    await expect(count).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByRole('button', { name: 'Continuar con los sabores', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: /Pedir una cotización para/ })).toHaveCount(0);
    await count.fill('60');
    await expect(page.getByText(/El límite es de 60 porciones/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Continuar con los sabores', exact: true }).click();
    await page
      .locator('[data-cake-group-id="1"]')
      .getByRole('button', { name: 'Vainilla', exact: true })
      .click();
    await expect(summary(page).getByText('Total de productos', { exact: true })).toBeVisible();
    await expect(summary(page).locator('.cake-price')).toHaveText('S/ 460.00');
    const sizesNow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(sizesNow.content).toBeLessThanOrEqual(sizesNow.viewport + 1);
  });

test('no solicita cotizaciones con porciones inválidas y permite corregir el valor', async ({
  page,
}) => {
  const quotes = await prepare(page);
  await page.getByRole('radio', { name: /Más porciones/ }).click();
  await page.getByRole('spinbutton', { name: 'Número de porciones', exact: true }).fill('60');
  await page.getByRole('button', { name: 'Continuar con los sabores', exact: true }).click();
  await page
    .locator('[data-cake-group-id="1"]')
    .getByRole('button', { name: 'Vainilla', exact: true })
    .click();
  await expect.poll(() => quotes).toContain(60);
  await summary(page).getByRole('button', { name: 'Cambiar el tamaño de la torta' }).click();
  const count = page.getByRole('spinbutton', { name: 'Número de porciones', exact: true });
  await count.fill('61');
  await expect(page.getByText(/El límite es de 60 porciones/)).toBeVisible();
  await page.waitForTimeout(400); // Exceeds the quote debounce; no invalid request should escape.
  expect(quotes).not.toContain(61);
  await count.fill('59');
  await expect.poll(() => quotes).toContain(59);
});

test('el aviso utiliza el máximo configurado del producto', async ({ page }) => {
  await prepare(page, 75);
  await page.getByRole('radio', { name: /Más porciones/ }).click();
  await page.getByRole('spinbutton', { name: 'Número de porciones', exact: true }).fill('76');
  await expect(
    page.getByText('El límite es de 75 porciones. Reduce la cantidad para continuar.'),
  ).toBeVisible();
});
