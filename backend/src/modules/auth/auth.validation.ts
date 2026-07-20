import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Email invalido'),
    password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
    firstName: z.string().min(2, 'Nombre demasiado corto'),
    lastName: z.string().min(2, 'Apellido demasiado corto'),
    phone: z.string().min(6).max(20).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email invalido'),
    password: z.string().min(1, 'La contrasena es obligatoria'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10, 'Refresh token invalido'),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshInput = z.infer<typeof refreshSchema>['body'];
