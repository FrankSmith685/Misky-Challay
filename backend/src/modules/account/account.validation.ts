import { z } from 'zod';

const addressBody = z.object({
  label: z.string().min(2).max(50).default('Casa'),
  line1: z.string().min(5, 'Ingresa la direccion completa').max(200),
  reference: z.string().max(200).optional(),
  districtId: z.coerce.number().int().positive().nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const createAddressSchema = z.object({ body: addressBody });

export const updateAddressSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: addressBody.partial(),
});

export const addressIdSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
});

/** Datos editables del perfil del cliente (el email no se cambia aqui). */
export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(2, 'Nombre demasiado corto').max(80).optional(),
    lastName: z.string().min(2, 'Apellido demasiado corto').max(80).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{6,20}$/, 'Telefono invalido')
      .max(30)
      .optional()
      .or(z.literal('')),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Ingresa tu contrasena actual'),
    newPassword: z.string().min(8, 'La nueva contrasena debe tener al menos 8 caracteres'),
  }),
});

const savedBowlBody = z.object({
  name: z.string().trim().min(2).max(80),
  productId: z.coerce.number().int().positive(),
  variantId: z.coerce.number().int().positive(),
  selections: z.array(z.object({
    optionId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1).max(10),
  })).min(1).max(30),
});

export const createSavedBowlSchema = z.object({ body: savedBowlBody });
export const updateSavedBowlSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: savedBowlBody.partial(),
});
export const savedBowlIdSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
});

export const updateFoodPreferencesSchema = z.object({
  body: z.object({
    allergens: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    dietaryTags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    dislikedOptionIds: z.array(z.coerce.number().int().positive()).max(100).default([]),
    calorieTarget: z.coerce.number().int().min(300).max(5000).nullable().optional(),
    proteinTarget: z.coerce.number().int().min(0).max(500).nullable().optional(),
  }),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>['body'];
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>['body'];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
export type CreateSavedBowlInput = z.infer<typeof createSavedBowlSchema>['body'];
export type UpdateSavedBowlInput = z.infer<typeof updateSavedBowlSchema>['body'];
export type UpdateFoodPreferencesInput = z.infer<typeof updateFoodPreferencesSchema>['body'];
