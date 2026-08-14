import { expect, test } from '@playwright/test';

const API_URL = 'http://127.0.0.1:4000/api/v1';

test.describe('Configuración legal del negocio', () => {
  test('expone la configuración pública y protege la administración', async ({ request }) => {
    const publicResponse = await request.get(`${API_URL}/settings/public`);

    expect(publicResponse.ok()).toBeTruthy();
    await expect(publicResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        business: {
          legalName: expect.any(String),
          commercialName: expect.any(String),
          ruc: expect.any(String),
          address: expect.any(String),
          phone: expect.any(String),
          email: expect.any(String),
          supportEmail: expect.any(String),
          complaintResponseDays: expect.any(Number),
        },
      },
    });

    const privateResponse = await request.get(`${API_URL}/settings/business`);

    expect(privateResponse.status()).toBe(401);

    for (const path of ['/settings/communication', '/settings/notification-history']) {
      const response = await request.get(`${API_URL}${path}`);
      expect(response.status()).toBe(401);
    }

    const testResponse = await request.post(`${API_URL}/settings/communication/test`, {
      data: { recipient: 'test@example.com' },
    });
    expect(testResponse.status()).toBe(401);
  });
});
