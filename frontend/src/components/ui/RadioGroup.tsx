import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import MuiRadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  className?: string;
  label?: string;
  row?: boolean;
  disabled?: boolean;
}

/** Grupo excluyente personalizado sobre RadioGroup de MUI. */
export const RadioGroup = ({
  name,
  value,
  onChange,
  options,
  className,
  label,
  row = false,
  disabled = false,
}: RadioGroupProps) => (
  <FormControl className={className} component="fieldset" fullWidth disabled={disabled}>
    {label && <FormLabel component="legend">{label}</FormLabel>}
    <MuiRadioGroup
      name={name}
      value={value}
      row={row}
      onChange={(_, nextValue) => onChange(nextValue)}
      sx={{ gap: row ? 1 : 1.25 }}
    >
      {options.map((option) => (
        <FormControlLabel
          key={option.value}
          value={option.value}
          control={<Radio />}
          sx={{
            alignItems: 'flex-start',
            m: 0,
            px: 1.25,
            py: .75,
            border: '1px solid',
            borderColor: value === option.value ? 'primary.main' : 'divider',
            bgcolor: value === option.value ? 'action.hover' : 'background.paper',
            flex: row ? '1 1 180px' : undefined,
            '& .MuiRadio-root': { mt: -.5, ml: -.5 },
          }}
          label={
            <>
              <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 700 }}>
                {option.label}
              </Typography>
              {option.description && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: .25 }}>
                  {option.description}
                </Typography>
              )}
            </>
          }
        />
      ))}
    </MuiRadioGroup>
  </FormControl>
);
