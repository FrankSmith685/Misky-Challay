import { expect, test, type Page, type APIResponse } from '@playwright/test';

interface BuilderConfig {
  product: { id: number };
  groups: Array<{
    id: number;
    minSelection: number;
    maxSelection: number;
    options: Array<{ id: number; name: string; isAvailable: boolean; incompatibleWith: number[] }>;
  }>;
  presets: Array<{ id: number; name: string }>;
}

const openBuilder = async (page: Page): Promise<BuilderConfig> => {
  const configResponse = page.waitForResponse((response) =>
    /\/api\/v1\/customizations\/\d+(\?|$)/.test(response.url()) && response.request().method() === 'GET',
  );
  await page.goto('/arma-tu-bowl');
  const response: APIResponse = await configResponse;
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { data: BuilderConfig };
  await expect(page.getByRole('heading', { name: /Tu bowl perfecto/i })).toBeVisible();
  return body.data;
};

const optionCard = (page: Page, optionId: number) =>
  page.locator(`[data-option-id="${optionId}"]`);

const completeRequiredGroups = async (page: Page, config: BuilderConfig) => {
  const selected = new Set<number>();
  for (const group of config.groups.filter((item) => item.minSelection > 0)) {
    let remaining = group.minSelection;
    for (const option of group.options) {
      if (!option.isAvailable || option.incompatibleWith.some((id) => selected.has(id))) continue;
      await optionCard(page, option.id).click();
      await expect(optionCard(page, option.id)).toHaveAttribute('aria-pressed', 'true');
      selected.add(option.id);
      remaining -= 1;
      if (remaining === 0) break;
    }
    expect(remaining, `El grupo ${group.id} debe tener suficientes opciones disponibles`).toBe(0);
  }
};

test.describe('Arma tu bowl', () => {
  test('completa y cotiza un bowl sin dirección ni sucursal', async ({ page }) => {
    const config = await openBuilder(page);
    await completeRequiredGroups(page, config);

    const addButton = page.getByRole('button', { name: /Agregar al carrito/i }).last();
    await expect(addButton).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await addButton.click();
    await expect(page).toHaveURL(/\/carrito$/);
  });

  test('conserva el avance después de recargar', async ({ page }) => {
    const config = await openBuilder(page);
    const first = config.groups.find((group) => group.minSelection > 0)?.options.find((option) => option.isAvailable);
    expect(first).toBeTruthy();
    await optionCard(page, first!.id).click();
    await expect(optionCard(page, first!.id)).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(optionCard(page, first!.id)).toHaveAttribute('aria-pressed', 'true');
  });

  test('actualiza la vista visual y los indicadores nutricionales', async ({ page }) => {
    const config = await openBuilder(page);
    const first = config.groups.flatMap((group) => group.options).find((option) => option.isAvailable);
    expect(first).toBeTruthy();
    await optionCard(page, first!.id).click();
    await expect(page.getByRole('figure', { name: new RegExp(`Vista del bowl con ${first!.name}`, 'i') })).toBeVisible();
    await expect(page.getByText(/Indicadores orientativos por bowl/i)).toBeVisible();
  });

  test('conserva selecciones sin conexión y recotiza al volver', async ({ page, context }) => {
    const config = await openBuilder(page);
    await context.setOffline(true);
    await completeRequiredGroups(page, config);
    await expect(page.getByText(/Sin conexión. Conservamos tu bowl/i)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: /Agregar al carrito/i }).last()).toBeEnabled();
  });

  test('permite resolver una incompatibilidad de ingredientes', async ({ page }) => {
    const config = await openBuilder(page);
    const allOptions = config.groups.flatMap((group) => group.options);
    const target = allOptions.find((option) => option.isAvailable && option.incompatibleWith.some((id) => allOptions.some((candidate) => candidate.id === id && candidate.isAvailable)));
    test.skip(!target, 'Los datos actuales no contienen una pareja incompatible activa');
    const currentId = target!.incompatibleWith.find((id) => allOptions.some((option) => option.id === id && option.isAvailable))!;

    await optionCard(page, currentId).click();
    await expect(optionCard(page, currentId)).toHaveAttribute('aria-pressed', 'true');
    const replacement = optionCard(page, target!.id).getByRole('button', { name: /Reemplazar/i });
    await expect(replacement).toBeVisible();
    await replacement.click();
    await expect(optionCard(page, target!.id)).toHaveAttribute('aria-pressed', 'true');
    await expect(optionCard(page, currentId)).toHaveAttribute('aria-pressed', 'false');
  });

  test('expone una navegación móvil usable con teclado', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBuilder(page);
    await expect(page.getByRole('button', { name: /Completa tu bowl|Agregar al carrito/i }).last()).toBeVisible();

    const collapsedHeader = page.locator('section[id^="builder-group-"] header[role="button"]').first();
    await expect(collapsedHeader).toBeVisible();
    const sectionId = await collapsedHeader.evaluate((element) => element.parentElement?.id);
    expect(sectionId).toBeTruthy();
    const stableHeader = page.locator(`#${sectionId} header`);
    await collapsedHeader.focus();
    await page.keyboard.press('Enter');
    await expect(stableHeader).toHaveAttribute('aria-expanded', 'true');
  });

  test('registra la aplicación de una recomendación', async ({ page }) => {
    const config = await openBuilder(page);
    test.skip(config.presets.length === 0, 'No hay recomendaciones activas');
    const preset = config.presets[0];
    const tracked = page.waitForRequest((request) => {
      if (!request.url().endsWith('/api/v1/customizations/events') || request.method() !== 'POST') return false;
      const body = request.postDataJSON() as { eventType?: string; presetId?: number };
      return body.eventType === 'PRESET_APPLY' && body.presetId === preset.id;
    });
    await page.getByRole('button', { name: new RegExp(preset.name, 'i') }).click();
    await tracked;
  });
});
