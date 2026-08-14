# KDS de cocina

## Puesta en marcha por sucursal

1. Inicia sesión con un usuario que tenga `kitchen.read` y `kitchen.operate`.
2. Abre `/admin/cocina?kds=1` y selecciona la cocina correcta.
3. Pulsa **Pantalla completa** y confirma **Aviso activo**.
4. Activa **Mantener despierta**, **Alertas fuera de la app** y, si hay impresora, **Autoimpresión**.
5. Instala el panel como aplicación cuando el navegador muestre **Instalar como app**.

El canal SSE entrega el evento de inmediato. El sondeo de 30 segundos permanece como respaldo si un proxy o una red corporativa corta SSE. Si una comanda sigue en cola por dos minutos, el job de escalamiento la marca una sola vez y envía Web Push a los dispositivos suscritos de esa sucursal.

## Web Push

Genera un par VAPID persistente una sola vez:

```bash
npx web-push generate-vapid-keys
```

Configura en el servidor:

```dotenv
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:operaciones@verdebowl.com
```

En desarrollo, si faltan, el backend genera claves efímeras. Sirven para probar hasta que el servidor se reinicie. En producción las variables son obligatorias.

Web Push requiere HTTPS, salvo en `localhost`, que los navegadores consideran un origen seguro.

## Impresora térmica

La comanda usa papel de 80 mm. Sin políticas especiales, el navegador abre la selección de impresora por seguridad.

En un equipo dedicado se puede iniciar Chrome o Edge con impresión silenciosa:

```text
chrome.exe --kiosk --kiosk-printing https://tu-dominio/admin/cocina?kds=1
```

Configura antes la térmica de 80 mm como impresora predeterminada y desactiva encabezados y pies del navegador. Cada tarjeta conserva además un botón de impresión manual.

## Comportamiento esperado

- El backend crea el ticket solamente al confirmar el pago; las comandas de salón se abren desde el POS.
- El ticket queda fijado a una sucursal y el alcance del usuario se valida tanto en el tablero como en SSE y Push.
- Un pedido nuevo produce sonido, vibración, resaltado, notificación del sistema y, si está habilitada, impresión.
- Si una mesa agrega platos mientras el ticket está en cola o aceptado, el KDS recibe `TICKET_UPDATED`, refresca los renglones y envía una nueva alerta Push a la cocina del mismo local.
- Al iniciar `PREPARING`, la comanda queda cerrada a nuevas ampliaciones y el inventario reservado se consume definitivamente.
- Al marcar `READY`, el siguiente módulo toma el relevo: Reparto confirma el retiro de delivery y Salón cierra la mesa. Solo el recojo se entrega directamente desde Cocina/mostrador.
- Los pedidos programados no aparecen al pagar: se liberan automáticamente cuando falta exactamente el tiempo de preparación configurado para la sucursal.
- El KDS muestra modalidad, hora programada, cobro operativo pendiente, composición, personalizaciones, notas, faltantes y alérgenos; nunca expone datos de tarjeta ni facturación.
- Si SSE se desconecta, el indicador cambia a “Reconectando · respaldo activo”.
- Si la API queda desactualizada, aparece una banda persistente que advierte que puede haber pedidos no visibles.
