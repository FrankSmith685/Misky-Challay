import { z } from 'zod';
import { coordinatePairIssue, hasCoordinatePair } from '@shared/utils/coordinates';

export const districtsSchema = z.object({
  query: z.object({
    cityId: z.coerce.number().int().positive(),
  }),
});

export const provincesSchema = z.object({
  query: z.object({
    departmentCode: z.string().regex(/^\d{2}$/),
  }),
});

export const geographicDistrictsSchema = z.object({
  query: z.object({
    provinceCode: z.string().regex(/^\d{4}$/),
  }),
});

export const branchesSchema = z.object({
  query: z.object({
    cityId: z.coerce.number().int().positive().optional(),
  }),
});

/** Cobertura: se acepta el par de coordenadas o el distrito (al menos uno). */
export const coverageSchema = z.object({
  body: z
    .object({
      cityId: z.coerce.number().int().positive().optional(),
      districtId: z.coerce.number().int().positive().optional(),
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
    })
    .refine(
      hasCoordinatePair,
      coordinatePairIssue,
    )
    .refine(
      (value) =>
        value.districtId !== undefined ||
        (value.latitude !== undefined && value.longitude !== undefined),
      { message: 'Envia districtId o el par latitude/longitude' },
    ),
});

export const slotsSchema = z.object({
  query: z.object({
    branchId: z.coerce.number().int().positive(),
    days: z.coerce.number().int().min(1).max(30).optional(),
  }),
});

export const addressSuggestionsSchema = z.object({
  query: z.object({
    q: z.string().trim().min(2).max(160),
    cityId: z.coerce.number().int().positive().optional(),
    districtId: z.coerce.number().int().positive().optional(),
    department: z.string().trim().min(2).max(80).optional(),
    province: z.string().trim().min(2).max(80).optional(),
    district: z.string().trim().min(2).max(80).optional(),
  }),
});

export const resolveAddressSchema = z.object({
  body: z.object({
    query: z.string().trim().min(2).max(240),
    cityId: z.coerce.number().int().positive().optional(),
    districtId: z.coerce.number().int().positive().optional(),
    department: z.string().trim().min(2).max(80).optional(),
    province: z.string().trim().min(2).max(80).optional(),
    district: z.string().trim().min(2).max(80).optional(),
  }),
});

export const reverseAddressSchema = z.object({
  body: z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    cityId: z.coerce.number().int().positive().optional(),
  }),
});

export type CoverageInput = z.infer<typeof coverageSchema>['body'];
