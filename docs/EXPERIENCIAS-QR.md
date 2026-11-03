# Estudio privado de experiencias QR

## Probar la demostración ahora

1. Abre `http://localhost:5173/experiencias/demo` o entra en **Para empresas → Ver demostración QR**.
2. Gira el alien en la vista 3D y reproduce el video original de saludo. La demostración es pública y no crea pedidos ni cobros.
3. Pulsa **Descargar tarjeta con QR** e imprime la imagen completa, sin recortarla, preferiblemente en papel mate. También puedes mostrarla en otra pantalla.
4. Escanea el QR desde un teléfono, activa la cámara y enfoca **la fotografía de la tarjeta**, incluyendo sus bordes. El QR abre la página; la fotografía es el marcador de reconocimiento.
5. Para usar el teléfono, la tienda y `/experience-camera.html` deben estar servidas por una URL HTTPS pública que llegue al frontend y a su API. `localhost` en el teléfono apunta al propio teléfono. La configuración pública de URL del proyecto también se utiliza al generar el QR.
6. Deniega el permiso de cámara para comprobar que el sitio informa el motivo y permite regresar al video y al visor 3D.

No se necesita un token de Meta, Mercado Pago ni un modelo externo para esta demostración. El ejemplo contiene un alien original creado con geometría, una dedicatoria y un video WebM de seis segundos, sin audio. No pretende reproducir exactamente una torta física.

## Administración

### Presentación y navegación

- La demostración combina escena 3D, video y dedicatoria en una composición adaptable. El QR de acceso también se muestra en pantalla, junto a la descarga de la tarjeta.
- El estudio muestra un resumen de trabajos recientes y permite filtrar por estado o buscar por pedido/servicio.
- Los servicios y las plantillas utilizan una lista de selección y un editor con secciones. Los ajustes de posición, escala y animación se encuentran en **Ajustes de la escena 3D**.
- **Ver versión guardada** abre una vista previa privada en un diálogo y conserva los cambios pendientes del formulario. Es necesario guardar esos cambios antes de solicitar revisión o publicar.
- El detalle del cliente muestra las etapas de creación, revisión, aprobación y publicación, con sus acciones de revisión agrupadas.

Ruta: `/admin/experiencias-qr`.

| Pestaña             | Uso                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trabajos por pedido | Abrir la solicitud, asignar un responsable con acceso de creación a la sede, editar la escena, revisar comentarios e historial.                                              |
| Servicios y precios | Configurar precio con IGV, alcance, tipo, anticipación, vigencia, revisiones incluidas, plantilla y condición de pago; activar o dejar en borrador. Requiere alcance global. |
| Plantillas          | Crear escenas reutilizables y generar o cargar archivos para futuros pedidos. Requiere alcance global.                                                                       |
| Demostración        | Abrir el ejemplo público y descargar su tarjeta.                                                                                                                             |

Se crean dos servicios **inactivos y con precio cero**: Video personalizado y Experiencia AR con 3D y video. No aparecen en el checkout hasta configurar un precio mayor a cero y activarlos. No se asignaron tarifas comerciales de prueba al negocio.

Permisos delegables desde la gestión de roles:

- `experience.read`: consultar el estudio y los trabajos de sus sedes.
- `experience.write`: crear/editar propuestas, subir sus archivos y solicitar revisión.
- `experience.publish`: publicar, pausar y renovar una versión aprobada.

El superadministrador tiene acceso global. Las nuevas migraciones registran los permisos; no conceden accesos nuevos automáticamente a empleados.

## Flujo comercial completo

1. **Superadmin → Servicios y precios:** abre un servicio, configura sus condiciones y un precio real, y activa **Ofrecer en el checkout**.
2. **Cliente:** añade una torta al carrito. En el checkout selecciona el adicional QR y escribe una idea de al menos diez caracteres. Selecciona una entrega que respete la anticipación del servicio. El resumen muestra por separado productos, experiencia digital y envío.
3. **Pago:** utiliza Mercado Pago, Yape o Plin según la configuración existente. En transferencias directas, caja debe comprobar el ingreso y aprobarlo. Reportar un pago no lo confirma.
4. **Equipo → Trabajos por pedido:** abre el pedido. Elige la plantilla o prepara su escena, título, dedicatoria, color, posición, escala y animación. Puedes subir un GLB, video o audio. Los archivos del trabajo son privados y no se reutilizan desde otro pedido.
5. Para crear un saludo dentro del panel, pulsa **Crear video personalizado**. Genera ocho segundos de animación del alien con el título, dedicatoria y color actuales, sin cámara, micrófono ni audio. Mantén la pestaña abierta durante la generación. También puedes subir un video editado externamente.
6. Si deseas una tarjeta propia, usa **Subir y compilar tarjeta**. La imagen y su archivo de reconocimiento quedan vinculados. Si no cargas una imagen, se usa la fotografía de demostración ya compilada.
7. Pulsa **Guardar versión** y **Ver versión guardada**. Guardar cambios invalida una aprobación anterior y retira la publicación anterior mientras se prepara la nueva versión.
8. Con el pago requerido verificado y los archivos completos, pulsa **Solicitar revisión del cliente**. Ambos servicios requieren video; el servicio AR también requiere una escena 3D. El plazo para revisar la propuesta es de siete días.
9. **Cliente → Mis pedidos → Detalle:** revisa el video y la escena, aprueba esa versión o solicita cambios con un comentario. Los cambios consumen las revisiones incluidas. Al agotarlas se indica contactar con la tienda; no se generan cargos extra automáticamente.
10. **Equipo con permiso de publicación:** publica la versión aprobada, inmediatamente o desde una fecha programada. La duración se toma de las condiciones guardadas al comprar.
11. **Cliente:** descarga la tarjeta con QR desde su pedido cuando la publicación está disponible y comparte el enlace. Los invitados acceden sin iniciar sesión. El enlace público no contiene datos del pedido, cliente, dirección ni operaciones de pago.
12. Prueba **Pausar**: el enlace público deja de abrir la experiencia. Reactivar o renovar conserva el mismo QR. Una versión con cambios requiere otra aprobación. Un pedido cancelado/reembolsado o una vigencia agotada bloquean el acceso público.

La experiencia tiene su propio estado, independiente de la preparación y entrega del pastel. El detalle del cliente se actualiza cada quince segundos, incluso después de terminar el pedido de alimentos.

## Cobro y comprobantes

- Se agrega una línea digital `itemKind=EXPERIENCE` al pedido. Nombre, precio y condiciones se congelan; los cambios posteriores del servicio no modifican compras existentes.
- El adicional participa en el total y desglose de IGV. Las promociones destinadas a productos y el mínimo de compra siguen calculándose con los alimentos.
- La línea digital no se envía a los tableros de cocina ni consume sus reservas de ingredientes o capacidad.
- La selección se vuelve a validar al confirmar. Un cambio de versión/precio del servicio obliga a actualizar el resumen.
- La publicación puede exigir pago total o anticipo verificado, según el servicio comprado. En planes con anticipo, elegir pago total impide publicar hasta verificar también el saldo.
- El servicio no genera devoluciones ni cobros adicionales automáticamente; se utilizan los procedimientos existentes de caja.

## Correo y WhatsApp

Se encolan avisos cuando la propuesta queda lista para revisión y cuando se publica. Se reutilizan Comunicaciones y sus ajustes, reintentos e historial.

- Deben estar activos los avisos de pedido y el canal correspondiente.
- En modo de prueba los avisos son simulados.
- Correo requiere SMTP operativo. WhatsApp requiere consentimiento del cliente, conexión con Meta y las plantillas aprobadas para **Experiencia QR lista para revisión** y **Experiencia QR publicada**; parámetros: número de pedido y enlace autenticado al detalle.
- La cola omite avisos antiguos si cambian la propuesta, el estado, el pago, la cuenta destinataria o la vigencia.
- Los enlaces de revisión conducen al pedido autenticado; el borrador y sus archivos no son públicos.

## Archivos y límites

| Archivo                  | Formatos                                  | Límite |
| ------------------------ | ----------------------------------------- | ------ |
| Video                    | MP4 / WebM                                | 20 MB  |
| Modelo                   | GLB 2.0 con datos y texturas incorporados | 10 MB  |
| Audio                    | MP3 / M4A                                 | 8 MB   |
| Imagen de reconocimiento | JPEG / PNG, 300–3000 px por lado          | 3 MB   |
| Reconocimiento compilado | `.mind`, generado por el panel            | 5 MB   |

Los archivos se almacenan en la base de datos y deben incluirse en sus respaldos. La API comprueba tamaño, tipo y firmas; rechaza modelos que cargan recursos externos. Los archivos privados requieren sesión y alcance de sede. Los públicos solo se sirven cuando pertenecen a la escena publicada y la experiencia sigue disponible. Los videos soportan solicitudes por rangos.

La creación local de videos depende de MediaRecorder; si el navegador no lo admite, el equipo puede subir un MP4/WebM. Los videos no se reproducen con sonido automáticamente. Prueba reproducción en los navegadores móviles que utilizarán los clientes; para mayor compatibilidad de una entrega comercial puede subirse un MP4 H.264/AAC.

## Instalación en otro entorno

Las migraciones `0054-qr-experiences` y `0055-experience-asset-ownership` agregan las tablas, línea digital, permisos, borradores y vinculación de archivos. Ya se aplicaron en la base local durante esta implementación.

En otro entorno, realiza el respaldo habitual y ejecuta desde la raíz:

```sh
npm run db:migrate --workspace=@verde-bowl/backend
```

Después utiliza el arranque/build habitual del proyecto. El build de Vite incluye `experience-camera.html`. Los enlaces compartidos deben conservar el dominio público de la tienda; cambiarlo requiere mantener una redirección del dominio anterior para tarjetas ya impresas.

## Motor y comprobaciones

Esta implementación reutiliza MindAR para reconocer imágenes y Three.js para la escena, con un visor 3D y video cuando no se utiliza cámara. Se comprobó en navegador automatizado: vista móvil/escritorio, descarga PNG del QR, reproducción del video, denegación de cámara, configuración, permisos y creación de video. Las reglas del servidor cubren precio, propiedad, sedes, pago, aprobación, vigencia y archivos.

No se ha realizado una prueba física de reconocimiento con cámaras Android/iPhone. Antes de entregar un trabajo comercial, imprime su tarjeta y prueba esos dispositivos con la URL HTTPS definitiva.

8th Wall queda como alternativa técnica, sin introducir un segundo motor en la entrega. Su framework MIT incluye reconocimiento de imágenes, pero el SLAM se distribuye en un binario con otra licencia: [documentación oficial](https://8thwall.org/docs/open-source), [repositorio del framework](https://github.com/8thwall/8thwall). No se afirma una comparación de rendimiento en dispositivos reales.
