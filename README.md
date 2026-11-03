# DulceFlow

Plataforma web y móvil de tortas personalizadas: catálogo, configuración, reservas por capacidad, cotizaciones de diseño y producción.

El alcance de las etapas 1 a 5 y los datos iniciales editables se describen en [docs/TORTAS_DULCEFLOW.md](docs/TORTAS_DULCEFLOW.md). Parte de la infraestructura anterior conserva nombres técnicos para mantener la compatibilidad con datos y enlaces existentes.

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
DB_NAME=DulceFlow
```

> **No hace falta crear la base de datos a mano.** Al arrancar, el backend ejecuta
> `CREATE DATABASE IF NOT EXISTS DulceFlow`, crea las tablas desde los modelos
> y carga permisos, roles, el superadmin, el maestro UBIGEO y los datos comerciales
> necesarios para revisar la aplicación.

```bash
npm run dev                 # backend :4000  +  frontend :5173
```

- Frontend: http://localhost:5173
- API: http://localhost:4000/api/v1/health
- Superadmin inicial de ejemplo: `admin@ejemplo.com` / `Admin123*` (se configura en `backend/.env`)

La portada muestra el catálogo de tortas DulceFlow. Los precios y horarios iniciales son datos de demostración editables.

### Levantar la pila completa con Docker

```bash
# completa las claves y dominios de .env.docker
docker compose --env-file .env.docker up -d --build  # web en http://localhost:8080
```

Las migraciones corren como paso previo y separado: si fallan, el API no arranca.
Despliegue, copias de seguridad y restauración en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## 3. Comandos

| Comando                                | Qué hace                              |
| -------------------------------------- | ------------------------------------- |
| `npm run dev`                          | Levanta backend y frontend en paralelo |
| `npm run dev:local3d`                  | Levanta la web, API y motor local de foto a 3D |
| `npm run dev:backend` / `dev:frontend` | Solo una de las dos capas             |
| `npm run build`                        | Compila ambos para producción         |
| `npm run typecheck`                    | Verifica tipos en ambos proyectos     |
| `npm run lint`                         | ESLint en ambos proyectos             |
| `npm run format`                       | Prettier sobre todo el repo           |
| `npm run db:seed`                      | Reejecuta los seeders (idempotentes)  |

Para reconstruir una torta desde una fotografía, consultar
[Conversión de foto a 3D](docs/CONVERSION_FOTO_3D.md). El entorno local revisado
usa Hunyuan3D Mini Turbo, con pesos instalados en un entorno Python aislado y
selección mediante `backend/.env`. La generación tarda varios minutos; el visor
permite girar, comparar y cambiar el tono al terminar.

### Migraciones y entorno de DulceFlow

En una base nueva como DulceFlow, aplica primero el esquema y luego, solo en desarrollo, los datos de demostracion:

    npm run db:migrate:status --workspace backend
    npm run db:migrate --workspace backend
    npm run db:seed --workspace backend

El comando de seed es idempotente. En produccion revisa el estado y aplica migraciones durante el despliegue, con DB_AUTO_CREATE=false, DB_SYNC=false, DB_ALTER=false, DB_FORCE=false y SEED_DEMO_DATA=false. No uses el seed de demostracion para cargar precios, stock, horarios o personal reales.
## 4. Interruptores de la base de datos

Están en [backend/src/index.ts](backend/src/index.ts) (`DATABASE_STARTUP`) y se controlan desde `backend/.env`:

| Variable         | Efecto                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| `DB_AUTO_CREATE` | Crea `DulceFlow` si no existe                                           |
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

## 5. Pagos de tortas

Mientras `STRIPE_SECRET_KEY` y `MERCADOPAGO_ACCESS_TOKEN` estén vacías, el sistema usa un **simulador local de desarrollo**: mismo ciclo y webhook firmado, pero sin cobrar dinero real. Al pagar te lleva a `/checkout/simulador`, donde eliges "pago aprobado" o "tarjeta rechazada".

Stripe no admite actualmente abrir una cuenta de cobros para una empresa registrada solo en Perú. Para cobros reales desde Perú, DulceFlow incluye Mercado Pago Checkout Pro: consulta [docs/MERCADOPAGO.md](docs/MERCADOPAGO.md). Las tortas crean sesiones dinámicas; no hay que darlas de alta como productos en Stripe. La comisión del 15 % se registra como liquidación y no se transfiere automáticamente.

La guía completa de cuenta, pruebas, tarjetas, webhooks y paso a producción está
en [docs/STRIPE.md](docs/STRIPE.md).

Para enchufar Stripe de verdad:

```bash
# 1. Pon tu clave de test en backend/.env
STRIPE_SECRET_KEY=sk_test_...

# 2. Reenvía los webhooks de Stripe a tu backend local
stripe listen --forward-to localhost:4000/api/v1/payments/webhooks/stripe

# 3. Copia el whsec_... que imprime ese comando
STRIPE_WEBHOOK_SECRET=whsec_...
```

Con una cuenta de Stripe elegible, reinicia el backend para que el botón de pagar abra la página de Stripe. El resto del sistema usa la interfaz `PaymentProvider` ([backend/src/integrations/payments/](backend/src/integrations/payments/)).

Reglas implementadas y probadas:

- Un pedido pasa a `CONFIRMED` **solo** por un webhook con firma válida. La página de éxito no confirma nada: consulta el estado al backend.
- El mismo evento reenviado por la pasarela no confirma dos veces (`webhook_events` con UNIQUE por `event_id`).
- Dos clics en "Pagar" con la misma clave de idempotencia devuelven el mismo pedido, no dos.
- Si el pago falla, el pedido se cancela y se liberan el cupón, el cupo de la franja y el saldo.

## 6. Notificaciones por email

El superadmin administra los datos del negocio, SMTP, remitente, canales y eventos desde
`/admin/configuracion-negocio`. Los valores `MAIL_*` funcionan como respaldo de la primera
instalación; después de guardar en el panel, los cambios se aplican sin reiniciar el servidor.
La contraseña SMTP se cifra en la base de datos y nunca vuelve al navegador.

Mientras no exista servidor SMTP, los correos se imprimen en la consola en desarrollo. También
puedes configurar Gmail, SendGrid, Resend, Mailgun u otro proveedor compatible desde el panel o
inicialmente con:

```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=tu@gmail.com
MAIL_PASSWORD=tu-app-password
SETTINGS_ENCRYPTION_KEY=un-secreto-aleatorio-de-32-o-mas-caracteres
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
| **Suscripciones**       | Precio mensual, contenido de caja, sucursales y cupos                              |
| **Cobertura**    | Crear zonas/cocinas, distritos UBIGEO, horarios y generación de franjas    |
| Usuarios y Roles | Personal interno, roles y permisos                                         |

**Nada del negocio vive ya en el código.** Todo lo que decide qué se vende, a qué precio, a quién y cuándo se administra desde aquí.

Cómo se mueve el stock solo, sin que nadie lo toque:

1. El webhook confirma el pago, se crea el ticket de cocina y se **reservan** los insumos.
2. La cocina pulsa "Empezar a preparar" y el consumo se vuelve **definitivo**.
3. Si el pedido se cancela, los insumos se **liberan**.
4. Si un insumo llega a cero, las opciones que lo usan se marcan **agotadas** en esa sucursal y desaparecen del constructor. Al reponer stock, vuelven solas.

## 10. Suscripciones mensuales y saldo histórico

Las nuevas cajas mensuales se cobran de forma recurrente y cada mensualidad pagada habilita un recojo. Superadmin gestiona precio, contenido, sucursales, anticipación y cupos. La contratación, cancelación y programación están disponibles en web y móvil. Consulta [docs/SUSCRIPCIONES.md](docs/SUSCRIPCIONES.md) para la configuración y las reglas.

Las recargas de saldo anteriores ya no se venden. Los clientes conservan el saldo, bonos y beneficios adquiridos según sus fechas originales.

Reglas del saldo comprado anteriormente:

- El saldo **solo se acredita cuando el webhook confirma el pago** del plan. Antes de eso, el saldo es cero.
- Todo movimiento pasa por `wallet_transactions` con su saldo resultante congelado. **El saldo nunca se edita a mano**: un error se corrige con un movimiento nuevo.
- La billetera se **bloquea durante cada movimiento**: dos pedidos simultáneos no pueden gastar el mismo saldo.
- El saldo se **debita al crear el pedido** y se **devuelve** si el pago falla o el pedido se cancela.
- Si el saldo cubre todo el pedido, **no se pasa por Stripe**: se registra un pago `wallet` y se confirma internamente.
- El saldo se administra por lotes FEFO: el bono y los beneficios vencen con el plan; el dinero pagado conserva 180 días. Un vencimiento nunca recorta otra compra.

Los planes anteriores permanecen en el historial para respetar sus saldos y fechas.

## 11. Regla de estados en el frontend

| Dónde                     | Qué guarda                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| `useState` local          | Estado de un componente (inputs, acordeones, modales locales)     |
| `useAppState()` (Context) | Contexto de compra: ciudad, dirección, sucursal, modalidad, franja |
| Redux Toolkit             | Sesión, carrito, catálogo y UI global (persistidos en localStorage) |

## 12. Siguientes pasos

Ver [docs/ROADMAP.md](docs/ROADMAP.md): tareas ordenadas por fases, derivadas del análisis funcional.
#   M i s k y - C h a l l a y  
 #   M i s k y - C h a l l a y  
 #   M i s k y - C h a l l a y  
 