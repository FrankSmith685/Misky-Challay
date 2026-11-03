# Revisión de lógica, actualización de vistas y notificaciones

Fecha: 2 de noviembre de 2026.

Implementación posterior autorizada: [cambios y verificaciones](implementacion-tiempo-real-y-notificaciones.md). El contenido siguiente conserva el diagnóstico previo a esos cambios.

Esta revisión entrega recomendaciones previas a la implementación. No se modificó el código de la aplicación ni la configuración del negocio. Se consultaron el código, la API local y datos operativos agregados, y se reprodujeron escenarios en Chrome con respuestas simuladas. No se enviaron comunicaciones ni se crearon ventas, cobros o pedidos reales.

## Alcance y evidencia

Se inventariaron 73 archivos de vista de la web y el panel. El inventario incluye pantallas anteriores que no necesariamente siguen conectadas a una ruta. Se cruzaron las rutas actuales con sus lecturas, acciones, permisos, servicios, tareas programadas y mecanismos de actualización. También se revisaron las piezas compartidas de notificaciones y caché de la aplicación móvil.

La revisión de código cubre más situaciones que las comprobaciones dinámicas. No equivale a haber completado los recorridos de las 73 pantallas con todos los roles. Los hallazgos distinguen comportamiento reproducido, incompatibilidades verificables en código y riesgos que necesitan una prueba adicional.

Comprobaciones realizadas:

| Escenario | Resultado |
| --- | --- |
| Editar materiales de una tarea y dejar pasar un refresco de Producción | Se escribió `2.5`; la consulta automática devolvió el campo a `1` sin guardar. Reproducido en Chrome. |
| Abrir Producción con los permisos del rol normal de Cocina | La consulta de responsables recibe 403, el selector queda sin personas y una etapa sin asignar no puede iniciarse. Reproducido en Chrome con la respuesta que exige la ruta real. |
| Reintentar una venta después de perder la primera respuesta | El navegador envía dos claves de idempotencia diferentes. Reproducido con red simulada; no se realizaron ventas reales. |
| Resolver un aviso `PAYMENT_REVIEW_REQUIRED` | `/admin/pagos-directos?pedido=AUDIT-1` termina convertido en `/cuenta/pedidos/AUDIT-1`. Reproducido ejecutando la función actual. |
| Invalidar la caché móvil mientras una lectura sigue pendiente | La lectura anterior vuelve a llenar la caché después de invalidarla. Reproducido de forma aislada con las funciones actuales; pendiente validar el cambio completo de cuenta en un dispositivo. |
| Revisar los tipos de avisos guardados | La base local contiene ocho registros `PAYMENT_REVIEW_REQUIRED`. Esto confirma que se generan avisos que la campana administrativa actual no consulta. No implica que los ocho sigan pendientes de atención. |

## Hallazgos y recomendaciones

### F01. El refresco de Producción borra materiales que se están editando

**Prioridad: alta. Comprobado en navegador.**

Producción vuelve a consultar las tareas cada 30 segundos. Cada respuesta crea objetos nuevos y el formulario vuelve a copiar las cantidades del servidor sobre lo que se está escribiendo. El operario puede perder cantidades usadas y mermas antes de pulsar Guardar.

Evidencia: `frontend/src/features/cakes/pages/AdminCakesPage.tsx:181` y `frontend/src/features/cakes/components/MaterialUsageForm.tsx:12`.

Recomendación: mantener un borrador por tarea y marcarlo como modificado. Actualizar los datos confirmados sin sobrescribir el borrador; si otra persona cambia la misma tarea, mostrar el conflicto y permitir recargar o revisar. Restablecer el borrador después de guardar correctamente o descartarlo expresamente.

Verificación necesaria: escribir materiales, recibir dos actualizaciones automáticas y comprobar que el borrador sigue intacto; guardar y verificar inventario y costo una sola vez.

### F02. El rol de Cocina no puede cargar responsables de producción

**Prioridad: alta. Incompatibilidad de permisos reproducida.**

El tablero solicita `/access/staff`, que exige `user.read`. El rol normal de Cocina tiene `kitchen.read`, `kitchen.operate` e `inventory.read`. El error se ignora y el selector queda vacío. Como iniciar una tarea requiere responsable, una tarea sin asignación queda bloqueada para ese rol.

Evidencia: `frontend/src/features/cakes/components/CakeProductionBoard.tsx:42`, `backend/src/modules/access/access.routes.ts:69`, `backend/src/database/seeders/rbac.seeder.ts:30` y `backend/src/modules/cakes/cakeProduction.service.ts:341`.

Recomendación: ofrecer una lectura específica de personal elegible de la sede, autorizada para la operación de producción y con los datos mínimos necesarios. Filtrar por permisos reales y sede, contemplando roles personalizados. Mostrar el fallo cuando no se puede cargar la lista. Mantener la administración general de usuarios con sus permisos actuales.

Verificación necesaria: Cocina puede asignar una persona elegible de su sede, no puede consultar ni asignar personal ajeno, y un rol de solo lectura no puede modificar tareas.

### F03. El reintento de una venta puede registrarla dos veces

**Prioridad: alta. Cambio de clave reproducido; duplicación real no ejecutada.**

Punto de venta genera `crypto.randomUUID()` dentro de cada intento de cobro. Si el servidor registra la venta y la respuesta se pierde, volver a pulsar Cobrar envía otra clave. El servidor dispone de protección de idempotencia, pero necesita recibir la misma clave para reconocer el reintento.

Evidencia: `frontend/src/features/admin/pages/PosPage.tsx:87` y `backend/src/modules/operations/dining.service.ts:266`.

Recomendación: mantener una clave estable durante la resolución de una misma venta. Ante resultado incierto, consultar o reintentar esa operación antes de permitir iniciar otra. Aplicar el mismo criterio a crear comandas y agregar productos a una mesa, revisando los contratos de esos endpoints.

Verificación necesaria: simular una respuesta perdida después de guardar y confirmar que el reintento recupera una venta, un pago, un consumo y una comanda.

### F04. La campana del panel no consulta los avisos operativos guardados

**Prioridad: alta. Comprobado en código y contrastado con datos locales.**

La campana administrativa consulta hasta 20 pedidos en estados confirmados o posteriores. No consulta la tabla de notificaciones. Por ello no incorpora los avisos de revisión de Yape/Plin ni otros avisos operativos guardados. Además, solo se monta para usuarios con `order.read`; Caja, Compras o Reparto pueden necesitar avisos de su trabajo sin ese permiso.

Evidencia: `frontend/src/features/admin/components/AdminOrderNotifications.tsx:13`, `frontend/src/components/layout/AdminLayout.tsx:303` y `backend/src/modules/communications/paymentNotifications.service.ts:146`.

Recomendación: crear una bandeja operativa persistente por destinatario, permiso, sede y entidad. Incluir pagos por revisar, tareas asignadas o bloqueadas, solicitudes de diseño y repartos, según responsabilidad. Obtener el contador del servidor y conservar los avisos aunque el pedido avance de estado.

Verificación necesaria: reportar un pago y comprobar que aparece para Caja autorizada, que abre el pago correcto y que no llega a una cuenta sin permiso o de otra sede.

### F05. Hay destinos de notificaciones incompletos

**Prioridad: alta. Un destino incorrecto reproducido.**

La función de navegación no reconoce `/admin/pagos-directos`. Cuando el aviso incluye un pedido, usa como respaldo el detalle de la cuenta del cliente. Otros destinos descartan parámetros y varias vistas no aplican automáticamente el `branchId` del enlace.

Evidencia: `frontend/src/lib/notificationDestination.ts:16`, `backend/src/modules/communications/paymentNotifications.service.ts:149` y `frontend/src/features/admin/hooks/useActiveBranch.ts`.

Recomendación: mantener un contrato de destinos para web y móvil que identifique entidad, sede y vista autorizada. Conservar los parámetros necesarios para seleccionar el pago, pedido, solicitud o tarea. Si el destinatario perdió acceso, presentar una explicación y un destino accesible.

Verificación necesaria: probar enlaces emitidos por todos los tipos nuevos de aviso con los roles destinatarios, incluyendo enlaces con sede, pedido y solicitud.

### F06. Las funciones nuevas no tienen una cobertura uniforme de avisos

**Prioridad: alta para acciones que esperan una respuesta; media para avisos informativos. Comprobado en los servicios revisados.**

| Flujo | Comportamiento actual | Recomendación |
| --- | --- | --- |
| Diseños a medida | Proponer una cotización llama al aviso por WhatsApp. La solicitud, aceptación y rechazo no tienen una cobertura equivalente de campana y avisos al responsable. | Avisar al equipo de la solicitud y al cliente de cotización/rechazo; avisar al equipo al aceptar. Usar vencimiento y versión para evitar avisos antiguos. |
| Producción de pastelería | Actualización del tablero cada 30 s y recordatorios móviles desde un job horario. | Eventos al asignar, bloquear y resolver una etapa, con destinatario concreto. Separar avisos urgentes de recordatorios. |
| Reparto | El tablero consulta cada 6 s; asignar o reasignar no genera un aviso específico al conductor en el servicio revisado. | Avisar al conductor y al despachador correspondiente al asignar, reasignar o fallar una entrega. |
| Cajas mensuales | Se concilian pagos y se crean mensualidades, pero no se encontró una emisión equivalente de avisos de suscripción activada, cuota habilitada, fallo de cobro o próximo vencimiento. | Añadir esos eventos y enlazarlos con la mensualidad o suscripción concreta. |
| Experiencias QR | Revisión y publicación generan correo y WhatsApp según configuración. No crean el aviso equivalente en campana o push; la respuesta del cliente registra el evento sin avisar al responsable. | Añadir campana y avisos de aprobación/cambios al equipo; mantener coherencia de versión y publicación programada. |

Evidencia: `backend/src/modules/cakes/cakeDesign.service.ts:197`, `backend/src/jobs/index.ts:57`, `backend/src/modules/delivery/delivery.service.ts:181`, `backend/src/modules/subscriptions/subscriptions.service.ts:126` y `backend/src/modules/experiences/experience.service.ts:102`.

Antes de implementar, definir por evento quién necesita actuar, por qué canal y cuándo debe dejar de avisarse. No todos los cambios requieren correo o sonido.

### F07. El historial web del cliente descarta la paginación

**Prioridad: media. Comprobado en el contrato entre cliente y servidor.**

El servidor devuelve pedidos paginados y metadatos. La función web devuelve únicamente `data`, sin permitir solicitar otra página. Por defecto se obtienen 20 pedidos. Los filtros de la pantalla se aplican a ese subconjunto; un pedido programado antiguo puede quedar fuera de las lecturas usadas por el resumen de cuenta y la barra de pedido activo.

Evidencia: `frontend/src/features/orders/services/orders.service.ts:25`, `backend/src/modules/orders/orders.service.ts:439` y `backend/src/config/constants.ts:426`.

Recomendación: paginar el historial y filtrar en el servidor. Consultar pedidos activos de forma explícita para las señales de seguimiento, sin inferirlos de la primera página del historial.

Verificación necesaria: usar más de 20 pedidos, con uno programado entre los antiguos, y comprobar historial, filtros y seguimiento.

### F08. La actualización entre vistas es desigual

**Prioridad: media. Comprobado en las lecturas y mecanismos actuales.**

Cocina y Comunicaciones usan eventos del servidor con sondeo de respaldo. Pedidos, Reparto, Inventario y Salón usan consultas periódicas. Diseños, suscripciones, Caja y varias fichas se actualizan principalmente al abrirse o mediante acciones locales. Una tabla puede mostrar un estado reciente mientras su ficha abierta conserva el anterior.

Evidencia: `frontend/src/features/admin/hooks/useKitchenRealtime.ts`, `frontend/src/features/admin/services/communications.service.ts:120`, `frontend/src/features/admin/components/OrderDetailPanel.tsx:180`, `frontend/src/features/cakes/pages/AccountDesignRequestsPage.tsx:57` y `frontend/src/features/experiences/ExperienceStudioPage.tsx:141`.

Recomendación: acordar qué cambios invalidan cada lectura y propagar esos eventos a todas sus vistas. Compartir peticiones cuando muestran la misma entidad. Recuperar datos al volver a la pestaña o recuperar conexión, mostrar la fecha de actualización y conservar formularios en edición. Utilizar el sondeo como recuperación cuando el canal de eventos se interrumpe.

Verificación necesaria: abrir cliente, Caja, Producción y Reparto en sesiones separadas; completar un flujo y comprobar que sus listas, fichas, contadores y avisos convergen sin recargar manualmente.

### F09. La disponibilidad debe informar la causa y aplicar las mismas reglas en todas las etapas

**Prioridad: media. Limitación funcional comprobada.**

La lista de franjas filtra fechas, cierre de venta, cupo general y, para autos, flota y cupo de auto. La anticipación se filtra en el navegador y la capacidad específica de producción se valida por separado. Un resultado vacío presenta el mismo texto para causas distintas. El generador de franjas no consulta los horarios de atención; las franjas existentes tampoco se ajustan automáticamente al cambiar esos horarios.

Evidencia: `backend/src/modules/geo/geo.service.ts:345`, `backend/src/modules/admin/commercialAdmin.service.ts:679` y `frontend/src/features/checkout/pages/CheckoutPage.tsx:453`.

Recomendación: ofrecer disponibilidad según carrito, modalidad, sede y zona, con causas de bloqueo y alternativas. Definir si la franja debe cumplir el horario de atención o una agenda propia de despacho, y aplicar esa decisión al generar, listar y reservar. Verificar que el horizonte de fechas cubra las anticipaciones permitidas: actualmente se generan 14 días por defecto, mientras tortas y suscripciones permiten reglas de hasta 30 días.

Verificación necesaria: cubrir ausencia de auto, cupo agotado, falta de capacidad en una estación, cierre excepcional, zona incompatible y anticipación superior al horizonte actual.

### F10. Algunas respuestas pueden quedar asociadas a una sede anterior

**Prioridad: alta al operar varias sedes. Riesgo identificado en código.**

La carga de pestañas de Pastelería no descarta respuestas de solicitudes anteriores. Cambiar rápidamente de sede puede dejar que una respuesta lenta vuelva a escribir tareas, diseños o capacidades anteriores. Punto de venta tampoco reinicia su carrito al cambiar de sede y puede conservar productos y precios de la anterior.

Evidencia: `frontend/src/features/cakes/pages/AdminCakesPage.tsx:160` y `frontend/src/features/admin/pages/PosPage.tsx:42`.

Recomendación: asociar los datos a sede, filtros y entidad; descartar respuestas anteriores y deshabilitar acciones mientras cambia la fuente. Mantener el carrito ligado a su sede y pedir resolver sus cambios pendientes antes de cambiarla.

Verificación necesaria: retrasar la respuesta de la sede A, cambiar a B y comprobar que A no reaparece; verificar que ninguna venta en B usa el borrador de A.

### F11. La configuración pública permanece en caché durante toda la sesión de la página

**Prioridad: media. Comprobado en código.**

El cliente conserva los ajustes públicos en memoria sin vencimiento. Guardar desde Superadmin emite un evento de esa ventana, que no actualiza las otras pestañas ni los dispositivos de clientes. Los medios de pago, instrucciones y datos del negocio pueden seguir mostrándose con valores anteriores.

Evidencia: `frontend/src/services/businessInfo.ts:101`.

Recomendación: versionar los ajustes y revalidarlos al recuperar foco o conexión y antes de las acciones que dependen de ellos. Sincronizar pestañas cuando corresponda. Conservar la validación final del servidor y explicar si las condiciones cambiaron durante la compra.

### F12. Abrir la campana marca como leídos avisos que el usuario todavía no vio

**Prioridad: media. Comprobado en código.**

La campana del cliente muestra ocho avisos inicialmente, pero abrirla marca todos como leídos en el servidor. La consulta trae como máximo 50 y no pagina el historial. La campana administrativa utiliza otra marca de lectura guardada en `localStorage`, por lo que no mantiene el mismo estado entre dispositivos.

Evidencia: `frontend/src/components/layout/NotificationBell.tsx:69`, `backend/src/modules/notifications/notifications.service.ts:681` y `frontend/src/features/admin/components/AdminOrderNotifications.tsx:65`.

Recomendación: marcar avisos concretos al abrirlos, ofrecer una acción explícita para marcar todos y obtener del servidor el total de no leídos. Paginar el historial y recuperar el estado si falla una actualización optimista.

### F13. El envío push necesita una recuperación equivalente a la cola de correo y WhatsApp

**Prioridad: media. Comportamiento identificado en código; no se enviaron push reales.**

Correo y WhatsApp disponen de una cola con varios estados. El envío móvil es directo y trata como atendida cualquier clave ya registrada, incluyendo intentos fallidos. La aceptación inicial de Expo se registra como enviada, sin una comprobación posterior equivalente de recepción. Los avisos disparados mediante promesas después de una transacción también pueden perderse antes de guardarse si el proceso termina en ese intervalo.

Evidencia: `backend/src/modules/notifications/mobilePush.service.ts:108`, `backend/src/modules/communications/communications.queue.ts:102` y `backend/src/modules/orders/orders.service.ts:319`.

Recomendación: guardar los eventos que requieren comunicación de forma durable junto con la operación, y procesar cada canal con idempotencia, reintentos acotados y estados claros. Distinguir pendiente, aceptado por el proveedor, entregado, fallido y resultado desconocido cuando el proveedor lo permita. No reenviar a ciegas una operación cuyo resultado externo sea incierto.

### F14. Hay botones y consultas que no coinciden con los permisos requeridos

**Prioridad: media; alta para definir el alcance de los datos. Comprobado en código.**

- Capacidad es visible con permisos de lectura de Cocina o Cobertura, pero presenta acciones de guardar y restaurar que exigen `geo.write`.
- Producción muestra controles de modificación también a quien solo tiene `kitchen.read`.
- Suscripciones muestra Conciliar pagos a lectores, mientras el endpoint exige `plan.manage`.
- Los endpoints administrativos de suscripciones comprueban el permiso, pero no reciben ni aplican un filtro por las sedes del actor. Debe decidirse si esta administración es global o puede delegarse por sede.

Evidencia: `frontend/src/features/cakes/pages/AdminCakesPage.tsx:251`, `backend/src/modules/cakes/cakes.routes.ts:404`, `frontend/src/features/subscriptions/SubscriptionsAdminPage.tsx:130` y `backend/src/modules/subscriptions/subscriptions.routes.ts:40`.

Recomendación: derivar cada acción visible del permiso correspondiente y mantener la autorización real en el servidor. Para operaciones delegadas por sede, aplicar el alcance en la consulta y en la modificación. Para funciones globales, exigir ese alcance expresamente.

Verificación necesaria: probar Superadmin, administrador de sede, Cocina, Caja, Reparto, lector y un rol personalizado con permisos mínimos.

### F15. La caché móvil puede recuperar datos de una sesión ya invalidada

**Prioridad: alta para el uso de cuentas compartiendo dispositivo. Reproducción aislada; falta recorrido en dispositivo.**

Vaciar la caché no invalida las promesas que siguen pendientes. Cuando una lectura termina, vuelve a guardar su respuesta. Varias claves de datos privados no incluyen al titular de la sesión. La protección de generación del cliente móvil se aplica a renovar tokens, pero no descarta todas las respuestas normales de una sesión anterior.

Evidencia: `mobile/src/hooks/useResource.ts:64`, `mobile/src/hooks/useResource.ts:124`, `mobile/src/providers/SessionProvider.tsx:95` y `mobile/src/services/api/client.ts:208`.

Recomendación: incluir identidad o generación de sesión en las claves privadas, invalidar las operaciones pendientes y descartar sus respuestas antes de volver a llenar la caché. Mantener separados los datos públicos que pueden compartirse.

Verificación necesaria: iniciar una lectura con A, salir, entrar con B y resolver después la lectura de A. B no debe ver ni reutilizar datos de A.

### F16. Completar recuperación y autorización de los canales de eventos

**Prioridad: media para reconexión y permisos; posterior para múltiples instancias. Revisión de código.**

Los canales SSE usan `fetch` directo y no comparten la renovación de credenciales del cliente HTTP normal. Cocina mantiene la conexión sin una rotación equivalente a la de Comunicaciones y los permisos se comprueban al conectarse. Los buses de eventos actuales viven en la memoria de un proceso.

Evidencia: `frontend/src/features/admin/hooks/useKitchenRealtime.ts:46`, `backend/src/modules/operations/operations.routes.ts:123`, `backend/src/modules/operations/kitchenEvents.ts:13` y `backend/src/modules/communications/communications.events.ts`.

Recomendación: recuperar credenciales al reconectar, cerrar o revalidar conexiones al cambiar la sesión o los permisos y comprobar el estado tras cualquier corte. Si se despliega más de un proceso, compartir la distribución de eventos entre instancias. Mantener consultas de recuperación para eventos perdidos.

## Revisión por áreas y vistas

Los intervalos indican la configuración del código, no un tiempo de respuesta garantizado. Un intervalo no elimina los retrasos de red ni asegura por sí solo consistencia entre pantallas.

| Área y vistas incluidas | Situación observada | Recomendación |
| --- | --- | --- |
| Inicio, Cómo pedir, catálogo, ficha de producto y Para empresas | Lecturas iniciales y estado local; contenido y disponibilidad pueden cambiar en otra sesión. | Revalidar oferta al recuperar foco y antes de comprar; distinguir borrador, agotado y fuera de cobertura. |
| Crear torta, constructor, vista compartida, referencia 3D y AR | Varias fuentes: catálogo, opciones, perfil, imágenes y disponibilidad. Hay comprobaciones de versiones en partes del flujo. | Mantener una identidad común de configuración, sede y versión; separar el trabajo visual de las validaciones de compra. |
| Carrito y checkout | Cotización y disponibilidad se consultan por separado; las franjas no se recuperan por sí solas tras cambiar flota/cupos desde otro dispositivo. | Aplicar F09 y revalidar al volver a la pantalla; mostrar una acción de actualizar horarios y conservar el carrito. |
| Confirmación, simulador y retornos de pago | Existen rutas de retorno, recuperación de pago y estado pendiente. | Probar respuesta perdida, webhook tardío, regreso sin sesión y reintento del mismo pago sin duplicación. |
| Inicio de cuenta y Mis pedidos | Carga inicial; la lista consume solo la primera página. | F07 y F08: historial completo y fuente explícita de pedidos activos. |
| Detalle del pedido | Sondeo cada 15 s mientras el pedido no es terminal. | Unificar cambios de pago, anticipo/saldo y reparto; proteger contra respuestas tardías y actualizar la ficha coherentemente. |
| Mis diseños | Carga inicial y refresco por acciones propias. | Actualizar al recibir cotización o cambio de solicitud; añadir avisos persistentes. |
| Suscripciones del cliente y Cajas mensuales | Carga inicial, recuperación puntual de autorizaciones pendientes y actualización manual. | Reflejar cobros conciliados, cuotas nuevas, vencimientos y cambios de cupo sin obligar a recargar toda la página. |
| Saldo y planes anteriores | Carga inicial; al volver de comprar un plan se consulta un número limitado de veces. | Revalidar ante movimientos de saldo, devolución y conciliación; distinguir esta billetera de las cajas mensuales. |
| Perfil, direcciones, favoritos, guardados y opiniones | Principalmente formularios y acciones locales. | No requieren avisos continuos por defecto. Propagar cambios que afectan preferencias, dirección de compra o identidad de sesión. Mostrar los fallos de carga. |
| Pedidos del panel y ficha abierta | Lista cada 8 s; la ficha se carga al abrirse o por acciones locales. | Actualizar ambas por la misma entidad y evitar estados contradictorios. |
| Resumen, Caja y rendimiento | Resumen cada 30 s; Caja principalmente al entrar o cambiar filtros. | Actualizar tras cobros, devoluciones y movimientos relevantes; mantener consistentes período y sede. |
| Yape/Plin directos | Lista cada 15 s; el detalle se carga de forma independiente. | F04 y F05; refrescar también el detalle y manejar conflictos de revisión entre dos cajeros. |
| Punto de venta | Catálogo al cambiar de sede; carrito local y clave nueva por intento. | F03 y F10; separar presentaciones al modificar cantidades y revisar el importe confirmado por el servidor. |
| Salón y pedido por QR de mesa | Tablero cada 10 s; otros datos se cargan al abrir acciones. | Invalidar comanda, cuenta y mesa tras agregar, cobrar o liberar; revisar idempotencia de reintentos y edición concurrente. |
| Cocina | Eventos SSE y consulta de respaldo cada 30 s; dispone de alertas y funciones de dispositivo. | Conservar estas bases, probar reconexión y permisos, y coordinar los avisos con Producción para evitar alertas redundantes. |
| Pastelería: oferta, recetas, diseños, capacidad, producción, finanzas y comisiones | Producción cada 30 s; el resto por carga o acciones. Existen controles de versión en cotizaciones y en algunas vistas financieras. | Priorizar F01, F02, F10 y F14. Actualizar capacidad y finanzas ante cambios que realmente las afectan y conservar borradores. |
| Reparto, conductores y cupos de auto | Tablero y flota cada 6 s; configuración de transporte se carga por separado. | Avisar al conductor, reflejar cupos modificados y mostrar claramente modalidad, vehículo y estado operativo. |
| Inventario, compras, lotes y proveedores | Inventario cada 15 s; Compras principalmente por carga y acciones. La recepción sí emite un aviso operativo. | Reflejar recepciones, consumo, merma y vencimiento en las vistas relacionadas; mostrar avisos en el panel que usa cada rol. |
| Catálogo, opciones, modelos de empresa y biblioteca de medios | Carga y acciones locales; reglas compartidas con la compra. | Propagar cambios publicados y avisar de conflictos al editar el mismo registro; evitar refrescos que borren formularios. |
| Cupones, suscripciones administrativas y recargas anteriores | Cargas y acciones manuales; los sistemas nuevo y anterior tienen finalidades distintas. | Clarificar esa separación en navegación y mensajes; completar permisos y avisos de suscripciones. |
| Zonas, sucursales y horarios | Configuración administrativa con publicación y generación de franjas. | Definir coherencia entre horario, excepción, franja, capacidad, auto y anticipación antes de publicar. |
| Comunicaciones, Correo y avisos, configuración del negocio y contenido del inicio | Comunicaciones usa eventos y sondeo de 10 s; ajustes públicos tienen caché sin vencimiento. | F11 y F13; distinguir configuración, modo de prueba y entrega real, y hacer visibles los bloqueos del canal. |
| Usuarios, roles, equipos, acceso y cierre de sesión | Lecturas y modificaciones por permisos; datos y tokens se conservan en varias capas. | Probar perfiles operativos y roles personalizados, revocación en sesiones abiertas y aislamiento de cuentas. |
| Reclamaciones y bitácora | Actualización por carga, filtros y acciones; hay protección frente a algunas respuestas antiguas. | Avisar de reclamaciones que necesitan atención; conservar trazabilidad y permisos. No necesitan sondeo rápido constante. |
| Acceso, registro, recuperación, legales, eliminación de cuenta y errores | Formularios o información estática; no presentan necesidad general de tiempo real. | Mantener mensajes, validación, navegación y datos del negocio coherentes; revisar sesiones y solicitudes pendientes al salir. |
| Aplicación móvil | Hay caché compartida, invalidación, refresco por foco, sondeo y recepción de push. | Priorizar F15; hacer que un aviso recibido invalide las lecturas correspondientes y validar destinos, permisos y aperturas con la app cerrada. |

## Orden propuesto de trabajo

1. **Proteger el trabajo y las operaciones:** F01, F02 y F03; corregir el aislamiento móvil F15 si la app está en uso. Son los casos que pierden edición, bloquean al operario o permiten duplicar registros.
2. **Hacer visibles los pendientes:** F04 y F05, seguidos de los eventos de F06 que requieren respuesta de una persona.
3. **Sincronizar con consistencia:** F08, F09, F10 y F11. Cada evento debe actualizar las lecturas relacionadas sin sobrescribir borradores.
4. **Completar historial, lectura y recuperación:** F07, F12, F13, F14 y F16, priorizando los permisos y reintentos que afecten los flujos que ya se usan.

Antes de implementar cada bloque, acordar el comportamiento visible y el destinatario de cada aviso. Para las correcciones de código, utilizar pruebas de comportamiento de los fallos descritos y un recorrido entre roles y sedes. Las comprobaciones reales de proveedores de pago, correo, WhatsApp y push deben prepararse por separado de esta revisión de solo lectura.
