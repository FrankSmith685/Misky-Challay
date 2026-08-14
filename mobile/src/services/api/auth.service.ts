import type { User } from '../../types/domain';
import { apiCall, apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  acceptedTerms: true;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<AuthResult>(ENDPOINTS.auth.login, { method: 'POST', body: { email, password } }),
  register: (input: RegisterInput) =>
    apiRequest<AuthResult>(ENDPOINTS.auth.register, { method: 'POST', body: input }),
  me: () => apiRequest<User>(ENDPOINTS.auth.me, { method: 'GET', auth: true }),
  logout: () => apiRequest<null>(ENDPOINTS.auth.logout, { method: 'POST', auth: true }),
  async forgotPassword(email: string): Promise<string> {
    const response = await apiCall<null>(ENDPOINTS.auth.forgotPassword, {
      method: 'POST',
      body: { email, client: 'MOBILE' },
    });
    return response.message;
  },
  async resetPassword(token: string, password: string): Promise<string> {
    const response = await apiCall<null>(ENDPOINTS.auth.resetPassword, {
      method: 'POST',
      body: { token, password },
    });
    return response.message;
  },
};
