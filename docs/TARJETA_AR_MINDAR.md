# Tarjeta AR de Misky Challay

Implementado el 29 de octubre de 2026. Integra **MindAR 1.2.5**, con licencia MIT,
como experiencia opcional dentro de la plataforma. No requiere cuenta de MyWebAR,
Kivicube ni claves nuevas en `.env`. Las funciones de IA existentes mantienen su
propia configuración y sus límites; esta experiencia no llama a esos proveedores.

## Cómo abrirla

1. En el pie de la tienda: **Experiencia AR** (`/experiencia-ar`).
2. Pulsa **Descargar tarjeta**, imprime el PNG en horizontal, sin recortar ni
   estirar, preferiblemente en papel mate. La fotografía debe medir al menos
   unos 12 cm de ancho para esta prueba inicial.
3. Apoya la tarjeta en una mesa. Desde el celular, escanea su QR y pulsa
   **Activar cámara AR**. Permite la cámara y enfoca toda la fotografía con buena
   luz. Mantén visible la imagen mientras mueves suavemente el celular.

En una computadora, también puedes mostrar la tarjeta en otra pantalla y
enfocarla con el celular. Una sola pantalla de celular no puede mostrar la
tarjeta y enfocarla con su cámara trasera a la vez.

La descarga toma el dominio público desde `VITE_PUBLIC_WEB_URL`, si existe. En
desarrollo, Vite usa como alternativa el `FRONTEND_URL` HTTPS de `backend/.env`,
de modo que los QR descargados desde localhost también abran el dominio público.
Sin esa configuración, usa la dirección con la que abriste la tienda. En builds
de producción, usa el valor explícito de `VITE_PUBLIC_WEB_URL` o el dominio real
donde se abre la web; no incorpora el ngrok de desarrollo automáticamente.
Usa el dominio **HTTPS** público
para descargar una tarjeta que se pueda abrir desde otro celular. Un QR con
`127.0.0.1` o `localhost` solo apunta al dispositivo que lo escanea. Si cambias
de dominio ngrok, actualiza `FRONTEND_URL` y el origen permitido en `CORS_ORIGIN`,
reinicia Vite y backend y descarga otra tarjeta; el QR impreso conserva el dominio
viejo. Mantén `VITE_PUBLIC_WEB_URL` sin definir si quieres que siga `FRONTEND_URL`.

## Una torta compartida

El visor `/vista-3d/:token` incluye **Ver sobre una tarjeta AR**. El diálogo de
compartir también ofrece acceso después de generar un enlace. La ruta AR tiene
la forma `/experiencia-ar?vista=TOKEN`.

- Usa el mismo enlace y vencimiento de la vista compartida, de siete días.
- Si el cliente decidió incluir su referencia y su reconstrucción, carga ese
  modelo ya generado. No inicia conversiones, publicaciones ni generaciones de
  IA automáticamente.
- Sin reconstrucción compartida, muestra una torta ilustrativa con las opciones
  públicas del enlace. Lo indica en la página.
- La cámara y la descarga se bloquean con enlaces vencidos o inválidos. No se
  sustituye silenciosamente una torta compartida que falló por el modelo piloto.
- La tarjeta del piloto sin token usa un modelo ilustrativo y no depende del
  catálogo ni de un enlace de siete días.

La fotografía impresa es siempre la misma referencia de reconocimiento. El QR
elige qué modelo se muestra. El modelo es de consulta: no hay editor de colores
ni herramientas para alterar la reconstrucción.

## Qué se puede esperar

MindAR reconoce una imagen plana y ancla el modelo a ella. El QR abre la página;
la fotografía es la referencia espacial. El seguimiento requiere que la imagen
siga visible y tenga suficiente luz, detalle y contraste, sin reflejos.

La escala depende del tamaño de la tarjeta impresa y es **orientativa**. Para
colocar una torta sobre una mesa sin tarjeta, se mantiene la opción WebXR
existente en los dispositivos compatibles.

MindAR no reconstruye una torta desde una foto ni mejora la geometría de un GLB.
Las reconstrucciones conservan las limitaciones del motor y de la foto original.
El piloto usa geometría ilustrativa limpia; no representa exactamente la torta
de la fotografía de reconocimiento.

## Cámara y carga

La librería se aloja en el proyecto; no se descarga desde un CDN en la sesión de
cámara. Se carga al abrir la cámara, dentro de una entrada Vite independiente
`ar-camera.html`. El video se procesa en el navegador y no se sube al backend.
Se usa la cámara trasera cuando está disponible. Se informa de permisos
denegados, cámara ausente u ocupada, errores de carga y pérdida de seguimiento.

Cerrar la experiencia detiene los tracks y elimina el documento de cámara para
liberar workers, contextos WebGL y memoria de TensorFlow. Pasar la pestaña al
fondo también detiene la cámara; hay que volver a activarla para continuar.
Requiere HTTPS, acceso a cámara y WebGL. En navegadores internos que restrinjan
la cámara, abre el enlace en el navegador del celular. El visor 3D sigue siendo
el acceso alternativo.

## Archivos y mantenimiento

- Motor y licencia: `frontend/src/vendor/mindar/`.
- Licencia distribuida: `/ar/LICENSE-MindAR.txt` y `/ar/LICENSE-Apache-2.0.txt`.
- Foto exacta: `/images/brand/patisserie-chocolate-v1.jpg`.
- Reconocimiento compilado: `/ar/misky-card-v1.mind` (719573 bytes, 11 escalas de
  características, objetivo de 1536 × 1024 píxeles).
- Manifiesto con SHA-256 de foto y compilado: `/ar/misky-card-v1.json`.
- `npm run check:ar --workspace frontend` impide compilar con foto o archivo de
  reconocimiento distintos de los declarados. Forma parte de `build`.

Para cambiar la fotografía, primero diseña y revisa la nueva tarjeta. Con Vite
local activo, ejecuta `node scripts/compile-misky-ar-target.cjs` (Playwright y
Chrome local; `CHROME_PATH` permite otra ubicación). Vuelve a ejecutar las
pruebas de reconocimiento. Cambiar la foto deja de reconocer tarjetas antiguas:
para mantenerlas, conserva su archivo y añade otra versión/objetivo en lugar de
reemplazarlo. No cambiar el QR ni los textos sobre la fotografía de seguimiento;
la descarga los dibuja fuera de ella.

El código usa la API `Controller` de MindAR y nuestro Three.js actual. El wrapper
Three.js de la distribución importa una constante retirada de Three.js; por eso
no se utiliza ese wrapper. Los archivos originales del motor no se modificaron.

## Verificación

`node scripts/check-misky-ar.cjs` usa Chrome local, cámara sintética y todas las
API interceptadas. Decodifica el QR descargado con OpenCV del entorno local de
foto a 3D (`AR_CHECK_PYTHON` permite otro Python con OpenCV). No escribe pedidos,
no publica fotos y no llama a IA. Evidencias en `backend/tmp/mindar-review/`.
`AR_EXPECTED_PUBLIC_ORIGIN` permite exigir un dominio concreto en esa prueba;
`node scripts/check-public-preview-links.cjs` verifica específicamente que los
QR y las vistas compartidas generados desde localhost usen el dominio HTTPS de
`FRONTEND_URL`, con sus API de compartición simuladas y sin publicaciones.

Resultado local del 29/10/2026: reconocimiento real de MindAR con cámara
sintética aprobado; detección, pérdida y recuperación; carga de un GLB local de
prueba desde un enlace compartido; apertura explícita; tracks detenidos al
ocultar la pestaña; cierre y permiso denegado; enlaces inválidos y vencidos;
QR descargado decodificado; vista móvil sin desbordamiento; cero excepciones de
JavaScript y cero escrituras a API. TypeScript y ESLint de los archivos tocados
también pasaron. Se conserva el resultado en `checks.json` y las capturas.

La misma prueba se repitió y aprobó sobre la compilación de producción
`frontend/dist`, servida localmente en el puerto 5180. Los workers y la entrada
`ar-camera.html` funcionaron también empaquetados. `npm run build --workspace
frontend` pasó todos sus controles. Evidencia de desarrollo conservada en
`backend/tmp/mindar-review-development/`; la carpeta `mindar-review/` contiene la
comprobación de producción más reciente.

Antes de imprimir tarjetas para clientes, probar en un Android y un iPhone
físicos: cámara trasera, permiso denegado/reintento, movimiento, iluminación,
orientación, retorno del fondo, cierre y enlace vencido. El ensayo de cámara
sintética no sustituye esta comprobación de dispositivo e impresión.

Documentación del proyecto usado: https://hiukim.github.io/mind-ar-js-doc/ y
https://github.com/hiukim/mind-ar-js.
