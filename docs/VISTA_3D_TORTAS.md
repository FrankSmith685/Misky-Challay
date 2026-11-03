# Vista 3D y QR de tortas

## Alcance

Desde el 29 de octubre de 2026, la vista principal del configurador es la
[imagen de la combinación y su propuesta con IA](VISTA_PREVIA_IA_TORTAS.md).
El 3D se inicia al pulsar **Explorar en 3D**. Las revisiones anteriores del visor
directo que se describen más abajo se conservan como historial.

- El configurador web muestra una vista 3D ilustrativa de la torta personalizable. La cobertura, el bizcocho, el relleno, parte de la decoración, la presentación y los pisos reconocidos por el nombre se reflejan en un modelo generado con Three.js. No sustituye la foto de referencia ni la aprobación de un diseño a medida.
- Las fotos subidas guían la imagen con IA. Al abrir el 3D pueden iniciar la reconstrucción de la propuesta actual o de la referencia con un motor configurado. El visor muestra su progreso y carga el GLB al terminar. El texto descriptivo y las notas no se convierten directamente en geometría. La configuración y los límites están en [Conversión de foto a 3D](CONVERSION_FOTO_3D.md).
- El botón QR crea una copia pública de corta duración con identificador aleatorio. Incluye la presentación, opciones y ajustes visuales; el asistente especial puede añadir colores y estilo, y la solicitud libre puede incluir porciones, sabor y relleno. La imagen se incluye únicamente al marcar «Incluir mi imagen en el QR». Nunca guarda la descripción, las notas, el precio ni datos de contacto en esa copia.
- Al abrir el QR en otro teléfono aparece la misma vista 3D. El enlace vence a los siete días. Los enlaces nuevos del configurador permiten recuperar presentación, opciones y porciones para seguir editando; el precio y la disponibilidad se consultan de nuevo. Los diseños a medida y los enlaces anteriores conservan el acceso para crear una torta similar.
- En equipos con WebXR `immersive-ar` y hit testing, el botón «Ver sobre mi mesa» permite colocar el modelo con la cámara. Se requiere HTTPS y permiso del dispositivo. En los demás equipos permanece la vista giratoria 3D. La compatibilidad real se verifica en dispositivos físicos.

## Preparación y despliegue

1. Instalar las dependencias del repositorio con `npm install`.
2. Aplicar la migración `0048-cake-preview-shares.ts` con el procedimiento habitual de migraciones antes de publicar el frontend nuevo. En desarrollo, `DB_SYNC=true` crea la tabla mediante el modelo.
3. Publicar frontend y backend en el mismo origen HTTPS o configurar el acceso habitual a `/api/v1`. `VITE_PUBLIC_WEB_URL` permite fijar el origen público; en desarrollo, si no se define, se usa el `FRONTEND_URL` HTTPS de `backend/.env`. Esto permite generar QR públicos desde localhost. Sin configuración pública, los QR usan el origen de la página. En producción no se incorpora automáticamente el ngrok local: se usa la URL explícita o el origen desplegado. El enlace debe apuntar al frontend con la misma API y base de datos. Un QR con `localhost` no servirá desde otro teléfono y la pantalla lo advierte.
4. Probar el enlace QR desde un segundo equipo y comprobar 3D con WebGL. Probar AR en un Android compatible con Chrome y WebXR. Un iPhone puede abrir la vista 3D aunque no disponga de la sesión WebXR requerida por esta implementación.

La API pública es `POST /api/v1/cake-previews` y `GET /api/v1/cake-previews/:token`. El `POST` comprueba producto, presentación, versión de diseño y opciones activas y tiene límite de peticiones. El `GET` devuelve únicamente la copia visual mientras no haya vencido. La tabla `cake_preview_shares` tiene índice de caducidad.

## Controles y recuperación

- En el configurador, la imagen de la combinación se muestra en el resumen desde el primer paso. El precio y la acción de continuar aparecen antes de la imagen. En celular, el resumen visual precede a los campos y la barra inferior conserva la acción del paso. «Tu combinación y detalles» y «Ver desglose del precio» abren un panel superpuesto con la selección, el precio y los alérgenos. La propuesta con IA se ve directamente en el resumen.
- El resumen con 3D ocupa 380–420 px en escritorio y usa un visor de proporción 3:2. «Tu combinación y detalles» reúne la selección, la inspiración y los alérgenos. El encuadre usa la superficie de la malla y eleva la cámara para tortas bajas. Ampliar abre un visor de una sola columna, sin panel de edición ni selector de color.
- La apertura de los detalles tampoco alarga la columna: el contenido se muestra en un diálogo con filas compactas y desplazamiento propio. El diseño anterior añadía 230 px de hueco al abrir la combinación y 630 px con inspiración y alérgenos desplegados. En la revisión posterior, la cuadrícula permaneció en 987 px y la página en 1892 px en los tres estados. También se comprobaron el desglose con una combinación completa, editar sabores, Escape, apertura con teclado y el regreso en móvil de 390 px, sin cambios de altura ni errores de JavaScript. Capturas y medidas privadas: `backend/tmp/photo-3d/summary-panel/`.
- Añadir foto y Cambiar foto seleccionan la referencia desde el resumen del configurador; también puede cambiarse o quitarse en el formulario. Compartir por QR abre un diálogo separado. La vista ampliada permite girar, ampliar, comparar con la foto y descargar PNG. No admite cambiar color, impresión, posición, escala de imagen ni deshacer/rehacer. El giro y el zoom solo cambian la cámara. Se mantiene un solo visor activo al ampliar.
- La propuesta con IA se genera al pulsar el botón correspondiente, después de elegir la receta. La ilustración local sí cambia con cada selección. Al abrir «Explorar en 3D» se utiliza la propuesta actual como referencia si está lista. El generador 2D por sí solo no produce la malla.
- Las fotos describen la torta completa. El selector de impresión comestible y la regeneración de modelos terminados se retiraron de la interfaz. Los trabajos fallidos o vencidos conservan la acción de reintentar.
- La imagen subida desde cualquiera de los tres formularios puede iniciar la reconstrucción. En el asistente con varias referencias, «Usar en 3D» elige la principal. El corte interior de la torta base ilustra los sabores; una malla reconstruida no ofrece un interior inventado.
- Al reemplazar la referencia desde el formulario, la imagen válida anterior permanece hasta que la nueva termine de prepararse. Una imagen dañada muestra un error y conserva la referencia anterior. Subir una imagen vuelve a mostrarla en el modelo aunque antes se hubiese ocultado y devuelve el visor a Exterior.
- En el configurador, el identificador del modelo y la referencia compacta se guardan en la sesión del navegador; se recuperan al recargar y al continuar desde la vista compartida. Los borradores antiguos pierden el tinte y los ajustes de impresión, conservando la referencia y el modelo. El carrito permite cambiar las opciones del pedido en el formulario. Las solicitudes de diseño conservan `brief.visualDesign` por compatibilidad con los registros existentes.
- `visualDesign` tiene versión, color opcional, modo de referencia, identificador opcional de reconstrucción y ajustes de impresión acotados por el servidor. La foto y su reconstrucción solo se publican con `includeReferenceImage=true`; el servidor verifica que correspondan al mismo trabajo completado. La referencia tiene cabecera de imagen válida y máximo 220 KB. El navegador elimina metadatos y reduce la referencia hasta 1024 píxeles, ajustando su compresión. Cambiar de imagen desmarca su inclusión en el QR.
- La vista compartida es de consulta: no permite subir otra foto ni modificar el modelo. El endpoint existente `POST /api/v1/cake-previews/:token/copy` sigue permitiendo crear una copia según el consentimiento de inclusión de la referencia, sin modificar el enlace anterior ni extender su caducidad. Un enlace vencido no permite copiarse. El servidor conserva las opciones del catálogo originales.
- Exterior e interior: la vista exterior muestra cobertura; el corte permite inspeccionar el bizcocho y el relleno. Las decoraciones se ilustran cuando una opción o temática las define.
- Acercar, alejar, restablecer vista y giro opcional. Ampliar abre un diálogo con foco y teclado, usando un solo visor activo. Guardar imagen descarga una tarjeta PNG de la vista actual; Guardar QR descarga el código en PNG. Los teléfonos compatibles también ofrecen el menú nativo para compartir.
- El visor renderiza cuando hay interacción o giro activo y pausa fuera de pantalla. Al cambiar el modelo libera geometrías, materiales y texturas anteriores. El botón Recargar permite recuperar un contexto gráfico perdido.
- La representación usa metros. Si el catálogo define diámetro para la presentación, ese dato se conserva en el enlace y se usa en AR; las porciones libres se marcan con tamaño orientativo.
- Cada QR corresponde a las selecciones con las que se solicitó. Una respuesta tardía se descarta si el cliente cambia opciones mientras se genera el enlace.
- La copia para continuar guardada en `snapshot_json.configuration` contiene solo identificadores de opciones, cantidades y versión pública del diseño. No contiene precio, referencias ni datos privados. El configurador descarta opciones que ya no estén disponibles y pide revisar los cambios.
- Una vez abierto un enlace, las ediciones locales se guardan con su identificador. Recargar conserva la última combinación y las porciones de ese borrador; abrir un enlace distinto aplica la nueva copia. Cambiar de sucursal vuelve a consultar disponibilidad y conserva las opciones compatibles.

Estos campos nuevos viven en el JSON existente y no requieren otra migración. Las pruebas de `cakePreviewShares.test.ts` cubren privacidad de la copia pública, recuperación de opciones, rechazo de opciones ajenas y vencimiento.

## Revisión del resumen interactivo

La revisión anterior del editor verificó en Chrome con WebGL a 1440, 390 y 320 píxeles el modelo inicial, la referencia en la captura, los ajustes de impresión, deshacer/rehacer y la recuperación del borrador. Esas funciones de edición se retiraron el 29 de octubre de 2026 a petición del usuario. Las evidencias anteriores se conservan como historial y no describen los controles actuales.

La revisión del consentimiento para incluir la imagen en el QR y del botón para aplicar una imagen generada usó respuestas simuladas de esos servicios, sin publicar enlaces ni llamar al proveedor de IA. La cámara AR requiere la comprobación en dispositivo físico descrita en Preparación y despliegue.

## Límite del modelo ilustrativo

La experiencia opcional **Experiencia AR** añade reconocimiento de una tarjeta
impresa con MindAR. Se abre desde el pie o desde una vista compartida y no inicia
IA ni reconstrucciones. Uso, impresión y comprobaciones de cámara en
[TARJETA_AR_MINDAR.md](TARJETA_AR_MINDAR.md).

La torta base usa geometría y materiales generados en el navegador. Las referencias fotográficas necesitan un motor de reconstrucción para producir su propio GLB; sin motor configurado se conserva la foto y se informa de su indisponibilidad. Los modelos generados son aproximaciones y no garantizan las partes ocultas, las figuras ni el texto. El visor conserva los colores de la fuente y descarta tintes de versiones antiguas. La producción, los alérgenos y el precio siguen sujetos a las validaciones existentes del servidor.
