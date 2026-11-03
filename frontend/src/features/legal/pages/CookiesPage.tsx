import { useState } from 'react';
import { Button } from '@components/ui/Button';
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from '@services/analytics';
import { LegalDocument, type LegalSection } from '../components/LegalDocument';

const CookiesPage = () => {
  const [choice, setChoice] = useState<AnalyticsConsent>(getAnalyticsConsent);

  const updateChoice = (next: Exclude<AnalyticsConsent, null>) => {
    setAnalyticsConsent(next);
    setChoice(next);
  };

  const sections: LegalSection[] = [
    {
      title: 'Qué tecnologías usamos',
      body: (
        <p>
          Misky Challay utiliza almacenamiento local y de sesión del navegador. Estas tecnologías cumplen
          funciones similares a las cookies: recordar tu sesión, carrito, dirección seleccionada,
          borradores y preferencias. No usamos actualmente redes de publicidad ni píxeles de terceros.
        </p>
      ),
    },
    {
      title: 'Almacenamiento necesario',
      body: (
        <>
          <p>Se utiliza aunque rechaces la medición porque permite prestar funciones solicitadas:</p>
          <ul>
            <li>Tokens de sesión para mantener la cuenta autenticada y renovarla con seguridad.</li>
            <li>Carrito, constructor de bowl, dirección y borrador temporal del checkout.</li>
            <li>Claves de idempotencia que evitan compras o pedidos duplicados.</li>
            <li>Preferencias visuales y del panel cuando corresponda.</li>
            <li>La propia elección de privacidad para no volver a preguntarte en cada visita.</li>
          </ul>
        </>
      ),
    },
    {
      title: 'Medición opcional',
      body: (
        <p>
          Solo si aceptas, creamos un identificador aleatorio que dura durante la sesión y registramos
          eventos limitados como inicio del checkout, resultado de cobertura o error de pago. Esta
          información ayuda a detectar fallas y mejorar el recorrido. No habilita publicidad
          personalizada y puedes retirar el permiso en cualquier momento.
        </p>
      ),
    },
    {
      title: 'Tus preferencias',
      body: (
        <div>
          <p>
            Estado actual:{' '}
            <strong>{choice === 'accepted' ? 'medición aceptada' : choice === 'rejected' ? 'solo almacenamiento necesario' : 'sin elección'}</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={choice === 'rejected' ? 'primary' : 'outline'} onClick={() => updateChoice('rejected')}>
              Usar solo lo necesario
            </Button>
            <Button size="sm" variant={choice === 'accepted' ? 'primary' : 'outline'} onClick={() => updateChoice('accepted')}>
              Aceptar medición propia
            </Button>
          </div>
        </div>
      ),
    },
    {
      title: 'Cómo borrar el almacenamiento',
      body: (
        <p>
          Puedes borrar los datos del sitio desde la configuración del navegador. Al hacerlo se cerrará
          la sesión y podrían perderse el carrito o borradores que aún no enviaste, pero no se eliminan
          pedidos ni movimientos ya guardados en tu cuenta.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Política de Cookies y almacenamiento"
      updatedAt="2 de agosto de 2026"
      intro="Puedes usar las funciones principales aunque rechaces la medición opcional."
      sections={sections}
    />
  );
};

export default CookiesPage;
