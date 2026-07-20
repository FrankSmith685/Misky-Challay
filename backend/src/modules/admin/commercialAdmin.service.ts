import {
  Branch,
  AdminDraft,
  BranchSchedule,
  City,
  Coupon,
  CoverageZone,
  DeliverySlot,
  District,
  Plan,
  PlanBenefit,
  ZoneBranch,
  sequelize,
} from '@database/models';
import { DISCOUNT_TYPE, type DiscountType } from '@database/models/coupon.model';
import { BENEFIT_TYPE, type BenefitType } from '@database/models/planBenefit.model';
import type { GeoPoint } from '@database/models/coverageZone.model';
import { ApiError } from '@shared/errors/ApiError';
import {
  addDaysToIsoDate,
  defaultTimeZone,
  zonedDateAt,
  zonedParts,
} from '@shared/utils/datetime';
import { assertValidPolygon } from '@modules/geo/geometry';

/**
 * CONFIGURACION COMERCIAL Y DE COBERTURA (M03, M06, M07).
 *
 * Aqui vive lo que antes solo existia en los seeders: cupones, planes, sucursales,
 * zonas, horarios y franjas. Con esto, NADA del negocio queda escrito en codigo.
 */

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const commercialAdminService = {
  async getDraft(key: string) {
    return AdminDraft.findOne({ where: { key, status: ['DRAFT', 'SCHEDULED'] } });
  },

  async saveDraft(ownerUserId: number, key: string, input: { scope: string; payload: Record<string, unknown>; publishAt?: string | null }) {
    const publishAt = input.publishAt ? new Date(input.publishAt) : null;
    const status = publishAt ? 'SCHEDULED' as const : 'DRAFT' as const;
    const [draft] = await AdminDraft.findOrCreate({ where: { key }, defaults: { key, scope: input.scope, ownerUserId, payload: input.payload, publishAt, status, errorMessage: null } });
    return draft.update({ scope: input.scope, ownerUserId, payload: input.payload, publishAt, status, errorMessage: null });
  },

  async deleteDraft(key: string) {
    await AdminDraft.destroy({ where: { key } });
  },

  // ==========================================================================
  // CUPONES (RN-010, RN-011)
  // ==========================================================================
  async listCoupons() {
    const coupons = await Coupon.findAll({ order: [['id', 'DESC']] });

    return coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      value: Number(coupon.value),
      minOrderAmount: Number(coupon.minOrderAmount),
      maxDiscountAmount:
        coupon.maxDiscountAmount === null ? null : Number(coupon.maxDiscountAmount),
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      usageLimit: coupon.usageLimit,
      usageLimitPerUser: coupon.usageLimitPerUser,
      usedCount: coupon.usedCount,
      isActive: coupon.isActive,
    }));
  },

  async createCoupon(input: {
    code: string;
    description: string;
    discountType: DiscountType;
    value: number;
    minOrderAmount: number;
    maxDiscountAmount?: number | null;
    validUntil?: string | null;
    usageLimit?: number | null;
    usageLimitPerUser: number;
  }) {
    const code = input.code.trim().toUpperCase();

    const existing = await Coupon.findOne({ where: { code } });
    if (existing) throw ApiError.conflict('Ya existe un cupon con ese codigo');

    if (input.discountType === DISCOUNT_TYPE.PERCENT && (input.value <= 0 || input.value > 100)) {
      throw ApiError.badRequest('El porcentaje debe estar entre 1 y 100');
    }

    return Coupon.create({
      code,
      description: input.description,
      discountType: input.discountType,
      value: input.value,
      minOrderAmount: input.minOrderAmount,
      maxDiscountAmount: input.maxDiscountAmount ?? null,
      validFrom: null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      usageLimit: input.usageLimit ?? null,
      usageLimitPerUser: input.usageLimitPerUser,
      usedCount: 0,
      isActive: true,
    });
  },

  /** Apagar un cupon no borra su historial: los canjes hechos siguen contando. */
  async updateCoupon(
    couponId: number,
    input: { isActive?: boolean; description?: string; validUntil?: string | null },
  ) {
    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) throw ApiError.notFound('Cupon no encontrado');

    const before = { isActive: coupon.isActive, validUntil: coupon.validUntil };

    if (input.isActive !== undefined) coupon.isActive = input.isActive;
    if (input.description !== undefined) coupon.description = input.description;
    if (input.validUntil !== undefined) {
      coupon.validUntil = input.validUntil ? new Date(input.validUntil) : null;
    }

    await coupon.save();
    return { coupon, before };
  },

  // ==========================================================================
  // PLANES (RN-012)
  // ==========================================================================
  async listPlans() {
    const plans = await Plan.findAll({
      include: [{ model: PlanBenefit, as: 'benefits' }],
      order: [['sortOrder', 'ASC']],
    });

    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      price: Number(plan.price),
      grantedCredit: Number(plan.grantedCredit),
      bonusAmount: Number(plan.grantedCredit) - Number(plan.price),
      validityDays: plan.validityDays,
      isFeatured: plan.isFeatured,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      benefits: (plan.benefits ?? []).map((benefit) => ({
        id: benefit.id,
        type: benefit.type,
        value: Number(benefit.value),
        maxAmountPerOrder:
          benefit.maxAmountPerOrder === null ? null : Number(benefit.maxAmountPerOrder),
        description: benefit.description,
      })),
    }));
  },

  async createPlan(input: {
    code: string;
    name: string;
    description?: string;
    price: number;
    grantedCredit: number;
    validityDays: number;
    sortOrder?: number;
  }) {
    if (input.grantedCredit < input.price) {
      throw ApiError.badRequest('El saldo otorgado no puede ser menor que el precio');
    }

    const code = input.code.trim().toUpperCase();
    const existing = await Plan.findOne({ where: { code } });
    if (existing) throw ApiError.conflict('Ya existe un plan con ese codigo');

    return Plan.create({
      code,
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      grantedCredit: input.grantedCredit,
      validityDays: input.validityDays,
      sortOrder: input.sortOrder ?? 0,
      cityId: null,
      isFeatured: false,
      isActive: true,
    });
  },

  /**
   * Cambiar un plan NO afecta a quien ya lo compro: las activaciones guardan un
   * snapshot del precio, el saldo y la vigencia (user_plans).
   */
  async updatePlan(
    planId: number,
    input: {
      name?: string;
      description?: string;
      price?: number;
      grantedCredit?: number;
      validityDays?: number;
      isActive?: boolean;
      isFeatured?: boolean;
    },
  ) {
    const plan = await Plan.findByPk(planId);
    if (!plan) throw ApiError.notFound('Plan no encontrado');

    const before = {
      price: Number(plan.price),
      grantedCredit: Number(plan.grantedCredit),
      validityDays: plan.validityDays,
      isActive: plan.isActive,
    };

    const price = input.price ?? Number(plan.price);
    const credit = input.grantedCredit ?? Number(plan.grantedCredit);
    if (credit < price) {
      throw ApiError.badRequest('El saldo otorgado no puede ser menor que el precio');
    }

    if (input.name !== undefined) plan.name = input.name;
    if (input.description !== undefined) plan.description = input.description;
    if (input.price !== undefined) plan.price = input.price;
    if (input.grantedCredit !== undefined) plan.grantedCredit = input.grantedCredit;
    if (input.validityDays !== undefined) plan.validityDays = input.validityDays;
    if (input.isActive !== undefined) plan.isActive = input.isActive;
    if (input.isFeatured !== undefined) plan.isFeatured = input.isFeatured;

    await plan.save();
    return { plan, before };
  },

  async setPlanBenefit(
    planId: number,
    input: {
      type: BenefitType;
      value: number;
      maxAmountPerOrder?: number | null;
      description: string;
    },
  ) {
    const plan = await Plan.findByPk(planId);
    if (!plan) throw ApiError.notFound('Plan no encontrado');

    if (input.type === BENEFIT_TYPE.DISCOUNT_PERCENT && (input.value <= 0 || input.value > 100)) {
      throw ApiError.badRequest('El descuento debe estar entre 1 y 100');
    }

    const [benefit] = await PlanBenefit.findOrCreate({
      where: { planId, type: input.type },
      defaults: {
        planId,
        type: input.type,
        value: input.value,
        maxAmountPerOrder: input.maxAmountPerOrder ?? null,
        description: input.description,
      },
    });

    await benefit.update({
      value: input.value,
      maxAmountPerOrder: input.maxAmountPerOrder ?? null,
      description: input.description,
    });

    return benefit;
  },

  async removePlanBenefit(planId: number, benefitId: number) {
    const benefit = await PlanBenefit.findOne({ where: { id: benefitId, planId } });
    if (!benefit) throw ApiError.notFound('Beneficio no encontrado');
    await benefit.destroy();
  },

  // ==========================================================================
  // COBERTURA: sucursales, zonas, horarios y franjas (M03)
  // ==========================================================================
  async listCoverage() {
    const [cities, districts, zones, branches, links] = await Promise.all([
      City.findAll({ order: [['name', 'ASC']] }),
      District.findAll({ order: [['name', 'ASC']] }),
      CoverageZone.findAll({ order: [['priority', 'ASC']] }),
      Branch.findAll({
        include: [{ model: BranchSchedule, as: 'schedules' }],
        order: [['name', 'ASC']],
      }),
      ZoneBranch.findAll(),
    ]);

    return {
      cities: cities.map((city) => ({ id: city.id, name: city.name })),
      districts: districts.map((district) => ({
        id: district.id,
        cityId: district.cityId,
        name: district.name,
        ubigeoCode: district.ubigeoCode,
        coverageZoneId: district.coverageZoneId,
        isActive: district.isActive,
      })),
      zones: zones.map((zone) => ({
        id: zone.id,
        cityId: zone.cityId,
        name: zone.name,
        deliveryFee: Number(zone.deliveryFee),
        minimumOrder: Number(zone.minimumOrder),
        estimatedMinutes: zone.estimatedMinutes,
        priority: zone.priority,
        isActive: zone.isActive,
        hasPolygon: Array.isArray(zone.polygon) && zone.polygon.length >= 3,
        polygon: zone.polygon,
        branchIds: links
          .filter((link) => link.coverageZoneId === zone.id)
          .map((link) => link.branchId),
      })),
      branches: branches.map((branch) => ({
        id: branch.id,
        cityId: branch.cityId,
        name: branch.name,
        addressLine: branch.addressLine,
        districtId: branch.districtId,
        latitude: branch.latitude === null ? null : Number(branch.latitude),
        longitude: branch.longitude === null ? null : Number(branch.longitude),
        phone: branch.phone,
        prepMinutes: branch.prepMinutes,
        acceptsPickup: branch.acceptsPickup,
        acceptsDelivery: branch.acceptsDelivery,
        isActive: branch.isActive,
        schedules: ((branch.get('schedules') as BranchSchedule[] | undefined) ?? [])
          .filter((schedule) => schedule.exceptionDate === null)
          .map((schedule) => ({
            id: schedule.id,
            weekday: schedule.weekday,
            opensAt: schedule.opensAt,
            closesAt: schedule.closesAt,
            isClosed: schedule.isClosed,
          }))
          .sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0)),
      })),
    };
  },

  async createBranch(input: {
    cityId: number;
    name: string;
    addressLine: string;
    districtId?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    phone?: string;
    prepMinutes: number;
    acceptsPickup: boolean;
    acceptsDelivery: boolean;
  }) {
    const slug = slugify(input.name);
    const existing = await Branch.findOne({ where: { slug } });
    if (existing) throw ApiError.conflict('Ya existe una sucursal con ese nombre');

    return sequelize.transaction(async (transaction) => {
      const branch = await Branch.create(
        {
          cityId: input.cityId,
          name: input.name,
          slug,
          addressLine: input.addressLine,
          phone: input.phone ?? null,
          prepMinutes: input.prepMinutes,
          acceptsPickup: input.acceptsPickup,
          acceptsDelivery: input.acceptsDelivery,
          districtId: input.districtId ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
        },
        { transaction },
      );

      // Horario por defecto: todos los dias de 10:00 a 22:00. Se ajusta luego.
      for (let weekday = 0; weekday <= 6; weekday += 1) {
        await BranchSchedule.create(
          {
            branchId: branch.id,
            weekday,
            exceptionDate: null,
            opensAt: '10:00',
            closesAt: '22:00',
            isClosed: false,
          },
          { transaction },
        );
      }

      return branch;
    });
  },

  async updateBranch(
    branchId: number,
    input: {
      name?: string;
      addressLine?: string;
      districtId?: number | null;
      latitude?: number | null;
      longitude?: number | null;
      phone?: string | null;
      prepMinutes?: number;
      acceptsPickup?: boolean;
      acceptsDelivery?: boolean;
      isActive?: boolean;
    },
  ) {
    const branch = await Branch.findByPk(branchId);
    if (!branch) throw ApiError.notFound('Sucursal no encontrada');

    const before = { prepMinutes: branch.prepMinutes, isActive: branch.isActive };

    if (input.name !== undefined) branch.name = input.name;
    if (input.addressLine !== undefined) branch.addressLine = input.addressLine;
    if (input.districtId !== undefined) branch.districtId = input.districtId;
    if (input.latitude !== undefined) branch.latitude = input.latitude;
    if (input.longitude !== undefined) branch.longitude = input.longitude;
    if (input.phone !== undefined) branch.phone = input.phone;
    if (input.prepMinutes !== undefined) branch.prepMinutes = input.prepMinutes;
    if (input.acceptsPickup !== undefined) branch.acceptsPickup = input.acceptsPickup;
    if (input.acceptsDelivery !== undefined) branch.acceptsDelivery = input.acceptsDelivery;
    if (input.isActive !== undefined) branch.isActive = input.isActive;

    await branch.save();
    return { branch, before };
  },

  /** RN-003: el horario decide si la sucursal acepta pedidos ahora. */
  async setSchedule(
    branchId: number,
    weekday: number,
    input: { opensAt: string; closesAt: string; isClosed: boolean },
  ) {
    const [schedule] = await BranchSchedule.findOrCreate({
      where: { branchId, weekday, exceptionDate: null },
      defaults: {
        branchId,
        weekday,
        exceptionDate: null,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        isClosed: input.isClosed,
      },
    });

    await schedule.update(input);
    return schedule;
  },

  async createZone(input: {
    cityId: number;
    name: string;
    deliveryFee: number;
    minimumOrder: number;
    estimatedMinutes: number;
    priority: number;
    polygon?: GeoPoint[];
  }) {
    try { assertValidPolygon(input.polygon); } catch (error) { throw ApiError.badRequest((error as Error).message); }
    return CoverageZone.create({
      cityId: input.cityId,
      name: input.name,
      deliveryFee: input.deliveryFee,
      minimumOrder: input.minimumOrder,
      estimatedMinutes: input.estimatedMinutes,
      priority: input.priority,
      polygon: input.polygon ?? null,
    });
  },

  /** Costo, minimo y tiempo de una zona: lo que ve el cliente al validar cobertura. */
  async updateZone(
    zoneId: number,
    input: {
      name?: string;
      deliveryFee?: number;
      minimumOrder?: number;
      estimatedMinutes?: number;
      priority?: number;
      isActive?: boolean;
      polygon?: GeoPoint[] | null;
    },
  ) {
    const zone = await CoverageZone.findByPk(zoneId);
    if (!zone) throw ApiError.notFound('Zona no encontrada');
    try { assertValidPolygon(input.polygon); } catch (error) { throw ApiError.badRequest((error as Error).message); }

    const before = {
      name: zone.name,
      deliveryFee: Number(zone.deliveryFee),
      minimumOrder: Number(zone.minimumOrder),
      estimatedMinutes: zone.estimatedMinutes,
      priority: zone.priority,
      polygon: zone.polygon,
      isActive: zone.isActive,
    };

    if (input.name !== undefined) zone.name = input.name;
    if (input.deliveryFee !== undefined) zone.deliveryFee = input.deliveryFee;
    if (input.minimumOrder !== undefined) zone.minimumOrder = input.minimumOrder;
    if (input.estimatedMinutes !== undefined) zone.estimatedMinutes = input.estimatedMinutes;
    if (input.priority !== undefined) zone.priority = input.priority;
    if (input.isActive !== undefined) zone.isActive = input.isActive;
    if (input.polygon !== undefined) zone.polygon = input.polygon;

    await zone.save();
    return { zone, before };
  },

  /** RN-002: que sucursal atiende esa zona. */
  async assignZoneToBranch(zoneId: number, branchId: number, priority: number) {
    const [link] = await ZoneBranch.findOrCreate({
      where: { coverageZoneId: zoneId, branchId },
      defaults: { coverageZoneId: zoneId, branchId, priority },
    });

    await link.update({ priority, isActive: true });
    return link;
  },

  /** RN-001: un distrito sin zona = sin cobertura. Asi se abre o cierra un distrito. */
  async setDistrictZone(districtId: number, coverageZoneId: number | null) {
    const district = await District.findByPk(districtId);
    if (!district) throw ApiError.notFound('Distrito no encontrado');

    const before = { coverageZoneId: district.coverageZoneId };

    district.coverageZoneId = coverageZoneId;
    await district.save();

    return { district, before };
  },

  async createDistrict(input: { cityId: number; name: string; ubigeoCode?: string; coverageZoneId?: number | null }) {
    const slug = slugify(input.name);

    const existing = await District.findOne({ where: { cityId: input.cityId, slug } });
    if (existing) throw ApiError.conflict('Ese distrito ya existe en la ciudad');

    return District.create({
      cityId: input.cityId,
      name: input.name,
      slug,
      ubigeoCode: input.ubigeoCode ?? null,
      coverageZoneId: input.coverageZoneId ?? null,
    });
  },

  /**
   * Genera las franjas de los proximos dias (RN-004).
   * Es lo que hoy hacia el seeder: ahora lo dispara el administrador cuando quiere.
   */
  async generateSlots(input: {
    branchId: number;
    days: number;
    windows: Array<{ startHour: number; endHour: number }>;
    capacity: number;
    cutoffHours: number;
  }) {
    const branch = await Branch.findByPk(input.branchId, {
      include: [{ model: City, as: 'city', attributes: ['timezone'] }],
    });
    if (!branch) throw ApiError.notFound('Sucursal no encontrada');

    const timeZone = branch.city?.timezone ?? defaultTimeZone();

    let created = 0;
    const now = new Date();
    const today = zonedParts(now, timeZone).isoDate;

    // Desde HOY (dia 0) y no desde manana: asi se pueden reponer las franjas del
    // mismo dia. Las que ya pasaron se saltan mas abajo.
    for (let day = 0; day < input.days; day += 1) {
      const isoDate = addDaysToIsoDate(today, day);

      for (const window of input.windows) {
        if (window.endHour <= window.startHour) {
          throw ApiError.badRequest('La hora de fin debe ser mayor que la de inicio');
        }

        // Las horas se interpretan en la zona de la ciudad, no en la del proceso:
        // con `setHours` un servidor en UTC creaba las franjas 5 horas corridas.
        const startsAt = zonedDateAt(isoDate, window.startHour, 0, timeZone);
        const endsAt = zonedDateAt(isoDate, window.endHour, 0, timeZone);

        const orderCutoffAt = new Date(startsAt.getTime() - input.cutoffHours * 60 * 60 * 1000);

        // Una franja cuyo cierre de pedidos ya paso no sirve a nadie.
        if (orderCutoffAt <= now) continue;

        const [, wasCreated] = await DeliverySlot.findOrCreate({
          where: { branchId: input.branchId, startsAt },
          defaults: {
            branchId: input.branchId,
            coverageZoneId: null,
            startsAt,
            endsAt,
            orderCutoffAt,
            capacity: input.capacity,
            reservedCount: 0,
            confirmedCount: 0,
          },
        });

        if (wasCreated) created += 1;
      }
    }

    return { created };
  },
};

export const DISCOUNT_TYPES = Object.values(DISCOUNT_TYPE);
export const BENEFIT_TYPES = Object.values(BENEFIT_TYPE);

export type CommercialAdminService = typeof commercialAdminService;
