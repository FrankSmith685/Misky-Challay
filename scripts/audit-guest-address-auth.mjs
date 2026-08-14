import { chromium } from '@playwright/test';

const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  let privateAddressRequests = 0;

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Simula el dato anonimo que una version anterior dejaba restaurar.
    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify({
      cityId: 1,
      address: null,
      branchId: 9,
      pickupBranch: { id: 9, name: 'Verde Bowl Miraflores', addressLine: 'Av. Benavides 100' },
      deliveryType: 'PICKUP',
      serviceMode: 'ASAP',
      scheduledSlotId: null,
    }));
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const ok = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'OK', data }),
    });

    if (pathname.includes('/account/addresses')) {
      privateAddressRequests += 1;
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'No autenticado' }) });
      return;
    }
    if (pathname.endsWith('/settings/public')) {
      await ok({
        business: {
          legalName: 'Verde Bowl S.A.C.', commercialName: 'Verde Bowl', ruc: '20600000000',
          address: 'Miraflores, Lima', phone: '+51 999 999 999', email: 'hola@verdebowl.test',
          supportEmail: 'soporte@verdebowl.test', complaintResponseDays: 15,
        },
        cod: { enabled: true, maxAmount: 300 },
        invoicing: { boletaDniThreshold: 700 },
      });
      return;
    }
    if (pathname.endsWith('/locations/cities')) {
      await ok([{ id: 1, name: 'Lima', slug: 'lima', currency: 'PEN', timezone: 'America/Lima' }]);
      return;
    }
    if (pathname.endsWith('/locations/districts')) {
      await ok([{ id: 10, cityId: 1, name: 'Miraflores', slug: 'miraflores', ubigeoCode: '150122', coverageZoneId: 20 }]);
      return;
    }
    if (pathname.endsWith('/locations/departments')) {
      await ok([{ code: '15', name: 'Lima' }]);
      return;
    }
    if (pathname.endsWith('/locations/provinces')) {
      await ok([{ code: '1501', departmentCode: '15', name: 'Lima' }]);
      return;
    }
    if (pathname.endsWith('/locations/geographic-districts')) {
      await ok([{
        code: '150122', departmentCode: '15', department: 'Lima', provinceCode: '1501',
        province: 'Lima', name: 'Miraflores', latitude: -12.121, longitude: -77.03,
      }]);
      return;
    }
    if (pathname.endsWith('/locations/address-suggestions')) {
      await ok([{
        id: 'address-1', label: 'Av. José Larco 345, Miraflores', line1: 'Av. José Larco 345',
        district: 'Miraflores', districtId: 10, ubigeoCode: '150122', city: 'Lima',
        province: 'Lima', region: 'Lima', postcode: '15074', latitude: -12.121,
        longitude: -77.03, source: 'openstreetmap', precision: 'exact', hasHouseNumber: true,
      }]);
      return;
    }
    if (pathname.endsWith('/locations/coverage')) {
      await ok({
        covered: true,
        zone: { id: 20, name: 'Miraflores', deliveryFee: 5.9, minimumOrder: 25, estimatedMinutes: 35, polygon: null },
        branch: { id: 9, name: 'Verde Bowl Miraflores', addressLine: 'Av. Benavides 100', prepMinutes: 15, isOpenNow: true },
        etaMinutes: 35,
        demandLevel: 'LOW',
      });
      return;
    }
    await ok([]);
  });

  await page.goto(`${baseUrl}/cobertura`, { waitUntil: 'domcontentloaded' });

  // El local heredado no se muestra mientras React termina de limpiar el estado.
  if (await page.getByText('Recojo · Verde Bowl Miraflores', { exact: false }).count()) {
    throw new Error('La cabecera expuso un local de recojo sin sesion');
  }
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('verde-bowl:purchase-context:v2');
    if (!raw) return true;
    const saved = JSON.parse(raw);
    return saved.address == null && saved.branchId == null && saved.pickupBranch == null && saved.deliveryType === 'DELIVERY';
  });

  // El selector global tampoco presenta el formulario privado a un invitado.
  await page.getByRole('button', { name: 'Elige tu dirección de entrega' }).click();
  await page.getByRole('heading', { name: 'Protegemos tus datos de entrega' }).waitFor();
  if (await page.getByRole('combobox', { name: 'Dirección exacta' }).count()) {
    throw new Error('El modal expuso el formulario de direccion a un invitado');
  }
  await page.getByRole('button', { name: 'Cerrar' }).click();

  const department = page.getByRole('combobox', { name: 'Departamento' });
  await department.waitFor();
  await department.click();
  await page.getByRole('option', { name: 'Lima' }).click();

  const province = page.getByRole('combobox', { name: 'Provincia' });
  await province.click();
  await page.getByRole('option', { name: 'Lima' }).click();

  const district = page.getByRole('combobox', { name: 'Distrito' });
  await district.click();
  await page.getByRole('option', { name: 'Miraflores' }).click();

  const address = page.getByRole('combobox', { name: 'Dirección exacta' });
  await address.fill('Av. José Larco 345');
  await page.getByRole('option', { name: /Av\. José Larco 345/i }).click();

  const verify = page.getByRole('button', { name: 'Verificar cobertura' });
  await verify.waitFor({ state: 'visible' });
  await verify.click();

  const protectedAction = page.getByRole('button', { name: 'Ingresar para usar esta dirección' });
  await protectedAction.waitFor();
  await protectedAction.click();
  await page.waitForURL('**/ingresar');

  const result = await page.evaluate(() => ({
    purchaseContext: JSON.parse(localStorage.getItem('verde-bowl:purchase-context:v2') ?? 'null'),
    accessToken: localStorage.getItem('verde-bowl:accessToken'),
  }));

  if (
    privateAddressRequests !== 0
    || result.purchaseContext?.address != null
    || result.purchaseContext?.branchId != null
    || result.purchaseContext?.pickupBranch != null
    || result.purchaseContext?.deliveryType === 'PICKUP'
    || result.accessToken !== null
  ) {
    throw new Error(JSON.stringify({ privateAddressRequests, ...result }));
  }

  console.log(JSON.stringify({ redirectedToLogin: true, privateAddressRequests, ...result }, null, 2));
} finally {
  await browser.close();
}
