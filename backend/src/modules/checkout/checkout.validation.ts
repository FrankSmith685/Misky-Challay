import { z } from 'zod';

const itemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  variantId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(20),
  selections: z
    .array(
      z.object({
        optionId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(1).max(10).default(1),
      }),
    )
    .max(30)
    .default([]),
  specialInstructions: z.string().max(255).optional(),
});

const addressSchema = z.object({
  label: z.string().max(50).optional(),
  line1: z.string().min(5).max(200),
  reference: z.string().max(200).optional(),
  districtId: z.coerce.number().int().positive().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

const checkoutBody = z
  .object({
    items: z.array(itemSchema).min(1, 'El carrito esta vacio').max(30),
    deliveryType: z.enum(['DELIVERY', 'PICKUP']),
    serviceMode: z.enum(['ASAP', 'SCHEDULED']).default('ASAP'),
    address: addressSchema.optional(),
    branchId: z.coerce.number().int().positive().optional(),
    deliverySlotId: z.coerce.number().int().positive().optional(),
    couponCode: z.string().max(40).optional(),
    /** El cliente decide si gasta el saldo de su plan en este pedido. */
    useWallet: z.boolean().optional(),
    contactName: z.string().max(120).optional(),
    contactPhone: z.string().max(30).optional(),
    // Cocina y reparto se guardan juntos con etiquetas; admite ambos campos de 250 caracteres.
    notes: z.string().max(600).optional(),
  })
  .refine((value) => value.deliveryType === 'PICKUP' || value.address !== undefined, {
    message: 'Para delivery necesitas enviar la direccion',
    path: ['address'],
  })
  .refine((value) => value.deliveryType === 'DELIVERY' || value.branchId !== undefined, {
    message: 'Para recojo necesitas elegir el local',
    path: ['branchId'],
  });

export const quoteSchema = z.object({ body: checkoutBody });

export const placeSchema = z.object({
  body: z.intersection(
    checkoutBody,
    z.object({
      /** RN-015: el frontend genera esta clave UNA vez por intento de compra. */
      idempotencyKey: z.string().min(8).max(80),
    }),
  ),
});

export type CheckoutBody = z.infer<typeof checkoutBody>;
