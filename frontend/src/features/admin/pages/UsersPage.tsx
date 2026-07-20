import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clipboard, Crown, KeyRound, LogIn, Plus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { geoApi } from '@features/geo/services/geo.service';
import type { Branch } from '@features/geo/types';
import { accessApi, type RoleRow, type StaffRow } from '../services/access.service';

const EMPTY_FORM = { email: '', password: '', firstName: '', lastName: '' };

const ACCESS_LANDINGS: Array<{ label: string; path: string; anyOf: string[] }> = [
  { label: 'Resumen', path: '/admin/resumen', anyOf: [PERM.REPORT_SALES_READ, PERM.REPORT_OPERATIONS_READ] },
  { label: 'Reparto', path: '/admin/reparto', anyOf: [PERM.DELIVERY_READ] },
  { label: 'Cocina', path: '/admin/cocina', anyOf: [PERM.KITCHEN_READ] },
  { label: 'Pedidos', path: '/admin/pedidos', anyOf: [PERM.ORDER_READ] },
  { label: 'Inventario', path: '/admin/inventario', anyOf: [PERM.INVENTORY_READ] },
  { label: 'Catalogo y nutricion', path: '/admin/catalogo', anyOf: [PERM.CATALOG_PRODUCT_READ, PERM.NUTRITION_READ] },
  { label: 'Constructor', path: '/admin/constructor', anyOf: [PERM.CATALOG_CUSTOMIZATION_WRITE] },
  { label: 'Cupones', path: '/admin/cupones', anyOf: [PERM.PROMOTION_MANAGE] },
  { label: 'Planes', path: '/admin/planes', anyOf: [PERM.PLAN_MANAGE] },
  { label: 'Cobertura', path: '/admin/cobertura', anyOf: [PERM.GEO_READ, PERM.GEO_WRITE] },
  { label: 'Usuarios', path: '/admin/usuarios', anyOf: [PERM.USER_READ] },
  { label: 'Roles y permisos', path: '/admin/roles', anyOf: [PERM.ROLE_READ] },
  { label: 'Sistema de diseño', path: '/admin/sistema-diseno', anyOf: [PERM.SETTINGS_MANAGE] },
];

const BRANCH_SCOPED_ROLE_CODES = new Set(['kitchen', 'dispatcher', 'driver', 'branch_admin']);

interface CreatedAccess {
  email: string;
  password: string;
  roleNames: string;
  scope: string;
  landing: string;
  loginUrl: string;
}

/** Usuarios internos: quien entra al panel y con que llaves. */
const UsersPage = () => {
  const { can, isSuperAdmin } = usePermissions();
  const canManage = can(PERM.USER_MANAGE);

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [branchId, setBranchId] = useState<number | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [createdAccess, setCreatedAccess] = useState<CreatedAccess | null>(null);

  const selectedRoles = roles.filter((role) => roleIds.includes(role.id));
  const selectedPermissions = new Set(selectedRoles.flatMap((role) => role.permissions));
  const landing = ACCESS_LANDINGS.find((entry) =>
    entry.anyOf.some((permission) => selectedPermissions.has(permission)),
  );
  const requiresBranch = selectedRoles.some((role) => BRANCH_SCOPED_ROLE_CODES.has(role.code));

  const load = useCallback(async () => {
    try {
      const [staffRows, roleRows] = await Promise.all([accessApi.staff(), accessApi.roles()]);
      setStaff(staffRows);
      setRoles(roleRows.filter((role) => role.permissions.length > 0)); // roles internos
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    geoApi
      .getBranches()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [load]);

  const openCreate = () => {
    setIsCreating(true);
    setEditing(null);
    setForm(EMPTY_FORM);
    setRoleIds([]);
    setBranchId('');
  };

  const openEdit = (user: StaffRow) => {
    setEditing(user);
    setIsCreating(false);
    setRoleIds(user.roles.map((role) => role.id));
    setBranchId(user.branchIds[0] ?? '');
  };

  const closeModal = () => {
    setIsCreating(false);
    setEditing(null);
  };

  const toggleRole = (id: number) => {
    setRoleIds((current) =>
      current.includes(id) ? current.filter((roleId) => roleId !== id) : [...current, id],
    );
  };

  const handleSave = async () => {
    if (roleIds.length === 0) {
      toast.error('Asigna al menos un rol');
      return;
    }
    if (requiresBranch && branchId === '') {
      toast.error('Este rol operativo necesita una cocina asignada');
      return;
    }

    setIsSaving(true);
    try {
      if (isCreating) {
        await accessApi.createStaff({
          ...form,
          roleIds,
          branchId: branchId === '' ? null : Number(branchId),
        });
        const selectedBranch = branches.find((branch) => branch.id === Number(branchId));
        setCreatedAccess({
          email: form.email,
          password: form.password,
          roleNames: selectedRoles.map((role) => role.name).join(', '),
          scope: selectedBranch?.name ?? 'Todas las sucursales (global)',
          landing: landing?.label ?? 'Sin pantalla asignada',
          loginUrl: `${window.location.origin}/ingresar`,
        });
        toast.success('Usuario creado e invitacion generada');
      } else if (editing) {
        await accessApi.updateStaffRoles(editing.id, {
          roleIds,
          branchId: branchId === '' ? null : Number(branchId),
        });
        toast.success('Roles actualizados');
      }

      closeModal();
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const copyCreatedAccess = async () => {
    if (!createdAccess) return;
    const text = [
      'Acceso al panel de Verde Bowl',
      `Ingresar: ${createdAccess.loginUrl}`,
      `Usuario: ${createdAccess.email}`,
      `Contraseña temporal: ${createdAccess.password}`,
      `Rol: ${createdAccess.roleNames}`,
      `Alcance: ${createdAccess.scope}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      toast.success('Acceso copiado');
    } catch {
      toast.error('No se pudo copiar; selecciona los datos manualmente');
    }
  };

  const handleToggleStatus = async (user: StaffRow) => {
    try {
      await accessApi.setStatus(user.id, user.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE');
      toast.success('Estado actualizado');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleToggleSuperAdmin = async (user: StaffRow) => {
    try {
      await accessApi.setSuperAdmin(user.id, !user.isSuperAdmin);
      toast.success('Superadmin actualizado');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Acceso interno"
        title="Usuarios internos"
        description="Define quién entra al panel, con qué rol y sobre qué sucursal."
        icon={Users}
        action={canManage && (
          <Button leftIcon={<Plus className="size-4" />} onClick={openCreate}>
            Nuevo usuario
          </Button>
        )}
      />

      <Card className="mb-5 border-brand-100 bg-gradient-to-r from-brand-50 to-white">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
            <KeyRound className="size-5" />
          </div>
          <div>
            <p className="font-semibold text-ink">¿Cómo ingresa el personal?</p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Crea el usuario, asígnale rol y cocina, y comparte el acceso generado. Todos ingresan
              en <strong className="text-ink">/ingresar</strong>; Cocina irá a su tablero y
              Nutrición irá directamente al catálogo nutricional según sus permisos.
            </p>
          </div>
        </div>
      </Card>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="p-3">Usuario</th>
              <th className="p-3">Roles</th>
              <th className="p-3">Sucursal</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Ultimo acceso</th>
              <th className="p-3"></th>
            </tr>
          </thead>

          <tbody>
            {staff.map((user) => {
              const branchNames = user.branchIds
                .map((id) => branches.find((branch) => branch.id === id)?.name ?? `#${id}`)
                .join(', ');

              return (
                <tr key={user.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <p className="flex items-center gap-1.5 font-medium text-ink">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                      {user.isSuperAdmin && (
                        <span
                          title="Superadmin"
                          className="inline-flex items-center gap-1 rounded-full bg-accent-400/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-500"
                        >
                          <Crown className="size-3" /> Superadmin
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-muted">{user.email}</p>
                  </td>

                  <td className="p-3 text-xs text-ink-muted">
                    {user.roles.map((role) => role.name).join(', ')}
                  </td>

                  <td className="p-3 text-xs text-ink-muted">
                    {branchNames || <span className="text-brand-700">Todas (global)</span>}
                  </td>

                  <td className="p-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        user.status === 'ACTIVE'
                          ? 'bg-brand-50 text-brand-700'
                          : 'bg-red-50 text-red-700',
                      )}
                    >
                      {user.status === 'ACTIVE' ? 'Activo' : 'Bloqueado'}
                    </span>
                  </td>

                  <td className="p-3 text-xs text-ink-muted">
                    {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Nunca'}
                  </td>

                  <td className="p-3">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(user)}>
                          Roles
                        </Button>

                        {isSuperAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleSuperAdmin(user)}
                          >
                            {user.isSuperAdmin ? 'Quitar SA' : 'Hacer SA'}
                          </Button>
                        )}

                        <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(user)}>
                          {user.status === 'ACTIVE' ? 'Bloquear' : 'Activar'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {staff.length === 0 && (
          <Card className="border-0 py-10 text-center">
            <p className="text-sm text-ink-muted">Todavia no hay usuarios internos.</p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={isCreating || editing !== null}
        onClose={closeModal}
        title={isCreating ? 'Nuevo usuario interno' : `Roles de ${editing?.firstName ?? ''}`}
        description="Sin sucursal asignada, el usuario tiene alcance global."
      >
        <div className="space-y-4">
          {isCreating && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Nombre"
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, firstName: event.target.value }))
                  }
                />
                <Input
                  label="Apellido"
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, lastName: event.target.value }))
                  }
                />
              </div>

              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
              />

              <Input
                label="Contrasena temporal"
                type="text"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                hint="Minimo 8 caracteres. El usuario deberia cambiarla luego."
              />
            </>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Roles</p>
            <div className="space-y-1 rounded-xl border border-line p-3">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"
                >
                  <input
                    type="checkbox"
                    checked={roleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    className="mt-0.5 size-4 accent-brand-600"
                  />
                  <span>
                    <span className="font-medium text-ink">{role.name}</span>
                    <span className="block text-xs text-ink-muted">{role.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

            <Select
              id="branch"
              label="Sucursal"
              value={branchId}
              onChange={(event) =>
                setBranchId(event.target.value === '' ? '' : Number(event.target.value))
              }
            >
              <SelectOption value="">Todas (alcance global)</SelectOption>
              {branches.map((branch) => (
                <SelectOption key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectOption>
              ))}
            </Select>

          <div
            className={cn(
              'rounded-xl border p-3 text-sm',
              landing && !(requiresBranch && branchId === '')
                ? 'border-brand-200 bg-brand-50 text-brand-800'
                : 'border-amber-200 bg-amber-50 text-amber-800',
            )}
          >
            {landing ? (
              <p className="flex items-center gap-2 font-medium">
                <LogIn className="size-4" /> Al ingresar abrirá: {landing.label}
              </p>
            ) : (
              <p className="font-medium">Los roles seleccionados todavía no permiten abrir una pantalla.</p>
            )}
            <p className="mt-1 text-xs opacity-80">
              {requiresBranch && branchId === ''
                ? 'Selecciona una cocina: este es un rol operativo y no debe quedar con alcance global.'
                : branchId === ''
                  ? 'Alcance global sobre todas las sucursales.'
                  : `Trabajará solamente en ${branches.find((branch) => branch.id === Number(branchId))?.name ?? 'la cocina seleccionada'}.`}
            </p>
          </div>

          <Button className="w-full" isLoading={isSaving} onClick={handleSave}>
            {isCreating ? 'Crear usuario' : 'Guardar'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={createdAccess !== null}
        onClose={() => setCreatedAccess(null)}
        title="Acceso del usuario creado"
        description="Comparte estos datos una sola vez. Si SMTP está configurado, el sistema también envía la invitación por correo."
      >
        {createdAccess && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-brand-800">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">Usuario listo para ingresar</p>
                <p className="mt-0.5 text-xs">Será dirigido a {createdAccess.landing} según sus permisos.</p>
              </div>
            </div>

            <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line text-sm">
              <div className="grid grid-cols-[110px_1fr] gap-3 p-3"><dt className="text-ink-muted">Ingreso</dt><dd className="break-all font-medium text-ink">{createdAccess.loginUrl}</dd></div>
              <div className="grid grid-cols-[110px_1fr] gap-3 p-3"><dt className="text-ink-muted">Usuario</dt><dd className="break-all font-medium text-ink">{createdAccess.email}</dd></div>
              <div className="grid grid-cols-[110px_1fr] gap-3 p-3"><dt className="text-ink-muted">Contraseña</dt><dd className="break-all font-mono font-semibold text-ink">{createdAccess.password}</dd></div>
              <div className="grid grid-cols-[110px_1fr] gap-3 p-3"><dt className="text-ink-muted">Rol</dt><dd className="text-ink">{createdAccess.roleNames}</dd></div>
              <div className="grid grid-cols-[110px_1fr] gap-3 p-3"><dt className="text-ink-muted">Alcance</dt><dd className="text-ink">{createdAccess.scope}</dd></div>
            </dl>

            <p className="text-xs text-ink-muted">El usuario debe cambiar la contraseña temporal desde Mi perfil después de ingresar.</p>
            <Button className="w-full" leftIcon={<Clipboard className="size-4" />} onClick={copyCreatedAccess}>
              Copiar datos de acceso
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UsersPage;
