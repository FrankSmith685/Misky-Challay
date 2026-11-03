# Términos de compra y aceptación

## Administración

En **Superadmin → Negocio y comunicaciones → Términos y condiciones** (`/admin/configuracion-negocio?tab=terms`) se editan:

- Título del documento público.
- Contenido completo, con saltos de línea y sin ejecutar HTML.
- Texto de la casilla del checkout.

La vista previa permite revisar los cambios. **Publicar nueva versión** los hace visibles en `/terminos` y en la app móvil. El número de versión aumenta automáticamente cuando cambia el contenido, título o casilla. La publicación requiere superadmin y genera una entrada de auditoría.

Si otra sesión publica mientras se edita, el servidor responde 409 y conserva el borrador en pantalla. Se puede recargar la publicación vigente de forma explícita.

La versión inicial conserva el documento que ya mostraba la web y los datos del negocio existentes al instalar la migración. Al cambiar los datos legales del negocio, también se debe actualizar el contenido del documento desde esta pestaña.

## Confirmación del pedido

- La casilla aparece inmediatamente antes del botón final y comienza desmarcada. No se guarda como preferencia ni en el borrador del checkout.
- Se exige en web y app para pasarela, pagos directos y pedidos cubiertos con saldo.
- El enlace abre el documento público vigente; en web usa otra pestaña para conservar el checkout.
- Si los términos cambian mientras el cliente compra, la aceptación anterior deja de servir. En web se actualiza mediante eventos y sondeo; la app consulta al regresar a la pantalla y cada 30 segundos mientras está activa.
- Si no se puede obtener el documento, se muestra un reintento y no se confirma el pedido.
- Cotizar y consultar horarios no implica aceptar. `POST /checkout/place` exige `termsAccepted: true` y `termsVersion` entero positivo.

El backend compara la versión con la publicación vigente bajo un bloqueo de fila dentro de la transacción del pedido. Una versión reemplazada devuelve `409 TERMS_CHANGED`. Se conserva en `orders.terms_acceptance_json` el título, texto completo, texto de aceptación, versión, fecha de publicación, fecha de aceptación del servidor y canal. El usuario se identifica mediante el propietario del pedido autenticado. No se acepta una fecha de consentimiento proporcionada por el cliente.

Un reintento con la misma clave de idempotencia recupera el pedido original y conserva su aceptación. Los pedidos anteriores no reciben aceptaciones retroactivas. El cliente y el personal autorizado pueden consultar la copia en el detalle del pedido web.

## Instalación y verificación

Migración: `backend/src/database/migrations/0061-checkout-terms.ts`. Crea la publicación inicial y añade la columna nullable de evidencia al pedido. Ya se aplicó en la base local. En otros entornos se debe aplicar antes de arrancar esta versión. El bootstrap también inicializa la publicación si una instalación con sincronización de modelos todavía no tiene ninguna, sin reemplazar documentos existentes.

Pruebas específicas:

- `backend/src/tests/checkout-terms.test.ts`: consentimiento explícito, versión obsoleta, copia histórica, fecha del servidor, transacción, reintentos y publicaciones concurrentes.
- `e2e/checkout-terms.spec.ts`: escritorio y móvil web, cambios durante el checkout, errores y reintentos, publicación y conservación del borrador.
- Se actualizaron las pruebas existentes de checkout para aceptar expresamente las condiciones antes de confirmar.

La implementación móvil se valida con TypeScript; la interacción nativa requiere comprobarse en un dispositivo o emulador.

Resultado local: 49 pruebas de backend y 36 escenarios de navegador aprobados, incluidos los flujos existentes de precios, mínimos, direcciones, horarios y pagos. TypeScript validado en backend, web y app móvil.
