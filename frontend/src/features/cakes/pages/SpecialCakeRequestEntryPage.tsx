import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { CakeSlice } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/common/EmptyState';
import { PageLoader } from '@components/common/PageLoader';
import { ROUTES } from '@constants/routes';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { getApiErrorMessage } from '@services/api/client';

/** Entry point for a special individual cake request, separate from the purchase builder. */
const SpecialCakeRequestEntryPage = () => {
  const [params] = useSearchParams();
  const requestedSlug = params.get('producto');
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void catalogApi
      .getProducts()
      .then((products) => {
        if (!active) return;
        const cakes = products.filter(
          (product) => (product.family ?? 'CAKE') === 'CAKE' && product.cakeSaleMode === 'SEMI_CUSTOM',
        );
        const selected = requestedSlug
          ? cakes.find((product) => product.slug === requestedSlug)
          : undefined;
        setSlug((selected ?? cakes.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.id - b.id)[0])?.slug ?? null);
      })
      .catch((cause) => {
        if (active) setError(getApiErrorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestedSlug, retry]);

  if (loading) return <PageLoader />;
  if (slug) {
    return <Navigate replace to={`${ROUTES.cake(slug)}?solicitud=especial`} state={{ specialCakeEntry: true }} />;
  }
  return (
    <section className="container-shell py-12">
      <EmptyState
        icon={CakeSlice}
        title={error ? 'No pudimos abrir la solicitud especial' : 'Pronto podrás solicitar una torta especial'}
        description={error || 'Estamos preparando las opciones. Mientras tanto, explora las tortas disponibles.'}
        action={
          error ? (
            <Button onClick={() => setRetry((value) => value + 1)}>Reintentar</Button>
          ) : (
            <Button component={Link} to={ROUTES.menu}>Explorar catálogo</Button>
          )
        }
      />
    </section>
  );
};

export default SpecialCakeRequestEntryPage;
