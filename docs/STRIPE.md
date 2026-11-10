# Pagos de tortas en DulceFlow

## Situación para una empresa registrada solo en Perú

Stripe Payments no admite actualmente abrir una cuenta de cobros para una empresa establecida solo en Perú. Cobrar en soles (PEN) con una cuenta de un país admitido es una cuestión distinta: no habilita el alta de una empresa peruana. No configures un país o datos empresariales que no correspondan a la entidad real. Consulta la [lista oficial de países](https://stripe.com/global) antes de iniciar el alta.

Para operar desde Perú se integra Mercado Pago Checkout Pro. Consulta [la guía de configuración](MERCADOPAGO.md). Mientras faltan sus credenciales, `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` deben quedar vacías en `backend/.env`; en desarrollo se usa el simulador local, que no cobra dinero real. El simulador no está permitido en producción.

## Cómo funciona la integración existente

- El backend crea una sesión de Stripe Checkout al confirmar cada pedido online. Envía el importe calculado por el servidor con `price_data` y `product_data`; no hay que crear una ficha de producto por cada torta en el panel de Stripe.
- Una torta de catálogo se cobra completa. Una torta de diseño especial aprobada genera un cobro del 50 % como anticipo y otro del 50 % como saldo antes de la entrega. Cada cobro tiene su propia sesión y referencia.
- El cliente vuelve a la aplicación, pero solo el webhook firmado confirma el pago y sus efectos en pedido y producción.
- La comisión de DulceFlow del 15 % se registra en el módulo de liquidaciones por cada pedido cobrado. Esta integración no hace una transferencia automática del 15 %: el dinero entra íntegramente en la cuenta receptora de la pasarela y la comisión se liquida por separado.

## Pruebas con Stripe si existe una cuenta elegible

1. En el panel de Stripe obtén una clave secreta de prueba `sk_test_...`.
2. Instala Stripe CLI e inicia sesión con `stripe login`.
3. Ejecuta este comando y mantenlo abierto mientras pruebas:

   ```powershell
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to localhost:4000/api/v1/payments/webhooks/stripe
   ```

4. Copia el secreto `whsec_...` que imprime la CLI a `backend/.env`:

   ```env
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173
   STRIPE_SECRET_KEY=sk_test_REEMPLAZA_CON_TU_CLAVE
   STRIPE_WEBHOOK_SECRET=whsec_REEMPLAZA_CON_EL_SECRETO_DE_LA_CLI
   ```

5. Reinicia el backend. Debe mostrar `Pagos: Stripe (test)` al arrancar.
6. Prueba un pedido de torta de catálogo. Comprueba que el webhook confirme el pedido una sola vez. Después prueba una torta de diseño aprobada: paga el anticipo y, desde el detalle del pedido, paga el saldo; verifica que existan dos pagos independientes.

El secreto de Stripe CLI, el de un endpoint de prueba y el de un endpoint de producción son distintos. La clave secreta solo debe estar en el backend o en el gestor de secretos del hosting. Stripe Checkout alojado no necesita una clave publicable en el frontend.

## Producción con una entidad admitida por Stripe

Configura un endpoint HTTPS público en Stripe Workbench/Webhooks:

```text
https://api.tudominio.com/api/v1/payments/webhooks/stripe
```

Suscribe `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`. Guarda su secreto `whsec_...` y una clave `sk_live_...` en el entorno del backend. No reutilices el secreto de la CLI. El backend exige esas credenciales reales al arrancar con `NODE_ENV=production`.

Para Perú usa la integración de Mercado Pago documentada en [MERCADOPAGO.md](MERCADOPAGO.md). El contrato compartido de proveedores está en `backend/src/integrations/payments/payment.provider.ts`.
