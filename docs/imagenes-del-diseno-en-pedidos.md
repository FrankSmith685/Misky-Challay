# Imágenes del diseño en los pedidos

Al agregar una torta al carrito se conserva la foto de referencia y la propuesta con IA correspondiente a las opciones y descripción vigentes. La propuesta se comprime a una imagen de hasta 1024 píxeles y se guarda junto al producto del carrito; sobrevive a una recarga. Editar el producto recupera la propuesta guardada si su receta y referencia siguen coincidiendo. Una imagen de una combinación anterior no se adjunta después de cambiar las opciones o descripción sin regenerarla.

El carrito y el checkout muestran ambas imágenes. Solo la confirmación envía sus datos al backend: las cotizaciones no repiten esos binarios. La API admite `referenceDataUrl` y `aiProposalDataUrl` por producto, con los límites y validación de JPG, PNG o WebP que ya se usaban para la referencia.

## Conservación

Las imágenes se copian a `order_item_references` dentro de la misma transacción que crea el pedido. Cada fila identifica el producto, tipo (`CUSTOMER_REFERENCE` o `AI_PROPOSAL`) y posición. La propuesta de IA no reemplaza la referencia del cliente.

Los pedidos basados en una cotización aprobada copian todas las referencias de la solicitud aceptada. Las imágenes que un cliente intente reemplazar desde el carrito no alteran ese diseño aprobado.

La migración `0062-order-design-images.ts` agrega el tipo y la posición, reemplaza el índice único por producto por otro de producto/tipo/posición y conserva las referencias históricas. Ya está aplicada en la base local. En otros entornos debe ejecutarse antes de arrancar esta versión.

## Consulta

Se muestran en:

- Cocina: comandas activas y agenda de pedidos programados.
- Producción de pastelería: ficha de producción de cada pedido.
- Administración: detalle del pedido.
- Cuenta del cliente: detalle del pedido.

**Ver imágenes del diseño** abre una galería con etiquetas y permite ampliarlas. La propuesta lleva una aclaración de su origen y carácter ilustrativo; sabores, cantidades e indicaciones siguen formando parte de la ficha de preparación.

Las respuestas de los tableros incluyen solo identificadores, tipo y posición. Los binarios se solicitan por una ruta autenticada que verifica la relación entre pedido, producto e imagen. Puede leerlos el propietario del pedido o personal con permiso de Pedidos/Cocina y alcance sobre la sucursal. Los archivos se sirven con caché privada desactivada. La ruta anterior de referencia continúa devolviendo únicamente la foto principal.

Las propuestas de pedidos anteriores que nunca se almacenaron no se pueden reconstruir retroactivamente.

## Verificación

- Pruebas de backend para almacenamiento separado, múltiples referencias aprobadas, límites, permisos por propietario/sucursal y compatibilidad de la referencia histórica.
- Verificación en MySQL con dos imágenes por producto, lectura de asociaciones y rollback de los datos de prueba.
- Pruebas de navegador para creación y restauración del carrito, descarte de propuestas antiguas, envío al confirmar y consulta/ampliación desde Cocina y Producción.
