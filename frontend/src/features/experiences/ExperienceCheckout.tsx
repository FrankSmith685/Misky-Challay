import { useEffect, useState } from 'react';
import { MenuItem, TextField } from '@mui/material';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, Play, QrCode, Sparkles } from 'lucide-react';
import { Alert } from '@components/ui/Alert';
import './experiences.css';
import { FormSection } from '@components/ui/FormSection';
import { Button } from '@components/ui/Button';
import { formatCurrency } from '@lib/format';
import { experiencesApi, type ExperiencePackage } from './experiences.service';
import type { CheckoutInput } from '../checkout/types';

export function ExperienceCheckout({
  value,
  onChange,
}: {
  value: CheckoutInput['experience'];
  onChange: (value: CheckoutInput['experience']) => void;
}) {
  const [packages, setPackages] = useState<ExperiencePackage[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void experiencesApi
      .packages()
      .then((p) => {
        if (active) setPackages(p);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!packages.length && !value) return null;
  const selected = packages.find((p) => p.id === value?.packageId);
  return (
    <FormSection
      id="checkout-experience"
      icon={Sparkles}
      title="Añade una experiencia con QR (opcional)"
      description="Un detalle digital creado por nuestro equipo para acompañar tu celebración."
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3 rounded-field border border-line bg-surface-muted p-3">
          <img
            src="/experiences/demo-poster.svg"
            alt="Ejemplo del saludo personalizado"
            className="hidden w-24 rounded-field sm:block"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink">Más que una tarjeta</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Un saludo, una dedicatoria y un recuerdo para compartir.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            component={Link}
            to="/experiencias/demo"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ver demostración QR"
            className="w-full sm:w-auto"
          >
            Ver demostración QR
            <ArrowUpRight size={13} className="ml-1" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            component={Link}
            to="/experiencias/demo-video"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ver demostración de video horizontal"
            className="w-full sm:w-auto"
          >
            Ver demo de video
            <Play size={13} className="ml-1" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            component={Link}
            to="/experiencias/renzo-qr"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ver QR del artefacto interactivo de Renzo"
            className="w-full sm:w-auto"
          >
            Ver QR del artefacto
            <QrCode size={13} className="ml-1" />
          </Button>
        </div>
        <TextField
          select
          label="Experiencia digital"
          value={value?.packageId ?? ''}
          onChange={(e) => {
            const pack = packages.find((p) => p.id === Number(e.target.value));
            onChange(
              pack
                ? { packageId: pack.id, expectedVersion: pack.version, brief: value?.brief ?? '' }
                : undefined,
            );
          }}
        >
          <MenuItem value="">Sin adicional digital</MenuItem>
          {packages.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name} · {formatCurrency(p.price)}
            </MenuItem>
          ))}
          {value && !selected && (
            <MenuItem value={value.packageId}>Servicio no disponible</MenuItem>
          )}
        </TextField>
        {selected && (
          <>
            <div className="rounded-field border border-brand-100 bg-brand-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand-800">{selected.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {selected.description}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-lg font-extrabold text-brand-800">
                    {formatCurrency(selected.price)}
                  </span>
                  <span className="text-[10px] text-ink-muted">por pedido</span>
                </div>
              </div>
            </div>
            <dl className="exp-detail-grid">
              <div>
                <dt>Tiempo de acceso</dt>
                <dd>{selected.validityDays} días</dd>
              </div>
              <div>
                <dt>Cambios incluidos</dt>
                <dd>
                  {selected.revisionsIncluded}{' '}
                  {selected.revisionsIncluded === 1 ? 'revisión' : 'revisiones'}
                </dd>
              </div>
              <div>
                <dt>Anticipación mínima</dt>
                <dd>{selected.minLeadHours} horas</dd>
              </div>
            </dl>
            <TextField
              label="Cuéntanos tu idea y dedicatoria"
              multiline
              minRows={3}
              value={value?.brief ?? ''}
              error={Boolean(value?.brief && value.brief.trim().length < 10)}
              slotProps={{ htmlInput: { maxLength: 1500 } }}
              onChange={(e) =>
                onChange({
                  packageId: selected.id,
                  expectedVersion: selected.version,
                  brief: e.target.value,
                })
              }
              helperText="Mínimo 10 caracteres. Recibirás la propuesta para aprobarla desde Mis pedidos."
            />
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand-600" />
              El equipo publica la versión que apruebes después de verificar el{' '}
              {selected.paymentRequirement === 'FULL' ? 'pago total' : 'anticipo'}. El acceso dura{' '}
              {selected.validityDays} días desde su publicación.
            </p>
          </>
        )}
        {error && (
          <Alert variant="danger">
            No se pudieron cargar los servicios. Quita el adicional o actualiza para volver a
            intentarlo.
          </Alert>
        )}
      </div>
    </FormSection>
  );
}
