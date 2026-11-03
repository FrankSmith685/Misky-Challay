# Identidad visual de la pastelería

La tienda, la cuenta del cliente y el panel conservan la tipografía, ilustraciones y estructura recuperadas. Comparten la paleta guinda y caramelo de Misky Challay, definida en `frontend/src/theme/tokens.ts` y `frontend/src/styles/index.css`.

| Uso | Valor por defecto |
| --- | --- |
| Acciones principales | Guinda `#8b3d59` |
| Acentos | Caramelo `#c28a47` |
| Apoyo | Verde suave `#527363` |
| Fondo | Crema `#faf6f1` |
| Texto | Cacao `#352721` |
| Títulos, formularios y datos | Inter / fuentes sans del sistema |

Los estados de información, éxito, advertencia y error conservan paletas independientes. Los controles mantienen foco visible y las pantallas se adaptan a celular.

El logo original de Misky Challay se conserva en sus archivos de `/public/brand`, con sus colores y proporciones. La cabecera y el pie comparten `AppLogo`: el nombre se muestra con su tamaño original, sin subtítulos añadidos. En espacios compactos se utiliza la marca original «M».

## Tema y preferencias existentes

El editor sigue disponible en **Administración → Sistema de diseño**. La clave de almacenamiento se conserva. Si la paleta guardada coincide completamente con la anterior combinación azul, naranja y celeste, se actualiza a la paleta guinda y caramelo. Las paletas personalizadas y la combinación guinda ya guardada se conservan.

Los controles y tarjetas conservan radios de hasta 5 px. Los neutros, rampas y radios están sincronizados entre MUI y Tailwind. Los títulos mantienen la tipografía sans en negrita en tienda, cuenta, configurador y panel. Se conserva la presentación sin tipografía serif ni marcos en arco.

Los encabezados de cobertura, constructor y planes heredados usan `bg-brand-900` en lugar del azul fijo `#00285f`. Los marcadores, polígonos, fondos y controles de los mapas heredan los tokens del tema. Al cambiar la paleta en el editor, estos elementos también se actualizan.

Se comprobó la cobertura en Chrome a 1440, 390 y 320 px, el enlace al verificador, la conservación del logo y de los temas personalizados, y la actualización en vivo de marcadores y polígonos de Leaflet al cambiar el color de marca.

## Imágenes

La portada y las secciones de presentación reutilizan las ilustraciones de tortas de `/images/cakes`. El encabezado del catálogo vuelve a mostrar el título y la descripción sin fotografía decorativa. Las imágenes generadas del rediseño anterior permanecen en `/images/brand` como archivos disponibles, pero las vistas ya no las utilizan.

El bloque derecho de la portada utiliza `HomeCakeShowcase`, recuperado de la versión previa del archivo en el historial de esta sesión: torta enmarcada, logo inclinado, tarjeta de diseño acompañado y miniaturas de las tres formas de celebrar. Conserva los colores del tema. El logo se mantiene dentro de la pantalla también en el tamaño de 640 px.

Las fotos de los productos siguen proviniendo del catálogo. Si faltan o no cargan, `ProductMedia` muestra un símbolo de torta. El catálogo administrativo utiliza el mismo componente. Para recuperar fotos faltantes se debe cargar el archivo real desde la biblioteca de medios.

## Cajas mensuales

La página `/planes` conserva las tarjetas de contenido y precio, sucursales desplegables, confirmación y preguntas frecuentes con la identidad visual anterior. La sección de cajas del inicio conduce a esta página.

Los precios, productos, presentaciones, cantidades, sucursales y cupos proceden de la API existente. El ahorro se calcula comparando el importe mensual con la suma de los precios de catálogo por cantidad. Solo se destaca la caja disponible con mayor ahorro absoluto positivo; no se atribuye popularidad a ningún plan.

`BoxCollectionPreview` presenta las ilustraciones existentes de alfajores, brownies y trufas, con una indicación de referencia, tanto en el inicio como en los planes. Las miniaturas intentan cargar la foto del producto; para productos conocidos con archivos ausentes, utilizan los recursos locales del catálogo, y finalmente un símbolo de caja.

La confirmación reúne la sucursal, el importe mensual, la aceptación expresa del cobro recurrente y el resumen de la caja. Mantiene la integración con Mercado Pago y las condiciones existentes de cancelación y vigencia.

Se revisaron tres planes reales en Chrome a 1440, 390 y 320 px, la selección de sucursal, la aceptación del importe recurrente, el acceso a la cuenta, los cupos agotados, la ausencia de sucursales, el proveedor no disponible, la colección vacía y el reintento tras error. El envío de la suscripción se comprobó con una respuesta de pago simulada en el navegador; no se creó una suscripción ni se efectuó un cobro real.

## Representación 3D

La restauración visual conserva el modelo procedural, la vista interior, los controles, la referencia editable, la escala del configurador, los borradores y los enlaces QR. La torta sigue siendo una aproximación del acabado.

## Verificación

La restauración se revisó en Chrome en diez rutas públicas y seis rutas de cuenta y administración, a 1440, 390 y 320 px. Se comprobaron los títulos sans en negrita, la ausencia de imágenes del rediseño descartado, la ausencia de desbordamiento horizontal y de errores JavaScript, la restauración de la paleta guardada y la conservación de una paleta personalizada. La revisión contra la API local utilizó lecturas; no creó pedidos ni modificó productos.
