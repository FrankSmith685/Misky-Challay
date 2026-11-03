import { z } from 'zod';
import { BUILDER_EVENT_TYPES } from '@database/models/builderEvent.model';

export const configSchema = z.object({
  params: z.object({ productId: z.coerce.number().int().positive() }),
  query: z.object({
    branchId: z.coerce
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
  }),
});

export const quoteSchema = z.object({
  body: z.object({
    productId: z.coerce.number().int().positive(),
    variantId: z.coerce.number().int().positive(),
    requestedServings: z.coerce.number().int().min(1).max(500).optional(),
    themeId: z.coerce.number().int().positive().optional(),
    themeVersion: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().int().min(1).max(20).default(1),
    branchId: z.coerce
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
    selections: z
      .array(
        z.object({
          optionId: z.coerce.number().int().positive(),
          quantity: z.coerce.number().int().min(1).max(10).default(1),
        }),
      )
      .max(30)
      .default([]),
  }),
});

export type QuoteBody = z.infer<typeof quoteSchema>['body'];

export const builderEventSchema = z.object({
  body: z.object({
    sessionId: z.string().uuid(),
    productId: z.coerce.number().int().positive(),
    eventType: z.enum(BUILDER_EVENT_TYPES),
    groupId: z.coerce.number().int().positive().nullable().optional(),
    optionId: z.coerce.number().int().positive().nullable().optional(),
    presetId: z.coerce.number().int().positive().nullable().optional(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().optional(),
  }),
});
