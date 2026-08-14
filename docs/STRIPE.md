# Stripe en Verde Bowl

La aplicación usa **Stripe Checkout alojado**. React solicita al backend una sesión
de pago y redirige al cliente a Stripe. Por eso:

- la clave secreta vive únicamente en `backend/.env`;
- no se necesita una clave publicable en `frontend/.env`;
- el saldo de un plan se acredita únicamente después de validar el webhook;
- dejar las variables vacías activa el simulador local en desarrollo.

## 1. Pruebas con Stripe

1. Crea o entra a una cuenta de Stripe y trabaja en un sandbox/modo de prueba.
2. En Developers → API keys, copia la clave secreta que comienza con `sk_test_`.
3. Instala Stripe CLI, ejecuta `stripe login` y luego:

   ```bash
   stripe listen \
     --events checkout.session.completed,checkout.session.async_payment_failed,checkout.session.expired \
     --forward-to localhost:4000/api/v1/payments/webhooks/stripe
   ```

4. Copia el `whsec_...` que imprime la CLI y configura:

   ```env
   # backend/.env
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173
   STRIPE_SECRET_KEY=sk_test_REEMPLAZA_CON_TU_CLAVE
   STRIPE_WEBHOOK_SECRET=whsec_REEMPLAZA_CON_EL_SECRETO_DE_LA_CLI
   ```

5. Reinicia el backend después de guardar `.env`. `stripe login` y
   `stripe listen` no recargan las variables de Node. Al iniciar debe aparecer:

   ```text
   Pagos: Stripe (test)
   ```

6. Inicia sesión, abre `/planes`, elige un plan y completa el Checkout de prueba.

> Ejecutar solamente `stripe listen` no reenvía los eventos al backend. El
> listener debe mantenerse abierto con `--forward-to` durante toda la prueba.

Tarjetas interactivas útiles:

| Escenario | Número | Otros datos |
| --- | --- | --- |
| Pago aprobado | `4242 4242 4242 4242` | fecha futura, CVC cualquiera |
| Requiere 3DS | `4000 0025 0000 3155` | fecha futura, CVC cualquiera |
| Fondos insuficientes | `4000 0000 0000 9995` | fecha futura, CVC cualquiera |

Nunca pruebes con tarjetas reales ni con claves `sk_live_`.

## 2. Producción

Stripe Payments solo puede activarse para una empresa establecida en un país
admitido. La empresa debe proporcionar los datos legales y bancarios que Stripe
solicite. No se debe seleccionar un país falso para abrir la cuenta.

En Stripe Workbench/Webhooks crea un endpoint público:

```text
https://api.tudominio.com/api/v1/payments/webhooks/stripe
```

Suscribe estos eventos:

```text
checkout.session.completed
checkout.session.async_payment_failed
checkout.session.expired
```

Configura los secretos en el gestor de variables del hosting, nunca en Git:

```env
NODE_ENV=production
FRONTEND_URL=https://tudominio.com
CORS_ORIGIN=https://tudominio.com
STRIPE_SECRET_KEY=sk_live_REEMPLAZA_CON_TU_CLAVE
STRIPE_WEBHOOK_SECRET=whsec_REEMPLAZA_CON_EL_SECRETO_DEL_ENDPOINT_LIVE
```

El secreto `whsec_...` de Stripe CLI, el de un endpoint de prueba y el de un
endpoint live son diferentes y no se deben intercambiar.

## 3. Verificación

Después de pagar un plan:

1. Stripe envía `checkout.session.completed`.
2. El backend verifica `Stripe-Signature`.
3. `paymentsService` deduplica el evento.
4. El plan pasa de `PENDING_PAYMENT` a `ACTIVE`.
5. La billetera recibe el saldo una sola vez.
6. `/cuenta/saldo` reintenta la consulta brevemente mientras llega el webhook.

Si el Checkout cobra pero el saldo no aparece, revisa primero la terminal de
`stripe listen`, los eventos del Dashboard y que el `whsec_...` corresponda
exactamente al endpoint activo.

Si la aplicación abre `/checkout/simulador`, vuelve a `/planes`, reinicia el
backend y comprueba que el arranque muestre `Pagos: Stripe (test)`. El proveedor
se selecciona al arrancar y no cambia en caliente cuando se edita `.env`.
