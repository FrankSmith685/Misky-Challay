import { Link, useSearchParams } from 'react-router-dom';
import { useCheckoutTerms } from '@services/checkoutTerms';
import { ROUTES } from '@constants/routes';
import { Button } from '@components/ui/Button';
import { PageLoader } from '@components/common/PageLoader';

const TermsPage = () => {
  const [params] = useSearchParams();
  const { terms, error, refresh } = useCheckoutTerms(params.get('documento') === 'suscripcion');
  if (error) return <main className="mx-auto max-w-3xl px-5 py-12" role="alert"><p>No pudimos cargar los términos y condiciones.</p><Button className="mt-4" onClick={() => void refresh()}>Reintentar</Button></main>;
  if (!terms) return <PageLoader />;
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-bold">{terms.title}</h1>
      <p className="mt-3 text-sm text-ink-muted">Versión {terms.version} · Publicada el {new Date(terms.publishedAt).toLocaleDateString('es-PE')}</p>
      <article className="mt-8 whitespace-pre-wrap break-words text-sm leading-7 text-ink">{terms.content}</article>
      <div className="mt-8 flex flex-wrap gap-5 border-t border-line pt-5 text-sm font-semibold text-brand-700">
        <Link to={ROUTES.privacy}>Política de privacidad</Link>
        <Link to={ROUTES.complaints}>Libro de Reclamaciones</Link>
      </div>
    </main>
  );
};
export default TermsPage;
