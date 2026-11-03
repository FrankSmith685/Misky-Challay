# Comunicaciones: WhatsApp, correo y pagos

## Estado inicial de esta instalación

- Migración `0053-communications-and-whatsapp.ts` aplicada a la base local.
- Atención por WhatsApp: **926749330**. Es independiente de las cuentas de cobro Yape/Plin, aunque actualmente usan el mismo número.
- **Comunicaciones activas en modo de prueba**: los nuevos avisos operativos se registran como simulados y no contactan con destinatarios reales.
- El bot es un menú de opciones configurable; no utiliza un modelo de IA ni aprueba transferencias.
- Faltan las credenciales, el registro del número y las plantillas aprobadas de Meta para enviar y recibir WhatsApp real. El sistema no puede crear o aprobar esos recursos por la tienda.
- Hay configuración SMTP previa. La recepción de correos reales debe comprobarse con un buzón al que tengas acceso.

Los correos de recuperación de cuenta, reclamaciones y el botón explícito de prueba SMTP conservan su entrega directa. El modo de prueba de Comunicaciones se aplica a la nueva cola de avisos operativos y a las conversaciones de prueba.

## Pantallas del administrador

En **Administrador → Comunicaciones**:

| Sección | Uso |
| --- | --- |
| Conversaciones | Recibir mensajes, tomar una conversación, responder y devolverla al bot. |
| Historial de envíos | Consultar canal, destinatario, estado, intentos y errores. Reintentar después de corregir la causa. |
| Probar el flujo | Simular un cliente y registrar pruebas de correo o WhatsApp. |
| Configuración | Gestionar modo de prueba, conexión Meta, bot, horario, eventos y plantillas. |

El superadministrador configura las conexiones y ejecuta pruebas. Un operador puede recibir los permisos **Consultar conversaciones y avisos** y **Atender conversaciones y reintentar avisos**, asignados con alcance global. La cuenta central puede contener consultas de varias sedes; las asignaciones limitadas a sucursales no habilitan esta bandeja. La revisión financiera conserva los permisos y restricciones de sede de Yape/Plin.

Las conversaciones se actualizan mediante una conexión de eventos autenticada. El panel también consulta cambios cada diez segundos como respaldo si el proxy interrumpe la conexión o si el cambio proviene de otra instancia. El personal debe volver a iniciar sesión después de cambiar sus permisos.

## 1. Probar el bot sin enviar WhatsApp

1. En **Configuración**, conserva activados **Activar comunicaciones**, **Modo de prueba** y **Bot de opciones**.
2. Abre **Probar el flujo**.
3. Escribe un celular de prueba y el mensaje `hola`. Pulsa **Simular mensaje**.
4. Se abrirá la conversación marcada como **Prueba**. Deben aparecer el mensaje del cliente y el menú del bot, con estado **Simulado · sin envío real**.
5. Regresa a **Probar el flujo** y usa el mismo número para probar:
   - `1`: enlace a los pedidos; requiere iniciar sesión para consultar información privada.
   - `2`: instrucciones para pagar y reportar Yape/Plin desde la web.
   - `3`: información de delivery y horario configurado en Lima.
   - `4`: derivación al equipo. Se pausa el bot y se genera una alerta interna.
6. En la bandeja pulsa **Tomar conversación**, escribe una respuesta y pulsa **Enviar respuesta**. La respuesta quedará en cola y luego simulada.
7. Un nuevo mensaje del cliente no debe recibir respuesta del bot mientras la conversación siga en atención humana. **Devolver al bot** restablece el menú.
8. Simula `BAJA`: se bloquean nuevos avisos y respuestas al destinatario. `ALTA` permite mensajes nuevamente y devuelve la conversación al bot.

Las conversaciones simuladas y reales tienen identidades separadas, incluso si usan el mismo celular. Una conversación simulada nunca se convierte en real por desactivar el modo de prueba.

## 2. Probar Yape y Plin con avisos

1. Mantén **Modo de prueba** activo en Comunicaciones.
2. En **Datos del negocio → Correo y avisos**, activa los avisos de pedidos, correo, campana y WhatsApp que quieras comprobar. Guarda los cambios. Esto no envía WhatsApp real mientras Comunicaciones continúe en modo de prueba.
3. En Comunicaciones → Configuración → **Avisos por evento**, habilita los canales de pago pendiente, reportado, observado, aprobado, rechazado y devolución según el flujo que quieras probar.
4. Con una cuenta de cliente, crea un pedido, elige Yape o Plin y acepta los avisos por WhatsApp si quieres probar ese canal. Sin consentimiento no debe generarse WhatsApp para el pedido.
5. El pedido debe quedar **pendiente de pago** y mostrar importe, destinatario y QR. El QR de demostración no cobra dinero.
6. Para comprobar solo el sistema usa datos de prueba y reporta una operación ficticia; no necesitas transferir dinero. Esta simulación financiera se revisa manualmente: no la confundas con un cobro real.
7. En **Administrador → Yape y Plin**, verifica que aparezca el reporte y la alerta para caja.
8. Solicita una corrección con un motivo. El cliente debe ver la observación y poder corregir el mismo pago sin realizar otra transferencia.
9. Vuelve a enviar el reporte desde la cuenta del cliente. En el panel aprueba **solo el pedido identificado como prueba** para recorrer la confirmación. Para operaciones reales verifica primero el movimiento en la cuenta de cobro.
10. En Comunicaciones → Historial de envíos comprueba los avisos. Los de prueba deben decir **Simulado**, y los avisos ya desactualizados pueden decir **Omitido**: por ejemplo, unas instrucciones de pago pendientes no se envían después de que el cliente reportó la operación.

El aviso superior del cliente muestra **Pago en revisión** al reportar y **Corrección solicitada** cuando caja observa. No debe seguir llamando «sin pagar» a un pago reportado. Los anticipos indican el importe recibido y el saldo pendiente; confirmar un pedido programado no significa que ya esté en cocina.

La preparación y los estados posteriores pueden probarse desde sus pantallas operativas. Un rechazo cancela un pedido que esperaba su primer pago y libera sus reservas. Un ingreso verificado después de cancelar no reabre el pedido. Una devolución registrada describe una transferencia realizada fuera de la web; el sistema no transfiere dinero.

## 3. Probar el correo

### Sin envíos reales

En **Comunicaciones → Probar el flujo**, con el modo de prueba activo, escribe un correo y pulsa **Simular correo**. Comprueba el registro en Historial de envíos.

### Recepción real

1. Configura servidor, puerto, seguridad, usuario, contraseña y remitente en **Datos del negocio → Correo y avisos**.
2. Usa un buzón real al que tengas acceso, no solo las credenciales de comprador de prueba de una pasarela.
3. Puedes usar **Guardar y enviar correo real de prueba** en esa pantalla para verificar SMTP de manera explícita.
4. Revisa la bandeja de entrada y spam. Que SMTP acepte el mensaje no demuestra que llegó al buzón.
5. Para probar avisos reales de pedidos, desactiva el modo de prueba de Comunicaciones y crea un evento nuevo. Los registros creados como simulaciones nunca se reenviarán como reales.

## 4. Activar WhatsApp real

1. Prepara la cuenta de WhatsApp Business Platform y registra el número de atención en Meta.
2. En Comunicaciones → Configuración guarda:
   - Identificador del número de Meta, que es distinto del celular.
   - Versión Graph de tu aplicación.
   - Access token con permisos sobre ese número.
   - App secret de la misma aplicación.
   - Idioma de las plantillas.
3. Pulsa **Verificar conexión con Meta**. La consulta no envía mensajes; confirma el número registrado y avisa si no coincide con el número de atención configurado.
4. Copia la **URL del webhook** y el **token de verificación** mostrados en la pantalla. La URL debe ser HTTPS pública y llegar a `/api/v1/communications/webhook` del backend. Si web y API usan dominios distintos, utiliza el dominio público de la API.
5. Configura el webhook en Meta y suscribe el campo `messages`. El backend comprueba el desafío GET y valida las firmas de los POST con el app secret.
6. Crea y aprueba las plantillas de los eventos que habilites, en la categoría que corresponda según Meta. Todas las plantillas de esta integración usan **dos variables de cuerpo**: número de pedido o solicitud, y enlace completo a su detalle. No asumas que un mensaje para recuperar una compra se aprobará como utilidad.
   - Pendiente: `Tu pedido {{1}} espera el pago. Consulta el importe y los datos para transferir en {{2}}.`
   - Recordatorio: `Tu pedido {{1}} sigue pendiente. Revisa su estado en {{2}}. Si ya transferiste, reporta tu operación en el pedido; no vuelvas a transferir.`
   - Intento no completado: `El intento de pago de tu pedido {{1}} no se completó. Revisa su estado y las opciones disponibles en {{2}}. Si ves un cargo en tu cuenta, contacta con la tienda antes de volver a pagar.`
   - Vencido: `Venció el plazo de pago de tu pedido {{1}} y fue cancelado. No pagues usando sus datos anteriores. Consulta el detalle en {{2}}. Si ya transferiste, contacta con la tienda.`
   - Reportado: `Recibimos el reporte de pago de tu pedido {{1}}. Está en revisión; no vuelvas a transferir. Revisa el estado en {{2}}.`
   - Observado: `Hay una observación en el pago de tu pedido {{1}}. Consulta el motivo y corrige tu reporte en {{2}}.`
   - Verificado: `Verificamos el pago reportado para tu pedido {{1}}. Consulta el importe recibido y el saldo, si corresponde, en {{2}}.`
   - Listo: `Tu pedido {{1}} está listo. Consulta la entrega o el recojo en {{2}}.`
7. Escribe el nombre exacto aprobado para cada evento en Comunicaciones. La aprobación y los cambios de texto de las plantillas de WhatsApp se gestionan en Meta.
8. Activa **Avisos por WhatsApp** en Correo y avisos. Mantén el consentimiento opcional en el checkout.
9. Desactiva el modo de prueba y guarda. Los nuevos eventos podrán generar envíos reales según sus interruptores.
10. Usa un destinatario que haya aceptado la prueba, distinto del número emisor. **Probar el flujo → Enviar WhatsApp real de prueba** usa la plantilla de pedido confirmado con referencia `PRUEBA`; esa plantilla debe estar configurada y aprobada.
11. Desde ese celular escribe al número de atención. La conversación real debe aparecer en la bandeja. Prueba el menú y la atención humana.

Fuera de las 24 horas desde el último mensaje del cliente, la bandeja no permite respuestas libres. Los avisos automáticos usan plantillas. El bot orienta al cliente hacia el seguimiento autenticado y no entrega detalles privados de sus pedidos por una coincidencia de teléfono.

## Historial y reintentos

| Estado | Interpretación |
| --- | --- |
| En cola / Enviando | Aviso pendiente o en proceso. El trabajo revisa la cola aproximadamente cada diez segundos. |
| Simulado | Registro de prueba. No hubo entrega al proveedor. |
| Aceptado por el proveedor | Meta o SMTP aceptaron la solicitud. No prueba recepción o lectura. |
| Entregado / Leído | Estado informado por el webhook de WhatsApp. Los callbacks repetidos o atrasados no degradan una lectura confirmada. |
| Requiere configuración | Corrige la conexión, canal, consentimiento o ventana según el mensaje mostrado; después reintenta si corresponde. |
| Falló | Error rechazado por el proveedor o reintentos temporales agotados. |
| Resultado por comprobar | Se perdió la respuesta o se interrumpió el proceso durante un envío. Comprueba el historial del proveedor antes de repetir; el panel exige reconocer esta comprobación. |
| Omitido | Evento desactivado, dirección de contacto cambiada, baja o aviso que ya no corresponde al estado actual. |

Los fallos temporales identificados se reintentan hasta cinco veces, con espera creciente. Los resultados inciertos no se reenvían automáticamente. Los eventos usan claves únicas y las filas se reservan con bloqueo para evitar que dos trabajadores procesen el mismo aviso.

Los secretos de Meta y SMTP se almacenan cifrados. Los endpoints de lectura no devuelven access token ni app secret. El token de verificación del webhook solo se muestra al superadministrador y puede regenerarse.

## Recordatorios de pedidos sin completar el pago

En **Comunicaciones → Configuración → Recordatorios y seguimiento de pagos** activa **Recordar pagos pendientes**, elige la espera (1–60 minutos; 5 por defecto) y guarda. Solo se consideran pedidos registrados después de esa activación. Desactivar y volver a activar inicia un período nuevo. No se modifica el modo de prueba ni se contactan pedidos antiguos.

En **Avisos por evento → Pagos** configura los canales, texto de correo y plantilla de WhatsApp de:

- **Recordatorio de pago pendiente**: como máximo uno por pedido y canal, incluso si el cliente abre varios intentos. El proceso revisa cada minuto; la cola se procesa cada diez segundos.
- **Intento de pago no completado**: se genera a partir de un rechazo verificado de la pasarela, mientras el pedido continúe vigente. Cerrar una pestaña no demuestra un rechazo.
- **Plazo de pago vencido**: informa que el pedido fue cancelado por vencimiento y que no debe pagarse con sus datos anteriores. Sustituye el aviso genérico de cancelación en ese caso.

El servidor comprueba el estado antes de programar y antes de enviar. No recuerda pedidos pagados, cancelados, devueltos, pagos en proceso o transferencias ya reportadas —incluidas las observadas por caja—. Si no puede comprobar la pasarela, aplaza el envío. El recordatorio no amplía la reserva y se omite cuando queda un minuto o menos para vencer. Una espera superior al plazo del pedido no produce recordatorio.

Todos los enlaces abren el detalle autenticado del pedido: no crean cobros ni reabren un enlace caducado. En Yape/Plin el mensaje indica que, si el cliente ya transfirió, debe reportar su operación y no transferir otra vez. Las nuevas opciones se guardan en la configuración JSON existente y no requieren otra migración.

**Prueba recomendada sin envíos reales:**

1. Mantén **Modo de prueba** y los avisos de pedidos activos. Activa el recordatorio con espera de **1 minuto**, habilita correo para ese evento y guarda.
2. Crea un pedido nuevo como cliente y selecciona Yape o Plin. Déjalo pendiente, sin reportar una operación.
3. Espera entre uno y dos minutos más el procesamiento de la cola. En **Historial de envíos → Tipo de aviso → Recordatorio de pago pendiente** debe aparecer **Simulado**. No llega un correo o WhatsApp real en este modo.
4. Espera otro intervalo: no debe crearse otro recordatorio para ese pedido y canal.
5. Crea otro pedido y reporta la transferencia antes del minuto. No debe recibir recordatorio; el aviso correspondiente será el de pago en revisión. Usa únicamente datos de prueba en modo de prueba y no apruebes un ingreso real sin comprobarlo.
6. Para comprobar el correo real, desactiva el modo de prueba explícitamente, usa una cuenta y un buzón propios y crea otro pedido después de guardar. WhatsApp real requiere además Meta, consentimiento y la plantilla aprobada del evento.

Para probar rechazo de Mercado Pago usa el entorno de prueba del proveedor. Para vencimiento, deja vencer un pedido de prueba sin pagar ni reportar: recibirá el evento de plazo vencido, sin duplicar «Pedido cancelado».

## Verificación automatizada

- `backend/src/tests/communications.test.ts`: firma, horarios, ventana, estados, consentimiento, simulación, formatos Meta y aceptación SMTP con transportes simulados.
- `backend/src/tests/paymentReminders.test.ts`: activación, tiempos, idempotencia, conciliación y supresión de recordatorios resueltos o reportados, sin red ni cambios en la base.
- `backend/scripts/verify-payment-reminders.cjs`: comprueba la consulta real en MySQL, filtros UTC, exclusión de transferencias observadas y pagos acreditados, claves únicas y vencimiento sin aviso duplicado. Después de `npm run build -w backend`, ejecuta `node backend/scripts/verify-payment-reminders.cjs`. Solo admite la base local de desarrollo, bloquea envíos y revierte sus datos.
- `backend/scripts/verify-communications.ts`: flujo transaccional en MySQL, bot, atención humana, bajas, callbacks adelantados, webhook firmado y permisos. Revierte sus datos y bloquea conexiones externas.
- `backend/scripts/verify-direct-payments.ts`: revisión, anticipo, saldo, ingreso tardío, devolución y persistencia de avisos en la misma transacción del pago. Revierte sus datos.
- `e2e/communications.spec.ts`: bandeja móvil/escritorio, configuración, permisos, reintentos y franja de estado del cliente, con APIs simuladas.

Para otras instalaciones, aplica primero las migraciones habituales con `npm run db:migrate -w backend`. Las nuevas cuentas de atención y credenciales se configuran desde el panel. Esta guía no implica que se haya realizado una transferencia o un envío real de prueba.
