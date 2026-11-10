import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: Array<{ code: string; label: string; dependencies: string[]; scope: 'BRANCH' | 'GLOBAL'; risk: 'NORMAL' | 'HIGH' | 'CRITICAL' }>;
}

export interface RoleRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isProtected: boolean;
  isArchived: boolean;
  userCount: number;
  permissions: string[];
  security: { level: 'NONE' | 'NORMAL' | 'HIGH' | 'CRITICAL'; reasons: string[]; missingDependencies: string[]; requiresBranch: boolean };
}

export interface RoleImpact {
  role: { id: number; code: string; name: string; permissions: string[]; security: RoleRow['security'] };
  users: Array<{ id: number; name: string; email: string | null; status: string; isSuperAdmin: boolean; archivedAt: string | null; branchIds: Array<number | null>; branches: string[] }>;
  totalUsers: number;
  assignments: number;
  activeUsers: number;
  globalAssignments: number;
  audit: Array<{ id: number; action: string; actorId: number | null; beforeJson: Record<string, unknown> | null; afterJson: Record<string, unknown> | null; createdAt: string }>;
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
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  archivedAt: string | null;
  version: number;
}

export interface CustomerRow {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  version: number;
}

export interface TeamsOverview {
  generatedAt: string;
  teams: Array<{
    id: number | null;
    key: string;
    name: string;
    description: string;
    route: string;
    roleCodes: string[];
    branchRequired: boolean;
    minimumPerBranch: number;
    activeMembers: number;
    noBranchScope: number;
    globalScope: number;
    health: 'READY' | 'REVIEW' | 'EMPTY';
    issues: string[];
    members: Array<{ id: number; name: string; status: string; roles: string[]; branchIds: number[]; globalScope: boolean; mustChangePassword: boolean }>;
    roles: Array<{ id: number; code: string; name: string; permissions: string[] }>;
    responsibilities: Array<{ id: number; userId: number; userName: string; branchId: number | null; responsibility: 'PRIMARY' | 'BACKUP'; availability: 'AVAILABLE' | 'AWAY' | 'UNAVAILABLE'; effectiveFrom: string; effectiveUntil: string | null; reason: string | null }>;
  }>;
  branches: Array<{ id: number; name: string; isActive: boolean; teams: Array<{ teamKey: string; people: number; minimum: number; covered: boolean }> }>;
  metrics: { pendingOrders: number; openKitchenTickets: number; unassignedDeliveries: number; pendingPayments: number; pendingPurchases: number; openComplaints: number };
  governance: {
    activeStaff: number;
    superadmins: number;
    superadminsWithoutMfa: number;
    reviewAlerts: number;
    blockedUsers: number;
    forcedPasswordUsers: number;
    dormantUsers: number;
    globalScopeUsers: number;
    rolesWithoutTeam: Array<{ id: number; code: string; name: string }>;
    usersWithoutTeam: Array<{ id: number; name: string }>;
  };
}

export const accessApi = {
  async permissions(): Promise<PermissionGroup[]> {
    const { data } = await api.get<ApiSuccess<PermissionGroup[]>>('/access/permissions');
    return data.data;
  },

  async roles(includeArchived = false): Promise<RoleRow[]> {
    const { data } = await api.get<ApiSuccess<RoleRow[]>>('/access/roles', { params: includeArchived ? { includeArchived: true } : {} });
    return data.data;
  },

  async teamsOverview(): Promise<TeamsOverview> {
    const { data } = await api.get<ApiSuccess<TeamsOverview>>('/access/teams/overview');
    return data.data;
  },

  async createTeamAssignment(teamId: number, input: { userId: number; branchId?: number | null; responsibility?: 'PRIMARY' | 'BACKUP'; effectiveFrom?: string; effectiveUntil?: string | null; availability?: 'AVAILABLE' | 'AWAY' | 'UNAVAILABLE'; reason?: string | null }): Promise<void> {
    await api.post(`/access/teams/${teamId}/assignments`, input);
  },

  async updateTeamAssignment(teamId: number, assignmentId: number, input: Partial<{ branchId: number | null; responsibility: 'PRIMARY' | 'BACKUP'; effectiveFrom: string; effectiveUntil: string | null; availability: 'AVAILABLE' | 'AWAY' | 'UNAVAILABLE'; reason: string | null }>): Promise<void> {
    await api.patch(`/access/teams/${teamId}/assignments/${assignmentId}`, input);
  },

  async removeTeamAssignment(teamId: number, assignmentId: number): Promise<void> {
    await api.delete(`/access/teams/${teamId}/assignments/${assignmentId}`);
  },

  async updateTeam(teamId: number, input: { name?: string; description?: string | null; route?: string; icon?: string | null; roleCodes?: string[]; branchRequired?: boolean; minimumPerBranch?: number; sortOrder?: number; isActive?: boolean }): Promise<void> {
    await api.patch(`/access/teams/${teamId}`, input);
  },

  async createRole(input: {
    code: string;
    name: string;
    description?: string;
    permissions: string[];
    reason?: string;
  }): Promise<void> {
    await api.post('/access/roles', input);
  },

  async updateRole(
    roleId: number,
    input: { name?: string; description?: string; permissions?: string[]; reason?: string },
  ): Promise<void> {
    await api.patch(`/access/roles/${roleId}`, input);
  },

  async cloneRole(roleId: number, input: { code: string; name: string; description?: string; reason?: string }): Promise<void> {
    await api.post(`/access/roles/${roleId}/clone`, input);
  },

  async roleImpact(roleId: number): Promise<RoleImpact> {
    const { data } = await api.get<ApiSuccess<RoleImpact>>(`/access/roles/${roleId}/impact`);
    return data.data;
  },

  async restoreRole(roleId: number, reason: string): Promise<void> {
    await api.post(`/access/roles/${roleId}/restore`, { reason });
  },

  async deleteRole(roleId: number, reason: string): Promise<void> {
    await api.delete(`/access/roles/${roleId}`, { data: { reason } });
  },

  async staff(params: { search?: string; status?: string; roleId?: number; branchId?: number; includeArchived?: boolean } = {}): Promise<StaffRow[]> {
    const { data } = await api.get<ApiSuccess<StaffRow[]>>('/access/staff', { params });
    return data.data;
  },

  async customers(params: { search?: string; status?: string } = {}): Promise<CustomerRow[]> {
    const { data } = await api.get<ApiSuccess<CustomerRow[]>>('/access/customers', { params });
    return data.data;
  },

  async setCustomerStatus(userId: number, status: 'ACTIVE' | 'BLOCKED', expectedVersion?: number, reason?: string): Promise<void> {
    await api.patch(`/access/customers/${userId}/status`, { status, expectedVersion, reason });
  },

  async createStaff(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roleIds: number[];
    branchId?: number | null;
    branchIds?: number[];
  }): Promise<void> {
    await api.post('/access/staff', input);
  },

  async updateStaffRoles(
    userId: number,
    input: { roleIds: number[]; branchId?: number | null; branchIds?: number[]; expectedVersion?: number },
  ): Promise<void> {
    await api.patch(`/access/staff/${userId}/roles`, input);
  },

  async setStatus(userId: number, status: 'ACTIVE' | 'BLOCKED', expectedVersion?: number, reason?: string): Promise<void> {
    await api.patch(`/access/staff/${userId}/status`, { status, expectedVersion, reason });
  },

  async setSuperAdmin(userId: number, value: boolean, expectedVersion?: number, reason?: string): Promise<void> {
    await api.patch(`/access/staff/${userId}/superadmin`, { value, expectedVersion, reason });
  },

  async archiveStaff(userId: number, expectedVersion?: number, reason = 'Baja operativa'): Promise<void> {
    await api.post(`/access/staff/${userId}/archive`, { expectedVersion, reason });
  },

  async restoreStaff(userId: number, expectedVersion?: number): Promise<void> {
    await api.post(`/access/staff/${userId}/restore`, { expectedVersion });
  },

  async sessions(userId: number): Promise<Array<{ id: number; createdAt: string; lastSeenAt: string; expiresAt: string; revokedAt: string | null; ip: string | null; userAgent: string | null; deviceLabel: string | null; active: boolean }>> {
    const { data } = await api.get<ApiSuccess<Array<{ id: number; createdAt: string; lastSeenAt: string; expiresAt: string; revokedAt: string | null; ip: string | null; userAgent: string | null; deviceLabel: string | null; active: boolean }>>>(`/access/staff/${userId}/sessions`);
    return data.data;
  },

  async revokeSessions(userId: number, sessionId?: number): Promise<void> {
    await api.post(`/access/staff/${userId}/sessions/revoke`, { sessionId });
  },

  async prepareMfa(userId: number): Promise<{ secret: string; otpauthUrl: string; version: number }> {
    const { data } = await api.post<ApiSuccess<{ secret: string; otpauthUrl: string; version: number }>>(`/access/staff/${userId}/mfa/setup`);
    return data.data;
  },

  async confirmMfa(userId: number, code: string): Promise<{ recoveryCodes: string[]; version: number }> {
    const { data } = await api.post<ApiSuccess<{ recoveryCodes: string[]; version: number }>>(`/access/staff/${userId}/mfa/confirm`, { code });
    return data.data;
  },

  async disableMfa(userId: number, expectedVersion?: number, reason?: string): Promise<void> {
    await api.post(`/access/staff/${userId}/mfa/disable`, { expectedVersion, reason });
  },
};
