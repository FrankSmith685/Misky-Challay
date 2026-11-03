import { expect, test, type Page } from '@playwright/test';

const variants = [
  {
    id: 201,
    name: 'Pequeña',
    basePrice: 105,
    servingSize: 8,
    servingUnit: 'porciones',
    isDefault: true,
  },
  {
    id: 202,
    name: 'Grande',
    basePrice: 175,
    servingSize: 16,
    servingUnit: 'porciones',
    isDefault: false,
  },
];
const option = (id: number, name: string, priceDelta = 0, chargeAlways = true, scale = false) => ({
  id,
  name,
  priceDelta,
  chargeAlways,
  cakeScaleWithServings: scale,
  description: null,
  imageUrl: null,
  imageAlt: null,
  imagePosition: 'center',
  dietaryTags: [],
  allergens: [],
  spiceLevel: 0,
  maxPerItem: 3,
  isAvailable: true,
  incompatibleWith: [],
  incompatibilities: [],
});
const groups = [
  {
    id: 1,
    variantId: null,
    code: 'FLAVOR',
    name: 'Bizcocho',
    description: null,
    selectionType: 'SINGLE',
    minSelection: 1,
    maxSelection: 1,
    freeQuantity: 1,
    sortOrder: 1,
    options: [option(11, 'Vainilla', 0, false), option(12, 'Marmoleado', 10, true, true)],
  },
  {
    id: 2,
    variantId: null,
    code: 'FILLING',
    name: 'Relleno',
    description: null,
    selectionType: 'SINGLE',
    minSelection: 1,
    maxSelection: 1,
    freeQuantity: 1,
    sortOrder: 2,
    options: [option(21, 'Manjar', 0, false)],
  },
  {
    id: 3,
    variantId: null,
    code: 'EXTRAS',
    name: 'Adicionales',
    description: null,
    selectionType: 'MULTIPLE',
    minSelection: 0,
    maxSelection: 6,
    freeQuantity: 1,
    sortOrder: 3,
    options: [
      option(31, 'Fruta', 6, false),
      option(32, 'Chocolate', 12, false),
      option(33, 'Topper', 5),
    ],
  },
];
const product = {
  id: 101,
  slug: 'creacion-de-prueba',
  name: 'Crea tu torta',
  type: 'CUSTOMIZABLE',
  family: 'CAKE',
  preparationMode: 'SCHEDULED',
  cakeSaleMode: 'SEMI_CUSTOM',
  categoryId: 1,
  description: 'Personaliza tus sabores.',
  imageUrl: null,
  isAvailable: true,
  variants,
  dietaryTags: [],
  allergens: [],
};
const customServings = {
  enabled: true,
  baseVariantId: 201,
  minServings: 9,
  maxServings: 20,
  pricePerExtraServing: 5,
};
const summary = (page: Page) => page.getByRole('complementary', { name: 'Resumen de tu torta' });
const price = (page: Page) => summary(page).locator('.cake-price');
const group = (page: Page, id: number) => page.locator(`[data-cake-group-id="${id}"]`);

async function setup(
  page: Page,
  { theme = false, holdQuote = false, longFlavorList = false, minFlavorSelections = 1 } = {},
) {
  const quotes: Array<Record<string, any>> = [];
  let releaseQuote = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseQuote = resolve;
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
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
    if (path === '/catalog/products/creacion-de-prueba') data = product;
    if (path === '/cakes/products/101/profile')
      data = {
        productId: 101,
        saleMode: 'SEMI_CUSTOM',
        minLeadHours: 2,
        baseEffortJson: {},
        stationOffsetsJson: {},
        customServingsJson: customServings,
      };
    if (path === '/cakes/visual-preview/capabilities') data = { enabled: false, maxPerHour: 0 };
    if (path === '/customizations/101')
      data = {
        product,
        variants,
        groups: groups.map((group) =>
          group.id !== 1
            ? group
            : {
                ...group,
                minSelection: minFlavorSelections,
                maxSelection: minFlavorSelections,
                selectionType: minFlavorSelections > 1 ? 'MULTIPLE' : 'SINGLE',
                options: longFlavorList
                  ? [
                      ...group.options,
                      ...Array.from({ length: 11 }, (_, index) =>
                        option(40 + index, `Otro sabor ${index + 1}`, 0, false),
                      ),
                    ]
                  : group.options,
              },
        ),
        presets: [],
        customServings,
      };
    if (path === '/cake-themes/fiesta')
      data = {
        id: 301,
        version: 1,
        productId: 101,
        slug: 'fiesta',
        name: 'Fiesta',
        saleMode: 'CONFIGURED',
        minServings: 8,
        maxServings: 16,
        minLeadHours: 2,
        imageUrls: [],
        allergenNames: [],
        variantRules: [
          { variantId: 201, priceDelta: 15, excludedOptionIds: [], hiddenGroupIds: [] },
        ],
      };
    if (path === '/customizations/quote') {
      const input = route.request().postDataJSON();
      quotes.push(input);
      if (holdQuote) await gate;
      const variant = variants.find((entry) => entry.id === input.variantId)!;
      const lines = input.selections.map((selection: { optionId: number; quantity: number }) => {
        const selectedGroup = groups.find((entry) =>
          entry.options.some((entry) => entry.id === selection.optionId),
        )!;
        const selected = selectedGroup.options.find((entry) => entry.id === selection.optionId)!;
        return {
          ...selection,
          groupId: selectedGroup.id,
          groupName: selectedGroup.name,
          optionName: selected.name,
          chargedQuantity: selected.chargeAlways ? selection.quantity : 0,
          priceDelta: selected.priceDelta,
          lineExtra: selected.priceDelta * selection.quantity,
          cakeScaleWithServings: selected.cakeScaleWithServings,
        };
      });
      const extrasTotal =
        (input.selections.some((entry: { optionId: number }) => entry.optionId === 12) ? 10 : 0) +
        (theme ? 15 : 0);
      data = {
        productId: 101,
        variantId: variant.id,
        variantName: variant.name,
        quantity: input.quantity,
        basePrice: variant.basePrice,
        extrasTotal,
        unitPrice: variant.basePrice + extrasTotal,
        lineTotal: (variant.basePrice + extrasTotal) * input.quantity,
        requestedServings: null,
        selections: lines,
        description: 'Torta personalizada',
        theme: theme ? { id: 301, version: 1, name: 'Fiesta', priceDelta: 15 } : null,
      };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/tortas/creacion-de-prueba' + (theme ? '?diseno=fiesta' : ''));
  await expect(
    page.getByRole('heading', { level: 1, name: theme ? 'Fiesta' : 'Crea tu torta' }),
  ).toBeVisible();
  const cookie = page.getByRole('button', { name: 'Solo necesario' });
  if (await cookie.isVisible()) await cookie.click();
  return { quotes, releaseQuote };
}

async function chooseFlavors(page: Page) {
  await page.getByRole('button', { name: 'Continuar con los sabores', exact: true }).click();
  await expect(
    group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }),
  ).toBeVisible();
}

const proposalImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=';

async function cakeWithProposal(page: Page) {
  await setup(page);
  await page.route('**/api/v1/cakes/visual-preview/capabilities', (route) => route.fulfill({ json: { success: true, data: { enabled: true, maxPerHour: 5 } } }));
  await page.route('**/api/v1/cakes/visual-preview', (route) => route.fulfill({ json: { success: true, data: { dataUrl: proposalImage, mimeType: 'image/png' } } }));
  await chooseFlavors(page);
  await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
  await group(page, 2).locator('[data-cake-group-toggle]').click();
  await group(page, 2).getByRole('button', { name: 'Manjar', exact: true }).click();
  await summary(page).getByRole('button', { name: 'Continuar a detalles', exact: true }).click();
  await page.getByRole('textbox', { name: 'Descripción de tu torta (opcional)', exact: true }).fill('Flores azules para Ana');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'referencia.png', mimeType: 'image/png', buffer: Buffer.from(proposalImage.split(',')[1], 'base64') });
  const visual = page.getByRole('region', { name: 'Vista previa de tu torta', exact: true });
  await visual.getByRole('button', { name: /Generar propuesta con IA/ }).click();
  await expect(visual).toHaveAttribute('data-preview-phase', 'ready');
  return visual;
}

test('guarda la referencia y la propuesta de IA al agregar al carrito y después de recargar', async ({ page }) => {
  await cakeWithProposal(page);
  await summary(page).getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByAltText('Referencia adjunta a la torta')).toBeVisible();
  await expect(page.getByAltText('Propuesta con IA adjunta a la torta')).toBeVisible();
  await page.reload();
  await expect(page.getByAltText('Propuesta con IA adjunta a la torta')).toBeVisible();
  const item = await page.evaluate(() => JSON.parse(localStorage.getItem('verde-bowl:state')!).cart.items[0]);
  expect(item.referenceDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  expect(item.cakeAiProposal.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  expect(item.cakeAiProposal.recipe.description).toBe('Flores azules para Ana');
  await page.getByRole('button', { name: /Editar/ }).first().click();
  await expect(page.getByRole('region', { name: 'Vista previa de tu torta', exact: true })).toHaveAttribute('data-preview-phase', 'ready');
});

test('una propuesta anterior no acompaña al pedido si se cambió la descripción sin regenerarla', async ({ page }) => {
  const visual = await cakeWithProposal(page);
  await page.getByRole('textbox', { name: 'Descripción de tu torta (opcional)', exact: true }).fill('Ahora quiero flores rojas para Luis');
  await expect(visual).toHaveAttribute('data-preview-phase', 'idle');
  await summary(page).getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
  await expect(page).toHaveURL(/\/carrito$/);
  const item = await page.evaluate(() => JSON.parse(localStorage.getItem('verde-bowl:state')!).cart.items[0]);
  expect(item.cakeAiProposal).toBeUndefined();
  expect(item.referenceDataUrl).toBeTruthy();
});

for (const width of [1440, 390]) {
  test(`suma el suplemento antes de completar el relleno y revierte al quitarlo (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const { quotes } = await setup(page);
    await chooseFlavors(page);
    await expect(price(page)).toHaveText('S/ 105.00');
    await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
    await expect(price(page)).toHaveText('S/ 115.00');
    expect(quotes).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Agregar al carrito', exact: true })).toHaveCount(
      0,
    );
    if (width === 390) {
      const mobile = page.getByRole('button', { name: 'Ver el detalle de tu torta', exact: true });
      await expect(mobile).toContainText('S/ 115.00');
      await mobile.click();
    } else await summary(page).getByRole('button', { name: 'Ver desglose del precio' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('region', { name: 'Precio de tu pedido' })).toContainText(
      'S/ 115.00',
    );
    await expect(dialog.getByText('Opciones por presentación').locator('..')).toContainText(
      '+ S/ 10.00',
    );
    await dialog.getByRole('button', { name: 'Volver a mi torta' }).click();
    await group(page, 1).getByRole('button', { name: 'Vainilla', exact: true }).click();
    await expect(price(page)).toHaveText('S/ 105.00');
    await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
    await expect(price(page)).toHaveText('S/ 115.00');
    await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
    await expect(price(page)).toHaveText('S/ 105.00');
    expect(quotes).toHaveLength(0);
  });
}

test('cantidad, nueva presentación y cotización final coinciden con el carrito', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await page.getByRole('spinbutton', { name: 'Cantidad de presentaciones', exact: true }).fill('2');
  await chooseFlavors(page);
  await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
  await expect(price(page)).toHaveText('S/ 230.00');
  await summary(page).getByRole('button', { name: 'Cambiar el tamaño de la torta' }).click();
  await page.getByRole('radio', { name: /Grande/ }).click();
  await expect(price(page)).toHaveText('S/ 370.00');
  await chooseFlavors(page);
  await group(page, 2)
    .getByRole('button', { name: /Relleno/ })
    .click();
  await group(page, 2).getByRole('button', { name: 'Manjar', exact: true }).click();
  await expect(summary(page).getByText('Total de productos', { exact: true })).toBeVisible();
  await expect(price(page)).toHaveText('S/ 370.00');
  await summary(page).getByRole('button', { name: 'Continuar a detalles', exact: true }).click();
  await summary(page).getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByRole('main')).toContainText('S/ 370.00');
});

test('respeta unidades incluidas y cobra suplementos sin consumirlas', async ({ page }) => {
  await setup(page);
  await chooseFlavors(page);
  await group(page, 3)
    .getByRole('button', { name: /Adicionales/ })
    .click();
  await group(page, 3).getByRole('button', { name: 'Fruta', exact: true }).click();
  await expect(price(page)).toHaveText('S/ 105.00');
  await group(page, 3).getByRole('button', { name: 'Topper', exact: true }).click();
  await expect(price(page)).toHaveText('S/ 110.00');
  await group(page, 3).getByRole('button', { name: 'Chocolate', exact: true }).click();
  // Chocolate es la unidad incluida; Fruta (6) y Topper (5) se cobran.
  await expect(price(page)).toHaveText('S/ 116.00');
  await group(page, 3)
    .getByRole('button', { name: 'Agregar uno Cantidad de Fruta', exact: true })
    .click();
  await expect(price(page)).toHaveText('S/ 122.00');
});

test('escala extras por porciones y redondea antes de multiplicar las presentaciones', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('radio', { name: /Más porciones/ }).click();
  await page.getByRole('spinbutton', { name: 'Número de porciones', exact: true }).fill('9');
  await page.getByRole('spinbutton', { name: 'Cantidad de presentaciones', exact: true }).fill('2');
  await chooseFlavors(page);
  await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
  // Base 110 + suplemento 10 × 9/8 = 121.25 por torta.
  await expect(price(page)).toHaveText('S/ 242.50');
});

test('suma diseño y opciones una sola vez', async ({ page }) => {
  await setup(page, { theme: true });
  await expect(price(page)).toHaveText('S/ 120.00');
  await chooseFlavors(page);
  await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
  await expect(price(page)).toHaveText('S/ 130.00');
  await group(page, 2)
    .getByRole('button', { name: /Relleno/ })
    .click();
  await group(page, 2).getByRole('button', { name: 'Manjar', exact: true }).click();
  await expect(summary(page).getByText('Total de productos', { exact: true })).toBeVisible();
  await expect(price(page)).toHaveText('S/ 130.00');
});

test('una cotización atrasada no reemplaza el precio de la elección actual', async ({ page }) => {
  const { quotes, releaseQuote } = await setup(page, { holdQuote: true });
  await chooseFlavors(page);
  await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
  await group(page, 2)
    .getByRole('button', { name: /Relleno/ })
    .click();
  await group(page, 2).getByRole('button', { name: 'Manjar', exact: true }).click();
  await expect.poll(() => quotes.length).toBe(1);
  await expect(price(page)).toHaveText('S/ 115.00');
  await group(page, 2).getByRole('button', { name: 'Manjar', exact: true }).click();
  await group(page, 1)
    .getByRole('button', { name: /Bizcocho/ })
    .click();
  await group(page, 1).getByRole('button', { name: 'Vainilla', exact: true }).click();
  releaseQuote();
  await expect(price(page)).toHaveText('S/ 105.00');
  await expect(summary(page).getByText('Total de productos', { exact: true })).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test(`guía al relleno desde una acción visible sin recorrer toda la lista (${width}px)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page, { longFlavorList: true });
    await chooseFlavors(page);
    await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
    await expect(group(page, 1).locator('[data-cake-group-toggle]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const progress = summary(page).getByRole('region', { name: 'Progreso de tu personalización' });
    await expect(progress).toContainText('1 de 2 obligatorios');
    await expect(
      progress.getByRole('button', { name: 'Editar Bizcocho: Marmoleado', exact: true }),
    ).toBeVisible();
    await expect(
      progress.getByRole('button', { name: 'Editar Relleno: por elegir', exact: true }),
    ).toBeVisible();
    const next =
      width === 390
        ? page
            .locator('[data-cake-mobile-actions]')
            .getByRole('button', { name: 'Elegir relleno', exact: true })
        : summary(page).getByRole('button', { name: 'Elegir relleno', exact: true });
    await expect(next).toBeInViewport();
    await expect(next).toBeEnabled();
    await expect(price(page)).toHaveText('S/ 115.00');
    await page.screenshot({ path: testInfo.outputPath(`personalizacion-${width}.png`) });
    await next.click();
    await expect(group(page, 2).locator('[data-cake-group-toggle]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(group(page, 2).locator('[data-cake-group-toggle]')).toBeFocused();
    await expect(group(page, 2).locator('[data-cake-group-toggle]')).toBeInViewport();
    await group(page, 2).getByRole('button', { name: 'Manjar', exact: true }).click();
    await expect(summary(page).getByText('Total de productos', { exact: true })).toBeVisible();
    await expect(progress).toContainText('2 de 2 obligatorios');
    await expect(
      progress.getByRole('button', { name: 'Editar Adicionales: opcional', exact: true }),
    ).toBeVisible();
    const details =
      width === 390
        ? page
            .locator('[data-cake-mobile-actions]')
            .getByRole('button', { name: 'Continuar a detalles', exact: true })
        : summary(page).getByRole('button', { name: 'Continuar a detalles', exact: true });
    await details.click();
    await expect(
      page.getByRole('heading', { name: 'Los últimos detalles', exact: true }),
    ).toBeVisible();
    await expect(price(page)).toHaveText('S/ 115.00');
  });
}

test('los accesos entre grupos llevan al pendiente y los adicionales se pueden omitir', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await chooseFlavors(page);
  await group(page, 1).getByRole('button', { name: 'Vainilla', exact: true }).click();
  const nextGroup = group(page, 1)
    .getByRole('button', { name: 'Elegir relleno', exact: true })
    .first();
  await expect(nextGroup).toBeEnabled();
  await nextGroup.click();
  await expect(group(page, 2).locator('[data-cake-group-toggle]')).toBeFocused();
  await group(page, 2).getByRole('button', { name: 'Manjar', exact: true }).click();
  await expect(summary(page).getByText('Total de productos', { exact: true })).toBeVisible();
  await group(page, 2)
    .getByRole('button', { name: 'Ver adicionales', exact: true })
    .first()
    .click();
  await expect(
    group(page, 3).getByText('Puedes continuar sin agregar extras', { exact: true }),
  ).toBeVisible();
  await expect(
    group(page, 3).getByRole('button', { name: 'Continuar a detalles', exact: true }),
  ).toHaveCount(0);
  await summary(page).getByRole('button', { name: 'Continuar a detalles', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Los últimos detalles', exact: true }),
  ).toBeVisible();
  await expect(price(page)).toHaveText('S/ 105.00');
});

for (const width of [1440, 390]) {
  test(`una sola acción final visible y tarjetas sin estirarse al seleccionar adicionales (${width}px)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page);
    await chooseFlavors(page);
    await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
    await expect(
      group(page, 1).getByRole('button', { name: 'Agregar uno Cantidad de Marmoleado' }),
    ).toHaveCount(0);
    await group(page, 1)
      .getByRole('button', { name: 'Elegir relleno', exact: true })
      .first()
      .click();
    await group(page, 2).getByRole('button', { name: 'Manjar', exact: true }).click();
    await expect(summary(page).getByText('Total de productos', { exact: true })).toBeVisible();
    await group(page, 2)
      .getByRole('button', { name: 'Ver adicionales', exact: true })
      .first()
      .click();
    const adjacent = group(page, 3)
      .getByRole('button', { name: 'Chocolate', exact: true })
      .locator('..');
    const before = await adjacent.boundingBox();
    await group(page, 3).getByRole('button', { name: 'Fruta', exact: true }).click();
    await expect(summary(page).getByText('Total de productos', { exact: true })).toBeVisible();
    const after = await adjacent.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.height).toBeCloseTo(before!.height, 0);
    await expect(
      group(page, 3).getByRole('button', { name: 'Agregar uno Cantidad de Fruta' }),
    ).toBeVisible();
    await expect(group(page, 3).getByText('Selección lista', { exact: true })).toHaveCount(0);
    await expect(
      page
        .locator('#cake-configurator')
        .getByRole('button', { name: 'Continuar a detalles', exact: true }),
    ).toHaveCount(0);
    const next = page.getByRole('button', { name: 'Continuar a detalles', exact: true });
    await expect(next).toHaveCount(1);
    await expect(next).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`adicionales-compactos-${width}.png`) });
    await next.click();
    await expect(
      page.getByRole('heading', { name: 'Los últimos detalles', exact: true }),
    ).toBeVisible();
  });
}

test('los contadores respetan el máximo compartido de adicionales', async ({ page }) => {
  await setup(page);
  await chooseFlavors(page);
  await group(page, 3).locator('[data-cake-group-toggle]').click();
  for (const name of ['Fruta', 'Chocolate', 'Topper']) {
    await group(page, 3).getByRole('button', { name, exact: true }).click();
  }
  const moreTopper = group(page, 3).getByRole('button', { name: 'Agregar uno Cantidad de Topper' });
  await moreTopper.click();
  await moreTopper.click();
  const moreFruit = group(page, 3).getByRole('button', { name: 'Agregar uno Cantidad de Fruta' });
  await moreFruit.click();
  await expect(moreFruit).toBeDisabled();
  await group(page, 3).getByRole('button', { name: 'Quitar uno Cantidad de Topper' }).click();
  await expect(moreFruit).toBeEnabled();
  await moreFruit.click();
  await expect(moreFruit).toBeDisabled();
  await expect(price(page)).toHaveText('S/ 133.00');
});

test('el progreso requiere el mínimo completo de un grupo y conserva las elecciones al editar', async ({
  page,
}) => {
  await setup(page, { minFlavorSelections: 2 });
  await chooseFlavors(page);
  const progress = summary(page).getByRole('region', { name: 'Progreso de tu personalización' });
  await group(page, 1).getByRole('button', { name: 'Vainilla', exact: true }).click();
  await expect(progress).toContainText('0 de 2 obligatorios');
  await group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }).click();
  await expect(progress).toContainText('1 de 2 obligatorios');
  await progress.getByRole('button', { name: 'Editar Relleno: por elegir', exact: true }).click();
  await expect(group(page, 2).locator('[data-cake-group-toggle]')).toBeFocused();
  await progress.getByRole('button', { name: /Editar Bizcocho:/ }).click();
  await expect(
    group(page, 1).getByRole('button', { name: 'Vainilla', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    group(page, 1).getByRole('button', { name: 'Marmoleado', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});
