# Operación de tortas, costos y comisión

## Puesta en marcha

1. Haz una copia de seguridad de la base de datos antes de desplegar los cambios.
2. Si usas migraciones, aplica `0031-cake-finance.ts` a `0034-design-quote-costs.ts` en orden. Si la instalación de desarrollo usa `DB_SYNC=true` y `DB_ALTER=true`, el arranque agrega las tablas y columnas de los modelos.
3. Mantén `DB_SEED=true` en el arranque o ejecuta `npm run db:seed` para incorporar los permisos `cake.finance.read` y `cake.finance.manage` a los roles existentes.
4. Revisa que `ADMIN_EMAIL` corresponda a la cuenta propietaria y que esa cuenta esté activa y marcada como superadministradora. Solo esa identidad puede ajustar y registrar transferencias de la comisión. El otro superadministrador puede consultar las liquidaciones.

## Alta y venta de una torta

1. En **Tortas → Crear torta**, registra nombre, presentación, porciones, precio, horas de anticipación, tiempo por estación y receta. La cantidad de cada insumo se expresa para el rendimiento total de la receta: si rinde dos tortas, se divide entre dos al reservar una venta.
2. Para una torta personalizable, vincula los grupos de opciones y revisa que sus opciones tengan precio y consumo de insumos. La torta nace como borrador. Comprueba el precio, la disponibilidad de materiales, las opciones, las franjas y la capacidad de cocina antes de publicarla.
3. Para un diseño especial, el diseñador añade materiales extra y estimaciones de mano de obra y empaque a la cotización. El cliente debe aceptar la versión vigente antes de pagar.
4. El checkout congela las cantidades y costos conocidos del pedido. La producción usa ese plan aunque la receta del catálogo cambie después. Los insumos se reservan durante el intento de pago y se consumen al iniciar cocina.

## Costo real y caja

- En **Compras e inventario**, registra proveedor, orden de compra, recepción, costo y vencimiento de cada lote. Los lotes con vencimiento más próximo salen primero; un lote vencido se retira y genera merma valorizada. El pago al proveedor se registra aparte de la recepción y del consumo para no contar dos veces el mismo gasto.
- En **Tortas → Producción**, asigna responsable y registra lo usado y desperdiciado por insumo. La primera carga parte de la receta congelada. Al guardar una corrección, el stock y el costo del pedido cambian por la diferencia. Completa el control de calidad y la foto antes del despacho.
- En **Tortas → Finanzas**, registra mano de obra, empaque y otros gastos por pedido con referencia de comprobante. Los gastos generales del negocio se registran sin pedido. Registra los pagos a proveedores contra la orden de compra y concilia cada cobro de Mercado Pago con su tarifa real y neto recibido. El efectivo se confirma en el detalle del pedido después de recibirlo.
- El reporte distingue costos estimados de reales y señala cuando faltan mano de obra, empaque, costo de insumos o tarifa de la pasarela. El margen de contribución por pedido es ingreso de tortas cobrado menos materiales, gastos directos, tarifa de pago y comisión. El resultado operativo estimado resta además los gastos generales registrados. No equivale a utilidad contable ni incluye impuestos no registrados.

## Comisión de DulceFlow

- La tasa es **15 %** del valor de las tortas después de descuentos y reembolsos; el delivery y los demás productos quedan fuera de la base. Si se cobra 50 % de anticipo, se devenga la parte proporcional; el saldo completa la base cuando se acredita. Un reembolso parcial sin detalle por producto se reparte proporcionalmente entre los conceptos cobrados.
- Mercado Pago deposita el cobro en la cuenta del comercio. El 15 % **no se separa automáticamente**. En **Liquidaciones de tortas**, la cuenta propietaria puede ajustar una liquidación pendiente y registrar transferencias parciales o totales con referencia única. El panel muestra lo devengado, recibido, pendiente y pagado de más. El segundo superadministrador tiene acceso de lectura; el administrador del negocio opera sus costos y consulta el cargo del 15 %.
- Los gastos internos de DulceFlow solo los registra y ve el propietario. Su resumen muestra comisión devengada, transferencias recibidas y gastos de plataforma. Son cifras de gestión, no sustituyen conciliación bancaria ni declaración tributaria.

## Comprobación recomendada

Prueba en un entorno aislado: venta de catálogo con descuento y delivery; diseño especial con anticipo y saldo; consumo real mayor y menor que la receta; vencimiento de un lote; gasto por pedido y general; reembolso parcial; conciliación de tarifa; transferencia de comisión repetida con la misma referencia. Verifica que la segunda cuenta superadministradora no pueda ajustar ni liquidar la comisión.
