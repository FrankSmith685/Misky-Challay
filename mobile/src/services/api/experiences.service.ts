import type { ExperiencePackage } from '../../types/experiences';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export interface ExperienceCustomer {
  id: number;
  status: string;
  version: number;
  package: ExperiencePackage;
  revisionsUsed: number;
  feedback: string | null;
  scene: unknown | null;
  publicToken: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  previewExpiresAt: string | null;
}

export interface ExperienceReviewInput {
  expectedVersion: number;
  approve: boolean;
  feedback?: string;
}

export const experiencesApi = {
  packages: () => apiRequest<ExperiencePackage[]>(ENDPOINTS.experiences.packages),
  customer: (orderNumber: string) =>
    apiRequest<ExperienceCustomer | null>(ENDPOINTS.experiences.customer(orderNumber), { auth: true }),
  review: (orderNumber: string, input: ExperienceReviewInput) =>
    apiRequest<ExperienceCustomer>(ENDPOINTS.experiences.review(orderNumber), {
      method: 'POST',
      auth: true,
      body: input,
    }),
  public: (token: string) =>
    apiRequest<{ scene: unknown; expiresAt: string }>(ENDPOINTS.experiences.public(token)),
};
