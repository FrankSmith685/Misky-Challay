import { Op } from 'sequelize';
import {
  Branch,
  BranchSchedule,
  City,
  CoverageZone,
  District,
  DeliverySlot,
  Order,
  ZoneBranch,
} from '@database/models';
import type { GeoPoint } from '@database/models/coverageZone.model';
import { ApiError } from '@shared/errors/ApiError';
import { addDaysToIsoDate, defaultTimeZone, zonedParts } from '@shared/utils/datetime';
import { routingService } from './routing.service';
import {
  selectBestBranch,
  shortlistBranches,
  type BranchRouteEstimate,
  type BranchSelectionCandidate,
} from './branchSelection';

export interface CoverageQuery {
  cityId?: number;
  districtId?: number;
  latitude?: number;
  longitude?: number;
}

export interface CoverageResult {
  covered: boolean;
  reason?: string;
  zone?: {
    id: number;
    name: string;
    deliveryFee: number;
    minimumOrder: number;
    estimatedMinutes: number;
    polygon: GeoPoint[] | null;
  };
  branch?: {
    id: number;
    name: string;
    addressLine: string;
    prepMinutes: number;
    isOpenNow: boolean;
  };
  etaMinutes?: number;
  demandLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  etaSource?: 'LIVE_ROUTE' | 'ESTIMATE';
  routeDistanceKm?: number;
  nearestPickup?: {
    id: number;
    name: string;
    addressLine: string;
    distanceKm: number;
    isOpenNow: boolean;
  };
}

/**
 * Punto dentro de poligono (algoritmo ray casting).
 * Suficiente para zonas urbanas simples; si la geo crece se migra a indices
 * espaciales (MySQL ST_Contains o PostGIS) sin cambiar esta interfaz.
 */
const isPointInPolygon = (point: GeoPoint, polygon: GeoPoint[]): boolean => {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];

    const intersects =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;

    if (intersects) inside = !inside;
  }

  return inside;
};

const toMinutes = (value: string): number => {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
};

const ruleFor = (
  schedules: BranchSchedule[],
  isoDate: string,
  weekday: number,
): BranchSchedule | null =>
  schedules.find((schedule) => schedule.exceptionDate === isoDate)
  ?? schedules.find(
    (schedule) => schedule.exceptionDate === null && schedule.weekday === weekday,
  )
  ?? null;

/** Evalua el tramo del mismo dia; los horarios nocturnos terminan al dia siguiente. */
const coversMinute = (rule: BranchSchedule, minutes: number): boolean => {
  const opens = toMinutes(rule.opensAt);
  const closes = toMinutes(rule.closesAt);

  if (closes > opens) return minutes >= opens && minutes < closes;
  if (closes < opens) return minutes >= opens;
  return false;
};

/**
 * RN-003: la sucursal debe estar abierta en la fecha/hora solicitada.
 * Fecha, dia de la semana y hora se leen del mismo instante y en la zona horaria de
 * la operacion; ver `@shared/utils/datetime` para el porque.
 */
const isBranchOpenAt = (
  schedules: BranchSchedule[],
  when: Date,
  timeZone: string = defaultTimeZone(),
): boolean => {
  const { isoDate, weekday, minutes } = zonedParts(when, timeZone);

  const today = ruleFor(schedules, isoDate, weekday);
  if (today && !today.isClosed && coversMinute(today, minutes)) return true;

  // En la madrugada puede seguir vigente el turno nocturno del dia anterior.
  const yesterday = ruleFor(schedules, addDaysToIsoDate(isoDate, -1), (weekday + 6) % 7);
  if (!yesterday || yesterday.isClosed) return false;

  const opens = toMinutes(yesterday.opensAt);
  const closes = toMinutes(yesterday.closesAt);
  return closes < opens && minutes < closes;
};

const distanceKm = (latitude: number, longitude: number, branch: Branch) => {
  const branchLatitude = Number(branch.latitude);
  const branchLongitude = Number(branch.longitude);
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(branchLatitude - latitude);
  const dLng = radians(branchLongitude - longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(latitude)) * Math.cos(radians(branchLatitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
};

const findNearestPickup = async (query: CoverageQuery, when: Date) => {
  if (query.latitude === undefined || query.longitude === undefined) return undefined;
  const branches = await Branch.findAll({
    where: { isActive: true, acceptsPickup: true, ...(query.cityId ? { cityId: query.cityId } : {}) },
    include: [{ model: BranchSchedule, as: 'schedules' }],
  });
  const located = branches
    .filter((branch) => branch.latitude != null && branch.longitude != null)
    .map((branch) => ({ branch, distanceKm: distanceKm(query.latitude!, query.longitude!, branch) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
  if (!located || located.distanceKm > 50) return undefined;
  const schedules = (located.branch.get('schedules') as BranchSchedule[] | undefined) ?? [];
  return {
    id: located.branch.id,
    name: located.branch.name,
    addressLine: located.branch.addressLine,
    distanceKm: located.distanceKm,
    isOpenNow: isBranchOpenAt(schedules, when),
  };
};

export const geoService = {
  async listCities() {
    return City.findAll({ where: { isActive: true }, order: [['name', 'ASC']] });
  },

  async listDistricts(cityId: number) {
    return District.findAll({
      where: { cityId, isActive: true },
      attributes: ['id', 'cityId', 'name', 'slug', 'ubigeoCode', 'coverageZoneId'],
      order: [['name', 'ASC']],
    });
  },

  async listBranches(cityId?: number) {
    return Branch.findAll({
      where: { isActive: true, ...(cityId ? { cityId } : {}) },
      include: [{ model: BranchSchedule, as: 'schedules' }],
      order: [['name', 'ASC']],
    });
  },

  /**
   * RN-001 / RN-002: resuelve zona -> sucursal elegible para una direccion.
   * Acepta coordenadas (poligono) o distrito (util cuando aun no hay geocodificacion).
   */
  async checkCoverage(query: CoverageQuery, when = new Date()): Promise<CoverageResult> {
    let zone: CoverageZone | null = null;

    if (query.latitude !== undefined && query.longitude !== undefined) {
      const zones = await CoverageZone.findAll({
        where: { isActive: true, ...(query.cityId ? { cityId: query.cityId } : {}) },
        order: [['priority', 'ASC']],
      });

      const point: GeoPoint = { lat: query.latitude, lng: query.longitude };
      zone =
        zones.find((candidate) => {
          const polygon = candidate.polygon;
          return Array.isArray(polygon) && polygon.length >= 3 && isPointInPolygon(point, polygon);
        }) ?? null;
    }

    if (!zone && query.districtId) {
      const district = await District.findByPk(query.districtId);
      if (district?.coverageZoneId) {
        const districtZone = await CoverageZone.findOne({
          where: { id: district.coverageZoneId, isActive: true },
        });
        const districtHasExactPolygon = Array.isArray(districtZone?.polygon) && districtZone.polygon.length >= 3;
        // Las coordenadas exactas prevalecen sobre la cobertura general del distrito.
        if (!(query.latitude !== undefined && query.longitude !== undefined && districtHasExactPolygon)) {
          zone = districtZone;
        }
      }
    }

    if (!zone) {
      return {
        covered: false,
        reason: query.latitude !== undefined
          ? 'Este punto está fuera del área exacta de entrega'
          : 'Todavía no llegamos a esta dirección',
        nearestPickup: await findNearestPickup(query, when),
      };
    }

    const zoneInfo = {
      id: zone.id,
      name: zone.name,
      deliveryFee: Number(zone.deliveryFee),
      minimumOrder: Number(zone.minimumOrder),
      estimatedMinutes: zone.estimatedMinutes,
      polygon: zone.polygon,
    };

    const branches = await Branch.findAll({
      where: { isActive: true, acceptsDelivery: true },
      include: [
        {
          model: CoverageZone,
          as: 'zones',
          where: { id: zone.id },
          through: { attributes: ['priority', 'isActive'], where: { isActive: true } },
        },
        { model: BranchSchedule, as: 'schedules' },
      ],
    });

    const candidateRows = await Promise.all(branches.map(async (candidate) => {
      const schedules = (candidate.get('schedules') as BranchSchedule[] | undefined) ?? [];
      const open = isBranchOpenAt(schedules, when);
      const activeOrders = await Order.count({
        where: { branchId: candidate.id, status: { [Op.in]: ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING'] } },
      });
      const linkedZone = ((candidate.get('zones') as CoverageZone[] | undefined) ?? [])[0];
      const link = linkedZone?.get('ZoneBranch') as ZoneBranch | undefined;
      const selection: BranchSelectionCandidate = {
        id: candidate.id,
        isOpen: open,
        prepMinutes: candidate.prepMinutes,
        activeOrders,
        priority: Math.max(1, Number(link?.priority ?? 1)),
        distanceKm: query.latitude !== undefined
          && query.longitude !== undefined
          && candidate.latitude != null
          && candidate.longitude != null
          ? distanceKm(query.latitude, query.longitude, candidate)
          : null,
      };
      return { branch: candidate, schedules, selection };
    }));

    const shortlist = shortlistBranches(candidateRows.map((row) => row.selection), 2);
    const shortlistedRows = shortlist
      .map((candidate) => candidateRows.find((row) => row.selection.id === candidate.id))
      .filter((row): row is (typeof candidateRows)[number] => Boolean(row));
    const routeEntries = await Promise.all(shortlistedRows.map(async (row) => {
      const liveRoute = query.latitude !== undefined
        && query.longitude !== undefined
        && row.branch.latitude != null
        && row.branch.longitude != null
        ? await routingService.route(
          { latitude: Number(row.branch.latitude), longitude: Number(row.branch.longitude) },
          { latitude: query.latitude, longitude: query.longitude },
        )
        : null;
      return [row.branch.id, liveRoute] as const;
    }));
    const routes = new Map<number, BranchRouteEstimate | null>(routeEntries);
    const selectedCandidate = selectBestBranch(shortlist, routes, zone.estimatedMinutes);
    const selected = candidateRows.find((row) => row.selection.id === selectedCandidate?.id);
    const branch = selected?.branch;
    if (!branch) {
      return {
        covered: false,
        reason: 'La zona existe pero no tiene una cocina asignada',
        zone: zoneInfo,
      };
    }

    const schedules = selected.schedules;
    const demandDelay = Math.min(25, selected.selection.activeOrders * 2);
    const liveRoute = routes.get(branch.id) ?? null;

    return {
      covered: true,
      zone: zoneInfo,
      branch: {
        id: branch.id,
        name: branch.name,
        addressLine: branch.addressLine,
        prepMinutes: branch.prepMinutes,
        isOpenNow: isBranchOpenAt(schedules, when),
      },
      etaMinutes: branch.prepMinutes + (liveRoute?.minutes ?? zone.estimatedMinutes) + demandDelay,
      demandLevel: selected.selection.activeOrders >= 8 ? 'HIGH' : selected.selection.activeOrders >= 4 ? 'MEDIUM' : 'LOW',
      etaSource: liveRoute ? 'LIVE_ROUTE' : 'ESTIMATE',
      routeDistanceKm: liveRoute?.distanceKm,
    };
  },

  /** Franjas con cupo disponible de una sucursal (RN-004). */
  async listSlots(branchId: number, from = new Date(), days = 7) {
    const until = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

    const slots = await DeliverySlot.findAll({
      where: {
        branchId,
        isActive: true,
        startsAt: { [Op.between]: [from, until] },
        orderCutoffAt: { [Op.gt]: new Date() },
      },
      order: [['startsAt', 'ASC']],
    });

    return slots
      .filter((slot) => slot.availableCount > 0)
      .map((slot) => ({
        id: slot.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        available: slot.availableCount,
        orderCutoffAt: slot.orderCutoffAt,
      }));
  },

  async getBranchOrFail(branchId: number) {
    const branch = await Branch.findOne({
      where: { id: branchId, isActive: true },
      include: [{ model: BranchSchedule, as: 'schedules' }],
    });
    if (!branch) throw ApiError.notFound('Sucursal no encontrada');
    return branch;
  },

  isBranchOpenNow(branch: Branch, when = new Date()) {
    const schedules = (branch.get('schedules') as BranchSchedule[] | undefined) ?? [];
    return isBranchOpenAt(schedules, when);
  },
};

export type GeoService = typeof geoService;
