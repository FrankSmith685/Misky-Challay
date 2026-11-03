import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOrderReturnUrls } from '../modules/payments/paymentReturnUrls';

describe('retorno del pago', () => {
  it('usa la ruta web exacta aunque FRONTEND_URL termine en barra', () => {
    const urls = buildOrderReturnUrls('VB-MVJAH2OE-7415', 'WEB', 'https://dulceflow.test/');
    assert.equal(urls.successUrl, 'https://dulceflow.test/checkout/confirmacion?pedido=VB-MVJAH2OE-7415');
    assert.equal(urls.cancelUrl, 'https://dulceflow.test/checkout/confirmacion?pedido=VB-MVJAH2OE-7415&pago=cancelado');
    assert.equal(new URL(urls.successUrl).pathname, '/checkout/confirmacion');
  });

  it('construye el mismo retorno web sin barra final y codifica el pedido', () => {
    const urls = buildOrderReturnUrls('VB 123/45', 'WEB', 'https://dulceflow.test');
    assert.equal(new URL(urls.successUrl).searchParams.get('pedido'), 'VB 123/45');
    assert.equal(new URL(urls.successUrl).pathname, '/checkout/confirmacion');
  });

  it('envía el retorno móvil al origen móvil y conserva el resultado', () => {
    const urls = buildOrderReturnUrls('VB-123', 'MOBILE', 'https://dulceflow.test/', 'https://movil.test/');
    assert.equal(urls.successUrl, 'https://movil.test/checkout/movil?pedido=VB-123&resultado=aprobado');
    assert.equal(urls.cancelUrl, 'https://movil.test/checkout/movil?pedido=VB-123&resultado=cancelado');
  });
});
