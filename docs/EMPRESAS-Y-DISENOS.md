# Para empresas

La galería pública está en `/empresas`, accesible desde la cabecera, la navegación móvil y el pie de página. Los diseños especiales ya no se mezclan con el catálogo general.

## Gestión

1. Entra al panel y abre **Para empresas** (`/admin/empresas`).
2. Crea o edita un diseño: nombre, temática, descripción, fotografías y orden en la galería.
3. Elige venta con precio configurado o por cotización. Conserva las reglas por presentación, materiales, opciones y anticipación.
4. Publica cuando esté listo. La torta base también debe estar publicada y tener sus reglas activas. La disponibilidad depende de la sede y de los materiales.
5. Usa **Ver página de empresas** para revisar el resultado. **Retirar** oculta la oferta nueva y conserva pedidos, solicitudes y fotografías históricas.

Los proyectos con modo `ADVANCED` se ofrecen también en Para empresas mediante el flujo existente de cotización. Sus datos y reglas se gestionan desde Catálogo y Producción de pastelería.

La consulta de diseños requiere `catalog.product.read`. La edición mantiene los permisos de producto y personalización; publicar o modificar un diseño publicado requiere además el permiso de publicación.

## Navegación y API

- `/menu?coleccion=DESIGNS` y `/menu?modo=ADVANCED` redirigen a `/empresas`.
- `/admin/catalogo/disenos` redirige al panel de empresas.
- Las fichas actuales de diseño conservan sus URL, precios, versiones y solicitudes.
- `GET /api/v1/catalog/products` usa `audience=RETAIL` por defecto; `audience=BUSINESS` devuelve proyectos `ADVANCED`. La galería de modelos usa `/cake-themes` y respeta su publicación y orden.

## Prueba del flujo

Comprueba que un diseño publicado aparece en Para empresas y no en el catálogo. Filtra por temática, abre un modelo y configura o solicita su cotización. Desde el panel, cambia el nombre o retíralo y revisa la página pública. Verifica también el acceso desde el menú móvil y los enlaces antiguos.
