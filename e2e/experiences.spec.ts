import { expect, test, type Page } from '@playwright/test';

const scene = {
  content: 'ALIEN',
  title: 'Propuesta de prueba',
  message: 'Feliz celebración de otro planeta.',
  color: '#8ba959',
  scale: 1,
  position: { x: 0, y: 0, z: 0 },
  rotation: 0,
  modelAssetId: null,
  videoAssetId: null,
  audioAssetId: null,
  targetImageAssetId: null,
  targetAssetId: null,
  animationIndex: 0,
  videoOnTarget: false,
};
const pack = {
  id: 1,
  version: 1,
  name: 'Experiencia AR con 3D y video',
  description: 'Una escena para tu celebración.',
  mode: 'AR',
  price: 0,
  validityDays: 90,
  revisionsIncluded: 1,
  minLeadHours: 48,
  paymentRequirement: 'FULL',
  isActive: false,
  templateId: 1,
  sortOrder: 0,
};
async function prepare(page: Page, { admin = false, readOnly = false, unavailable = false } = {}) {
  const user = {
    id: 999,
    email: 'studio@example.test',
    firstName: 'Estudio',
    lastName: 'Prueba',
    phone: '999111222',
    roles: ['ADMIN'],
    permissions: readOnly ? ['experience.read'] : [],
    branchIds: [],
    isSuperAdmin: !readOnly,
    avatarUrl: null,
  };
  const saved: Array<{ path: string; body: Record<string, unknown> }> = [];
  const packages = [{ ...pack }];
  let customerStatus = 'AWAITING_APPROVAL';
  let project = {
    id: 4,
    orderId: 10,
    packageSnapshotJson: { ...pack, price: 30 },
    sceneJson: scene,
    version: 1,
    status: 'IN_PROGRESS',
    brief: 'Crear un alien para una celebración de cumpleaños.',
    publicToken: 'a'.repeat(32),
    assignedTo: null,
    customerFeedback: null,
    revisionsUsed: 0,
    startsAt: null,
    expiresAt: null,
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/me') data = user;
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    if (path === '/orders/QR-DEMO-1')
      data = {
        order: {
          id: 10,
          orderNumber: 'QR-DEMO-1',
          status: 'CONFIRMED',
          deliveryType: 'PICKUP',
          serviceMode: 'SCHEDULED',
          scheduledAt: new Date(Date.now() + 96 * 3600000).toISOString(),
          placedAt: new Date().toISOString(),
          branch: { name: 'Local de prueba', addressLine: 'Lima' },
          paymentPlan: 'FULL',
          items: [
            {
              id: 1,
              productNameSnapshot: 'Torta de celebración',
              quantity: 1,
              unitPrice: 100,
              lineTotal: 100,
            },
          ],
          subtotal: 130,
          deliveryFee: 0,
          discountTotal: 0,
          walletAmount: 0,
          grandTotal: 130,
          taxRate: 0.18,
          taxTotal: 19.83,
          statusHistory: [],
        },
        payment: null,
        directPayments: [],
      };
    if (path === '/experiences/orders/QR-DEMO-1')
      data = {
        id: 4,
        status: customerStatus,
        version: 1,
        package: { ...pack, price: 30 },
        revisionsUsed: 0,
        feedback: null,
        scene,
        publicToken: null,
        startsAt: null,
        expiresAt: null,
        previewExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
    if (path === '/experiences/orders/QR-DEMO-1/review') {
      const body = route.request().postDataJSON();
      saved.push({ path, body });
      customerStatus = body.approve ? 'APPROVED' : 'IN_PROGRESS';
      data = {};
    }
    if (path === '/settings/public')
      data = {
        business: {
          commercialName: 'Misky Challay',
          legalName: 'Prueba',
          email: 'studio@example.test',
          phone: '999000000',
          address: 'Lima',
          ruc: '20600000000',
          supportEmail: 'studio@example.test',
        },
        receipts: { mode: 'INTERNAL_ONLY' },
      };
    if (path === '/experiences/admin/config')
      data = {
        packages,
        templates: [
          { id: 1, version: 1, name: 'Alien de celebración', isActive: true, sceneJson: scene },
        ],
        assets: [],
      };
    if (path === '/experiences/admin/projects')
      data = [{ ...project, order: { orderNumber: 'QR-DEMO-1', status: 'CONFIRMED' } }];
    if (path === '/experiences/admin/projects/4') {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        saved.push({ path, body });
        project = { ...project, sceneJson: body.scene, version: project.version + 1 };
        data = project;
      } else
        data = {
          project,
          order: {
            orderNumber: 'QR-DEMO-1',
            status: 'CONFIRMED',
            depositPaidAt: new Date().toISOString(),
            balancePaidAt: new Date().toISOString(),
          },
          history: [
            {
              id: 1,
              action: 'CREATED',
              version: 1,
              note: 'Adicional contratado.',
              createdAt: new Date().toISOString(),
            },
          ],
        };
    }
    if (path === '/experiences/admin/packages' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      saved.push({ path, body });
      Object.assign(packages[0], body, { version: 2 });
      data = packages[0];
    }
    if (path === '/experiences/admin/assets' && route.request().method() === 'POST') {
      const url = new URL(route.request().url());
      expect(route.request().postDataBuffer()?.length).toBeGreaterThan(1000);
      expect(url.searchParams.get('projectId')).toBe('4');
      data = {
        id: 80,
        kind: 'VIDEO',
        name: url.searchParams.get('name'),
        sourceImageId: null,
        size: route.request().postDataBuffer()?.length,
      };
    }
    if (path.startsWith('/experiences/public/')) {
      if (unavailable) {
        await route.fulfill({ status: 404, json: { success: false, message: 'No disponible' } });
        return;
      }
      data = { scene, expiresAt: new Date(Date.now() + 86400000).toISOString() };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  if (admin)
    await page.addInitScript((user) => {
      localStorage.setItem('verde-bowl:accessToken', 'studio-test-token');
      localStorage.setItem(
        'verde-bowl:state',
        JSON.stringify({ auth: { user, isAuthenticated: true, status: 'succeeded', error: null } }),
      );
    }, user);
  return { saved };
}
for (const width of [390, 1440])
  test(`demostración pública con escena, video y QR sin cobros (${width}px)`, async ({
    page,
  }, testInfo) => {
    const { saved } = await prepare(page);
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/experiencias/demo');
    await expect(page.getByRole('heading', { name: 'Un invitado de otro planeta' })).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Escena 3D animada; arrastra para girar' }).locator('canvas'),
    ).toBeVisible();
    await expect(page.locator('video[aria-label="Video personalizado"]')).toBeVisible();
    await expect
      .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThan(0);
    expect(
      await page.locator('video').evaluate((v: HTMLVideoElement) => v.duration),
    ).toBeGreaterThan(5);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    expect(saved).toEqual([]);
    const cookies = page.getByRole('button', { name: 'Solo necesario', exact: true });
    if (await cookies.isVisible()) await cookies.click();
    await expect(page.getByRole('img', { name: 'QR para abrir esta experiencia' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('experiencia-publica.png'), fullPage: true });
  });
test('la tarjeta QR se descarga como una imagen imprimible', async ({ page }) => {
  await prepare(page);
  await page.goto('/experiencias/demo');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar tarjeta con QR' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('mi-experiencia-qr.png');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  if (stream) for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(2200);
  expect(bytes.length).toBeGreaterThan(20000);
});
test('la cámara informa el permiso denegado y permite volver al visor', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        throw new DOMException('Denied', 'NotAllowedError');
      },
    });
  });
  await page.goto('/experiencias/demo');
  await page.getByRole('button', { name: 'Activar realidad aumentada' }).click();
  await expect(page.getByRole('dialog', { name: 'Tu experiencia sobre la tarjeta' })).toBeVisible();
  await expect(page.getByText('No se permitió la cámara.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar cámara' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('un QR no publicado muestra una salida clara sin archivos privados', async ({ page }) => {
  await prepare(page, { unavailable: true });
  await page.goto(`/experiencias/${'a'.repeat(32)}`);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Esta experiencia no está disponible' }),
  ).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Activar realidad aumentada' })).toHaveCount(0);
});
test('el estudio deja los servicios como borradores y permite configurar un precio real', async ({
  page,
}) => {
  const { saved } = await prepare(page, { admin: true });
  await page.goto('/admin/experiencias-qr?tab=services');
  await page.getByRole('button', { name: 'Experiencia AR con 3D y video · Borrador' }).click();
  await page.getByRole('spinbutton', { name: 'Precio (S/)' }).fill('35');
  await page.getByRole('checkbox', { name: 'Ofrecer en el checkout' }).check();
  await page.getByRole('button', { name: 'Guardar servicio', exact: true }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].body).toMatchObject({
    id: 1,
    expectedVersion: 1,
    price: 35,
    isActive: true,
    paymentRequirement: 'FULL',
  });
});
test('guardar una propuesta usa la versión y conserva el seguimiento por pedido', async ({
  page,
}) => {
  const { saved } = await prepare(page, { admin: true });
  await page.goto('/admin/experiencias-qr');
  await page.getByRole('button', { name: 'QR-DEMO-1', exact: false }).click();
  await page
    .getByRole('textbox', { name: 'Dedicatoria', exact: true })
    .fill('Una dedicatoria actualizada para la propuesta.');
  await page.getByRole('button', { name: 'Guardar versión' }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].body).toMatchObject({
    expectedVersion: 1,
    scene: { message: 'Una dedicatoria actualizada para la propuesta.' },
  });
  await expect(page.getByText('Versión 2', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar experiencia' })).toBeDisabled();
});
test('el permiso de consulta no permite editar ni publicar', async ({ page }) => {
  await prepare(page, { admin: true, readOnly: true });
  await page.goto('/admin/experiencias-qr');
  await page.getByRole('button', { name: 'QR-DEMO-1', exact: false }).click();
  await expect(page.getByText('Tienes acceso de consulta a esta propuesta.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar versión' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publicar experiencia' })).toHaveCount(0);
});
test('el estudio crea un video de saludo con la dedicatoria y lo guarda en el pedido', async ({
  page,
}) => {
  const { saved } = await prepare(page, { admin: true });
  await page.goto('/admin/experiencias-qr');
  await page.getByRole('button', { name: 'QR-DEMO-1', exact: false }).click();
  await page
    .getByRole('textbox', { name: 'Dedicatoria', exact: true })
    .fill('Un saludo especial de cumpleaños.');
  await page.getByRole('button', { name: 'Crear video personalizado' }).click();
  await expect(page.getByRole('button', { name: 'Guardar versión', exact: true })).toBeDisabled();
  await expect(page.getByRole('tab', { name: 'Plantillas', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Video MP4 / WebM' })).toContainText(
    'saludo-alien.webm',
    { timeout: 20000 },
  );
  await page.getByRole('button', { name: 'Guardar versión' }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].body).toMatchObject({
    scene: { videoAssetId: 80, message: 'Un saludo especial de cumpleaños.' },
  });
});
for (const width of [390, 1440])
  test(`el estudio mantiene las vistas y acciones dentro de la pantalla (${width}px)`, async ({
    page,
  }, testInfo) => {
    await prepare(page, { admin: true });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/admin/experiencias-qr?tab=services');
    const cookies = page.getByRole('button', { name: 'Solo necesario', exact: true });
    if (await cookies.isVisible()) await cookies.click();
    await expect(page.getByRole('spinbutton', { name: 'Precio (S/)' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath('servicios.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Plantillas', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: 'Nombre de plantilla', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath('plantillas.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Trabajos por pedido', exact: true }).click();
    await page.getByRole('button', { name: 'QR-DEMO-1', exact: false }).click();
    await expect(page.getByRole('textbox', { name: 'Dedicatoria', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath('pedido-estudio.png'), fullPage: true });
  });
test('la vista previa conserva los cambios sin guardar y los filtros permiten recuperar el pedido', async ({
  page,
}) => {
  await prepare(page, { admin: true });
  await page.goto('/admin/experiencias-qr');
  await page.getByRole('textbox', { name: 'Buscar pedido' }).fill('no-existe');
  await expect(page.getByText('No hay trabajos que coincidan con los filtros.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.getByRole('button', { name: 'QR-DEMO-1', exact: false }).click();
  const message = page.getByRole('textbox', { name: 'Dedicatoria', exact: true });
  await message.fill('Cambios que deben mantenerse al consultar la propuesta.');
  await expect(page.getByText('Hay cambios sin guardar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Solicitar revisión del cliente' })).toBeDisabled();
  await page.getByRole('button', { name: 'Ver versión guardada' }).click();
  const dialog = page.getByRole('dialog', { name: 'Vista previa privada' });
  await expect(
    dialog.getByText('Feliz celebración de otro planeta.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar vista previa' }).click();
  await expect(message).toHaveValue('Cambios que deben mantenerse al consultar la propuesta.');
  await page.getByText('Ajustes de la escena 3D', { exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Escala', exact: true })).toBeVisible();
});
for (const width of [390, 1440])
  test(`el cliente revisa y aprueba la propuesta desde su pedido (${width}px)`, async ({
    page,
  }, testInfo) => {
    const { saved } = await prepare(page, { admin: true });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/cuenta/pedidos/QR-DEMO-1');
    await expect(
      page.getByRole('heading', { name: 'Tu experiencia QR', exact: true }),
    ).toBeVisible();
    const cookies = page.getByRole('button', { name: 'Solo necesario', exact: true });
    if (await cookies.isVisible()) await cookies.click();
    await expect(
      page.getByRole('heading', { name: 'Tu propuesta está lista para revisar' }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath('revision-del-cliente.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Aprobar esta versión', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Aprobar esta versión', exact: true }),
    ).toHaveCount(0);
    expect(saved).toEqual([
      {
        path: '/experiences/orders/QR-DEMO-1/review',
        body: { expectedVersion: 1, approve: true, feedback: '' },
      },
    ]);
  });
