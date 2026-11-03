# Contacto inicial y agradecimiento

## Flujo del pedido

1. **Recibido, pendiente de pago.** Se informa que el pedido fue registrado y se ofrece coordinar diseño, referencias y entrega/recojo. No se afirma que el pago o la preparación estén confirmados. Yape/Plin utilizan el aviso de pago pendiente que ya se genera en su transacción; no se duplica con otro correo de recepción.
2. **Confirmado.** Se confirma el pago o anticipo según corresponda y se ofrecen los canales para coordinar. El aviso conserva su utilidad si el pedido ya pasó a preparación, listo o reparto mientras esperaba en cola. No se envía una confirmación atrasada después de entregar, cancelar o reembolsar.
3. **Preparación, listo y reparto.** Se mantienen los avisos de avance pertinentes al estado vigente.
4. **Entregado.** Se agradece: «Gracias por confiar en Misky Challay». El agradecimiento no se programa antes de marcar el pedido como entregado.

El equipo recibe un aviso de pedido nuevo y otro al confirmar para coordinar con el cliente. La notificación abre la ficha del pedido mediante el parámetro `pedido`, conservando el alcance de sucursal.

## Coordinación por el equipo

En **Pedidos → Ver detalles → Contacto y entrega** hay enlaces de WhatsApp, correo y llamada, disponibles desde el inicio. El texto inicial propone revisar diseño, referencias y entrega/recojo; no agradece una entrega aún pendiente.

La ficha permite **Registrar contacto realizado**, indicando canal y acuerdos. Abrir WhatsApp o un borrador de correo no marca automáticamente al cliente como contactado. El equipo registra el contacto después de realizarlo. El tablero muestra «Contacto inicial pendiente» para los pedidos web activos que todavía no tienen registro.

Se conserva fecha del servidor, actor, canal y acuerdos en `orders.customer_contact_json`, con registro de auditoría. El endpoint requiere lectura de pedidos y permiso para actualizar estados o atender comunicaciones, además de alcance sobre la sucursal. Un reintento devuelve el registro original. Las notas internas no se incluyen en las respuestas de pedidos de la cuenta del cliente.

La migración `0063-order-customer-contact.ts` ya está aplicada en la base local. En otros entornos debe ejecutarse antes de iniciar esta versión.

## Correo y WhatsApp

Los correos iniciales incluyen canales para coordinar y el correo de entrega incluye el agradecimiento. Los eventos se gestionan en **Comunicaciones → Configuración**, donde se puede personalizar el correo y consultar/copiar el texto sugerido de las plantillas de WhatsApp de recepción, confirmación y entrega.

WhatsApp conserva el consentimiento del pedido y la comprobación de BAJA. Los envíos automáticos usan la plantilla configurada para cada evento, con dos parámetros: número de pedido y enlace al detalle. El contenido aprobado en Meta debe corresponder al evento; guardar el nombre de una plantilla no modifica su texto en Meta. El texto de referencia queda también registrado en la cola de comunicaciones.

Estado local consultado durante esta implementación: SMTP configurado y correo habilitado; WhatsApp desactivado, sin conexión y sin plantillas de confirmación/entrega configuradas. No se cambiaron las credenciales ni se enviaron mensajes reales durante la verificación.

## Verificación

Se prueban el momento del agradecimiento, la continuidad del aviso inicial al comenzar cocina, los estados que descartan mensajes obsoletos, el consentimiento, la idempotencia del registro y los permisos por sucursal. Las pruebas de navegador comprueban los enlaces, la apertura desde la notificación y el registro explícito de la coordinación.
