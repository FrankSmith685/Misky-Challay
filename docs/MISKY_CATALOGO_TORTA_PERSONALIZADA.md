# Catálogo de tortas Misky Challay

La carga local conecta catálogo, constructor, recetas e inventario. Los precios,
cantidades y existencias iniciales son referencias editables y deben ser
validados por la pastelería antes de vender en producción.

## Estructura comercial

Se creó la categoría **Tortas** y 15 productos activos:

- 13 sabores clásicos: vainilla, chocolate, zanahoria, red velvet, plátano,
  chocohips, arándanos, marmoleado, confetti, naranja, naranja con chispas,
  keke de novia y keke inglés.
- **Crea tu torta**: constructor con precio automático.
- **Diseño especial**: solicitud de referencia y cotización del equipo. Se muestra
  dentro de la vista pública **Crea tu torta**.

La carga reproducible crea tres variantes: **Pequeña (8 porciones)**,
**Mediana (14 porciones)** y **Grande (26 porciones)**. Cada una tiene su propia
receta, tiempos de producción, precio e inventario. La actualización puntual
de la base local solo cambia **Crea tu torta**; los demás productos conservan
sus presentaciones hasta que se revisen sus recetas.

En **Crea tu torta**, el catálogo local actualizado muestra rendimientos aproximados de 14 cm
(6–8 porciones), 18 cm (12–14), 28 cm (24–25) y una cuarta presentación
referencial de 32.5 cm (26–35), desde S/ 272.50. Desde 36 porciones indica
la cantidad exacta y el precio suma la tarifa por porción adicional al precio
de la presentación de 35. El cálculo y el ajuste puntual se documentan en
`docs/taller-y-porciones.md`. En el editor de producto del panel se administran
diámetros, mínimos, precio por porción extra y límite; el máximo de cada rango
se toma de la presentación y su receta para mantener el cálculo de insumos.

## Precio y recetas

Para el constructor, el backend calcula:

```text
precio final = base del tamaño + recargo de sabor + recargo de relleno
             + cajas de complementos elegidas
```

Los recargos de sabor siguen la tabla recibida: los sabores base quedan en S/ 0;
plátano, chocohips, arándanos, marmoleado, confetti, naranja y keke de novia
usan S/ 10, S/ 15 y S/ 20; naranja con chispas y keke inglés usan S/ 15,
S/ 20 y S/ 25 según el tamaño. Los rellenos se cargan con S/ 0, S/ 10 o S/ 20
según la lista de referencia. Los precios base son editables y deben confirmarse.

Las recetas descuentan harina, azúcar, huevo, mantequilla, leche, polvo de
hornear, sal, ingredientes del sabor y empaque según el factor del tamaño.

## Constructor e inventario

**Crea tu torta** tiene dos grupos por variante y uno compartido:

- **Sabores:** 13 opciones.
- **Relleno:** 12 opciones, incluidos los de las imágenes compartidas.
- **Adicionales:** grupo opcional de mini alfajores, cupcakes, paletitas de torta,
  galletas decoradas y brownies. Se eligen por caja y se puede aumentar la cantidad.

El grupo **Adicionales** se aplica a todos los tamaños y se edita en
**Superadmin → Constructor → Crea tu torta → Todos los tamaños**. Sus precios
provisionales por caja son S/ 32, S/ 36, S/ 30, S/ 30 y S/ 28 respectivamente.
No escalan al elegir más porciones de torta. **Cobertura** y **Decoración** se
retiraron del configurador y del Constructor para este producto en los tres tamaños.

Los complementos de esta demostración todavía no tienen ficha de insumos ni
receta vinculada. Antes de usarlos en ventas reales, confirmar presentación,
precio, alérgenos, disponibilidad y consumo en Inventario/Constructor.

Las opciones originales de la torta tienen insumo y consumo configurados por
presentación. Sus grupos llevan `variantId`, por lo que el constructor no mezcla
las cantidades de pequeña, mediana y grande. El stock se valida para los
materiales vinculados; el grupo compartido de complementos aún requiere sus
fichas de insumos para entrar en ese control.

Para actualizar solo la torta de demostración local sin recargar el catálogo:

```powershell
node backend/scripts/configure-demo-cake-addons.cjs --apply
node backend/scripts/configure-demo-cake-addons.cjs --verify
node backend/scripts/remove-demo-cake-finishes.cjs --apply
node backend/scripts/remove-demo-cake-finishes.cjs --verify
```

## Imágenes y nutrición

Las tortas usan las imágenes de `frontend/public/images/cakes` y las opciones
usan `frontend/public/images/ingredients`. La nutrición queda pendiente hasta
que se cargue la ficha técnica real de cada receta y presentación.

## Carga reproducible

Desde la raíz del proyecto:

```powershell
node backend/scripts/seed-misky-cake-catalog.cjs
node backend/scripts/seed-misky-cake-catalog.cjs --execute
```

El primer comando solo muestra el plan. El segundo crea un respaldo antes de
modificar la base local y carga productos, variantes, recetas, grupos, opciones,
imágenes y disponibilidad por sede. El script exige la base local `DulceFlow`,
`SEED_DEMO_DATA=false` y una cuenta `ADMIN_EMAIL` activa.

Último respaldo generado:

`backups/DulceFlow-before-cake-catalog-2026-10-23T10-42-32-612Z.sql`

Los precios, porciones, mermas, tiempos y cantidades son valores iniciales de
referencia. Deben revisarse en el panel con la ficha técnica y el costo real de
la pastelería antes de vender a clientes.

## Carga en Render (entorno de prueba)

Cuando la base remota está vacía, conserva `SEED_DEMO_DATA=false` y agrega
`SEED_MISKY_CATALOG=true` en las variables del servicio. En el siguiente
arranque se crea la sede, el inventario y el mismo catálogo local. El seeder se
omite automáticamente cuando ya existe `torta-a-tu-gusto`, por lo que los
cambios posteriores del panel no se sobrescriben.

Después de confirmar que el catálogo aparece, vuelve a dejar
`SEED_MISKY_CATALOG=false` para que los reinicios futuros sean completamente
neutros.


