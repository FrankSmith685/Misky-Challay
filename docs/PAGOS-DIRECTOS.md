# Yape y Plin directos

## Configuración

En **Negocio → Yape y Plin**, el superadministrador configura una cuenta global por método: número, titular y QR opcional. Debe habilitar cada método cuando sus datos reales estén completos. Mercado Pago conserva su flujo de pago en línea.

También se accede desde **Administrador → Yape y Plin → Configurar cuentas**. El checkout presenta Mercado Pago, Yape y Plin como opciones independientes; no ofrece efectivo. Si un método directo está deshabilitado, se muestra como temporalmente no disponible.

Los archivos `frontend/public/images/payments/demo-yape-qr.svg` y `demo-plin-qr.svg` sirven para probar la presentación. Están marcados como demostración y **no son QR de cobro**: el cliente puede transferir al número publicado. Para cobrar con QR, reemplaza su URL por la imagen oficial de la cuenta en la configuración del método.

El plazo para transferir es configurable entre 5 y 120 minutos. El aviso de revisión demorada es independiente: destaca pagos para caja, sin cancelar los reportados ni los observados. Los datos del destinatario y los plazos quedan congelados en cada pago.

## Cliente

1. Confirma productos, dirección, horario y total en el checkout.
2. Elige Yape o Plin y crea el pedido pendiente. Entonces aparecen importe, titular, número y QR.
3. Transfiere una sola vez y pulsa **Ya pagué**. Reporta referencia, nombre del pagador, fecha e importe. Celular y captura son opcionales.
4. Consulta el estado en **Mis pedidos**. Si caja solicita una corrección, modifica el reporte del mismo pago.

Una captura o un reporte no confirma el cobro. El pedido avanza después de la verificación de caja. En tortas con anticipo, se cobra primero el anticipo; el saldo tiene su propio pago e historial. El historial de los pagos anteriores continúa accesible.

## Caja y administración

La pantalla **Yape y Plin** permite filtrar por sede, método, estado y pedido o cliente. Requiere `payment.verify` o `payment.refund`; el backend comprueba además el alcance de sucursal.

- **Confirmar ingreso:** requiere verificar el movimiento y el importe exacto en la cuenta real. Confirma el pago total, anticipo o saldo correspondiente.
- **Solicitar corrección:** registra un motivo visible para el cliente y conserva las reservas.
- **Rechazar reporte:** registra el motivo. Si el pedido esperaba su primer pago, cancela y libera sus reservas.
- **Pago tardío recibido:** permite registrar un ingreso fuera del plazo para verificarlo. Un pedido cancelado permanece cancelado; el dinero verificado aparece pendiente de devolución.
- **Registrar devolución:** disponible con `payment.refund`. Se usa después de devolver realmente el dinero, con importe, referencia y motivo. No ejecuta una transferencia. Permite devoluciones parciales hasta el importe disponible.

Cada acción conserva actor, fecha, motivo y datos declarados. Las imágenes se sirven mediante endpoints autenticados al dueño del pedido o al personal autorizado de la sede; los listados e historiales no incluyen sus bytes. Las aprobaciones y devoluciones bloquean las filas para impedir duplicados y exceso de reembolso. Un ingreso duplicado de saldo se registra como dinero por devolver, sin cobrar dos veces la deuda de la torta.

## Esquema y verificación

La migración `0051-direct-mobile-payments.ts` agrega plazos, datos del reporte, el estado `OBSERVED` y la tabla `mobile_payment_events`. Se aplica con el migrador habitual antes de arrancar la nueva versión del backend.

Pruebas específicas:

- `backend/src/tests/directPayments.test.ts`: estados, validación, acceso, repetición, correcciones y devoluciones.
- `backend/src/tests/checkout.validation.test.ts`: creación del pedido antes de reportar.
- `backend/scripts/verify-direct-payments.ts`: verificación transaccional contra una base local; revierte todos sus datos de prueba y no ejecuta notificaciones posteriores al commit.
- `e2e/direct-payments.spec.ts`: cliente en móvil, reanudación, corrección y revisión con devolución desde el panel, usando APIs simuladas.
