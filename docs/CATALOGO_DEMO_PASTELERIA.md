# Catálogo demostrativo de pastelería

## Datos cargados

La carga se realiza por las API del panel, autenticada como Superadmin. Los productos quedan editables en **Catálogo**, con su receta y preparación en **Producción de tortas** y sus artículos en **Inventario**. No se duplica la torta personalizada existente.

| Selección pública | Producto | Presentación | Precio de ejemplo | Venta |
| --- | --- | --- | --- | --- |
| Tortas 24 horas | Torta de chocolate y fudge | 8 porciones | S/ 95 | Por encargo, 24 h |
| Tortas 24 horas | Torta de vainilla y fresas | 8 porciones | S/ 99 | Por encargo, 24 h |
| Postres | Fatia de tiramisú | Individual | S/ 18 | Producto preparado, 2 h |
| Postres | Fatia de chocolate intenso | Individual | S/ 20 | Producto preparado, 2 h |
| Turrones | Turrón de Doña Pepa | Caja de 500 g | S/ 32 | Por encargo, 24 h |
| Turrones | Turrón de almendras y miel | Caja de 300 g | S/ 38 | Por encargo, 24 h |
| Bocaditos | Mini alfajores de manjar | Caja de 12 | S/ 32 | Producto preparado, 2 h |
| Bocaditos | Trufas de cacao | Caja de 12 | S/ 36 | Producto preparado, 2 h |
| Sin azúcar / Postres | Cheesecake de maracuyá sin azúcar | Individual | S/ 22 | Producto preparado, 2 h |
| Sin azúcar / Bocaditos | Brownies de almendras sin azúcar | Caja de 4 | S/ 28 | Producto preparado, 2 h |

**Sin azúcar** es una característica combinable con las categorías: no se duplica el producto ni su inventario. La categoría existente de tortas personalizadas conserva su única ficha; se agrega una categoría independiente **Tortas 24 horas** para las recetas fijas.

## Conexiones

- Tortas y turrones: recetas con cantidades de insumos, alérgenos derivados, precio por presentación, anticipación y minutos por estación. Reservan insumos y capacidad al confirmar el pedido; Cocina usa el flujo existente de consumo.
- Fatias y bocaditos: artículos de tipo **Producto terminado**, controlados por unidad en la tienda. La receta de venta vincula cada presentación con las unidades que descuenta: una fatia, doce alfajores, doce trufas o cuatro brownies. Su reposición se registra en Inventario/Compras; no se descuenta dos veces la materia prima.
- El stock inicial se registra como movimiento a nombre de la sesión Superadmin. No se modifica el stock anterior ni las reservas existentes.
- La publicación pasa por las validaciones existentes de receta, clasificación de alérgenos y perfil activo.
- Las imágenes se guardan en la biblioteca de medios y pueden sustituirse desde el panel. Son ilustraciones referenciales locales, coherentes con las tortas existentes.
- La capacidad de los próximos 21 días solo se crea cuando falta, mediante la acción existente de restaurar capacidad automática. Respeta el calendario de la tienda y conserva las configuraciones previas.

## Supuestos de demostración autorizados

Estas composiciones, costos, existencias, recetas y precios son ejemplos, no fichas técnicas verificadas de proveedores.

| Producto terminado | Composición asumida | Alérgenos registrados |
| --- | --- | --- |
| Tiramisú | Bizcocho de trigo y huevo, mascarpone, crema, azúcar, café y cacao | Gluten, lácteos, huevo |
| Fatia de chocolate | Bizcocho de trigo y huevo, crema, chocolate con leche y lecitina de soya, frutos rojos | Gluten, lácteos, huevo, soya |
| Mini alfajor | Harina de trigo, mantequilla, huevo, manjar y azúcar | Gluten, lácteos, huevo |
| Trufa | Chocolate con leche y lecitina de soya, crema y cacao | Lácteos, soya |
| Cheesecake sin azúcar | Almendras, mantequilla, queso, crema, huevo, maracuyá y eritritol | Frutos secos, lácteos, huevo |
| Brownie sin azúcar | Harina de almendras, cacao puro, mantequilla, huevo y eritritol | Frutos secos, lácteos, huevo |

La etiqueta **Sin azúcar** se usa como supuesto del catálogo de demostración para las dos últimas recetas. No representa una certificación ni una recomendación para una condición médica. Para operar con alimentos reales, reemplazar estos supuestos por las recetas y etiquetas verificadas del negocio, incluyendo la revisión del etiquetado comercial. Una lista de alérgenos vacía en un insumo no declara ausencia de contacto cruzado.

## Repetir la carga local

Con el backend local encendido, desde `backend`:

```powershell
node scripts/generate-pastry-demo-assets.cjs
node scripts/seed-pastry-demo.cjs --apply
```

El primer comando genera SVG y PNG desde código local usando Edge/Playwright. El segundo exige entorno de desarrollo, base local y sesión Superadmin; usa exclusivamente `127.0.0.1:4000`. No envía credenciales a un túnel o a otro dominio.

La carga conserva un manifiesto local sin credenciales en `backend/tmp/pastry-demo-manifest.json` para retomar una ejecución incompleta. Las ejecuciones posteriores conservan las ediciones hechas desde el panel, no duplican artículos/productos, no rellenan stock consumido y no restauran capacidad ya configurada. Si se retira una publicación, no vuelve a activarla por su cuenta.

## Acceso directo a la personalización

`/crea-tu-torta` consulta el catálogo publicado y abre la ficha de la torta `SEMI_CUSTOM` existente. El slug no está escrito a mano en la navegación. El filtro «Torta personalizada» y los enlaces `/menu?modo=CUSTOM` y `/menu?coleccion=CUSTOM` mantienen al cliente en el catálogo y muestran las tarjetas correspondientes. Solo el enlace principal «Crea tu torta» o la acción «Personalizar» de una tarjeta abren el personalizador. Si la torta se retira, la entrada directa ofrece volver al catálogo; no muestra una ficha obsoleta.

El catálogo utiliza el contenedor compartido de 96 rem, una cabecera compacta, búsqueda, categorías, filtros desplegables, ubicación y tres columnas en escritorio. Mantiene la paleta azul y dorada de Misky Challay.
