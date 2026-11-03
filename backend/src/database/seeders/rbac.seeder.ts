import bcrypt from 'bcryptjs';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { PERMISSIONS, PERMISSION_CATALOG, ROLES, USER_STATUS } from '@config/constants';
import { Permission, Role, User, UserRole, RolePermission } from '../models';

const P = PERMISSIONS;

/**
 * ROLES DEL SISTEMA
 * ---------------------------------------------------------------------------
 * Son un punto de partida: desde el panel se pueden crear roles nuevos y ajustar
 * los permisos de estos. Lo que NO se puede es borrarlos (los marca isSystem).
 *
 * Los roles internos se limitan a las tareas operativas de la pastelería.
 */
const ROLE_DEFINITIONS: Array<{
  code: string;
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    code: ROLES.CUSTOMER,
    name: 'Cliente',
    description: 'Compra, ve sus pedidos y su saldo. No entra al panel.',
    permissions: [],
  },
  {
    code: ROLES.KITCHEN,
    name: 'Operador de cocina',
    description: 'Ve la cola de tickets y los avanza.',
    permissions: [P.KITCHEN_READ, P.KITCHEN_OPERATE, P.INVENTORY_READ],
  },
  {
    code: ROLES.PURCHASING,
    name: 'Compras y almacén',
    description: 'Gestiona proveedores, órdenes de compra, lotes y costos de inventario.',
    permissions: [P.INVENTORY_READ, P.PROCUREMENT_READ, P.PROCUREMENT_MANAGE],
  },
  {
    code: ROLES.WAITER,
    name: 'Mozo',
    description: 'Abre comandas, atiende mesas y consulta su avance en cocina.',
    permissions: [P.DINING_READ, P.DINING_OPERATE],
  },
  {
    code: ROLES.CASHIER,
    name: 'Cajero',
    description: 'Cobra y cierra mesas, consulta ventas y pagos de su local.',
    permissions: [P.DINING_READ, P.DINING_OPERATE, P.ORDER_READ, P.PAYMENT_READ, P.PAYMENT_VERIFY, P.INVOICE_MANAGE, P.REPORT_SALES_READ],
  },
  {
    code: ROLES.DISPATCHER,
    name: 'Despachador',
    description: 'Organiza los repartos y asigna repartidores.',
    permissions: [
      P.DELIVERY_READ,
      P.DELIVERY_ASSIGN,
      P.DELIVERY_OPERATE,
    ],
  },
  {
    code: ROLES.DRIVER,
    name: 'Repartidor',
    description: 'Ve sus entregas y registra los eventos del reparto.',
    permissions: [P.DELIVERY_READ, P.DELIVERY_OPERATE],
  },
  {
    code: ROLES.SUPPORT,
    name: 'Soporte',
    description:
      'Atiende incidencias: consulta pedidos, cancela, reembolsa y responde el Libro de Reclamaciones.',
    permissions: [
      P.ORDER_READ,
      P.ORDER_CANCEL,
      P.ORDER_UPDATE_STATUS,
      P.PAYMENT_READ,
      P.PAYMENT_REFUND,
      P.PLAN_READ,
      // Quien atiende al consumidor tiene que poder responderle: el reclamo corre
      // con plazo legal y hasta ahora solo el administrador general podia contestarlo.
      P.COMPLAINT_MANAGE,
    ],
  },
  {
    code: ROLES.CATALOG_MANAGER,
    name: 'Gestor de catalogo',
    description: 'Mantiene productos, precios, fotos y disponibilidad.',
    permissions: [
      P.CATALOG_PRODUCT_READ,
      P.CATALOG_PRODUCT_WRITE,
      P.CATALOG_PRODUCT_PUBLISH,
      P.CATALOG_CATEGORY_WRITE,
      P.CATALOG_AVAILABILITY_WRITE,
      P.CATALOG_CUSTOMIZATION_WRITE,
    ],
  },
  {
    code: ROLES.BRANCH_ADMIN,
    name: 'Administrador de sucursal',
    description: 'Manda en SU local: pedidos, cocina, reparto e inventario.',
    permissions: [
      P.ORDER_READ,
      P.ORDER_UPDATE_STATUS,
      P.ORDER_CANCEL,
      P.KITCHEN_READ,
      P.KITCHEN_OPERATE,
      P.DINING_READ,
      P.DINING_OPERATE,
      P.DELIVERY_READ,
      P.DELIVERY_ASSIGN,
      P.DELIVERY_OPERATE,
      P.INVENTORY_READ,
      P.INVENTORY_MANAGE,
      P.PROCUREMENT_READ,
      P.PROCUREMENT_MANAGE,
      P.CATALOG_PRODUCT_READ,
      P.CATALOG_AVAILABILITY_WRITE,
      P.PAYMENT_READ,
      P.PAYMENT_VERIFY,
      P.INVOICE_MANAGE,
      P.REPORT_SALES_READ,
      P.REPORT_OPERATIONS_READ,
      P.CAKE_FINANCE_READ,
      P.CAKE_FINANCE_MANAGE,
    ],
  },
  {
    code: ROLES.ADMIN,
    name: 'Administrador general',
    description: 'Operacion completa, catalogo, promociones, reportes y usuarios.',
    permissions: Object.values(P),
  },
  {
    code: ROLES.AUDITOR,
    name: 'Auditor',
    description: 'Solo lectura de todo, incluida la bitacora.',
    permissions: [
      P.AUDIT_READ,
      P.ORDER_READ,
      P.PAYMENT_READ,
      P.PLAN_READ,
      P.INVENTORY_READ,
      P.PROCUREMENT_READ,
      P.KITCHEN_READ,
      P.DELIVERY_READ,
      P.CATALOG_PRODUCT_READ,
      P.GEO_READ,
      P.REPORT_SALES_READ,
      P.REPORT_OPERATIONS_READ,
      P.CAKE_FINANCE_READ,
      P.ROLE_READ,
      P.USER_READ,
    ],
  },
];

/**
 * Permisos historicos que hacian que cada puesto viera modulos ajenos a su
 * estacion. Se retiran de forma dirigida; los demas ajustes manuales de roles se
 * siguen respetando.
 */
const DEPRECATED_OPERATION_PERMISSIONS: Partial<Record<string, string[]>> = {
  [ROLES.KITCHEN]: [P.ORDER_READ],
  [ROLES.WAITER]: [P.ORDER_READ, P.KITCHEN_READ],
  [ROLES.DISPATCHER]: [P.ORDER_READ, P.KITCHEN_READ],
};

export const seedRbac = async (): Promise<void> => {
  // 1) Permisos: los define el codigo, se sincronizan en cada arranque.
  const allPermissions = PERMISSION_CATALOG.flatMap((group) =>
    group.permissions.map((permission) => ({
      code: permission.code,
      module: group.module,
      description: permission.label,
    })),
  );

  for (const permission of allPermissions) {
    const [row, created] = await Permission.findOrCreate({
      where: { code: permission.code },
      defaults: permission,
    });

    if (!created && row.description !== permission.description) {
      await row.update({ description: permission.description, module: permission.module });
    }
  }

  const permissions = await Permission.findAll();
  const permissionByCode = new Map(permissions.map((p) => [p.code, p.id]));

  // 2) Roles del sistema + sus permisos.
  for (const definition of ROLE_DEFINITIONS) {
    const [role] = await Role.findOrCreate({
      where: { code: definition.code },
      defaults: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
    });

    for (const permissionCode of DEPRECATED_OPERATION_PERMISSIONS[definition.code] ?? []) {
      const permissionId = permissionByCode.get(permissionCode);
      if (permissionId) await RolePermission.destroy({ where: { roleId: role.id, permissionId } });
    }

    // El seeder solo AGREGA permisos nuevos: si un admin quito uno a mano desde
    // el panel, no se lo devolvemos por la fuerza en cada reinicio.
    for (const permissionCode of definition.permissions) {
      const permissionId = permissionByCode.get(permissionCode);
      if (!permissionId) continue;

      await RolePermission.findOrCreate({
        where: { roleId: role.id, permissionId },
        defaults: { roleId: role.id, permissionId },
      });
    }
  }

  // 3) Superadmin inicial. Es una MARCA, no un rol: se salta la verificacion de
  //    permisos y no se puede borrar el ultimo (ver access.service.ts).
  const adminRole = await Role.findOne({ where: { code: ROLES.ADMIN } });
  const existingAdmin = await User.findOne({ where: { email: env.ADMIN_EMAIL } });

  if (!existingAdmin && adminRole) {
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_SALT_ROUNDS);
    const admin = await User.create({
      email: env.ADMIN_EMAIL,
      phone: null,
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      status: USER_STATUS.ACTIVE,
      isSuperAdmin: true,
      emailVerifiedAt: new Date(),
      lastLoginAt: null,
    });
    await UserRole.create({ userId: admin.id, roleId: adminRole.id });
    logger.success(`Superadmin creado: ${env.ADMIN_EMAIL}`);
  } else if (existingAdmin && !existingAdmin.isSuperAdmin) {
    // Nunca dejar el sistema sin dueno.
    await existingAdmin.update({ isSuperAdmin: true });
    logger.info(`${env.ADMIN_EMAIL} marcado como superadmin`);
  }

  logger.success(
    `Accesos listos: ${allPermissions.length} permisos, ${ROLE_DEFINITIONS.length} roles`,
  );
};
