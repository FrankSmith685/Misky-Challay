import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@mui/material';
import { ROUTES } from '@constants/routes';
import { useBusinessInfo } from '@services/businessInfo';
import { LegalDocument, type LegalSection } from '../components/LegalDocument';

const LEGAL_VERSION_DATE = '2 de agosto de 2026';

/** Política adaptada a la Ley 29733 y al Reglamento aprobado por D.S. 016-2024-JUS. */
const PrivacyPage = () => {
  const b = useBusinessInfo();

  const sections: LegalSection[] = [
    {
      title: 'Responsable del tratamiento',
      body: (
        <p>
          <strong>{b.legalName}</strong>, RUC {b.ruc}, con domicilio en {b.address}, es responsable
          de los bancos de datos usados por Misky Challay. Para consultas o solicitudes relacionadas con
          privacidad, escribe a <Link href={`mailto:${b.supportEmail}`}>{b.supportEmail}</Link>.
        </p>
      ),
    },
    {
      title: 'Datos que recopilamos',
      body: (
        <ul>
          <li>Identificación y contacto: nombre, correo, teléfono y credenciales protegidas.</li>
          <li>Direcciones, referencias y ubicación precisa, solo cuando autorizas el acceso del navegador.</li>
          <li>Pedidos, personalizaciones, comprobantes, pagos, planes, saldo y movimientos.</li>
          <li>Preferencias alimentarias o alérgenos que decides registrar.</li>
          <li>Reclamos, comunicaciones y atención posventa.</li>
          <li>Datos técnicos: IP, navegador, eventos de seguridad e identificadores propios de sesión.</li>
          <li>
            Cámara del dispositivo, solo cuando escaneas el QR de una mesa: la imagen se procesa en
            el momento para leer el código y no se almacena ni se envía a nuestros servidores.
          </li>
          <li>
            Ubicación precisa del dispositivo, solo si aceptas el permiso del sistema, para centrar
            el mapa, resolver tu dirección y validar cobertura.
          </li>
          <li>
            Identificador de dispositivo y token de notificaciones push (Expo), para avisarte del
            estado de tus pedidos en el móvil.
          </li>
        </ul>
      ),
    },
    {
      title: 'Permisos de la aplicación móvil',
      body: (
        <p>
          La aplicación pide cámara, ubicación y notificaciones. Los tres permisos son opcionales y
          se piden en el momento en que hacen falta, no al abrir la app: sin cámara puedes escribir
          el código de la mesa, sin ubicación puedes ingresar la dirección a mano y sin
          notificaciones puedes seguir tu pedido desde la pantalla de seguimiento. Puedes revocarlos
          cuando quieras desde los ajustes del sistema. El token de notificaciones se asocia a tu
          cuenta para poder enviarte avisos de pedido; se desactiva al cerrar sesión, al desinstalar
          la app y al eliminar tu cuenta.
        </p>
      ),
    },
    {
      title: 'Eliminar tu cuenta',
      body: (
        <p>
          Puedes pedir la baja desde la aplicación o desde{' '}
          <Link component={RouterLink} to={ROUTES.deleteAccount}>
            eliminar mi cuenta
          </Link>
          , sin necesidad de instalar nada. Anonimizamos de inmediato tu correo, teléfono, nombres y
          direcciones; los pedidos y sus comprobantes se conservan sin datos que te identifiquen
          porque el Código Tributario obliga a guardarlos.
        </p>
      ),
    },
    {
      title: 'Cómo obtenemos los datos',
      body: (
        <p>
          Los recibimos directamente de ti al crear la cuenta, comprar, guardar una dirección, activar
          la ubicación o comunicarte con nosotros; también de la pasarela cuando confirma un pago y de
          nuestros sistemas cuando registran operaciones necesarias para seguridad y funcionamiento.
          No obtenemos tu ubicación si rechazas el permiso del navegador.
        </p>
      ),
    },
    {
      title: 'Finalidades y fundamento',
      body: (
        <>
          <ul>
            <li>Crear y proteger tu cuenta.</li>
            <li>Cotizar, cobrar, preparar, entregar y dar soporte a tus pedidos.</li>
            <li>Gestionar comprobantes, planes, lotes de saldo, beneficios y devoluciones.</li>
            <li>Prevenir fraude, errores, accesos no autorizados y abuso de promociones.</li>
            <li>Cumplir obligaciones tributarias, contables y de protección al consumidor.</li>
            <li>Medir de forma propia y limitada el funcionamiento y mejorar la experiencia.</li>
          </ul>
          <p>
            Estos tratamientos son necesarios para ejecutar la relación solicitada, cumplir obligaciones
            legales o proteger la plataforma. Las comunicaciones comerciales y cualquier uso opcional se
            realizarán únicamente con consentimiento cuando corresponda, que podrás revocar.
          </p>
        </>
      ),
    },
    {
      title: 'Ubicación y preferencias alimentarias',
      body: (
        <p>
          La ubicación se usa para centrar el mapa, resolver la dirección, validar cobertura y calcular
          entrega. Puedes ingresar una dirección manualmente. Las preferencias y alérgenos son opcionales;
          se utilizan para mostrar advertencias o personalizar tu experiencia, no para tomar decisiones
          médicas ni para publicidad basada en salud.
        </p>
      ),
    },
    {
      title: 'Proveedores y transferencias',
      body: (
        <p>
          Podemos encargar operaciones limitadas a proveedores de alojamiento, base de datos, correo,
          pagos, mapas/geocodificación y reparto. Solo reciben la información necesaria y deben protegerla.
          Algunos pueden procesar datos fuera del Perú; en ese caso aplicamos las garantías y comunicaciones
          exigibles. No vendemos datos personales. También podremos entregarlos a una autoridad cuando una
          norma o requerimiento válido lo obligue.
        </p>
      ),
    },
    {
      title: 'Pagos',
      body: (
        <p>
          Los datos completos de tarjeta son ingresados directamente en la plataforma del proveedor de
          pagos. Misky Challay conserva referencias, estado, importe y respuesta depurada de la operación,
          pero no el número completo de tarjeta ni el código de seguridad.
        </p>
      ),
    },
    {
      title: 'Conservación',
      body: (
        <p>
          Conservamos los datos mientras tu cuenta o relación comercial esté activa y después durante los
          plazos necesarios para obligaciones tributarias, contables, contractuales, reclamos, prevención
          de fraude y defensa de derechos. Al finalizar esos plazos eliminamos o anonimizamos la información,
          salvo que exista una obligación o controversia que justifique conservarla.
        </p>
      ),
    },
    {
      title: 'Derechos ARCO y revocación',
      body: (
        <>
          <p>
            Puedes solicitar información, acceso, rectificación, cancelación u oposición, así como revocar
            un consentimiento. Envía tu solicitud concreta a{' '}
            <Link href={`mailto:${b.supportEmail}`}>{b.supportEmail}</Link>, identifica el derecho y adjunta
            un medio razonable para acreditar identidad. No pediremos más información de la necesaria.
          </p>
          <p>
            Conforme al reglamento vigente, los plazos máximos son 8 días calendario para información,
            20 para acceso y 10 para rectificación, cancelación u oposición; pueden ampliarse una sola vez
            cuando esté permitido y se comunique dentro del plazo inicial. Si no atendemos tu solicitud,
            puedes acudir a la Autoridad Nacional de Protección de Datos Personales.
          </p>
        </>
      ),
    },
    {
      title: 'Seguridad e incidentes',
      body: (
        <p>
          Aplicamos controles de acceso, contraseñas con hash, trazabilidad, cifrado en tránsito y medidas
          organizativas proporcionales al riesgo. Ningún sistema es infalible; si ocurre un incidente que
          deba comunicarse, actuaremos frente a los titulares y autoridades en los términos legales.
        </p>
      ),
    },
    {
      title: 'Almacenamiento local y medición',
      body: (
        <p>
          Utilizamos almacenamiento del navegador para sesión, carrito, preferencias, borradores y un
          identificador propio de medición. Actualmente no cargamos redes publicitarias ni vendemos perfiles.
          Revisa la <Link component={RouterLink} to={ROUTES.cookies}>Política de Cookies y almacenamiento</Link>.
        </p>
      ),
    },
    {
      title: 'Menores y cambios',
      body: (
        <p>
          El servicio de compra está dirigido a personas con capacidad para contratar. Si detectamos datos
          de un menor tratados sin autorización válida, evaluaremos su eliminación. Los cambios materiales
          de esta política se publicarán aquí y se comunicarán cuando corresponda. Consulta también los{' '}
          <Link component={RouterLink} to={ROUTES.terms}>Términos y Condiciones</Link>.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Política de Privacidad"
      updatedAt={LEGAL_VERSION_DATE}
      intro="Te explicamos qué información usa Misky Challay, por qué la necesita, con quién puede compartirla y cómo ejercer control sobre ella."
      sections={sections}
    />
  );
};

export default PrivacyPage;
