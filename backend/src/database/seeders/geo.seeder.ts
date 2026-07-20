import { logger } from '@config/logger';
import {
  Branch,
  BranchSchedule,
  City,
  CoverageZone,
  DeliverySlot,
  District,
  ZoneBranch,
} from '../models';
import type { GeoPoint } from '../models/coverageZone.model';

/**
 * Datos iniciales de operacion (decision de Fase 0: Lima, 1 sucursal).
 * Idempotente: se puede ejecutar en cada arranque.
 */

/** Poligono aproximado de la zona atendida (Lima centro-sur). */
const ZONE_POLYGON: GeoPoint[] = [
  { lat: -12.045, lng: -77.07 },
  { lat: -12.045, lng: -76.96 },
  { lat: -12.17, lng: -76.96 },
  { lat: -12.17, lng: -77.07 },
];

/**
 * UBIGEO oficial de los 43 distritos de Lima Metropolitana (provincia 1501).
 * El código es información maestra; `covered` solo configura la demo opcional.
 */
const DISTRICTS: Array<{ ubigeoCode: string; name: string; slug: string; covered?: boolean }> = [
  { ubigeoCode: '150101', name: 'Lima', slug: 'lima-cercado' },
  { ubigeoCode: '150102', name: 'Ancón', slug: 'ancon' },
  { ubigeoCode: '150103', name: 'Ate', slug: 'ate' },
  { ubigeoCode: '150104', name: 'Barranco', slug: 'barranco', covered: true },
  { ubigeoCode: '150105', name: 'Breña', slug: 'brena' },
  { ubigeoCode: '150106', name: 'Carabayllo', slug: 'carabayllo' },
  { ubigeoCode: '150107', name: 'Chaclacayo', slug: 'chaclacayo' },
  { ubigeoCode: '150108', name: 'Chorrillos', slug: 'chorrillos' },
  { ubigeoCode: '150109', name: 'Cieneguilla', slug: 'cieneguilla' },
  { ubigeoCode: '150110', name: 'Comas', slug: 'comas' },
  { ubigeoCode: '150111', name: 'El Agustino', slug: 'el-agustino' },
  { ubigeoCode: '150112', name: 'Independencia', slug: 'independencia' },
  { ubigeoCode: '150113', name: 'Jesús María', slug: 'jesus-maria', covered: true },
  { ubigeoCode: '150114', name: 'La Molina', slug: 'la-molina' },
  { ubigeoCode: '150115', name: 'La Victoria', slug: 'la-victoria' },
  { ubigeoCode: '150116', name: 'Lince', slug: 'lince', covered: true },
  { ubigeoCode: '150117', name: 'Los Olivos', slug: 'los-olivos' },
  { ubigeoCode: '150118', name: 'Lurigancho', slug: 'lurigancho' },
  { ubigeoCode: '150119', name: 'Lurín', slug: 'lurin' },
  { ubigeoCode: '150120', name: 'Magdalena del Mar', slug: 'magdalena-del-mar' },
  { ubigeoCode: '150121', name: 'Pueblo Libre', slug: 'pueblo-libre' },
  { ubigeoCode: '150122', name: 'Miraflores', slug: 'miraflores', covered: true },
  { ubigeoCode: '150123', name: 'Pachacámac', slug: 'pachacamac' },
  { ubigeoCode: '150124', name: 'Pucusana', slug: 'pucusana' },
  { ubigeoCode: '150125', name: 'Puente Piedra', slug: 'puente-piedra' },
  { ubigeoCode: '150126', name: 'Punta Hermosa', slug: 'punta-hermosa' },
  { ubigeoCode: '150127', name: 'Punta Negra', slug: 'punta-negra' },
  { ubigeoCode: '150128', name: 'Rímac', slug: 'rimac' },
  { ubigeoCode: '150129', name: 'San Bartolo', slug: 'san-bartolo' },
  { ubigeoCode: '150130', name: 'San Borja', slug: 'san-borja', covered: true },
  { ubigeoCode: '150131', name: 'San Isidro', slug: 'san-isidro', covered: true },
  { ubigeoCode: '150132', name: 'San Juan de Lurigancho', slug: 'san-juan-de-lurigancho' },
  { ubigeoCode: '150133', name: 'San Juan de Miraflores', slug: 'san-juan-de-miraflores' },
  { ubigeoCode: '150134', name: 'San Luis', slug: 'san-luis' },
  { ubigeoCode: '150135', name: 'San Martín de Porres', slug: 'san-martin-de-porres' },
  { ubigeoCode: '150136', name: 'San Miguel', slug: 'san-miguel' },
  { ubigeoCode: '150137', name: 'Santa Anita', slug: 'santa-anita' },
  { ubigeoCode: '150138', name: 'Santa María del Mar', slug: 'santa-maria-del-mar' },
  { ubigeoCode: '150139', name: 'Santa Rosa', slug: 'santa-rosa' },
  { ubigeoCode: '150140', name: 'Santiago de Surco', slug: 'santiago-de-surco', covered: true },
  { ubigeoCode: '150141', name: 'Surquillo', slug: 'surquillo', covered: true },
  { ubigeoCode: '150142', name: 'Villa El Salvador', slug: 'villa-el-salvador' },
  { ubigeoCode: '150143', name: 'Villa María del Triunfo', slug: 'villa-maria-del-triunfo' },
];

/** Franjas para pedidos programados: 2 por dia durante los proximos 7 dias. */
const seedSlots = async (branchId: number, zoneId: number): Promise<void> => {
  const now = new Date();

  for (let day = 1; day <= 7; day += 1) {
    for (const [startHour, endHour] of [
      [12, 14],
      [19, 21],
    ]) {
      const startsAt = new Date(now);
      startsAt.setDate(now.getDate() + day);
      startsAt.setHours(startHour, 0, 0, 0);

      const endsAt = new Date(startsAt);
      endsAt.setHours(endHour, 0, 0, 0);

      const orderCutoffAt = new Date(startsAt.getTime() - 2 * 60 * 60 * 1000);

      await DeliverySlot.findOrCreate({
        where: { branchId, startsAt },
        defaults: {
          branchId,
          coverageZoneId: zoneId,
          startsAt,
          endsAt,
          orderCutoffAt,
          capacity: 20,
          reservedCount: 0,
          confirmedCount: 0,
          isActive: true,
        },
      });
    }
  }
};

/**
 * Carga maestra minima: ciudad de Lima y sus 43 distritos con codigo UBIGEO.
 * No crea cobertura, sucursales ni horarios comerciales.
 */
export const seedUbigeo = async (): Promise<City> => {
  const [lima] = await City.findOrCreate({
    where: { slug: 'lima' },
    defaults: { name: 'Lima', slug: 'lima', country: 'PE', currency: 'PEN', timezone: 'America/Lima' },
  });

  for (const district of DISTRICTS) {
    const [row, created] = await District.findOrCreate({
      where: { ubigeoCode: district.ubigeoCode },
      defaults: {
        cityId: lima.id,
        ubigeoCode: district.ubigeoCode,
        slug: district.slug,
        name: district.name,
        coverageZoneId: null,
        isActive: true,
      },
    });

    if (
      !created &&
      (row.cityId !== lima.id || row.name !== district.name || row.slug !== district.slug)
    ) {
      await row.update({
        cityId: lima.id,
        name: district.name,
        slug: district.slug,
      });
    }
  }

  logger.success(`UBIGEO listo: ${DISTRICTS.length} distritos de Lima Metropolitana`);
  return lima;
};

export const seedGeography = async (): Promise<void> => {
  // 1) La informacion maestra siempre existe, incluso sin demo.
  const lima = await seedUbigeo();

  // 2) Zona de cobertura
  const [zone] = await CoverageZone.findOrCreate({
    where: { cityId: lima.id, name: 'Lima Centro-Sur' },
    defaults: {
      cityId: lima.id,
      name: 'Lima Centro-Sur',
      polygon: ZONE_POLYGON,
      deliveryFee: 6.9,
      minimumOrder: 25,
      estimatedMinutes: 35,
      priority: 1,
      isActive: true,
    },
  });

  // 3) La demo solo abre los distritos marcados. No cierra configuraciones del administrador.
  for (const district of DISTRICTS) {
    if (!district.covered) continue;
    await District.update(
      { coverageZoneId: zone.id },
      { where: { ubigeoCode: district.ubigeoCode } },
    );
  }

  const miraflores = await District.findOne({
    where: { ubigeoCode: '150122' },
  });

  // 4) Sucursal (unica cocina del lanzamiento)
  const [branch] = await Branch.findOrCreate({
    where: { slug: 'verde-bowl-miraflores' },
    defaults: {
      cityId: lima.id,
      districtId: miraflores?.id ?? null,
      name: 'Verde Bowl Miraflores',
      slug: 'verde-bowl-miraflores',
      addressLine: 'Av. Jose Larco 345, Miraflores',
      latitude: -12.1219,
      longitude: -77.0297,
      phone: '+51 900 000 000',
      prepMinutes: 20,
      acceptsPickup: true,
      acceptsDelivery: true,
      isActive: true,
    },
  });

  // 5) La sucursal atiende la zona (RN-002)
  await ZoneBranch.findOrCreate({
    where: { coverageZoneId: zone.id, branchId: branch.id },
    defaults: { coverageZoneId: zone.id, branchId: branch.id, priority: 1, isActive: true },
  });

  // 6) Horario regular: todos los dias de 10:00 a 22:00 (RN-003)
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    await BranchSchedule.findOrCreate({
      where: { branchId: branch.id, weekday, exceptionDate: null },
      defaults: {
        branchId: branch.id,
        weekday,
        exceptionDate: null,
        opensAt: '10:00',
        closesAt: '22:00',
        isClosed: false,
      },
    });
  }

  // 7) Franjas horarias para pedidos programados (RN-004)
  await seedSlots(branch.id, zone.id);

  logger.success(`Geografia lista: ${lima.name}, zona "${zone.name}", sucursal "${branch.name}"`);
};
