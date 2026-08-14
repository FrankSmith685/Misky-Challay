export interface BranchSelectionCandidate {
  id: number;
  isOpen: boolean;
  prepMinutes: number;
  activeOrders: number;
  /** Menor numero = mayor preferencia operativa dentro de la zona. */
  priority: number;
  /** Distancia en linea recta; solo sirve para la preseleccion. */
  distanceKm: number | null;
}

export interface BranchRouteEstimate {
  minutes: number;
  distanceKm: number;
}

const CLOSED_PENALTY = 10_000;
const ORDER_LOAD_MINUTES = 4;
const PRIORITY_STEP_MINUTES = 8;
const APPROX_MINUTES_PER_KM = 3;

const operationalPenalty = (candidate: BranchSelectionCandidate): number =>
  (candidate.isOpen ? 0 : CLOSED_PENALTY)
  + candidate.prepMinutes
  + candidate.activeOrders * ORDER_LOAD_MINUTES
  + Math.max(0, candidate.priority - 1) * PRIORITY_STEP_MINUTES;

/**
 * Orden rapido para no pedir rutas a todos los locales de la ciudad. La distancia
 * recta solo arma una lista corta; la decision definitiva usa la ruta vehicular.
 */
export const preliminaryBranchScore = (candidate: BranchSelectionCandidate): number =>
  operationalPenalty(candidate)
  + (candidate.distanceKm === null ? 0 : candidate.distanceKm * APPROX_MINUTES_PER_KM);

export const shortlistBranches = (
  candidates: BranchSelectionCandidate[],
  limit = 2,
): BranchSelectionCandidate[] =>
  [...candidates]
    .sort((left, right) =>
      preliminaryBranchScore(left) - preliminaryBranchScore(right)
      || left.priority - right.priority
      || left.id - right.id)
    .slice(0, Math.max(1, limit));

/**
 * La prioridad es una preferencia, no una prohibicion: una ruta claramente mas
 * rapida o una cocina menos saturada puede superar al local prioritario.
 */
export const finalBranchScore = (
  candidate: BranchSelectionCandidate,
  route: BranchRouteEstimate | null,
  fallbackTravelMinutes: number,
): number =>
  operationalPenalty(candidate)
  + (route?.minutes
    ?? (candidate.distanceKm === null
      ? fallbackTravelMinutes
      : candidate.distanceKm * APPROX_MINUTES_PER_KM));

export const selectBestBranch = (
  candidates: BranchSelectionCandidate[],
  routes: ReadonlyMap<number, BranchRouteEstimate | null>,
  fallbackTravelMinutes: number,
): BranchSelectionCandidate | undefined =>
  [...candidates].sort((left, right) =>
    finalBranchScore(left, routes.get(left.id) ?? null, fallbackTravelMinutes)
      - finalBranchScore(right, routes.get(right.id) ?? null, fallbackTravelMinutes)
    || left.priority - right.priority
    || left.id - right.id)[0];
