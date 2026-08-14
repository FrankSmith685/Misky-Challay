import { z } from 'zod';
import { coordinatePairIssue, hasCoordinatePair } from '@shared/utils/coordinates';

const addressFields = {
  label: z.string().min(2).max(50).default('Casa'),
  line1: z.string().min(5, 'Ingresa la direccion completa').max(200),
  reference: z.string().max(200).optional(),
  districtId: z.coerce.number().int().positive().nullable().optional(),
  ubigeoCode: z
    .string()
    .regex(/^\d{6}$/, 'UBIGEO inválido')
    .nullable()
    .optional(),
  departmentName: z.string().trim().min(2).max(100).nullable().optional(),
  provinceName: z.string().trim().min(2).max(100).nullable().optional(),
  districtName: z.string().trim().min(2).max(100).nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().optional(),
};

const addressBody = z.object(addressFields).refine(hasCoordinatePair, coordinatePairIssue);
const partialAddressBody = z.object(addressFields).partial().refine(hasCoordinatePair, coordinatePairIssue);

export const createAddressSchema = z.object({ body: addressBody });

export const updateAddressSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: partialAddressBody,
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
  selections: z
    .array(
      z.object({
        optionId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(30),
});

export const createSavedBowlSchema = z.object({ body: savedBowlBody });
export const updateSavedBowlSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: savedBowlBody.partial(),
});
export const savedBowlIdSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
});

/**
 * Contexto de compra: donde entregamos. La cobertura no se acepta del cliente,
 * se recalcula al recuperarlo (RN-001), asi que aqui solo viajan referencias.
 */
export const updatePurchaseContextSchema = z.object({
  body: z.object({
    deliveryType: z.enum(['DELIVERY', 'PICKUP']),
    cityId: z.coerce.number().int().positive().nullable().optional(),
    branchId: z.coerce.number().int().positive().nullable().optional(),
    addressId: z.coerce.number().int().positive().nullable().optional(),
  }),
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
export type UpdatePurchaseContextInput = z.infer<typeof updatePurchaseContextSchema>['body'];
