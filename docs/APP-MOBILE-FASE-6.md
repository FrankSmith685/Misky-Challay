# App móvil Verde Bowl — Fase 6

## Resultado

La Fase 6 convierte la app en una experiencia persistente y medible: los favoritos acompañan al cliente entre dispositivos, las opiniones solo nacen de compras entregadas, las recomendaciones usan datos reales de la cuenta y toda medición opcional requiere consentimiento.

La versión entregada es `0.6.0`.

## Favoritos sincronizados

- Tabla `product_favorites` con unicidad por cliente y producto.
- Alta, listado y eliminación autenticados.
- Corazón accesible en inicio, menú y ficha del producto.
- Filtro de favoritos dentro del menú.
- Pantalla “Mis favoritos” con recarga y estado vacío.
- Limpieza visual automática al cerrar sesión; los datos permanecen vinculados a la cuenta.

## Reseñas verificadas — RN-020

- Tabla `product_reviews`, ligada de forma única a una línea de pedido.
- El backend comprueba propietario, producto y estado `DELIVERED`.
- Escala obligatoria de 1 a 5 y comentario opcional de hasta 800 caracteres.
- Resumen público con promedio, cantidad, autor abreviado y sello de compra verificada.
- Pantalla para calificar compras pendientes.
- Acceso directo desde el detalle de un pedido entregado.
- La ficha muestra promedio y opiniones recientes.

## Comunicaciones y privacidad

- Tabla `newsletter_subscriptions`, independiente de los avisos operativos del pedido.
- El cliente puede activar o retirar promociones desde “Preferencias y privacidad”.
- La analítica móvil nace desactivada.
- No se envían contraseñas, direcciones, notas, documentos ni información de pago.
- Desactivar la medición no altera pedidos, precios, saldo ni cobertura.

## Recomendaciones

El endpoint considera:

1. Favoritos del usuario.
2. Productos de pedidos entregados anteriormente.
3. Preferencias alimentarias declaradas.
4. Alérgenos excluidos.
5. Disponibilidad de la sede actual.
6. Productos destacados como respaldo para usuarios nuevos.

Cada tarjeta explica el motivo: favorito, repetición, afinidad alimentaria o recomendación general.

## Analítica visible para administración

Eventos móviles con consentimiento:

- apertura de app y menú;
- vista de producto;
- favorito agregado o retirado;
- producto agregado al carrito;
- inicio y cotización del checkout;
- pedido creado;
- reseña enviada;
- recomendación abierta.

El panel muestra sesiones únicas, cotizaciones, pedidos, conversión, favoritos, reseñas y aperturas de recomendaciones. Una misma sesión no infla el embudo al recalcular varias veces.

## Contratos API

- `GET /engagement/favorites`
- `POST /engagement/favorites/:productId`
- `DELETE /engagement/favorites/:productId`
- `GET /engagement/products/:productId/reviews`
- `GET /engagement/reviews/pending`
- `POST /engagement/reviews`
- `PUT /engagement/reviews/:reviewId`
- `GET /engagement/recommendations`
- `GET /engagement/newsletter`
- `PUT /engagement/newsletter`
- `POST /engagement/events`

## Base de datos

Migración aplicada: `0020-engagement-fase-6.ts`.

Agrega:

- `product_favorites`;
- `product_reviews`;
- `newsletter_subscriptions`;
- nuevos tipos controlados de eventos UX.

## Verificación

- TypeScript de backend, frontend y móvil aprobado.
- 57 pruebas del backend aprobadas.
- Casos unitarios explícitos para RN-020 y límites de reseña.
- Prueba autenticada de alta/listado/baja de favoritos.
- Consulta real de recomendaciones y reseñas pendientes.
- Cambio y restauración del consentimiento de newsletter.
- Migración 0020 aplicada correctamente.

## Alcance que permanece abierto

La Fase 6 general del sistema también enumera PWA/CDN, Redis y SEO. Son trabajos de infraestructura o de la web pública, no requisitos del APK móvil, y permanecen abiertos de forma explícita en `ROADMAP.md`.
