import { useEffect, useState } from 'react';
import { BadgeCheck, MessageSquareText, RefreshCw, Star } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Skeleton } from '@components/ui/Skeleton';
import { getApiErrorMessage } from '@services/api/client';
import { reviewsApi } from '../services/reviews.service';
import type { ProductReviews } from '../types';

export const ProductReviewsSection = ({ productId }: { productId: number }) => {
  const [data, setData] = useState<ProductReviews | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void reviewsApi.product(productId)
      .then((result) => { if (active) setData(result); })
      .catch((reason) => { if (active) setError(getApiErrorMessage(reason)); });
    return () => { active = false; };
  }, [productId, retry]);

  return (
    <section className="border-t border-line bg-surface-muted py-12 sm:py-16" aria-labelledby="product-reviews-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Compras verificadas</p>
            <h2 id="product-reviews-heading" className="mt-1 text-2xl font-black tracking-tight text-ink sm:text-3xl">Lo que dicen quienes ya lo probaron</h2>
          </div>
          {data && data.summary.count > 0 && (
            <div className="flex items-center gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3">
              <Star className="size-6 fill-amber-400 text-amber-500" />
              <div><p className="text-xl font-black text-ink">{data.summary.average.toFixed(1)}</p><p className="text-xs text-ink-muted">{data.summary.count} opiniones</p></div>
            </div>
          )}
        </div>

        {!data && !error && <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-40 rounded-card" />)}</div>}
        {error && (
          <div className="mt-7 flex flex-col items-start gap-3 rounded-card border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-bold text-red-700">{error}</p>
            <Button size="sm" variant="outline" leftIcon={<RefreshCw className="size-4" />} onClick={() => setRetry((value) => value + 1)}>Reintentar</Button>
          </div>
        )}
        {data && data.reviews.length === 0 && (
          <div className="mt-7 flex items-center gap-3 rounded-card border border-dashed border-brand-200 bg-white p-5 text-ink-muted">
            <MessageSquareText className="size-6 text-brand-700" />
            <p className="text-sm">Todavía no hay opiniones. Solo pueden comentar clientes con una compra entregada.</p>
          </div>
        )}
        {data && data.reviews.length > 0 && (
          <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.reviews.map((review) => (
              <article key={review.id} className="rounded-card border border-line bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-0.5" aria-label={`${review.rating} de 5 estrellas`}>
                    {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`size-4 ${star <= review.rating ? 'fill-amber-400 text-amber-500' : 'text-line'}`} />)}
                  </div>
                  {review.verifiedPurchase && <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-brand-700"><BadgeCheck className="size-4" /> Compra verificada</span>}
                </div>
                <p className="mt-4 text-sm leading-6 text-ink">{review.comment || 'Calificó este producto sin comentario.'}</p>
                <div className="mt-4 border-t border-line pt-3"><p className="text-xs font-extrabold text-ink">{review.authorName}</p><p className="mt-0.5 text-[11px] text-ink-muted">{new Date(review.createdAt).toLocaleDateString('es-PE')}</p></div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
