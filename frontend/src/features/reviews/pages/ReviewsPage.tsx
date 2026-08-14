import { useCallback, useEffect, useState } from 'react';
import { Rating, TextField } from '@mui/material';
import { BadgeCheck, MessageSquareText, Send, Star } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { ProductMedia } from '@components/ui/ProductMedia';
import { Skeleton } from '@components/ui/Skeleton';
import { getApiErrorMessage } from '@services/api/client';
import { reviewsApi } from '../services/reviews.service';
import type { PendingReview } from '../types';

const MAX_COMMENT = 800;
const RATING_LABEL: Record<number, string> = {
  1: 'Muy malo', 2: 'Malo', 3: 'Regular', 4: 'Bueno', 5: 'Excelente',
};

const ReviewsPage = () => {
  const [rows, setRows] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setRows(await reviewsApi.pending()); }
    catch (reason) { setError(getApiErrorMessage(reason)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = (row: PendingReview) => {
    setSelected(row.orderItemId);
    setRating(5);
    setComment('');
  };

  const submit = async (row: PendingReview) => {
    setSaving(true);
    try {
      await reviewsApi.create(row.orderItemId, rating, comment);
      setRows((current) => current.filter((item) => item.orderItemId !== row.orderItemId));
      setSelected(null);
      toast.success('Publicamos tu opinión como compra verificada.');
    } catch (reason) {
      toast.error(getApiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Compras verificadas"
        icon={Star}
        title="Mis opiniones"
        description="Califica platos que realmente recibiste. Tu opinión se comparte en la web y en la app."
      />

      <div className="mb-5 flex items-start gap-3 rounded-card border border-brand-200 bg-brand-50 p-4 text-brand-900">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-brand-700" />
        <div><p className="text-sm font-extrabold">Solo experiencias reales</p><p className="mt-1 text-xs leading-5 text-brand-800">Un producto se habilita para comentar después de que el pedido figure como entregado.</p></div>
      </div>

      {loading && <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-48 rounded-card" />)}</div>}
      {!loading && error && <EmptyState icon={MessageSquareText} title="No pudimos cargar tus pendientes" description={error} action={<Button onClick={() => void load()}>Reintentar</Button>} />}
      {!loading && !error && rows.length === 0 && <EmptyState icon={BadgeCheck} title="Estás al día" description="Cuando recibas otro pedido podrás compartir aquí tu experiencia." />}

      {!loading && !error && rows.length > 0 && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {rows.map((row) => {
            const active = selected === row.orderItemId;
            return (
              <article key={row.orderItemId} className={`overflow-hidden rounded-card border bg-white shadow-e2 ${active ? 'border-brand-400' : 'border-line'}`}>
                <div className="flex gap-4 p-4 sm:p-5">
                  <ProductMedia src={row.imageUrl} alt={row.productName} className="size-24 shrink-0 rounded-card sm:size-28" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-black text-ink">{row.productName}</h2>
                    <p className="mt-1 text-xs text-ink-muted">Pedido {row.orderNumber}</p>
                    <p className="mt-1 text-xs font-bold text-brand-700">{row.deliveredAt ? `Entregado el ${new Date(row.deliveredAt).toLocaleDateString('es-PE')}` : 'Pedido entregado'}</p>
                    {!active && <Button size="sm" className="mt-4" leftIcon={<Star className="size-4" />} onClick={() => open(row)}>Calificar</Button>}
                  </div>
                </div>

                {active && (
                  <div className="border-t border-line bg-surface-muted p-4 sm:p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-sm font-extrabold text-ink">¿Cuántas estrellas le das?</p><p className="text-xs font-bold text-brand-700">{RATING_LABEL[rating]}</p></div>
                      <Rating value={rating} size="large" onChange={(_, value) => setRating(value ?? 1)} />
                    </div>
                    <TextField
                      multiline minRows={4} fullWidth value={comment}
                      onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT))}
                      placeholder="Cuéntanos qué te gustó (opcional)"
                      helperText={`${comment.length}/${MAX_COMMENT}`}
                      sx={{ mt: 2, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper', borderRadius: 'var(--radius-field)' } }}
                    />
                    <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button variant="ghost" disabled={saving} onClick={() => setSelected(null)}>Ahora no</Button>
                      <Button isLoading={saving} leftIcon={<Send className="size-4" />} onClick={() => void submit(row)}>Publicar opinión</Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReviewsPage;
