import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CakeSlice } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/common/EmptyState';
import { PageLoader } from '@components/common/PageLoader';
import { ROUTES } from '@constants/routes';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { getApiErrorMessage } from '@services/api/client';

/** Resuelve la torta publicada desde el catálogo, sin duplicar su ficha ni su slug. */
const CustomCakeEntryPage = () => {
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void catalogApi.getProducts().then((products) => {
      if (!active) return;
      const cake = products.filter((product) => (product.family ?? 'CAKE') === 'CAKE' && product.cakeSaleMode === 'SEMI_CUSTOM')
        .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.id - b.id)[0];
      setSlug(cake?.slug ?? null);
    }).catch((cause) => { if (active) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  if (loading) return <PageLoader />;
  if (slug) return <Navigate to={ROUTES.cake(slug)} replace state={{ customCakeEntry: true }} />;
  return <section className="container-shell py-12">
    <EmptyState icon={CakeSlice} title={error ? 'No pudimos abrir el personalizador' : 'Pronto podrás crear tu torta'}
      description={error || 'Estamos preparando las opciones. Mientras tanto, explora los productos disponibles.'}
      action={error ? <Button onClick={() => setRetry((value) => value + 1)}>Reintentar</Button> : <Button component={Link} to={ROUTES.menu}>Explorar catálogo</Button>} />
  </section>;
};
export default CustomCakeEntryPage;
