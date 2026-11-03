# Ejemplo visible: proveedor, compra e inventario

La base local tiene un registro pequeño para entender la relacion entre los
modulos sin volver a cargar todo el catalogo.

## 1. Proveedores

Busca el proveedor **Proveedor demostrativo de insumos base** con codigo
`DEMO-PROV-001`. La nota explica que es un registro de demostracion.

## 2. Compras

Busca la orden `OC-DEMO-20261022-001`.

- Estado: **Recibida**.
- Insumo: **Harina de trigo para reposteria**.
- Cantidad recibida: **5,000 g**.
- Costo unitario de ejemplo: **S/ 0.0040 por g**.
- Total referencial: **S/ 23.60**.

Al estar recibida, la orden genero un lote y un movimiento de entrada.

## 3. Inventario

En la sede **Misky Challay Miraflores**, el insumo `MC-HARINA-TRIGO` muestra:

- Stock disponible: **15,000 g**.
- Lote: `LOTE-DEMO-20261022-HARINA`.
- Cantidad disponible del lote: **5,000 g**.
- Costo promedio: **S/ 0.0037 por g**.

La diferencia entre el stock total y la cantidad del lote se debe a que ya
existian 10,000 g conservados antes de registrar esta compra demostrativa.

## Como se relacionan

`Proveedor` identifica a quien se compra. `Orden de compra` registra el pedido
y su costo. `Recepcion` crea el `Lote` y un movimiento `PURCHASE`. `Inventario`
acumula esa entrada y actualiza el stock disponible.

El registro es demostrativo; reemplaza el proveedor, lote y costos por los de
la factura real antes de usarlo en produccion.
