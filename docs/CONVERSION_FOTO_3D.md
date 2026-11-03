# Foto del cliente a torta 3D

## Funcionamiento

La [imagen de la combinación con IA](VISTA_PREVIA_IA_TORTAS.md) es la vista principal. Al pulsar **Explorar en 3D**, la propuesta actual puede iniciar la reconstrucción de la torta completa; si todavía no hay propuesta generada se usa la referencia subida o la torta base. El cliente ve la imagen, la etapa de trabajo y el progreso cuando el motor proporciona un porcentaje. Al terminar, Three.js carga el GLB generado con su geometría y texturas. Puede girarse, ampliarse, compararse con la referencia, guardarse como imagen o abrirse en AR en dispositivos compatibles. El visor es de consulta y conserva los colores originales.

La reconstrucción tarda; no existe una malla que pueda mostrarse progresivamente mientras el proveedor todavía no la devuelve. La interfaz consulta el estado cada cinco segundos mientras el visor está abierto y presenta el resultado al finalizar. El giro y el zoom responden al momento. Una nueva referencia se convierte al volver a solicitar su vista 3D.

Cada foto describe la torta completa. El botón **Explorar en 3D** abre el visor sin panel lateral de edición y **QR** abre un diálogo separado. Se retiraron los controles de tinte, impresión, colocación de imagen, deshacer/rehacer y regeneración de modelos terminados. Al recuperar un borrador antiguo se limpian esos ajustes conservando su foto y su identificador de reconstrucción.

El modelo terminado permite alternar entre **Modelo 3D** y **Foto original** para comparar. Compartir sigue requiriendo elegir expresamente si se publica la foto y su modelo. Los trabajos fallidos o vencidos conservan la acción explícita de reintentar.

Una reconstrucción aproxima el diseño visible. No confirma la decoración de la cara oculta, las medidas ni los ingredientes reales. Los sabores y el relleno siguen el configurador del pedido. El corte interior solo está disponible en el modelo paramétrico de la torta base.

## Motor local sin cuenta externa: TripoSR

Para desarrollo en Windows se incluye un servicio local de [TripoSR](https://github.com/VAST-AI-Research/TripoSR), cuyo código y pesos se publican con licencia MIT. Se reutilizan su modelo, su generador de atlas y su rasterizador de texturas. La configuración actual usa resolución de geometría 192, textura UV de 1024 px y bloques pequeños para reducir el consumo. La textura se incorpora al GLB y no se imprime una foto sobre una torta genérica. Los colores se consultan sobre la superficie reconstruida. La calidad y el tiempo dependen del equipo y de la foto.

El atlas de xatlas se calcula en un proceso separado para mantener disponibles las consultas de progreso mientras se generan las coordenadas UV. Los archivos intermedios solo contienen geometría y se retiran al terminar. La salida conserva normales suaves y una textura interna; el visor ajusta iluminación, cámara y sombra para ese modelo.

El visor conserva los colores fotográficos de TripoSR con un material sin iluminación adicional ni curva de contraste. Los GLB antiguos que solo incluyen color por vértice también se reconocen: sus bytes sRGB se convierten al espacio lineal del visor una sola vez. Se conserva la geometría y se encuadra el frente del objeto. Esto corrige el aspecto oscuro del visor; no reconstruye detalles perdidos ni repara una forma deformada por el generador.

Con TripoSR seleccionado, `/health` debe informar `engine: triposr`, `adapterVersion: 4`, `resolution: 192` y `textureResolution: 1024`. Si solo devuelve `resolution: 128`, sigue atendiendo un proceso antiguo y cambiar `.env` no actualiza ese proceso. El lanzador lee también el puerto de `TRIPOSR_3D_URL`, valida que sea local y puede recibir `-Port` explícito. Los modelos guardados de la versión anterior se mantienen; regenerarlos requiere una nueva solicitud con la foto original.

Preparar el entorno aislado y los pesos:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-photo3d-local.ps1
```

Todo se guarda en `backend/tmp/photo-3d`: Python administrado por uv, entorno virtual, repositorio fijado, paquetes, modelos y cachés. Se descargan varios GB; no se instalan Python ni paquetes en el sistema y no se modifica el PATH global. La extracción de superficie usa scikit-image en CPU para evitar instalar compiladores de CUDA en Windows.

Configuración del backend:

```dotenv
CAKE_3D_PROVIDER=triposr
TRIPOSR_3D_URL=http://127.0.0.1:8091
TRIPOSR_3D_RESOLUTION=192
TRIPOSR_3D_TEXTURE_RESOLUTION=1024
CAKE_3D_MAX_ACTIVE=1
CAKE_3D_HOURLY_LIMIT=30
```

Arrancar el sitio y el motor:

```powershell
npm run dev:local3d
```

Si la web ya está iniciada, `npm run dev:3d` arranca solo el motor. Reiniciar el backend tras cambiar sus variables. El servicio escucha únicamente en `127.0.0.1:8091`; el navegador usa la API del backend. Los teléfonos no necesitan instalar el modelo.

Las dos variables de calidad se leen desde `backend/.env` en el lanzador PowerShell. Para aplicar actualizaciones de Python o de calidad, detener también el proceso del motor anterior y volver a iniciarlo. El servidor evita que otro proceso reclame su mismo puerto en Windows. Las dependencias nuevas de texturas (`xatlas`, `moderngl`) se incluyen en el script de preparación y ya están instaladas en el entorno local revisado. Para un equipo limitado se puede usar `-Resolution 128 -TextureResolution 512` al ejecutar el lanzador directamente; `-TextureResolution 0` conserva el modo de colores por vértice.

La primera conversión carga los pesos en memoria y tarda más. Para liberar la GPU al terminar las pruebas, detener el servicio. Si no hay memoria gráfica suficiente, se puede iniciar explícitamente en CPU:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-photo3d-local.ps1 -Device cpu
```

Esta alternativa permite probar sin contratar una API. Para atender clientes en una web alojada, el backend necesita alcanzar el motor: un backend remoto no puede usar `127.0.0.1` de tu computadora. Publicar el frontend no traslada el trabajo de reconstrucción a los celulares.

### Prueba real en este equipo

#### Referencia dorada proporcionada por el usuario

Se probó `C:/Users/Intel/Downloads/descarga.jpg` (204 × 192 px, 6372 bytes) con el motor activo 192/1024 mediante la API real. La conversión tardó 106 segundos y produjo un GLB de 3 186 040 bytes con una textura interna. Se comprobó la comparación con la foto, el giro/encuadre, descarga PNG y la vista de 390 px, sin errores de JavaScript. Los artefactos locales están en `backend/tmp/photo-3d/golden-review`: `comparison.png`, `model-view.png`, `mobile.png`, `model.glb` y `result.json`. No se creó un QR ni una publicación de la foto.

El resultado conserva el color dorado y la silueta general, pero deforma el cuerpo y los adornos y no reproduce el texto. La segmentación conservó el cuerpo de la torta (alfa medio 245,5/255 en su región central); el error de forma persiste en la reconstrucción. Este resultado no alcanza la fidelidad solicitada. No hay evidencia de que aumentar más la resolución de extracción de TripoSR lo resuelva. El formulario y el editor ahora informan el tamaño de fotos menores de 512 px en su lado mayor, sin impedir su uso.

Posteriormente se instaló y probó [Stable Fast 3D](https://github.com/Stability-AI/stable-fast-3d) con el acceso de Hugging Face aprobado por el usuario. El resultado con esta foto siguió siendo demasiado plano; consultar su sección de pruebas. Hunyuan Mini es el motor seleccionado después de comparar ambas salidas con la misma referencia.

Con la nueva calidad 192/1024 se verificó otra conversión real de esa foto en la GTX 1060: 94 380 caras, 75 769 vértices tras las divisiones del atlas UV y GLB de 4 782 052 bytes con PNG interno. La fase de generación tardó 139,88 segundos; la carga inicial se añade a ese tiempo. Durante el atlas se comprobó que `/health` continuaba respondiendo (584 ms en una consulta). La revisión en navegador reutilizó ese archivo generado para comprobar escritorio, 390 px, comparación con la foto, editor ampliado, un único canvas, migración del borrador antiguo y conservación de una elección nueva de impresión, sin errores de JavaScript ni nuevas inferencias. Una primera revisión se interrumpió por la recarga del entorno de desarrollo durante cambios de código; se repitió con el modelo ya terminado.

La malla sigue teniendo limitaciones visibles: TripoSR simplifica y puede deformar la decoración. Más resolución de extracción o una textura de 1024 px no añaden detalles que el modelo no pudo inferir. Esta salida no alcanza una reproducción fotográfica del diseño. Para una copia fiel de un producto de catálogo se necesita un modelo 3D revisado por un artista o una reconstrucción con varias vistas; el modo de una sola foto sigue siendo aproximado.

Resultados de la configuración anterior de 128, como referencia de rendimiento:

Se verificó la reconstrucción en una GTX 1060 de 6 GB usando la foto `frontend/public/images/brand/patisserie-hero-v1.jpg`, sin respuestas simuladas del motor. La primera ejecución tardó 96 segundos, incluida la carga. Con el motor cargado, la prueba completa de subida desde la web y apertura del resultado tardó 17 segundos; la generación del modelo consumió 9,42 segundos. Se produjeron 19 242 vértices y 38 532 caras. Estos tiempos corresponden a esa imagen y resolución, no a un plazo garantizado.

Se revisaron el resultado giratorio, el cambio de ángulo, la vista móvil y la recuperación al recargar sin volver a generar. La exportación incluye normales de vértices para iluminar suavemente la superficie. TripoSR produce una aproximación de menor detalle que la fotografía: las flores pequeñas, los textos y las caras ocultas pueden verse diferentes. El control de calidad del diseño final sigue correspondiendo a la pastelería.

La API comprueba que el servicio local responda antes de ofrecer una conversión nueva. Si está apagado, conserva la foto y permite continuar el pedido sin iniciar una tarea fallida.

La revisión inicial instaló TripoSR y sus pesos con un trabajo simultáneo. La configuración local actual selecciona Hunyuan Mini; consultar su sección más abajo. Para una nueva sesión de desarrollo, detener el servidor anterior y ejecutar `npm run dev:local3d`. Los motores alternativos conservan sus entornos y los GLB anteriores siguen disponibles.

## Activar otros motores

La interfaz y la API están implementadas. **La conversión real necesita uno de los siguientes motores configurado y accesible.** Sin motor, se conserva la foto y se indica que la conversión está pendiente de activación; no se presenta una torta genérica como si fuese su reconstrucción.

Las variables se configuran en `backend/.env` o en el servicio del backend, y requieren reiniciar ese proceso. Nunca llevan prefijo `VITE_` y no se entregan al navegador.

### Meshy

```dotenv
CAKE_3D_PROVIDER=meshy
MESHY_API_KEY=clave_de_la_cuenta
CAKE_3D_MAX_ACTIVE=2
```

La API inicia tareas Image to 3D con textura, PBR y salida GLB, usando Meshy 6 y una malla objetivo de 30 000 caras. Requiere una cuenta, una clave y créditos disponibles. Los límites de la tienda no sustituyen los límites de gasto del proveedor. La integración no crea una cuenta ni compra créditos.

Documentación: [Image to 3D de Meshy](https://docs.meshy.ai/en/api/image-to-3d).

### Hunyuan3D 2.1 en servidor propio

Se integra con el servidor oficial de Hunyuan3D 2.1. Instalar sus dependencias y pesos en una máquina con la GPU requerida, siguiendo el repositorio del motor, y ejecutar su API. La aplicación no descarga modelos ni instala CUDA automáticamente en el equipo del cliente.

```dotenv
CAKE_3D_PROVIDER=hunyuan
HUNYUAN_3D_URL=http://127.0.0.1:8081
# Opcional, si un proxy protege el servicio con Bearer.
HUNYUAN_3D_API_KEY=
CAKE_3D_MAX_ACTIVE=1
```

Se usa `POST /send` con eliminación de fondo y texturas, y `GET /status/:uid`. Hunyuan comunica etapas de forma y textura; no informa un porcentaje de avance, por lo que la interfaz muestra un indicador indeterminado. El adaptador consume `model_base64` cuando finaliza.

La GTX 1060 de 6 GB del equipo revisado queda por debajo de los requisitos publicados de Hunyuan3D 2.1: 10 GB para forma, 21 GB para textura y 29 GB en conjunto. Un servidor con GPU compatible o un servicio externo es necesario para esta configuración. Consultar también los modos de memoria y la licencia del motor antes de desplegarlo.

Fuentes: [repositorio y requisitos de Hunyuan3D 2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1), [contrato de la API](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/API_DOCUMENTATION.md).

## Hunyuan3D Mini Turbo local (selección actual)

**Powered by Tencent Hunyuan.** Se utiliza el código existente de
[Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) y los pesos de
[Hunyuan3D-2mini](https://huggingface.co/tencent/Hunyuan3D-2mini), con revisiones
fijadas en [NOTICE.Hunyuan](../backend/tools/photo3d/NOTICE.Hunyuan). Es un modelo
con pesos disponibles bajo una licencia comunitaria, con condiciones y límites
territoriales; no equivale a una licencia MIT. Se incluyen la
[licencia y política de uso](../backend/tools/photo3d/LICENSE.Hunyuan).

Preparar en Windows, desde la raíz del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-photo3d-hunyuan.ps1
```

El script prepara `venv-hunyuan`, código, unos 3,8 GB de pesos y cachés dentro
de `backend/tmp/photo-3d`, en D:. No cambia el Python del sistema. El entorno y
los pesos ya están instalados en el equipo revisado; no hace falta repetir la
descarga ni introducir un token en `.env`.

Configuración ya aplicada a **backend/.env**, con las mismas claves documentadas
en **backend/.env.example**:

```dotenv
CAKE_3D_PROVIDER=hunyuanmini
HUNYUAN_MINI_3D_URL=http://127.0.0.1:8091
HUNYUAN_MINI_3D_RESOLUTION=192
HUNYUAN_MINI_3D_TEXTURE_RESOLUTION=1024
HUNYUAN_MINI_3D_STEPS=8
CAKE_3D_MAX_ACTIVE=1
CAKE_3D_HOURLY_LIMIT=30
```

Iniciar con `npm run dev:local3d`. La comprobación
`http://127.0.0.1:8091/health` debe devolver `engine: hunyuanmini`,
`adapterVersion: 4` y `weightsReady: true`. La primera conversión carga los
pesos; la interfaz muestra preparación, separación del fondo, forma y colores
sin inventar porcentajes. El servidor conserva los trabajos y la API solo
acepta el motor configurado. `npm run dev` por sí solo no inicia Python.

El equipo que ejecuta el motor debe permanecer encendido durante el cálculo.
La suspensión de Windows pausa la inferencia; si transcurren más de 30 minutos,
la tarea de la API vence y se puede iniciar otra conservando la referencia.

La forma completa proviene de la inferencia condicionada por la foto. El motor
mueve sus componentes entre RAM y GPU, limita los bloques de atención y usa
marching cubes en CPU para funcionar en la GTX 1060 de 6 GB. La carga comprueba
todas las claves y formas del checkpoint. El VAE de inferencia excluye solamente
el encoder y `pre_kl` que no se distribuyen en esos pesos.

Para los colores se proyecta la foto en el frente de la **geometría inferida**;
la cobertura del reverso se estima. Esto evita ejecutar el modelo opcional
Hunyuan Paint, que no se ha instalado ni probado en esta GPU. La malla se reduce
a 60 000 caras y se exporta con una textura interna de 1024 px. El visor conserva
los colores originales y permite girar, ampliar y comparar con la foto.
La generación de una malla nueva tarda minutos y no se anuncia como instantánea.
El visor no ofrece edición del modelo.

### Resultado con la única foto disponible

La prueba con `descarga.jpg` (204 × 192 px) generó un cuerpo cilíndrico y adornos
con volumen. La inferencia de forma tardó 240,27 s, más la carga inicial. La
malla original tuvo 396 712 caras y dimensiones relativas 1,374 × 1,987 × 1,750;
la relación de profundidad ya no corresponde a una figura plana. Tras reducir
caras y aplicar colores, el GLB ocupó 6 530 596 bytes. Las capturas frontal y
lateral de esa prueba están en `backend/tmp/photo-3d/golden-review-hunyuan/`.

La reconstrucción mejora el volumen respecto a las pruebas de TripoSR y SF3D,
pero las letras pequeñas, la corona, los abanicos y el reverso siguen siendo
aproximaciones. Los colores visibles se derivan de la foto; el reverso no fue
fotografiado. Se utiliza la única imagen del usuario sin exigir otra. El visor
muestra esta limitación y permite comparar el resultado con su referencia.

Los borradores ya convertidos conservan su GLB anterior. Los ajustes de tinte e
impresión de versiones antiguas se descartan. El QR reutiliza el resultado y
mantiene el consentimiento para incluir la foto.

### Verificación de la integración completa

La misma foto original pasó por `POST /api/v1/cakes/reconstructions`, consultas
de estado, validación del GLB y descarga desde la API Node. La ejecución sin
suspender Windows tardó 236,905 s en total (234,59 s en el motor ya cargado) y
entregó un GLB de 6 530 596 bytes. Coincide con el resultado de la prueba previa.
Una ejecución anterior fue interrumpida por la suspensión de Windows y venció;
se repitió la prueba completa sin modificar ese registro fallido.

Chrome verificó el modelo real: giro manual y automático, zoom, restablecimiento,
tono rosa, deshacer, comparación con la referencia, descarga PNG y editor
ampliado. La vista de 390 px se capturó después de cargar la malla. No hubo
errores de JavaScript, desbordamiento horizontal, canvas duplicados ni nuevas
solicitudes de generación al editar. Los artefactos privados están en
`backend/tmp/photo-3d/golden-review-hunyuan-api-complete/`: `comparison.png`,
`side.png`, `mobile.png`, `model-view.png`, `model.glb`, `result.json` y
`browser-result.json`. No se publicó un QR con la foto.

Pasaron las 26 pruebas del servicio y la privacidad de enlaces, la compilación
de backend, TypeScript de frontend, ESLint de los archivos modificados y las
comprobaciones de sintaxis Python y PowerShell. Estas pruebas de navegador no
sustituyen una comprobación de AR en un teléfono físico.

### Corrección del acabado en el visor (29 de octubre de 2026)

El atlas del adaptador local alternaba por cara entre la foto y una franja de
color liso. Esto producía un parche abrupto al girar, además de estirar la
decoración frontal sobre una parte superior poco visible en la referencia.

El visor reconoce ese material (`Hunyuan cake photo`) y prepara coordenadas
continuas para la textura. Conserva el muestreo de la foto por píxel y mezcla
las caras ocultas con un perfil de cobertura y capas extraído de la referencia,
en RGB lineal. Para una torta baja fotografiada casi de frente, el centro superior
no observado se representa con un acabado estimado y grano suave; se conserva
la decoración visible del borde. El aviso habla de **zonas ocultas estimadas**.
La forma y los adornos siguen siendo aproximaciones de la reconstrucción.

La corrección se calcula al abrir el modelo y también se aplica a GLB guardados,
con captura PNG, vista compartida y render de la sesión WebXR. La primera revisión
incluyó cambios de tono, que se retiraron en la actualización descrita abajo.
Los GLB originales del backend se conservan; esta corrección de material pertenece
al visor de la aplicación. No equivale a generar texturas con Hunyuan Paint.

Se revisaron los modelos reales de chocolate y dorado desde cuatro ángulos.
Los atributos nuevos fueron finitos y consistentes en posiciones y normales
compartidas; las posiciones de los 180000 vértices no cambiaron. La preparación
del material tardó unos 188 ms y 135 ms, respectivamente, en este equipo.
Se comprobaron cambio y restauración del tono, descarga PNG y ancho de 390 px,
sin conversiones adicionales ni errores de compilación GLSL o excepciones JS.
El navegador de prueba registró un bloqueo del WebSocket de HMR de desarrollo
por su comprobación de acceso a red local; el render y las consultas HTTP
continuaron. No se probó AR en un teléfono físico en esta revisión.
Las capturas y el registro están en `backend/tmp/photo-3d/surface-review/`.

### Visor sin edición y suavizado (29 de octubre de 2026)

A petición del usuario se retiraron el editor, el tinte del modelo, los ajustes
de impresión y deshacer/rehacer. La foto puede cambiarse desde el formulario o
el resumen del configurador; el diálogo ampliado queda dedicado a explorar y
comparar. Compartir QR abre otro diálogo con consentimiento de imagen desmarcado.
Los borradores antiguos se normalizan a colores originales conservando el token
y el hash de reconstrucción. El visor y la actualización del material tampoco
aplican tintes guardados, incluidas las vistas compartidas y la sesión WebXR.

El material Hunyuan de tortas bajas recibe un filtro de suavizado alternado sobre
las posiciones soldadas temporalmente. Se conserva el orden de triángulos y la
separación de vértices del atlas UV,
la base queda fija y el desplazamiento máximo es del 1,5 % del ancho del modelo;
el lateral usa una quinta parte de esa intensidad. Se recalculan normales
continuas y después la proyección de la foto. Los modelos altos con toppers no
reciben este filtro. El proceso es idempotente y modifica solo la copia del visor,
sin sustituir los GLB del backend ni iniciar otra conversión. No recupera detalles
que faltan en la foto y no garantiza un acabado fotográfico.

La revisión reutilizó los GLB reales de chocolate y dorado (180000 vértices cada
uno). Ambos conservaron atributos finitos y uniones de textura consistentes;
aplicar el filtro dos veces no desplazó nuevamente los vértices. El chocolate
respetó el límite de desplazamiento y el dorado conservó todas sus posiciones.
La preparación tardó unos 632 ms y 142 ms en esta ejecución. Un tinte antiguo no
alteró el render ni el material. En el configurador real se recuperó un borrador
con tinte rosa y colocación lateral: se limpiaron esos ajustes sin perder el token.
Pasaron comparación con la foto, descarga PNG, apertura/cierre de diálogos,
consentimiento QR desmarcado y vista móvil de 390 px sin desbordamiento del
contenido. No se enviaron conversiones, enlaces públicos, pedidos ni cambios de
catálogo. Se conservan los avisos de HMR de la página virtual de prueba descritos
en la revisión anterior; no hubo excepciones JS de la aplicación ni errores GLSL.
Capturas y resultados: `backend/tmp/photo-3d/readonly-review/`.

### Identidad y distribución del servicio

Esta integración es independiente de Tencent: Tencent no está afiliado,
asociado, patrocinando ni respaldando el servicio. Antes de ofrecerlo a terceros,
el operador debe mostrar su nombre legal completo y entidad reales, entregar la
licencia y las restricciones de uso aplicables, y revisar las condiciones
territoriales y comerciales indicadas en ella. La marca Misky Challay no permite
deducir esa identidad legal. La configuración revisada es local; no se ha
publicado el motor ni creado enlaces públicos con la foto.

## Stable Fast 3D local (alternativa)

**Powered by Stability AI.** Este motor utiliza el código y los pesos de
[Stable Fast 3D](https://github.com/Stability-AI/stable-fast-3d), sujetos a la
[licencia incluida](../backend/tools/photo3d/LICENSE.SF3D) y al
[aviso de integración](../backend/tools/photo3d/NOTICE.SF3D).
El uso comercial exige cumplir las condiciones de Stability AI; tener una cuenta
en Hugging Face no sustituye los requisitos de esa licencia.

Preparación en Windows, desde la raíz del proyecto:

1. Crear una cuenta en Hugging Face y aceptar las condiciones de
   `stabilityai/stable-fast-3d` con esa misma cuenta.
2. Autenticarse localmente con un token de lectura. Usar
   `HF_HOME=backend/tmp/photo-3d/huggingface` antes de ejecutar `hf auth login`.
   El token permanece en la caché privada y no se envía al frontend ni al servidor Node.
3. Ejecutar `powershell -ExecutionPolicy Bypass -File scripts/setup-photo3d-sf3d.ps1`.
   Se crea `venv-sf3d`, separado de TripoSR, con PyTorch 2.5.1/cu118 y torchvision
   0.20.1. El código se fija en la revisión del aviso. Los pesos ocupan unos 4 GB.
4. Configurar **backend/.env** (las mismas claves figuran en `.env.example`):

```dotenv
CAKE_3D_PROVIDER=sf3d
SF3D_3D_URL=http://127.0.0.1:8091
SF3D_3D_TEXTURE_RESOLUTION=1024
CAKE_3D_MAX_ACTIVE=1
```

5. Iniciar con `npm run dev:local3d`. El lanzador selecciona el entorno según
   `CAKE_3D_PROVIDER`. `npm run dev` por sí solo no inicia el motor Python.
6. Comprobar `http://127.0.0.1:8091/health`: debe indicar `engine: sf3d`,
   `weightsReady: true`. La API comprueba que el puerto corresponda al motor
   configurado; un proceso anterior de TripoSR no se anuncia como SF3D.

Las descargas, cachés y archivos temporales se guardan en D: dentro del proyecto.
El procesamiento se mantiene local y usa los pesos ya descargados, sin una API
de inferencia de pago. La primera petición carga el modelo; las siguientes
reutilizan la instancia. La interfaz muestra la etapa real sin inventar porcentajes.

La adaptación usa xatlas y ModernGL para empaquetado UV y rasterización, evitando
compilar las extensiones CUDA de upstream. La forma, los colores, los materiales
y las normales siguen saliendo de la inferencia de SF3D; no se usa una torta
genérica con una fotografía pegada. Los pesos y los cálculos conservan float32;
los encoders se transfieren entre RAM y GPU por componente. La atención y la
consulta geométrica se dividen en bloques para limitar la memoria máxima.
La carga verifica las claves, los alias de parámetros compartidos y las formas
de todos los tensores antes de restaurar el checkpoint.
Los materiales PBR se muestran con un entorno de estudio en el visor.

Una sola foto sigue proporcionando una reconstrucción aproximada. Deben revisarse
la geometría, los adornos, las letras y las partes no visibles antes de presentar
el resultado como un diseño confirmado. Para volver a TripoSR, cambiar
`CAKE_3D_PROVIDER=triposr` y reiniciar el entorno; los GLB guardados siguen disponibles.

### Prueba real del 28 de octubre de 2026

Se usó la foto aportada por el usuario (`descarga.jpg`, 204 × 192 píxeles),
pasando por la API Node y el servicio Python local. El checkpoint completo,
revisión `f0c9a8ffd62cb1bbc8a7a53c9f87a0be1b6be778`, cargó con validación estricta.

- GTX 1060 de 6 GB; texturas de 1024 píxeles, 8984 vértices y 11616 caras.
- Generación en float32 con componentes transferidos entre RAM y GPU: 38,05 s.
  La petición completa inicial, incluida la carga del motor, tardó unos 147 s.
- GLB de 782384 bytes, con texturas y materiales PBR integrados.
- Chrome: un solo canvas, giro, zoom, cambio de tono, deshacer, comparación con
  la foto y descarga PNG; sin errores de JavaScript ni nuevas conversiones al editar.
- Vista de 390 píxeles sin desbordamiento horizontal. Las 24 pruebas de API,
  idempotencia, cuotas y privacidad de QR pasaron.

**El parecido frontal mejoró, pero la fidelidad de volumen NO quedó resuelta.**
La profundidad horizontal resultó solo el 15,8 % del ancho: al girar se aprecia
un objeto excesivamente plano. Se observó el mismo problema en FP16 y float32.
No se afirma que cambiar de precisión haya solucionado esta foto. El visor
detecta una proporción horizontal inferior al 20 % y avisa de la poca profundidad.
La comparación y la vista lateral se guardaron en
`backend/tmp/photo-3d/golden-review-sf3d-fp32/` (privado, ignorado por Git).
El usuario confirmó que solo dispone de esta foto. Se conserva esa referencia;
no se exige otra foto ni se afirma recuperar con exactitud letras, adornos o
partes ocultas. Las pruebas adicionales deben usar la misma imagen.

## API y persistencia

- `GET /api/v1/cakes/reconstructions/capabilities`: disponibilidad del motor, sin credenciales.
- `POST /api/v1/cakes/reconstructions`: referencia compacta y `requestId` UUID; devuelve un trabajo con token aleatorio derivado de ese identificador. El cupo de generaciones nuevas por IP y hora se configura con `CAKE_3D_HOURLY_LIMIT` (30 en el entorno local revisado, 6 por defecto; 0 lo desactiva). Recuperar el mismo `requestId`, una GPU ocupada y un envío al motor que no llegó a iniciarse no consumen ese cupo. Las tareas nuevas aceptadas sí se cuentan. El contador horario reside en memoria y se reinicia con la API; el límite global de trabajos activos sigue consultando los registros persistentes.
- La ruta conserva una protección corta de 30 peticiones por minuto. Si se alcanza un límite, responde 429 con `Retry-After`; el visor muestra la espera y desactiva el reintento hasta que termine. No anuncia que está reanudando un trabajo cuando aún no existe. Si la respuesta inicial se perdió, el reintento reutiliza el mismo identificador y recupera el trabajo antes de comprobar el cupo.

La regresión de límites pasó con 22 pruebas del servicio, las rutas y los enlaces públicos. Se verificaron una cuarta foto aceptada, recuperación con cupo lleno, separación por cliente, reinicio de la ventana horaria y envíos fallidos sin consumo. Una prueba de navegador a 390 px verificó el bloqueo temporal, el contador y el reintento con el mismo identificador, sin crear trabajos duplicados ni ejecutar otra inferencia.
- `GET /api/v1/cakes/reconstructions/:token`: consulta del trabajo; reanuda la consulta al proveedor tras reiniciar Node, sin volver a enviar la imagen.
- `GET /api/v1/cakes/reconstructions/:token/model`: entrega el GLB cuando está listo. No redirige al navegador a URLs temporales del proveedor.

El mismo `requestId` para la misma imagen devuelve el mismo trabajo. React StrictMode, cerrar el editor y recargar no deben crear conversiones adicionales. Una solicitud interrumpida al iniciar no se reenvía automáticamente a un proveedor que pueda cobrarla. El cliente conserva el identificador para reanudar. Un fallo confirmado permite una nueva solicitud explícita.

Los trabajos y modelos se guardan en `backend/uploads/private-cake-3d`, fuera de la biblioteca pública de medios. Conservar este directorio en un volumen persistente junto al backend. Esta implementación está preparada para una instancia de backend; para múltiples réplicas se necesita un repositorio de trabajos con bloqueo compartido antes de habilitarlas.

Los tokens son enlaces de acceso: no publicarlos fuera del flujo de compartir. La foto y las credenciales no se guardan en los metadatos del trabajo. Los registros vencen a los 30 días y los archivos vencidos se limpian al iniciar otras conversiones. Compartir conserva el archivo al menos ocho días más. Hay un límite global de trabajos simultáneos y un plazo máximo de 30 minutos por conversión.

El servidor limita el GLB a 40 MiB, verifica su cabecera y rechaza referencias a recursos externos o compresiones no soportadas por el visor. Las descargas de Meshy solo aceptan `https://assets.meshy.ai`, sin redirecciones. La foto se prepara hasta 1024 píxeles y se comprime para respetar el límite del carrito y de la copia pública.

## QR, borradores y pedidos

El identificador del modelo se conserva en `visualDesign.reconstruction`, con la huella de la referencia. El borrador de sesión y el carrito lo conservan junto a los demás ajustes. Otra referencia solo puede usar un modelo generado a partir de esa misma imagen.

El QR **no publica la foto ni su modelo derivado** hasta activar «Incluir mi imagen en el QR y su reconstrucción 3D». Al activarlo se espera a que el modelo esté listo; el backend verifica la correspondencia de la imagen y del trabajo. Sin esa opción el enlace contiene la torta base. La vista compartida carga el modelo ya generado sin otra conversión.

Las imágenes de inspiración 2D con FLUX son un servicio distinto. Aplicarlas como referencia puede iniciar una reconstrucción con el motor 3D configurado; FLUX no genera la malla.

## Verificación

Pruebas de servicio y privacidad:

```powershell
npm run build --workspace backend
node --test backend/dist/tests/cakeReconstruction.test.js backend/dist/tests/cakePreviewShares.test.js
```

Las pruebas usan respuestas de proveedores simuladas: cubren idempotencia, progreso, persistencia tras reiniciar, Hunyuan, GLB, errores, límite global, caducidad y consentimiento para compartir. Comprobar una conversión con una fotografía real requiere activar el motor. El visor y su interacción pueden comprobarse con un GLB de prueba sin consumir créditos.

La revisión del configurador en Chrome pasó a 1440, 390 y 320 píxeles usando tareas simuladas y un GLB de prueba con geometría volumétrica: carga del modelo completo, captura del render, cambio de tono, modo de impresión separado, una sola conversión por foto, recarga sin otra tarea, reemplazo de foto, recuperación explícita de un token vencido, QR y estado de motor desactivado. No hubo errores de JavaScript ni escrituras a pedidos o catálogo. También pasaron las 16 pruebas de backend y las compilaciones de frontend y backend.
