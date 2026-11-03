import type { PolygonPoint } from '@features/geo/components/CoveragePolygonPicker';
import type { AdminBranch, AdminSchedule, AdminZone, Coverage } from '../services/commercialAdmin.service';

export const pointInPolygon = (point: PolygonPoint, polygon: PolygonPoint[]): boolean => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = currentPoint.lat > point.lat !== previousPoint.lat > point.lat
      && point.lng < ((previousPoint.lng - currentPoint.lng) * (point.lat - currentPoint.lat))
        / (previousPoint.lat - currentPoint.lat) + currentPoint.lng;
    if (intersects) inside = !inside;
  }
  return inside;
};

export const polygonsOverlap = (first: PolygonPoint[], second: PolygonPoint[]): boolean =>
  first.some((point) => pointInPolygon(point, second))
  || second.some((point) => pointInPolygon(point, first));

export const zoneEdits = (zone: AdminZone) => ({
  deliveryFee: zone.deliveryFee,
  extraCoverageKm: zone.extraCoverageKm,
  extraFeePerKm: zone.extraFeePerKm,
  minimumOrder: zone.minimumOrder,
  estimatedMinutes: zone.estimatedMinutes,
});

export const scheduleEdits = (schedule: AdminSchedule) => ({
  opensAt: schedule.opensAt,
  closesAt: schedule.closesAt,
  isClosed: schedule.isClosed,
});

export const sameEdits = (first: object, second: object): boolean =>
  JSON.stringify(first) === JSON.stringify(second);

const mergeBranch = (
  fresh: AdminBranch,
  edited: AdminBranch,
  server: AdminBranch,
): AdminBranch => ({
  ...fresh,
  prepMinutes: edited.prepMinutes !== server.prepMinutes ? edited.prepMinutes : fresh.prepMinutes,
  schedules: fresh.schedules.map((schedule) => {
    const editedSchedule = edited.schedules.find((entry) => entry.id === schedule.id);
    const serverSchedule = server.schedules.find((entry) => entry.id === schedule.id);
    return editedSchedule
      && serverSchedule
      && !sameEdits(scheduleEdits(editedSchedule), scheduleEdits(serverSchedule))
      ? { ...schedule, ...scheduleEdits(editedSchedule) }
      : schedule;
  }),
});

export const mergeCoverage = (
  fresh: Coverage,
  local: Coverage | null,
  previous: Coverage | null,
): Coverage => {
  if (!local || !previous) return fresh;

  return {
    ...fresh,
    zones: fresh.zones.map((zone) => {
      const edited = local.zones.find((entry) => entry.id === zone.id);
      const server = previous.zones.find((entry) => entry.id === zone.id);
      return edited && server && !sameEdits(zoneEdits(edited), zoneEdits(server))
        ? { ...zone, ...zoneEdits(edited) }
        : zone;
    }),
    branches: fresh.branches.map((branch) => {
      const edited = local.branches.find((entry) => entry.id === branch.id);
      const server = previous.branches.find((entry) => entry.id === branch.id);
      return edited && server ? mergeBranch(branch, edited, server) : branch;
    }),
  };
};

export const crossesMidnight = (schedule: AdminSchedule): boolean =>
  !schedule.isClosed && schedule.closesAt < schedule.opensAt;

export const isEmptySchedule = (schedule: AdminSchedule): boolean =>
  !schedule.isClosed && schedule.closesAt === schedule.opensAt;
