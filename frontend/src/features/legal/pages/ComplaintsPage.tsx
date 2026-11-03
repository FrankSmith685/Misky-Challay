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
  Container,
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
import { BookText, CheckCircle2, ShieldCheck } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { getApiErrorMessage } from '@services/api/client';
import { useBusinessInfo } from '@services/businessInfo';
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
      <Container maxWidth="sm" sx={{ py: { xs: 6, md: 9 } }}>
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, textAlign: 'center', borderRadius: 'var(--radius-card)' }}>
          <CheckCircle2 size={44} className="text-brand-600" />
          <Typography variant="h5" sx={{ mt: 2, fontWeight: 800 }}>
            Registramos tu {type === 'QUEJA' ? 'queja' : 'reclamo'}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Guarda tu código. Con él y tu documento puedes consultar el estado cuando quieras.
          </Typography>
          <Box sx={{ my: 3, py: 2, bgcolor: 'action.hover', borderRadius: 'var(--radius-card)' }}>
            <Typography variant="overline" color="text.secondary">
              Código
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: 1 }}>
              {receipt.code}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Te enviamos una copia a tu correo. Responderemos a más tardar el{' '}
            <strong>{new Date(receipt.dueAt).toLocaleDateString('es-PE')}</strong>.
          </Typography>
          <Button sx={{ mt: 3 }} onClick={() => setReceipt(null)}>
            Presentar otro
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
        <BookText size={26} className="text-brand-600" />
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Libro de Reclamaciones
        </Typography>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        Conforme al Código de Protección y Defensa del Consumidor. {business.legalName} · RUC{' '}
        {business.ruc} · {business.address}.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        La formulación de un reclamo no impide acudir a otras vías de solución de controversias ni
        es requisito previo para denunciar ante INDECOPI.
      </Typography>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 3 }}>
        <Tab label="Presentar" />
        <Tab label="Consultar estado" />
      </Tabs>

      {tab === 0 ? (
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 'var(--radius-card)' }}>
            <Typography variant="overline" color="primary" sx={{ fontWeight: 800 }}>
              Tipo de solicitud
            </Typography>
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
            <Alert severity="info" icon={false} sx={{ mb: 3 }}>
              {TYPE_HELP[type]}
            </Alert>

            <Typography variant="overline" color="primary" sx={{ fontWeight: 800 }}>
              Tus datos
            </Typography>
            <Stack spacing={2} sx={{ mt: 1.5, mb: 3 }}>
              <TextField
                label="Nombre completo"
                fullWidth
                error={Boolean(errors.consumerName)}
                helperText={errors.consumerName?.message}
                {...register('consumerName')}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField select label="Documento" sx={{ minWidth: 140 }} defaultValue="DNI" {...register('docType')}>
                  <MenuItem value="DNI">DNI</MenuItem>
                  <MenuItem value="CE">Carné de extranjería</MenuItem>
                  <MenuItem value="PASAPORTE">Pasaporte</MenuItem>
                  <MenuItem value="RUC">RUC</MenuItem>
                </TextField>
                <TextField
                  label="Número"
                  fullWidth
                  inputMode="numeric"
                  error={Boolean(errors.docNumber)}
                  helperText={errors.docNumber?.message}
                  {...register('docNumber')}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Correo electrónico"
                  type="email"
                  fullWidth
                  error={Boolean(errors.email)}
                  helperText={errors.email?.message ?? 'Ahí recibirás la copia y la respuesta'}
                  {...register('email')}
                />
                <TextField label="Teléfono" type="tel" fullWidth {...register('phone')} />
              </Stack>
              <TextField label="Dirección (opcional)" fullWidth {...register('address')} />

              <FormControlLabel
                control={<Checkbox {...register('isMinor')} />}
                label="El consumidor es menor de edad"
              />
              {isMinor && (
                <TextField
                  label="Nombre del padre, madre o apoderado"
                  fullWidth
                  error={Boolean(errors.guardianName)}
                  helperText={errors.guardianName?.message}
                  {...register('guardianName')}
                />
              )}
            </Stack>

            <Typography variant="overline" color="primary" sx={{ fontWeight: 800 }}>
              Detalle
            </Typography>
            <Stack spacing={2} sx={{ mt: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="N° de pedido (si aplica)"
                  fullWidth
                  placeholder="VB-XXXX-0000"
                  {...register('orderNumber')}
                />
                <TextField
                  label="Monto reclamado (opcional)"
                  fullWidth
                  inputMode="decimal"
                  placeholder="S/"
                  {...register('claimedAmount')}
                />
              </Stack>
              <TextField
                label="Producto o servicio contratado (opcional)"
                fullWidth
                {...register('itemDescription')}
              />
              <TextField
                label="Detalle de lo ocurrido"
                fullWidth
                multiline
                minRows={3}
                error={Boolean(errors.detail)}
                helperText={errors.detail?.message}
                {...register('detail')}
              />
              <TextField
                label="¿Qué solución esperas?"
                fullWidth
                multiline
                minRows={2}
                error={Boolean(errors.request)}
                helperText={errors.request?.message}
                {...register('request')}
              />
            </Stack>

            <Divider sx={{ my: 3 }} />
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : undefined}
              sx={{ minHeight: 48 }}
            >
              {isSubmitting ? 'Registrando…' : 'Registrar en el Libro de Reclamaciones'}
            </Button>
          </Paper>
        </Box>
      ) : (
        <TrackComplaint />
      )}
    </Container>
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
    <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 'var(--radius-card)' }}>
      <Typography color="text.secondary" sx={{ mb: 2.5 }}>
        Ingresa el código que te dimos y tu número de documento.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField label="Código" placeholder="LR-000000" fullWidth value={code} onChange={(e) => setCode(e.target.value)} />
        <TextField label="N° de documento" fullWidth value={doc} onChange={(e) => setDoc(e.target.value)} />
      </Stack>
      <Button variant="contained" disabled={!canSearch || loading} onClick={search} sx={{ minHeight: 46 }}>
        {loading ? 'Buscando…' : 'Consultar'}
      </Button>

      {result && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 2 }} />
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {result.code}
            </Typography>
            <Chip
              size="small"
              color={result.status === 'RESOLVED' ? 'success' : 'default'}
              label={STATUS_LABEL[result.status]}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Presentado el {new Date(result.createdAt).toLocaleDateString('es-PE')} · respuesta
            comprometida para el {new Date(result.dueAt).toLocaleDateString('es-PE')}.
          </Typography>
          {result.response ? (
            <Alert icon={<ShieldCheck size={18} />} severity="success" sx={{ mt: 2, whiteSpace: 'pre-line' }}>
              {result.response}
            </Alert>
          ) : (
            <Alert severity="info" sx={{ mt: 2 }}>
              Aún estamos trabajando en tu caso. Te avisaremos por correo apenas tengamos una
              respuesta.
            </Alert>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default ComplaintsPage;
