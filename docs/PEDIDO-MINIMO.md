# Pedido mínimo opcional

- Las zonas nuevas y la zona inicial se crean sin mínimo (`minimumOrder: 0`).
- El recojo en tienda no exige mínimo y no cobra delivery.
- El delivery cobra los productos más la tarifa de la ubicación, incluidos los recargos configurados por distancia. Desactivar el mínimo no desactiva el cobro del envío.
- En **Administrador → Cobertura → Zonas de entrega**, el campo **Mínimo opcional (S/)** permite exigir un subtotal de productos para una zona. `0` lo desactiva; un monto positivo lo activa. Publica los cambios para aplicarlos.
- Si el administrador activa un mínimo, el delivery no cuenta para alcanzarlo. El backend vuelve a cotizar antes de crear el pedido.
- Los mínimos propios de cupones y promociones siguen dependiendo de sus condiciones.

## Instalaciones existentes

La migración `0052-no-default-order-minimum.ts` retira el antiguo mínimo inicial de S/25 de **Lima Centro-Sur**. Conserva las tarifas de envío, los recargos por distancia y los mínimos personalizados de otras zonas. Tampoco cambia pedidos ya creados. Las migraciones se aplican una sola vez; un mínimo que el administrador configure después se respeta.
