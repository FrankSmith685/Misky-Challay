# Roadmap de construcción — Verde Bowl V3

Tareas ordenadas, derivadas del *Análisis Funcional y Modelo de Datos v1.0*.
Cada fase termina con algo **usable y probado**. No se pasa a la siguiente sin cerrar la anterior.

Leyenda: `[x]` hecho · `[ ]` pendiente · **RN-xxx** = regla de negocio del análisis · **Mxx** = módulo funcional.

---

## FASE 0 — Decisiones que bloquean el código (sección 19 del PDF)

### Decididas (14 de julio de 2026)

- [x] **Ciudad y sucursales**: **Lima, 1 sucursal.** Se mantienen las tablas multi-sucursal (`branches`, `zone_branches`), pero la asignación arranca trivial.
- [x] **Modelo de venta**: **compra directa; los planes con saldo llegan en la Fase 5.** El checkout del MVP no depende de la billetera.
- [x] **Nutrición**: **carga manual por producto/variante** (`product_nutrition`). Se modela igual `ingredient_nutrition` para migrar a cálculo por receta sin romper nada.
- [x] **Entrega**: **delivery propio + recojo en tienda + delivery con tercero.** Hacen falta `drivers`, `deliveries`, `delivery_events` y un adaptador de proveedor externo.

### Pendientes (no bloquean la Fase 1, sí la Fase 3)

- [ ] **Pago**: ¿qué pasarela (Culqi, Niubiz, Mercado Pago, Izipay)? ¿comprobante electrónico?
- [ ] **Promociones**: ¿cupones simples o motor de reglas desde el inicio?
- [ ] **Inventario**: ¿control por ingrediente real o solo disponibilidad manual del producto?
- [ ] **Menú**: ¿carta fija + menú diario rotativo + bowls personalizados desde el día 1?
- [ ] **Vigencia del saldo** (Fase 5): ¿qué pasa al vencer? ¿se renueva o transfiere?
- [ ] **Programación** (Fase 5): ¿un pedido a la vez o una semana completa? ¿hora límite de edición?
- [ ] **Marca**: nombre definitivo, dominio, paleta, tipografía, fotos propias.

**Entregables previos a programar en serio:** wireframes de las pantallas principales + DER definitivo + contratos de `/checkout/quote` y `/checkout/place`.

---

## FASE 1 — Fundación (esqueleto y cuentas)

### 1.1 Esqueleto técnico — **COMPLETADO**

- [x] Monorepo con npm workspaces y `npm run dev` que levanta front + back a la vez
- [x] Backend: Express + TypeScript + Sequelize + MySQL, alias de imports, ESLint/Prettier
- [x] Conexión a MySQL con **creación automática** de `verde_bowl_v3` e interruptores `DB_SYNC / DB_ALTER / DB_FORCE / DB_SEED`
- [x] Contrato único de respuesta (`success`, `message`, `data`, `meta`) y manejador central de errores
- [x] Middlewares: `authenticate`, `requirePermissions`, `validate` (zod), rate limiting, CORS, helmet
- [x] RBAC: modelos `users`, `roles`, `permissions`, `user_roles`, `role_permissions` + seeder con 9 roles y admin inicial
- [x] Módulo `auth` funcional: registro, login, refresh, logout, `/me` con JWT
- [x] Frontend: Vite + React + Tailwind v4 (design tokens) + router con lazy loading y guards
- [x] Estado: Redux Toolkit (`auth`, `cart`, `catalog`, `ui`) + Context `useAppState` (contexto de compra)
- [x] Cliente axios con interceptores (token, refresh automático en 401) y mapa de endpoints
- [x] Health check `/api/v1/health` visible en la portada

### 1.2 Cuenta del cliente (M02)

- [x] Tabla `addresses` + CRUD autenticado (`/account/addresses`), con dirección predeterminada única
- [ ] Tablas `customer_profiles`, `customer_preferences`
- [ ] Pantallas: registro completo, recuperación de contraseña, perfil, libreta de direcciones en la UI
- [ ] Verificación de email (token + envío por correo)
- [ ] Preferencias dietarias y alérgenos a evitar (RN-022: solo para la finalidad informada)

### 1.3 Geografía y cobertura (M03) — **núcleo COMPLETADO**

- [x] Tablas `cities`, `districts`, `coverage_zones`, `branches`, `zone_branches`, `branch_schedules`, `delivery_slots`
- [x] Servicio de cobertura: dirección → zona → sucursal elegible → costo, mínimo y ETA (**RN-001, RN-002, RN-003**)
- [x] Endpoints: `/locations/cities`, `/districts`, `/branches`, `POST /coverage`, `/slots`
- [x] Cobertura por **polígono** (punto-en-polígono) o por **distrito** (sin geocodificar)
- [x] Frontend: `CoverageChecker` + modal global de dirección conectado a `useAppState`; `CoveragePage` con locales
- [x] Seeder: Lima, 11 distritos (8 con cobertura, 3 sin), zona "Lima Centro-Sur", sucursal Miraflores, horarios 10:00–22:00 y franjas de 7 días
- [ ] Admin: ABM de ciudades, zonas (polígono), sucursales y horarios
- [ ] Geocodificación real de la dirección (Google/Mapbox) para reemplazar la selección de distrito
- [ ] Nota técnica: el polígono se guarda como JSON y se evalúa en el servicio. Si la geo crece, migrar a `ST_Contains` (MySQL) o PostGIS sin cambiar la interfaz del servicio.

**Estado:** el visitante ya ingresa su distrito o coordenadas y el sistema le responde si hay cobertura, qué cocina lo atiende, cuánto cuesta el delivery y en cuánto llega.

---

## FASE 2 — Catálogo y constructor de bowls — **COMPLETADA**

### 2.1 Catálogo (M04)

- [x] Tablas `categories`, `products`, `product_variants`, `product_nutrition`, `allergens`, `product_allergens`, `dietary_tags`, `product_dietary_tags`, `branch_product_availability`
- [x] Endpoints: `/catalog/categories`, `/allergens`, `/dietary-tags`, `/products` (con filtros), `/products/:slug`
- [x] Filtros: categoría, búsqueda, etiqueta dietaria, calorías máximas, proteína mínima y **alérgenos a evitar**
- [x] Disponibilidad por sucursal: lo que esa cocina no prepara no se ofrece (**RN-005**)
- [x] Frontend: `MenuPage` con filtros + `ProductPage` con variantes, nutrición y alérgenos
- [x] Catálogo de ejemplo sembrado: 12 productos (bowls, wraps, entrantes, postres, bebidas)
- [ ] Admin: ABM de productos con vista previa y publicación controlada
- [ ] Imágenes reales (`product_images` + almacenamiento/CDN)
- [ ] Ingredientes y recetas (`ingredients`, `ingredient_nutrition`): solo si se pasa a nutrición calculada

### 2.2 Motor de personalización (M05)

- [x] Tablas `customization_groups`, `customization_options`, `product_customization_groups`, `option_incompatibilities`, `branch_option_availability`
- [x] Cotización: precio = variante + Σ price_delta, respetando `free_quantity` (**RN-006, RN-007**)
- [x] **Suplementos** (`charge_always`): las opciones premium se cobran siempre y no consumen las unidades incluidas (ej. salmón dentro de "1 proteína incluida")
- [x] Nutrición = base + Σ opciones × cantidad (**RN-008**)
- [x] Validación de mínimos, máximos, tipo de paso (SINGLE/MULTIPLE), incompatibilidades y opciones agotadas
- [x] Endpoints `/customizations/:productId` (config) y `POST /customizations/quote` (recotización)
- [x] Frontend `BuilderPage`: 5 pasos (base → proteína → salsa → toppings → crunch) con precio y calorías recalculados por el backend en cada cambio
- [x] Descripción legible de la selección ("Regular · Base: Quinoa · Proteína: Salmón · …")
- [x] Carrito local (Redux + localStorage) con items del menú y bowls armados
- [ ] Editar un bowl ya agregado desde el carrito

**Reglas del builder sembradas (ajustables desde datos, sin tocar código):**

| Paso | Tipo | Mín–Máx | Incluidas | Notas |
| --- | --- | --- | --- | --- |
| Base | SINGLE | 1–1 | 1 | Quinoa +S/2.50 |
| Proteína | MULTIPLE | 1–2 | 1 | Premium (salmón, atún, langostinos) = suplemento siempre cobrado |
| Salsa | MULTIPLE | 1–2 | 1 | La segunda se cobra |
| Toppings | MULTIPLE | 2–8 | 4 | Desde el 5.º se cobra el más barato primero |
| Crunch y extras | MULTIPLE | 0–3 | 0 | Todos se cobran |

---

## FASE 3 — Compra completa — **COMPLETADA** (pasarela: **Stripe**)

### 3.1 Cupones y promociones (M07)

- [x] Tablas `coupons`, `coupon_redemptions`
- [x] Tres tipos de cupón: **porcentaje** (con tope), **importe fijo** y **delivery gratis**
- [x] Validación: vigencia, monto mínimo, límite global y límite por usuario (**RN-010**)
- [x] Ciclo del canje: RESERVED al crear el pedido → CONFIRMED al pagar → RELEASED si falla o se cancela (**RN-011**)
- [x] Cupones sembrados: `VERDE10`, `BIENVENIDO`, `ENVIOGRATIS`
- [ ] Motor de promociones por reglas (`promotions`, `promotion_rules`) — solo si el negocio lo pide
- [ ] Carrito persistido en el backend (`carts`, `cart_items`): hoy vive en Redux + localStorage y el checkout lo revalida entero

### 3.2 Checkout (M08)

- [x] `POST /checkout/quote`: recotiza **todo** contra el catálogo real; no confía en los precios del frontend (**RN-007**)
- [x] La **sucursal la asigna el servidor** desde la dirección, no la elige el cliente (**RN-001, RN-002**)
- [x] Delivery y pedido mínimo tomados de la zona; bloquea si no se alcanza el mínimo
- [x] Modalidad DELIVERY / PICKUP y modo ASAP / SCHEDULED con **reserva de cupo transaccional** (**RN-004**)
- [x] `POST /checkout/place`: crea el pedido en `PENDING_PAYMENT` con clave de idempotencia (**RN-015**)
- [x] Checkout de **invitado** (sin cuenta) y de cliente autenticado

### 3.3 Pedidos (M09)

- [x] Tablas `orders`, `order_items`, `order_item_customizations`, `order_discounts`, `order_status_history`
- [x] **Snapshots inmutables**: nombre, precio, personalización, nutrición y alérgenos comprados (**RN-017**)
- [x] Máquina de estados que rechaza transiciones inválidas + historial con actor y origen (**RN-021**)
- [x] `GET /orders`, `GET /orders/:orderNumber`, `POST /orders/:orderNumber/cancel` (**RN-018**)
- [x] Aislamiento: un cliente no puede ver ni cancelar el pedido de otro (403 verificado)
- [ ] Repetir un pedido anterior

### 3.4 Pagos con Stripe (M08)

- [x] Adaptador `PaymentProvider` en `backend/src/integrations/payments/`: el dominio no conoce Stripe
- [x] **StripeProvider**: Checkout Session alojada (ningún dato de tarjeta toca el servidor ni la web) + idempotencia nativa de Stripe
- [x] **MockProvider**: simulador local con el mismo ciclo y webhook firmado, para desarrollar sin claves
- [x] **Webhook firmado = única fuente de verdad** (**RN-014**): con firma inválida no se toca nada (401)
- [x] Deduplicación por id de evento en `webhook_events`: Stripe reintenta y no se confirma dos veces (**RN-015**)
- [x] Pago fallido → pedido CANCELADO y liberación de cupón y cupo
- [x] Tablas `payments`, `payment_attempts`, `refunds` + reembolsos con permiso `payment.refund` (**RN-019**)
- [ ] Probar contra Stripe real en modo test (pendiente de tus claves)
- [ ] Conciliación periódica (job que compara pagos con Stripe)

### 3.5 Notificaciones

- [ ] Email transaccional: pedido confirmado, en preparación, en camino, entregado

**Estado:** el ciclo de venta funciona de punta a punta. Falta enchufar las claves reales de Stripe y avisar por email.

---

## FASE 4 — Operación — **COMPLETADA**

### 4.1 Cocina (M10)

- [x] Tablas `kitchen_tickets`, `kitchen_ticket_events`
- [x] El ticket se crea **solo cuando el webhook confirma el pago**: la cocina no cocina sin cobrar
- [x] Cola ordenada por prioridad y **hora comprometida**; marca los pedidos con retraso
- [x] Flujo con transiciones validadas: EN COLA → ACEPTADO → PREPARANDO → LISTO → DESPACHADO
- [x] El estado del ticket arrastra el del pedido (PREPARING, READY) y el recojo en tienda cierra en DELIVERED
- [x] Mide el tiempo real de preparación de cada ticket (alimenta los reportes)

### 4.2 Inventario (M10)

- [x] Tablas `inventory_items`, `branch_inventory`, `inventory_movements`, `recipes`, `recipe_items`
- [x] **RN-016 completo**: reserva al confirmar el pago → consumo definitivo al preparar → liberación al cancelar
- [x] Los platos fijos consumen por **receta** (con merma); los bowls, por **cada opción elegida**
- [x] **Bloqueo automático**: si un insumo llega a cero, las opciones que lo usan se marcan agotadas en esa sucursal y desaparecen del constructor. Al reponer, vuelven solas (**RN-005**)
- [x] Libro de movimientos inmutable: entrada, reserva, liberación, consumo, merma y ajuste
- [x] Aviso de insumos bajo el nivel mínimo
- [x] 34 insumos, 8 recetas y stock inicial sembrados

### 4.3 Delivery (M11)

- [x] Tablas `deliveries`, `delivery_events`, `drivers`
- [x] El reparto se abre junto con el ticket, solo si el pedido es delivery
- [x] Asignación a **repartidor propio** o a **proveedor externo** (las tres modalidades de la Fase 0)
- [x] Flujo validado: PENDIENTE → ASIGNADO → RECOGIDO → EN RUTA → ENTREGADO
- [x] El repartidor se marca ocupado al asignarlo y libre al cerrar la entrega
- [x] El estado del reparto arrastra el del pedido (OUT_FOR_DELIVERY, DELIVERED)
- [ ] Prueba de entrega con foto o firma
- [ ] Integración real con un proveedor externo (hoy se guarda su referencia)

### 4.4 Panel administrativo (M13)

- [x] Tablero de **pedidos en tiempo real** con filtros por estado y búsqueda, refresco automático
- [x] Tablero de **cocina** tipo kanban, refresco cada 5 segundos
- [x] Tablero de **reparto** con asignación de repartidor
- [x] **Inventario** con movimientos manuales (compra, merma, ajuste) y aviso de stock bajo
- [x] **Reportes**: ventas, ticket promedio, descuentos, % delivery, cancelaciones, tiempo de preparación y productos más vendidos
- [x] **Auditoría** (`audit_logs`): quién cambió qué, con valores antes/después, IP y user-agent (**RN-021**)
- [x] Permisos reales por endpoint: un cliente recibe 403 al pedir reportes
- [ ] ABM de catálogo desde el panel (hoy el catálogo se administra por el seeder)
- [ ] `system_settings`, `support_tickets`, libro de reclamaciones

**Estado:** el ciclo completo funciona: pedido pagado → ticket de cocina con insumos reservados → preparación que consume stock → reparto asignado → entregado.

---

## FASE 5 — Planes y billetera — **COMPLETADA**

### Decisiones tomadas (14 de julio de 2026)

- El plan da **saldo con bonificación + descuento por pedido + delivery gratis** (configurable por plan, en datos).
- El saldo **se pierde al vencer** (movimiento `EXPIRATION`).
- **Pago mixto**: si el saldo no alcanza, se aplica todo y el resto se cobra con Stripe.

### 5.1 Planes y billetera (M06)

- [x] Tablas `plans`, `plan_benefits`, `user_plans`, `wallets`, `wallet_transactions`
- [x] Comparador de planes con precio, saldo otorgado, bonificación, vigencia y beneficios
- [x] **RN-012**: la activación nace en PENDING_PAYMENT y solo el webhook la activa y acredita el saldo
- [x] **RN-013**: todo crédito o débito pasa por el libro mayor, con `balance_after` congelado y clave de idempotencia. El saldo nunca se edita a mano
- [x] La billetera se bloquea (`SELECT … FOR UPDATE`) durante cada movimiento: dos pedidos simultáneos no pueden gastar el mismo saldo
- [x] Snapshot del plan en la activación: si el plan cambia, la compra sigue diciendo qué se compró y por cuánto
- [x] Beneficios aplicados por el motor de precios como descuentos explicados (`order_discounts`, source `PLAN_BENEFIT`)
- [x] Si el cliente tiene varios planes activos, se toma el mejor beneficio de cada tipo
- [x] **Pedido 100% con saldo**: no pasa por Stripe; se registra un pago `provider: wallet` y se confirma internamente
- [x] El saldo se **debita al crear el pedido** y se **devuelve** (`REFUND`) si el pago falla o el pedido se cancela
- [x] **Job de vencimiento** cada hora: expira planes vencidos y anula el saldo restante
- [x] Frontend: comparador de planes, "Mi saldo" con movimientos, y casilla de "usar mi saldo" en el checkout
- [x] Planes sembrados: Prueba (S/150→165), Semana Verde (S/300→345), Mes Completo (S/600→720)
- [ ] Aviso por email antes de que venza el saldo

### 5.2 Pedidos programados

- [x] Selección de franja horaria en el checkout, con cupos visibles
- [x] Reserva de cupo transaccional al crear el pedido (**RN-004**)
- [x] El ticket de cocina usa la **hora de la franja** como hora comprometida, no "ahora + preparación"
- [ ] Programar varios días de golpe desde un calendario semanal
- [ ] Job que libera el pedido programado a cocina según el tiempo de preparación (hoy el ticket se crea al pagar)

**Estado:** el cliente compra un plan, recibe saldo con bonificación, y sus pedidos aplican solos el descuento y el delivery gratis, pagando con saldo, con tarjeta o con ambos.

---

## FASE 6 — Optimización

- [ ] PWA / instalable, imágenes optimizadas y CDN
- [ ] Favoritos, reseñas verificadas (solo con pedido entregado, **RN-020**), newsletter
- [ ] Caché (Redis) para catálogo, cupos e idempotencia
- [ ] SEO: metadatos, sitemap, datos estructurados, contenido indexable (evaluar SSR si hace falta)
- [ ] Analítica de conversión y abandono por paso
- [ ] Recomendaciones y automatizaciones

---

## Pruebas mínimas por fase (sección 17.2)

| Tipo        | Qué cubre                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| Unitarias   | Reglas del builder, precios, promociones, saldo, cobertura, transiciones   |
| Integración | Checkout, inventario, pagos y webhooks                                     |
| E2E         | Registro → bowl → pago → cocina → entrega                                  |
| Seguridad   | Autorización por rol/sucursal, acceso cruzado, rate limiting               |

## Riesgos que hay que vigilar (sección 20)

- Construir de más antes de vender: el MVP es **pedido completo**, no todas las funciones.
- Sobreventa de stock o cupos → reservas temporales + revalidación en checkout.
- Pagos duplicados → idempotencia + webhooks firmados + conciliación.
- Nutrición incorrecta → unidades consistentes y una fuente responsable de los datos.
