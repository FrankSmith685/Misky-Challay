# Mercado Pago Checkout Pro para tortas

DulceFlow usa la API de Orders de Mercado Pago para redirigir al cliente a Checkout Pro. Es una opción disponible para comercios de Perú. Cada cobro se genera con el importe que calcula el backend, en soles; no hay que crear cada torta en el catálogo de Mercado Pago.

## Paso a paso desde una cuenta de Mercado Pago creada

1. Inicia sesión en [Mercado Pago Developers](https://www.mercadopago.com.pe/developers/es) con la cuenta peruana que recibirá el dinero. En **Tus integraciones**, crea una aplicación para **Pagos online > Checkout Pro** si todavía no existe. Esta integración cobra en esa cuenta; la comisi?n configurada de DulceFlow (15 % por defecto) se liquida por separado por cada pedido cobrado.
2. En la aplicación, abre **Datos de integración > Pruebas > Credenciales de prueba** y copia el **Access Token** de prueba. No necesitas la Public Key para este Checkout Pro alojado. Tanto el Access Token de prueba como el productivo pueden empezar con `APP_USR-`: el prefijo no distingue el ambiente.
3. Primero ejecuta `npm run dev` desde la raíz del proyecto y comprueba que `http://127.0.0.1:5173` abre la tienda. Cambia la contraseña de administrador de ejemplo en **Mi perfil > Actualizar contraseña** y en `ADMIN_PASSWORD` de `backend/.env` para futuros arranques con una base nueva. Después prepara una URL HTTPS pública: si trabajas en Windows, puedes instalar [ngrok](https://ngrok.com/download/windows), autenticarlo siguiendo su panel y ejecutar `ngrok http 127.0.0.1:5173` en otra terminal. Copia la URL HTTPS que aparece, por ejemplo `https://abc.ngrok-free.app`. El túnel apunta al frontend Vite; su proxy `/api` entrega el webhook al backend en el puerto 4000. Usar `127.0.0.1` evita que ngrok resuelva `localhost` a `::1` cuando Vite escucha por IPv4.
4. En `backend/.env`, configura `FRONTEND_URL` con **esa misma URL HTTPS**. Deja `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` vacías por ahora. **Reinicia** `npm run dev`: Vite permite automáticamente el host exacto de ngrok indicado en `FRONTEND_URL`.
5. En **Tus integraciones > Tu aplicación > Webhooks > Configurar notificaciones**, elige la URL de **modo pruebas**, selecciona **Order (Mercado Pago)** y registra `https://abc.ngrok-free.app/api/v1/payments/webhooks/mercadopago`. Guarda y revela el secreto de Webhooks. Ahora sí copia el Access Token y el secreto a `backend/.env`, define `MERCADOPAGO_MODE=test` y reinicia `npm run dev`. Si ya tienes la API desplegada, usa `https://TU_API/api/v1/payments/webhooks/mercadopago` en lugar del túnel. Abre DulceFlow usando la URL de ngrok desde el inicio de la compra para que el retorno conserve la sesión.
6. En **Cuentas de prueba > Comprador**, busca el usuario comprador de prueba de la aplicación. Compra una torta desde DulceFlow con **el correo de ese comprador** y paga en Checkout Pro con una [tarjeta de prueba](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/integration-test/test-purchase-with-card). Para simular aprobación, la documentación indica el nombre `APRO`; para rechazo, `OTHE`. Comprueba el retorno, el webhook y el estado final del pedido. Usa una ventana privada si la sesión de tu cuenta vendedora interfiere con la compradora.

Mantén el túnel y el backend encendidos durante la prueba. Si ngrok cambia la URL, actualiza `FRONTEND_URL`, el host permitido por Vite y la URL del webhook. Mercado Pago requiere una URL pública para la notificación, y sus URLs de retorno deben poder abrirse en el navegador del comprador. El simulador local sigue disponible mientras las dos credenciales de Mercado Pago estén vacías.

Si ngrok muestra `POST /api/v1/payments/webhooks/mercadopago` con estado **401**, la notificación llegó pero su firma no coincide. Vuelve a copiar **el secreto de firma de Webhooks de la misma aplicación** desde **Tus integraciones > Webhooks > Configurar notificaciones** a `MERCADOPAGO_WEBHOOK_SECRET` en `backend/.env`, reinicia el backend y usa **Simular notificación** con el ID de una order de prueba. Debe responder 200. No uses el Access Token, el User ID ni un secreto inventado en esa variable. Los pagos acreditados se concilian con la API de Mercado Pago aunque el webhook falle, pero corrige el 401 antes de operar en producción.

Si ngrok muestra `403 Forbidden` al abrir la tienda, Vite está rechazando el host del túnel. Comprueba que `http://localhost:5173` abra normalmente y que `FRONTEND_URL` en `backend/.env` tenga la URL HTTPS **actual** de ngrok. Detén `npm run dev`, vuelve a ejecutarlo y actualiza la URL del webhook de Mercado Pago si cambió el túnel. No configures `server.allowedHosts=true`.

En el plan gratuito, ngrok puede mostrar una pantalla inicial con el botón **Visit Site**; es su aviso al visitante. Si después aparece `502 Bad Gateway` o `ERR_NGROK_8012`, comprueba primero que `http://127.0.0.1:5173` abre en tu navegador y que el backend responde en `http://127.0.0.1:4000/api/v1/health`. Si ninguno responde, inicia `npm run dev` desde la raíz del proyecto y espera a ver `Backend listo. Iniciando frontend.` y el puerto 5173 en los logs. Si el backend no arranca, el script espera hasta tres minutos y el frontend tampoco se inicia: revisa el primer error de `BACKEND` en esa terminal. Si ngrok informa `dial tcp [::1]:5173`, reinicia **solo ngrok** con `ngrok http 127.0.0.1:5173`; su nueva URL pública puede ser distinta y tendrás que actualizar `FRONTEND_URL`, el host permitido por Vite y el webhook de Mercado Pago.

## Variables del backend

Guarda en `backend/.env` las credenciales de la misma aplicación y ambiente. Deja las variables de Stripe vacías:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
MERCADOPAGO_ACCESS_TOKEN=TU_ACCESS_TOKEN
MERCADOPAGO_WEBHOOK_SECRET=TU_SECRETO_DE_WEBHOOK
MERCADOPAGO_MODE=test
FRONTEND_URL=https://abc.ngrok-free.app
```

Reinicia el backend después de editar `.env`. Debe indicar `Pagos: Mercado Pago (test)` al arrancar. `MERCADOPAGO_MODE` se declara según la sección del panel de la que copiaste el token; no se puede deducir del prefijo. Tras validar las pruebas, activa **Credenciales de producción** en la aplicación (Mercado Pago te pedirá rubro y sitio web). En el despliegue de producción cambia a `MERCADOPAGO_MODE=live`, copia el Access Token productivo, registra una URL HTTPS de producción para el webhook y configura el dominio público real en `FRONTEND_URL`. En producción el servidor exige una pasarela y un secreto de webhook; nunca usa el simulador. No compartas el Access Token ni el secreto por chat, frontend o Git.

## Qué ocurre al pagar una torta

- **Torta de catálogo:** una order de Mercado Pago por el total.
- **Diseño especial aprobado:** una order por el anticipo del 50 % y otra por el saldo del 50 %. Cada una tiene referencia e idempotencia independientes.
- La order de Checkout Pro dura 30 minutos. La reserva inicial dura 15 minutos, pero permanece vigente hasta cinco minutos después del vencimiento de la order. Antes de liberarla, el backend consulta a Mercado Pago: un pago acreditado confirma el pedido y uno todavía en proceso mantiene la reserva.
- El retorno a DulceFlow y una tarea periódica también consultan la order para recuperar acreditaciones si el webhook se retrasa o falla. Un intento rechazado deja el pedido pendiente hasta que venza la reserva, para que el cliente pueda reintentar sin duplicar pedidos.
- El webhook valida `x-signature`, `x-request-id` y `data.id`; después consulta la order en Mercado Pago. Solo `processed` con `accredited`, importe completo y moneda coincidente acredita el pago local.
- Los pagos de tipo `ticket` están excluidos para evitar que un pago offline se complete después de vencer la reserva de producción.
- El reembolso se solicita por la API de Orders y queda registrado en DulceFlow con responsable y motivo.

El 15 % de comisión de DulceFlow se calcula y gestiona en **Liquidaciones** para cada pedido cobrado. Checkout Pro acredita el cobro en la cuenta de Mercado Pago conectada; esta integración no hace un reparto automático del 15 %. Para repartir el dinero automáticamente se necesita una integración de marketplace y la autorización de las cuentas participantes, que es un flujo distinto.

## Comprobación antes de publicar

Prueba un pedido completo y otro con anticipo y saldo. En cada caso comprueba la URL de Checkout Pro, el retorno a la app, la llegada del webhook, el importe del pago y el cambio de estado del pedido. Reenvía la misma notificación para comprobar que no se duplica la confirmación. Revisa también un pago rechazado y un reembolso parcial. La API de Orders puede limitar los reembolsos con credenciales de prueba; valida los reembolsos en el ambiente que permita Mercado Pago antes de operar con dinero real.

Documentación oficial: [crear la aplicación y obtener credenciales](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/create-application), [crear una order](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/create-order), [configurar webhooks](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/notifications), [estados](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/payment-management/status/order-status) y [reembolsos](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/refunds-cancellations).
