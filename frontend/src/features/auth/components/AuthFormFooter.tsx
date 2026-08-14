import { Link } from 'react-router-dom';

interface AuthFormFooterProps {
  prompt: string;
  linkLabel: string;
  to: string;
  /**
   * Destino al que volver tras identificarse. Se arrastra al cambiar entre acceso
   * y registro: si no, quien viene del carrito a crear cuenta y decide iniciar
   * sesion pierde el rastro y acaba en la portada con el pedido a medias.
   */
  from?: string;
}

/** Separador y enlace de cambio entre los flujos públicos de autenticación. */
export const AuthFormFooter = ({ prompt, linkLabel, to, from }: AuthFormFooterProps) => (
  <div className="mt-7 border-t border-line pt-6 text-center">
    <p className="text-sm text-ink-muted">
      {prompt}{' '}
      <Link
        to={to}
        state={from ? { from } : undefined}
        className="font-extrabold text-brand-700 underline-offset-4 transition-colors hover:text-brand-800 hover:underline"
      >
        {linkLabel}
      </Link>
    </p>
  </div>
);
