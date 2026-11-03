# WhatsApp en Misky Challay

La configuración actual se administra desde **Administrador → Comunicaciones**. Consulta la guía completa de activación y pruebas en [COMUNICACIONES-Y-PRUEBAS.md](./COMUNICACIONES-Y-PRUEBAS.md).

## Atención al cliente

El número de atención se configura en Comunicaciones y aparece en los botones «Consultar por WhatsApp» de pedidos, pagos y diseños. El cliente revisa y envía el mensaje preparado desde WhatsApp.

La bandeja recibe mensajes mediante el webhook firmado de Meta. Incluye historial, búsqueda, atención humana y actualización por eventos con sondeo de respaldo. El menú del bot permite abrir el seguimiento autenticado, consultar instrucciones de pago, horarios y delivery, o solicitar una persona. El bot se pausa al derivar y al tomar una conversación.

## Avisos de pedidos y pagos

Cada evento permite activar correo y WhatsApp por separado. Los pagos directos generan avisos de pendiente, reportado, observado, verificado, rechazado y devolución. También se notifican los estados operativos del pedido y las cotizaciones de diseños.

Los avisos por WhatsApp requieren consentimiento vigente, un número válido y el canal habilitado. El cliente puede desactivarlos desde su pedido o escribir BAJA. ALTA vuelve a permitirlos. El sistema comprueba el consentimiento y el contacto nuevamente antes de enviar.

Una captura o un mensaje no acredita un pago. Caja verifica el movimiento real y el sistema conserva el historial de revisión.

## Configuración y modos

- Se inicia en **modo de prueba** para los avisos operativos. Los registros simulados nunca se transforman en envíos reales al activar la conexión.
- Meta se configura con identificador del número, versión Graph, access token, app secret, idioma, webhook y nombres de plantillas aprobadas.
- Los secretos se guardan cifrados y no se devuelven en las lecturas de configuración. Las variables de entorno antiguas conservan compatibilidad como valores de reserva antes de configurar el panel.
- Todas las plantillas de esta integración usan dos variables de cuerpo: referencia de pedido o solicitud y enlace completo al detalle.
- Las respuestas libres requieren una ventana vigente de 24 horas desde el último mensaje del cliente. Los avisos automáticos utilizan plantillas.
- El estado aceptado por Meta no implica entregado o leído: estos estados se actualizan con sus callbacks.

El historial permite revisar errores y reintentar los avisos fallidos o bloqueados. Si se desconoce el resultado de un envío, se exige comprobar el proveedor antes de repetirlo.

La aprobación de plantillas y el registro del número se completan en Meta. El checklist, las pruebas sin envíos reales y las pruebas de recepción están detallados en la [guía de comunicaciones](./COMUNICACIONES-Y-PRUEBAS.md).
