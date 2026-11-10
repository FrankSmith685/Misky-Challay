# Auditoría de la experiencia del cliente

Fecha: 2 de noviembre de 2026.

## Alcance y evidencia

Revisión de los recorridos y servicios principales de la web, sus contratos con el backend y las diferencias relevantes de la app móvil. Incluye catálogo, ubicación, personalización, cotizaciones, carrito, acceso, checkout, pagos, pedidos, cancelaciones, suscripciones, cuenta y posventa.

Se inspeccionó el código actual después de las mejoras de tiempo real, términos, imágenes del pedido y contacto inicial. Se hicieron dos reproducciones en Chrome con respuestas de API simuladas. No se crearon pedidos reales, no se enviaron mensajes y no se modificó código de la aplicación durante esta revisión.

Los hallazgos estáticos indican una condición observable en el código; no equivalen a haber reproducido todos los escenarios contra servicios externos. Las propuestas de nuevas funciones se identifican por separado.

## Recorridos revisados

| Recorrido | Base que ya existe | Pendiente principal |
| --- | --- | --- |
| Inicio y guía de compra | Contenido y preguntas frecuentes en la guía | Explicar disponibilidad antes de una personalización larga. |
| Catálogo y detalle | Disponibilidad por sede y actualizaciones de catálogo/inventario | Actualizar también las referencias de precio guardadas en favoritos y carrito. |
| Ubicación, direcciones y cobertura | Dirección precisa, cobertura, sede y recojo | Mantener el mismo criterio de disponibilidad en web y app. |
| Torta configurable | Tamaño, sabores, opciones, descripción y precio | Datos estructurados del acabado y alérgenos de la combinación efectiva. |
| Referencia, IA y 3D | Referencia y propuesta guardadas con el pedido; galería privada en web y cocina | Repetición del pedido, consulta móvil y guardado duradero del borrador. |
| Diseños especiales | Solicitud, referencias, cotizaciones por versión y aceptación | Reutilizar esta trazabilidad para los acuerdos posteriores de otros pedidos. |
| Carrito | Edición, cantidades, quitar/deshacer y persistencia local | Evitar pérdidas al volver de un pago y advertir fallos de persistencia. |
| Registro, acceso y recuperación | Retorno al recorrido de compra y aislamiento de sesión | Como evolución, verificar el contacto del cliente sin añadir obstáculos innecesarios a la compra. |
| Checkout | Recotización del servidor, comprobante, franjas y aceptación versionada | Reintento ante respuesta incierta y consistencia de alérgenos. |
| Pago online | Webhook, conciliación, reanudación y pago de saldo | Corregir los accesos secundarios que aún usan enlaces caducados. |
| Yape y Plin | Pedido y pago directo persistidos; flujo web de reporte y revisión | Adaptar la app al flujo actual y al importe del anticipo. |
| Confirmación | Consulta del estado real del pedido | No borrar una compra nueva al consultar una confirmación anterior. |
| Mis pedidos y detalle | Historial paginado, seguimiento, errores recuperables e imágenes en web | Repetición completa, cambios solicitados y devoluciones visibles. |
| Cancelación | Reglas del servidor, liberación de reservas y devolución según medio | Mostrar elegibilidad, confirmar la acción y comunicar la devolución pendiente. |
| Boleta y factura | Datos fiscales y descargas en el detalle | Mantener su estado en una ficha financiera clara junto a pagos y devoluciones. |
| Experiencia QR | Revisión, aprobación y versiones desde el pedido web | Incorporarla a la consulta móvil si se desea ofrecer el mismo recorrido allí. |
| Cajas mensuales | Autorización recurrente, ciclos pagados, programación y cancelación de renovaciones | Condiciones publicables con evidencia del texto aceptado. |
| Favoritos y combinaciones guardadas | Favoritos locales y combinaciones guardadas en cuenta | Sincronización y adaptación del lenguaje al catálogo de pastelería. |
| Perfil y preferencias | Datos, contraseña, avatar y preferencias alimentarias | Corregir textos dañados y hacer visible el fallo de carga de preferencias. |
| Avisos y contacto | Campana persistente, avisos por estado y contacto inicial registrado por el equipo | Preferencias de canales y completar la configuración real de WhatsApp. |
| Opiniones y reclamos | Reseñas de compras entregadas; registro y consulta del reclamo formal | Atención cotidiana por pedido y seguimiento de acuerdos sin obligar a usar un reclamo formal. |

## Correcciones encontradas

### C01 — Reintento de compra después de perder la respuesta

**Prioridad: inmediata. Web. Reproducido en navegador.**

`frontend/src/features/checkout/pages/CheckoutPage.tsx:697` renueva la clave de idempotencia ante cualquier excepción. Una respuesta perdida no demuestra que el servidor haya rechazado o revertido el pedido. Si el primer pedido ya quedó creado, el siguiente clic puede crear otro porque envía una clave distinta.

Reproducción: dos clics de compra, abortando la respuesta de `/checkout/place`, produjeron **dos solicitudes con dos claves distintas** para el mismo carrito. No se ejecutaron escrituras reales en el backend. La reproducción confirma el cambio de clave; la duplicación efectiva depende de que el servidor haya confirmado el primer intento.

**Recomendación:** conservar el intento mientras su resultado sea incierto; consultar o recuperar el pedido asociado antes de abrir otro. Vincular el intento a una fotografía de la compra y distinguir un rechazo definitivo de un fallo de transporte.

**Criterio de cierre:** perder la respuesta después de crear el pedido y pulsar otra vez devuelve el mismo pedido; cambiar el carrito después de un resultado incierto no reutiliza silenciosamente una compra diferente.

### C02 — Una confirmación antigua borra el carrito nuevo

**Prioridad: alta. Web. Reproducido en navegador.**

`frontend/src/features/checkout/pages/CheckoutSuccessPage.tsx:89` ejecuta `clearCart()` cuando el pedido consultado está confirmado, sin comprobar que el carrito pertenezca a esa compra. El callback de reporte de pago directo también contiene un vaciado global en la línea 169.

Reproducción: se abrió la confirmación de un pedido anterior confirmado con una línea diferente en el carrito. El carrito pasó de **una línea a cero**, sin errores de la página.

**Recomendación:** consumir exclusivamente el carrito o las líneas vinculadas al intento confirmado. Reabrir una confirmación, volver desde otra pestaña o reportar un pago anterior debe preservar una compra nueva.

### C03 — Recuperación incompleta de pedidos pendientes

**Prioridad: alta. Web. Evidencia estática.**

`frontend/src/features/checkout/usePendingOrder.ts:47` olvida el pendiente ante cualquier error de consulta, incluyendo un fallo temporal. El hook consulta al montar o cambiar de usuario y no se suscribe a los cambios del pedido. `components/PendingOrderBanner.tsx:36` abre el `checkoutUrl` guardado sin usar `checkoutUrlIsLive`, aunque el detalle y la confirmación sí contemplan su caducidad.

**Recomendación:** conservar la referencia ante fallos transitorios, ofrecer reintento, refrescar con eventos y al recuperar la conexión, y reabrir el pago mediante el servicio que comprueba la vigencia. Evitar afirmar que no hubo cobro cuando todavía se está conciliando un resultado.

### C04 — “Volver a pedir” pierde parte del diseño

**Prioridad: alta. Web. Evidencia estática.**

`frontend/src/features/orders/hooks/useReorder.ts:99` reconstruye las selecciones, porciones y temática, pero no copia las indicaciones especiales, la referencia ni la propuesta de IA. Las cotizaciones especiales se excluyen correctamente, aunque el aviso las presenta como productos que ya no están disponibles.

**Recomendación:** permitir elegir entre repetir también el diseño o conservar solo la combinación. Recuperar los archivos por su acceso autorizado, revisar el mensaje de la torta y recotizar. Para diseños cotizados, ofrecer una nueva solicitud basada en la anterior con un mensaje específico.

### C05 — Cancelación y devolución poco claras para el cliente

**Prioridad: alta. Web y mensajes de la app. Evidencia estática.**

El backend devuelve `refunded` y `refundPending` en `backend/src/modules/orders/orders.controller.ts:114`. La web descarta la respuesta en `frontend/src/features/orders/services/orders.service.ts:52` y muestra únicamente “Pedido cancelado”. El detalle ofrece cancelación por estado, aunque el servidor también comprueba producción iniciada y el límite de cancelación de un anticipo. Su botón cancela directamente, sin confirmación en esa vista. En móvil hay textos que prometen devolución al medio de pago sin distinguir una devolución manual pendiente.

**Recomendación:** devolver elegibilidad y motivo desde el servidor; mostrar la confirmación con el importe y la consecuencia real. Añadir al pedido un resumen de cobros, anticipo, saldo, devoluciones procesadas y pendientes. Distinguir devolución automática, coordinación manual y fallo del proveedor.

### C06 — Alérgenos de la combinación elegida

**Prioridad: alta. Web y backend. Evidencia estática.**

Las opciones de personalización ya incluyen alérgenos propios y de los insumos vinculados (`backend/src/modules/customization/customization.service.ts:252`). Sin embargo, el resumen de `frontend/src/features/cakes/pages/CakePage.tsx:525` recibe los del producto y la temática, sin unir los de las opciones elegidas. Para pedidos normales, `backend/src/modules/checkout/checkout.service.ts:615` también guarda producto y temática; el camino de cotización especial tiene su propio snapshot.

**Recomendación:** calcular en el servidor la unión correspondiente a la receta efectiva y devolver la misma información al constructor, checkout, pedido y cocina. Mantener el aviso sobre contacto cruzado y no presentar una lista vacía como certificación de ausencia.

**Criterio de cierre:** seleccionar o quitar un relleno o adicional con un alérgeno cambia el resumen y la fotografía guardada del pedido de forma consistente.

### C07 — Pago directo móvil anterior al nuevo flujo web

**Prioridad: alta si se utilizará la app. Evidencia estática.**

`mobile/app/checkout/index.tsx:690` exige código de operación antes de crear el pedido. La pantalla muestra “PAGA EL IMPORTE EXACTO” con `quote.grandTotal` en la línea 1369. Para una compra con `DEPOSIT_BALANCE`, eso no representa el anticipo que corresponde al primer pago, aunque el resumen reconoce por separado el anticipo y el saldo.

**Recomendación:** crear primero el pedido con sus reservas y su importe exigible; después mostrar el QR o número y permitir reportar la operación. Reutilizar la semántica del pago directo web, incluyendo revisión, observación, expiración y recuperación. Rotular claramente total del pedido, importe a pagar ahora y saldo posterior.

### C08 — Disponibilidad y detalle móvil incompletos respecto a web

**Prioridad: alta si se utilizará la app. Evidencia estática.**

La app consulta franjas generales y filtra anticipación en `mobile/app/checkout/index.tsx:400`; la web utiliza `/checkout/availability` con los productos del pedido. Por tanto, la app puede ofrecer primero una franja que el servidor rechace después por capacidad de producción o transporte. Además, los tipos y la pantalla móvil del pedido no incorporan la galería de `designImages` que ya existe en web y cocina.

**Recomendación:** usar la misma disponibilidad autoritativa y sus motivos en ambos clientes. Añadir las referencias, propuestas y condiciones aceptadas a la consulta móvil; incluir la experiencia QR si se ofrece su compra desde ese canal.

### C09 — Guardado local silencioso y continuidad entre dispositivos

**Prioridad: media. Web. Riesgo condicionado a la capacidad del navegador.**

`frontend/src/lib/storage.ts:11` ignora el fallo de guardado por cuota o almacenamiento bloqueado. El carrito guarda las imágenes como datos y los borradores visuales también utilizan almacenamiento del navegador (`features/cakes/utils/cakeVisualDraft.ts`). Las imágenes ya se conservan en pedidos creados; el riesgo está en el trabajo que todavía no se ha enviado.

**Recomendación:** avisar si no se pudo guardar el borrador. Para continuidad duradera, guardar diseños y carrito en la cuenta y subir archivos privados mediante identificadores, con control de acceso y limpieza de adjuntos abandonados. Sincronizar también favoritos.

### C10 — Precios guardados sin actualización visible

**Prioridad: media. Web. Evidencia estática.**

El carrito es una revisión local y recotiza al entrar al checkout. Favoritos muestra el `priceFrom` guardado (`frontend/src/features/favorites/pages/FavoritesPage.tsx:168`). Los cambios del catálogo no actualizan esa fotografía en ambas vistas.

**Recomendación:** revalidar precios y disponibilidad al recuperar el foco o recibir cambios relevantes, mostrando qué línea cambió antes de continuar. Conservar el diseño si una opción se agota y pedir una decisión explícita sobre su sustitución.

### C11 — Condiciones de suscripción con versión fija en código

**Prioridad: media. Web, app y backend. Evidencia estática.**

El checkout normal ya tiene publicación gestionable y evidencia completa. Las suscripciones siguen utilizando `SUBSCRIPTION_TERMS_VERSION = '2026-10-27'` (`backend/src/modules/subscriptions/subscriptions.service.ts:17`) y guardan versión/fecha, con datos comerciales congelados, pero sin el mismo snapshot completo del texto aceptado. La web enlaza las “condiciones de suscripción” al documento general.

**Recomendación:** publicar condiciones específicas de suscripción desde administración y guardar su texto y versión con cada aceptación. Mostrar importe recurrente, sede, vigencia de cada caja y efectos de cancelar futuras renovaciones en el mismo recorrido.

### C12 — Textos heredados y errores de codificación

**Prioridad: media. Web. Evidencia estática.**

Hay textos visibles de “bowls” y “platos” en favoritos, y mensajes como `Teléfono inválido` en el esquema del perfil (`frontend/src/features/account/pages/ProfilePage.tsx:53`). También quedan ejemplos de comida ajenos a pastelería en el checkout. La carga de preferencias del perfil falla de forma silenciosa, de modo que un error puede parecer una configuración vacía.

**Recomendación:** revisar el lenguaje de las vistas de cuenta, errores y ejemplos; conservar la terminología que corresponda a cada familia real del catálogo. Mostrar un error recuperable al cargar preferencias y evitar que un guardado sobrescriba datos que no se pudieron consultar.

## Funciones que conviene agregar

Son propuestas de producto; no indican que el recorrido existente esté completamente ausente.

| ID | Propuesta | Comportamiento recomendado | Prioridad |
| --- | --- | --- | --- |
| M01 | Comprobar fecha antes de personalizar | Mostrar la primera fecha posible y consultar capacidad con sede, tipo de entrega y combinación inicial. Revalidar al comprar; una consulta no debe prometer una reserva. El constructor avanzado ya consulta franjas; extenderlo al recorrido normal. | Alta |
| M02 | Ficha final de la torta y acuerdos visibles | Campos separados para texto exacto, ocasión, porciones y acabado. Mostrar la referencia y la propuesta como elementos diferentes. Si el equipo acuerda un cambio, publicar una nueva versión para que el cliente la confirme. Las cotizaciones especiales y las experiencias QR ya tienen aceptación; aprovechar ese patrón. | Alta |
| M03 | Solicitud de cambio del pedido | Solicitar fecha, dirección, contacto o detalle con motivo. El negocio acepta o rechaza y el sistema recalcula precio y capacidad antes de confirmar el cambio. Mostrar límites según producción iniciada. | Alta |
| M04 | Atención vinculada al pedido | Consultas, incidencia, estado de atención y resumen de acuerdos para el cliente. Mantener privadas las notas internas del equipo. El WhatsApp actual y el Libro de Reclamaciones formal ya existen y deben conservar su función. | Alta |
| M05 | Preferencias de avisos y entrega de mensajes verificable | Elegir canales disponibles para avisos del pedido y separar promociones. Ya existe desactivación de WhatsApp por pedido; ampliar a preferencias comprensibles y coherentes en web/app. | Media |
| M06 | Posventa y regalos | Instrucciones publicadas por el negocio según producto, acceso a reportar un problema y acceso a la reseña ya existente. Para regalos, distinguir comprador y destinatario, ocultar precios al destinatario y controlar a quién se envían los avisos. | Media |

Como evolución posterior puede mostrarse al cliente evidencia de la entrega y un comprobante de recepción. Ya existen fotos operativas de salida/llegada y nombre de receptor en reparto; actualmente su acceso exige permisos de personal. Cualquier vista para el cliente debe comprobar propiedad del pedido y limitar los datos expuestos. Un mapa con ubicación continua del repartidor requiere un proyecto adicional; no es necesario para cerrar los fallos anteriores.

## Configuración operativa pendiente

La revisión anterior de la configuración local encontró correo habilitado y SMTP configurado, pero WhatsApp deshabilitado, sin conexión y sin plantillas de confirmación/entrega configuradas. Ese estado debe comprobarse de nuevo al preparar el entorno final: código disponible no equivale a mensajes entregados.

Completar conexión y plantillas aprobadas por evento, y validar recepción con destinatarios de prueba autorizados. La evidencia previa de push cubre simulación; falta una verificación real en dispositivo. No se realizaron envíos externos en esta auditoría.

## Orden recomendado

1. **Integridad de compra:** C01, C02, C03, C05 y C06. Si la app se va a publicar, incluir C07 y C08 en este lote.
2. **Diseño y continuidad:** C04, C09, M01 y M02; después M03 y M04 para cambios y atención con trazabilidad.
3. **Coherencia y evolución:** C10, C11, C12, M05 y M06. Completar y comprobar los canales de comunicación antes de anunciarlos como disponibles.

Las verificaciones del primer lote deben cubrir pérdida de respuesta después de confirmar una transacción, retorno de un pedido antiguo con carrito nuevo, enlace de pago caducado, fallo temporal al consultar el pendiente, cancelación con devolución manual, receta con alérgenos en un adicional y pago móvil de solo el anticipo. Las verificaciones de diseño deben cubrir repetición con ambas imágenes y acuerdos versionados.

No se estiman fechas de implementación sin acotar el lote. No se requiere rehacer las funciones ya implementadas: los cambios propuestos completan la continuidad entre sus pasos y canales.
