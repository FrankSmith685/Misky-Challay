import { Op } from 'sequelize';
import { Permission, RolePermission, User, UserRole } from '@database/models';
import { USER_STATUS, type PermissionCode } from '@config/constants';

/**
 * Resuelve la audiencia operativa contra la base en el momento del envío.
 * No se confía en un JWT antiguo ni en una suscripción histórica: si al usuario
 * le retiraron Cocina o la sede, deja de recibir datos de esa operación.
 */
export const staffAudienceService = {
  async userIds(branchId: number, permissionCode: PermissionCode): Promise<number[]> {
    const permission = await Permission.findOne({
      where: { code: permissionCode },
      attributes: ['id'],
    });
    if (!permission) return [];

    const grants = await RolePermission.findAll({
      where: { permissionId: permission.id },
      attributes: ['roleId'],
    });
    const roleIds = [...new Set(grants.map((grant) => grant.roleId))];
    const assignments = roleIds.length > 0
      ? await UserRole.findAll({
          where: {
            roleId: { [Op.in]: roleIds },
            [Op.or]: [{ branchId }, { branchId: null }],
          },
          attributes: ['userId'],
        })
      : [];

    const assignedIds = [...new Set(assignments.map((assignment) => assignment.userId))];
    const users = await User.findAll({
      where: {
        status: USER_STATUS.ACTIVE,
        [Op.or]: [
          { isSuperAdmin: true },
          ...(assignedIds.length > 0 ? [{ id: { [Op.in]: assignedIds } }] : []),
        ],
      },
      attributes: ['id'],
    });

    return users.map((user) => user.id);
  },
};

