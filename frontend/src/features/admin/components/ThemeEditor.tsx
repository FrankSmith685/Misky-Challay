import { useEffect, useState, type FC } from 'react';
import { Alert, Button, Card, CardContent, Chip, Slider, TextField, Typography } from '@mui/material';
import { RotateCcw, Save } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { useThemeSettings } from '@/theme/ThemeSettingsProvider';
import { RADIUS_RANGE, type ThemeTokens } from '@/theme/tokens';
import { isHex, readableText } from '@/theme/colorUtils';

/* -------------------------------------------------------------------------- */
/* Control de un color individual (picker nativo + hex editable)              */
/* -------------------------------------------------------------------------- */
const ColorControl: FC<{
  label: string;
  help: string;
  value: string;
  onChange: (hex: string) => void;
}> = ({ label, help, value, onChange }) => {
  const [text, setText] = useState(value);

  // Refleja cambios externos (p.ej. "Restablecer") sin pisar lo que se escribe.
  useEffect(() => setText(value), [value]);

  const commit = (raw: string) => {
    setText(raw);
    if (isHex(raw)) onChange(raw.startsWith('#') ? raw : `#${raw}`);
  };

  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
      <label className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-field border border-line">
        <span className="block size-full" style={{ backgroundColor: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label={`Elegir ${label}`}
        />
      </label>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="truncate text-xs text-ink-muted">{help}</p>
      </div>
      <TextField
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setText(value)}
        size="small"
        sx={{ width: 108, '& input': { fontFamily: 'monospace', textTransform: 'uppercase' } }}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Editor de tema                                                             */
/* -------------------------------------------------------------------------- */
const COLOR_FIELDS: Array<{ key: keyof ThemeTokens; label: string; help: string }> = [
  { key: 'primary', label: 'Color principal', help: 'Rosa profundo para botones, enlaces y acciones.' },
  { key: 'secondary', label: 'Caramelo de acento', help: 'Destacados y llamadas secundarias.' },
  { key: 'tertiary', label: 'Verde de apoyo', help: 'Detalles de la identidad de pastelería.' },
];

export const ThemeEditor: FC = () => {
  const { tokens, setToken, reset, isCustomized } = useThemeSettings();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Controles */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Colores del tema</p>
          <Button
            size="small"
            color="inherit"
            startIcon={<RotateCcw className="size-3.5" />}
            disabled={!isCustomized}
            onClick={() => {
              reset();
              toast.success('Tema restablecido');
            }}
          >
            Restablecer
          </Button>
        </div>

        {COLOR_FIELDS.map((field) => (
          <ColorControl
            key={field.key}
            label={field.label}
            help={field.help}
            value={tokens[field.key] as string}
            onChange={(hex) => setToken(field.key, hex)}
          />
        ))}

        <div className="rounded-card border border-line bg-surface p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Radio de bordes</p>
            <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-ink-muted">{tokens.radius}px</code>
          </div>
          <Slider
            value={tokens.radius}
            min={RADIUS_RANGE.min}
            max={RADIUS_RANGE.max}
            step={1}
            valueLabelDisplay="auto"
            onChange={(_, v) => setToken('radius', v as number)}
          />
        </div>

        {/* El radio sale del token, no de un 5 escrito a mano: este editor es
            justamente el que lo mueve, y un literal aqui no reaccionaria. */}
        <Alert severity="info" icon={<Save className="size-4" />} sx={{ borderRadius: 'var(--radius-card)' }}>
          Los cambios se aplican al instante y se guardan en este navegador. Toca{' '}
          <strong>Restablecer</strong> para volver a la marca original.
        </Alert>
      </div>

      {/* Vista previa en vivo */}
      <div className="grid gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Vista previa en vivo</p>
        <Card variant="outlined">
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="contained">Principal</Button>
              <Button variant="contained" color="secondary">
                Acento
              </Button>
              <Button variant="contained" color="tertiary">
                Apoyo
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outlined">Principal</Button>
              <Button variant="outlined" color="secondary">
                Acento
              </Button>
              <Button variant="outlined" color="tertiary">
                Apoyo
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip label="Principal" color="primary" />
              <Chip label="Acento" color="secondary" />
              <Chip label="Apoyo" color="tertiary" />
            </div>
            <TextField label="Campo de ejemplo" defaultValue="Escribe aqui" fullWidth />
            <Typography variant="body2" color="text.secondary">
              Botones, chips, campos y tarjetas cambian de color y radio a la vez.
            </Typography>
          </CardContent>
        </Card>

        {/* Muestra la cromatica de Tailwind reaccionando (clases de marca). */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-card bg-brand-600 px-3 py-4 text-center text-xs font-medium text-white">brand-600</div>
          <div className="rounded-card bg-accent-500 px-3 py-4 text-center text-xs font-medium" style={{ color: readableText(tokens.secondary) }}>accent-500</div>
          <div className="rounded-card bg-tertiary-600 px-3 py-4 text-center text-xs font-medium" style={{ color: readableText(tokens.tertiary) }}>
            tertiary-600
          </div>
        </div>
      </div>
    </div>
  );
};
