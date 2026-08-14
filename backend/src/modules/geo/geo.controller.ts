import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { geoService } from './geo.service';
import { geocodingService } from './geocoding.service';
import { peruUbigeoService } from './peruUbigeo.service';

/** Modulo GEO: ciudades, distritos, zonas de cobertura, sucursales y franjas. */
export const geoController = {
  cities: asyncHandler(async (_req: Request, res: Response) => {
    const cities = await geoService.listCities();
    return ok(res, cities);
  }),

  departments: asyncHandler(async (_req: Request, res: Response) => {
    return ok(res, peruUbigeoService.listDepartments());
  }),

  provinces: asyncHandler(async (req: Request, res: Response) => {
    return ok(res, peruUbigeoService.listProvinces(String(req.query.departmentCode)));
  }),

  geographicDistricts: asyncHandler(async (req: Request, res: Response) => {
    return ok(res, peruUbigeoService.listDistricts(String(req.query.provinceCode)));
  }),

  addressSuggestions: asyncHandler(async (req: Request, res: Response) => {
    const rows = await geocodingService.suggestions(
      String(req.query.q),
      req.query.cityId ? Number(req.query.cityId) : undefined,
      req.query.districtId ? Number(req.query.districtId) : undefined,
      {
        department: req.query.department ? String(req.query.department) : undefined,
        province: req.query.province ? String(req.query.province) : undefined,
        district: req.query.district ? String(req.query.district) : undefined,
      },
    );
    return ok(res, rows);
  }),

  resolveAddress: asyncHandler(async (req: Request, res: Response) => {
    const result = await geocodingService.resolve(req.body.query, req.body.cityId, req.body.districtId, {
      department: req.body.department,
      province: req.body.province,
      district: req.body.district,
    });
    return ok(res, result, result ? 'Direccion ubicada' : 'No encontramos una coincidencia exacta');
  }),

  reverseAddress: asyncHandler(async (req: Request, res: Response) => {
    const result = await geocodingService.reverse(req.body.latitude, req.body.longitude, req.body.cityId);
    return ok(res, result, result ? 'Punto convertido en direccion' : 'No encontramos una direccion para ese punto');
  }),

  districts: asyncHandler(async (req: Request, res: Response) => {
    const districts = await geoService.listDistricts(Number(req.query.cityId));
    return ok(res, districts);
  }),

  branches: asyncHandler(async (req: Request, res: Response) => {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const branches = await geoService.listBranches(cityId);
    return ok(res, branches);
  }),

  /** RN-001: sin zona activa no se puede prometer entrega. */
  coverage: asyncHandler(async (req: Request, res: Response) => {
    const result = await geoService.checkCoverage(req.body);
    return ok(
      res,
      result,
      result.covered ? 'Llegamos a tu direccion' : (result.reason ?? 'Sin cobertura'),
    );
  }),

  slots: asyncHandler(async (req: Request, res: Response) => {
    const branchId = Number(req.query.branchId);
    const days = req.query.days ? Number(req.query.days) : undefined;
    const slots = await geoService.listSlots(branchId, new Date(), days);
    return ok(res, slots);
  }),
};
