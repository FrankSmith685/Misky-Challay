import { useEffect, useState, type FC, type MouseEvent } from 'react';
import {
  Alert,
  AlertTitle,
  Autocomplete,
  Avatar,
  AvatarGroup,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  ButtonGroup,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
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
  Pagination,
  Paper,
  Radio,
  RadioGroup,
  Rating,
  Skeleton,
  Slider,
  Snackbar,
  Step,
  StepLabel,
  Stepper,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
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
import toast from 'react-hot-toast';
import { CodeBlock } from '@components/common/CodeBlock';
import { cn } from '@lib/cn';
import { ComponentDoc, Label, SectionHeader } from '../designSystem/DocParts';
import { ThemeEditor } from '../components/ThemeEditor';
import { useThemeSettings } from '@/theme/ThemeSettingsProvider';
import { rampFromHex, tint, type ColorRamp } from '@/theme/colorUtils';
import { DEFAULT_BRAND_RAMP, DEFAULT_TOKENS } from '@/theme/tokens';
import { getDoc } from '../designSystem/componentDocs';

/* ==========================================================================
 * FUNDAMENTOS
 * ========================================================================== */
const PRINCIPLES = [
  { icon: Boxes, title: 'Material, con tu marca', text: 'Componentes de MUI con un tema propio: verde de Verde Bowl, fuente Inter y bordes redondeados.' },
  { icon: Palette, title: 'Tema gestionable', text: 'El look sale de theme/. Desde la seccion Tema cambias primary, secondary o tertiary y se actualiza toda la app.' },
  { icon: ShieldCheck, title: 'Accesible', text: 'MUI trae foco, teclado y ARIA de fabrica en dialogos, menus y formularios.' },
  { icon: Feather, title: 'Consistente', text: 'Mismos colores, radios y tipografia que el resto de la app.' },
];

const IntroSection: FC = () => (
  <div>
    <SectionHeader
      title="Introduccion"
      description="Los componentes de la interfaz de Verde Bowl, sobre Material UI con un tema de marca gestionable."
    />
    <div className="grid gap-4 sm:grid-cols-2">
      {PRINCIPLES.map(({ icon: Icon, title, text }) => (
        <Card key={title} variant="outlined">
          <CardContent>
            <Icon className="mb-2 size-6 text-brand-600" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {text}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </div>

    <h3 className="mb-2 mt-8 text-base font-semibold text-ink">Como leer esta documentacion</h3>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      Cada componente muestra: sobre que esta construido, para que sirve, cuando usarlo, una vista previa
      en vivo, el codigo para copiar y una tabla con sus props principales.
    </Typography>
    <CodeBlock code={`import { Button, Chip } from '@mui/material';\n\n<Button variant="contained">Guardar</Button>\n<Chip label="Activo" color="success" />`} />

    <Alert severity="info" className="mt-8">
      <AlertTitle>Seccion gestionable</AlertTitle>
      Esta documentacion se controla con el permiso <strong>settings.manage</strong>. Desde Roles y
      permisos decides que roles la ven; el superadmin siempre entra.
    </Alert>
  </div>
);

/* ==========================================================================
 * TEMA (editor gestionable)
 * ========================================================================== */
const ThemeSection: FC = () => (
  <div>
    <SectionHeader
      title="Tema"
      description="Cambia los colores de marca (primary, secondary, tertiary) y el radio de bordes. Los cambios se ven al instante en TODOS los componentes y se guardan en este navegador."
    />
    <ThemeEditor />
  </div>
);

/* ==========================================================================
 * COLORES (reflejan los tokens vivos del tema)
 * ========================================================================== */
const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

const NEUTRALS = [
  { token: 'surface', hex: '#ffffff' },
  { token: 'surface-muted', hex: '#f6f8f7' },
  { token: 'line', hex: '#e3e8e5' },
  { token: 'ink-muted', hex: '#5d6b64' },
  { token: 'ink', hex: '#14201a' },
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
        className="relative h-16 w-full overflow-hidden rounded-xl border border-line transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md"
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
  const brand = tokens.primary === DEFAULT_TOKENS.primary ? DEFAULT_BRAND_RAMP : rampFromHex(tokens.primary);
  const tertiary = rampFromHex(tokens.tertiary);
  const accent = [
    { token: 'accent-400', hex: tint(tokens.secondary, 0.18) },
    { token: 'accent-500', hex: tokens.secondary },
  ];

  return (
    <div>
      <SectionHeader
        title="Colores"
        description="Reflejan el tema actual: marca (primary), acento (secondary) y el tercer color (tertiary). Cambia en Tema y esto se actualiza. Toca un color para copiar su hex."
      />
      <div className="space-y-6">
        <div>
          <Label>Marca (brand / primary)</Label>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {rampToSwatches('brand', brand).map((color) => (
              <Swatch key={color.token} {...color} />
            ))}
          </div>
        </div>
        <div>
          <Label>Acento (accent / secondary)</Label>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {accent.map((color) => (
              <Swatch key={color.token} {...color} />
            ))}
          </div>
        </div>
        <div>
          <Label>Tercer color (tertiary)</Label>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {rampToSwatches('tertiary', tertiary).map((color) => (
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
      <div className="space-y-8">
        <ComponentDoc
          docId="button"
          code={`<Button variant="contained">Guardar</Button>\n<Button variant="outlined" color="secondary">Cancelar</Button>\n<Button variant="contained" color="tertiary">Destacar</Button>`}
        >
          <Button variant="contained">Contained</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="text">Text</Button>
          <Button variant="contained" color="secondary">
            Secundario
          </Button>
          <Button variant="contained" color="tertiary">
            Terciario
          </Button>
          <Button variant="contained" color="error">
            Error
          </Button>
          <Button variant="contained" startIcon={<Sparkles className="size-4" />}>
            Con icono
          </Button>
          <Button variant="contained" disabled startIcon={<CircularProgress size={16} color="inherit" />}>
            Cargando
          </Button>
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
const FormsSection: FC = () => (
  <div>
    <SectionHeader title="Formularios" description="Campos de Material con etiqueta flotante y estados." />
    <div className="space-y-8">
      <ComponentDoc
        docId="textfield"
        canvasClassName="items-stretch"
        code={`<TextField label="Email" />\n<TextField label="Clave" error helperText="Invalido" />`}
      >
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <TextField label="Nombre" placeholder="Escribe aqui" />
          <TextField label="Email" error defaultValue="valor" helperText="Ingresa un email valido" />
          <TextField label="Clave" type="password" helperText="Minimo 8 caracteres" />
          <TextField label="Deshabilitado" value="No editable" disabled />
        </div>
      </ComponentDoc>

      <ComponentDoc docId="textarea" canvasClassName="items-stretch">
        <TextField label="Notas" multiline minRows={3} fullWidth placeholder="Referencias del pedido..." />
      </ComponentDoc>

      <ComponentDoc docId="select" canvasClassName="items-stretch">
        <TextField select label="Sucursal" defaultValue="" sx={{ width: { xs: '100%', sm: 280 } }}>
          <MenuItem value="" disabled>
            Selecciona...
          </MenuItem>
          <MenuItem value="mira">Verde Bowl Miraflores</MenuItem>
          <MenuItem value="isi">Verde Bowl San Isidro</MenuItem>
        </TextField>
      </ComponentDoc>

      <ComponentDoc docId="checkbox">
        <FormGroup>
          <FormControlLabel control={<Checkbox defaultChecked />} label="Acepto los terminos" />
          <FormControlLabel control={<Checkbox />} label="Recibir novedades" />
          <FormControlLabel control={<Checkbox color="tertiary" defaultChecked />} label="Con color tertiary" />
        </FormGroup>
      </ComponentDoc>

      <ComponentDoc docId="radio">
        <FormControl>
          <FormLabel>Entrega</FormLabel>
          <RadioGroup defaultValue="delivery">
            <FormControlLabel value="delivery" control={<Radio />} label="Delivery" />
            <FormControlLabel value="pickup" control={<Radio />} label="Recojo" />
          </RadioGroup>
        </FormControl>
      </ComponentDoc>

      <ComponentDoc docId="switch">
        <FormControlLabel control={<Switch defaultChecked />} label="Notificaciones" />
        <FormControlLabel control={<Switch color="secondary" />} label="Modo oscuro" />
      </ComponentDoc>

      <ComponentDoc docId="formcontrol" description="Envoltura que agrupa etiqueta, control y texto de ayuda de un campo.">
        <FormControl>
          <FormLabel>Preferencia de contacto</FormLabel>
          <RadioGroup row defaultValue="email">
            <FormControlLabel value="email" control={<Radio />} label="Email" />
            <FormControlLabel value="sms" control={<Radio />} label="SMS" />
          </RadioGroup>
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
          sx={{ width: { xs: '100%', sm: 280 } }}
          renderInput={(params) => <TextField {...params} label="Distrito" />}
        />
      </ComponentDoc>
    </div>
  </div>
);

/* ==========================================================================
 * DATOS
 * ========================================================================== */
const DataSection: FC = () => (
  <div>
    <SectionHeader title="Datos" description="Tablas, etiquetas, avatares e indicadores." />
    <div className="space-y-8">
      <ComponentDoc
        docId="table"
        canvasClassName="items-stretch bg-surface"
        code={`<Table>\n  <TableHead>...<TableCell>Usuario</TableCell></TableHead>\n  <TableBody>...</TableBody>\n</Table>`}
      >
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Usuario</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Ana Torres</TableCell>
                <TableCell>Cocina</TableCell>
                <TableCell>
                  <Chip label="Activo" color="success" size="small" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Bruno Diaz</TableCell>
                <TableCell>Repartidor</TableCell>
                <TableCell>
                  <Chip label="Bloqueado" color="error" size="small" variant="outlined" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </ComponentDoc>

      <ComponentDoc docId="chip">
        <Chip label="Marca" color="primary" />
        <Chip label="Acento" color="secondary" />
        <Chip label="Terciario" color="tertiary" />
        <Chip label="Activo" color="success" />
        <Chip label="Bloqueado" color="error" variant="outlined" />
        <Chip label="Removible" onDelete={() => toast('Quitado')} />
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

      <ComponentDoc docId="badge">
        <Badge color="secondary" badgeContent={4}>
          <ShoppingBag className="size-6 text-ink-muted" />
        </Badge>
        <Badge color="tertiary" badgeContent={12} sx={{ ml: 3 }}>
          <ShoppingBag className="size-6 text-ink-muted" />
        </Badge>
        <Badge color="error" variant="dot" sx={{ ml: 3 }}>
          <ShoppingBag className="size-6 text-ink-muted" />
        </Badge>
      </ComponentDoc>
    </div>
  </div>
);

/* ==========================================================================
 * RETROALIMENTACION
 * ========================================================================== */
const FeedbackSection: FC = () => {
  const [snack, setSnack] = useState(false);
  return (
    <div>
      <SectionHeader title="Retroalimentacion" description="Alertas, avisos, progreso y carga." />
      <div className="space-y-8">
        <ComponentDoc docId="alert" canvasClassName="flex-col items-stretch">
          <Alert severity="info">Un dato util para el usuario.</Alert>
          <Alert severity="success">
            <AlertTitle>Todo salio bien</AlertTitle>La accion se completo.
          </Alert>
          <Alert severity="warning">Revisa esto antes de continuar.</Alert>
          <Alert severity="error">No se pudo completar la operacion.</Alert>
        </ComponentDoc>

        <ComponentDoc docId="snackbar">
          <Button variant="outlined" onClick={() => setSnack(true)}>
            Mostrar snackbar
          </Button>
          <Snackbar
            open={snack}
            autoHideDuration={3000}
            onClose={() => setSnack(false)}
            message="Guardado con exito"
          />
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
};

/* ==========================================================================
 * NAVEGACION
 * ========================================================================== */
const NavigationSection: FC = () => {
  const [tab, setTab] = useState('resumen');
  const [page, setPage] = useState(3);
  return (
    <div>
      <SectionHeader title="Navegacion" description="Moverse dentro de una pantalla y entre paginas." />
      <div className="space-y-8">
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

        <ComponentDoc docId="pagination">
          <Pagination count={8} color="primary" page={page} onChange={(_, value) => setPage(value)} />
        </ComponentDoc>

        <ComponentDoc docId="stepper" canvasClassName="items-stretch">
          <Stepper activeStep={2} alternativeLabel className="w-full">
            {['Base', 'Proteina', 'Toppings', 'Pago'].map((step) => (
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
      <div className="space-y-8">
        <ComponentDoc docId="dialog">
          <Button variant="outlined" onClick={() => setDialog(true)}>
            Abrir dialog
          </Button>
          <Dialog open={dialog} onClose={() => setDialog(false)}>
            <DialogTitle>Confirmar accion</DialogTitle>
            <DialogContent>
              <DialogContentText>Seguro que deseas continuar?</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialog(false)}>Cancelar</Button>
              <Button variant="contained" onClick={() => setDialog(false)}>
                Confirmar
              </Button>
            </DialogActions>
          </Dialog>
        </ComponentDoc>

        <ComponentDoc docId="drawer">
          <Button variant="outlined" onClick={() => setDrawer(true)}>
            Abrir panel lateral
          </Button>
          <Drawer anchor="right" open={drawer} onClose={() => setDrawer(false)}>
            <div className="w-80 space-y-4 p-6">
              <Typography variant="h6">Filtros</Typography>
              <TextField label="Buscar" fullWidth />
              <TextField select label="Estado" defaultValue="" fullWidth>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="conf">Confirmado</MenuItem>
                <MenuItem value="prep">En preparacion</MenuItem>
              </TextField>
              <Button variant="contained" fullWidth onClick={() => setDrawer(false)}>
                Aplicar
              </Button>
            </div>
          </Drawer>
        </ComponentDoc>

        <ComponentDoc docId="tooltip">
          <Tooltip title="Soy un tooltip">
            <Button variant="text">Pasa el cursor</Button>
          </Tooltip>
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
    <div className="space-y-8">
      <ComponentDoc docId="card" canvasClassName="items-stretch">
        <Card variant="outlined" className="w-full">
          <CardContent>
            <Typography variant="h6">Tarjeta</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Agrupa contenido relacionado con acciones al pie.
            </Typography>
          </CardContent>
          <CardActions>
            <Button size="small">Accion</Button>
            <Button size="small" color="secondary">
              Otra
            </Button>
          </CardActions>
        </Card>
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
    <div className="mx-auto max-w-6xl pb-16">
      {/* Encabezado */}
      <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 right-20 size-52 rounded-full bg-accent-400/20 blur-3xl" />

        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-100">
            <Palette className="size-4" /> Sistema de diseno
          </p>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Componentes de Verde Bowl</h1>
          <p className="mt-2 max-w-2xl text-sm text-brand-50">
            Catálogo profesional de Material UI: cada componente tiene una entrada individual, demo en vivo,
            documentación de props y código de referencia. El tema se gestiona desde un solo lugar.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-3 py-1 font-medium">Material UI</span>
            <span className="rounded-full bg-white/15 px-3 py-1 font-medium">Tema gestionable</span>
            <span className="rounded-full bg-white/15 px-3 py-1 font-medium">{COMPONENT_ITEMS.length} componentes individuales</span>
          </div>
        </div>
      </div>

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

            <div className="space-y-5">
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
                borderRadius: 3,
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
                className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-surface-muted"
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
                className="flex items-center justify-end gap-3 rounded-xl border border-line px-4 py-3 text-right transition-colors hover:border-brand-300 hover:bg-surface-muted"
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
