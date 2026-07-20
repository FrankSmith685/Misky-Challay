import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: Array<{ code: string; label: string }>;
}

export interface RoleRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isProtected: boolean;
  userCount: number;
  permissions: string[];
}

export interface StaffRow {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  roles: Array<{ id: number; code: string; name: string }>;
  branchIds: number[];
}

export const accessApi = {
  async permissions(): Promise<PermissionGroup[]> {
    const { data } = await api.get<ApiSuccess<PermissionGroup[]>>('/access/permissions');
    return data.data;
  },

  async roles(): Promise<RoleRow[]> {
    const { data } = await api.get<ApiSuccess<RoleRow[]>>('/access/roles');
    return data.data;
  },

  async createRole(input: {
    code: string;
    name: string;
    description?: string;
    permissions: string[];
  }): Promise<void> {
    await api.post('/access/roles', input);
  },

  async updateRole(
    roleId: number,
    input: { name?: string; description?: string; permissions?: string[] },
  ): Promise<void> {
    await api.patch(`/access/roles/${roleId}`, input);
  },

  async deleteRole(roleId: number): Promise<void> {
    await api.delete(`/access/roles/${roleId}`);
  },

  async staff(): Promise<StaffRow[]> {
    const { data } = await api.get<ApiSuccess<StaffRow[]>>('/access/staff');
    return data.data;
  },

  async createStaff(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roleIds: number[];
    branchId?: number | null;
  }): Promise<void> {
    await api.post('/access/staff', input);
  },

  async updateStaffRoles(
    userId: number,
    input: { roleIds: number[]; branchId?: number | null },
  ): Promise<void> {
    await api.patch(`/access/staff/${userId}/roles`, input);
  },

  async setStatus(userId: number, status: 'ACTIVE' | 'BLOCKED'): Promise<void> {
    await api.patch(`/access/staff/${userId}/status`, { status });
  },

  async setSuperAdmin(userId: number, value: boolean): Promise<void> {
    await api.patch(`/access/staff/${userId}/superadmin`, { value });
  },
};
