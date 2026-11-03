# Cajas mensuales por suscripción

El nuevo producto es una caja de postres con cobro mensual recurrente. Cada cuota pagada habilita **una caja**, que el cliente programa para recojo en su sucursal. No acredita saldo a la billetera. Las recargas antiguas ya no se venden; el saldo comprado antes sigue disponible en «Mi saldo».

## Cajas iniciales

El bootstrap crea estas cajas en Miraflores cuando existen las presentaciones del catálogo indicadas. El Superadmin puede editar contenido, precio, sucursales y cupos sin que el bootstrap revierta sus cambios. Los precios incluyen un descuento aproximado del 5 % respecto a comprar las presentaciones por separado.

| Caja | Contenido mensual | Precio |
| --- | --- | ---: |
| Caja Dulce | Mini alfajores de manjar y brownies de almendras sin azúcar | S/ 57 |
| Caja Compartir | Mini alfajores, trufas de cacao y brownies de almendras | S/ 91 |
| Caja Celebración | Mini alfajores, trufas, turrón de Doña Pepa, turrón de almendras y una fatia de chocolate | S/ 150 |

## Configuración

1. En Superadmin → Suscripciones, crea una caja, agrega presentaciones de postres o bocaditos, precio mensual, sucursales, anticipación y cupos. Déjala en borrador hasta verificar su contenido y precio.
2. Configura `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_MODE` y la URL pública real `FRONTEND_URL` en `.env.docker` (o en el entorno del backend fuera de Docker). Los valores vacíos desactivan la contratación. No publiques tokens en el repositorio.
3. En Mercado Pago, registra `POST https://TU_API/api/v1/payments/webhooks/mercadopago` para los eventos `subscription_preapproval`, `subscription_authorized_payment` y `payment`. Usa el mismo secreto de firma configurado en el backend. El servidor concilia las suscripciones de nuevo cada 30 minutos.
4. Ejecuta la migración `0047-monthly-subscriptions` con el procedimiento habitual del proyecto y publica la caja desde Superadmin. La web abre «Cajas mensuales» y la app móvil «Suscripciones».

## Reglas operativas

- Cada cliente acepta explícitamente el cobro recurrente y escoge la sucursal antes de abrir Mercado Pago. El contrato conserva precio, contenido, sucursal y anticipación vigentes al contratar. Editar un plan afecta solo a contratos nuevos.
- La caja se habilita al verificar una factura y su pago aprobado, con la moneda e importe esperados. El retorno del navegador o de la app no concede una caja por sí mismo. La factura se registra una sola vez.
- El cliente puede programar un recojo por cuota pagada, dentro de la vigencia de esa cuota, respetando la anticipación, el cupo diario del plan y la disponibilidad del horario. El canje crea un pedido pagado que entra al flujo de cocina e inventario.
- Cancelar detiene los cobros siguientes y conserva las cajas ya pagadas hasta su vencimiento. Una cuenta con renovación activa o cajas pagadas pendientes no se puede eliminar hasta resolverlas.
- Superadmin puede publicar o desactivar cajas, cambiar precio y contenido para nuevas contrataciones, ver suscriptores, conciliar cobros y cancelar renovaciones. Las recargas anteriores están en la ruta histórica `/admin/recargas` para consulta.

## Verificación antes de vender

Usa credenciales de prueba para comprobar autorización, cuota aprobada, cuota rechazada, cancelación, reembolso, canje y retorno móvil. Después configura las credenciales productivas y una URL pública real. Los tests locales verifican el contrato de la API; no sustituyen una prueba de cobro real en la cuenta del comercio.

API de referencia: [Suscripciones](https://www.mercadopago.com.pe/developers/es/reference/online-payments/subscriptions/overview), [facturas](https://www.mercadopago.com.pe/developers/es/reference/online-payments/subscriptions/get-authorized-payment/get).
