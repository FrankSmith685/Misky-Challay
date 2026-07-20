import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@mui/material';
import { ROUTES } from '@constants/routes';
import { useBusinessInfo } from '@services/businessInfo';
import { LegalDocument, type LegalSection } from '../components/LegalDocument';

/**
 * Política de Privacidad — Ley 29733 de Protección de Datos Personales y su
 * reglamento. Plantilla para revisar con un abogado; los datos del titular del banco
 * de datos se toman de la configuración del negocio.
 */
const PrivacyPage = () => {
  const b = useBusinessInfo();

  const sections: LegalSection[] = [
    {
      title: 'Quién trata tus datos',
      body: (
        <p>
          El responsable del tratamiento es <strong>{b.legalName}</strong> (RUC {b.ruc}), con
          domicilio en {b.address}. Para cualquier asunto sobre tus datos personales, escríbenos a{' '}
          <Link href={`mailto:${b.supportEmail}`}>{b.supportEmail}</Link>.
        </p>
      ),
    },
    {
      title: 'Qué datos recogemos',
      body: (
        <>
          <p>Recogemos únicamente lo necesario para atenderte:</p>
          <ul>
            <li>Identificación y contacto: nombre, correo, teléfono y dirección de entrega.</li>
            <li>Datos del pedido: qué compras, cuándo y a dónde lo enviamos.</li>
            <li>
              Preferencias alimentarias y alérgenos que tú decides indicarnos. Son datos sensibles
              y solo los usamos para ese fin: advertirte y personalizar tu experiencia.
            </li>
            <li>Datos técnicos de uso del sitio, para que funcione y sea más seguro.</li>
          </ul>
        </>
      ),
    },
    {
      title: 'Para qué los usamos (finalidad)',
      body: (
        <>
          <p>Tratamos tus datos para:</p>
          <ul>
            <li>Procesar y entregar tus pedidos, y darte soporte.</li>
            <li>Gestionar tu cuenta, tus planes y tu saldo.</li>
            <li>Avisarte del estado de tus pedidos por correo.</li>
            <li>Cumplir obligaciones legales (facturación, atención de reclamos).</li>
          </ul>
          <p>
            No usamos tus datos para fines distintos de los aquí informados sin pedirte antes tu
            consentimiento.
          </p>
        </>
      ),
    },
    {
      title: 'Con quién los compartimos',
      body: (
        <p>
          Solo con proveedores que nos ayudan a prestarte el servicio (pasarela de pago, envío de
          correos, reparto), y siempre limitados a lo necesario. No vendemos tus datos. Podemos
          entregarlos a la autoridad cuando la ley lo exija.
        </p>
      ),
    },
    {
      title: 'Cuánto tiempo los guardamos',
      body: (
        <p>
          Conservamos tus datos mientras tengas cuenta y, después, el tiempo que exijan las
          obligaciones legales (por ejemplo, la información de facturación). Cumplido ese plazo, los
          eliminamos o anonimizamos.
        </p>
      ),
    },
    {
      title: 'Tus derechos (ARCO)',
      body: (
        <>
          <p>
            Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, cancelación y
            oposición, además de la revocación del consentimiento. Para hacerlo, escríbenos a{' '}
            <Link href={`mailto:${b.supportEmail}`}>{b.supportEmail}</Link> indicando tu solicitud y
            adjuntando copia de tu documento de identidad.
          </p>
          <p>
            Atenderemos tu solicitud en los plazos que fija la Ley 29733. Si no quedas conforme,
            puedes acudir a la Autoridad Nacional de Protección de Datos Personales.
          </p>
        </>
      ),
    },
    {
      title: 'Seguridad',
      body: (
        <p>
          Aplicamos medidas técnicas y organizativas razonables para proteger tus datos. Las
          contraseñas se guardan cifradas y el acceso a la información está restringido al personal
          que lo necesita.
        </p>
      ),
    },
    {
      title: 'Cambios en esta política',
      body: (
        <p>
          Si actualizamos esta política, publicaremos la nueva versión aquí. Los cambios relevantes
          te los comunicaremos por los medios de contacto que nos hayas dado. Consulta también
          nuestros <Link component={RouterLink} to={ROUTES.terms}>Términos y Condiciones</Link>.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Política de Privacidad"
      updatedAt={new Date().toLocaleDateString('es-PE')}
      intro="Tu privacidad importa. Aquí te explicamos, sin letra pequeña, qué datos tuyos tratamos, para qué y cómo puedes controlarlos."
      sections={sections}
    />
  );
};

export default PrivacyPage;
