# Verde Bowl V3

Plataforma web de comida saludable: catálogo, constructor de bowls, planes con saldo, cobertura por zona y operación (cocina, inventario, delivery).

Monorepo con **npm workspaces**: un solo `npm run dev` levanta frontend y backend a la vez.

| Capa     | Stack                                                                       |
| -------- | --------------------------------------------------------------------------- |
| Frontend | React 18 + TypeScript + Vite + Tailwind v4 + Redux Toolkit + Context + axios |
| Backend  | Node + TypeScript + Express + Sequelize + MySQL + JWT + Zod                  |

---

## 1. Requisitos

- Node.js 20 o superior (probado con 22)
- MySQL 8 corriendo en `localhost:3306`

## 2. Puesta en marcha

```bash
npm install                 # instala frontend + backend (desde la raíz)
```

Edita `backend/.env` y pon la contraseña de tu MySQL:

```env
DB_USER=root
DB_PASSWORD=tu_password_de_mysql
DB_NAME=verde_bowl_v3
```

> **No hace falta crear la base de datos a mano.** Al arrancar, el backend ejecuta
> `CREATE DATABASE IF NOT EXISTS verde_bowl_v3`, crea las tablas desde los modelos
> y carga permisos, roles, el superadmin, el maestro UBIGEO y los datos comerciales
> necesarios para revisar la aplicación.

```bash
npm run dev                 # backend :4000  +  frontend :5173
```

- Frontend: http://localhost:5173
- API: http://localhost:4000/api/v1/health
- Superadmin inicial: `admin@verdebowl.com` / `Admin123*` (se configura en `backend/.env`)

La portada muestra un panel de diagnóstico que confirma si el frontend está hablando con el backend y con la base de datos.

## 3. Comandos

| Comando                                | Qué hace                              |
| -------------------------------------- | ------------------------------------- |
| `npm run dev`                          | Levanta backend y frontend en paralelo |
| `npm run dev:backend` / `dev:frontend` | Solo una de las dos capas             |
| `npm run build`                        | Compila ambos para producción         |
| `npm run typecheck`                    | Verifica tipos en ambos proyectos     |
| `npm run lint`                         | ESLint en ambos proyectos             |
| `npm run format`                       | Prettier sobre todo el repo           |
| `npm run db:seed`                      | Reejecuta los seeders (idempotentes)  |

## 4. Interruptores de la base de datos

Están en [backend/src/index.ts](backend/src/index.ts) (`DATABASE_STARTUP`) y se controlan desde `backend/.env`:

| Variable         | Efecto                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| `DB_AUTO_CREATE` | Crea `verde_bowl_v3` si no existe                                       |
| `DB_SYNC`        | `true`: crea/actualiza tablas desde los modelos. `false`: no las toca   |
| `DB_ALTER`       | `true`: agrega columnas nuevas **sin borrar datos**                     |
| `DB_FORCE`       | `true`: **BORRA** todas las tablas y las recrea vacías (empezar de cero) |
| `DB_SEED`        | `true`: inserta los datos base que falten                               |
| `SEED_DEMO_DATA` | `true`: agrega catálogo, planes, cupones, sucursal y operación; por defecto `true` |

Flujo real: en **desarrollo** trabajas con `DB_SYNC=true, DB_ALTER=true` (tocas un modelo, reinicias, la tabla se ajusta sola). En **producción** el esquema se construye solo con migraciones, y el arranque falla si detecta esos interruptores activos.

| Comando | Qué hace |
| ------- | -------- |
| `npm run db:migrate --workspace backend` | Aplica las migraciones pendientes |
| `npm run db:migrate:status --workspace backend` | Qué falta por aplicar |
| `npm run db:migrate:create --workspace backend -- --name algo` | Crea una migración |
| `npm run db:check-drift --workspace backend` | Comprueba que migraciones y modelos coinciden |

Lo que evita que el híbrido se rompa es el **chequeo de deriva**: levanta dos bases —una desde las migraciones, otra con `sync()` desde los modelos— y compara los esquemas. Si cambias un modelo y olvidas la migración, CI falla en el pull request en lugar de descubrirlo en producción. Detalle completo en [backend/src/database/migrations/README.md](backend/src/database/migrations/README.md).

### Dos reglas que evitan problemas reales

**1. Índices únicos siempre con nombre.** En los modelos nunca uses `unique: true` en la columna: decláralo en `indexes: [{ name: 'uq_tabla_campo', unique: true, fields: ['campo'] }]`. Con `DB_ALTER=true`, MySQL vuelve a crear el índice sin nombre en cada arranque (`email_2`, `email_3`...) hasta reventar el límite de 64 claves.

**2. Seeds idempotentes.** En desarrollo puedes dejar `DB_SEED=true` y `SEED_DEMO_DATA=true`: solo crea los datos que falten y conserva los cambios hechos desde el panel. En producción usa `SEED_DEMO_DATA=false` para cargar solamente permisos, roles, superadmin y UBIGEO.

## 5. Pagos con Stripe

Mientras `STRIPE_SECRET_KEY` esté vacía, el sistema usa un **simulador local**: mismo ciclo, mismo webhook firmado, misma confirmación por evento. Al pagar te lleva a `/checkout/simulador`, donde eliges "pago aprobado" o "tarjeta rechazada".

Para enchufar Stripe de verdad:

```bash
# 1. Pon tu clave de test en backend/.env
STRIPE_SECRET_KEY=sk_test_...

# 2. Reenvía los webhooks de Stripe a tu backend local
stripe listen --forward-to localhost:4000/api/v1/payments/webhooks/stripe

# 3. Copia el whsec_... que imprime ese comando
STRIPE_WEBHOOK_SECRET=whsec_...
```

Reinicia y listo: el botón de pagar abre la página de Stripe. **Nada más cambia**, porque el resto del sistema solo conoce la interfaz `PaymentProvider` ([backend/src/integrations/payments/](backend/src/integrations/payments/)).

Reglas implementadas y probadas:

- Un pedido pasa a `CONFIRMED` **solo** por un webhook con firma válida. La página de éxito no confirma nada: consulta el estado al backend.
- El mismo evento reenviado por Stripe no confirma dos veces (`webhook_events` con UNIQUE por `event_id`).
- Dos clics en "Pagar" con la misma clave de idempotencia devuelven el mismo pedido, no dos.
- Si el pago falla, el pedido se cancela y se liberan el cupón, el cupo de la franja y el saldo.

## 6. Notificaciones por email

Mientras `MAIL_HOST` esté vacía, los correos **se imprimen en la consola** en vez de enviarse. Así ves exactamente qué recibiría el cliente sin configurar nada.

Para enviar de verdad (Gmail, SendGrid, Resend, Mailgun... todos hablan SMTP):

```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=tu@gmail.com
MAIL_PASSWORD=tu-app-password
```

Correos que ya se disparan solos:

| Cuándo | Correo |
| --- | --- |
| El webhook confirma el pago | "Tu pedido está confirmado" (con los platos y el total) |
| La cocina empieza a preparar | "Estamos preparando tu pedido" |
| El reparto sale | "Tu pedido va en camino" |
| Se entrega | "Buen provecho" |
| Se cancela | "Pedido cancelado" (explica que se devolvió el saldo y el cupón) |
| Se activa un plan | "Tu plan está activo" (con el saldo y la fecha de vencimiento) |

Dos garantías: **el correo nunca bloquea el pedido** (se manda después y en segundo plano; si el proveedor falla, el pedido sigue vivo) y **no se manda dos veces** (cada aviso lleva clave de idempotencia). Todo queda registrado en la tabla `notifications`, para poder responder con datos cuando alguien diga "no me llegó nada".

## 7. Estructura

```
Verde Bowl V3/
|
+-- backend/src/
|   |-- index.ts             arranque + interruptores de BD
|   |-- app.ts               Express: middlewares y montaje de rutas
|   |-- config/              env (validado con zod), logger, permisos y constantes
|   |-- database/
|   |   |-- connection.ts    instancia de Sequelize
|   |   |-- bootstrap.ts     crear BD -> sincronizar -> seeders
|   |   |-- models/          tablas + asociaciones (index.ts las registra)
|   |   |-- seeders/         datos base idempotentes
|   |   +-- migrations/      cuando DB_SYNC pase a false
|   |-- modules/             un dominio por carpeta: routes/controller/service/validation
|   |   |-- auth  access  geo  catalog  customization  pricing  plans
|   |   +-- cart  checkout  orders  payments  operations  delivery  admin
|   |-- middlewares/         auth, rbac, validate, rate limit, errores
|   |-- shared/              ApiError, ApiResponse, jwt, password, scope, audit
|   |-- integrations/        pasarela de pago (Stripe + simulador)
|   +-- jobs/                tareas programadas
|
+-- frontend/src/
    |-- main.tsx  router/    rutas con lazy loading y guards por permiso
    |-- app/                 store de Redux, hooks tipados, providers
    |-- context/             AppStateContext -> useAppState()
    |-- features/            un dominio por carpeta: pages/ components/ hooks/ services/
    |-- components/          ui/ (Button, Input, Card, Modal), layout/, common/
    |-- services/api/        cliente axios + endpoints
    +-- lib/ hooks/ types/ constants/ styles/
```

## 8. Roles, permisos y el panel

**El panel es UNO SOLO.** No hay "panel del nutricionista" ni "panel del admin": todos entran a `/admin` y **ven cosas distintas según sus permisos**. Mismo edificio, distintas llaves.

### La jerarquía

- **Permiso** = la unidad atómica. Un verbo sobre un recurso: `nutrition.write`, `order.cancel`, `report.sales.read`. Los define el código (35 en total).
- **Rol** = un paquete de permisos con nombre. Se arman **desde el panel, sin programar**.
- **Pantalla** = se muestra si tienes los permisos que pide. El menú lateral **se arma solo** desde tus permisos.

Ocultar un botón es solo comodidad: **la seguridad real la valida el backend en cada endpoint**. Si alguien escribe la URL a mano, recibe un 403.

### La segunda dimensión: el alcance

```
autorización = permiso (QUÉ puedes hacer) + alcance (SOBRE QUÉ sucursal)
```

El admin de Miraflores y el de San Isidro tienen **los mismos permisos**; los separa la sucursal asignada en `user_roles.branch_id`. **Sin sucursal asignada = alcance global.** El backend valida el `branchId` de cada petición contra el alcance del token: cambiar el número en la URL devuelve 403.

### El superadmin no es un rol

Es una **marca en el usuario** (`isSuperAdmin`). Si fuera "un rol con todos los permisos", bastaría con editarle el rol para dejarlo fuera. Las protecciones:

- Se salta la verificación de permisos por definición.
- **No se puede quitar al último superadmin**: el sistema se quedaría sin dueño.
- Los **roles del sistema no se borran** (sí se editan sus permisos).
- **Nadie puede otorgar un permiso que él mismo no tiene**, lo que impide que alguien con `role.manage` se cree un rol con `payment.refund` y se devuelva dinero.
- Todo cambio de roles y permisos queda en la bitácora de auditoría.

### Los roles sembrados

| Rol                   | Qué toca                                        | Qué NO toca                          |
| --------------------- | ----------------------------------------------- | ------------------------------------ |
| Superadmin (marca)    | Todo; gobierno de usuarios y roles              | No es un rol asignable               |
| Administrador general | Todo menos nombrar superadmins                  | —                                    |
| **Nutricionista**     | Calorías, macros, alérgenos, etiquetas          | Ventas, pedidos, clientes, dinero    |
| Gestor de catálogo    | Productos, precios, disponibilidad              | Dinero y usuarios                    |
| Admin de sucursal     | Pedidos, cocina, reparto, stock **de su local** | Otras sucursales, reportes de venta  |
| Cocina                | Tickets de cocina                               | Todo lo demás                        |
| Despachador           | Repartos y repartidores                         | Todo lo demás                        |
| Soporte               | Pedidos, cancelaciones, reembolsos              | Catálogo y usuarios                  |
| Auditor               | Lectura de todo + bitácora                      | No escribe nada                      |

Para crear un rol nuevo (por ejemplo "nutricionista junior"): **Panel -> Roles y permisos -> Crear rol**, marcas las casillas y listo. Cero código, cero despliegue.

### Ejemplo real: el catálogo lo editan dos personas distintas

Ambas entran a **Panel -> Catálogo** y ven la **misma pantalla con bloques distintos**:

|                             | Gestor de catálogo         | Nutricionista                |
| --------------------------- | -------------------------- | ---------------------------- |
| Datos del producto          | Sí                         | No ve el bloque              |
| **Precios**                 | Sí (queda auditado)        | 403 `catalog.product.write`  |
| **Nutrición**               | 403 `nutrition.write`      | Sí                           |
| Alérgenos y etiquetas       | No                         | Sí                           |
| Publicar / retirar del menú | Sí                         | 403 `catalog.product.publish` |
| Crear productos             | Sí                         | 403                          |

Los productos nuevos **nacen como borrador**: no aparecen en el menú hasta que alguien con `catalog.product.publish` los publique. Cada cambio de precio queda en la bitácora con el actor y los valores antes/después.

## 9. Panel de operación

Entra con el superadmin a http://localhost:5173/admin:

| Pantalla         | Qué hace                                                                  |
| ---------------- | ------------------------------------------------------------------------- |
| Resumen          | Ventas, ticket promedio, cancelaciones, tiempos y productos más vendidos   |
| Pedidos          | Tablero en tiempo real con filtros; cancelar queda auditado                |
| Cocina           | Kanban de tickets (cola, aceptado, preparando, listo), se refresca solo    |
| Reparto          | Asignar repartidor y seguir la entrega hasta cerrarla                      |
| Inventario       | Crear insumos, stock, movimientos (compra, merma, ajuste) y mínimos        |
| Catálogo         | Productos, precios, nutrición, alérgenos y publicación                     |
| **Constructor**  | Pasos del bowl: mínimos, máximos, incluidas, precios e incompatibilidades  |
| **Cupones**      | Crear, apagar y ver el uso de cada cupón                                   |
| **Planes**       | Precio, saldo otorgado, vigencia y beneficios                              |
| **Cobertura**    | Crear zonas/cocinas, distritos UBIGEO, horarios y generación de franjas    |
| Usuarios y Roles | Personal interno, roles y permisos                                         |

**Nada del negocio vive ya en el código.** Todo lo que decide qué se vende, a qué precio, a quién y cuándo se administra desde aquí.

Cómo se mueve el stock solo, sin que nadie lo toque:

1. El webhook confirma el pago, se crea el ticket de cocina y se **reservan** los insumos.
2. La cocina pulsa "Empezar a preparar" y el consumo se vuelve **definitivo**.
3. Si el pedido se cancela, los insumos se **liberan**.
4. Si un insumo llega a cero, las opciones que lo usan se marcan **agotadas** en esa sucursal y desaparecen del constructor. Al reponer stock, vuelven solas.

## 10. Planes y saldo

El plan es una **recarga con beneficios**, no una suscripción: no hay renovación automática.

| Plan         | Paga   | Recibe | Vigencia | Beneficios                          |
| ------------ | ------ | ------ | -------- | ----------------------------------- |
| Prueba       | S/ 150 | S/ 165 | 30 días  | Delivery gratis                     |
| Semana Verde | S/ 300 | S/ 345 | 45 días  | Delivery gratis + 5% (hasta S/ 10)  |
| Mes Completo | S/ 600 | S/ 720 | 60 días  | Delivery gratis + 10% (hasta S/ 20) |

Reglas del dinero, todas implementadas y probadas:

- El saldo **solo se acredita cuando el webhook confirma el pago** del plan. Antes de eso, el saldo es cero.
- Todo movimiento pasa por `wallet_transactions` con su saldo resultante congelado. **El saldo nunca se edita a mano**: un error se corrige con un movimiento nuevo.
- La billetera se **bloquea durante cada movimiento**: dos pedidos simultáneos no pueden gastar el mismo saldo.
- El saldo se **debita al crear el pedido** y se **devuelve** si el pago falla o el pedido se cancela.
- Si el saldo cubre todo el pedido, **no se pasa por Stripe**: se registra un pago `wallet` y se confirma internamente.
- Al vencer el plan, un job anula el saldo restante (`EXPIRATION`) y los beneficios dejan de aplicarse.

Los planes y sus beneficios son **datos**: cambiar precios, bonificaciones o porcentajes no requiere tocar código.

## 11. Regla de estados en el frontend

| Dónde                     | Qué guarda                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| `useState` local          | Estado de un componente (inputs, acordeones, modales locales)     |
| `useAppState()` (Context) | Contexto de compra: ciudad, dirección, sucursal, modalidad, franja |
| Redux Toolkit             | Sesión, carrito, catálogo y UI global (persistidos en localStorage) |

## 12. Siguientes pasos

Ver [docs/ROADMAP.md](docs/ROADMAP.md): tareas ordenadas por fases, derivadas del análisis funcional.
