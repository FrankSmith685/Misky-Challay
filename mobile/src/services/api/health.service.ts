import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export interface HealthStatus {
  service: string;
  status: string;
  database: string;
  timestamp: string;
}

export const getHealthStatus = () => apiRequest<HealthStatus>(ENDPOINTS.health, { method: 'GET' });
