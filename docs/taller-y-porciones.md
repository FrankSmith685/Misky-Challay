# Recojo en taller y porciones adicionales

## Recojo

La denominación visible ahora es **Recojo en taller** en checkout, resúmenes, pedidos, pagos directos, cajas mensuales y mensajes al cliente. El panel usa **Ver web** para abrir la página pública.

La migración `0057-workshop-wording` actualiza la redacción guardada en inicio/guía, configuración de mensajes y las instrucciones de pago. Conserva los textos personalizados, sus campos de contacto y los identificadores; aumenta la versión editorial cuando cambia su documento. No reescribe comunicaciones ya enviadas.

## Más porciones

- La tarjeta muestra **Más porciones** e **Indica cuántas necesitas**, sin anunciar un rango ni decir que la cantidad sea ilimitada.
- Al ingresar una cantidad superior al máximo configurado, aparece el aviso junto al campo. No se cotiza ni se permite continuar con esa cantidad.
- Con máximo 60, el valor 60 es válido y 61 muestra: **El límite es de 60 porciones. Reduce la cantidad para continuar.**
- El backend verifica el mismo máximo, también para solicitudes que no pasan por el formulario.
- El máximo se gestiona por producto en **Catálogo → ficha del producto → Tamaños y porciones → Máximo de porciones**.

## Cuarta presentación

El selector y sus validaciones admiten cuatro tamaños y una quinta opción de porciones adicionales. Con rangos aprobados 24–25 y 26–35, la presentación de 35 debe ser la base y las adicionales empezar en 36. La tarjeta de adicionales ocupa la fila completa cuando preceden cuatro tamaños.

La cuarta presentación ya está configurada en el catálogo local como **Extra grande · 35 porciones**, con rango **26–35**, diámetro referencial **32.5 cm** y precio base inicial **S/ 272.50**. El usuario autorizó calcular el precio con la configuración existente:

```text
S/ 205.00 + (35 − 26) × S/ 7.50 = S/ 272.50
```

Se conserva así el precio base que ya calculaba el sistema para una torta de 35 porciones. El diámetro se estimó a altura constante: `28 × √(35/26) ≈ 32.5 cm`; es un valor inicial editable que el taller puede ajustar a sus moldes. Es un cálculo de continuidad comercial, no un costeo con margen confirmado.

La presentación de 28 cm ahora indica **24–25 porciones** y conserva su receta completa y precio S/ 205. La nueva tiene receta propia (ingredientes escalados por `35/26`, una caja y una base por torta), tiempos de producción y sus dos grupos propios: **13 sabores y 12 rellenos**. Se mantienen los alérgenos, imágenes, estados y condiciones de disponibilidad de las opciones originales. Los recargos de opciones que escalan con porciones usan el mismo factor; los complementos por caja permanecen compartidos.

**Más porciones** utiliza ahora esta cuarta presentación como base, desde **36**, conservando la tarifa adicional S/ 7.50 y el máximo 60. Los precios base resultan S/ 280 para 36 y S/ 460 para 60; los recargos elegidos se suman aparte.

Todo se administra desde **Catálogo → Crea tu torta** (precio, diámetro y rangos), **Constructor** (opciones y recargos) y **Producción de tortas** (receta y tiempos).

El ajuste local es reproducible con `node backend/scripts/configure-fourth-cake-size.cjs --dry-run`, `--apply` o `--verify`. Requiere el backend compilado para validar los rangos. `--apply` usa una transacción, guarda un respaldo JSON de las filas afectadas en `backups/cake-fourth-size-before-*.json` y registra auditoría. Si la cuarta presentación ya existe, la verifica sin sobrescribir los cambios posteriores del panel. No recarga el catálogo completo.

## Prueba rápida

1. En Crea tu torta, verifica **32.5 cm**, **26–35 porciones**, desde **S/ 272.50**; selecciónala y elige un sabor y un relleno. Después abre **Más porciones**: debe empezar en 36, con base S/ 280.
2. Ingresa 60: debe permitir elegir sabores. Ingresa 61: debe mostrar el límite y bloquear el avance. Corrige a 60: el aviso desaparece.
3. En checkout, cambia a **Recojo en taller**. Revisa la dirección del taller y el envío sin costo.
4. Revisa también el detalle del pedido y la guía de compra: deben usar «taller».
