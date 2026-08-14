# Paridad web–móvil, roles y sedes

## Arquitectura que se mantiene

Verde Bowl representa una empresa con varios locales. No crea una copia del sistema por restaurante. El catálogo, los clientes, los planes y la identidad legal son comunes; la disponibilidad, caja, mesas, cocina, inventario, reparto y reportes se filtran por `branchId`.

```text
Empresa Verde Bowl
├── Catálogo, planes, usuarios e identidad compartidos
├── Local Miraflores: caja, salón, cocina, stock y reparto
├── Local San Isidro: caja, salón, cocina, stock y reparto
└── Local futuro: la misma lógica, datos operativos propios
```

El backend sigue siendo la autoridad. La web y la app consumen las mismas rutas, aplican la misma sesión y reciben los mismos permisos. Ocultar un módulo en la interfaz mejora la experiencia, pero el backend vuelve a validar el permiso y la sede en cada petición.

## Experiencia según cuenta

- Cliente: inicio, menú con imágenes, constructor, favoritos, carrito, Stripe, pedidos, planes, direcciones con mapa, QR de mesa, soporte y cuenta.
- Personal: conserva la tienda pública para consultar lo publicado y obtiene la pestaña `Equipo`.
- Cocina, caja, salón, reparto y administración: la pestaña `Equipo` muestra únicamente módulos autorizados y únicamente locales asignados.
- Superadministrador: puede ver todos los módulos y cambiar entre todos los locales.

## Panel móvil

El panel móvil contiene las mismas 19 áreas de navegación que la web. Los tableros operativos usan actualización periódica en primer plano:

- pedidos;
- caja y validación Yape/Plin;
- salón y comandas;
- cocina y avance de tickets;
- reparto y avance de entrega;
- inventario con alertas rojas, consumo y compra sugerida;
- resumen y ranking;
- catálogo, constructor, multimedia, cupones, planes, cobertura, personal, roles, reclamos, bitácora, negocio y diseño.

Las gestiones extensas siguen teniendo una interfaz más amplia en desktop, pero la app ya permite consultar todas las áreas y operar las estaciones diarias sin abrir un navegador.

## Pagos Stripe

La app no crea otro cobro. Envía `client: MOBILE` al mismo checkout autenticado de la web. El backend crea Stripe Checkout, registra pago y pedido, recibe el webhook y devuelve al puente HTTPS; el puente abre `verdebowl://checkout/result`. Los reintentos reutilizan el pedido y solicitan una sesión nueva solo cuando la anterior expiró.

## Recuperación de contraseña

La solicitud móvil envía `client: MOBILE`. El correo apunta al puente HTTPS `/restablecer-clave/movil`, que abre `verdebowl://reset-password?token=...`; si la app no está disponible, permite terminar el mismo flujo en la web. La contraseña actualizada funciona en ambos canales.

## Mapas

El formulario móvil muestra el mapa desde el inicio, permite tocar o arrastrar el pin, resuelve el UBIGEO, valida cobertura y asigna la sede. Expo Go puede usar el mapa integrado; un APK/AAB propio necesita `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, restringida al paquete `com.verdebowl.app` y al SHA-1 de la credencial EAS.

## Verificación ejecutada

- TypeScript móvil: correcto.
- Build de producción web: correcto.
- Build backend: correcto.
- Backend: 63 pruebas aprobadas.
- Seeder idempotente: 12 productos, 5 pasos del constructor, sedes, inventario, mesas y roles aplicados.
