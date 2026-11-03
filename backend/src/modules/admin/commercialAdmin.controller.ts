import type { Request, Response } from 'express';
import { created, noContent, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { audit } from '@shared/utils/audit';
import { commercialAdminService } from './commercialAdmin.service';
import { customizationAdminService } from '@modules/customization/customizationAdmin.service';
import { builderInsightsService } from '@modules/customization/builderInsights.service';

/** ABM de cupones, planes, cobertura y constructor. Todo cambio sensible se audita. */
export const commercialAdminController = {
  getDraft: asyncHandler(async (req: Request, res: Response) => ok(res, await commercialAdminService.getDraft(String(req.params.key)))),
  saveDraft: asyncHandler(async (req: Request, res: Response) => ok(res, await commercialAdminService.saveDraft(req.user!.sub, String(req.params.key), req.body), req.body.publishAt ? 'Publicacion programada' : 'Borrador guardado')),
  deleteDraft: asyncHandler(async (req: Request, res: Response) => { await commercialAdminService.deleteDraft(String(req.params.key)); return noContent(res); }),

  // --- Cupones ---
  coupons: asyncHandler(async (_req: Request, res: Response) => {
    const coupons = await commercialAdminService.listCoupons();
    return ok(res, coupons, `${coupons.length} cupones`);
  }),

  createCoupon: asyncHandler(async (req: Request, res: Response) => {
    const coupon = await commercialAdminService.createCoupon(req.body);

    await audit(req, {
      action: 'promotion.coupon.create',
      entity: 'coupons',
      entityId: coupon.id,
      after: { code: coupon.code, type: coupon.discountType, value: Number(coupon.value) },
    });

    return created(res, { id: coupon.id, code: coupon.code }, 'Cupon creado');
  }),

  updateCoupon: asyncHandler(async (req: Request, res: Response) => {
    const { coupon, before } = await commercialAdminService.updateCoupon(
      Number(req.params.couponId),
      req.body,
    );

    await audit(req, {
      action: 'promotion.coupon.update',
      entity: 'coupons',
      entityId: coupon.id,
      before,
      after: { isActive: coupon.isActive },
    });

    return ok(res, { id: coupon.id, isActive: coupon.isActive }, 'Cupon actualizado');
  }),

  // --- Planes ---
  plans: asyncHandler(async (_req: Request, res: Response) => {
    const plans = await commercialAdminService.listPlans();
    return ok(res, plans, `${plans.length} planes`);
  }),

  createPlan: asyncHandler(async (req: Request, res: Response) => {
    const plan = await commercialAdminService.createPlan(req.body);

    await audit(req, {
      action: 'plan.create',
      entity: 'plans',
      entityId: plan.id,
      after: {
        code: plan.code,
        price: Number(plan.price),
        grantedCredit: Number(plan.grantedCredit),
      },
    });

    return created(res, { id: plan.id, code: plan.code }, 'Plan creado');
  }),

  updatePlan: asyncHandler(async (req: Request, res: Response) => {
    const { plan, before } = await commercialAdminService.updatePlan(
      Number(req.params.planId),
      req.body,
    );

    await audit(req, {
      action: 'plan.update',
      entity: 'plans',
      entityId: plan.id,
      before,
      after: {
        price: Number(plan.price),
        grantedCredit: Number(plan.grantedCredit),
        isActive: plan.isActive,
      },
    });

    return ok(res, { id: plan.id }, 'Plan actualizado');
  }),

  setPlanBenefit: asyncHandler(async (req: Request, res: Response) => {
    const planId = Number(req.params.planId);
    const benefit = await commercialAdminService.setPlanBenefit(planId, req.body);

    await audit(req, {
      action: 'plan.benefit.set',
      entity: 'plan_benefits',
      entityId: benefit.id,
      after: { type: benefit.type, value: Number(benefit.value) },
    });

    return ok(res, { id: benefit.id }, 'Beneficio guardado');
  }),

  removePlanBenefit: asyncHandler(async (req: Request, res: Response) => {
    const planId = Number(req.params.planId);
    const benefitId = Number(req.params.benefitId);

    await commercialAdminService.removePlanBenefit(planId, benefitId);
    await audit(req, { action: 'plan.benefit.remove', entity: 'plan_benefits', entityId: benefitId });

    return noContent(res);
  }),

  // --- Cobertura ---
  coverage: asyncHandler(async (_req: Request, res: Response) => {
    const coverage = await commercialAdminService.listCoverage();
    return ok(res, coverage);
  }),

  createBranch: asyncHandler(async (req: Request, res: Response) => {
    const branch = await commercialAdminService.createBranch(req.body);

    await audit(req, {
      action: 'geo.branch.create',
      entity: 'branches',
      entityId: branch.id,
      after: { name: branch.name },
    });

    return created(res, { id: branch.id }, 'Sucursal creada con horario 10:00-22:00');
  }),

  updateBranch: asyncHandler(async (req: Request, res: Response) => {
    const { branch, before } = await commercialAdminService.updateBranch(
      Number(req.params.branchId),
      req.body,
    );

    await audit(req, {
      action: 'geo.branch.update',
      entity: 'branches',
      entityId: branch.id,
      before,
      after: { prepMinutes: branch.prepMinutes, isActive: branch.isActive },
    });

    return ok(res, { id: branch.id }, 'Sucursal actualizada');
  }),

  setSchedule: asyncHandler(async (req: Request, res: Response) => {
    const branchId = Number(req.params.branchId);
    const schedule = await commercialAdminService.setSchedule(
      branchId,
      Number(req.body.weekday),
      req.body,
    );

    await audit(req, {
      action: 'geo.schedule.update',
      entity: 'branch_schedules',
      entityId: schedule.id,
      after: { weekday: schedule.weekday, opensAt: schedule.opensAt, closesAt: schedule.closesAt },
    });

    return ok(res, { id: schedule.id }, 'Horario actualizado');
  }),

  createZone: asyncHandler(async (req: Request, res: Response) => {
    const zone = await commercialAdminService.createZone(req.body);

    await audit(req, {
      action: 'geo.zone.create',
      entity: 'coverage_zones',
      entityId: zone.id,
      after: { name: zone.name, deliveryFee: Number(zone.deliveryFee), extraCoverageKm: Number(zone.extraCoverageKm), extraFeePerKm: Number(zone.extraFeePerKm) },
    });

    return created(res, { id: zone.id }, 'Zona creada');
  }),

  /** Cambiar el costo de delivery o el minimo afecta a TODOS los pedidos nuevos. */
  updateZone: asyncHandler(async (req: Request, res: Response) => {
    const { zone, before } = await commercialAdminService.updateZone(
      Number(req.params.zoneId),
      req.body,
    );

    await audit(req, {
      action: 'geo.zone.update',
      entity: 'coverage_zones',
      entityId: zone.id,
      before,
      after: {
        deliveryFee: Number(zone.deliveryFee),
        extraCoverageKm: Number(zone.extraCoverageKm),
        extraFeePerKm: Number(zone.extraFeePerKm),
        minimumOrder: Number(zone.minimumOrder),
        isActive: zone.isActive,
      },
    });

    return ok(res, { id: zone.id }, 'Zona actualizada');
  }),

  assignZone: asyncHandler(async (req: Request, res: Response) => {
    const zoneId = Number(req.params.zoneId);
    const link = await commercialAdminService.assignZoneToBranch(
      zoneId,
      Number(req.body.branchId),
      Number(req.body.priority ?? 1),
    );

    await audit(req, {
      action: 'geo.zone.assign_branch',
      entity: 'zone_branches',
      entityId: link.id,
      after: { zoneId, branchId: link.branchId },
    });

    return ok(res, { id: link.id }, 'Sucursal asignada a la zona');
  }),

  createDistrict: asyncHandler(async (req: Request, res: Response) => {
    const district = await commercialAdminService.createDistrict(req.body);

    await audit(req, {
      action: 'geo.district.create',
      entity: 'districts',
      entityId: district.id,
      after: { name: district.name },
    });

    return created(res, { id: district.id }, 'Distrito creado');
  }),

  /** Abrir o cerrar la cobertura de un distrito. */
  setDistrictZone: asyncHandler(async (req: Request, res: Response) => {
    const districtId = Number(req.params.districtId);
    const { district, before } = await commercialAdminService.setDistrictZone(
      districtId,
      req.body.coverageZoneId ?? null,
    );

    await audit(req, {
      action: 'geo.district.set_zone',
      entity: 'districts',
      entityId: district.id,
      before,
      after: { coverageZoneId: district.coverageZoneId },
    });

    return ok(
      res,
      { id: district.id, coverageZoneId: district.coverageZoneId },
      district.coverageZoneId ? 'Distrito con cobertura' : 'Distrito sin cobertura',
    );
  }),

  generateSlots: asyncHandler(async (req: Request, res: Response) => {
    const result = await commercialAdminService.generateSlots(req.body);

    await audit(req, {
      action: 'geo.slots.generate',
      entity: 'delivery_slots',
      entityId: req.body.branchId,
      after: { created: result.created, days: req.body.days },
    });

    return ok(res, result, `${result.created} franjas creadas`);
  }),

  // --- Constructor de bowls ---
  builderConfig: asyncHandler(async (req: Request, res: Response) => {
    const config = await customizationAdminService.getConfig(Number(req.params.productId));
    return ok(res, config);
  }),

  builderHistory: asyncHandler(async (req: Request, res: Response) => {
    const rows = await builderInsightsService.history(Number(req.query.limit ?? 100));
    return ok(res, rows, `${rows.length} cambios del constructor`);
  }),

  builderAnalytics: asyncHandler(async (req: Request, res: Response) => {
    const data = await builderInsightsService.analytics(
      Number(req.params.productId),
      Number(req.query.days ?? 30),
    );
    return ok(res, data);
  }),

  createGroup: asyncHandler(async (req: Request, res: Response) => {
    const group = await customizationAdminService.createGroup(
      Number(req.params.productId),
      req.body,
    );

    await audit(req, {
      action: 'builder.group.create',
      entity: 'customization_groups',
      entityId: group.id,
      after: { name: group.name, min: group.minSelection, max: group.maxSelection },
    });

    return created(res, { id: group.id }, 'Paso creado');
  }),

  /** Cambiar min/max/incluidas del paso cambia el precio de TODOS los bowls nuevos. */
  updateGroup: asyncHandler(async (req: Request, res: Response) => {
    const { group, before } = await customizationAdminService.updateGroup(
      Number(req.params.groupId),
      req.body,
    );

    await audit(req, {
      action: 'builder.group.update',
      entity: 'customization_groups',
      entityId: group.id,
      before,
      after: {
        minSelection: group.minSelection,
        maxSelection: group.maxSelection,
        freeQuantity: group.freeQuantity,
      },
    });

    return ok(res, { id: group.id }, 'Paso actualizado');
  }),

  deleteGroup: asyncHandler(async (req: Request, res: Response) => {
    const groupId = Number(req.params.groupId);
    await customizationAdminService.deleteGroup(groupId);

    await audit(req, {
      action: 'builder.group.delete',
      entity: 'customization_groups',
      entityId: groupId,
    });

    return noContent(res);
  }),

  createOption: asyncHandler(async (req: Request, res: Response) => {
    const option = await customizationAdminService.createOption(
      Number(req.params.groupId),
      req.body,
    );

    await audit(req, {
      action: 'builder.option.create',
      entity: 'customization_options',
      entityId: option.id,
      after: { name: option.name, priceDelta: Number(option.priceDelta) },
    });

    return created(res, { id: option.id }, 'Opcion creada');
  }),

  updateOption: asyncHandler(async (req: Request, res: Response) => {
    const { option, before } = await customizationAdminService.updateOption(
      Number(req.params.optionId),
      req.body,
    );

    await audit(req, {
      action: 'builder.option.update',
      entity: 'customization_options',
      entityId: option.id,
      before,
      after: {
        priceDelta: Number(option.priceDelta),
        chargeAlways: option.chargeAlways,
        status: option.status,
      },
    });

    return ok(res, { id: option.id }, 'Opcion actualizada');
  }),

  deleteOption: asyncHandler(async (req: Request, res: Response) => {
    const optionId = Number(req.params.optionId);
    await customizationAdminService.deleteOption(optionId);

    await audit(req, {
      action: 'builder.option.delete',
      entity: 'customization_options',
      entityId: optionId,
    });

    return noContent(res);
  }),

  addIncompatibility: asyncHandler(async (req: Request, res: Response) => {
    const optionId = Number(req.params.optionId);
    const row = await customizationAdminService.addIncompatibility(
      optionId,
      Number(req.body.incompatibleOptionId),
      req.body.reason,
    );

    await audit(req, {
      action: 'builder.incompatibility.add',
      entity: 'option_incompatibilities',
      entityId: row.id,
      after: { optionId, incompatibleOptionId: row.incompatibleOptionId },
    });

    return created(res, { id: row.id }, 'Combinacion prohibida');
  }),

  removeIncompatibility: asyncHandler(async (req: Request, res: Response) => {
    const optionId = Number(req.params.optionId);
    const other = Number(req.params.otherId);

    await customizationAdminService.removeIncompatibility(optionId, other);
    await audit(req, {
      action: 'builder.incompatibility.remove',
      entity: 'option_incompatibilities',
      entityId: `${optionId}:${other}`,
    });

    return noContent(res);
  }),

  duplicateOption: asyncHandler(async (req: Request, res: Response) => {
    const option = await customizationAdminService.duplicateOption(Number(req.params.optionId));
    await audit(req, { action: 'builder.option.duplicate', entity: 'customization_options', entityId: option.id });
    return created(res, { id: option.id }, 'Opcion duplicada como borrador');
  }),

  bulkUpdateOptions: asyncHandler(async (req: Request, res: Response) => {
    const result = await customizationAdminService.bulkUpdateOptions(req.body.optionIds, req.body);
    await audit(req, { action: 'builder.option.bulk_update', entity: 'customization_options', entityId: req.body.optionIds.join(','), after: req.body });
    return ok(res, result, 'Opciones actualizadas');
  }),

  setOptionSchedule: asyncHandler(async (req: Request, res: Response) => {
    const row = await customizationAdminService.setOptionSchedule(Number(req.params.optionId), req.body);
    await audit(req, { action: 'builder.option.schedule', entity: 'branch_option_availability', entityId: row.id, after: req.body });
    return ok(res, { id: row.id }, 'Disponibilidad programada');
  }),

  createPreset: asyncHandler(async (req: Request, res: Response) => {
    const preset = await customizationAdminService.createPreset(Number(req.params.productId), req.body);
    await audit(req, { action: 'builder.preset.create', entity: 'builder_presets', entityId: preset.id, after: { name: preset.name } });
    return created(res, { id: preset.id }, 'Recomendacion creada');
  }),

  updatePreset: asyncHandler(async (req: Request, res: Response) => {
    const preset = await customizationAdminService.updatePreset(Number(req.params.presetId), req.body);
    await audit(req, { action: 'builder.preset.update', entity: 'builder_presets', entityId: preset.id, after: req.body });
    return ok(res, { id: preset.id }, 'Recomendacion actualizada');
  }),

  deletePreset: asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.presetId);
    await customizationAdminService.deletePreset(id);
    await audit(req, { action: 'builder.preset.delete', entity: 'builder_presets', entityId: id });
    return noContent(res);
  }),
};
