# Piloto de video horizontal con QR

Este piloto compara una experiencia de realidad aumentada con un video para una misma ocasión y una misma idea creativa.

## Flujo operativo

1. En **Administración → Experiencias QR**, crea o edita un servicio con modalidad **Video**.
2. Mantén el precio, la vigencia, las revisiones y la anticipación acordes con la operación real. El servicio solo aparece en checkout cuando está activo y tiene un precio mayor que cero.
3. En un pedido de prueba, selecciona el adicional de experiencia y describe la ocasión, el mensaje y el acabado.
4. Abre el proyecto desde **Experiencias QR**, elige **Video** como contenido de la escena y carga un MP4 o WebM horizontal. El límite actual es de 20 MB por video.
5. Guarda la versión, solicita la revisión del cliente y publica únicamente después de su aprobación y de verificar el pago requerido.
6. Descarga la tarjeta con QR desde la experiencia publicada y pruébala desde un segundo teléfono con HTTPS público.

## Brief recomendado

- Duración: 8 a 15 segundos.
- Formato: 16:9, 960×540 o 1280×720.
- Mensaje: una sola idea y una dedicatoria breve.
- Acción visual: la misma cruz, personaje o decoración que se use en la variante AR.
- Reproducción: el cliente toca **Reproducir**; no se depende de autoplay con sonido.

## Comparación

Usa dos variantes comparables:

- **AR:** la cruz o decoración aparece sobre la tarjeta mediante cámara.
- **Video:** la misma acción aparece en un video horizontal que se abre desde el QR.

Registra por variante los escaneos, las reproducciones, los hitos de 25/50/75/90 %, las reproducciones completas, los compartidos y la opinión breve del cliente. Los eventos de video se guardan solo con el consentimiento analítico existente.

## Infraestructura

El piloto usa el mismo VPS y crea un proyecto y un token público por pedido; no necesita una instancia de servidor por video. El almacenamiento actual sirve para una prueba controlada. Antes de aumentar el volumen, mueve los archivos de video a almacenamiento de objetos con CDN y URLs temporales para evitar que la base de datos y el backend entreguen todos los bytes de cada reproducción.

Los QR deben generarse con `VITE_PUBLIC_WEB_URL` o `FRONTEND_URL` apuntando a un dominio HTTPS público. Un QR que contiene `localhost` o `127.0.0.1` no funcionará desde otro teléfono.

## Artefacto web de Renzo

El ZIP entregado por Jonathan es una experiencia web interactiva, no un archivo de video final. Ya está integrada como una ruta pública de prueba:

- Experiencia: `http://localhost:5173/experiencias/renzo`
- Generador y visor del QR: `http://localhost:5173/experiencias/renzo-qr`

Para probarla en local, inicia el frontend con `npm run dev -- --host 0.0.0.0` y abre esas rutas en el navegador. El botón **Descargar Video Animado (WebM)** permite obtener una exportación limpia desde la experiencia; la grabación MP4 recibida muestra la pantalla del navegador y no debe usarse como video final del cliente.

Para escanear desde otro dispositivo, configura `VITE_PUBLIC_WEB_URL` con una URL HTTPS pública o usa un túnel temporal. Un QR generado con `localhost` solo sirve en el mismo equipo.
