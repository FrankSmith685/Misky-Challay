# DulceFlow: tortas personalizadas (etapas 1 a 5)

La marca pública es **DulceFlow**. El logo está en `frontend/public/favicon.svg`; las versiones PNG de la app se generan con `node scripts/generate-brand-icons.cjs`.

## Flujos implementados

1. **Catálogo de tortas.** El catálogo público solo publica productos con perfil de torta activo. Conserva pedidos y registros históricos anteriores. Los precios, imágenes, recetas, insumos y presentaciones de ejemplo se cargan mediante `seedCakes` cuando `SEED_DEMO_DATA=true`.
2. **Personalización.** La torta a tu gusto ofrece porciones, ocasión, bizcocho, relleno, cobertura, decoración y mensaje. La cotización se calcula en el servidor según la presentación y las opciones; la receta descuenta materiales existentes del inventario. Los tiempos de cada estación son editables en el panel de tortas.
3. **Fecha y capacidad.** Toda torta requiere una franja programada. El servidor comprueba anticipación mínima, cupos de entrega y minutos libres en cada estación. Al iniciar el pago reserva minutos; al confirmar los convierte en producción y al cancelar o expirar los libera. Las reservas usan bloqueo de filas de capacidad para evitar sobreventa.
4. **Diseño especial.** El cliente adjunta una referencia privada y describe su idea. El diseñador propone precio, fecha, trabajo y condiciones en versiones. Solo una cotización vigente y aceptada permite pagar. La imagen solo es accesible por el cliente y personal autorizado.
5. **Producción.** Un pago confirmado crea tareas de diseño, horneado, enfriado, relleno, decoración, control de calidad y despacho según el trabajo estimado. El panel permite asignar personal, marcar etapas, completar checklist y adjuntar foto final. La torta no pasa a “lista” sin control de calidad ni a entrega sin despacho.

## Datos iniciales editables

| Torta | Presentaciones | Precio inicial | Anticipación |
| --- | --- | --- | --- |
| Clásica de vainilla | 12 y 24 porciones | S/ 120 y S/ 180 | 48 horas |
| A tu gusto | 12 y 24 porciones | S/ 180 y S/ 260, más extras | 72 horas |
| Diseño especial | Desde 24 porciones | Cotización manual; referencia S/ 280 | 96 horas |

La capacidad inicial por sucursal y día es de 120 minutos en diseño, 180 en horneado, enfriado, relleno y decoración, y 90 en control de calidad y despacho. El proceso genera capacidad para los próximos 14 días. Las recetas, insumos, precios y capacidades son **ejemplos de operación**, pendientes de validación por la pastelería.

## Preparación de una instalación

1. Haz una copia de seguridad de la base existente. Revisa el estado de migraciones con `npm run db:migrate:status --workspace backend`; aplica las migraciones pendientes según el procedimiento de despliegue del proyecto. La nueva es `0026-produccion-tortas.ts`.
2. En desarrollo, inicia con `DB_SYNC=true`, `DB_ALTER=true`, `DB_SEED=true` y `SEED_DEMO_DATA=true` para cargar el catálogo y las capacidades de muestra. En producción se usan migraciones y datos comerciales aprobados; `SEED_DEMO_DATA` permanece desactivado.
3. Revisa en el panel los perfiles de torta, minutos por presentación y opción, días de anticipación y capacidad por sucursal. Confirma recetas, stock real, precios, horario de entrega, turnos, permisos de diseñador y personal de cocina.
4. Configura franjas de entrega con cupos durante el horizonte de producción. Sin franja, anticipación o capacidad, el cliente no puede confirmar una torta.

La app móvil muestra el catálogo y el configurador básico. Para diseños especiales abre la solicitud web de DulceFlow, que usa la misma cuenta y API.

## Continuaci�n: etapas 6 a 10

6. **Inventario.** Cada pedido conserva el plan de materiales calculado por presentaci�n y opciones. La cocina registra consumo real y merma desde la tarea; la merma adicional genera un movimiento WASTE ligado al pedido y responsable.
7. **Anticipo y saldo.** Un dise�o especial aprobado usa el plan DEPOSIT_BALANCE: 50 % al confirmar y saldo antes de la entrega. El saldo tiene pago separado y no abre una segunda producci�n. Los cambios se solicitan como una nueva cotizaci�n antes de las 48 horas previas; la cancelaci�n confirmada fuera de ese plazo queda bloqueada.
8. **Comisi�n y reportes.** Cada pedido de torta confirmado crea una liquidaci�n con base, tasa fija de 15 %, ajustes, reembolsos y total. El panel muestra el resumen por sucursal, permite ajustar antes de liquidar y registra qui�n cerr� la liquidaci�n.
9. **Panel y Android.** El panel de producci�n contiene solicitudes, agenda de capacidad, tareas todas/m�as, materiales y comisiones. Android incorpora el m�dulo operativo �Mis tareas de tortas� y el pago de saldo; el dise�o especial mantiene el flujo web compartido hasta completar la experiencia m�vil.
10. **Funciones heredadas.** Planes, billetera, mesas y men�s diarios quedan fuera de la navegaci�n comercial de DulceFlow. Se conservan las rutas y datos para compatibilidad hist�rica y soporte; la operaci�n nueva usa cat�logo de tortas, pedidos, producci�n, inventario, reparto y liquidaciones.

La migraci�n de estos puntos es `0027-liquidacion-tortas.ts`, que debe aplicarse despu�s de `0026-produccion-tortas.ts`.

## Experiencia web ampliada (fases 1 y 2)

- El configurador web de tortas ahora funciona por pasos y mantiene un resumen en vivo: presentación, opciones con imágenes, cantidades, incompatibilidades, alérgenos, precio validado por servidor, sucursal, franja con cupo y capacidad de producción.
- El flujo de diseño especial recibe un brief estructurado (ocasión, tema, estilo, colores, porciones, presupuesto, mensaje y notas), hasta tres referencias visuales y una fecha solicitada. El cliente puede consultar sus referencias y cotizaciones desde su espacio de diseños.
- El panel de tortas reúne perfiles de venta, solicitudes de diseño, cotización por estaciones, capacidad diaria, tareas de producción, recetas conectadas a inventario y comisiones.
- La migración `0028-brief-y-referencias-diseno.ts` agrega el brief estructurado y las referencias adicionales privadas. Las solicitudes antiguas se leen con valores predeterminados para no romper el historial.
