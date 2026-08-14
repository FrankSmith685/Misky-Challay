import { z } from 'zod';
import { isValidDni, isValidRuc } from '@shared/utils/peruDocs';
import { coordinatePairIssue, hasCoordinatePair } from '@shared/utils/coordinates';

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
}).refine(
  hasCoordinatePair,
  coordinatePairIssue,
);

/**
 * Datos del comprobante (SUNAT). BOLETA no exige nada (se emite al consumidor con lo
 * que ya tenemos). FACTURA exige RUC de 11 digitos y razon social.
 */
const billingSchema = z
  .object({
    documentType: z.enum(['BOLETA', 'FACTURA']).default('BOLETA'),
    docNumber: z.string().trim().max(20).optional(),
    name: z.string().trim().max(200).optional(),
    address: z.string().trim().max(200).optional(),
  })
  .refine((value) => value.documentType !== 'FACTURA' || isValidRuc(value.docNumber ?? ''), {
    message: 'Ingresa un RUC valido',
    path: ['docNumber'],
  })
  .refine((value) => value.documentType !== 'FACTURA' || (value.name ?? '').trim().length >= 3, {
    message: 'La factura necesita la razon social',
    path: ['name'],
  })
  // En boleta el documento es opcional, pero si viene debe ser un DNI valido de 8 digitos.
  .refine(
    (value) => value.documentType !== 'BOLETA' || !value.docNumber || isValidDni(value.docNumber),
    { message: 'El DNI debe tener 8 digitos', path: ['docNumber'] },
  );

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
    /** ONLINE = tarjeta; CASH = contra entrega; YAPE/PLIN esperan validacion de Caja. */
    paymentMethod: z.enum(['ONLINE', 'CASH', 'YAPE', 'PLIN']).default('ONLINE'),
    mobilePayment: z.object({
      operationCode: z.string().trim().regex(/^[A-Za-z0-9-]{6,24}$/, 'Codigo de operacion invalido'),
      payerPhone: z.string().trim().regex(/^\d{9}$/, 'Ingresa los 9 digitos del celular').optional(),
    }).optional(),
    /** Canal controlado: decide el retorno del proveedor sin aceptar URLs externas. */
    client: z.enum(['WEB', 'MOBILE']).default('WEB'),
    /** Comprobante: boleta (por defecto) o factura con RUC. */
    billing: billingSchema.optional(),
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
  ).superRefine((value, context) => {
    if ((value.paymentMethod === 'YAPE' || value.paymentMethod === 'PLIN') && !value.mobilePayment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mobilePayment', 'operationCode'],
        message: 'Ingresa el codigo de operacion despues de pagar',
      });
    }
  }),
});

export type CheckoutBody = z.infer<typeof checkoutBody>;
