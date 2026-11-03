# Inicio y guía de compra

## Qué incluye

- Inicio informativo con acceso al catálogo y al personalizador, ABC del pedido, capturas del configurador, alternativas de compra, productos destacados reales, servicios secundarios y preguntas frecuentes.
- Guía pública en `/como-hacer-tu-pedido`, accesible desde el inicio y el pie de página.
- Editor exclusivo del superadmin en **Diseño y catálogo → Contenido del inicio** (`/admin/contenido-inicio`).
- Textos, imágenes con descripción accesible, preguntas, enlace opcional a un video, metadatos SEO y orden/visibilidad de siete secciones editables. La presentación principal permanece visible.
- Publicación con versión, auditoría y protección frente a cambios simultáneos. La vista previa no publica ni navega a otros flujos. Los borradores no se guardan al cerrar el navegador.

Las imágenes iniciales de la guía son capturas de la herramienta con datos de demostración. Los precios y la disponibilidad comercial se obtienen del catálogo y del checkout. Los enlaces principales mantienen destinos conocidos del sistema.

## Cómo probar

1. Abre `/` sin iniciar sesión. Revisa los tres pasos y pulsa **¿Primera vez? Aprende cómo pedir**.
2. En la guía, usa el índice para ir al paso del pago. Comprueba que se explica la verificación de Yape/Plin y el seguimiento en Mis pedidos.
3. Abre **Personalizar mi torta**. Elige tamaño, sabores y adicionales. El precio debe actualizarse en el configurador. Estas mejoras informativas no cambian el cobro.
4. Ingresa como superadmin y abre **Contenido del inicio**. Cambia el título principal, una respuesta y el título SEO. Revisa la vista previa antes de publicar.
5. En **Secciones y orden**, oculta Otros servicios o mueve Personalizador con las flechas. Publica y recarga `/`: debe conservarse el contenido publicado.
6. Recarga también la guía: comparte las preguntas frecuentes y su contenido propio con el editor.
7. Prueba con dos pestañas del editor. Publica en una; al guardar la otra debe aparecer un conflicto y conservarse su borrador para revisarlo.
8. Repite en celular. Revisa botones, campos, imágenes y el índice de la guía sin desplazamiento horizontal.

## SEO y despliegue

El inicio y la guía actualizan título, descripción, canonical, Open Graph/Twitter y datos estructurados al renderizarse. El contenido y los enlaces son HTML semántico de React. Esta entrega conserva la aplicación de cliente: no añade un servidor de renderizado ni garantiza que un robot de vista previa ejecute JavaScript. El HTML inicial mantiene metadatos de reserva de la marca.

`/sitemap.xml` se genera con páginas públicas y productos publicados. `/robots.txt` declara el sitemap y aparta rutas de cuenta, pago, administración y experiencias privadas. Esas exclusiones no sustituyen los permisos de acceso.

Configura `FRONTEND_URL` con el dominio público real del negocio y, al compilar la web, `VITE_PUBLIC_WEB_URL` con el mismo origen. Vite y nginx reenvían sitemap y robots al backend. La indexación requiere un despliegue público; localhost no puede indexarse como la tienda.

Aplica la migración **0056-storefront-content** antes de iniciar esta versión. Crea y rellena únicamente la configuración editorial. El proceso normal del proyecto es `npm run db:migrate --workspace backend`.

## Contrato de contenido

La fuente de los textos iniciales y la validación está en `backend/src/modules/settings/storefront.*`. Después de cambiar esos archivos de contrato, ejecuta `node scripts/sync-storefront-content.mjs` para regenerar la copia de reserva del cliente. `node scripts/sync-storefront-content.mjs --check` verifica que ambas coincidan. La copia permite leer la introducción cuando falla la consulta pública; el editor sí exige cargar el documento antes de publicar.

Comprobaciones del cambio: `backend/src/tests/storefront.test.ts` y `e2e/home-content.spec.ts`.
