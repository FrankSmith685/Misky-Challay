import { geoService } from '@modules/geo/geo.service';
import { Op, col, fn } from 'sequelize';
import {
  Branch,
  AdminDraft,
  BranchSchedule,
  City,
  Coupon,
  CouponRedemption,
  CoverageZone,
  DeliverySlot,
  District,
  Order,
  Plan,
  PlanBenefit,
  UserPlan,
  ZoneBranch,
  sequelize,
} from '@database/models';
import {
  COUPON_STACK_MODE,
  DISCOUNT_TYPE,
  type CouponRules,
  type CouponStackMode,
  type DiscountType,
} from '@database/models/coupon.model';
import { REDEMPTION_STATUS } from '@database/models/couponRedemption.model';
import { BENEFIT_TYPE, type BenefitType } from '@database/models/planBenefit.model';
import { USER_PLAN_STATUS } from '@database/models/userPlan.model';
import type { GeoPoint } from '@database/models/coverageZone.model';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
import {
  addDaysToIsoDate,
  defaultTimeZone,
  zonedDateAt,
  zonedParts,
} from '@shared/utils/datetime';
import { assertValidPolygon, polygonsOverlap } from '@modules/geo/geometry';
import { splitTaxFromGross } from '@shared/utils/tax';
import { settingsService } from '@modules/settings/settings.service';

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
    const redemptions = coupons.length
      ? await CouponRedemption.findAll({
        where: { couponId: coupons.map((coupon) => coupon.id) },
        attributes: ['couponId', 'status', 'amount'],
        raw: true,
      })
      : [];
    const counts = new Map<number, { reserved: number; confirmed: number; discount: number }>();
    for (const redemption of redemptions) {
      const current = counts.get(redemption.couponId) ?? { reserved: 0, confirmed: 0, discount: 0 };
      if (redemption.status === REDEMPTION_STATUS.RESERVED) current.reserved += 1;
      if (redemption.status === REDEMPTION_STATUS.CONFIRMED) {
        current.confirmed += 1;
        current.discount += Number(redemption.amount);
      }
      counts.set(redemption.couponId, current);
    }

    return coupons.map((coupon) => {
      const stats = counts.get(coupon.id) ?? { reserved: 0, confirmed: 0, discount: 0 };
      const now = new Date();
      const status = coupon.archivedAt
        ? 'ARCHIVED'
        : !coupon.isActive
          ? 'PAUSED'
          : coupon.validFrom && now < coupon.validFrom
            ? 'SCHEDULED'
            : coupon.validUntil && now > coupon.validUntil
              ? 'EXPIRED'
              : coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit
                ? 'EXHAUSTED'
                : 'ACTIVE';
      return {
        status,
        reservedCount: stats.reserved,
        confirmedCount: stats.confirmed,
        discountSpent: coupon.budgetAmount === null ? stats.discount : Number(coupon.budgetUsed),
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
        version: coupon.version,
        rules: coupon.rulesJson ?? {},
        stackMode: coupon.stackMode,
        budgetAmount: coupon.budgetAmount === null ? null : Number(coupon.budgetAmount),
        budgetUsed: Number(coupon.budgetUsed ?? 0),
        archivedAt: coupon.archivedAt,
      };
    });
  },

  async createCoupon(input: {
    code: string;
    description: string;
    discountType: DiscountType;
    value: number;
    minOrderAmount: number;
    maxDiscountAmount?: number | null;
    validFrom?: string | null;
    validUntil?: string | null;
    usageLimit?: number | null;
    usageLimitPerUser: number;
    rules?: CouponRules;
    stackMode?: CouponStackMode;
    budgetAmount?: number | null;
  }) {
    const code = input.code.trim().toUpperCase();

    const existing = await Coupon.findOne({ where: { code } });
    if (existing) throw ApiError.conflict('Ya existe un cupon con ese codigo');

    if (input.discountType === DISCOUNT_TYPE.PERCENT && (input.value <= 0 || input.value > 100)) {
      throw ApiError.badRequest('El porcentaje debe estar entre 1 y 100');
    }
    if (input.discountType === DISCOUNT_TYPE.FIXED && input.value <= 0) {
      throw ApiError.badRequest('El importe fijo debe ser mayor que cero');
    }
    if (input.minOrderAmount < 0 || input.usageLimitPerUser < 1) {
      throw ApiError.badRequest('Los límites del cupón no son válidos');
    }
    if (input.maxDiscountAmount !== null && input.maxDiscountAmount !== undefined && input.maxDiscountAmount <= 0) {
      throw ApiError.badRequest('El tope de descuento debe ser mayor que cero');
    }
    if (input.budgetAmount !== null && input.budgetAmount !== undefined && input.budgetAmount <= 0) {
      throw ApiError.badRequest('El presupuesto debe ser mayor que cero');
    }

    const validFrom = input.validFrom ? new Date(input.validFrom) : null;
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (validFrom && Number.isNaN(validFrom.getTime())) throw ApiError.badRequest('La fecha de inicio no es válida');
    if (validUntil && Number.isNaN(validUntil.getTime())) throw ApiError.badRequest('La fecha de vencimiento no es válida');
    if (validFrom && validUntil && validFrom >= validUntil) {
      throw ApiError.badRequest('La fecha de inicio debe ser anterior al vencimiento');
    }

    return Coupon.create({
      code,
      description: input.description,
      discountType: input.discountType,
      value: input.value,
      minOrderAmount: input.minOrderAmount,
      maxDiscountAmount: input.maxDiscountAmount ?? null,
      validFrom,
      validUntil,
      usageLimit: input.usageLimit ?? null,
      usageLimitPerUser: input.usageLimitPerUser,
      usedCount: 0,
      isActive: true,
      version: 1,
      rulesJson: input.rules ?? {},
      stackMode: input.stackMode ?? COUPON_STACK_MODE.STACKABLE,
      budgetAmount: input.budgetAmount ?? null,
      budgetUsed: 0,
      archivedAt: null,
    });
  },

  /**
   * Apagar un cupon no borra su historial: los canjes hechos siguen contando.
   *
   * La edicion admite tambien el importe y los topes. El codigo y el tipo NO se
   * tocan: un cupon ya repartido que cambia de PERCENT a FIXED valdria otra cosa
   * para quien lo tiene guardado, y para eso esta crear uno nuevo.
   */
  async updateCoupon(
    couponId: number,
    input: {
      isActive?: boolean;
      description?: string;
      validUntil?: string | null;
      value?: number;
      minOrderAmount?: number;
      maxDiscountAmount?: number | null;
      usageLimit?: number | null;
      validFrom?: string | null;
      rules?: CouponRules;
      stackMode?: CouponStackMode;
      budgetAmount?: number | null;
      expectedVersion?: number;
    },
  ) {
    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) throw ApiError.notFound('Cupon no encontrado');
    if (input.expectedVersion !== undefined && input.expectedVersion !== coupon.version) {
      throw ApiError.conflict('El cupón cambió mientras lo editabas. Recarga la campaña e inténtalo otra vez');
    }
    if (coupon.archivedAt && input.isActive === true) {
      throw ApiError.conflict('Un cupón archivado no puede volver a activarse');
    }

    const before = {
      isActive: coupon.isActive,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      value: Number(coupon.value),
      usageLimit: coupon.usageLimit,
      version: coupon.version,
      budgetAmount: coupon.budgetAmount,
      stackMode: coupon.stackMode,
      rules: coupon.rulesJson,
    };

    if (
      input.value !== undefined
      && coupon.discountType === DISCOUNT_TYPE.PERCENT
      && (input.value <= 0 || input.value > 100)
    ) {
      throw ApiError.badRequest('El porcentaje debe estar entre 1 y 100');
    }
    if (input.value !== undefined && coupon.discountType === DISCOUNT_TYPE.FIXED && input.value <= 0) {
      throw ApiError.badRequest('El importe fijo debe ser mayor que cero');
    }
    if (input.minOrderAmount !== undefined && input.minOrderAmount < 0) {
      throw ApiError.badRequest('El pedido mínimo no puede ser negativo');
    }
    if (input.maxDiscountAmount !== undefined && input.maxDiscountAmount !== null && input.maxDiscountAmount <= 0) {
      throw ApiError.badRequest('El tope de descuento debe ser mayor que cero');
    }

    // Un tope por debajo de los canjes ya hechos dejaria el cupon agotado de
    // inmediato sin decirlo: el motor compara `usedCount >= usageLimit`.
    if (
      input.usageLimit !== undefined
      && input.usageLimit !== null
      && input.usageLimit < coupon.usedCount
    ) {
      throw ApiError.badRequest(
        `Ese cupon ya se uso ${coupon.usedCount} veces: el limite no puede ser menor`,
      );
    }

    if (input.stackMode !== undefined && !Object.values(COUPON_STACK_MODE).includes(input.stackMode)) {
      throw ApiError.badRequest('La política de combinación no es válida');
    }
    if (input.budgetAmount !== undefined && input.budgetAmount !== null && input.budgetAmount < Number(coupon.budgetUsed)) {
      throw ApiError.badRequest('El presupuesto no puede ser menor que lo ya descontado');
    }

    const nextFrom = input.validFrom === undefined ? coupon.validFrom : input.validFrom ? new Date(input.validFrom) : null;
    const nextUntil = input.validUntil === undefined ? coupon.validUntil : input.validUntil ? new Date(input.validUntil) : null;
    if (nextFrom && Number.isNaN(nextFrom.getTime())) throw ApiError.badRequest('La fecha de inicio no es válida');
    if (nextUntil && Number.isNaN(nextUntil.getTime())) throw ApiError.badRequest('La fecha de vencimiento no es válida');
    if (nextFrom && nextUntil && nextFrom >= nextUntil) throw ApiError.badRequest('La fecha de inicio debe ser anterior al vencimiento');

    if (input.isActive !== undefined) coupon.isActive = input.isActive;
    if (input.description !== undefined) coupon.description = input.description;
    if (input.validUntil !== undefined) {
      coupon.validUntil = nextUntil;
    }
    if (input.validFrom !== undefined) coupon.validFrom = nextFrom;
    if (input.value !== undefined) coupon.value = input.value;
    if (input.minOrderAmount !== undefined) coupon.minOrderAmount = input.minOrderAmount;
    if (input.maxDiscountAmount !== undefined) coupon.maxDiscountAmount = input.maxDiscountAmount;
    if (input.usageLimit !== undefined) coupon.usageLimit = input.usageLimit;
    if (input.rules !== undefined) coupon.rulesJson = input.rules;
    if (input.stackMode !== undefined) coupon.stackMode = input.stackMode;
    if (input.budgetAmount !== undefined) coupon.budgetAmount = input.budgetAmount;
    coupon.version += 1;

    await coupon.save();
    return { coupon, before };
  },

  // ==========================================================================
  // PLANES (RN-012)
  // ==========================================================================
  async archiveCoupon(couponId: number, expectedVersion?: number) {
    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) throw ApiError.notFound('Cupón no encontrado');
    if (expectedVersion !== undefined && expectedVersion !== coupon.version) {
      throw ApiError.conflict('El cupón cambió mientras lo editabas. Recarga la campaña e inténtalo otra vez');
    }
    const before = { isActive: coupon.isActive, archivedAt: coupon.archivedAt, version: coupon.version };
    coupon.isActive = false;
    coupon.archivedAt = new Date();
    coupon.version += 1;
    await coupon.save();
    return { coupon, before };
  },

  async couponRedemptions(couponId: number) {
    const coupon = await Coupon.findByPk(couponId, { attributes: ['id', 'code'] });
    if (!coupon) throw ApiError.notFound('Cupón no encontrado');
    const rows = await CouponRedemption.findAll({
      where: { couponId },
      include: [{ model: Order, as: 'order', attributes: ['id', 'orderNumber', 'status', 'grandTotal', 'placedAt'] }],
      order: [['createdAt', 'DESC']],
      limit: 300,
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      amount: Number(row.amount),
      userId: row.userId,
      createdAt: row.createdAt,
      order: row.order ? {
        id: row.order.id,
        orderNumber: row.order.orderNumber,
        status: row.order.status,
        grandTotal: Number(row.order.grandTotal),
        placedAt: row.order.placedAt,
      } : null,
    }));
  },

  async couponMetrics(couponId: number) {
    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) throw ApiError.notFound('Cupón no encontrado');
    const rows = await CouponRedemption.findAll({ where: { couponId }, attributes: ['status', 'amount', 'orderId'], raw: true });
    const metrics = rows.reduce((acc, row) => {
      if (row.status === REDEMPTION_STATUS.RESERVED) acc.reserved += 1;
      if (row.status === REDEMPTION_STATUS.CONFIRMED) {
        acc.confirmed += 1;
        acc.discountConfirmed = round2(acc.discountConfirmed + Number(row.amount));
      }
      if (row.status === REDEMPTION_STATUS.RELEASED) acc.released += 1;
      return acc;
    }, { reserved: 0, confirmed: 0, released: 0, discountConfirmed: 0 });
    const confirmedOrderIds = rows.filter((row) => row.status === REDEMPTION_STATUS.CONFIRMED).map((row) => row.orderId);
    const orders = confirmedOrderIds.length
      ? await Order.findAll({ where: { id: confirmedOrderIds }, attributes: ['grandTotal'], raw: true })
      : [];
    const grossSales = round2(orders.reduce((sum, order) => sum + Number(order.grandTotal), 0));
    return {
      couponId: coupon.id,
      code: coupon.code,
      budgetAmount: coupon.budgetAmount === null ? null : Number(coupon.budgetAmount),
      budgetUsed: Number(coupon.budgetUsed),
      budgetRemaining: coupon.budgetAmount === null ? null : round2(Math.max(0, Number(coupon.budgetAmount) - Number(coupon.budgetUsed))),
      grossSales,
      averageOrderValue: orders.length ? round2(grossSales / orders.length) : 0,
      ...metrics,
    };
  },

  async listPlans() {
    const plans = await Plan.findAll({
      include: [{ model: PlanBenefit, as: 'benefits' }],
      order: [['sortOrder', 'ASC']],
    });

    // Cuantos clientes tienen HOY cada plan vigente. Misma condicion que
    // `plansService.activePlans`, que es de donde salen los beneficios que se
    // aplican al cotizar: es el numero que hay que enseñar antes de apagar uno.
    const subscribers = (await UserPlan.findAll({
      attributes: ['planId', [fn('COUNT', col('id')), 'total']],
      where: { status: USER_PLAN_STATUS.ACTIVE, expiresAt: { [Op.gt]: new Date() } },
      group: ['planId'],
      raw: true,
    })) as unknown as Array<{ planId: number; total: number }>;
    const subscribersByPlan = new Map<number, number>(
      subscribers.map((row) => [Number(row.planId), Number(row.total)]),
    );

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
      activeSubscribers: subscribersByPlan.get(plan.id) ?? 0,
      // Los beneficios apagados VIAJAN: el borrado es logico y el panel tiene que
      // poder volver a encenderlos sin recrearlos a mano.
      benefits: (plan.benefits ?? []).map((benefit) => ({
        id: benefit.id,
        type: benefit.type,
        value: Number(benefit.value),
        maxAmountPerOrder:
          benefit.maxAmountPerOrder === null ? null : Number(benefit.maxAmountPerOrder),
        description: benefit.description,
        isActive: benefit.isActive,
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

    // El indice unico es (plan_id, type), asi que el `findOrCreate` recupera
    // tambien la fila APAGADA: guardar el beneficio de nuevo lo reactiva en vez
    // de reventar con un choque de clave unica.
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
      isActive: true,
    });

    return benefit;
  },

  /**
   * Quitar un beneficio es un APAGADO, no un borrado.
   *
   * A diferencia del precio, el saldo y la vigencia —que se congelan en
   * `user_plans` al comprar—, los beneficios se leen EN VIVO al cotizar
   * (`plansService.activeBenefits` filtra por `isActive`). Un `destroy()` fisico
   * le retiraba el delivery gratis a todos los clientes con plan vigente y no
   * habia forma de deshacerlo: ni fila, ni historial, ni vuelta atras.
   */
  async removePlanBenefit(planId: number, benefitId: number) {
    const benefit = await PlanBenefit.findOne({ where: { id: benefitId, planId } });
    if (!benefit) throw ApiError.notFound('Beneficio no encontrado');
    if (!benefit.isActive) return benefit;
    await benefit.update({ isActive: false });
    return benefit;
  },

  // ==========================================================================
  // COBERTURA: sucursales, zonas, horarios y franjas (M03)
  // ==========================================================================
  async listCoverage() {
    const [cities, districts, zones, branches, links, slots, drafts, orderImpactRows] = await Promise.all([
      City.findAll({ order: [['name', 'ASC']] }),
      District.findAll({ order: [['name', 'ASC']] }),
      CoverageZone.findAll({ order: [['priority', 'ASC']] }),
      Branch.findAll({
        include: [{ model: BranchSchedule, as: 'schedules' }],
        order: [['name', 'ASC']],
      }),
      ZoneBranch.findAll(),
      DeliverySlot.findAll({
        where: { startsAt: { [Op.gte]: new Date() }, isActive: true },
        order: [['startsAt', 'ASC']],
        limit: 1000,
      }),
      AdminDraft.findAll({
        where: { scope: 'coverage-zone', status: { [Op.in]: ['DRAFT', 'SCHEDULED'] } },
        order: [['updatedAt', 'DESC']],
      }),
      Order.findAll({
        where: {
          coverageZoneId: { [Op.ne]: null },
          placedAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        attributes: ['coverageZoneId', 'deliveryFee'],
        raw: true,
      }) as Promise<Array<{ coverageZoneId: number | null; deliveryFee: number | string }>>,
    ]);

    const impactByZone = new Map<number, { orders: number; deliveryRevenue: number }>();
    orderImpactRows.forEach((row) => {
      if (row.coverageZoneId === null) return;
      const impact = impactByZone.get(Number(row.coverageZoneId)) ?? { orders: 0, deliveryRevenue: 0 };
      impact.orders += 1;
      impact.deliveryRevenue = round2(impact.deliveryRevenue + Number(row.deliveryFee));
      impactByZone.set(Number(row.coverageZoneId), impact);
    });

    const now = new Date();
    const linksByBranch = new Map<number, typeof links>();
    links.forEach((link) => {
      const rows = linksByBranch.get(link.branchId) ?? [];
      rows.push(link);
      linksByBranch.set(link.branchId, rows);
    });
    const slotsByBranch = new Map<number, DeliverySlot[]>();
    slots.forEach((slot) => {
      const rows = slotsByBranch.get(slot.branchId) ?? [];
      rows.push(slot);
      slotsByBranch.set(slot.branchId, rows);
    });
    const activeZones = zones.filter((zone) => zone.isActive && !zone.archivedAt && (!zone.effectiveFrom || zone.effectiveFrom <= now));
    const overlappingZoneIds = new Set<number>();
    for (let index = 0; index < activeZones.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < activeZones.length; otherIndex += 1) {
        const first = activeZones[index];
        const second = activeZones[otherIndex];
        if (first.cityId === second.cityId && first.polygon && second.polygon && polygonsOverlap(first.polygon, second.polygon)) {
          overlappingZoneIds.add(first.id);
          overlappingZoneIds.add(second.id);
        }
      }
    }
    const uncoveredDistricts = districts.filter((district) => !activeZones.some((zone) => zone.id === district.coverageZoneId));

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
        cakeDeliveryFee: Number(zone.cakeDeliveryFee),
        extraCoverageKm: Number(zone.extraCoverageKm),
        extraFeePerKm: Number(zone.extraFeePerKm),
        minimumOrder: Number(zone.minimumOrder),
        estimatedMinutes: zone.estimatedMinutes,
        priority: zone.priority,
        isActive: zone.isActive,
        status: zone.archivedAt
          ? 'ARCHIVED'
          : !zone.isActive
            ? 'PAUSED'
            : zone.effectiveFrom && zone.effectiveFrom > now
              ? 'SCHEDULED'
              : 'ACTIVE',
        version: zone.version,
        effectiveFrom: zone.effectiveFrom,
        archivedAt: zone.archivedAt,
        hasOverlap: overlappingZoneIds.has(zone.id),
        districtCount: districts.filter((district) => district.coverageZoneId === zone.id).length,
        last30DaysOrders: impactByZone.get(zone.id)?.orders ?? 0,
        last30DaysDeliveryRevenue: impactByZone.get(zone.id)?.deliveryRevenue ?? 0,
        hasPolygon: Array.isArray(zone.polygon) && zone.polygon.length >= 3,
        polygon: zone.polygon,
        branchIds: links
          .filter((link) => link.coverageZoneId === zone.id && link.isActive)
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
        version: branch.version,
        zoneIds: (linksByBranch.get(branch.id) ?? [])
          .filter((link) => link.isActive)
          .sort((a, b) => a.priority - b.priority)
          .map((link) => link.coverageZoneId),
        slotSummary: (() => {
          const upcoming = slotsByBranch.get(branch.id) ?? [];
          return {
            upcoming: upcoming.length,
            capacity: upcoming.reduce((sum, slot) => sum + slot.capacity, 0),
            reserved: upcoming.reduce((sum, slot) => sum + slot.reservedCount, 0),
            confirmed: upcoming.reduce((sum, slot) => sum + slot.confirmedCount, 0),
            available: upcoming.reduce((sum, slot) => sum + slot.availableCount, 0),
          };
        })(),
        health: (() => {
          const issues: string[] = [];
          const branchLinks = (linksByBranch.get(branch.id) ?? []).filter((link) => link.isActive);
          const schedules = (branch.get('schedules') as BranchSchedule[] | undefined) ?? [];
          if (branch.isActive && branch.acceptsDelivery && branchLinks.length === 0) issues.push('Sin zona asignada');
          if (branch.isActive && schedules.filter((schedule) => schedule.exceptionDate === null).every((schedule) => schedule.isClosed)) issues.push('Sin horario de atencion');
          if (branch.isActive && branch.acceptsDelivery && (slotsByBranch.get(branch.id) ?? []).length === 0) issues.push('Sin franjas futuras');
          if (branch.latitude === null || branch.longitude === null) issues.push('Sin ubicacion GPS');
          return { status: issues.length ? 'ATTENTION' : 'READY', issues };
        })(),
        schedules: ((branch.get('schedules') as BranchSchedule[] | undefined) ?? [])
          .map((schedule) => ({
            id: schedule.id,
            weekday: schedule.weekday,
            exceptionDate: schedule.exceptionDate,
            opensAt: schedule.opensAt,
            closesAt: schedule.closesAt,
            isClosed: schedule.isClosed,
          }))
          .sort((a, b) => String(a.exceptionDate ?? '').localeCompare(String(b.exceptionDate ?? '')) || (a.weekday ?? 0) - (b.weekday ?? 0)),
      })),
      stats: {
        activeZones: activeZones.length,
        activeBranches: branches.filter((branch) => branch.isActive).length,
        coveredDistricts: districts.length - uncoveredDistricts.length,
        uncoveredDistricts: uncoveredDistricts.length,
        overlappingZones: overlappingZoneIds.size,
        branchesWithAttention: branches.filter((branch) => {
          const branchLinks = (linksByBranch.get(branch.id) ?? []).filter((link) => link.isActive);
          return branch.isActive && branch.acceptsDelivery && (branchLinks.length === 0 || (slotsByBranch.get(branch.id) ?? []).length === 0);
        }).length,
      },
      drafts: drafts.map((draft) => ({
        id: draft.id,
        key: draft.key,
        status: draft.status,
        publishAt: draft.publishAt,
        updatedAt: draft.updatedAt,
        payload: draft.payload,
      })),
    };
  },

  /** Simula el cobro de delivery con la misma regla base del checkout. */
  async previewCoverageQuote(input: {
    zoneId: number;
    subtotal: number;
    containsCake: boolean;
    extraDeliveryFee?: number;
    deliveryType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  }) {
    const zone = await CoverageZone.findOne({ where: { id: input.zoneId, isActive: true } });
    if (!zone || zone.archivedAt) throw ApiError.notFound('Zona activa no encontrada');
    if (!Number.isFinite(input.subtotal) || input.subtotal < 0) throw ApiError.badRequest('El subtotal no es valido');
    const delivery = input.deliveryType === 'DELIVERY';
    const cakeDeliveryFee = delivery && input.containsCake ? round2(Number(zone.cakeDeliveryFee ?? 0)) : 0;
    const deliveryFee = delivery
      ? round2(Number(zone.deliveryFee) + cakeDeliveryFee + Math.max(0, input.extraDeliveryFee ?? 0))
      : 0;
    const minimumOrder = delivery ? Number(zone.minimumOrder) : 0;
    const total = round2(input.subtotal + deliveryFee);
    const { taxRate, currency } = await settingsService.getBusinessInfo();
    const tax = splitTaxFromGross(total, taxRate);
    return {
      zone: { id: zone.id, name: zone.name },
      subtotal: round2(input.subtotal),
      deliveryFee,
      cakeDeliveryFee,
      extraDeliveryFee: round2(Math.max(0, input.extraDeliveryFee ?? 0)),
      minimumOrder,
      meetsMinimum: input.subtotal >= minimumOrder,
      estimatedMinutes: zone.estimatedMinutes,
      taxableBase: tax.base,
      taxTotal: tax.tax,
      total,
      currency,
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
      expectedVersion?: number;
    },
  ) {
    const branch = await Branch.findByPk(branchId);
    if (!branch) throw ApiError.notFound('Sucursal no encontrada');
    if (input.expectedVersion !== undefined && input.expectedVersion !== branch.version) {
      throw ApiError.conflict('La sucursal cambio mientras la editabas. Recarga la cobertura e intentalo otra vez');
    }
    if (input.districtId !== undefined && input.districtId !== null) {
      const district = await District.findByPk(input.districtId);
      if (!district || district.cityId !== branch.cityId) throw ApiError.badRequest('El distrito no pertenece a la ciudad de la sucursal');
    }
    const nextLatitude = input.latitude === undefined ? branch.latitude : input.latitude;
    const nextLongitude = input.longitude === undefined ? branch.longitude : input.longitude;
    if ((nextLatitude === null) !== (nextLongitude === null)) throw ApiError.badRequest('La sucursal necesita latitud y longitud juntas');

    const before = { prepMinutes: branch.prepMinutes, isActive: branch.isActive, version: branch.version };

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

    branch.version += 1;
    await branch.save();
    return { branch, before };
  },

  /**
   * RN-003: el horario decide si la sucursal acepta pedidos ahora.
   *
   * Apertura y cierre iguales describen una franja vacia, no un dia completo: el
   * evaluador (`geo.service`) la leeria como cerrado las 24 horas y el panel
   * habria respondido "Horario guardado". Un cierre MENOR que la apertura si vale:
   * es el horario que cruza medianoche.
   */
  async setSchedule(
    branchId: number,
    weekday: number,
    input: { opensAt: string; closesAt: string; isClosed: boolean },
  ) {
    if (!input.isClosed && input.opensAt === input.closesAt) {
      throw ApiError.badRequest('La hora de cierre no puede ser igual a la de apertura');
    }

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

  async setScheduleException(
    branchId: number,
    input: { exceptionDate: string; opensAt: string; closesAt: string; isClosed: boolean },
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.exceptionDate)) throw ApiError.badRequest('La fecha de excepcion no es valida');
    if (!input.isClosed && input.opensAt === input.closesAt) throw ApiError.badRequest('La hora de cierre no puede ser igual a la apertura');
    const branch = await Branch.findByPk(branchId);
    if (!branch) throw ApiError.notFound('Sucursal no encontrada');
    const [schedule] = await BranchSchedule.findOrCreate({
      where: { branchId, exceptionDate: input.exceptionDate },
      defaults: { branchId, weekday: null, exceptionDate: input.exceptionDate, opensAt: input.opensAt, closesAt: input.closesAt, isClosed: input.isClosed },
    });
    await schedule.update({ weekday: null, ...input });
    return schedule;
  },

  async createZone(input: {
    cityId: number;
    name: string;
    deliveryFee: number;
    cakeDeliveryFee?: number;
    extraCoverageKm?: number;
    extraFeePerKm?: number;
    minimumOrder?: number;
    estimatedMinutes: number;
    priority: number;
    polygon?: GeoPoint[];
    effectiveFrom?: string | null;
  }) {
    try { assertValidPolygon(input.polygon); } catch (error) { throw ApiError.badRequest((error as Error).message); }
    const extraCoverageKm = input.extraCoverageKm ?? 0;
    const extraFeePerKm = input.extraFeePerKm ?? 0;
    if ((extraCoverageKm > 0 && extraFeePerKm <= 0) || (extraFeePerKm > 0 && !input.polygon)) {
      throw ApiError.badRequest('La extensión requiere un polígono y un recargo por kilómetro; 0 km significa sin límite');
    }
    if (input.polygon) {
      const peers = await CoverageZone.findAll({ where: { cityId: input.cityId, isActive: true } });
      if (peers.some((peer) => peer.polygon && polygonsOverlap(peer.polygon, input.polygon!))) {
        throw ApiError.conflict('El poligono se superpone con otra zona activa de la misma ciudad. Ajusta el mapa antes de publicar.');
      }
    }
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
    if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) throw ApiError.badRequest('La fecha de vigencia no es valida');
    return CoverageZone.create({
      cityId: input.cityId,
      name: input.name,
      deliveryFee: input.deliveryFee,
      cakeDeliveryFee: input.cakeDeliveryFee ?? 0,
      extraCoverageKm: input.extraCoverageKm ?? 0,
      extraFeePerKm: input.extraFeePerKm ?? 0,
      minimumOrder: input.minimumOrder ?? 0,
      estimatedMinutes: input.estimatedMinutes,
      priority: input.priority,
      polygon: input.polygon ?? null,
      effectiveFrom,
      version: 1,
      archivedAt: null,
    });
  },

  /** Costo, minimo y tiempo de una zona: lo que ve el cliente al validar cobertura. */
  async updateZone(
    zoneId: number,
    input: {
      name?: string;
      deliveryFee?: number;
      cakeDeliveryFee?: number;
      extraCoverageKm?: number;
      extraFeePerKm?: number;
      minimumOrder?: number;
      estimatedMinutes?: number;
      priority?: number;
      isActive?: boolean;
      polygon?: GeoPoint[] | null;
      expectedVersion?: number;
      effectiveFrom?: string | null;
      archivedAt?: string | null;
    },
  ) {
    const zone = await CoverageZone.findByPk(zoneId);
    if (!zone) throw ApiError.notFound('Zona no encontrada');
    if (input.expectedVersion !== undefined && input.expectedVersion !== zone.version) {
      throw ApiError.conflict('La zona cambio mientras la editabas. Recarga la cobertura e intentalo otra vez');
    }
    if (zone.archivedAt && input.isActive === true) {
      throw ApiError.conflict('Una zona archivada no puede volver a activarse');
    }
    try { assertValidPolygon(input.polygon); } catch (error) { throw ApiError.badRequest((error as Error).message); }

    const before = {
      name: zone.name,
      deliveryFee: Number(zone.deliveryFee),
      cakeDeliveryFee: Number(zone.cakeDeliveryFee),
      extraCoverageKm: Number(zone.extraCoverageKm),
      extraFeePerKm: Number(zone.extraFeePerKm),
      minimumOrder: Number(zone.minimumOrder),
      estimatedMinutes: zone.estimatedMinutes,
      priority: zone.priority,
      polygon: zone.polygon,
      isActive: zone.isActive,
      version: zone.version,
      effectiveFrom: zone.effectiveFrom,
      archivedAt: zone.archivedAt,
    };

    const nextPolygon = input.polygon === undefined ? zone.polygon : input.polygon;
    const polygonChanged = JSON.stringify(nextPolygon) !== JSON.stringify(zone.polygon);
    if (nextPolygon && polygonChanged && (input.isActive ?? zone.isActive)) {
      const peers = await CoverageZone.findAll({ where: { cityId: zone.cityId, isActive: true, id: { [Op.ne]: zone.id } } });
      if (peers.some((peer) => peer.polygon && polygonsOverlap(peer.polygon, nextPolygon))) {
        throw ApiError.conflict('El poligono se superpone con otra zona activa de la misma ciudad. Ajusta el mapa antes de publicar.');
      }
    }

    if (input.name !== undefined) zone.name = input.name;
    if (input.deliveryFee !== undefined) zone.deliveryFee = input.deliveryFee;
    if (input.cakeDeliveryFee !== undefined) zone.cakeDeliveryFee = input.cakeDeliveryFee;
    if (input.extraCoverageKm !== undefined) zone.extraCoverageKm = input.extraCoverageKm;
    if (input.extraFeePerKm !== undefined) zone.extraFeePerKm = input.extraFeePerKm;
    if (input.minimumOrder !== undefined) zone.minimumOrder = input.minimumOrder;
    if (input.estimatedMinutes !== undefined) zone.estimatedMinutes = input.estimatedMinutes;
    if (input.priority !== undefined) zone.priority = input.priority;
    if (input.isActive !== undefined) zone.isActive = input.isActive;
    if (input.polygon !== undefined) zone.polygon = input.polygon;
    if (input.effectiveFrom !== undefined) {
      const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
      if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) throw ApiError.badRequest('La fecha de vigencia no es valida');
      zone.effectiveFrom = effectiveFrom;
    }
    if (input.archivedAt !== undefined) zone.archivedAt = input.archivedAt ? new Date(input.archivedAt) : null;

    const extraCoverageKm = Number(zone.extraCoverageKm);
    const extraFeePerKm = Number(zone.extraFeePerKm);
    if ((extraCoverageKm > 0 && extraFeePerKm <= 0) || (extraFeePerKm > 0 && !zone.polygon)) {
      throw ApiError.badRequest('La extensión requiere un polígono y un recargo por kilómetro; 0 km significa sin límite');
    }

    zone.version += 1;
    await zone.save();
    return { zone, before };
  },

  async archiveZone(zoneId: number, expectedVersion?: number) {
    const zone = await CoverageZone.findByPk(zoneId);
    if (!zone) throw ApiError.notFound('Zona no encontrada');
    if (expectedVersion !== undefined && expectedVersion !== zone.version) {
      throw ApiError.conflict('La zona cambio mientras la editabas. Recarga la cobertura e intentalo otra vez');
    }
    const before = { isActive: zone.isActive, archivedAt: zone.archivedAt, version: zone.version };
    zone.isActive = false;
    zone.archivedAt = new Date();
    zone.version += 1;
    await zone.save();
    return { zone, before };
  },

  /** RN-002: que sucursal atiende esa zona. */
  async assignZoneToBranch(zoneId: number, branchId: number, priority: number) {
    const [zone, branch] = await Promise.all([CoverageZone.findByPk(zoneId), Branch.findByPk(branchId)]);
    if (!zone || zone.archivedAt) throw ApiError.notFound('Zona no encontrada');
    if (!branch) throw ApiError.notFound('Sucursal no encontrada');
    if (zone.cityId !== branch.cityId) throw ApiError.badRequest('La zona y la sucursal deben pertenecer a la misma ciudad');
    if (priority < 1) throw ApiError.badRequest('La prioridad debe ser mayor que cero');
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

    if (coverageZoneId !== null) {
      const zone = await CoverageZone.findByPk(coverageZoneId);
      if (!zone || zone.cityId !== district.cityId) throw ApiError.badRequest('La zona no pertenece a la ciudad del distrito');
      if (!zone.isActive || zone.archivedAt) throw ApiError.badRequest('No puedes abrir un distrito con una zona apagada o archivada');
    }

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
    carCapacity?: number;
    cutoffHours: number;
  }) {
    const branch = await Branch.findByPk(input.branchId, {
      include: [{ model: City, as: 'city', attributes: ['timezone'] }, { model: BranchSchedule, as: 'schedules' }],
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

        if (!geoService.slotWithinSchedule(branch, { startsAt, endsAt })) continue;
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
            carCapacity: Math.min(input.capacity, input.carCapacity ?? branch.defaultCarCapacity ?? 0),
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
