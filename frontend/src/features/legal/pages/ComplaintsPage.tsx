import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowUpRight, BookText, CheckCircle2, FileCheck2, ShieldCheck } from 'lucide-react';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import toast from '@components/mui/MuiToast';
import { getApiErrorMessage } from '@services/api/client';
import { useBusinessInfo } from '@services/businessInfo';
import { ROUTES } from '@constants/routes';
import {
  complaintsApi,
  type ComplaintReceipt,
  type ComplaintStatusResult,
} from '../complaints.service';

const complaintSchema = z
  .object({
    type: z.enum(['RECLAMO', 'QUEJA']),
    itemType: z.enum(['PRODUCTO', 'SERVICIO']),
    consumerName: z.string().min(3, 'Ingresa tu nombre completo'),
    docType: z.enum(['DNI', 'CE', 'PASAPORTE', 'RUC']),
    docNumber: z.string().min(6, 'Documento inválido'),
    email: z.string().email('Correo inválido'),
    phone: z.string().optional().or(z.literal('')),
    address: z.string().optional().or(z.literal('')),
    isMinor: z.boolean().optional(),
    guardianName: z.string().optional().or(z.literal('')),
    orderNumber: z.string().optional().or(z.literal('')),
    itemDescription: z.string().optional().or(z.literal('')),
    claimedAmount: z.string().optional().or(z.literal('')),
    detail: z.string().min(10, 'Cuéntanos con más detalle qué pasó'),
    request: z.string().min(5, 'Indica qué solución esperas'),
  })
  .refine((data) => !data.isMinor || (data.guardianName ?? '').trim().length >= 3, {
    message: 'Indica el nombre del padre, madre o apoderado',
    path: ['guardianName'],
  });

type ComplaintForm = z.infer<typeof complaintSchema>;

const TYPE_HELP: Record<'RECLAMO' | 'QUEJA', string> = {
  RECLAMO: 'Disconformidad con el producto o el servicio recibido.',
  QUEJA: 'Disconformidad con la atención, no con el producto en sí.',
};

const ComplaintsPage = () => {
  const business = useBusinessInfo();
  const [tab, setTab] = useState(0);
  const [receipt, setReceipt] = useState<ComplaintReceipt | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ComplaintForm>({
    resolver: zodResolver(complaintSchema),
    defaultValues: { type: 'RECLAMO', itemType: 'PRODUCTO', docType: 'DNI', isMinor: false },
  });

  const isMinor = watch('isMinor');
  const type = watch('type');

  const onSubmit = async (values: ComplaintForm) => {
    try {
      const result = await complaintsApi.submit({
        type: values.type,
        itemType: values.itemType,
        consumerName: values.consumerName,
        docType: values.docType,
        docNumber: values.docNumber,
        email: values.email,
        phone: values.phone || undefined,
        address: values.address || undefined,
        isMinor: values.isMinor,
        guardianName: values.guardianName || undefined,
        itemDescription: values.itemDescription || undefined,
        claimedAmount: values.claimedAmount ? Number(values.claimedAmount) : undefined,
        detail: values.detail,
        request: values.request,
        orderNumber: values.orderNumber || undefined,
      });
      setReceipt(result);
      reset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  if (receipt) {
    return (
      <div className="legal-process-page">
        <header className="border-b border-brand-100 bg-brand-50/60">
          <div className="container-shell py-5 sm:py-7">
            <Breadcrumbs items={[{ label: 'Inicio', to: ROUTES.home }, { label: 'Libro de Reclamaciones' }]} />
          </div>
        </header>
        <div className="container-shell py-10 sm:py-14">
          <Paper className="mx-auto max-w-2xl" variant="outlined" sx={{ p: { xs: 3, md: 5 }, textAlign: 'center', borderRadius: 'var(--radius-card)' }}>
            <CheckCircle2 size={44} className="text-brand-600" />
            <Typography variant="h5" sx={{ mt: 2, fontWeight: 800 }}>
              Registramos tu {type === 'QUEJA' ? 'queja' : 'reclamo'}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Guarda tu código. Con él y tu documento puedes consultar el estado cuando quieras.
            </Typography>
            <Box sx={{ my: 3, py: 2, bgcolor: 'action.hover', borderRadius: 'var(--radius-card)' }}>
              <Typography variant="overline" color="text.secondary">Código</Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: 1 }}>{receipt.code}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Te enviamos una copia a tu correo. Responderemos a más tardar el{' '}
              <strong>{new Date(receipt.dueAt).toLocaleDateString('es-PE')}</strong>.
            </Typography>
            <Button sx={{ mt: 3 }} onClick={() => setReceipt(null)}>Presentar otro</Button>
          </Paper>
        </div>
      </div>
    );
  }

  return (
    <div className="legal-process-page" id="top">
      <header className="border-b border-brand-100 bg-brand-50/60">
        <div className="container-shell">
          <div className="pt-5 sm:pt-7">
            <Breadcrumbs items={[{ label: 'Inicio', to: ROUTES.home }, { label: 'Legal' }, { label: 'Libro de Reclamaciones' }]} />
          </div>
          <div className="grid gap-7 py-10 sm:py-14 lg:grid-cols-3 lg:items-end lg:py-16">
            <div className="lg:col-span-2">
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-brand-700">
                <BookText className="size-4" aria-hidden="true" /> Atención al cliente
              </p>
              <h1 className="mt-5 max-w-4xl text-[clamp(2.2rem,5vw,4.5rem)] font-black leading-[1.03] tracking-[-.055em] text-ink">
                Libro de Reclamaciones
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-ink-muted sm:text-lg">
                Presenta un reclamo o una queja de forma segura y consulta el estado de tu solicitud cuando lo necesites.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3.5 text-brand-800">
                  <CheckCircle2 className="size-4 text-brand-600" aria-hidden="true" /> Atención formal
                </span>
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-white/70 px-3.5 text-ink-muted">
                  <FileCheck2 className="size-4 text-brand-700" aria-hidden="true" /> Respuesta en hasta {business.complaintResponseDays} días hábiles
                </span>
              </div>
            </div>
            <div className="rounded-card border border-brand-200 bg-white p-5 shadow-e2 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Antes de presentar</p>
              <p className="mt-3 text-sm leading-6 text-ink-muted">
                Ten a la mano tu documento, el número de pedido y una descripción clara de lo ocurrido.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={`mailto:${business.supportEmail}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-brand-700 hover:underline">
                  Consultar por correo <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
                <a href="#formulario-reclamo" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-brand-700 hover:underline">
                  Ir al formulario <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container-shell grid gap-7 py-8 sm:py-10 lg:grid-cols-3 lg:gap-10 lg:py-12">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-line bg-white p-5 shadow-e1 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Cómo funciona</p>
            <div className="mt-4 space-y-4">
              {[
                ['01', 'Completa tus datos', 'Usaremos esta información para identificar tu solicitud.'],
                ['02', 'Explica lo ocurrido', 'Incluye fechas, pedido y la solución que esperas.'],
                ['03', 'Guarda tu código', 'Lo necesitarás junto con tu documento para consultar el estado.'],
              ].map(([number, title, description]) => (
                <div key={number} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-card bg-brand-50 text-xs font-black text-brand-700">{number}</span>
                  <div>
                    <p className="text-sm font-black text-ink">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 rounded-card border border-brand-200 bg-brand-50 p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Datos del proveedor</p>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              {business.legalName}{business.ruc && <><br />RUC {business.ruc}</>}{business.address && <><br />{business.address}</>}
            </p>
            <a href={`mailto:${business.supportEmail}`} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:underline">
              <ShieldCheck className="size-4" aria-hidden="true" /> {business.supportEmail}
            </a>
          </div>
          <div className="mt-5 rounded-card border border-line bg-white p-5 text-sm leading-6 text-ink-muted shadow-e1">
            Esta vía no impide acudir a otras soluciones ni es requisito previo para presentar una denuncia ante INDECOPI.
          </div>
        </aside>

        <div className="min-w-0 lg:col-span-2" id="formulario-reclamo">
          <div className="rounded-card border border-line bg-white p-5 shadow-e1 sm:p-7">
            <div className="border-b border-line pb-4">
              <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Gestiona tu solicitud</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-ink">¿Qué necesitas hacer?</h2>
            </div>
            <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 3 }}>
              <Tab label="Presentar" />
              <Tab label="Consultar estado" />
            </Tabs>

            {tab === 0 ? (
              <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
                <Paper className="complaint-panel" variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 'var(--radius-card)' }}>
                  <Typography variant="overline" color="primary" sx={{ fontWeight: 800 }}>Tipo de solicitud</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1.5, mb: 1 }}>
                    <TextField select fullWidth label="Tipo" defaultValue="RECLAMO" {...register('type')}>
                      <MenuItem value="RECLAMO">Reclamo</MenuItem>
                      <MenuItem value="QUEJA">Queja</MenuItem>
                    </TextField>
                    <TextField select fullWidth label="Sobre" defaultValue="PRODUCTO" {...register('itemType')}>
                      <MenuItem value="PRODUCTO">Un producto</MenuItem>
                      <MenuItem value="SERVICIO">Un servicio</MenuItem>
                    </TextField>
                  </Stack>
                  <Alert severity="info" icon={false} sx={{ mb: 3 }}>{TYPE_HELP[type]}</Alert>

                  <Typography variant="overline" color="primary" sx={{ fontWeight: 800 }}>Tus datos</Typography>
                  <Stack spacing={2} sx={{ mt: 1.5, mb: 3 }}>
                    <TextField label="Nombre completo" fullWidth error={Boolean(errors.consumerName)} helperText={errors.consumerName?.message} {...register('consumerName')} />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField select label="Documento" sx={{ minWidth: 140 }} defaultValue="DNI" {...register('docType')}>
                        <MenuItem value="DNI">DNI</MenuItem><MenuItem value="CE">Carné de extranjería</MenuItem><MenuItem value="PASAPORTE">Pasaporte</MenuItem><MenuItem value="RUC">RUC</MenuItem>
                      </TextField>
                      <TextField label="Número" fullWidth inputMode="numeric" error={Boolean(errors.docNumber)} helperText={errors.docNumber?.message} {...register('docNumber')} />
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField label="Correo electrónico" type="email" fullWidth error={Boolean(errors.email)} helperText={errors.email?.message ?? 'Ahí recibirás la copia y la respuesta'} {...register('email')} />
                      <TextField label="Teléfono" type="tel" fullWidth {...register('phone')} />
                    </Stack>
                    <TextField label="Dirección (opcional)" fullWidth {...register('address')} />
                    <FormControlLabel control={<Checkbox {...register('isMinor')} />} label="El consumidor es menor de edad" />
                    {isMinor && <TextField label="Nombre del padre, madre o apoderado" fullWidth error={Boolean(errors.guardianName)} helperText={errors.guardianName?.message} {...register('guardianName')} />}
                  </Stack>

                  <Typography variant="overline" color="primary" sx={{ fontWeight: 800 }}>Detalle</Typography>
                  <Stack spacing={2} sx={{ mt: 1.5 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField label="N° de pedido (si aplica)" fullWidth placeholder="VB-XXXX-0000" {...register('orderNumber')} />
                      <TextField label="Monto reclamado (opcional)" fullWidth inputMode="decimal" placeholder="S/" {...register('claimedAmount')} />
                    </Stack>
                    <TextField label="Producto o servicio contratado (opcional)" fullWidth {...register('itemDescription')} />
                    <TextField label="Detalle de lo ocurrido" fullWidth multiline minRows={3} error={Boolean(errors.detail)} helperText={errors.detail?.message} {...register('detail')} />
                    <TextField label="¿Qué solución esperas?" fullWidth multiline minRows={2} error={Boolean(errors.request)} helperText={errors.request?.message} {...register('request')} />
                  </Stack>

                  <Divider sx={{ my: 3 }} />
                  <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting} startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : undefined} sx={{ minHeight: 48 }}>
                    {isSubmitting ? 'Registrando…' : 'Registrar en el Libro de Reclamaciones'}
                  </Button>
                </Paper>
              </Box>
            ) : <TrackComplaint />}
          </div>
        </div>
      </div>
    </div>
  );
};

const STATUS_LABEL: Record<ComplaintStatusResult['status'], string> = {
  RECEIVED: 'Recibido',
  IN_PROGRESS: 'En proceso',
  RESOLVED: 'Respondido',
};

const TrackComplaint = () => {
  const [code, setCode] = useState('');
  const [doc, setDoc] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComplaintStatusResult | null>(null);

  const canSearch = useMemo(() => code.trim().length >= 3 && doc.trim().length >= 6, [code, doc]);

  const search = async () => {
    setLoading(true);
    setResult(null);
    try {
      setResult(await complaintsApi.track(code.trim(), doc.trim()));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper className="complaint-panel" variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 'var(--radius-card)' }}>
      <Typography color="text.secondary" sx={{ mb: 2.5 }}>Ingresa el código que te dimos y tu número de documento.</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField label="Código" placeholder="LR-000000" fullWidth value={code} onChange={(e) => setCode(e.target.value)} />
        <TextField label="N° de documento" fullWidth value={doc} onChange={(e) => setDoc(e.target.value)} />
      </Stack>
      <Button variant="contained" disabled={!canSearch || loading} onClick={search} sx={{ minHeight: 46 }}>{loading ? 'Buscando…' : 'Consultar'}</Button>

      {result && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 2 }} />
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{result.code}</Typography>
            <Chip size="small" color={result.status === 'RESOLVED' ? 'success' : 'default'} label={STATUS_LABEL[result.status]} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Presentado el {new Date(result.createdAt).toLocaleDateString('es-PE')} · respuesta comprometida para el {new Date(result.dueAt).toLocaleDateString('es-PE')}.
          </Typography>
          {result.response ? (
            <Alert icon={<ShieldCheck size={18} />} severity="success" sx={{ mt: 2, whiteSpace: 'pre-line' }}>{result.response}</Alert>
          ) : (
            <Alert severity="info" sx={{ mt: 2 }}>Aún estamos trabajando en tu caso. Te avisaremos por correo apenas tengamos una respuesta.</Alert>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default ComplaintsPage;
