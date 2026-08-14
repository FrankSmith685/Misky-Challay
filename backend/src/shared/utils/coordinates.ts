export interface CoordinatePair {
  latitude?: number | null;
  longitude?: number | null;
}

export const hasCoordinatePair = ({ latitude, longitude }: CoordinatePair): boolean => {
  const hasLatitude = latitude !== undefined;
  const hasLongitude = longitude !== undefined;

  if (!hasLatitude && !hasLongitude) return true;
  if (!hasLatitude || !hasLongitude) return false;

  return (latitude === null) === (longitude === null);
};

export const coordinatePairIssue = {
  message: 'Latitud y longitud deben enviarse juntas',
  path: ['latitude'] as [string],
};
