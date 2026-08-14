import path from 'node:path';
import { config } from 'dotenv';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

/**
 * Confirmar un pedido exige sesion, asi que el carrito ofrece cosas distintas a un
 * visitante y a un cliente identificado. Esta ayuda inicia sesion de verdad: el
 * portero de sesion valida el token contra /auth/me y descarta un `auth` inventado.
 */
const signIn = async (request: APIRequestContext) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, 'La prueba requiere las credenciales locales configuradas');

  const login = await request.post('http://127.0.0.1:4000/api/v1/auth/login', {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();
  return (await login.json()).data as { accessToken: string; refreshToken: string; user: unknown };
};

const seedCart = async (
  page: Page,
  withCoverage = true,
  session?: { accessToken: string; refreshToken: string; user: unknown },
) => {
  await page.addInitScript(({ covered, auth }) => {
    if (auth) {
      localStorage.setItem('verde-bowl:accessToken', auth.accessToken);
      localStorage.setItem('verde-bowl:refreshToken', auth.refreshToken);
    }
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      ...(auth
        ? { auth: { user: auth.user, isAuthenticated: true, status: 'succeeded', error: null } }
        : {}),
      cart: {
        items: [
          {
            id: 'cart-bowl-1',
            productId: 1,
            variantId: 11,
            name: 'Bowl pollo teriyaki',
            variantName: 'Regular',
            imageUrl: null,
            quantity: 2,
            unitPrice: 20,
            extrasTotal: 2,
            lineTotal: 44,
            selections: [
              { groupId: 1, groupName: 'Base', optionId: 10, optionName: 'Arroz integral', quantity: 1, priceDelta: 0 },
              { groupId: 2, groupName: 'Proteína', optionId: 20, optionName: 'Pollo teriyaki', quantity: 1, priceDelta: 2 },
            ],
            nutrition: { calories: 540, protein: 32, carbs: 61, fat: 16, fiber: 8 },
          },
          {
            id: 'cart-bowl-2',
            productId: 2,
            variantId: 21,
            name: 'Bowl mediterráneo',
            variantName: 'Regular',
            imageUrl: null,
            quantity: 1,
            unitPrice: 18,
            extrasTotal: 0,
            lineTotal: 18,
            selections: [],
            nutrition: null,
          },
        ],
        couponCode: null,
        subtotal: 62,
        discountTotal: 0,
        deliveryFee: 0,
        walletAmount: 0,
        grandTotal: 62,
      },
      favorites: { items: [] },
    }));

    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify(
      covered
        ? {
            cityId: 1,
            branchId: 1,
            pickupBranch: { id: 1, name: 'Verde Bowl Centro', addressLine: 'Av. Principal 123' },
            deliveryType: 'PICKUP',
            serviceMode: 'ASAP',
            scheduledSlotId: null,
          }
        : {
            cityId: null,
            branchId: null,
            pickupBranch: null,
            deliveryType: 'DELIVERY',
            serviceMode: 'ASAP',
            scheduledSlotId: null,
          },
    ));
  }, { covered: withCoverage, auth: session ?? null });
};

test('carrito presenta el pedido, recalcula cantidades y protege el vaciado', async ({ page, request }) => {
  await seedCart(page, true, await signIn(request));
  await page.goto('/carrito');

  await expect(page.getByRole('heading', { level: 1, name: 'Revisa tu carrito' })).toBeVisible();
  await expect(page.getByText('Productos (3)')).toBeVisible();
  await expect(page.getByText('Local de recojo confirmado')).toBeVisible();
  await expect(page.getByText('Arroz integral · Pollo teriyaki')).toBeVisible();
  await expect(page.getByText('S/ 62.00').first()).toBeVisible();

  const summaryNote = page.getByText(/El servidor confirmará disponibilidad/);
  const checkoutButton = page.getByRole('button', { name: /Continuar al checkout/ });
  const [noteBox, buttonBox] = await Promise.all([
    summaryNote.boundingBox(),
    checkoutButton.boundingBox(),
  ]);
  expect(noteBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.y - (noteBox!.y + noteBox!.height)).toBeGreaterThanOrEqual(16);

  const checkoutAppearance = await checkoutButton.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      height: element.getBoundingClientRect().height,
      borderRadius: Number.parseFloat(styles.borderRadius),
    };
  });
  expect(checkoutAppearance.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(checkoutAppearance.height).toBeGreaterThanOrEqual(48);
  expect(checkoutAppearance.borderRadius).toBeLessThanOrEqual(5);

  for (const action of [
    page.getByRole('link', { name: 'Seguir comprando' }),
    page.getByRole('button', { name: 'Cambiar', exact: true }),
  ]) {
    const appearance = await action.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        borderWidth: Number.parseFloat(styles.borderTopWidth),
        height: element.getBoundingClientRect().height,
      };
    });
    expect(appearance.borderWidth).toBeGreaterThanOrEqual(1);
    expect(appearance.height).toBeGreaterThanOrEqual(36);
  }

  await page.getByRole('button', { name: 'Agregar uno Bowl pollo teriyaki' }).click();
  await expect(page.getByText('Productos (4)')).toBeVisible();
  await expect(page.getByText('S/ 84.00').first()).toBeVisible();

  await page.getByRole('button', { name: 'Vaciar carrito' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '¿Vaciar todo el carrito?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Conservar productos' }).click();
  await expect(page.getByText('Productos (4)')).toBeVisible();
});

test('sin sesión el carrito pide identificarse antes de ir al checkout', async ({ page }) => {
  // Confirmar el pedido exige cuenta (el backend rechaza /checkout/place sin ella).
  // Se avisa aqui, no rebotando al cliente desde el checkout sin explicacion.
  await seedCart(page);
  await page.goto('/carrito');

  await expect(page.getByRole('heading', { level: 1, name: 'Revisa tu carrito' })).toBeVisible();
  await expect(page.getByText(/Para confirmar el pedido necesitas tu cuenta/)).toBeVisible();

  const cta = page.getByRole('button', { name: 'Inicia sesión para continuar' });
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page).toHaveURL(/\/ingresar/);
});

test('carrito móvil explica la cobertura pendiente sin desbordarse', async ({ page }) => {
  await seedCart(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/carrito');

  await expect(page.getByText('Falta confirmar la dirección')).toBeVisible();
  await expect(page.getByText(/Confirma una dirección con cobertura/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elegir dirección' }).last()).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});
