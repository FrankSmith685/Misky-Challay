import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@mui/material';
import { ROUTES } from '@constants/routes';
import { useBusinessInfo } from '@services/businessInfo';
import { LegalDocument, type LegalSection } from '../components/LegalDocument';

/**
 * Términos y Condiciones. Plantilla adaptada al Código de Protección y Defensa del
 * Consumidor; los datos del proveedor se toman de la configuración del negocio.
 */
const TermsPage = () => {
  const b = useBusinessInfo();

  const sections: LegalSection[] = [
    {
      title: 'Quiénes somos',
      body: (
        <p>
          Este sitio es operado por <strong>{b.legalName}</strong> (RUC {b.ruc}), con domicilio en{' '}
          {b.address}. Puedes contactarnos en <Link href={`mailto:${b.email}`}>{b.email}</Link> o al{' '}
          {b.phone}. Al usar el sitio y realizar pedidos, aceptas estos términos.
        </p>
      ),
    },
    {
      title: 'Nuestros productos y precios',
      body: (
        <>
          <p>
            Los precios se muestran en soles (S/) e <strong>incluyen el IGV</strong>. El costo de
            entrega, cuando aplica, se calcula según tu zona y se muestra antes de que confirmes el
            pago.
          </p>
          <p>
            Las fotos son referenciales. La disponibilidad de cada producto depende de la sucursal y
            del stock del momento; si algo no está disponible te lo indicaremos antes de cobrarte.
          </p>
        </>
      ),
    },
    {
      title: 'Pedidos y pagos',
      body: (
        <p>
          Un pedido se confirma únicamente cuando el pago es aprobado. Recibirás un correo con el
          detalle. Nos reservamos el derecho de rechazar o anular un pedido ante un error evidente
          de precio, sospecha de fraude o falta de stock, devolviéndote lo pagado.
        </p>
      ),
    },
    {
      title: 'Entrega',
      body: (
        <p>
          Entregamos dentro de nuestras zonas de cobertura, en el horario disponible que elijas. Los
          tiempos son estimados y pueden variar por demanda o clima. Es tu responsabilidad
          brindarnos una dirección correcta y estar disponible para recibir el pedido.
        </p>
      ),
    },
    {
      title: 'Cancelaciones y devoluciones',
      body: (
        <p>
          Puedes cancelar mientras tu pedido no haya entrado a preparación. Si ya está en cocina,
          escríbenos a <Link href={`mailto:${b.supportEmail}`}>{b.supportEmail}</Link>. Cuando
          corresponda una devolución, el saldo y los cupones se reintegran de inmediato a tu cuenta;
          los pagos con tarjeta se devuelven al mismo medio de pago.
        </p>
      ),
    },
    {
      title: 'Planes y saldo',
      body: (
        <p>
          Al comprar un plan recibes un saldo con las condiciones y la vigencia que se indican en su
          descripción. <strong>El saldo no utilizado antes del vencimiento se pierde</strong>, según
          las condiciones informadas al momento de la compra. Los beneficios del plan se aplican
          automáticamente a tus pedidos mientras esté vigente.
        </p>
      ),
    },
    {
      title: 'Tus responsabilidades',
      body: (
        <p>
          Eres responsable de la veracidad de los datos que ingresas y del uso de tu cuenta.
          Comunícanos cualquier uso no autorizado. Si tienes alergias, revisa siempre la información
          de alérgenos: la personalización de un bowl es tu decisión.
        </p>
      ),
    },
    {
      title: 'Libro de Reclamaciones',
      body: (
        <p>
          Ponemos a tu disposición un{' '}
          <Link component={RouterLink} to={ROUTES.complaints}>
            Libro de Reclamaciones virtual
          </Link>
          . Dejar un reclamo no te impide acudir a otras vías ni es requisito para denunciar ante
          INDECOPI.
        </p>
      ),
    },
    {
      title: 'Datos personales',
      body: (
        <p>
          El tratamiento de tus datos se rige por nuestra{' '}
          <Link component={RouterLink} to={ROUTES.privacy}>
            Política de Privacidad
          </Link>
          , conforme a la Ley 29733.
        </p>
      ),
    },
    {
      title: 'Ley aplicable',
      body: (
        <p>
          Estos términos se rigen por las leyes del Perú. Cualquier controversia se somete a la
          jurisdicción de los jueces y tribunales de Lima, sin perjuicio de los derechos que la ley
          reconoce al consumidor.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Términos y Condiciones"
      updatedAt={new Date().toLocaleDateString('es-PE')}
      intro="Estas son las reglas de uso del sitio y de nuestro servicio. Al comprar, las aceptas."
      sections={sections}
    />
  );
};

export default TermsPage;
