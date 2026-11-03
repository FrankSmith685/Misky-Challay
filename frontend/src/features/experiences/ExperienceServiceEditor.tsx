import { Checkbox, FormControlLabel, MenuItem, TextField } from '@mui/material';
import { Clock3, CreditCard, Package, Save, Settings2, ShieldCheck } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { FormGrid } from '@components/ui/FormSection';
import { ExperiencePanel, ExperienceStatus } from './ExperienceUI';
import type { ExperiencePackage, ExperienceTemplate } from './experiences.service';

export function ExperienceServiceEditor({
  value,
  templates,
  onChange,
  onSave,
  editable,
  busy,
}: {
  value: ExperiencePackage;
  templates: ExperienceTemplate[];
  onChange: (value: ExperiencePackage) => void;
  onSave: () => void;
  editable: boolean;
  busy: boolean;
}) {
  const field = <K extends keyof ExperiencePackage>(key: K, next: ExperiencePackage[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <ExperiencePanel
      icon={Package}
      title={value.id ? 'Configuración del servicio' : 'Nuevo servicio'}
      description="Define lo que recibirá el cliente y las condiciones de entrega."
      action={<ExperienceStatus active={value.isActive} />}
    >
      <fieldset disabled={busy} className="exp-service-fields grid min-w-0 gap-6">
        <FormGrid>
          <TextField
            label="Nombre"
            value={value.name}
            disabled={!editable}
            onChange={(e) => field('name', e.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            label="Tipo de experiencia"
            value={value.mode}
            disabled={!editable}
            onChange={(e) => field('mode', e.target.value as 'AR' | 'VIDEO')}
          >
            <MenuItem value="AR">Realidad aumentada</MenuItem>
            <MenuItem value="VIDEO">Video</MenuItem>
          </TextField>
        </FormGrid>
        <TextField
          fullWidth
          label="Qué incluye"
          multiline
          minRows={3}
          value={value.description}
          disabled={!editable}
          slotProps={{ htmlInput: { maxLength: 600 } }}
          onChange={(e) => field('description', e.target.value)}
          helperText="Este alcance aparece en el checkout y se conserva con la compra."
        />
        <div className="exp-editor-section">
          <div className="exp-editor-section__title">
            <span className="exp-icon">
              <CreditCard size={17} />
            </span>
            <div>
              <h4 className="text-sm font-bold">Precio y disponibilidad</h4>
              <p className="mt-1 text-xs text-ink-muted">
                Importe final del adicional, incluido el IGV.
              </p>
            </div>
          </div>
          <FormGrid>
            <TextField
              label="Precio (S/)"
              type="number"
              value={value.price}
              disabled={!editable}
              slotProps={{ htmlInput: { min: 0, max: 10000, step: 0.01 } }}
              onChange={(e) => field('price', Number(e.target.value))}
              helperText="Configura un precio mayor a cero para ofrecerlo."
            />
            <TextField
              select
              label="Pago requerido para publicar"
              value={value.paymentRequirement}
              disabled={!editable}
              onChange={(e) => field('paymentRequirement', e.target.value as 'FULL' | 'DEPOSIT')}
            >
              <MenuItem value="FULL">Pago total verificado</MenuItem>
              <MenuItem value="DEPOSIT">Anticipo verificado</MenuItem>
            </TextField>
          </FormGrid>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-field border border-line bg-surface-muted px-4 py-2">
            <div>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={value.isActive}
                    disabled={!editable}
                    onChange={(e) => field('isActive', e.target.checked)}
                  />
                }
                label={<span className="text-sm font-semibold">Ofrecer en el checkout</span>}
              />
              <p className="mb-2 ml-8 text-xs text-ink-muted">
                {value.isActive
                  ? 'El cliente podrá añadirlo al finalizar su compra.'
                  : 'Se conserva como borrador hasta que lo actives.'}
              </p>
            </div>
          </div>
        </div>
        <div className="exp-editor-section">
          <div className="exp-editor-section__title">
            <span className="exp-icon">
              <Clock3 size={17} />
            </span>
            <div>
              <h4 className="text-sm font-bold">Entrega y acompañamiento</h4>
              <p className="mt-1 text-xs text-ink-muted">
                Alinea las expectativas antes de recibir el pedido.
              </p>
            </div>
          </div>
          <FormGrid minColumnWidth={175}>
            {(
              [
                ['validityDays', 'Vigencia (días)', 'Desde la fecha de publicación.'],
                [
                  'revisionsIncluded',
                  'Revisiones incluidas',
                  'Cambios que puede solicitar el cliente.',
                ],
                ['minLeadHours', 'Anticipación (horas)', 'Tiempo mínimo antes de la entrega.'],
              ] as const
            ).map(([key, label, helper]) => (
              <TextField
                key={key}
                label={label}
                type="number"
                value={value[key]}
                disabled={!editable}
                slotProps={{ htmlInput: { min: key === 'validityDays' ? 1 : 0, step: 1 } }}
                onChange={(e) => field(key, Number(e.target.value))}
                helperText={helper}
              />
            ))}
          </FormGrid>
        </div>
        <details className="exp-settings">
          <summary>
            <Settings2 size={15} />
            Plantilla y orden de presentación
          </summary>
          <div className="pt-5">
            <FormGrid>
              <TextField
                select
                label="Plantilla inicial"
                value={value.templateId ?? ''}
                disabled={!editable}
                onChange={(e) =>
                  field('templateId', e.target.value ? Number(e.target.value) : null)
                }
              >
                <MenuItem value="">Sin plantilla</MenuItem>
                {templates
                  .filter((t) => t.isActive || t.id === value.templateId)
                  .map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name}
                      {!t.isActive ? ' (inactiva)' : ''}
                    </MenuItem>
                  ))}
              </TextField>
              <TextField
                label="Orden"
                type="number"
                value={value.sortOrder}
                disabled={!editable}
                slotProps={{ htmlInput: { min: 0, step: 1 } }}
                onChange={(e) => field('sortOrder', Number(e.target.value))}
              />
            </FormGrid>
          </div>
        </details>
        <div className="flex items-start gap-2 rounded-field border border-brand-100 bg-brand-50 p-3 text-xs leading-relaxed text-brand-800">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <p>
            Las condiciones actualizadas se aplican a compras nuevas. Los pedidos existentes
            conservan el precio y el alcance contratados.
          </p>
        </div>
      </fieldset>
      {editable && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
          <Button leftIcon={<Save size={16} />} isLoading={busy} onClick={onSave}>
            Guardar servicio
          </Button>
        </div>
      )}
    </ExperiencePanel>
  );
}
