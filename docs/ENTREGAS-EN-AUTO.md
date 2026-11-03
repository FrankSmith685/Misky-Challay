# Entrega en auto para tortas

## Regla y precio

Los nuevos pedidos de delivery que contienen al menos un producto de familia **CAKE** requieren auto, con independencia del tamaño, precio o tipo de diseño. En carritos mixtos se aplica al pedido completo. La decisión se obtiene del catálogo en el backend; el cliente no puede elegir moto ni desactivar esta condición. Recojo en taller sigue disponible.

Se utiliza **una sola tarifa de envío**, con la base por zona y el recargo de distancia que ya se administran en **Cobertura**. No se agregó un segundo cargo ni se inventaron nuevas tarifas. Cupones y beneficios de envío continúan aplicándose; un envío bonificado igualmente necesita cupo de auto.

## Activación desde el panel

1. En **Usuarios internos**, crea o asigna un repartidor al taller correspondiente.
2. Abre **Reparto → Entrega en auto para todas las tortas → Configurar**. Selecciona el taller.
3. En la flota, selecciona **Auto**, completa placa o descripción y guarda el vehículo.
4. El **cupo predeterminado por franja es 10 pedidos**, aprobado por el usuario. Puedes editarlo por taller desde **Cupos de auto predeterminados**. Las nuevas franjas, incluidas las generadas automáticamente, heredan ese valor hasta el máximo de su capacidad general. Para actualizar también los horarios ya cargados usa **Aplicar a franjas abiertas** y guarda. Cada fecha y franja sigue siendo editable de forma independiente; 0 cierra el servicio de auto para esa franja.
5. Revisa la tarifa y cobertura desde el enlace del mismo panel. Los horarios se generan en **Cobertura → taller → Generar franjas** y utilizan el predeterminado vigente; la generación conserva los cupos personalizados de los horarios existentes.

La migración `0058-cake-car-delivery` agregó el esquema y conservó los compromisos de pedidos anteriores. La actualización `0059-default-car-capacity` establece el predeterminado de **10 pedidos por franja** y habilita esa cantidad en las franjas futuras que estaban sin configurar, respetando su capacidad general. Los conductores existentes siguen **Sin clasificar**: registrar un conductor con auto continúa siendo necesario para ofrecer el servicio. El recojo y los pedidos sin tortas conservan sus cupos generales.

## Reservas y operación

- El calendario de entrega en auto muestra solo franjas con cupo y un auto activo registrado en ese taller. Los turnos futuros se planifican con los cupos definidos por el operador; el estado actual de turno del conductor no constituye una agenda futura.
- El checkout valida nuevamente la disponibilidad al elegir horario. Al crear el pedido bloquea la fila de la franja, comprueba el cupo de auto y registra el pedido pendiente dentro de la misma transacción, antes de abrir la pasarela o mostrar el cobro directo.
- Cada pedido ocupa **un cupo**, aun cuando contenga varias tortas. El operador debe ajustar cupos a su capacidad y atender por cotización los pedidos de volumen o montaje que excedan la operación habitual.
- Los pedidos pendientes de pago también ocupan cupo. Cancelaciones, reembolsos y vencimientos que cancelan el pedido dejan de ocuparlo. El envío de mensajes no condiciona esta reserva.
- El recojo cuenta únicamente contra el cupo general; puede ofrecerse cuando no queda cupo de auto.
- Reparto rechaza la asignación de moto, otro vehículo o conductor sin clasificar para un pedido con auto obligatorio. El proveedor externo también debe declarar auto. La condición se verifica de nuevo al retirar y trasladar el pedido.
- No se puede bajar el límite por debajo de los pedidos ya reservados. Desde la configuración de flota tampoco se permite cambiar el tipo del último auto mientras existen entregas comprometidas. Los vehículos se registran por conductor y taller.
- Las indicaciones de manipulación se guardan en el pedido. Los cambios posteriores del panel se aplican a pedidos nuevos.

## Evidencia y seguimiento

Desde la tarjeta de Reparto se puede adjuntar una **foto opcional de salida** y otra **de entrega**, además del nombre de quien recibe. Las imágenes se comprimen, se valida su contenido y se almacenan en `delivery_evidence`; no se publican en la biblioteca multimedia. Solo las consultan usuarios con permiso de reparto y alcance del taller, o el conductor al que pertenece la entrega. La ficha del pedido permite consultar las fotos guardadas incluso después de terminar el reparto.

El cliente ve **Entrega en auto** en el checkout, pago directo y detalle del pedido. El aviso de correo de salida a reparto identifica el auto cuando corresponde. Los canales de comunicación continúan usando la configuración y el consentimiento existentes.

## Cómo probar

1. Registra un conductor con auto y configura **1 cupo** en una franja futura del taller.
2. Agrega cualquier torta y entra al checkout con una dirección cubierta. Debes ver **Tu torta viaja en auto**, la tarifa única y los horarios con cupo.
3. Elige una franja y abre el pago con Yape/Plin o la pasarela. El pedido pendiente ya debe ocupar el cupo. No es necesario transferir dinero para probar la reserva.
4. En otra sesión intenta reservar esa misma franja: debe dejar de ofrecer cupo de auto. Cambia a **Recojo en taller**: deben mostrarse los cupos generales disponibles y envío sin costo.
5. Cancela el pedido pendiente: el cupo de auto debe volver a estar disponible.
6. Para un pedido confirmado, intenta asignar un conductor con moto desde Reparto: debe estar deshabilitado y el backend también lo rechaza. Asigna un auto y sigue el flujo normal de Cocina y Reparto.
7. Adjunta las fotos opcionales, registra la entrega y consulta después sus evidencias en la ficha del pedido.

Pruebas automatizadas relevantes: `backend/src/tests/carTransport.test.ts`, `backend/src/tests/pricing.minimum.test.ts`, `e2e/car-delivery-admin.spec.ts` y los casos de entrega en auto en `e2e/checkout-prices.spec.ts`.
