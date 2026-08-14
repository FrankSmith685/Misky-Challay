# Aplicación móvil — Fase 3

Fecha: 9 de agosto de 2026  
Versión: 0.3.0  
Estado: implementada, tipada y exportada para Android

## Resultado

La aplicación móvil ya cubre el ciclo de compra del cliente y el pedido desde una mesa. Reutiliza el backend existente: la app presenta la experiencia nativa, mientras precios, stock, cobertura, cupones, pagos y comandas siguen siendo validados por la API.

```text
Carta → Producto → Constructor → Carrito → Checkout → Pago / seguimiento
                                      └── Mesa QR → Comanda → Cocina
```

## Funciones implementadas

### Carrito persistente

- Nueva pestaña con insignia de unidades.
- Persistencia mediante AsyncStorage; SecureStore continúa reservado para credenciales.
- Modificación de cantidades, eliminación de líneas y vaciado con confirmación.
- Conserva los identificadores de ingredientes necesarios para volver a cotizar.
- El precio del carrito es informativo; el checkout siempre solicita una cotización nueva.

### Constructor de bowls

- Carga variantes, grupos, opciones, disponibilidad y presets desde `/customizations/:productId`.
- Aplica selección única o múltiple, mínimos, máximos, cantidad por ingrediente e incompatibilidades.
- No permite agregar el bowl hasta recibir `/customizations/quote`.
- Muestra precio, descripción y macros calculados por el servidor.

### Direcciones y cobertura

- `/account/addresses` exige sesión. Después del login, el cliente vuelve al flujo solicitado.
- Selección jerárquica de departamento, provincia y distrito del Perú.
- Búsqueda de dirección concreta y selección de coordenadas.
- Verificación mediante `/locations/coverage` antes de habilitar el guardado.
- Presenta local asignado, tiempo estimado y tarifa de delivery.
- Incluye listado, dirección principal y eliminación segura.

### Checkout

- Delivery exige dirección guardada; recojo exige local.
- Pago en línea o efectivo, cupón, indicaciones y contacto de la cuenta.
- Boleta o factura; la API valida DNI, RUC y razón social.
- `/checkout/quote` recalcula stock, precios, delivery, descuentos, mínimo, IGV y tiempo.
- `/checkout/place` exige sesión y una clave de idempotencia para evitar duplicados.
- La URL del proveedor se abre fuera de la app; al regresar, “Mis pedidos” consulta el estado real.

### Pedido en restaurante por QR

- Cámara nativa mediante `expo-camera`, con permiso explícito y sin almacenar imágenes.
- Lee una URL Verde Bowl o un token QR de mesa.
- `/operations/dining/qr/:token` determina mesa, área, local, carta y comanda abierta.
- El comensal puede pedir sin cuenta, ver menús del día e indicar instrucciones.
- `/operations/dining/qr/:token/orders` abre o amplía la comanda y actualiza Cocina.
- El pago y el comprobante de salón se cierran con el personal en Caja.

## Seguridad y decisiones técnicas

- Tokens de sesión: SecureStore.
- Carrito no sensible: AsyncStorage.
- Las direcciones se guardan en la API bajo el usuario autenticado.
- El backend resuelve la mesa y el local; la app no confía en una sede elegida manualmente.
- El checkout no confía en totales locales ni almacena datos de tarjeta.
- Las respuestas HTTP 204 se manejan correctamente al eliminar recursos.

## Cómo probar

1. Inicia backend y frontend con `npm run dev`.
2. Inicia la app con `npm run dev:mobile` y abre el QR en Expo Go actualizado.
3. Agrega una receta y un bowl personalizado; reabre Expo Go para comprobar la persistencia.
4. Inicia sesión, abre `Cuenta → Direcciones`, busca un punto y valida cobertura.
5. Confirma un checkout de recojo y otro de delivery.
6. En el panel web abre `Operación → Mesas`, muestra el QR de una mesa y escanéalo desde “En salón”.
7. Envía platos y confirma que la comanda aparece o se actualiza en Cocina.

## Validación técnica

- `tsc --noEmit`: correcto.
- `expo install --check`: dependencias alineadas con Expo SDK 57 usando el mapa local.
- Export Android: correcto, 1,309 módulos.
- Bundle Hermes: 3.2 MB.
- Salida local: `mobile/.expo/phase3-final`.

## Alcance posterior

- Notificaciones push nativas de cambios de pedido.
- Retorno universal/deep link desde cada proveedor de pago en producción.
- GPS y mapa nativo editable.
- Compilaciones firmadas AAB/APK mediante EAS y publicación en tiendas.

