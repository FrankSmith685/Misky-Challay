import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, LoaderCircle } from 'lucide-react';
import type { DeliverySlot } from '../types';

const zone = 'America/Lima';
const datesPerPage = 7;
const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: zone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dayKey = (value: string) => {
  const parts = dateParts.formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const dateFromKey = (key: string) => new Date(`${key}T12:00:00Z`);
const weekdayLabel = (key: string) => new Intl.DateTimeFormat('es-PE', {
  weekday: 'short',
  timeZone: 'UTC',
}).format(dateFromKey(key)).replace('.', '');
const monthLabel = (key: string) => new Intl.DateTimeFormat('es-PE', {
  month: 'short',
  timeZone: 'UTC',
}).format(dateFromKey(key)).replace('.', '');
const fullDateLabel = (key: string) => new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
}).format(dateFromKey(key));
const timeLabel = (value: string) => new Intl.DateTimeFormat('es-PE', {
  timeZone: zone,
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value));

interface DeliverySlotCalendarProps {
  id: string;
  slots: DeliverySlot[];
  value: number | null;
  onChange: (id: number) => void;
  disabled?: boolean;
  loading?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
  error?: string;
  hint?: string;
  emptyMessage?: string;
}

export const DeliverySlotCalendar = ({
  id,
  slots,
  value,
  onChange,
  disabled = false,
  loading = false,
  loadError = false,
  onRetry,
  error,
  hint,
  emptyMessage,
}: DeliverySlotCalendarProps) => {
  const available = useMemo(() => slots.filter((slot) => slot.available > 0), [slots]);
  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, DeliverySlot[]>();
    for (const slot of available) {
      const key = dayKey(slot.startsAt);
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    }
    for (const daySlots of grouped.values()) {
      daySlots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return grouped;
  }, [available]);
  const dates = useMemo(() => [...slotsByDay.keys()].sort(), [slotsByDay]);
  const selected = available.find((slot) => slot.id === value);
  const selectedDay = selected ? dayKey(selected.startsAt) : null;
  const [day, setDay] = useState<string | null>(() => selectedDay ?? dates[0] ?? null);

  useEffect(() => {
    setDay((current) => current && dates.includes(current) ? current : dates[0] ?? null);
  }, [dates]);

  useEffect(() => {
    if (selectedDay) setDay(selectedDay);
  }, [selectedDay]);

  const viewedDay = day && dates.includes(day) ? day : selectedDay ?? dates[0] ?? null;
  const dayIndex = Math.max(0, dates.indexOf(viewedDay ?? ''));
  const pageStart = Math.floor(dayIndex / datesPerPage) * datesPerPage;
  const visibleDates = dates.slice(pageStart, pageStart + datesPerPage);
  const daySlots = viewedDay ? slotsByDay.get(viewedDay) ?? [] : [];

  return (
    <div id={id} role="group" aria-label="Fechas y horarios de entrega" aria-busy={loading} className="rounded-card border border-brand-100 bg-brand-50/35 p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-700">Entrega programada</p>
          <h3 className="mt-1 text-base font-black text-ink">Elige fecha y horario</h3>
          <p className="mt-1 text-xs leading-5 text-ink-muted">Solo aparecen días con horarios disponibles.</p>
        </div>
        {dates.length > 0 && (
          <span className="rounded-pill border border-brand-100 bg-white px-3 py-1.5 text-xs font-semibold text-brand-800">
            {dates.length} {dates.length === 1 ? 'fecha disponible' : 'fechas disponibles'}
          </span>
        )}
      </div>

      {loading ? (
        <div role="status" className="flex items-center gap-3 rounded-card border border-line bg-white p-4 text-sm text-ink-muted">
          <LoaderCircle className="size-5 shrink-0 animate-spin text-brand-700" />
          Buscando fechas y horarios con cupo…
        </div>
      ) : loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-700" />
            <div>
              <p className="text-sm font-bold text-ink">No pudimos cargar los horarios</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">Comprueba tu conexión y vuelve a intentarlo.</p>
            </div>
          </div>
          {onRetry && <button type="button" onClick={onRetry} className="min-h-10 rounded-field border border-brand-200 bg-white px-3 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50">Reintentar</button>}
        </div>
      ) : dates.length === 0 ? (
        <div className="flex items-start gap-3 rounded-card border border-line bg-white p-4">
          <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-700" />
          <div>
            <p className="text-sm font-bold text-ink">No hay horarios con cupo por ahora</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">{emptyMessage || 'Prueba otro local o vuelve a consultar más tarde.'}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.78fr)]">
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-ink">1. Fecha de entrega</p>
              {dates.length > datesPerPage && (
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-[11px] text-ink-muted">{pageStart + 1}–{Math.min(pageStart + datesPerPage, dates.length)} de {dates.length}</span>
                  <button type="button" aria-label="Fechas anteriores" disabled={disabled || pageStart === 0} onClick={() => setDay(dates[pageStart - datesPerPage])} className="grid size-9 place-items-center rounded-field border border-line bg-white text-ink transition-colors hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="size-4" /></button>
                  <button type="button" aria-label="Fechas siguientes" disabled={disabled || pageStart + datesPerPage >= dates.length} onClick={() => setDay(dates[pageStart + datesPerPage])} className="grid size-9 place-items-center rounded-field border border-line bg-white text-ink transition-colors hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="size-4" /></button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {visibleDates.map((date) => {
                const isViewed = viewedDay === date;
                const isChosen = selectedDay === date;
                const count = slotsByDay.get(date)?.length ?? 0;
                return (
                  <button
                    key={date}
                    type="button"
                    aria-label={`Ver horarios del ${fullDateLabel(date)}`}
                    aria-pressed={isViewed}
                    disabled={disabled}
                    onClick={() => setDay(date)}
                    className={`relative flex min-h-[106px] min-w-[116px] flex-col items-start rounded-card border px-3.5 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-50 ${isViewed ? 'border-brand-700 bg-brand-700 text-white shadow-sm' : 'border-line bg-white text-ink hover:border-brand-400 hover:bg-brand-50'}`}
                  >
                    {isChosen && <Check className="absolute right-3 top-3 size-4" aria-hidden="true" />}
                    <span className={`text-[10px] font-extrabold uppercase tracking-[.12em] ${isViewed ? 'text-white/75' : 'text-ink-muted'}`}>{weekdayLabel(date)}</span>
                    <span className="mt-1 flex items-baseline gap-1.5"><strong className="text-2xl font-black leading-none">{Number(date.slice(-2))}</strong><span className="text-xs font-semibold capitalize">{monthLabel(date)}</span></span>
                    <span className={`mt-auto pt-2 text-[11px] ${isViewed ? 'text-white/85' : 'text-ink-muted'}`}>{count} {count === 1 ? 'horario' : 'horarios'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-card border border-brand-100 bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand-700"><Clock3 className="size-4" /> 2. Horario disponible</p>
            <p className="mt-1 text-sm font-bold capitalize text-ink">{viewedDay ? fullDateLabel(viewedDay) : 'Selecciona una fecha'}</p>
            <div className="mt-3 grid gap-2">
              {daySlots.map((slot) => {
                const isChosen = value === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    aria-pressed={isChosen}
                    disabled={disabled}
                    onClick={() => onChange(slot.id)}
                    className={`flex min-h-12 items-center justify-between gap-2 rounded-field border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-50 ${isChosen ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink hover:border-brand-400 hover:bg-brand-50/50'}`}
                  >
                    <span>{timeLabel(slot.startsAt)} – {timeLabel(slot.endsAt)}</span>
                    {isChosen && <Check className="size-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-muted" aria-live="polite">
              {selected && selectedDay === viewedDay ? 'Horario elegido para tu pedido.' : selected ? 'Tu horario anterior sigue guardado hasta que elijas otro.' : 'Elige una franja para continuar con tu pedido.'}
            </p>
          </div>
        </div>
      )}

      {hint && <p className="mt-4 text-xs leading-5 text-ink-muted">{hint}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
    </div>
  );
};
