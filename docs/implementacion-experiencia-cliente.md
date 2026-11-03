# Implementación de la experiencia del cliente

Fecha: 2 de noviembre de 2026.

Este documento registra la implementación de las recomendaciones de
`docs/auditoria-experiencia-cliente.md`. Las reglas de negocio permanecen en el
servidor; web y móvil muestran el mismo estado y conservan los datos privados
con autorización por cuenta.

## Correcciones de compra

| ID  | Implementación                                                                                                                                                                          | Evidencia                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| C01 | Intento de checkout congelado con la misma clave de idempotencia ante respuesta incierta; los cambios posteriores al carrito quedan separados.                                          | `frontend/src/features/checkout/checkoutAttempt.ts`, prueba de pérdida de respuesta. |
| C02 | Una confirmación consume solo las líneas del intento confirmado; no vacía un carrito nuevo.                                                                                             | `consumePurchasedItems`, prueba de confirmación antigua.                             |
| C03 | Pendientes conservados ante errores temporales, reintento y enlace de pago revalidado por servidor.                                                                                     | `usePendingOrder`, `PendingOrderBanner`.                                             |
| C04 | Repetir pedido conserva combinaciones, indicaciones, datos estructurados, referencia y propuesta de IA; las cotizaciones especiales abren una nueva solicitud sin reutilizar el precio. | `useReorder`, `useDesignRepeat`, `RepeatDesignButton`.                               |
| C05 | Elegibilidad, motivo, pagos, saldos, devoluciones procesadas y devoluciones manuales pendientes visibles antes y después de cancelar.                                                   | `customerOrderSummary`, `OrderFinancialSummary`.                                     |
| C06 | Alérgenos unidos desde producto, tema, opción seleccionada e insumo vinculado; la misma fotografía llega a checkout y producción.                                                       | `customization.service`, `allergenCodes`; prueba de adicional e insumo.              |
| C07 | La app crea primero el pedido de pago directo y después muestra el importe exigible, distinguiendo anticipo y saldo.                                                                    | Checkout móvil y servicio de pagos directos.                                         |
| C08 | Web y móvil consultan disponibilidad autoritativa; pedido móvil incluye imágenes, propuesta, términos y experiencia de consulta disponible.                                             | `MobileWorkspaceSync`, detalle móvil y endpoint de disponibilidad.                   |
| C09 | Carrito, favoritos, borradores e imágenes se sincronizan con la cuenta; las imágenes privadas se guardan por identificador, con control de propietario y limpieza de abandonados.       | `CustomerWorkspace`, `CustomerMedia`, `CustomerWorkspaceSync`.                       |
| C10 | Revalidación en foco y eventos de catálogo; cambia precio o disponibilidad sin borrar diseño, referencias ni instrucciones.                                                             | `CartAvailabilityNotice`, `FavoritesPage`.                                           |
| C11 | Términos de suscripción gestionables en documento independiente, con snapshot inmutable de texto, versión, fecha y canal aceptado.                                                      | `CheckoutTerms` documento 2, administración de términos y `SubscriptionPlan`.        |
| C12 | Textos corregidos y errores de preferencias recuperables; un fallo de carga no sobrescribe preferencias existentes.                                                                     | Perfil, preferencias y `LocalPersistenceNotice`.                                     |

## Funciones nuevas

| ID  | Implementación                                                                                                                | Gestión y comportamiento                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| M01 | Aviso de primera fecha posible antes de completar la personalización; la consulta no reserva capacidad.                       | Se revalida al checkout y ante cambios de sede, inventario o cobertura.     |
| M02 | Inscripción exacta, ocasión y acabado en campos separados; propuesta final versionada y aceptación explícita.                 | Producción se bloquea mientras un acuerdo de diseño está pendiente.         |
| M03 | Casos de cambio de fecha, dirección, contacto y detalle; propuesta de negocio con capacidad, costo, saldo y devolución.       | Control de versión, propiedad, sede y estado de producción.                 |
| M04 | Conversación vinculada al pedido para soporte, cambios y diseño; mensajes públicos separados de notas internas.               | Avisos en tiempo real para cliente y sede, con permisos independientes.     |
| M05 | Preferencias separadas para email, WhatsApp, push y marketing; se comprueban al encolar y al entregar.                        | La preferencia no desactiva avisos esenciales de seguridad o reclamo.       |
| M06 | Cuidado posventa general y por producto; regalos con destinatario, mensaje, ocultación de precio y ficha privada compartible. | La ficha de regalo no expone contacto del comprador, pagos ni comprobantes. |

## Migraciones y operación

- `0064-customer-journey.ts` crea espacio de cliente, medios privados, casos de
  atención, políticas de cuidado, texto de regalo, detalles estructurados y
  snapshot de términos de suscripción.
- Las migraciones heredadas `0047` y `0048` ahora omiten índices que ya existen
  cuando el entorno local fue creado con sincronización previa. Esto permite que
  el historial continúe sin duplicar índices.
- El despliegue debe ejecutar `npm run db:migrate` en `backend` antes de iniciar
  la versión que usa estas tablas.

## Verificación realizada

- Backend: 365 pruebas, 0 fallos.
- Chrome: 6 pruebas del recorrido de cliente, 16 pruebas del constructor, todas
  aprobadas.
- TypeScript: backend, frontend y móvil, sin errores.
- Prueba de transacción MySQL: espacio, adjunto privado, aceptación de diseño,
  cambio de contacto y rollback verificados.

## Canales externos

El código deja las notificaciones de email, WhatsApp y push sujetas a sus
preferencias y a sus colas. El entorno revisado tiene SMTP configurado, pero
WhatsApp todavía requiere conexión de Meta y plantillas aprobadas; no se envió
ningún mensaje externo durante estas pruebas. Push se verificó en cola simulada;
la recepción en un dispositivo real requiere una prueba posterior con las
credenciales de producción.
