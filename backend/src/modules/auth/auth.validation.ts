import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Email invalido'),
    password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
    firstName: z.string().min(2, 'Nombre demasiado corto'),
    lastName: z.string().min(2, 'Apellido demasiado corto'),
    // El formato es libre (con espacios o guiones); el servicio lo normaliza a
    // digitos antes de compararlo y guardarlo. Lo que se exige aqui es que haya
    // un numero de verdad detras.
    phone: z
      .string()
      .trim()
      .max(20)
      .refine((value) => value.replace(/\D/g, '').length >= 6, 'Telefono invalido')
      .optional(),
    // El consentimiento se valida en el servidor, no solo en el formulario: un
    // registro sin aceptacion expresa es invalido bajo la Ley 29733, venga de donde
    // venga la peticion.
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'Debes aceptar los terminos y la politica de privacidad' }),
    }),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Email invalido'),
    password: z.string().min(1, 'La contrasena es obligatoria'),
    mfaCode: z.string().trim().regex(/^(\d{6}|[A-Fa-f0-9]{10})$/, 'Código MFA inválido').optional(),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10, 'Refresh token invalido'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Email invalido'),
    client: z.enum(['WEB', 'MOBILE']).optional().default('WEB'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    // El token identifica al usuario, asi que reset NO pide email: no enumera cuentas.
    token: z.string().min(20, 'Token invalido'),
    password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshInput = z.infer<typeof refreshSchema>['body'];
