# Implementación de las recomendaciones de vistas y notificaciones

Fecha: 2 de noviembre de 2026.

Implementación autorizada después de la [auditoría inicial](auditoria-logica-vistas-y-notificaciones.md). Se conservó el trabajo que ya existía en el repositorio.

## Cambios por hallazgo

| Hallazgo | Implementación |
| --- | --- |
| F01 | Los materiales conservan su borrador durante los refrescos. El guardado compara las cantidades de partida dentro de la transacción y rechaza conflictos con 409. Repetir cantidades confirmadas no vuelve a descontar inventario. |
| F02 | `/cakes/staff` devuelve únicamente identificador y nombres del personal elegible por permiso y sucursal. Producción usa esta lectura y muestra sus errores. Contempla roles personalizados. |
| F03 | Punto de venta y Salón conservan la clave y el contenido del intento pendiente en `sessionStorage`, separados por usuario y sede. Los reintentos recuperan la misma operación. Las comandas registran su resultado de idempotencia dentro de la misma transacción; también se corrigió el pedido por QR. |
| F04 | La campana administrativa consulta una bandeja persistente de avisos operativos con autorización por destinatario, permiso y sede. Se incorporaron avisos de pedidos confirmados, listos y cancelados para los equipos correspondientes. |
| F05 | Los destinos web y móvil conservan sucursal y entidad. Se contemplan pagos, tareas, diseños, repartos, suscripciones y proyectos QR. Se explican los accesos restringidos. Los módulos administrativos sin equivalente nativo se abren en el panel web configurado. |
| F06 | El outbox registra cambios de diseños/cotizaciones, asignaciones y bloqueos de producción, entregas, suscripciones, mensualidades y experiencias QR. Se comprueban estado, versión y vigencia antes del aviso; los nuevos push ligados a esos eventos se revalidan antes de enviarse. Se agregaron recordatorios de cajas que vencen en 48 horas. |
| F07 | El historial web tiene paginación y filtros del servidor, con totales completos. Las portadas y el indicador de pedido activo consultan los activos expresamente, incluyendo pedidos antiguos programados. El historial móvil también filtra en el servidor. |
| F08 | Se agregó un canal compartido de invalidación. Las vistas operativas, fichas, campanas, diseños, finanzas, suscripciones, saldo y catálogo refrescan sus lecturas con eventos y recuperan al volver a la pestaña o conexión. Se mantiene sondeo como respaldo. Se protegen los borradores de materiales y capacidad identificados en la auditoría. |
| F09 | `/checkout/availability` calcula las franjas para carrito y destino: anticipación, horario, zona, producción y transporte. Devuelve causas y alternativas cuando no encuentra cupos. Generación, consulta y reserva respetan los horarios de atención; el generador cubre al menos 45 días. La confirmación conserva sus validaciones y bloqueos transaccionales. |
| F10 | Se descartan respuestas de fuentes anteriores en Pastelería, POS y recursos móviles. Se separan borradores por sede y se confirma su descarte al cambiarla. Los intentos de venta pendientes se recuperan antes de cambiar de sede. |
| F11 | La configuración pública se revalida con TTL de 30 segundos, eventos, foco, conexión y señal entre pestañas. El servidor sigue validando la operación final. |
| F12 | Abrir la bandeja conserva los avisos sin leer. Hay lectura individual, acción explícita para marcar todo y paginación. El contador se calcula en el servidor; marcar todo utiliza el último identificador de la consulta para conservar avisos posteriores. Web y móvil comparten este contrato. |
| F13 | Se agregaron `app_events` y `push_deliveries`: eventos durables dentro de la transacción, cola push con idempotencia, reintentos acotados, receipts y estados de resultado incierto que no se reenvían automáticamente. Se conservan los canales y las claves de correo/WhatsApp existentes. |
| F14 | Producción y Capacidad deshabilitan modificaciones sin el permiso correspondiente. Conciliar suscripciones exige gestión. Los suscriptores se consultan y gestionan dentro del alcance de sucursales del actor; configurar planes compartidos exige alcance global. |
| F15 | La caché móvil invalida promesas y versiones de claves, borra datos montados al salir y descarta respuestas antiguas. Se reinician las pantallas al abandonar una cuenta, preservando los borradores de invitado al iniciar sesión. Se comprobó la lectura tardía de A después de cargar B. |
| F16 | Los SSE recuperan credenciales mediante el cliente HTTP, rotan y revalidan sesión. Un registro compartido en base de datos permite invalidaciones entre procesos. Cada reconexión solicita resincronización y las lecturas conservan recuperación periódica. |

También se corrigió el límite de ingredientes del cotizador para que coincida con las 10 unidades permitidas en administración y checkout.

## Operación y despliegue

- Aplicar `0060-durable-activity-and-push.ts` antes de iniciar la nueva versión del backend. Se aplicó en la base local, incluidos índices y clasificación de avisos históricos.
- Los hooks de actividad se instalan después del bootstrap y las semillas. Instalar una versión no genera avisos sobre datos de semillas.
- Los workers de actividad y push se inician con los jobs del backend. Las filas pendientes sobreviven al reinicio; los resultados externos inciertos se conservan para revisión.
- Los eventos completados se conservan 30 días. Los avisos de cuenta se consultan por páginas.
- Los pedidos ya comprometidos no se cancelan al cambiar un horario; los nuevos cupos se vuelven a validar al reservar.
- En móvil, instalar una compilación con estos cambios para utilizar la nueva bandeja y el aislamiento de sesión.

### Qué significa confirmar un push

`QUEUED` espera envío; `SENDING` está en proceso; `ACCEPTED` tiene ticket de Expo; `PROVIDER_CONFIRMED` tiene receipt satisfactorio de FCM/APNs; `FAILED` conserva un rechazo conocido; `UNKNOWN` conserva un resultado externo incierto. Un receipt no confirma recepción ni lectura en el teléfono. [Documentación oficial de Expo](https://docs.expo.dev/push-notifications/sending-notifications/#push-receipts).

## Verificación

- Batería del backend: 320 pruebas aprobadas en la pasada completa final.
- Última revisión del aislamiento móvil: 3 de 3 pruebas aprobadas, incluyendo la diferencia entre cierre de sesión y refresco por push.
- Chrome: 19 escenarios aprobados entre las pasadas realizadas (17 de checkout y fiabilidad, más 2 de flota). Se comprobaron materiales durante dos refrescos y conflicto concurrente; personal elegible; recuperación del mismo POS después de perder la respuesta y recargar; contador persistente y enlace administrativo de pagos.
- Checkout en escritorio y móvil: tarifa, cambios de dirección, respuestas tardías, reserva fuera de horario, disponibilidad en auto y alternativa de recojo. Se actualizó la prueba móvil para revisar el resumen antes de confirmar, como exige el flujo existente.
- Se verificaron por HTTP local la bandeja, las lecturas de activos, el personal de producción y los canales SSE. Con permisos reducidos de Cocina: personal de su sede 200, otra sede 403 y administración de usuarios 403. Se comprobó el cierre del SSE al caducar el token.
- TypeScript y ESLint se ejecutaron sobre las piezas modificadas.

Las pruebas de proveedores usan simulación. No se realizaron ventas ni se enviaron avisos reales para verificar los cambios. Queda fuera de estas comprobaciones una entrega física de push en Android/iOS y una prueba de carga con varias instancias desplegadas. El transporte compartido se implementó en base de datos; su capacidad depende del despliegue.
