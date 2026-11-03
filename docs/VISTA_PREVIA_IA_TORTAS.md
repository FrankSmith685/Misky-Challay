# Imagen en vivo y propuesta con IA

## Flujo del configurador

La imagen es la vista principal de **Crea tu torta**. La ilustración cambia al
elegir bizcocho, relleno, complementos y colores indicados en la descripción.
Siempre se identifica como ilustración. La IA se usa **solo al pulsar «Generar
propuesta con IA»**, después de elegir bizcocho y relleno. Seleccionar opciones,
editar la descripción, subir una referencia o recargar la página no inicia
generaciones. La inferencia tarda; mientras llega su respuesta permanece la
ilustración de la combinación actual.

Después de generar, cambiar la receta muestra «Actualizar propuesta con IA».
El cliente decide cuándo actualizarla. Una propuesta de la receta anterior no
se presenta como si correspondiera a la nueva. Volver a una combinación cuya
imagen sigue en caché recupera esa imagen sin llamar al proveedor; el botón
«Propuesta actualizada» queda desactivado para evitar solicitudes repetidas.
Si hay una generación en proceso, se puede seguir eligiendo, pero no iniciar
otra hasta que termine. La anterior puede guardarse en caché sin reemplazar la
combinación que se está mostrando.

El backend recibe los nombres y cantidades de las opciones actuales, diámetro,
porciones y descripción. Si se adjunta una foto, se envía como `input_image_0` a
FLUX.2 klein en Cloudflare Workers AI para conservar la forma, pisos, paleta y
decoración principal y adaptar el bizcocho y el relleno. El prompt pide un corte
y una porción pequeña que permitan reconocer el interior. Los complementos se
mantienen junto a la torta. Una cobertura opaca no cambia de color solo porque
cambie el sabor del bizcocho.

El cliente puede comparar **Tu propuesta** con **Tu referencia**. La foto original
permanece como referencia del pedido; una propuesta generada no la sustituye ni
publica automáticamente. Los resultados son aproximaciones del diseño, y la
pastelería confirma el acabado.

## Descripción del diseño

La descripción escrita guía también la apariencia de la propuesta: ocasión,
colores, adornos, nombre, edad y mensaje sobre la torta. Si el cliente escribe una
frase entre comillas, el prompt pide conservarla exactamente, con su idioma y
acentos. Un saludo de cumpleaños en lenguaje natural se interpreta como un
mensaje breve para el destinatario; una edad indicada se representa con velas
numéricas o un topper, sin confundirla con porciones o pisos.

El texto aparece al principio del prompt y tiene prioridad sobre detalles de la
foto que el cliente pida cambiar. Los sabores, el relleno y las cantidades siguen
siendo los seleccionados en el configurador. Se retiraron las instrucciones
contradictorias que prohibían letras o exigían conservar todos los adornos sin
excepciones. Sin pedido de inscripción, no se solicitan mensajes ni edades nuevos.

El resumen muestra **Tu diseño** y avisa al editar la descripción que hay que
pulsar **Actualizar propuesta con IA**. Escribir no genera llamadas automáticas.
La revisión de la caché del frontend invalida propuestas del prompt anterior, y
el backend incluye el prompt en su clave. La descripción original se conserva
para el pedido; la imagen es ilustrativa y la pastelería confirma el texto y el
acabado. Las letras generadas por el modelo deben revisarse visualmente.

## 3D opcional

**Explorar en 3D** abre el visor únicamente a petición del cliente. Antes de ese
clic no se monta Three.js ni se consulta o inicia una reconstrucción. Si ya hay
una propuesta con IA de la combinación actual, se compacta y se utiliza como
referencia de la reconstrucción. En caso contrario se usa la referencia subida
o la torta base ilustrativa. El visor conserva sus controles de cámara,
comparación, PNG y QR, sin edición de color o de la malla.

Cerrar el visor suspende las consultas de reconstrucción; cambiar las opciones
con el visor cerrado no inicia otra conversión. Un trabajo ya recibido por el
motor puede continuar en el servidor y se recupera al volver a abrirlo. La
reconstrucción de una imagen con IA mantiene la foto original del cliente y sus
metadatos separados. El QR conserva la inclusión voluntaria de su referencia.

## Configuración

En `backend/.env` y `backend/.env.example`:

```dotenv
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CAKE_PREVIEW_MAX_PER_HOUR=12
```

Las credenciales existentes no se sustituyeron. El límite es por IP y hora para
el endpoint público de imágenes. También hay un máximo global de dos llamadas
al proveedor simultáneas. No se trasladan claves al navegador. FLUX.1 Schnell
continúa atendiendo la biblioteca administrativa; el configurador usa el método
de generación/edición de imágenes con FLUX.2 klein ya integrado.

Endpoints:

- `GET /api/v1/cakes/visual-preview/capabilities`: disponibilidad de configuración
  y límite público, sin credenciales.
- `POST /api/v1/cakes/visual-preview`: receta, opciones, tamaño y foto opcional.

El navegador descarta respuestas de recetas anteriores y comparte solicitudes
simultáneas de la misma combinación, también con React StrictMode. La caché
guarda hasta ocho propuestas durante quince minutos y hasta 24 MiB de cadenas;
el backend limita su caché a doce propuestas y 24 MiB. Son cachés en memoria,
no archivos públicos ni datos persistidos en el navegador. Repetir una receta
puede recuperar su propuesta anterior. Las solicitudes que llegan al endpoint
siguen contando en su límite HTTP aunque el backend pueda reutilizar la imagen.

Un error o límite de la IA mantiene la ilustración disponible. **Reintentar con
IA** permite recuperarse explícitamente; no hay reintentos automáticos.
La selección de opciones, el precio y el pedido no dependen de que termine la IA.

## Verificación del 29 de octubre de 2026

### Personalización a partir de la descripción

Pasaron quince pruebas locales del servicio de propuesta y del transporte de
imagen, incluyendo saludo natural con nombre y edad, frase exacta con acentos,
prioridad de la descripción sobre la foto, ausencia de inscripciones inventadas
sin descripción y caché independiente al cambiar solo el texto. También pasaron
TypeScript de frontend/backend y ESLint de los archivos modificados.

`node scripts/check-cake-description.cjs` comprobó el configurador real con
proveedor simulado: texto de Pepe/15 años con foto, cambio a Ana/18 años y a
Lucía/20 años durante una generación, actualización por botón, descarte de la
respuesta anterior, recuperación de la descripción previa desde caché, resumen
visible y ancho de 390 px. Cero llamadas automáticas, arranque de 3D, errores JS
o escrituras a pedidos. Evidencias en
`backend/tmp/photo-3d/description-preview-review/`. Las imágenes de esa prueba son
fixtures; no verifican la calidad de las letras de una generación real del modelo.

### Cambio a generación manual

A petición del usuario, se retiró el disparo automático tras 2,5 segundos. Las
capacidades del proveedor también se consultan solo a petición del cliente.
Las pruebas de la versión automática descritas abajo se conservan como historial.
El 3D sigue siendo opcional y mantiene su comportamiento existente.

En Chrome se comprobó el flujo con proveedor simulado: cero llamadas al elegir
opciones y esperar más de cinco segundos, subir una foto, cambiar la descripción
o recargar. Un doble clic inició una sola solicitud. Cambiar la receta durante
esa solicitud conservó la ilustración actual; se esperó a que terminara la
anterior antes de permitir otra. Volver a la combinación anterior reutilizó su
imagen. También se comprobaron actualización explícita con referencia y receta,
límite temporal sin reintentos automáticos, reintento manual y ancho de 390 px.
No hubo excepciones JS, arranque de 3D ni escrituras a pedidos o catálogo. Las
cinco solicitudes de imagen de la prueba se interceptaron; no se consumió IA real.
Evidencia privada: `backend/tmp/photo-3d/manual-preview-review/`.

### Revisiones anteriores

- Pasaron once pruebas locales del servicio de imagen y de la propuesta:
  validación, receta/referencia, deduplicación, caché, cambios de relleno/tamaño,
  fallo recuperable y límite simultáneo. El proveedor fue simulado.
- Pasaron TypeScript de frontend y backend y ESLint de los archivos modificados.
- En Chrome, la prueba del configurador real simuló los endpoints de IA y de
  conversión 3D. Se comprobaron cambios rápidos, espera de 2,5 segundos, descarte
  de una respuesta antigua, reutilización de una combinación, envío de la foto
  con la receta actual, comparación, 3D por clic, pausa del 3D cerrado, límite
  temporal con ilustración y reintento, y ancho de 390 px. No hubo excepciones JS
  ni escrituras a pedidos, catálogo o enlaces públicos. Las seis solicitudes de
  imagen de esta prueba fueron interceptadas, sin consumo del proveedor.
- En el paso de entrega con referencia, el resumen midió 985 px y el formulario
  1243 px: la columna visual no prolongó la cuadrícula.
- Evidencia privada: `backend/tmp/photo-3d/live-preview-review/`. Las imágenes de
  esas capturas son fixtures y no resultados de una inferencia real.
- La revisión automática rechazó inicialmente la prueba real por envío externo
  de la foto y posible consumo del proveedor. Después el usuario autorizó
  expresamente **una** generación con su foto dorada y la receta de chocolate
  con manjar blanco, 18 cm y 14 porciones. Se ejecutó una sola llamada real al
  endpoint del configurador: HTTP 200, 4669 ms, JPEG de 768 × 768 y 323939 bytes.
  Se guardaron el resultado y sus metadatos en
  `backend/tmp/photo-3d/live-image-preview/`, sin publicarlos.
- La revisión visual de esa salida confirmó que conservó el estilo dorado y
  mostró bizcocho oscuro con relleno claro. La IA colocó la porción como topper,
  aunque se pedía al costado. Se reforzó el prompt para exigir un plato separado
  a nivel de la mesa y prohibir una porción entre los adornos. Esa revisión del
  prompt se comprobó localmente y **no** se volvió a probar con una generación
  real. La imagen sigue siendo una propuesta; no acredita medidas ni ingredientes.

Documentación del proveedor: [FLUX.2 klein en Workers AI](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/).
