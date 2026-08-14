# Aplicación móvil — Fase 2

Fecha: 9 de agosto de 2026  
Versión: 0.2.0  
Estado: implementada y compilada para Android

## Resultado

La aplicación dejó de ser una pantalla de diagnóstico y ya funciona como cliente móvil conectado al backend real. La lógica sensible continúa en la API; el teléfono solo presenta flujos, conserva contexto y administra credenciales seguras.

## Navegación implementada

```text
Inicio
├── selector de modalidad/local
├── productos destacados
└── acceso al menú

Menú
├── búsqueda
├── categorías
├── disponibilidad por local
└── ficha real del producto

Pedidos
├── acceso protegido
└── historial real del cliente

Cuenta
├── registro/login/recuperación
├── información de sesión
├── contexto de compra
└── cierre seguro
```

## Sesión y seguridad

- Access token y refresh token se almacenan con `expo-secure-store`.
- Al abrir la app se restaura la sesión y se consulta `/auth/me`.
- Ante un 401 se intenta una sola renovación mediante `/auth/refresh` y se repite la solicitud.
- Si la renovación falla, se eliminan las credenciales y la app vuelve al estado anónimo.
- El logout avisa al backend para revocar refresh tokens y limpia el teléfono incluso si la red falla.
- Pedidos y datos de cuenta exigen sesión; explorar inicio y menú continúa siendo público.

## Contexto del pedido

| Modalidad | Comportamiento móvil |
| --- | --- |
| Delivery | No fija una sede anticipadamente. Cobertura y dirección determinarán la cocina en checkout. |
| Recojo | Exige una sucursal que acepte recojo. |
| En salón | Exige restaurante y explica que la mesa se asociará mediante QR. |

La selección se conserva localmente. Cerrar sesión elimina credenciales, pero no borra la modalidad pública elegida: no contiene información personal.

## Datos reales consumidos

| Pantalla | Endpoints |
| --- | --- |
| Inicio | `/settings/public`, `/catalog/products?featured=true` |
| Selector | `/locations/branches` |
| Menú | `/catalog/categories`, `/catalog/products` |
| Producto | `/catalog/products/:slug` |
| Login y cuenta | `/auth/login`, `/auth/register`, `/auth/me`, `/auth/refresh`, `/auth/logout` |
| Recuperación | `/auth/forgot-password` |
| Pedidos | `/orders` |

Durante la validación local se confirmaron una sucursal, cinco categorías y trece productos disponibles.

## Experiencia de usuario

- Diseño nativo con zonas seguras, teclado móvil y navegación inferior.
- Estados de carga, red, vacío y reintento.
- Búsqueda con debounce para no consultar el backend en cada tecla.
- Productos agotados diferenciados visualmente.
- Imágenes con fallback de marca cuando el servidor de recursos no está activo.
- Mensaje específico para cuentas del equipo: la app conserva la experiencia cliente y remite la operación al panel web.
- Modal de modalidad con explicación operativa, evitando promesas falsas sobre delivery o salón.

## Validaciones realizadas

- `npm run typecheck`: aprobado.
- `npx expo install --check`: dependencias alineadas con SDK 57.
- Bundle Android generado por Metro: aprobado, 1,324 módulos.
- API y base de datos: `up`.
- Configuración pública, sucursales, categorías y productos: respuestas válidas.

### Nota sobre `npm audit`

El auditor de npm reporta 21 avisos transitivos (7 moderados y 14 altos, ninguno crítico) dentro de Expo, React Native, Metro y sus herramientas. La corrección automática propuesta intenta bajar Expo a SDK 53 y React Native a 0.72, combinaciones incompatibles con Expo Go 57. No se ejecutó `npm audit fix --force`. Las dependencias directas permanecen en las versiones que el verificador oficial de Expo declara compatibles; estos avisos deben revisarse cuando Expo publique correcciones para SDK 57.

## Prueba manual recomendada

1. Ejecutar `npm run dev` en la raíz.
2. Ejecutar `npm run start:clear --prefix mobile`.
3. Abrir el QR con Expo Go 57.
4. Cambiar entre delivery, recojo y salón.
5. Seleccionar Miraflores para recojo y confirmar que el menú conserve la sede.
6. Buscar un producto y abrir su ficha.
7. Crear una cuenta nueva o iniciar sesión.
8. Cerrar y volver a abrir Expo Go; la sesión debe restaurarse.
9. Revisar Pedidos y luego cerrar sesión.
10. Confirmar que Pedidos vuelva a solicitar autenticación.

## Límites conscientes de esta fase

- El carrito, constructor de bowl y checkout corresponden a la Fase 3.
- Delivery todavía no captura dirección; por eso no afirma cobertura ni sede.
- En salón todavía no consume el token QR de mesa.
- Los accesos de direcciones, preferencias y favoritos se muestran como mapa de cuenta, pero su edición nativa se implementará posteriormente.
- El enlace de recuperación abre actualmente el flujo web definido por `FRONTEND_URL`.
- El pago todavía retorna a la web; necesita deep link controlado antes del checkout móvil.
