# Catálogo de pastelería

## Organización de la tienda

La navegación principal usa **Catálogo**, **Crea tu torta** y **Cobertura**. Se mantienen los enlaces anteriores de `/menu` y `/tortas`.

- **Familia:** Tortas, Postres, Turrones o Bocaditos. Define la presentación del producto en la tienda.
- **Categoría:** grupo comercial editable desde Catálogo; puede haber varias categorías dentro de una familia.
- **Personalización:** sin personalización, opciones configuradas o diseño por cotización. El diseño por cotización y las porciones libres corresponden a tortas por encargo.
- **Preparación:** por encargo o producto preparado.
- **Características:** etiquetas asignadas por el negocio tras revisar la receta, como Sin azúcar. No se deducen de los alérgenos.

El enlace principal «Crea tu torta» abre directamente el personalizador de la única torta publicada. Dentro del catálogo, «Torta personalizada» filtra las tarjetas y permite seguir combinando búsqueda y filtros; el cliente abre la ficha al pulsar «Personalizar». «Tortas 24 horas» filtra los productos existentes según su anticipación. Sin azúcar puede combinarse con las selecciones del catálogo y con las categorías. Los productos de ejemplo, sus conexiones y la carga local se describen en [Catálogo demostrativo de pastelería](CATALOGO_DEMO_PASTELERIA.md).

La migración `0043-pastry-catalog.ts` agrega las familias y formas de preparación, clasifica inicialmente los artículos existentes como insumos y asegura las categorías Tortas, Postres, Turrones y Bocaditos y la etiqueta Sin azúcar. Conserva las categorías, productos e historial anteriores. No publica productos ni asigna etiquetas dietarias automáticamente.

## Alta desde el administrador

1. En **Catálogo → Nuevo producto**, elige categoría, familia y forma de preparación.
2. Registra la anticipación mínima, el nombre de la presentación, su contenido, unidad y precio. Ejemplos: Individual / 1 unidad; Caja / 25 unidades; Turrón / 500 g.
3. El producto nace como borrador con sus reglas de preparación. Abre su ficha y pulsa **Configurar receta y preparación**.
4. En **Receta e insumos**, completa la receta de cada presentación. El rendimiento indica cuántas presentaciones completas produce esa receta; no cambia el precio de venta.
5. En **Tiempos y reglas**, configura la personalización y la anticipación. Para productos por encargo, registra los minutos de preparación y configura capacidad por sucursal.
6. Si admite opciones, abre **Constructor** para configurar grupos, elecciones, recargos y consumo de inventario.
7. Revisa los alérgenos de los artículos utilizados en Inventario. El producto calcula automáticamente los de sus recetas y opciones.
8. En **Características del producto**, asigna Sin azúcar cuando corresponda a la receta revisada y guarda. Cambiar la receta retira las características para revisarlas nuevamente.
9. Publica desde Catálogo cuando sus presentaciones, recetas y reglas estén completas.

No es necesario crear un insumo por categoría: harina, huevos, empaque y otros artículos se comparten entre las recetas que los utilizan.

## Productos preparados y existencias

1. En Inventario, registra el artículo como **Producto terminado**, con su unidad, costo y alérgenos revisados. Usa un artículo distinto del ingrediente empleado para elaborarlo.
2. Registra las unidades ya preparadas mediante stock inicial o una entrada manual, con su motivo. Las compras y lotes existentes siguen funcionando en el mismo inventario.
3. Crea el producto comercial con preparación **Producto preparado**, sin personalización.
4. Conecta su receta con el artículo terminado. Una caja de 25 consume 25 unidades terminadas con rendimiento de 1 caja; una fatia individual consume 1 unidad.
5. Configura las horas necesarias para preparar el despacho. Estos productos no reservan horneado ni decoración.

La disponibilidad por tienda descuenta las unidades reservadas. La cantidad completa se vuelve a comprobar al elegir fecha y en el checkout. El pedido reserva existencias; el consumo se registra por el flujo de Cocina y una cancelación libera las reservas.

Esta modalidad controla la venta de existencias preparadas. Las entradas de elaboración de un lote se registran en Inventario; no se genera un lote terminado automáticamente al cambiar la clasificación de un artículo.

## Tortas 24 horas

En esta implementación significa **al menos 24 horas de anticipación**. Se incluyen tortas por encargo con anticipación exactamente de 24 horas y compra directa o por opciones configuradas. Los diseños por cotización siguen su propio proceso.

No significa una promesa de entrega dentro de las siguientes 24 horas. Solo pueden elegirse horarios vigentes con cupo y capacidad; el servidor rechaza fechas anteriores al plazo configurado.

## Compatibilidad

La colección **Diseños especiales** muestra modelos temáticos conectados con la misma torta personalizada. Cada modelo puede venderse con reglas y recargo por presentación o abrir una solicitud de cotización. Su configuración, inventario y datos de demostración se describen en [Diseños especiales](DISENOS_ESPECIALES.md).

Se reutiliza el motor existente de recetas, inventario, precios y programación para toda la pastelería. Los nombres internos de las tablas y endpoints de producción de tortas se conservan para mantener la compatibilidad con los pedidos y clientes existentes. El escaparate y las reglas comerciales usan la familia y preparación de cada producto.

El catálogo y la ficha conservan el contenedor global de 96 rem y sus márgenes adaptables.
