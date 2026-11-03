# Diseños especiales

## Uso en la tienda

En **Catálogo → Diseños especiales**, el cliente encuentra modelos por temática. Cada modelo reutiliza la torta personalizada publicada: no crea otro producto base ni duplica sus existencias.

- **Precio configurado:** elige una presentación permitida y sus sabores compatibles. El servidor calcula `precio base + extras de opciones + recargo del diseño`, multiplicado por la cantidad de tortas. Los materiales y minutos adicionales del modelo se suman a la receta y al trabajo base.
- **Por cotización:** abre directamente la solicitud a medida con el modelo, su imagen y descripción. El cliente indica porciones, fecha y cambios; el equipo registra materiales completos, trabajo y precio mediante el flujo de cotizaciones existente.
- **Adaptaciones:** un modelo con precio configurado también permite solicitar cambios especiales. Otras porciones, pisos o acabados requieren una propuesta; no se extrapolan automáticamente sus decoraciones.
- **Otras porciones:** la ficha ofrece una opción para indicar cualquier número dentro del rango de cotización del diseño. Las presentaciones publicadas conservan compra directa; el número libre se envía a cotizar.
- **Personalización por diseño:** los grupos de la torta base se reutilizan para sabores y rellenos. En cada presentación del diseño se pueden ocultar grupos que el modelo ya resuelve, por ejemplo la decoración. El equipo registra los materiales y minutos de ese acabado en la regla del diseño.

La navegación **Crea tu torta** conserva el personalizador general. **Torta personalizada** continúa filtrando dentro del catálogo. Se mantiene el contenedor global de 96 rem.

## Administración

Desde **Catálogo → Diseños especiales** (`/admin/catalogo/disenos`):

1. Crea un diseño y selecciona la torta personalizada base.
2. Completa nombre, temática, descripción y hasta cuatro imágenes de la biblioteca.
3. Elige precio configurado o cotización, anticipación y rango de porciones para las solicitudes.
4. Para venta directa, habilita presentaciones y configura en cada una el recargo, materiales por torta, minutos adicionales, opciones no compatibles y pasos definidos por el diseño. Registra solo los materiales que se agregan a la receta base.
5. Revisa inventario, clasificación de alérgenos y capacidad de producción por tienda. Publica cuando esté completo.

Publicar requiere permiso de publicación además de los permisos de catálogo y constructor. Retirar un diseño lo oculta del escaparate y conserva los pedidos y solicitudes anteriores. Los cambios usan una versión para evitar que dos administradores se sobrescriban.

Las imágenes pertenecen a la biblioteca existente. Sus usos incluyen los diseños; reemplazar una imagen actualiza el modelo y su versión, conservando las imágenes históricas de pedidos y solicitudes.

## Inventario, programación e historial

- El checkout recalcula precios y vuelve a validar versión, presentación, restricciones y materiales; no acepta precios enviados por el navegador.
- Los materiales adicionales se incluyen en las reservas, liberaciones por cancelación, consumo y estimación del costo del pedido.
- Los minutos adicionales se suman a la reserva de las estaciones existentes. Se aplica el mayor plazo entre la torta base y el diseño.
- Los alérgenos del diseño se calculan desde sus materiales y se unen con los de la torta. Un material sin clasificación impide ofrecer el modelo configurado.
- Inventario reconoce los artículos usados por los diseños y protege sus unidades, tipo y eliminación.
- El pedido conserva nombre, imagen, versión, recargo, cantidades y tiempos del modelo elegido. Una edición posterior no reescribe esa información.
- Un carrito con una versión anterior debe revisar el diseño actualizado. Al repetir un pedido tampoco se sustituye el modelo por una torta genérica; las cotizaciones anteriores requieren una nueva propuesta.

## Datos de demostración

| Modelo | Venta | Datos |
| --- | --- | --- |
| Hombre Araña clásico | Configurada | Recargos S/35, S/45 y S/65; fondant y topper |
| Flores delicadas | Configurada | Recargos S/35, S/45 y S/65; buttercream y topper |
| Dinosaurio en 3D | Cotización | 15–100 porciones, mínimo 96 horas |
| Celebración de dos pisos | Cotización | 30–150 porciones, mínimo 96 horas |

Los modelos configurados usan las tres presentaciones existentes y exigen 72 horas. El topper es una decoración no comestible; las imágenes son ilustraciones de referencia. Las cantidades y tiempos son supuestos de demostración editables desde el administrador.

La carga local exige `NODE_ENV=development`, una base local y `--apply`. Se autentica contra el backend local como superadministrador, carga imágenes mediante la biblioteca y crea los modelos mediante las mismas validaciones del panel. No duplica los modelos existentes ni repone stock en ejecuciones sucesivas.

```sh
cd backend
npm run db:migrate
node scripts/generate-cake-theme-assets.cjs
node scripts/seed-cake-themes-demo.cjs --apply
npx tsx --tsconfig tsconfig.json scripts/verify-cake-themes.ts
```

La migración aditiva `0044-cake-themes.ts` crea los modelos y añade las fotografías de selección a pedidos y solicitudes. La verificación local crea únicamente registros temporales propios y revierte el pedido, sus reservas y costos; no realiza pagos ni envía solicitudes al negocio.
