import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { EmptyState } from '../../src/components/EmptyState';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useResource } from '../../src/hooks/useResource';
import { businessApi } from '../../src/services/api/business.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { PublicSettings } from '../../src/types/domain';

/**
 * Documentos legales DENTRO de la aplicación.
 *
 * Antes se abría el navegador contra `${env.webUrl}/privacidad`, y esa URL se
 * infiere del host del API cuando no hay EXPO_PUBLIC_WEB_URL: con un API real el
 * enlace terminaba en el dominio del servidor, no en la web pública. Además
 * `/preguntas-frecuentes` ni siquiera está registrada en el router de la web.
 *
 * El texto vive aquí porque en la web solo existe como componente React
 * (frontend/src/features/legal/pages): no hay endpoint que lo sirva. Lo único que
 * viaja del backend son los datos de la empresa (/settings/public), que es
 * justamente lo que cambia entre entornos y lo que no debe quedar escrito a mano.
 */

type Business = PublicSettings['business'];

type LegalSlug = 'privacidad' | 'terminos' | 'cookies' | 'preguntas-frecuentes';

type LegalBlock =
  | { kind: 'text'; value: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'mail'; email: string; caption: string }
  | { kind: 'route'; label: string; caption: string; to: Href };

interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

interface LegalDoc {
  /** Título corto para la cabecera de navegación. */
  navTitle: string;
  title: string;
  intro: string;
  /** Las preguntas frecuentes se leen mejor plegadas; un documento legal, no. */
  collapsible: boolean;
  sections: LegalSection[];
}

/** Misma fecha de versión que la web, para que ambos textos sean el mismo documento. */
const VERSION_DATE = '2 de agosto de 2026';

const LEGAL_SLUGS: readonly LegalSlug[] = ['privacidad', 'terminos', 'cookies', 'preguntas-frecuentes'];

const isLegalSlug = (value: string): value is LegalSlug =>
  LEGAL_SLUGS.includes(value as LegalSlug);

const legalRoute = (slug: LegalSlug): Href => `/legal/${slug}` as Href;
const SUPPORT_ROUTE = '/support' as Href;
const PREFERENCES_ROUTE = '/preferences' as Href;

const nameOf = (business: Business | null): string => business?.legalName?.trim() || 'Verde Bowl';
const supportMail = (business: Business | null): string =>
  business?.supportEmail?.trim() || business?.email?.trim() || 'hola@verdebowl.pe';

/**
 * «Razón Social (RUC 20… · Av. …)», y solo el nombre si el backend todavía no
 * respondió. Se devuelve como sujeto de una frase, sin punto final, para que
 * cada sección lo encaje en su propia redacción.
 */
const identity = (business: Business | null): string => {
  const details = [
    business?.ruc?.trim() ? `RUC ${business.ruc.trim()}` : null,
    business?.address?.trim() ?? null,
  ].filter((part): part is string => Boolean(part));

  if (details.length === 0) return nameOf(business);
  return `${nameOf(business)} (${details.join(' · ')})`;
};

const buildPrivacy = (business: Business | null): LegalDoc => ({
  navTitle: 'Privacidad',
  title: 'Política de Privacidad',
  intro:
    'Te explicamos qué información usa Verde Bowl, por qué la necesita, con quién puede compartirla y cómo ejercer control sobre ella.',
  collapsible: false,
  sections: [
    {
      title: 'Responsable del tratamiento',
      blocks: [
        {
          kind: 'text',
          value: `${identity(business)} es responsable de los bancos de datos que usa Verde Bowl.`,
        },
        {
          kind: 'mail',
          email: supportMail(business),
          caption: 'Escríbenos para cualquier consulta o solicitud de privacidad',
        },
      ],
    },
    {
      title: 'Datos que recopilamos',
      blocks: [
        {
          kind: 'list',
          items: [
            'Identificación y contacto: nombre, correo, teléfono y credenciales protegidas.',
            'Direcciones, referencias y ubicación precisa, solo cuando autorizas el permiso del sistema.',
            'Pedidos, personalizaciones, comprobantes, pagos, planes, saldo y movimientos.',
            'Preferencias alimentarias o alérgenos que decides registrar.',
            'Reclamos, comunicaciones y atención posventa.',
            'Datos técnicos: modelo del dispositivo, versión de la app, eventos de seguridad e identificadores propios de sesión.',
            'Identificador de notificaciones push, si aceptas recibir avisos del estado de tus pedidos.',
          ],
        },
      ],
    },
    {
      title: 'Cómo obtenemos los datos',
      blocks: [
        {
          kind: 'text',
          value:
            'Los recibimos directamente de ti al crear la cuenta, comprar, guardar una dirección, activar la ubicación o comunicarte con nosotros; también de la pasarela cuando confirma un pago y de nuestros sistemas cuando registran operaciones necesarias para la seguridad y el funcionamiento. No obtenemos tu ubicación si rechazas el permiso del sistema.',
        },
      ],
    },
    {
      title: 'Finalidades y fundamento',
      blocks: [
        {
          kind: 'list',
          items: [
            'Crear y proteger tu cuenta.',
            'Cotizar, cobrar, preparar, entregar y dar soporte a tus pedidos.',
            'Gestionar comprobantes, planes, lotes de saldo, beneficios y devoluciones.',
            'Prevenir fraude, errores, accesos no autorizados y abuso de promociones.',
            'Cumplir obligaciones tributarias, contables y de protección al consumidor.',
            'Medir de forma propia y limitada el funcionamiento y mejorar la experiencia.',
          ],
        },
        {
          kind: 'text',
          value:
            'Estos tratamientos son necesarios para ejecutar la relación que solicitas, cumplir obligaciones legales o proteger la plataforma. Las comunicaciones comerciales y cualquier uso opcional se realizan únicamente con tu consentimiento cuando corresponde, y puedes revocarlo.',
        },
      ],
    },
    {
      title: 'Ubicación y preferencias alimentarias',
      blocks: [
        {
          kind: 'text',
          value:
            'La ubicación se usa para centrar el mapa, resolver la dirección, validar la cobertura y calcular la entrega. Siempre puedes escribir la dirección a mano. Las preferencias y alérgenos son opcionales: sirven para mostrarte advertencias o personalizar tu experiencia, no para tomar decisiones médicas ni para publicidad basada en salud.',
        },
      ],
    },
    {
      title: 'Proveedores y transferencias',
      blocks: [
        {
          kind: 'text',
          value:
            'Podemos encargar operaciones limitadas a proveedores de alojamiento, base de datos, correo, pagos, mapas y reparto. Solo reciben la información necesaria y deben protegerla. Algunos pueden procesar datos fuera del Perú; en ese caso aplicamos las garantías y comunicaciones exigibles. No vendemos datos personales. También podremos entregarlos a una autoridad cuando una norma o requerimiento válido lo obligue.',
        },
      ],
    },
    {
      title: 'Pagos',
      blocks: [
        {
          kind: 'text',
          value:
            'Los datos completos de tarjeta se ingresan directamente en la plataforma del proveedor de pagos. Verde Bowl conserva referencias, estado, importe y respuesta depurada de la operación, pero no el número completo de la tarjeta ni el código de seguridad.',
        },
      ],
    },
    {
      title: 'Conservación',
      blocks: [
        {
          kind: 'text',
          value:
            'Conservamos los datos mientras tu cuenta o relación comercial esté activa y después durante los plazos necesarios para obligaciones tributarias, contables, contractuales, reclamos, prevención de fraude y defensa de derechos. Al terminar esos plazos eliminamos o anonimizamos la información, salvo que exista una obligación o controversia que justifique conservarla.',
        },
      ],
    },
    {
      title: 'Derechos ARCO y revocación',
      blocks: [
        {
          kind: 'text',
          value:
            'Puedes solicitar información, acceso, rectificación, cancelación u oposición, así como revocar un consentimiento. Envía tu solicitud concreta, indica el derecho que ejerces y adjunta un medio razonable para acreditar tu identidad. No pediremos más información de la necesaria.',
        },
        {
          kind: 'mail',
          email: supportMail(business),
          caption: 'Dirige aquí tu solicitud ARCO',
        },
        {
          kind: 'text',
          value:
            'Conforme al reglamento vigente, los plazos máximos son 8 días calendario para información, 20 para acceso y 10 para rectificación, cancelación u oposición; pueden ampliarse una sola vez cuando esté permitido y se comunique dentro del plazo inicial. Si no atendemos tu solicitud, puedes acudir a la Autoridad Nacional de Protección de Datos Personales.',
        },
      ],
    },
    {
      title: 'Seguridad e incidentes',
      blocks: [
        {
          kind: 'text',
          value:
            'Aplicamos control de accesos, contraseñas con hash, trazabilidad, cifrado en tránsito y medidas organizativas proporcionales al riesgo. En el teléfono, los datos de sesión se guardan en el almacén seguro del sistema. Ningún sistema es infalible: si ocurre un incidente que deba comunicarse, actuaremos frente a los titulares y a las autoridades en los términos legales.',
        },
      ],
    },
    {
      title: 'Almacenamiento en tu dispositivo',
      blocks: [
        {
          kind: 'text',
          value:
            'La aplicación guarda en el teléfono la sesión, el carrito, la dirección elegida, tus preferencias y un identificador propio de medición. No cargamos redes publicitarias ni vendemos perfiles.',
        },
        {
          kind: 'route',
          label: 'Almacenamiento y medición',
          caption: 'Qué guardamos en tu teléfono y cómo desactivar la medición',
          to: legalRoute('cookies'),
        },
      ],
    },
    {
      title: 'Menores y cambios',
      blocks: [
        {
          kind: 'text',
          value:
            'El servicio de compra está dirigido a personas con capacidad para contratar. Si detectamos datos de un menor tratados sin autorización válida, evaluaremos su eliminación. Los cambios materiales de esta política se publicarán aquí y se comunicarán cuando corresponda.',
        },
        {
          kind: 'route',
          label: 'Términos y Condiciones',
          caption: 'Las reglas de compra, planes y saldo',
          to: legalRoute('terminos'),
        },
      ],
    },
  ],
});

const buildTerms = (business: Business | null): LegalDoc => ({
  navTitle: 'Términos',
  title: 'Términos y Condiciones',
  intro:
    'Reglas claras para comprar, recibir pedidos y usar planes. Revisa sobre todo la sección de dinero pagado, bonos y vigencias.',
  collapsible: false,
  sections: [
    {
      title: 'Identificación del proveedor y alcance',
      blocks: [
        {
          kind: 'text',
          value: `La aplicación y los servicios de Verde Bowl son operados por ${identity(business)}. Estas condiciones regulan el uso de la app, la cuenta, los pedidos, los planes y la billetera de saldo.`,
        },
        {
          kind: 'mail',
          email: supportMail(business),
          caption: 'Nuestro correo de contacto',
        },
      ],
    },
    {
      title: 'Cuenta y aceptación',
      blocks: [
        {
          kind: 'text',
          value:
            'Debes dar información verdadera y mantener la confidencialidad de tu acceso. Al crear una cuenta aceptas estos términos y la Política de Privacidad.',
        },
        {
          kind: 'text',
          value:
            'Para comprar un plan te pedimos además una confirmación expresa de sus reglas de saldo, y guardamos la fecha y la versión que aceptaste. No compartas tu cuenta ni intentes usar saldos, cupones o promociones de forma fraudulenta.',
        },
      ],
    },
    {
      title: 'Productos, disponibilidad y precios',
      blocks: [
        {
          kind: 'text',
          value:
            'Los precios están expresados en soles e incluyen IGV. El costo de entrega, los descuentos y el total final se muestran antes de confirmar. Las fotografías son referenciales y la disponibilidad depende del stock y del local elegido.',
        },
        {
          kind: 'text',
          value:
            'Si detectamos un error manifiesto de precio o disponibilidad antes de preparar el pedido, te avisaremos y podrás aceptar la corrección o recibir la devolución que corresponda.',
        },
      ],
    },
    {
      title: 'Pedidos, pagos y comprobantes',
      blocks: [
        {
          kind: 'text',
          value:
            'Antes de comprar ves el detalle del pedido. En los pagos por internet el pedido queda confirmado cuando el proveedor de pago comunica la aprobación. Cuando esté habilitado el pago contra entrega, se confirma sujeto al límite que se informa en el checkout.',
        },
        {
          kind: 'text',
          value:
            'Emitimos boleta o factura con los datos que ingresas. Verde Bowl no almacena números completos de tarjeta ni códigos de seguridad: esos datos se procesan en la pasarela.',
        },
      ],
    },
    {
      title: 'Entrega y recojo',
      blocks: [
        {
          kind: 'text',
          value:
            'La entrega está sujeta a cobertura, capacidad y horarios disponibles. Los tiempos son estimados y pueden variar por tránsito, clima o demanda. Debes indicar una dirección y un punto de recepción correctos y estar disponible. Si eliges recojo, no se solicita dirección de entrega y debes acudir al local confirmado dentro del horario indicado.',
        },
      ],
    },
    {
      title: 'Cancelaciones y devoluciones',
      blocks: [
        {
          kind: 'text',
          value:
            'Puedes pedir la cancelación mientras el pedido no haya empezado a prepararse. Después evaluaremos el caso considerando que el producto es perecible y personalizado.',
        },
        {
          kind: 'text',
          value:
            'Cuando corresponda devolver saldo de billetera, restituimos los lotes usados si todavía son válidos. Si vencieron mientras el pedido estaba en curso, el importe devuelto se emite con una nueva vigencia de 180 días. Los pagos externos se devuelven al medio original, sujetos a los tiempos de la entidad que procesa.',
        },
        {
          kind: 'mail',
          email: supportMail(business),
          caption: 'Escríbenos para pedir una cancelación',
        },
      ],
    },
    {
      title: 'Planes, dinero pagado y bonos',
      blocks: [
        {
          kind: 'text',
          value:
            'Un plan es una compra única de saldo con beneficios, no una suscripción. No hay renovación ni cargo automático. Cada nueva compra crea lotes independientes y no extiende ni reemplaza las fechas de compras anteriores.',
        },
        {
          kind: 'list',
          items: [
            'Dinero pagado: corresponde al precio que abonaste y puedes usarlo durante 180 días calendario desde la confirmación del pago.',
            'Bono promocional: es la diferencia gratuita entre el crédito anunciado y el precio pagado; vence al terminar la vigencia indicada para el plan.',
            'Beneficios: los descuentos, el delivery gratuito u otras ventajas solo se aplican durante la vigencia del plan. Si tienes varios planes, se aplica el mejor beneficio de cada tipo y no se suman porcentajes equivalentes.',
          ],
        },
        {
          kind: 'text',
          value:
            'Al pagar pedidos, el sistema consume primero el lote con vencimiento más cercano. Cuando un lote vence, solo se anula su remanente; nunca el saldo de otra compra. Las fechas e importes están en «Mi saldo». El saldo no es transferible ni canjeable por efectivo, salvo obligación legal o devolución expresamente aprobada.',
        },
      ],
    },
    {
      title: 'Promociones y cupones',
      blocks: [
        {
          kind: 'text',
          value:
            'Cada promoción puede tener fechas, productos, zonas, monto mínimo, límite de usos y reglas de acumulación propias. Las condiciones particulares que se muestran en la promoción complementan este documento. Podemos invalidar usos duplicados, automatizados o fraudulentos sin afectar los derechos de una compra legítima.',
        },
      ],
    },
    {
      title: 'Información nutricional y alérgenos',
      blocks: [
        {
          kind: 'text',
          value:
            'La información nutricional es estimada y puede variar según la porción o la personalización. Si tienes alergias o una condición médica, revisa los ingredientes y consulta antes de comprar. En cocina puede existir contacto cruzado; ninguna etiqueta sustituye una indicación profesional.',
        },
      ],
    },
    {
      title: 'Disponibilidad del servicio y propiedad intelectual',
      blocks: [
        {
          kind: 'text',
          value:
            'Podemos hacer mantenimientos o corregir fallas de la plataforma. Las marcas, diseños, textos, fotografías y software pertenecen a sus titulares y no pueden copiarse ni explotarse sin autorización. Nada en estas condiciones excluye responsabilidades ni derechos que la ley peruana reconoce al consumidor.',
        },
      ],
    },
    {
      title: 'Atención y Libro de Reclamaciones',
      blocks: [
        {
          kind: 'text',
          value:
            'Presentar un reclamo no limita otros mecanismos de solución ni es requisito para denunciar ante INDECOPI.',
        },
        {
          kind: 'route',
          label: 'Libro de Reclamaciones virtual',
          caption: 'Presenta un reclamo o una queja desde la app',
          to: SUPPORT_ROUTE,
        },
      ],
    },
    {
      title: 'Cambios y ley aplicable',
      blocks: [
        {
          kind: 'text',
          value:
            'Podemos actualizar estas condiciones hacia el futuro. Los cambios materiales se informan por la app o por tus datos de contacto y no reducen retroactivamente saldos ya adquiridos. Se aplican las leyes del Perú y las autoridades competentes, sin restringir tu derecho a acudir a la autoridad o jurisdicción que corresponda.',
        },
      ],
    },
  ],
});

const buildStorage = (business: Business | null): LegalDoc => ({
  navTitle: 'Almacenamiento',
  title: 'Almacenamiento en tu dispositivo',
  intro:
    'Puedes usar todas las funciones principales aunque desactives la medición opcional. Esta es la versión para la app de la Política de Cookies de la web.',
  collapsible: false,
  sections: [
    {
      title: 'Qué guardamos en el teléfono',
      blocks: [
        {
          kind: 'text',
          value:
            'La aplicación no usa cookies de navegador: guarda datos en el almacenamiento del propio dispositivo. Cumplen la misma función que las cookies de la web, es decir recordar tu sesión, el carrito, la dirección elegida, los borradores y tus preferencias. No cargamos redes de publicidad ni píxeles de terceros.',
        },
      ],
    },
    {
      title: 'Almacenamiento necesario',
      blocks: [
        {
          kind: 'text',
          value: 'Se usa aunque desactives la medición, porque permite prestar las funciones que pides:',
        },
        {
          kind: 'list',
          items: [
            'Tokens de sesión, guardados en el almacén seguro del sistema, para mantener la cuenta y renovarla con seguridad.',
            'Carrito, constructor de bowl, dirección elegida y borrador temporal del checkout.',
            'Claves de idempotencia que evitan pedidos o compras duplicadas.',
            'Preferencias de la aplicación y el último local seleccionado.',
            'Tu propia elección de privacidad, para no volver a preguntarte en cada visita.',
          ],
        },
      ],
    },
    {
      title: 'Medición opcional',
      blocks: [
        {
          kind: 'text',
          value:
            'Solo si la aceptas creamos un identificador aleatorio y registramos eventos limitados, como el inicio del checkout, el resultado de la cobertura o un error de pago. Sirve para detectar fallas y mejorar el recorrido; no habilita publicidad personalizada y puedes retirar el permiso cuando quieras.',
        },
        {
          kind: 'route',
          label: 'Activar o desactivar la medición',
          caption: 'Está en Preferencias, junto a tus alérgenos y avisos',
          to: PREFERENCES_ROUTE,
        },
      ],
    },
    {
      title: 'Notificaciones push',
      blocks: [
        {
          kind: 'text',
          value:
            'Si aceptas las notificaciones, guardamos un identificador del dispositivo para avisarte del estado de tus pedidos. Puedes retirarlo desde los ajustes del sistema o eliminando el dispositivo desde tu cuenta, y dejaremos de enviarte avisos.',
        },
      ],
    },
    {
      title: 'Cómo borrar lo guardado',
      blocks: [
        {
          kind: 'text',
          value:
            'Cerrar sesión elimina los tokens del almacén seguro. Borrar los datos de la aplicación desde los ajustes del sistema elimina todo lo demás: se cerrará la sesión y podrías perder el carrito o los borradores que aún no enviaste, pero no se eliminan los pedidos ni los movimientos ya guardados en tu cuenta.',
        },
        {
          kind: 'mail',
          email: supportMail(business),
          caption: 'Consultas sobre tus datos',
        },
      ],
    },
  ],
});

const buildFaq = (business: Business | null): LegalDoc => ({
  navTitle: 'Preguntas frecuentes',
  title: 'Preguntas frecuentes',
  intro: 'Las dudas más comunes sobre pedidos, pagos, planes y entregas. Toca una pregunta para ver la respuesta.',
  collapsible: true,
  sections: [
    {
      title: '¿Cómo pago mi pedido?',
      blocks: [
        {
          kind: 'list',
          items: [
            'Tarjeta por internet, en la pasarela de pago.',
            'Yape o Plin, con el número o el QR del local.',
            'Efectivo contra entrega, cuando está habilitado y hasta el límite que se indica en el checkout.',
            'Saldo de tu billetera, si compraste un plan.',
          ],
        },
        {
          kind: 'text',
          value:
            'El total, el costo de entrega y los descuentos siempre se calculan en nuestros servidores y se muestran antes de confirmar.',
        },
      ],
    },
    {
      title: '¿Puedo pedir boleta o factura?',
      blocks: [
        {
          kind: 'text',
          value:
            'Sí. En el checkout eliges el comprobante: boleta con tu DNI o factura con el RUC y la razón social. Validamos el número antes de confirmar el pedido.',
        },
      ],
    },
    {
      title: '¿Llegan a mi distrito?',
      blocks: [
        {
          kind: 'text',
          value:
            'Depende de la zona de cobertura de cada local. Al guardar una dirección comprobamos la cobertura y te mostramos el costo de entrega y el horario disponible. Si no llegamos, siempre puedes elegir recojo en tienda.',
        },
      ],
    },
    {
      title: '¿Cuánto demora mi pedido?',
      blocks: [
        {
          kind: 'text',
          value:
            'El tiempo estimado aparece antes de confirmar y depende de la carga de cocina, el tránsito y la distancia. Desde «Mis pedidos» puedes seguir el estado en vivo: confirmado, en preparación, listo y en camino.',
        },
      ],
    },
    {
      title: '¿Puedo cancelar un pedido?',
      blocks: [
        {
          kind: 'text',
          value:
            'Sí, mientras no haya empezado la preparación: abre el pedido y usa «Cancelar». Después de ese punto escríbenos y evaluamos el caso, teniendo en cuenta que la comida es perecible y personalizada.',
        },
      ],
    },
    {
      title: '¿Un plan es una suscripción?',
      blocks: [
        {
          kind: 'text',
          value:
            'No. Es una compra única de saldo con beneficios: no hay renovación ni cargo automático. El dinero pagado dura 180 días y el bono promocional vence con la vigencia del plan. En «Mi saldo» ves cada lote con su fecha.',
        },
      ],
    },
    {
      title: '¿Cómo aviso de una alergia?',
      blocks: [
        {
          kind: 'text',
          value:
            'Registra tus alérgenos en Preferencias y la app te avisará al elegir un producto que los contenga. Ten en cuenta que en cocina puede existir contacto cruzado: si tienes una alergia severa, consúltanos antes de comprar.',
        },
        {
          kind: 'route',
          label: 'Mis preferencias y alérgenos',
          caption: 'Configura lo que evitas',
          to: PREFERENCES_ROUTE,
        },
      ],
    },
    {
      title: '¿Cómo presento un reclamo?',
      blocks: [
        {
          kind: 'text',
          value:
            'Desde el Libro de Reclamaciones de la app. Te damos un código con el que puedes consultar la respuesta cuando quieras. Presentar un reclamo no es requisito para acudir a INDECOPI.',
        },
        {
          kind: 'route',
          label: 'Libro de Reclamaciones',
          caption: 'Presentar o consultar una solicitud',
          to: SUPPORT_ROUTE,
        },
      ],
    },
    {
      title: 'Sigo con dudas',
      blocks: [
        {
          kind: 'text',
          value: `Escríbenos y te respondemos. ${business?.phone?.trim() ? `También puedes llamarnos al ${business.phone.trim()}.` : ''}`.trim(),
        },
        {
          kind: 'mail',
          email: supportMail(business),
          caption: 'Atención al cliente',
        },
      ],
    },
  ],
});

const BUILDERS: Record<LegalSlug, (business: Business | null) => LegalDoc> = {
  privacidad: buildPrivacy,
  terminos: buildTerms,
  cookies: buildStorage,
  'preguntas-frecuentes': buildFaq,
};

export default function LegalDocumentScreen() {
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : '';

  // Los datos de la empresa cambian por entorno; el texto no. Si la petición
  // falla, el documento se lee igual con el nombre comercial genérico: un texto
  // legal nunca puede quedarse en blanco por una caída del servidor.
  const settings = useResource<PublicSettings>({
    key: 'settings:public',
    fetcher: () => businessApi.publicSettings(),
    cacheMs: 10 * 60_000,
  });

  const business = settings.data?.business ?? null;
  const doc = useMemo<LegalDoc | null>(
    () => (isLegalSlug(slug) ? BUILDERS[slug](business) : null),
    [business, slug],
  );

  const [openSection, setOpenSection] = useState<string | null>(null);

  if (!doc) {
    return (
      <ScreenScaffold title="Documento" showBack>
        <EmptyState
          icon="file-question-outline"
          title="No encontramos ese documento"
          message="El enlace apunta a un texto legal que no existe en la aplicación."
          actionLabel="Ir a ayuda"
          onAction={() => router.replace(SUPPORT_ROUTE)}
        />
      </ScreenScaffold>
    );
  }

  const toggle = (title: string) => {
    setOpenSection((current) => (current === title ? null : title));
  };

  const renderBlock = (block: LegalBlock, index: number) => {
    if (block.kind === 'text') {
      return (
        <Text key={index} style={styles.paragraph}>
          {block.value}
        </Text>
      );
    }

    if (block.kind === 'list') {
      return (
        <View key={index} style={styles.list}>
          {block.items.map((item) => (
            <View key={item} style={styles.listRow}>
              <View style={styles.bullet} />
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    }

    if (block.kind === 'mail') {
      return (
        <Pressable
          key={index}
          accessibilityRole="link"
          accessibilityLabel={`Escribir a ${block.email}`}
          onPress={() => void Linking.openURL(`mailto:${block.email}`)}
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="email-outline" size={22} color={colors.brand700} />
          <View style={styles.linkText}>
            <Text style={styles.linkLabel}>{block.email}</Text>
            <Text style={styles.linkCaption}>{block.caption}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkMuted} />
        </Pressable>
      );
    }

    return (
      <Pressable
        key={index}
        accessibilityRole="link"
        accessibilityLabel={block.label}
        onPress={() => router.push(block.to)}
        style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="text-box-outline" size={22} color={colors.brand700} />
        <View style={styles.linkText}>
          <Text style={styles.linkLabel}>{block.label}</Text>
          <Text style={styles.linkCaption}>{block.caption}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkMuted} />
      </Pressable>
    );
  };

  return (
    <ScreenScaffold title={doc.navTitle} showBack>
      <FlatList
        data={doc.sections}
        keyExtractor={(section) => section.title}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{doc.title}</Text>
            <Text style={styles.updated}>Vigente desde el {VERSION_DATE}</Text>
            <View style={styles.introCard}>
              <Text style={styles.intro}>{doc.intro}</Text>
            </View>

            {settings.error ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reintentar la carga de los datos de la empresa"
                onPress={() => void settings.refetch()}
                style={({ pressed }) => [styles.warning, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="wifi-off" size={20} color={colors.warning} />
                <Text style={styles.warningText}>
                  No pudimos cargar los datos de la empresa. El texto es el vigente; toca para
                  reintentar.
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const expanded = !doc.collapsible || openSection === item.title;

          return (
            <View style={styles.section}>
              <Pressable
                accessibilityRole={doc.collapsible ? 'button' : 'header'}
                accessibilityLabel={item.title}
                accessibilityState={doc.collapsible ? { expanded } : undefined}
                disabled={!doc.collapsible}
                onPress={() => toggle(item.title)}
                style={({ pressed }) => [
                  styles.sectionHead,
                  doc.collapsible && pressed && styles.pressed,
                ]}
              >
                {doc.collapsible ? null : (
                  <View style={styles.number}>
                    <Text style={styles.numberText}>{index + 1}</Text>
                  </View>
                )}

                <Text style={styles.sectionTitle}>{item.title}</Text>

                {doc.collapsible ? (
                  <MaterialCommunityIcons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={24}
                    color={colors.brand700}
                  />
                ) : null}
              </Pressable>

              {expanded ? (
                <View style={styles.sectionBody}>{item.blocks.map(renderBlock)}</View>
              ) : null}
            </View>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.footerText}>{identity(business)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ir al Libro de Reclamaciones"
              onPress={() => router.push(SUPPORT_ROUTE)}
              style={({ pressed }) => [styles.footerAction, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="book-open-variant" size={20} color={colors.brand700} />
              <Text style={styles.footerActionText}>Libro de Reclamaciones</Text>
            </Pressable>
          </View>
        }
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    paddingBottom: spacing.md,
  },
  title: {
    ...type.display,
    color: colors.ink,
  },
  updated: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  introCard: {
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand100,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  intro: {
    ...type.body,
    color: colors.brand800,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch,
    backgroundColor: '#fff6e6',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  warningText: {
    ...type.bodySm,
    flex: 1,
    color: colors.warning,
  },
  section: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    marginTop: spacing.sm + spacing.xs,
    ...shadow.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: layout.minTouch + 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  numberText: {
    ...type.label,
    color: colors.brand700,
  },
  sectionTitle: {
    ...type.heading,
    flex: 1,
    color: colors.ink,
  },
  sectionBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm + spacing.xs,
  },
  paragraph: {
    ...type.body,
    color: colors.inkMuted,
    lineHeight: 24,
  },
  list: {
    gap: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  bullet: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.brand600,
    marginTop: 8,
  },
  listText: {
    ...type.body,
    flex: 1,
    color: colors.inkMuted,
    lineHeight: 24,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: layout.minTouch + 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm,
  },
  linkText: {
    flex: 1,
  },
  linkLabel: {
    ...type.body,
    color: colors.brand700,
    fontWeight: '800',
  },
  linkCaption: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    marginTop: spacing.lg,
  },
  footerText: {
    ...type.bodySm,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
  },
  footerActionText: {
    ...type.label,
    color: colors.brand700,
  },
  pressed: {
    opacity: 0.7,
  },
});
