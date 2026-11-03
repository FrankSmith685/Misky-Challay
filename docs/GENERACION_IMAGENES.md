# Generación de imágenes con FLUX.1 Schnell

DulceFlow permite generar una propuesta visual en **Biblioteca de imágenes** y en los selectores de imagen de categorías, tortas, productos, insumos, opciones y recomendaciones del Constructor. La generación se realiza desde el backend mediante Cloudflare Workers AI. El token nunca se envía al navegador.

## Configuración

1. Crea una cuenta de Cloudflare y abre **Workers AI → Use REST API**.
2. Copia el **Account ID** y crea un **Workers AI API Token**.
3. Añade estos valores a `backend/.env` o a las variables de entorno del servidor:

   ```dotenv
   CLOUDFLARE_ACCOUNT_ID=tu_account_id
   CLOUDFLARE_API_TOKEN=tu_token
   ```

4. Reinicia el backend. No uses variables `VITE_` para estas credenciales.

Sin las dos variables, la aplicación explica que la generación está pendiente de configurar. La subida de archivos y la importación desde URL siguen disponibles.

## Uso

1. Abre la biblioteca o el selector de imagen de una ficha y pulsa **Generar con IA**.
2. El generador toma el nombre y la descripción de la ficha para sugerir un texto. Puedes usar **Foto de catálogo**, **Primer plano** o **Escena de pastelería**, o pulsar **Mi propia idea** y escribir desde cero la imagen que quieres. Los estilos son opcionales. Si editas un texto sugerido, pasa a **Mi propia idea**; puedes volver a cualquier estilo sin perder tu texto propio.
3. Pulsa **Generar vista previa**.
4. Comprueba que la imagen corresponda al producto real. Puedes generar otra propuesta y comparar las tres más recientes; selecciona la que quieras conservar. Cada clic en generar consume una solicitud.
5. Escribe un texto alternativo que describa la propuesta elegida y pulsa **Guardar en biblioteca**. Desde una ficha, pulsa **Guardar y elegir imagen** y guarda la ficha principal para asociarla. Las propuestas que no guardes se descartan al salir del generador.

Una categoría con imagen aparece en el menú público solo si contiene tortas publicadas. La imagen de una torta aparece en su tarjeta y ficha después de publicar el producto y mantener activo su perfil de torta. Las opciones del Constructor muestran sus propias imágenes durante la personalización. Las recomendaciones con foto se muestran como ideas para empezar; al elegir una, se aplican sus opciones y el cliente puede cambiarlas.

Las fotos publicadas desde la biblioteca son referencias revisadas por el administrador. El configurador de tortas tiene además una [vista de la combinación con IA opcional](VISTA_PREVIA_IA_TORTAS.md): muestra una ilustración inmediata y solicita una propuesta solo cuando el cliente pulsa «Generar propuesta con IA». Puede adaptar su foto de referencia. No se garantiza que la composición reproduzca exactamente el resultado elaborado.

La imagen del insumo en Inventario sirve para identificarlo internamente. Para que el cliente vea ese ingrediente como opción de personalización, el administrador debe elegir una imagen para la opción en Constructor. Esto permite usar una foto del acabado ofrecido en lugar de mostrar por error la materia prima.

La vista previa no crea archivos ni modifica productos. Cada generación consume parte del cupo de Workers AI, aunque se descarte. El servidor limita a 12 generaciones por usuario y hora. Las imágenes aceptadas se almacenan mediante el flujo existente de medios (máximo 5 MB).

Documentación oficial: [REST API de Workers AI](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [modelo FLUX.1 Schnell](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/) y [cupo del plan gratuito](https://developers.cloudflare.com/workers-ai/platform/pricing/).
