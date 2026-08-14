# Operación por locales: stock, caja y comandas

## Cómo se decide qué local atiende

- **Delivery web:** el servidor cruza la dirección con cobertura, horario, prioridad y capacidad. El cliente no puede forzar otra sucursal.
- **Recojo:** el cliente elige un local que acepte recojo.
- **Salón:** el mozo trabaja con la sucursal seleccionada en el panel y abre la comanda sobre una mesa de esa sucursal.
- El `branchId` queda congelado en el pedido. Cocina, inventario, caja, reparto y permisos filtran por ese mismo identificador.
- El alcance del usuario se valida otra vez en backend. Cambiar el `branchId` en la URL no permite operar otro local.

## Flujo de una comanda

1. El mozo abre una mesa disponible y selecciona productos.
2. El servidor recalcula precios y valida stock; no confía en el total mostrado por el navegador.
3. Se crea el pedido con canal `DINE_IN`, origen `POS`, mesa, mozo y sucursal.
4. Los insumos se reservan y el ticket aparece únicamente en la cocina de ese local.
5. Cocina acepta, prepara y marca listo. Al comenzar, el stock reservado se consume.
6. Antes de que Cocina inicie la preparación, el mozo o el comensal puede agregar productos. El sistema reserva solamente los insumos nuevos y avisa otra vez al KDS.
7. Salón sirve el pedido y puede imprimir una **precuenta** (no es comprobante).
8. Caja elige boleta o factura, registra efectivo, tarjeta/POS, Yape, Plin o un pago dividido y libera la mesa.
9. La venta alimenta Caja, ranking, canal de atención y demanda por hora.

No se permite cerrar una mesa antes de que cocina marque la comanda como lista.

## Responsabilidad de Pedidos y Cocina

- **Pedidos** es seguimiento y soporte: muestra pendientes de pago, importes, cliente, comprobantes, historial, cancelaciones y el resumen del ticket.
- **Cocina** es la única fuente de avance de preparación: aceptar, empezar y marcar listo. Pedidos no permite cambiar esos estados.
- Un delivery sale del KDS cuando Reparto confirma que lo recogió.
- Una comanda de salón sale del KDS cuando Salón cobra y cierra la mesa.
- Un recojo se entrega desde Cocina/mostrador y entonces se cierra el pedido.
- Los pedidos programados permanecen confirmados y reservados, pero el job solo crea su ticket cuando comienza el margen de preparación de la sucursal.

## Menús del día

- Se programan desde **Salón y comandas > Menús del día**.
- Cada programación pertenece a un solo local y define producto, nombre visible, precio de salón, días, hora inicial, hora final y un cupo diario opcional.
- La disponibilidad se evalúa con la zona horaria `America/Lima`.
- Al terminar el horario o agotarse las porciones, el menú deja de ofrecerse automáticamente tanto al personal como en la carta QR.
- El precio y el cupo se vuelven a validar dentro de la transacción del servidor; modificar el navegador no permite comprar con otro precio.
- La receta sigue vinculada al producto del catálogo, por lo que las porciones consumen el mismo inventario real de la sucursal.

## Carta QR por mesa

Cada mesa recibe un UUID aleatorio, no un id consecutivo. El panel permite mostrar, copiar, imprimir, desactivar o renovar su QR.

1. El comensal escanea el cartel y abre `/mesa/{token}` sin crear una cuenta.
2. El servidor obtiene del token la mesa y la sucursal; el navegador no decide a qué local enviar la comanda.
3. Si la mesa está libre se abre una comanda. Si ya existe y Cocina aún no empezó, los productos se agregan a ella.
4. Cuando Cocina pasa a `PREPARING`, se bloquean las ampliaciones para evitar preparar cambios que no fueron vistos.
5. El pago continúa en Caja con el personal. El QR nunca recibe ni almacena datos de tarjeta.

Renovar el token invalida inmediatamente los carteles anteriores. Desactivarlo conserva el token, pero devuelve una respuesta de QR inactivo.

## Precuenta y comprobante

- **Precuenta:** resumen imprimible para que el cliente revise platos, operación gravada, IGV incluido y total. Se marca expresamente como no comprobante.
- **Boleta:** puede emitirse sin documento; si se informa uno, se valida DNI o CE.
- **Factura:** exige RUC de 11 dígitos, razón social y domicilio fiscal.
- El cierre devuelve los datos congelados de la venta y abre la impresión del comprobante. La integración definitiva con OSE/SUNAT sigue dependiendo de las credenciales del proveedor fiscal configurado para producción.

## Inventario

El disponible se calcula como `stock físico - reservado` y se clasifica así:

- **Agotado:** disponible menor o igual a cero. Las opciones afectadas dejan de venderse en esa sucursal.
- **Crítico:** queda hasta la mitad del mínimo o aproximadamente un día de consumo.
- **Bajo:** está bajo el mínimo o quedan aproximadamente tres días.
- **Saludable:** no necesita una acción inmediata.

La compra sugerida intenta cubrir el mayor valor entre dos mínimos, siete días de consumo y una unidad cuando el insumo está agotado. El consumo reciente considera preparación y merma de los últimos siete días.

## Caja y rendimiento

La pantalla separa conceptos que no deben confundirse:

- **Venta registrada:** venta completa, incluido lo pagado con saldo de un plan.
- **Cobrado:** pagos confirmados por tarjeta, efectivo, POS o saldo.
- **Efectivo pendiente:** comandas o entregas todavía no cobradas.
- **Ranking:** unidades e ingreso por producto.
- **Canales:** delivery, recojo y salón.
- **Demanda por hora:** cantidad real de pedidos por franja.

Cada periodo se compara con el periodo inmediatamente anterior y todos los cálculos respetan la zona horaria de Lima.

## Roles operativos

- **Mozo:** mesas, comandas y avance visible en cocina.
- **Cajero:** cobro/cierre de mesas, pedidos, pagos y ventas de su local.
- **Cocina:** tickets e inventario, sin acceso a dinero.
- **Administrador de sucursal:** operación, salón, inventario y ventas únicamente de su alcance.
- **Administrador general:** visión completa de todos los locales.

## Puesta en marcha

El esquema requiere aplicar las migraciones pendientes y volver a ejecutar el seeder RBAC para sincronizar los permisos y roles del sistema. El seeder de operaciones crea doce mesas iniciales en la sucursal de demostración; los demás locales pueden configurarlas desde **Salón y comandas**.
