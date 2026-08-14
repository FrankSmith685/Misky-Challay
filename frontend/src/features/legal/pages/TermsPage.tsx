import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@mui/material';
import { ROUTES } from '@constants/routes';
import { useBusinessInfo } from '@services/businessInfo';
import { LegalDocument, type LegalSection } from '../components/LegalDocument';

const LEGAL_VERSION_DATE = '2 de agosto de 2026';

/** Condiciones comerciales coherentes con pedidos, planes, saldo y reclamos reales. */
const TermsPage = () => {
  const b = useBusinessInfo();

  const sections: LegalSection[] = [
    {
      title: 'Identificación del proveedor y alcance',
      body: (
        <p>
          El sitio y los servicios de Verde Bowl son operados por <strong>{b.legalName}</strong>,
          RUC {b.ruc}, con domicilio en {b.address}. Puedes contactarnos en{' '}
          <Link href={`mailto:${b.email}`}>{b.email}</Link> o al {b.phone}. Estas condiciones regulan
          el uso de la web, la cuenta, los pedidos, los planes y la billetera de saldo.
        </p>
      ),
    },
    {
      title: 'Cuenta y aceptación',
      body: (
        <>
          <p>
            Debes proporcionar información verdadera y mantener la confidencialidad de tu acceso.
            Al crear una cuenta aceptas estos términos y la{' '}
            <Link component={RouterLink} to={ROUTES.privacy}>Política de Privacidad</Link>.
          </p>
          <p>
            Para comprar un plan solicitamos además una confirmación expresa de sus reglas de saldo
            y conservamos la fecha y versión aceptada. No compartas tu cuenta ni intentes usar saldos,
            cupones o promociones de forma fraudulenta.
          </p>
        </>
      ),
    },
    {
      title: 'Productos, disponibilidad y precios',
      body: (
        <>
          <p>
            Los precios están expresados en soles e incluyen IGV. El costo de entrega, descuentos y
            total final se muestran antes de confirmar. Las fotografías son referenciales y la
            disponibilidad depende del stock y de la sucursal seleccionada.
          </p>
          <p>
            Si detectamos un error manifiesto de precio o disponibilidad antes de preparar el pedido,
            te informaremos y podrás aceptar la corrección o recibir la devolución correspondiente.
          </p>
        </>
      ),
    },
    {
      title: 'Pedidos, pagos y comprobantes',
      body: (
        <>
          <p>
            Antes de comprar verás el detalle del pedido. En pagos online, el pedido queda confirmado
            cuando el proveedor de pago comunica la aprobación. Cuando esté habilitado el pago contra
            entrega, se confirmará sujeto al límite informado en el checkout.
          </p>
          <p>
            Emitiremos boleta o factura con los datos ingresados por el cliente. Verde Bowl no almacena
            números completos de tarjeta ni códigos de seguridad; esos datos se procesan en la pasarela.
          </p>
        </>
      ),
    },
    {
      title: 'Entrega y recojo',
      body: (
        <p>
          La entrega está sujeta a cobertura, capacidad y horarios disponibles. Los tiempos son
          estimados y pueden variar por tránsito, clima o demanda. Debes indicar una dirección y punto
          de recepción correctos y estar disponible. Si eliges recojo, no se solicitará dirección de
          entrega y deberás acudir al local confirmado en el horario indicado.
        </p>
      ),
    },
    {
      title: 'Cancelaciones y devoluciones',
      body: (
        <>
          <p>
            Puedes solicitar la cancelación mientras el pedido no haya iniciado su preparación. Después
            evaluaremos el caso considerando la naturaleza perecible y personalizada del producto.
            Escríbenos a <Link href={`mailto:${b.supportEmail}`}>{b.supportEmail}</Link>.
          </p>
          <p>
            Cuando corresponda devolver saldo de billetera, restituimos los lotes usados si todavía son
            válidos. Si vencieron mientras el pedido estuvo en curso, el importe devuelto se emite con
            una nueva vigencia de 180 días. Los pagos externos se devuelven al medio original, sujetos a
            los tiempos de la entidad procesadora.
          </p>
        </>
      ),
    },
    {
      title: 'Planes, dinero pagado y bonos',
      body: (
        <>
          <p>
            Un plan es una <strong>compra única de saldo con beneficios</strong>, no una suscripción.
            No existe renovación ni cargo automático. Cada nueva compra crea lotes independientes y no
            extiende ni reemplaza las fechas de compras anteriores.
          </p>
          <ul>
            <li>
              <strong>Dinero pagado:</strong> corresponde al precio efectivamente abonado y puede usarse
              durante 180 días calendario desde la confirmación del pago.
            </li>
            <li>
              <strong>Bono promocional:</strong> es la diferencia gratuita entre el crédito anunciado y
              el precio pagado; vence al terminar la vigencia indicada para el plan.
            </li>
            <li>
              <strong>Beneficios:</strong> descuentos, delivery gratuito u otras ventajas solo se aplican
              durante la vigencia del plan. Si hay varios planes, se aplica el mejor beneficio de cada
              tipo y no se suman porcentajes equivalentes.
            </li>
          </ul>
          <p>
            Al pagar pedidos, el sistema consume primero el lote con vencimiento más cercano. Cuando un
            lote vence, solo se anula su remanente; nunca el saldo de otra compra. Las fechas e importes
            están disponibles en “Mi saldo”. El saldo no es transferible ni canjeable por efectivo,
            salvo obligación legal o devolución expresamente aprobada.
          </p>
        </>
      ),
    },
    {
      title: 'Promociones y cupones',
      body: (
        <p>
          Cada promoción puede tener fechas, productos, zonas, monto mínimo, límite de usos y reglas de
          acumulación propias. Las condiciones particulares mostradas en la promoción complementan este
          documento. Podemos invalidar usos duplicados, automatizados o fraudulentos sin afectar los
          derechos de una compra legítima.
        </p>
      ),
    },
    {
      title: 'Información nutricional y alérgenos',
      body: (
        <p>
          La información nutricional es estimada y puede variar por porción o personalización. Si tienes
          alergias o una condición médica, revisa los ingredientes y consulta antes de comprar. En cocina
          puede existir contacto cruzado; ninguna etiqueta sustituye una indicación profesional.
        </p>
      ),
    },
    {
      title: 'Disponibilidad del servicio y propiedad intelectual',
      body: (
        <p>
          Podemos realizar mantenimientos o corregir fallas de la plataforma. Las marcas, diseños, textos,
          fotografías y software pertenecen a sus respectivos titulares y no pueden copiarse o explotarse
          sin autorización. Nada en estas condiciones excluye responsabilidades ni derechos que la ley
          peruana reconozca al consumidor.
        </p>
      ),
    },
    {
      title: 'Atención y Libro de Reclamaciones',
      body: (
        <p>
          Para soporte contáctanos en <Link href={`mailto:${b.supportEmail}`}>{b.supportEmail}</Link>.
          También ponemos a tu disposición el{' '}
          <Link component={RouterLink} to={ROUTES.complaints}>Libro de Reclamaciones virtual</Link>.
          Presentar un reclamo no limita otros mecanismos ni es requisito para acudir a INDECOPI.
        </p>
      ),
    },
    {
      title: 'Cambios y ley aplicable',
      body: (
        <p>
          Podemos actualizar estas condiciones hacia el futuro. Los cambios materiales se informarán por
          la web o los datos de contacto y no reducirán retroactivamente saldos ya adquiridos. Se aplican
          las leyes del Perú y las autoridades competentes, sin restringir el derecho del consumidor a
          acudir a la autoridad o jurisdicción que corresponda.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Términos y Condiciones"
      updatedAt={LEGAL_VERSION_DATE}
      intro="Reglas claras para comprar, recibir pedidos y usar planes. Revisa especialmente la sección de dinero pagado, bonos y vigencias."
      sections={sections}
    />
  );
};

export default TermsPage;
