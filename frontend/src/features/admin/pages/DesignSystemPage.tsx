import { useEffect, useState, type FC, type MouseEvent } from 'react';
import {
  Autocomplete,
  Avatar,
  AvatarGroup,
  Box,
  Breadcrumbs,
  Button,
  ButtonGroup,
  CircularProgress,
  Divider,
  Fab,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link as MuiLink,
  Menu,
  MenuItem,
  Paper,
  Radio,
  RadioGroup as MuiRadioGroup,
  Rating,
  Skeleton,
  Slider,
  Step,
  StepLabel,
  Stepper,
  Tab,
  Tabs,
  TextField,
  Typography,
  Accordion,
  AccordionDetails,
  AccordionSummary,
} from '@mui/material';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  Copy,
  Feather,
  Palette,
  Pencil,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Search,
  Sparkles,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { CodeBlock } from '@components/common/CodeBlock';
import {
  Alert as AppAlert,
  Badge as AppBadge,
  BUTTON_HEIGHT,
  Button as AppButton,
  Callout,
  Card as AppCard,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip as AppChip,
  Checkbox as AppCheckbox,
  Drawer as AppDrawer,
  FormActions,
  FormGrid,
  FormSection,
  FormStack,
  Input as AppInput,
  Modal as AppModal,
  Pagination as AppPagination,
  RadioGroup as AppRadioGroup,
  Select as AppSelect,
  SelectOption,
  Switch as AppSwitch,
  Table as AppTable,
  Tbody,
  Td,
  Textarea as AppTextarea,
  Th,
  Thead,
  Tooltip as AppTooltip,
  Tr,
} from '@components/ui';
import { cn } from '@lib/cn';
import { PageHeader } from '@components/common/PageHeader';
import { ComponentDoc, Label, SectionHeader } from '../designSystem/DocParts';
import { ThemeEditor } from '../components/ThemeEditor';
import { useThemeSettings } from '@/theme/ThemeSettingsProvider';
import { type ColorRamp } from '@/theme/colorUtils';
import { rampsFromTokens, SURFACE } from '@/theme/tokens';
import { getDoc } from '../designSystem/componentDocs';

/* ==========================================================================
 * FUNDAMENTOS
 * ========================================================================== */
const PRINCIPLES = [
  { icon: Boxes, title: 'Material, con tu marca', text: 'Componentes de MUI con un tema propio: azul brillante, amarillo sol y coral cálido, títulos editoriales y superficies limpias.' },
  { icon: Palette, title: 'Tema gestionable', text: 'El look sale de theme/. Desde la seccion Tema cambias primary, secondary o tertiary y se actualiza toda la app.' },
  { icon: ShieldCheck, title: 'Accesible', text: 'MUI trae foco, teclado y ARIA de fabrica en dialogos, menus y formularios.' },
  { icon: Feather, title: 'Consistente', text: 'Mismos colores, radios y tipografia que el resto de la app.' },
];

const IntroSection: FC = () => (
  <div>
    <SectionHeader
      title="Introduccion"
      description="Los componentes de la interfaz de Misky Challay, sobre Material UI con un tema de marca gestionable."
    />
    <div className="grid gap-4 sm:grid-cols-2">
      {PRINCIPLES.map(({ icon: Icon, title, text }) => (
        <AppCard key={title}>
          <Icon className="mb-2 size-6 text-brand-600" />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {text}
          </Typography>
        </AppCard>
      ))}
    </div>

    <h3 className="mb-2 mt-8 text-base font-semibold text-ink">Como leer esta documentacion</h3>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      Cada componente muestra: sobre que esta construido, para que sirve, cuando usarlo, una vista previa
      en vivo, el codigo para copiar y una tabla con sus props principales. Fijate en la etiqueta de
      importacion: <strong>@components/ui</strong> es el componente propio de Misky Challay (API del proyecto)
      y <strong>@mui/material</strong> es el de Material UI sin envolver. Si existe la version propia,
      usala: es la que respeta el tema, la escala de alturas y los estados del producto.
    </Typography>
    <CodeBlock code={`import { Badge, Button } from '@components/ui';\n\n<Button variant="danger" isLoading>Cancelar pedido</Button>\n<Badge variant="success">Activo</Badge>`} />

    <AppAlert variant="info" title="Seccion gestionable" className="mt-8">
      Esta documentacion se controla con el permiso <strong>settings.manage</strong>. Desde Roles y
      permisos decides que roles la ven; el superadmin siempre entra.
    </AppAlert>
  </div>
);

/* ==========================================================================
 * TEMA (editor gestionable)
 * ========================================================================== */
const ThemeSection: FC = () => (
  <div>
    <SectionHeader
      title="Tema"
      description="Edita un borrador del tema, valida contraste, previsualiza cambios y publícalos con versión y auditoría para toda la aplicación."
    />
    <ThemeEditor />
  </div>
);

/* ==========================================================================
 * COLORES (reflejan los tokens vivos del tema)
 * ========================================================================== */
const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

const NEUTRALS = [
  { token: 'surface', hex: SURFACE.base },
  { token: 'surface-muted', hex: SURFACE.muted },
  { token: 'line', hex: SURFACE.line },
  { token: 'ink-muted', hex: SURFACE.inkMuted },
  { token: 'ink', hex: SURFACE.ink },
];

const rampToSwatches = (name: string, ramp: ColorRamp) =>
  STOPS.map((stop) => ({ token: `${name}-${stop}`, hex: ramp[stop] }));

const Swatch = ({ token, hex }: { token: string; hex: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      toast.success(`${hex} copiado`);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // portapapeles bloqueado
    }
  };
  return (
    <button type="button" onClick={copy} className="group w-full text-left" title={`Copiar ${hex}`}>
      <div
        className="relative h-16 w-full overflow-hidden rounded-card border border-line transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-e2"
        style={{ backgroundColor: hex }}
      >
        <span className="absolute right-1 top-1 rounded bg-surface/80 p-1 text-ink opacity-0 transition-opacity group-hover:opacity-100">
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </span>
      </div>
      <p className="mt-1.5 text-xs font-medium text-ink">{token}</p>
      <p className="text-[11px] uppercase text-ink-muted">{hex}</p>
    </button>
  );
};

const ColorsSection: FC = () => {
  const { tokens } = useThemeSettings();
  /* Misma fuente que alimenta las variables CSS de Tailwind (applyCssVars) y las
   * paletas de MUI (buildTheme). La rampa de acento se construia aqui a mano con
   * DOS paradas dentro de una rejilla dimensionada para diez, y el hex que
   * publicaba (#eca73a) no existe en el producto: el accent-400 real es #ff9f37.
   * Como el Swatch copia al portapapeles, el color inventado se propagaba a quien
   * lo pegara. */
  const ramps = rampsFromTokens(tokens);

  return (
    <div>
      <SectionHeader
        title="Colores"
        description="Reflejan el tema actual: marca (primary), acento (secondary) y el tercer color (tertiary). Cambia en Tema y esto se actualiza. Toca un color para copiar su hex."
      />
      <div className="grid gap-6">
        <div>
          <Label>Marca (brand / primary)</Label>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {rampToSwatches('brand', ramps.brand).map((color) => (
              <Swatch key={color.token} {...color} />
            ))}
          </div>
        </div>
        <div>
          <Label>Acento (accent / secondary)</Label>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {rampToSwatches('accent', ramps.accent).map((color) => (
              <Swatch key={color.token} {...color} />
            ))}
          </div>
        </div>
        <div>
          <Label>Tercer color (tertiary)</Label>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {rampToSwatches('tertiary', ramps.tertiary).map((color) => (
              <Swatch key={color.token} {...color} />
            ))}
          </div>
        </div>
        <div>
          <Label>Peligro (error)</Label>
          <p className="-mt-1 mb-2 text-xs text-ink-muted">
            Colorea todos los avisos y badges destructivos. No es gestionable: el rojo de alerta no debe
            moverse con la marca.
          </p>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {rampToSwatches('error', ramps.error).map((color) => (
              <Swatch key={color.token} {...color} />
            ))}
          </div>
        </div>
        <div>
          <Label>Neutros</Label>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {NEUTRALS.map((color) => (
              <Swatch key={color.token} {...color} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
 * TIPOGRAFIA
 * ========================================================================== */
const TypographySection: FC = () => (
  <div>
    <SectionHeader
      title="Tipografia"
      description="Fuente Inter en toda la app y en el tema de MUI. Escala de titulos y cuerpo."
    />
    <ComponentDoc docId="typography" canvasClassName="flex-col items-stretch gap-2">
      <Typography variant="h3">Titulo h3</Typography>
      <Typography variant="h4">Titulo h4</Typography>
      <Typography variant="h6">Subtitulo h6</Typography>
      <Typography variant="body1">Cuerpo base (body1) en color de texto principal.</Typography>
      <Typography variant="body2" color="text.secondary">
        Texto secundario (body2).
      </Typography>
      <Typography variant="overline" color="text.secondary">
        Etiqueta (overline)
      </Typography>
    </ComponentDoc>
  </div>
);

/* ==========================================================================
 * BOTONES Y MENUS
 * ========================================================================== */
const ButtonsSection: FC = () => {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  return (
    <div>
      <SectionHeader title="Botones y menus" description="Acciones primarias, secundarias y menus." />
      <div className="grid gap-8">
        {/* La demo renderiza el Button DEL PROYECTO. Antes pintaba el de MUI con
            `variant="contained"`, una API que no existe en el producto, en un
            archivo que ya importaba `Button as AppButton`. */}
        <ComponentDoc
          docId="button"
          code={`import { Button } from '@components/ui';\n\n<Button>Guardar</Button>\n<Button variant="outline" size="lg">Cancelar</Button>\n<Button variant="danger" isLoading>Cancelando…</Button>\n<Button variant="ghost" leftIcon={<Plus className="size-4" />}>Añadir</Button>`}
        >
          <AppButton>Primary</AppButton>
          <AppButton variant="secondary">Secondary</AppButton>
          <AppButton variant="outline">Outline</AppButton>
          <AppButton variant="ghost">Ghost</AppButton>
          <AppButton variant="danger">Danger</AppButton>
          <AppButton leftIcon={<Sparkles className="size-4" />}>Con icono</AppButton>
          <AppButton isLoading>Cargando</AppButton>
          <AppButton disabled>Deshabilitado</AppButton>
          <div className="flex w-full flex-wrap items-center gap-3 border-t border-line pt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              BUTTON_HEIGHT · escala unica de alturas
            </span>
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <AppButton key={size} size={size} variant="outline">
                {size} · {BUTTON_HEIGHT[size]} px
              </AppButton>
            ))}
          </div>
        </ComponentDoc>

        <ComponentDoc docId="iconbutton">
          <IconButton color="primary">
            <Pencil className="size-5" />
          </IconButton>
          <IconButton color="secondary">
            <Pencil className="size-5" />
          </IconButton>
          <IconButton color="tertiary">
            <Pencil className="size-5" />
          </IconButton>
          <IconButton disabled>
            <Pencil className="size-5" />
          </IconButton>
        </ComponentDoc>

        <ComponentDoc docId="buttongroup">
          <ButtonGroup variant="outlined">
            <Button>Uno</Button>
            <Button>Dos</Button>
            <Button>Tres</Button>
          </ButtonGroup>
        </ComponentDoc>

        <ComponentDoc docId="fab">
          <Fab color="primary" size="small">
            <Plus className="size-5" />
          </Fab>
          <Fab color="secondary" size="medium">
            <Plus className="size-5" />
          </Fab>
          <Fab variant="extended" color="tertiary">
            <Plus className="mr-1 size-5" /> Nuevo
          </Fab>
        </ComponentDoc>

        <ComponentDoc docId="menu">
          <Button
            variant="outlined"
            endIcon={<ChevronDown className="size-4" />}
            onClick={(event: MouseEvent<HTMLButtonElement>) => setAnchor(event.currentTarget)}
          >
            Acciones
          </Button>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            <MenuItem onClick={() => setAnchor(null)}>Editar</MenuItem>
            <MenuItem onClick={() => setAnchor(null)}>Duplicar</MenuItem>
            <MenuItem onClick={() => setAnchor(null)} sx={{ color: 'error.main' }}>
              Eliminar
            </MenuItem>
          </Menu>
        </ComponentDoc>
      </div>
    </div>
  );
};

/* ==========================================================================
 * FORMULARIOS
 * ========================================================================== */
const FormsSection: FC = () => {
  const [delivery, setDelivery] = useState('delivery');
  const [notifications, setNotifications] = useState(true);

  return (
    <div>
      <SectionHeader
        title="Formularios"
        description="Componentes de producto sobre MUI, con una escala de espacio consistente y estados accesibles."
      />
      <AppAlert variant="info" title="Ritmo de formulario" className="mb-8">
        Usa <strong>FormStack</strong> para separar filas, <strong>FormGrid</strong> para campos relacionados
        y <strong>FormSection</strong> cuando el formulario tenga varios bloques.
      </AppAlert>
      <div className="grid gap-8">
        <ComponentDoc
          docId="textfield"
          name="Input"
          tag="@components/ui"
          description="Campo personalizado de Misky Challay construido sobre TextField de MUI."
          canvasClassName="items-stretch"
          code={`import { FormGrid, Input } from '@components/ui';\n\n<FormGrid>\n  <Input label="Nombre" hint="Como aparecerá en el sistema" />\n  <Input label="Correo" error="Ingresa un correo válido" />\n</FormGrid>`}
        >
          <FormGrid className="w-full">
            <AppInput label="Nombre" placeholder="Escribe aqui" hint="Como aparecera en el sistema" />
            <AppInput label="Email" error="Ingresa un email valido" defaultValue="valor" />
            <AppInput label="Clave" type="password" hint="Minimo 8 caracteres" />
            <AppInput label="Deshabilitado" value="No editable" disabled readOnly />
          </FormGrid>
        </ComponentDoc>

        <ComponentDoc
          docId="textarea"
          name="Textarea"
          tag="@components/ui"
          description="Area multilinea personalizada, ahora sobre TextField de MUI."
          canvasClassName="items-stretch"
        >
          <AppTextarea
            label="Notas"
            rows={4}
            hint="Incluye referencias que ayuden a completar la operacion."
            placeholder="Referencias del pedido..."
          />
        </ComponentDoc>

        <ComponentDoc
          docId="select"
          name="Select"
          tag="@components/ui"
          description="Selector compartido con altura, etiqueta, menu y errores consistentes."
          canvasClassName="items-stretch"
        >
          <AppSelect label="Sucursal" defaultValue="" sx={{ width: { xs: '100%', sm: 320 } }}>
            <SelectOption value="" disabled>Selecciona...</SelectOption>
            <SelectOption value="mira">Misky Challay Miraflores</SelectOption>
            <SelectOption value="isi">Misky Challay San Isidro</SelectOption>
          </AppSelect>
        </ComponentDoc>

        <ComponentDoc docId="checkbox" name="Checkbox" tag="@components/ui">
          <FormGroup sx={{ gap: 1 }}>
            <AppCheckbox defaultChecked label="Acepto los terminos" />
            <AppCheckbox label="Recibir novedades" />
          </FormGroup>
        </ComponentDoc>

        <ComponentDoc docId="radio" name="RadioGroup" tag="@components/ui" canvasClassName="items-stretch">
          <AppRadioGroup
            name="delivery-demo"
            label="Como deseas recibirlo?"
            value={delivery}
            onChange={setDelivery}
            options={[
              { value: 'delivery', label: 'Delivery', description: 'Lo llevamos a tu direccion.' },
              { value: 'pickup', label: 'Recojo', description: 'Recogelo en la cocina elegida.' },
            ]}
            row
          />
        </ComponentDoc>

        <ComponentDoc docId="switch" name="Switch" tag="@components/ui" canvasClassName="items-stretch">
          <AppSwitch
            checked={notifications}
            onChange={setNotifications}
            label="Notificaciones de pedidos"
            description="Recibe cambios de estado y avisos importantes."
          />
        </ComponentDoc>

      <ComponentDoc docId="formcontrol" description="Envoltura que agrupa etiqueta, control y texto de ayuda de un campo.">
        <FormControl>
          <FormLabel>Preferencia de contacto</FormLabel>
          <MuiRadioGroup row defaultValue="email">
            <FormControlLabel value="email" control={<Radio />} label="Email" />
            <FormControlLabel value="sms" control={<Radio />} label="SMS" />
          </MuiRadioGroup>
        </FormControl>
      </ComponentDoc>

      <ComponentDoc docId="slider" canvasClassName="items-stretch">
        <div className="w-full max-w-xs">
          <Slider defaultValue={40} valueLabelDisplay="auto" />
        </div>
      </ComponentDoc>

      <ComponentDoc docId="rating">
        <Rating defaultValue={4} />
      </ComponentDoc>

        <ComponentDoc docId="autocomplete" canvasClassName="items-stretch">
          <Autocomplete
            options={['Miraflores', 'San Isidro', 'Barranco', 'Surco']}
            sx={{ width: { xs: '100%', sm: 320 } }}
            renderInput={(params) => <TextField {...params} label="Distrito" />}
          />
        </ComponentDoc>

        <ComponentDoc
          name="Patron de formulario"
          tag="@components/ui"
          description="Ejemplo completo con jerarquia, espacio entre campos y acciones claramente separadas."
          canvasClassName="items-stretch"
          code={`<FormSection title="Datos de contacto">\n  <FormStack>\n    <FormGrid>...</FormGrid>\n    <Textarea ... />\n  </FormStack>\n  <FormActions>...</FormActions>\n</FormSection>`}
        >
          <FormSection
            title="Datos de contacto"
            description="Todos los campos relacionados viven dentro del mismo bloque."
            className="w-full"
          >
            <FormStack>
              <FormGrid>
                <AppInput label="Nombre completo" placeholder="Andrea Torres" />
                <AppInput label="Telefono" type="tel" placeholder="+51 999 999 999" />
              </FormGrid>
              <AppTextarea label="Indicaciones" rows={3} placeholder="Piso, referencia o persona de contacto" />
            </FormStack>
            <FormActions>
              <AppButton variant="ghost">Cancelar</AppButton>
              <AppButton>Guardar cambios</AppButton>
            </FormActions>
          </FormSection>
        </ComponentDoc>
      </div>
    </div>
  );
};

/* ==========================================================================
 * DATOS
 * ========================================================================== */
const DataSection: FC = () => (
  <div>
    <SectionHeader title="Datos" description="Tablas, etiquetas, avatares e indicadores." />
    <div className="grid gap-8">
      <ComponentDoc
        docId="table"
        canvasClassName="items-stretch bg-surface"
        code={`import { Table, Tbody, Td, Th, Thead, Tr } from '@components/ui';\n\n<Table caption="Personal del turno">\n  <Thead><Tr><Th>Usuario</Th><Th>Rol</Th></Tr></Thead>\n  <Tbody><Tr><Td>Ana Torres</Td><Td>Cocina</Td></Tr></Tbody>\n</Table>`}
      >
        <AppTable caption="Personal del turno">
          <Thead>
            <Tr>
              <Th>Usuario</Th>
              <Th>Rol</Th>
              <Th>Estado</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td>Ana Torres</Td>
              <Td>Cocina</Td>
              <Td><AppBadge variant="success">Activo</AppBadge></Td>
            </Tr>
            <Tr>
              <Td>Bruno Diaz</Td>
              <Td>Repartidor</Td>
              <Td><AppBadge variant="danger">Bloqueado</AppBadge></Td>
            </Tr>
          </Tbody>
        </AppTable>
      </ComponentDoc>

      <ComponentDoc
        docId="chip"
        code={`import { Chip } from '@components/ui';\n\n<Chip active onClick={() => setFilter('hoy')}>Hoy</Chip>\n<Chip onRemove={() => quitar('sin gluten')}>Sin gluten</Chip>`}
      >
        <AppChip>Neutro</AppChip>
        <AppChip active>Seleccionado</AppChip>
        <AppChip onClick={() => toast('Filtro aplicado')}>Pulsable</AppChip>
        <AppChip onRemove={() => toast('Quitado')}>Removible</AppChip>
      </ComponentDoc>

      <ComponentDoc docId="avatar">
        <Avatar sx={{ bgcolor: 'primary.main' }}>A</Avatar>
        <Avatar sx={{ bgcolor: 'secondary.main' }}>B</Avatar>
        <Avatar sx={{ bgcolor: 'tertiary.main' }}>C</Avatar>
      </ComponentDoc>

      <ComponentDoc docId="avatargroup">
        <AvatarGroup max={3}>
          <Avatar sx={{ bgcolor: 'primary.main' }}>A</Avatar>
          <Avatar sx={{ bgcolor: 'secondary.main' }}>B</Avatar>
          <Avatar sx={{ bgcolor: 'tertiary.main' }}>C</Avatar>
          <Avatar>D</Avatar>
        </AvatarGroup>
      </ComponentDoc>

      <ComponentDoc
        docId="badge"
        code={`import { Badge } from '@components/ui';\n\n<Badge variant="success">Entregado</Badge>\n<Badge variant="danger">Cancelado</Badge>\n<Badge variant="accent">Con retraso</Badge>`}
      >
        <AppBadge>Marca</AppBadge>
        <AppBadge variant="accent">Acento</AppBadge>
        <AppBadge variant="neutral">Neutro</AppBadge>
        <AppBadge variant="success">Exito</AppBadge>
        <AppBadge variant="strong">Enfasis</AppBadge>
        <AppBadge variant="solid">Solido</AppBadge>
        <AppBadge variant="warning">Aviso</AppBadge>
        <AppBadge variant="danger">Peligro</AppBadge>
        <AppBadge variant="outline">Contorno</AppBadge>
        <AppBadge variant="solid"><ShoppingBag className="size-3" /> 4 pedidos</AppBadge>
      </ComponentDoc>
    </div>
  </div>
);

/* ==========================================================================
 * RETROALIMENTACION
 * ========================================================================== */
const FeedbackSection: FC = () => (
  <div>
    <SectionHeader
      title="Retroalimentacion"
      description="Alertas contextuales y notificaciones construidas sobre Alert + Snackbar de MUI."
    />
    <div className="grid gap-8">
      <ComponentDoc
        docId="alert"
        name="Alert"
        tag="@components/ui"
        canvasClassName="flex-col items-stretch gap-4"
        code={`<Alert variant="success" title="Cambios guardados">\n  La configuracion ya esta activa.\n</Alert>`}
      >
        <AppAlert variant="info" title="Informacion util">Un dato que ayuda a completar la tarea.</AppAlert>
        <AppAlert variant="success" title="Todo salio bien">La accion se completo correctamente.</AppAlert>
        <AppAlert variant="warning" title="Revisa antes de continuar">Hay valores que necesitan tu atencion.</AppAlert>
        <AppAlert variant="danger" title="No se pudo completar">Corrige los datos marcados e intenta nuevamente.</AppAlert>
      </ComponentDoc>

      <ComponentDoc
        name="Callout"
        tag="@components/ui"
        description="Aviso compacto para contexto dentro de tarjetas, formularios y pasos."
        canvasClassName="flex-col items-stretch gap-3"
      >
        <Callout tone="info">Tu direccion se validara antes de confirmar el pedido.</Callout>
        <Callout tone="warning" size="sm">Quedan pocas unidades disponibles.</Callout>
      </ComponentDoc>

      <ComponentDoc
        docId="snackbar"
        name="Toast"
        tag="@components/mui/MuiToast"
        description="Avisos globales: éxito e información duran 4 segundos; advertencias y errores, 6. Se cierran automáticamente, admiten cierre manual y agrupan repeticiones."
      >
        <AppButton variant="outline" onClick={() => toast.success('Cambios guardados correctamente')}>
          Probar exito
        </AppButton>
        <AppButton variant="outline" onClick={() => toast.warning('Revisa los campos pendientes')}>
          Probar advertencia
        </AppButton>
        <AppButton variant="outline" onClick={() => toast.error('No se pudo completar la accion')}>
          Probar error
        </AppButton>
      </ComponentDoc>

        <ComponentDoc docId="linearprogress" canvasClassName="flex-col items-stretch gap-4">
          <LinearProgress />
          <LinearProgress variant="determinate" value={70} />
          <LinearProgress color="tertiary" variant="determinate" value={45} />
        </ComponentDoc>

        <ComponentDoc docId="circularprogress">
          <CircularProgress />
          <CircularProgress color="secondary" />
          <CircularProgress variant="determinate" value={65} />
        </ComponentDoc>

        <ComponentDoc docId="skeleton" canvasClassName="flex-col items-stretch">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="65%" />
          <Skeleton variant="rectangular" height={80} />
        </ComponentDoc>
    </div>
  </div>
);

/* ==========================================================================
 * NAVEGACION
 * ========================================================================== */
const NavigationSection: FC = () => {
  const [tab, setTab] = useState('resumen');
  const [page, setPage] = useState(3);
  return (
    <div>
      <SectionHeader title="Navegacion" description="Moverse dentro de una pantalla y entre paginas." />
      <div className="grid gap-8">
        <ComponentDoc docId="breadcrumbs">
          <Breadcrumbs>
            <MuiLink underline="hover" color="inherit" href="#">
              Panel
            </MuiLink>
            <MuiLink underline="hover" color="inherit" href="#">
              Catalogo
            </MuiLink>
            <Typography color="text.primary">Bowl Mediterraneo</Typography>
          </Breadcrumbs>
        </ComponentDoc>

        <ComponentDoc docId="link">
          <MuiLink href="#" underline="hover">
            Enlace por defecto
          </MuiLink>
          <MuiLink href="#" color="secondary" underline="always">
            Enlace secundario
          </MuiLink>
          <MuiLink href="#" color="inherit" underline="none">
            Sin subrayado
          </MuiLink>
        </ComponentDoc>

        <ComponentDoc docId="tabs" canvasClassName="items-stretch">
          <Tabs value={tab} onChange={(_, value) => setTab(value)}>
            <Tab label="Resumen" value="resumen" />
            <Tab label="Detalle" value="detalle" />
            <Tab label="Historial" value="historial" />
          </Tabs>
        </ComponentDoc>

        <ComponentDoc
          docId="pagination"
          code={`import { Pagination } from '@components/ui';\n\n<Pagination page={page} totalPages={meta.totalPages} onChange={setPage} />`}
        >
          <AppPagination page={page} totalPages={8} onChange={setPage} />
        </ComponentDoc>

        <ComponentDoc docId="stepper" canvasClassName="items-stretch">
          <Stepper activeStep={2} alternativeLabel className="w-full">
            {['Bizcocho', 'Relleno', 'Cobertura', 'Entrega'].map((step) => (
              <Step key={step}>
                <StepLabel>{step}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </ComponentDoc>
      </div>
    </div>
  );
};

/* ==========================================================================
 * SOBRECAPAS
 * ========================================================================== */
const OverlaysSection: FC = () => {
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  return (
    <div>
      <SectionHeader title="Sobrecapas" description="Contenido sobre la pantalla: dialogo, panel lateral y tooltip." />
      <div className="grid gap-8">
        <ComponentDoc
          docId="dialog"
          name="Modal"
          tag="@components/ui"
          description="Dialogo de producto con encabezado, cuerpo espaciado, foco y comportamiento movil."
        >
          <AppButton variant="outline" onClick={() => setDialog(true)}>
            Abrir modal
          </AppButton>
          <AppModal
            isOpen={dialog}
            onClose={() => setDialog(false)}
            eyebrow="Nuevo registro"
            title="Crear contacto"
            description="Los campos mantienen el mismo ritmo visual que el resto de la aplicacion."
            actions={
              <>
                <AppButton variant="ghost" onClick={() => setDialog(false)}>Cancelar</AppButton>
                <AppButton onClick={() => { setDialog(false); toast.success('Contacto guardado'); }}>
                  Guardar contacto
                </AppButton>
              </>
            }
          >
            <FormStack>
              <FormGrid>
                <AppInput label="Nombre" placeholder="Andrea" />
                <AppInput label="Apellido" placeholder="Torres" />
              </FormGrid>
              <AppInput label="Correo electronico" type="email" placeholder="andrea@correo.com" />
              <AppTextarea label="Notas" rows={3} hint="Este campo es opcional." />
            </FormStack>
          </AppModal>
        </ComponentDoc>

        <ComponentDoc docId="drawer" name="Drawer" tag="@components/ui">
          <AppButton variant="outline" onClick={() => setDrawer(true)}>
            Abrir panel lateral
          </AppButton>
          <AppDrawer
            isOpen={drawer}
            onClose={() => setDrawer(false)}
            title="Filtros"
            description="Acota los resultados sin perder el contexto de la pantalla."
          >
            <FormStack>
              <AppInput label="Buscar" placeholder="Nombre o codigo" />
              <AppSelect label="Estado" defaultValue="">
                <SelectOption value="">Todos</SelectOption>
                <SelectOption value="conf">Confirmado</SelectOption>
                <SelectOption value="prep">En preparacion</SelectOption>
              </AppSelect>
              <AppButton onClick={() => setDrawer(false)}>Aplicar filtros</AppButton>
            </FormStack>
          </AppDrawer>
        </ComponentDoc>

        <ComponentDoc
          docId="tooltip"
          code={`import { Tooltip } from '@components/ui';\n\n<Tooltip content="Enviar a la papelera" side="top">\n  <Button variant="ghost" aria-label="Enviar a la papelera"><Trash2 className="size-4" /></Button>\n</Tooltip>`}
        >
          <AppTooltip content="Aparece arriba">
            <AppButton variant="ghost">Pasa el cursor</AppButton>
          </AppTooltip>
          <AppTooltip content="Aparece a la derecha" side="right">
            <AppButton variant="outline">Enfocalo con el teclado</AppButton>
          </AppTooltip>
        </ComponentDoc>
      </div>
    </div>
  );
};

/* ==========================================================================
 * CONTENIDO
 * ========================================================================== */
const ContentSection: FC = () => (
  <div>
    <SectionHeader title="Contenido" description="Agrupar y ordenar informacion: tarjetas, plegables y separadores." />
    <div className="grid gap-8">
      <ComponentDoc
        docId="card"
        canvasClassName="items-stretch"
        code={`import { Card, CardDescription, CardHeader, CardTitle } from '@components/ui';\n\n<Card shadow="e2">\n  <CardHeader>\n    <CardTitle>Pedidos del turno</CardTitle>\n    <CardDescription>Resumen de la cocina seleccionada.</CardDescription>\n  </CardHeader>\n  ...\n</Card>`}
      >
        <AppCard className="w-full">
          <CardHeader>
            <CardTitle>Tarjeta</CardTitle>
            <CardDescription>Agrupa contenido relacionado con sus acciones al pie.</CardDescription>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            <AppButton size="sm">Accion</AppButton>
            <AppButton size="sm" variant="ghost">Otra</AppButton>
          </div>
        </AppCard>
      </ComponentDoc>

      <ComponentDoc docId="paper" canvasClassName="items-stretch gap-4">
        <Paper variant="outlined" sx={{ p: 3, flex: 1 }}>
          <Typography variant="body2">Paper outlined</Typography>
        </Paper>
        <Paper elevation={3} sx={{ p: 3, flex: 1 }}>
          <Typography variant="body2">Paper elevation 3</Typography>
        </Paper>
      </ComponentDoc>

      <ComponentDoc docId="accordion" canvasClassName="flex-col items-stretch gap-0">
        {[
          { q: 'Como funcionan los permisos?', a: 'Cada pantalla exige un permiso; el menu se arma segun lo que puedes ver.' },
          { q: 'Que es el superadmin?', a: 'Una marca del usuario que se salta la verificacion de permisos.' },
          { q: 'Puedo crear roles?', a: 'Si, desde Roles y permisos, con casillas y sin tocar codigo.' },
        ].map((item) => (
          <Accordion key={item.q}>
            <AccordionSummary expandIcon={<ChevronDown className="size-4" />}>{item.q}</AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary">
                {item.a}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </ComponentDoc>

      <ComponentDoc docId="divider" canvasClassName="flex-col items-stretch gap-4">
        <Divider />
        <Divider>o</Divider>
      </ComponentDoc>
    </div>
  </div>
);

/* ==========================================================================
 * REGISTRO Y NAVEGACION
 * ========================================================================== */
const SECTIONS: Record<string, { label: string; Component: FC }> = {
  intro: { label: 'Introduccion', Component: IntroSection },
  tema: { label: 'Tema', Component: ThemeSection },
  colores: { label: 'Colores', Component: ColorsSection },
  tipografia: { label: 'Tipografia', Component: TypographySection },
  formularios: { label: 'Formularios', Component: FormsSection },
  botones: { label: 'Botones y menus', Component: ButtonsSection },
  datos: { label: 'Datos', Component: DataSection },
  feedback: { label: 'Retroalimentacion', Component: FeedbackSection },
  navegacion: { label: 'Navegacion', Component: NavigationSection },
  sobrecapas: { label: 'Sobrecapas', Component: OverlaysSection },
  contenido: { label: 'Contenido', Component: ContentSection },
};

const FOUNDATION_ITEMS = [
  { key: 'intro', label: 'Introducción', section: 'intro' },
  { key: 'tema', label: 'Tema gestionable', section: 'tema' },
  { key: 'colores', label: 'Colores', section: 'colores' },
] as const;

const COMPONENT_GROUPS = [
  { label: 'Tipografía', section: 'tipografia', ids: ['typography'] },
  { label: 'Entradas y formularios', section: 'formularios', ids: ['textfield', 'textarea', 'select', 'checkbox', 'radio', 'switch', 'formcontrol', 'slider', 'rating', 'autocomplete'] },
  { label: 'Acciones', section: 'botones', ids: ['button', 'iconbutton', 'buttongroup', 'fab', 'menu'] },
  { label: 'Visualización de datos', section: 'datos', ids: ['table', 'chip', 'avatar', 'avatargroup', 'badge'] },
  { label: 'Feedback y estados', section: 'feedback', ids: ['alert', 'snackbar', 'linearprogress', 'circularprogress', 'skeleton'] },
  { label: 'Navegación', section: 'navegacion', ids: ['breadcrumbs', 'link', 'tabs', 'pagination', 'stepper'] },
  { label: 'Sobrecapas', section: 'sobrecapas', ids: ['dialog', 'drawer', 'tooltip'] },
  { label: 'Superficies y contenido', section: 'contenido', ids: ['card', 'paper', 'accordion', 'divider'] },
] as const;

const COMPONENT_ITEMS = COMPONENT_GROUPS.flatMap((group) =>
  group.ids.map((docId) => ({
    key: docId,
    label: getDoc(docId)?.name ?? docId,
    section: group.section,
    docId,
    group: group.label,
  })),
);

const NAV_ITEMS = [...FOUNDATION_ITEMS, ...COMPONENT_ITEMS];

const DesignSystemPage = () => {
  const [active, setActive] = useState('intro');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const ActiveComponent = SECTIONS[active].Component;

  const currentKey = selectedDoc ?? active;
  const index = NAV_ITEMS.findIndex((item) => item.key === currentKey);
  const prevItem = index > 0 ? NAV_ITEMS[index - 1] : null;
  const nextItem = index < NAV_ITEMS.length - 1 ? NAV_ITEMS[index + 1] : null;

  const filteredGroups = COMPONENT_GROUPS.map((group) => ({
    ...group,
    ids: group.ids.filter((id) => {
      const doc = getDoc(id);
      const haystack = `${doc?.name ?? ''} ${doc?.description ?? ''} ${group.label}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    }),
  })).filter((group) => group.ids.length > 0);

  const goTo = (item: (typeof NAV_ITEMS)[number]) => {
    setActive(item.section);
    setSelectedDoc('docId' in item ? item.docId : null);

    if ('docId' in item) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById(`component-${item.docId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
  };

  useEffect(() => {
    if (!selectedDoc) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [active, selectedDoc]);

  return (
    <div className="mx-auto max-w-8xl pb-16">
      {/* Encabezado: el mismo `PageHeader` que las otras dieciseis pantallas. El
          hero artesanal que habia aqui era, junto al del Resumen, lo primero que
          ve un administrador general, y no compartia ni tipografia ni ritmo. */}
      <PageHeader
        eyebrow="Sistema de diseño"
        title="Componentes de Misky Challay"
        description="Cada componente tiene su entrada individual, demo en vivo, documentación de props y código de referencia. El tema se gestiona desde un solo lugar."
        icon={Palette}
        action={
          <>
            <AppBadge variant="neutral">Material UI</AppBadge>
            <AppBadge variant="neutral">Tema gestionable</AppBadge>
            <AppBadge variant="brand">{COMPONENT_ITEMS.length} componentes</AppBadge>
          </>
        }
      />

      {/* Selector individual de componente (móviles) */}
      <div className="mt-6 md:hidden">
        <TextField
          select
          fullWidth
          size="small"
          value={currentKey}
          onChange={(event) => {
            const item = NAV_ITEMS.find((candidate) => candidate.key === event.target.value);
            if (item) goTo(item);
          }}
          label="Buscar componente"
        >
          {FOUNDATION_ITEMS.map((item) => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}
          {COMPONENT_GROUPS.map((group) => [
            <MenuItem key={`${group.label}-title`} disabled sx={{ opacity: 0.72, fontSize: 11, textTransform: 'uppercase' }}>{group.label}</MenuItem>,
            ...group.ids.map((id) => <MenuItem key={id} value={id} sx={{ pl: 3 }}>{getDoc(id)?.name ?? id}</MenuItem>),
          ])}
        </TextField>
      </div>

      <div className="mt-8 flex gap-6 lg:gap-8">
        {/* Navegacion (tablet y escritorio) */}
        <aside className="hidden w-48 shrink-0 md:block lg:w-52">
          <div className="sticky top-6 max-h-[calc(100vh-48px)] overflow-y-auto pr-2 admin-scrollbar">
            <TextField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar componente…"
              size="small"
              fullWidth
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search className="size-4" /></InputAdornment> } }}
              sx={{ mb: 2 }}
            />

            {!query && (
              <div className="mb-5">
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Fundamentos</p>
                <nav className="space-y-0.5">
                  {FOUNDATION_ITEMS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => goTo(item)}
                      aria-current={currentKey === item.key ? 'page' : undefined}
                      className={cn(
                        'block w-full border-l-2 py-1.5 pl-3 text-left text-sm transition-colors',
                        currentKey === item.key
                          ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                          : 'border-transparent text-ink-muted hover:border-line hover:bg-surface-muted hover:text-ink',
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>
            )}

            <div className="grid gap-5">
              {filteredGroups.map((group) => (
                <div key={group.label}>
                  <div className="mb-1 flex items-center justify-between px-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{group.label}</p>
                    <span className="text-[10px] text-ink-muted">{group.ids.length}</span>
                  </div>
                  <nav className="space-y-0.5">
                    {group.ids.map((id) => {
                      const item = COMPONENT_ITEMS.find((candidate) => candidate.docId === id)!;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => goTo(item)}
                          aria-current={selectedDoc === id ? 'page' : undefined}
                          className={cn(
                            'block w-full border-l-2 py-1.5 pl-3 text-left text-sm transition-colors',
                            selectedDoc === id
                              ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700'
                              : 'border-transparent text-ink-muted hover:border-line hover:bg-surface-muted hover:text-ink',
                          )}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              ))}
              {filteredGroups.length === 0 && <p className="px-3 py-4 text-sm text-ink-muted">No encontramos ese componente.</p>}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {selectedDoc && (
            <Paper
              variant="outlined"
              sx={{
                mb: 3,
                display: 'flex',
                alignItems: { xs: 'flex-start', sm: 'center' },
                justifyContent: 'space-between',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                p: 2,
                borderRadius: 'var(--radius-card)',
                bgcolor: 'action.hover',
              }}
            >
              <div>
                <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800 }}>
                  Componente individual
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
                  {getDoc(selectedDoc)?.name}
                </Typography>
              </div>
              <Button variant="outlined" size="small" onClick={() => setSelectedDoc(null)}>
                Ver categoría completa
              </Button>
            </Paper>
          )}
          <div key={active} className="animate-fade-in">
            <Box
              sx={selectedDoc ? {
                [`& [data-component-id]:not([data-component-id="${selectedDoc}"])`]: { display: 'none' },
              } : undefined}
            >
              <ActiveComponent />
            </Box>
          </div>

          {/* Paginador entre secciones */}
          <div className="mt-12 grid grid-cols-2 gap-3 border-t border-line pt-6">
            {prevItem ? (
              <button
                type="button"
                onClick={() => goTo(prevItem)}
                className="flex items-center gap-3 rounded-card border border-line px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-surface-muted"
              >
                <ArrowLeft className="size-4 shrink-0 text-ink-muted" />
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-wide text-ink-muted">Anterior</span>
                  <span className="block truncate text-sm font-medium text-ink">{prevItem.label}</span>
                </span>
              </button>
            ) : (
              <span />
            )}

            {nextItem ? (
              <button
                type="button"
                onClick={() => goTo(nextItem)}
                className="flex items-center justify-end gap-3 rounded-card border border-line px-4 py-3 text-right transition-colors hover:border-brand-300 hover:bg-surface-muted"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-wide text-ink-muted">Siguiente</span>
                  <span className="block truncate text-sm font-medium text-ink">{nextItem.label}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-ink-muted" />
              </button>
            ) : (
              <span />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DesignSystemPage;
