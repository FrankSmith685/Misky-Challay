import type { EditableBusinessInfo } from './settings.service';

// Texto que ya publicaba la web, conservado como primera versión editable.
const initialContent = `1. Identificación del proveedor y alcance
El sitio y los servicios de Misky Challay son operados por {{legalName}}, RUC {{ruc}}, con domicilio en {{address}}. Puedes contactarnos en {{email}} o al {{phone}}. Estas condiciones regulan el uso de la web, la cuenta, los pedidos, los planes y la billetera de saldo.

2. Cuenta y aceptación
Debes proporcionar información verdadera y mantener la confidencialidad de tu acceso. Al crear una cuenta aceptas estos términos y la Política de Privacidad.

Para comprar un plan solicitamos además una confirmación expresa de sus reglas de saldo y conservamos la fecha y versión aceptada. No compartas tu cuenta ni intentes usar saldos, cupones o promociones de forma fraudulenta.

3. Productos, disponibilidad y precios
Los precios están expresados en soles e incluyen IGV. El costo de entrega, descuentos y total final se muestran antes de confirmar. Las fotografías son referenciales y la disponibilidad depende del stock y de la sucursal seleccionada.

Si detectamos un error manifiesto de precio o disponibilidad antes de preparar el pedido, te informaremos y podrás aceptar la corrección o recibir la devolución correspondiente.

4. Pedidos, pagos y comprobantes
Antes de comprar verás el detalle del pedido. En pagos online, el pedido queda confirmado cuando el proveedor de pago comunica la aprobación. Cuando esté habilitado el pago contra entrega, se confirmará sujeto al límite informado en el checkout.

Emitiremos boleta o factura con los datos ingresados por el cliente. Misky Challay no almacena números completos de tarjeta ni códigos de seguridad; esos datos se procesan en la pasarela.

5. Entrega y recojo
La entrega está sujeta a cobertura, capacidad y horarios disponibles. Los tiempos son estimados y pueden variar por tránsito, clima o demanda. Debes indicar una dirección y punto de recepción correctos y estar disponible. Si eliges recojo, no se solicitará dirección de entrega y deberás acudir al local confirmado en el horario indicado.

6. Cancelaciones y devoluciones
Puedes solicitar la cancelación mientras el pedido no haya iniciado su preparación. Después evaluaremos el caso considerando la naturaleza perecible y personalizada del producto. Escríbenos a {{supportEmail}}.

Cuando corresponda devolver saldo de billetera, restituimos los lotes usados si todavía son válidos. Si vencieron mientras el pedido estuvo en curso, el importe devuelto se emite con una nueva vigencia de 180 días. Los pagos externos se devuelven al medio original, sujetos a los tiempos de la entidad procesadora.

7. Saldo comprado anteriormente
Las recargas de saldo compradas anteriormente fueron compras únicas con beneficios. No se renuevan ni generan cargos automáticos. Cada compra conserva sus propios lotes y fechas.


- Dinero pagado: corresponde al precio efectivamente abonado y puede usarse durante 180 días calendario desde la confirmación del pago.
- Bono promocional: es la diferencia gratuita entre el crédito anunciado y el precio pagado; vence al terminar la vigencia indicada para el plan.
- Beneficios: descuentos, delivery gratuito u otras ventajas solo se aplican durante la vigencia del plan. Si hay varios planes, se aplica el mejor beneficio de cada tipo y no se suman porcentajes equivalentes.

Al pagar pedidos, el sistema consume primero el lote con vencimiento más cercano. Cuando un lote vence, solo se anula su remanente; nunca el saldo de otra compra. Las fechas e importes están disponibles en “Mi saldo”. El saldo no es transferible ni canjeable por efectivo, salvo obligación legal o devolución expresamente aprobada.

8. Suscripciones mensuales de cajas
Al contratar una caja mensual autorizas un cobro recurrente por el precio mostrado. Cada mensualidad efectivamente pagada habilita una caja con el contenido y la sucursal acordados al contratar. Los cambios posteriores del catálogo afectan a nuevas contrataciones.

Puedes cancelar los cobros futuros desde Mis suscripciones. Una cancelación no borra las cajas ya pagadas: debes programar su recojo dentro del plazo indicado en tu cuenta y con los días de anticipación del plan. El recojo depende de la disponibilidad de horarios de la sucursal.

Antes de eliminar tu cuenta debes cancelar las renovaciones activas y resolver las cajas pagadas pendientes. Los reembolsos se gestionan según las condiciones de compra y la normativa aplicable.

9. Promociones y cupones
Cada promoción puede tener fechas, productos, zonas, monto mínimo, límite de usos y reglas de acumulación propias. Las condiciones particulares mostradas en la promoción complementan este documento. Podemos invalidar usos duplicados, automatizados o fraudulentos sin afectar los derechos de una compra legítima.

10. Disponibilidad del servicio y propiedad intelectual
Podemos realizar mantenimientos o corregir fallas de la plataforma. Las marcas, diseños, textos, fotografías y software pertenecen a sus respectivos titulares y no pueden copiarse o explotarse sin autorización. Nada en estas condiciones excluye responsabilidades ni derechos que la ley peruana reconozca al consumidor.

11. Atención y Libro de Reclamaciones
Para soporte contáctanos en {{supportEmail}}. También ponemos a tu disposición el Libro de Reclamaciones virtual. Presentar un reclamo no limita otros mecanismos ni es requisito para acudir a INDECOPI.

12. Cambios y ley aplicable
Podemos actualizar estas condiciones hacia el futuro. Los cambios materiales se informarán por la web o los datos de contacto y no reducirán retroactivamente saldos ya adquiridos. Se aplican las leyes del Perú y las autoridades competentes, sin restringir el derecho del consumidor a acudir a la autoridad o jurisdicción que corresponda.`;

export const defaultCheckoutTerms = (business: EditableBusinessInfo) => ({
  version: 1,
  title: 'Términos y Condiciones',
  acceptanceLabel: 'He leído y acepto los términos y condiciones de mi compra.',
  content: initialContent.replace(/\{\{(\w+)\}\}/g, (_match, key: keyof EditableBusinessInfo) => String(business[key] ?? '')),
});
