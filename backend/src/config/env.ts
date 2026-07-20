import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/** Convierte "true"/"false" de las variables de entorno en boolean real. */
const booleanFromString = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value.toLowerCase() === 'true'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /**
   * Saltos de proxy de confianza para leer X-Forwarded-For (nginx, Cloud Run, Railway...).
   * Sin esto, express ve la IP del proxy: el rate limiting pasa a ser una cuota unica
   * compartida por toda la plataforma y audit_logs registra siempre la misma IP.
   * En desarrollo va en 0 para que nadie pueda falsear su IP con una cabecera.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

  /** Zona horaria de la operacion. Fija el reloj del proceso: los contenedores arrancan en UTC. */
  TZ: z.string().default('America/Lima'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().default('verde_bowl_v3'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_LOGGING: booleanFromString(false),
  DB_AUTO_CREATE: booleanFromString(true),

  DB_SYNC: booleanFromString(true),
  DB_ALTER: booleanFromString(true),
  DB_FORCE: booleanFromString(false),
  DB_SEED: booleanFromString(true),
  /** Datos comerciales para revisar la app. Desactivar explícitamente en producción. */
  SEED_DEMO_DATA: booleanFromString(true),

  JWT_ACCESS_SECRET: z.string().min(10, 'JWT_ACCESS_SECRET es obligatorio'),
  JWT_REFRESH_SECRET: z.string().min(10, 'JWT_REFRESH_SECRET es obligatorio'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(14).default(10),

  ADMIN_EMAIL: z.string().email().default('admin@verdebowl.com'),
  ADMIN_PASSWORD: z.string().min(6).default('Admin123*'),

  // URL publica del frontend: se usa en los enlaces de retorno del pago.
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Geocodificacion. Geoapify habilita sugerencias reales mientras se escribe.
  // Sin clave se conserva una sugerencia contextual y Nominatim solo se consulta
  // cuando el usuario confirma explicitamente que desea ubicarla en el mapa.
  GEOAPIFY_API_KEY: z.string().optional(),
  GEOAPIFY_BASE_URL: z.string().url().default('https://api.geoapify.com/v1/geocode'),
  NOMINATIM_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
  ROUTING_BASE_URL: z.string().url().optional(),

  // Pagos. Sin STRIPE_SECRET_KEY se usa el simulador local (nunca en produccion).
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  MOCK_WEBHOOK_SECRET: z.string().min(8).default('dev-mock-webhook-secret'),

  // IGV. El precio del catalogo ya lo incluye (obligatorio de cara al consumidor en
  // Peru); esta tasa solo sirve para DESGLOSARLO en el pedido y en el comprobante.
  // Se guarda ademas en cada pedido, para que un cambio de tasa no reescriba el pasado.
  IGV_RATE: z.coerce.number().min(0).max(1).default(0.18),

  // --- Identidad legal del negocio -------------------------------------------
  // Datos del proveedor que la ley peruana obliga a mostrar al consumidor (razon
  // social, RUC, domicilio) y que encabezan el Libro de Reclamaciones y los correos.
  // Los valores por defecto son marcadores: rellenalos con los datos reales de tu
  // empresa antes de vender. No hacen falta para desarrollar.
  BUSINESS_LEGAL_NAME: z.string().default('Verde Bowl S.A.C.'),
  BUSINESS_COMMERCIAL_NAME: z.string().default('Verde Bowl'),
  BUSINESS_RUC: z.string().default('20600000000'),
  BUSINESS_ADDRESS: z.string().default('Av. Ejemplo 123, Miraflores, Lima'),
  BUSINESS_PHONE: z.string().default('+51 999 999 999'),
  BUSINESS_EMAIL: z.string().default('hola@verdebowl.com'),
  /** Correo al que se dirigen los reclamos y las solicitudes de datos personales. */
  BUSINESS_SUPPORT_EMAIL: z.string().default('reclamos@verdebowl.com'),
  /** Dias habiles para responder un reclamo del Libro (INDECOPI). */
  COMPLAINT_RESPONSE_DAYS: z.coerce.number().int().min(1).max(60).default(15),

  // Franjas de entrega programada. Un job las mantiene generadas con horizonte movil:
  // antes solo existia un boton en el panel que creaba 7 dias y, al octavo, la entrega
  // programada desaparecia de la web sin error ni aviso.
  SLOT_HORIZON_DAYS: z.coerce.number().int().min(1).max(60).default(14),
  SLOT_CAPACITY: z.coerce.number().int().min(1).default(20),
  /** Ventanas de entrega, formato "inicio-fin" en horas locales, separadas por coma. */
  SLOT_WINDOWS: z.string().default('12-14,19-21'),
  SLOT_CUTOFF_HOURS: z.coerce.number().min(0).max(48).default(2),

  // Email. Sin MAIL_HOST los correos se imprimen en la consola (solo desarrollo).
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().email().default('hola@verdebowl.com'),
  MAIL_FROM_NAME: z.string().default('Verde Bowl'),
});

/**
 * Guarda de produccion. Los interruptores de base de datos y las credenciales de ejemplo
 * vienen en `true` / con valor por defecto para que `npm run dev` funcione sin configurar nada.
 * Ese mismo default, desplegado, arranca en silencio con datos demo en la tienda real,
 * ALTER TABLE sobre todos los modelos en cada reinicio y el superadmin publicado en .env.example.
 * Aqui se convierte "arranca inseguro" en "no arranca".
 */
const productionGuard = (value: z.infer<typeof envSchema>, ctx: z.RefinementCtx): void => {
  if (value.NODE_ENV !== 'production') return;

  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (value.DB_ALTER) fail('DB_ALTER', 'debe ser false en produccion: usa migraciones');
  if (value.DB_SYNC) fail('DB_SYNC', 'debe ser false en produccion: usa migraciones');
  if (value.DB_FORCE) fail('DB_FORCE', 'BORRA todas las tablas: jamas en produccion');
  if (value.SEED_DEMO_DATA)
    fail('SEED_DEMO_DATA', 'debe ser false en produccion: inyecta catalogo de prueba');
  if (value.DB_AUTO_CREATE)
    fail('DB_AUTO_CREATE', 'debe ser false en produccion: la base se crea con migraciones');

  if (!value.DB_PASSWORD) fail('DB_PASSWORD', 'es obligatoria en produccion');
  if (value.DB_USER === 'root') fail('DB_USER', 'no uses root en produccion');

  if (value.ADMIN_PASSWORD === 'Admin123*')
    fail('ADMIN_PASSWORD', 'sigue siendo la contrasena de ejemplo publicada en .env.example');
  if (value.MOCK_WEBHOOK_SECRET === 'dev-mock-webhook-secret')
    fail('MOCK_WEBHOOK_SECRET', 'sigue siendo el secreto de ejemplo');

  if (value.JWT_ACCESS_SECRET.length < 32)
    fail('JWT_ACCESS_SECRET', 'debe tener al menos 32 caracteres en produccion');
  if (value.JWT_REFRESH_SECRET.length < 32)
    fail('JWT_REFRESH_SECRET', 'debe tener al menos 32 caracteres en produccion');
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET)
    fail('JWT_REFRESH_SECRET', 'debe ser distinto de JWT_ACCESS_SECRET');

  const localOrigin = value.CORS_ORIGIN.split(',').some((origin) =>
    /localhost|127\.0\.0\.1/i.test(origin),
  );
  if (localOrigin) fail('CORS_ORIGIN', 'no puede incluir localhost en produccion');
  if (value.CORS_ORIGIN.trim() === '*') fail('CORS_ORIGIN', 'no puede ser * con credentials: true');
  if (/localhost|127\.0\.0\.1/i.test(value.FRONTEND_URL))
    fail('FRONTEND_URL', 'apunta a localhost: los enlaces de pago y correo quedarian rotos');

  if (!value.STRIPE_SECRET_KEY)
    fail('STRIPE_SECRET_KEY', 'es obligatoria en produccion: sin ella se usaria el simulador');
  if (!value.STRIPE_WEBHOOK_SECRET)
    fail('STRIPE_WEBHOOK_SECRET', 'es obligatoria: sin firma no se puede confirmar un pago');
  if (!value.MAIL_HOST)
    fail('MAIL_HOST', 'es obligatoria en produccion: los correos se perderian en la consola');

  if (value.TRUST_PROXY === 0)
    fail(
      'TRUST_PROXY',
      'ponlo en 1 si hay un proxy delante (lo habitual): sin esto el rate limiting es una cuota global',
    );
};

const parsed = envSchema.superRefine(productionGuard).safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Variables de entorno invalidas:\n${detail}`);
}

export const env = parsed.data;

// Los contenedores arrancan en UTC: sin esto un local 10:00-22:00 se evalua 05:00-17:00 en Lima.
process.env.TZ = env.TZ;

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
