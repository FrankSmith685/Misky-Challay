import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/**
 * Separa el rol administrador del superadmin. Las filas antiguas recibian todos
 * los permisos y el seeder solo agregaba permisos nuevos, por lo que hacia falta
 * una limpieza explicita para no dejar acceso global por compatibilidad.
 */
const CUSTOMER_PERMISSIONS = [
  ['customer.read', 'Ver clientes y su actividad', 'access'],
  ['customer.manage', 'Bloquear o reactivar clientes', 'access'],
] as const;

const ADMIN_GOVERNANCE_PERMISSIONS = [
  'catalog.product.publish',
  'geo.write',
  'plan.manage',
  'cake.finance.manage',
  'role.read',
  'role.manage',
  'audit.export',
  'audit.verify',
  'audit.retention',
  'settings.manage',
  'settings.design.read',
  'settings.design.manage',
  'settings.design.publish',
  'complaint.manage',
  'complaint.export',
] as const;

export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const [code, description, module] of CUSTOMER_PERMISSIONS) {
    await q.sequelize.query(
      `INSERT INTO permissions (code, description, module, created_at, updated_at)
       SELECT :code, :description, :module, UTC_TIMESTAMP(), UTC_TIMESTAMP()
       WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = :code)`,
      { replacements: { code, description, module } },
    );
  }

  await q.sequelize.query(
    `INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
     SELECT r.id, p.id, UTC_TIMESTAMP(), UTC_TIMESTAMP()
     FROM roles r CROSS JOIN permissions p
     WHERE r.code = 'admin' AND p.code IN ('customer.read', 'customer.manage')
       AND NOT EXISTS (
         SELECT 1 FROM role_permissions rp
         WHERE rp.role_id = r.id AND rp.permission_id = p.id
       )`,
  );

  await q.sequelize.query(
    `DELETE rp FROM role_permissions rp
     INNER JOIN roles r ON r.id = rp.role_id
     INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE r.code = 'admin'
       AND p.code IN (${ADMIN_GOVERNANCE_PERMISSIONS.map((code) => `'${code}'`).join(', ')})`,
  );
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await q.sequelize.query(
    `DELETE rp FROM role_permissions rp
     INNER JOIN permissions p ON p.id = rp.permission_id
     INNER JOIN roles r ON r.id = rp.role_id
     WHERE r.code = 'admin' AND p.code IN ('customer.read', 'customer.manage')`,
  );
};

