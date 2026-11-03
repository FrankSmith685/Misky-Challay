# Alérgenos del Inventario de demostración Misky Challay

Los 43 insumos del Inventario local ya tienen una clasificación. «Crea tu torta» calcula automáticamente la unión de los alérgenos de sus recetas y de todas las opciones activas. La ficha del producto está completa; el producto sigue **inactivo**.

La clasificación de los 28 insumos preparados o de marca de esta tabla usa **supuestos de demostración autorizados por el usuario**. No proviene de fichas técnicas ni de etiquetas verificadas. Antes de usar estos datos para ventas reales, sustituir cada supuesto por la etiqueta del proveedor o la receta completa y revisar contacto cruzado por separado. Una lista vacía significa únicamente que, bajo el supuesto indicado, no hay alérgenos declarados de la lista del sistema.

| Insumo (`MC-`) | Alérgenos asignados | Supuesto de demostración |
| --- | --- | --- |
| `BUTTERCREAM` | Lácteos | Crema preparada con mantequilla. |
| `CAFE` | Ninguno | Café puro, sin mezcla láctea. |
| `CANELA` | Ninguno | Canela pura. |
| `CHOCOLATE-CHIPS` | Lácteos, soya | Chispas de chocolate con leche y lecitina de soya. |
| `CHOCOLATE-COBERTURA` | Lácteos, soya | Cobertura de chocolate con leche y lecitina de soya. |
| `COLORANTE-ROJO` | Ninguno | Colorante alimentario sin portador alergénico. |
| `COLORANTES` | Ninguno | Colorantes alimentarios sin portador alergénico. |
| `FONDANT` | Ninguno | Fondant de azúcar, sin leche ni gelatina alergénica. |
| `FROSTING-CHOCOLATE` | Lácteos, soya | Crema láctea con chocolate que contiene soya. |
| `FROSTING-ESPECIAL` | Lácteos | Crema láctea. |
| `FROSTING-OREO` | Gluten, lácteos, soya | Galleta de trigo con soya y crema láctea. |
| `FRUTAS-CONFITADAS` | Sulfitos | Fruta conservada con sulfitos. |
| `FRUTOS-SECOS` | Frutos secos | Mezcla de frutos de cáscara. |
| `FUDGE` | Lácteos, soya | Fudge lácteo con chocolate que contiene soya. |
| `GALLETAS-OREO` | Gluten, soya | Galleta de trigo con soya. |
| `GANACHE-CAFE` | Lácteos, soya | Ganache de crema láctea y chocolate con soya. |
| `GANACHE-MARACUYA` | Lácteos, soya | Ganache de crema láctea y chocolate con soya. |
| `GANACHE-PISTACHO` | Frutos secos, lácteos, soya | Pistacho, crema láctea y chocolate con soya. |
| `GRAGEAS` | Ninguno | Azúcar y colorantes sin portador alergénico. |
| `MANJAR` | Lácteos | Manjar preparado con leche. |
| `MANJAR-PISTACHO` | Frutos secos, lácteos | Manjar de leche con pistacho. |
| `MARACUYA` | Ninguno | Pulpa pura de maracuyá. |
| `MERMELADA-ARANDANOS` | Ninguno | Fruta, azúcar y pectina. |
| `MERMELADA-FRESA` | Ninguno | Fruta, azúcar y pectina. |
| `PISTACHO` | Frutos secos | Pasta pura de pistacho. |
| `POLVO-HORNEAR` | Ninguno | Polvo con almidón de maíz. |
| `VAINILLA` | Ninguno | Extracto simple de vainilla. |
| `VINAGRE` | Ninguno | Vinagre blanco simple. |

Los otros 15 insumos del ejemplo son materias primas o empaque con composición inequívoca en la ficha de demostración; Nutella se clasificó según su [lista oficial de ingredientes](https://www.nutella.com/us/en/inside-nutella/faqs/products/spread). Después de volver a cargar el catálogo de ejemplo, aplicar la clasificación con `cd backend` y `node ../node_modules/tsx/dist/cli.mjs scripts/backfill-known-cake-allergens.ts --demo-assumptions --execute`. El script solo permite la base local de desarrollo, nunca sobrescribe fichas ya clasificadas y recalcula las tortas que usan cada insumo. El cargador de catálogo deja la revisión pendiente hasta que ese cálculo termine.
