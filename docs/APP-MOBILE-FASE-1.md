# Aplicación móvil — Fase 1

Fecha de auditoría: 9 de agosto de 2026  
Estado: implementada y validada

## 1. Objetivo

Preparar una aplicación móvil nativa para clientes sin duplicar la lógica comercial existente. La app consume la misma API y la misma base de datos que el frontend web. Administración, cocina, caja, salón y reparto continúan como interfaces operativas separadas.

```text
App cliente ─────┐
                 ├── API Express ── MySQL
Web cliente ─────┤        │
                 │        ├── pagos
Panel operativo ─┘        ├── correo
                          └── mapas
```

## 2. Decisiones tomadas

| Decisión | Resultado |
| --- | --- |
| Tecnología | Expo SDK 57 + React Native 0.86 + TypeScript |
| Plataformas | Android e iOS desde el mismo código |
| Navegación | Expo Router con rutas tipadas |
| Sesión | `expo-secure-store`; no se usarán tokens en almacenamiento web |
| API | `EXPO_PUBLIC_API_URL`, configurable por ambiente |
| Dependencias | Aisladas en `mobile/` para no mezclar React 19 móvil con React 18 web |
| App inicial | Diagnóstico visual que prueba API y base de datos desde el teléfono |
| Personal operativo | No se mezcla con la navegación del cliente |

## 3. Auditoría funcional del backend

| Dominio móvil | API actual | Evaluación |
| --- | --- | --- |
| Registro, login, refresh, logout y usuario actual | `/auth/*` | Reutilizable |
| Perfil, direcciones, preferencias y bowls guardados | `/account/*` | Reutilizable y protegido |
| Departamentos, provincias, distritos y sucursales | `/locations/*` | Reutilizable |
| Cobertura, tarifa y tiempo estimado | `/locations/coverage` | Reutilizable |
| Catálogo, categorías, alérgenos y etiquetas | `/catalog/*` | Reutilizable |
| Personalización y cotización del bowl | `/customizations/*` | Reutilizable |
| Checkout delivery/recojo | `/checkout/quote`, `/checkout/place` | Reutilizable con sesión |
| Historial, detalle y cancelación de pedidos | `/orders/*` | Reutilizable |
| Planes y saldo | `/plans/*` | Reutilizable |
| Consumo en mesa por QR | `/operations/dining/qr/:token` | Reutilizable como flujo separado |
| Comandas de mozo, caja y mesas | `/operations/dining/*` | Solo personal; no pertenece a la app cliente |
| Cocina, inventario y reparto | `/operations/*`, `/delivery/*` | Solo personal; permanece en panel operativo |

## 4. Brechas encontradas

### 4.1 Carrito

La ruta `/cart` continúa como placeholder. La web mantiene su carrito en el cliente. El MVP móvil hará lo mismo, con persistencia local, y el backend seguirá validando precios y stock al cotizar y confirmar.

### 4.2 Consumo en restaurante

El checkout común acepta `DELIVERY` o `PICKUP`. El consumo `DINE_IN` ya existe, pero entra por QR de mesa y por los endpoints de salón. La app deberá interpretar enlaces como `verdebowl://mesa/<token>` y presentar un flujo específico, sin intentar enviar una mesa al checkout de delivery.

### 4.3 Retorno del pago

El backend genera actualmente las URLs de éxito y cancelación con `FRONTEND_URL`, por lo que Stripe regresa a la web. Antes de completar pagos móviles deberá aceptar un destino móvil controlado o una página universal que redirija al deep link, sin permitir URLs arbitrarias enviadas por el cliente.

### 4.4 Notificaciones push de clientes

Existen notificaciones internas, correo y suscripciones web push para cocina. No existe todavía un registro de token Expo/APNs/FCM para el teléfono del cliente. Será necesario añadir dispositivos por usuario, revocación al cerrar sesión y envío idempotente por estado del pedido.

### 4.5 Multiempresa

El modelo actual separa sucursales y alcances de personal dentro de Verde Bowl. No se encontró una entidad `tenant` o restaurante independiente que aísle catálogos, usuarios, pagos y configuración entre empresas diferentes. Esto no bloquea una app de Verde Bowl con varios locales; sí debe resolverse antes de vender la plataforma a restaurantes jurídicamente independientes.

## 5. Alcance aprobado para el MVP cliente

Incluido:

1. Inicio y selección de sede/modalidad.
2. Registro, login, recuperación y cierre de sesión.
3. Menú, filtros, producto y disponibilidad por sede.
4. Constructor de bowl y nutrición.
5. Carrito persistente.
6. Delivery y recojo.
7. Mesa mediante QR como flujo diferenciado.
8. Cotización, pago y confirmación.
9. Seguimiento, historial y repetición de pedidos.
10. Perfil, direcciones, favoritos, bowls guardados, planes y saldo.
11. Notificaciones push de estados del pedido.

Fuera del MVP cliente:

- Administración del negocio.
- KDS de cocina.
- Caja y cierre de comandas.
- Gestión de inventario.
- Operación del repartidor.
- Gobierno multiempresa/tenant.

Estas funciones no desaparecen: continúan en el panel web y pueden convertirse después en una app operativa separada.

## 6. Arquitectura creada

```text
mobile/
├── app/
│   ├── _layout.tsx             proveedor seguro y navegación raíz
│   └── index.tsx               entrada de la aplicación
├── src/
│   ├── config/env.ts           URL normalizada y detección de localhost
│   ├── features/welcome/       pantalla de diagnóstico inicial
│   ├── services/api/           cliente HTTP tipado y health check
│   ├── services/session/       tokens mediante SecureStore
│   └── theme/tokens.ts         identidad visual reutilizable
├── .env.example
├── app.json
├── package.json
└── tsconfig.json
```

La estructura está preparada para agregar en fases posteriores grupos como `(public)`, `(auth)` y `(customer)` dentro de `app/`, manteniendo la lógica de cada dominio en `src/features`.

## 7. Seguridad inicial

- La URL de la API no se incrusta de forma fija en el código.
- La app detecta `localhost` y advierte que no funcionará desde un teléfono físico.
- Las credenciales se guardarán en el almacén seguro del sistema operativo.
- El cliente HTTP impone timeout y normaliza errores de red.
- La aplicación no traslada validaciones sensibles de precio, stock o cobertura al teléfono.
- Los identificadores nativos iniciales son `com.verdebowl.app` para Android e iOS.

## 8. Validación de esta fase

- Dependencias de Expo instaladas con versiones compatibles con SDK 57.
- `npm run typecheck --prefix mobile`: aprobado sin errores.
- Endpoint de diagnóstico: `GET /api/v1/health`.
- Pantalla inicial responsive con zona segura, scroll, estados de carga, éxito y error.
- Proyecto aislado de las modificaciones existentes del backend y frontend.

## 9. Prueba de aceptación en celular

1. Instalar Expo Go compatible con SDK 57. La descarga oficial para Android está en `https://expo.dev/go?device=true&platform=android&sdkVersion=57`.
2. Copiar `mobile/.env.example` a `mobile/.env`.
3. Reemplazar la IP de ejemplo por la IPv4 de la computadora.
4. Levantar backend con `npm run dev:backend`.
5. Levantar Expo con `npm run dev:mobile`.
6. Escanear el QR con Expo Go en la misma red Wi-Fi.
7. Pulsar **Probar conexión**.
8. Confirmar el estado **Conectado**.

Si Expo Go informa que el proyecto requiere una versión más nueva, actualizar o reinstalar Expo Go y reiniciar Metro con `npm run start:clear --prefix mobile`. No es un error del bundle: Expo Go y el proyecto deben compartir la misma versión mayor del SDK.

La Fase 1 se considera aceptada cuando la app abre en el teléfono y el diagnóstico responde `verde-bowl-api · base de datos up`.

## 10. Orden de la siguiente fase

1. Crear navegación pública y autenticada.
2. Implementar bootstrap de sesión y refresh token.
3. Añadir registro, login, recuperación y logout real.
4. Cargar configuración pública, sucursales y modalidad.
5. Construir inicio y menú nativo con datos reales.
6. Validar en Android físico antes de avanzar al carrito.
