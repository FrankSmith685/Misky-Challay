import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Rating, TextField } from '@mui/material';
import { BadgeCheck, CheckCheck, ChevronRight, MessageSquareText, Pencil, Send, ShoppingBag, Star } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { ProductMedia } from '@components/ui/ProductMedia';
import { Skeleton } from '@components/ui/Skeleton';
import { useLiveRefresh } from '@services/realtime';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import { reviewsApi } from '../services/reviews.service';
import type { MyReview, PendingReview } from '../types';

const MAX_COMMENT = 800;
const RATING_LABEL: Record<number, string> = {
  1: 'Muy malo', 2: 'Malo', 3: 'Regular', 4: 'Bueno', 5: 'Excelente',
};

const ReviewsPage = () => {
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [published, setPublished] = useState<MyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingRows, reviewRows] = await Promise.all([reviewsApi.pending(), reviewsApi.mine()]);
      setPending(pendingRows);
      setPublished(reviewRows.filter((review) => review.status === 'PUBLISHED'));
    } catch (reason) {
      setError(getApiErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['orders', 'reviews'], load);

  const openPending = (row: PendingReview) => {
    setSelected(row.orderItemId);
    setRating(5);
    setComment('');
  };

  const submitPending = async (row: PendingReview) => {
    setSaving(true);
    try {
      await reviewsApi.create(row.orderItemId, rating, comment);
      await load();
      setSelected(null);
      toast.success('Publicamos tu opinión como compra verificada.');
    } catch (reason) {
      toast.error(getApiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (review: MyReview) => {
    setEditing(review.id);
    setEditRating(review.rating);
    setEditComment(review.comment ?? '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await reviewsApi.update(editing, editRating, editComment);
      setPublished((current) => current.map((review) => review.id === editing ? { ...review, rating: editRating, comment: editComment.trim() || null } : review));
      setEditing(null);
      toast.success('Actualizamos tu opinión.');
    } catch (reason) {
      toast.error(getApiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <PageHeader
      eyebrow="Compras verificadas"
      icon={Star}
      title="Mis opiniones"
      description="Comparte tu experiencia después de recibir un pedido y revisa lo que ya publicaste."
      action={<Button component={Link} to={ROUTES.accountOrders} variant="outline" leftIcon={<ShoppingBag className="size-4" />}>Ver mis pedidos</Button>}
      className="mb-6"
    />
  );

  if (loading) {
    return <div>{header}<div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24 rounded-card" /><Skeleton className="h-24 rounded-card" /><Skeleton className="h-24 rounded-card" /></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Skeleton className="h-52 rounded-card" /><Skeleton className="h-52 rounded-card" /></div></div>;
  }

  if (error) {
    return <div>{header}<EmptyState icon={MessageSquareText} title="No pudimos cargar tus opiniones" description={error} action={<Button onClick={() => void load()}>Reintentar</Button>} /></div>;
  }

  return (
    <div>
      {header}

      <section className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Resumen de opiniones">
        <div className="rounded-card border border-brand-100 bg-brand-50/65 p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-brand-700">Pendientes</p><p className="mt-2 text-2xl font-black text-ink">{pending.length}</p><p className="mt-1 text-xs text-ink-muted">Productos listos para calificar</p></div>
        <div className="rounded-card border border-line bg-white p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-ink-muted">Publicadas</p><p className="mt-2 text-2xl font-black text-ink">{published.length}</p><p className="mt-1 text-xs text-ink-muted">Opiniones en tu historial</p></div>
        <div className="rounded-card border border-line bg-white p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-ink-muted">Regla de confianza</p><p className="mt-2 flex items-center gap-2 text-sm font-black text-ink"><BadgeCheck className="size-4 text-brand-700" /> Compra verificada</p><p className="mt-1 text-xs text-ink-muted">Solo después de una entrega real</p></div>
      </section>

      <section aria-labelledby="pending-reviews-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Después de recibir</p><h2 id="pending-reviews-title" className="mt-1 text-2xl font-black tracking-tight text-ink">Pendientes de publicar</h2></div>
          {pending.length > 0 && <span className="rounded-pill bg-brand-100 px-3 py-1 text-xs font-black text-brand-800">{pending.length} {pending.length === 1 ? 'producto' : 'productos'}</span>}
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-col gap-4 rounded-card border border-dashed border-brand-200 bg-brand-50/45 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-card bg-white text-brand-700 shadow-sm"><CheckCheck className="size-5" /></span><div><p className="font-extrabold text-ink">Estás al día</p><p className="mt-1 text-sm leading-6 text-ink-muted">Cuando recibas otro pedido, aparecerá aquí para que compartas tu experiencia.</p></div></div>
            <Button component={Link} to={ROUTES.accountOrders} variant="outline" size="sm">Revisar pedidos <ChevronRight className="size-4" /></Button>
          </div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {pending.map((row) => {
              const active = selected === row.orderItemId;
              return <article key={row.orderItemId} className={`overflow-hidden rounded-card border bg-white shadow-e2 ${active ? 'border-brand-400' : 'border-line'}`}>
                <div className="flex gap-4 p-4 sm:p-5"><ProductMedia src={row.imageUrl} alt={row.productName} className="size-24 shrink-0 rounded-card sm:size-28" /><div className="min-w-0 flex-1"><h3 className="text-lg font-black text-ink">{row.productName}</h3><p className="mt-1 text-xs text-ink-muted">Pedido {row.orderNumber}</p><p className="mt-1 text-xs font-bold text-brand-700">{row.deliveredAt ? `Entregado el ${new Date(row.deliveredAt).toLocaleDateString('es-PE')}` : 'Pedido entregado'}</p>{!active && <Button size="sm" className="mt-4" leftIcon={<Star className="size-4" />} onClick={() => openPending(row)}>Calificar</Button>}</div></div>
                {active && <div className="border-t border-line bg-surface-muted p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-extrabold text-ink">¿Cuántas estrellas le das?</p><p className="text-xs font-bold text-brand-700">{RATING_LABEL[rating]}</p></div><Rating value={rating} size="large" onChange={(_, value) => setRating(value ?? 1)} /></div><TextField multiline minRows={4} fullWidth value={comment} onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT))} placeholder="Cuéntanos qué te gustó (opcional)" helperText={`${comment.length}/${MAX_COMMENT}`} sx={{ mt: 2, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper', borderRadius: 'var(--radius-field)' } }} /><div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" disabled={saving} onClick={() => setSelected(null)}>Ahora no</Button><Button isLoading={saving} leftIcon={<Send className="size-4" />} onClick={() => void submitPending(row)}>Publicar opinión</Button></div></div>}
              </article>;
            })}
          </div>
        )}
      </section>

      <section className="mt-10 border-t border-line pt-8" aria-labelledby="published-reviews-title">
        <div className="mb-4"><p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Tu historial</p><h2 id="published-reviews-title" className="mt-1 text-2xl font-black tracking-tight text-ink">Opiniones publicadas</h2></div>
        {published.length === 0 ? <div className="rounded-card border border-line bg-surface-muted/45 p-5 text-sm leading-6 text-ink-muted">Todavía no has publicado una opinión. Cuando califiques un producto, podrás volver a verla y editarla desde aquí.</div> : <div className="grid gap-4 md:grid-cols-2">{published.map((review) => <article key={review.id} className="rounded-card border border-line bg-white p-5 shadow-e1"><div className="flex gap-3"><ProductMedia src={review.imageUrl} alt={review.productName} className="size-16 shrink-0 rounded-card" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-black text-ink">{review.productName}</h3><p className="mt-1 text-xs text-ink-muted">{review.orderNumber ? `Pedido ${review.orderNumber} · ` : ''}{new Date(review.createdAt).toLocaleDateString('es-PE')}</p></div><span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-brand-700"><BadgeCheck className="size-4" /> Verificada</span></div><div className="mt-3 flex items-center gap-2"><div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`size-4 ${star <= review.rating ? 'fill-amber-400 text-amber-500' : 'text-line'}`} />)}</div><span className="text-xs font-bold text-ink-muted">{RATING_LABEL[review.rating]}</span></div></div></div>{editing === review.id ? <div className="mt-4 border-t border-line pt-4"><Rating value={editRating} onChange={(_, value) => setEditRating(value ?? 1)} /><TextField multiline minRows={3} fullWidth value={editComment} onChange={(event) => setEditComment(event.target.value.slice(0, MAX_COMMENT))} helperText={`${editComment.length}/${MAX_COMMENT}`} sx={{ mt: 2, '& .MuiOutlinedInput-root': { borderRadius: 'var(--radius-field)' } }} /><div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(null)}>Cancelar</Button><Button size="sm" isLoading={saving} onClick={() => void saveEdit()}>Guardar cambios</Button></div></div> : <><p className="mt-4 border-t border-line pt-4 text-sm leading-6 text-ink">{review.comment || 'Calificaste este producto sin comentario.'}</p><Button size="sm" variant="ghost" className="mt-3" leftIcon={<Pencil className="size-3.5" />} onClick={() => openEdit(review)}>Editar opinión</Button></>}</article>)}</div>}
      </section>
    </div>
  );
};

export default ReviewsPage;
