# App móvil Verde Bowl — Fase 5

## Resultado

La Fase 5 incorpora a la aplicación móvil los planes comerciales, la billetera del cliente y la programación real de pedidos. La aplicación reutiliza el mismo backend de la web: precios, créditos, vencimientos, cobertura, horarios y capacidad nunca se calculan solamente en el teléfono.

## Funciones entregadas

### Planes

- Catálogo de planes publicado por el backend, con precio, vigencia, beneficios y plan destacado.
- Comparación visual y explicación previa a la compra.
- Inicio de compra autenticado con aceptación de términos y clave de idempotencia.
- Apertura de la pasarela de pago en el navegador seguro del dispositivo.
- Retorno a la aplicación mediante `verdebowl://plans/result`.
- Verificación posterior contra el backend: la app no declara activo un plan por el simple retorno de la pasarela.

### Billetera

- Saldo total disponible y resumen de composición.
- Créditos separados por lote, origen y fecha de vencimiento.
- Planes activos vinculados al cliente.
- Historial filtrable de abonos, consumos, reversiones y vencimientos.
- Actualización manual mediante gesto de recarga.

### Checkout y programación

- Elección entre “Lo antes posible” y “Programar pedido”.
- Consulta de franjas reales según modalidad y sede.
- Visualización de fecha, hora y cupos disponibles.
- Bloqueo de franjas sin capacidad y validación obligatoria antes de confirmar.
- Aplicación opcional del saldo de billetera.
- Desglose de saldo aplicado y monto restante por pagar.
- Envío al backend de `serviceMode`, `deliverySlotId` y `useWallet` para su validación definitiva.

## Flujo técnico

```text
Planes → autenticación → aceptación → backend crea compra pendiente
      → pasarela → webhook confirma pago → backend acredita saldo
      → puente web → deep link móvil → app consulta billetera

Checkout → cobertura/sede → horarios disponibles → selección de franja
         → cotización con billetera → confirmación del pedido
         → backend revalida stock, saldo, franja y capacidad
```

## Reglas de seguridad y consistencia

- El dispositivo no puede inventar saldo ni beneficios: siempre consulta el backend.
- La compra utiliza idempotencia para evitar duplicados por doble toque o reintento.
- El retorno visual de pago no equivale a aprobación; se confirma la activación real.
- Los créditos conservan su lote y vencimiento; el backend decide el orden de consumo.
- La capacidad de una franja se revalida al crear el pedido para evitar sobreventa.
- Si el cliente elige una franja futura, el cierre actual de la sede no bloquea indebidamente el pedido.
- Las rutas privadas redirigen al inicio de sesión conservando el destino de retorno.

## Contratos utilizados

- `GET /plans`
- `POST /plans/:planId/purchase`
- `GET /plans/wallet`
- `GET /plans/wallet/transactions`
- `GET /geo/delivery-slots`
- `POST /checkout/quote`
- `POST /checkout/orders`

## Pruebas de aceptación manual

1. Iniciar sesión y abrir **Cuenta → Planes**.
2. Elegir un plan, aceptar los términos y continuar a la pasarela.
3. Completar o cancelar el pago y comprobar que el retorno abre la app.
4. Confirmar que solo un pago aprobado aparece como plan activo y acredita saldo.
5. Abrir **Cuenta → Mi saldo** y revisar lotes, vencimientos y movimientos.
6. Agregar productos al carrito y entrar al checkout.
7. Activar “Usar mi saldo” y comprobar el desglose de la cotización.
8. Elegir “Programar pedido”, seleccionar una franja con cupos y confirmar.
9. Revisar en el detalle que el pedido muestre su fecha y hora programadas.
10. Repetir con una franja agotada para comprobar que no pueda seleccionarse.

## Verificación automatizada realizada

- TypeScript de backend, frontend y móvil sin errores.
- Suite backend: 55 pruebas aprobadas.
- Builds de producción de backend y frontend aprobados.
- Exportación Android de Expo aprobada.
- Prueba de humo contra la API local: planes, franjas, billetera y movimientos respondieron correctamente.

## Ejecución local

```powershell
npm run dev
npm run start:dev-client --prefix mobile
```

Para probar notificaciones Firebase, retorno desde navegador y comportamiento nativo completo se debe instalar el APK `preview`; Expo Go no contiene toda la configuración nativa del proyecto.
