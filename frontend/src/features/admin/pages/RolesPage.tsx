import { useCallback, useEffect, useState } from 'react';
import { Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardDescription } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { cn } from '@lib/cn';
import { accessApi, type PermissionGroup, type RoleRow } from '../services/access.service';

/**
 * Roles y permisos.
 *
 * El ROL es un paquete de permisos con nombre. Aqui se arman esos paquetes sin
 * programar: un rol nuevo es una fila en la base de datos, no un despliegue.
 */
const RolesPage = () => {
  const { can, isSuperAdmin, permissions: ownPermissions } = usePermissions();
  const canManage = can(PERM.ROLE_MANAGE);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [roleRows, permissionGroups] = await Promise.all([
        accessApi.roles(),
        accessApi.permissions(),
      ]);
      setRoles(roleRows);
      setGroups(permissionGroups);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setIsCreating(true);
    setEditing(null);
    setForm({ code: '', name: '', description: '' });
    setSelected(new Set());
  };

  const openEdit = (role: RoleRow) => {
    setEditing(role);
    setIsCreating(false);
    setForm({ code: role.code, name: role.name, description: role.description ?? '' });
    setSelected(new Set(role.permissions));
  };

  const closeModal = () => {
    setEditing(null);
    setIsCreating(false);
  };

  const toggle = (code: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.size === 0) {
      toast.error('Marca al menos un permiso');
      return;
    }

    setIsSaving(true);
    try {
      if (isCreating) {
        await accessApi.createRole({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          permissions: [...selected],
        });
        toast.success('Rol creado');
      } else if (editing) {
        await accessApi.updateRole(editing.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          permissions: [...selected],
        });
        toast.success('Rol actualizado');
      }

      closeModal();
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (role: RoleRow) => {
    try {
      await accessApi.deleteRole(role.id);
      toast.success('Rol eliminado');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Seguridad"
        title="Roles y permisos"
        description="Crea paquetes de permisos reutilizables sin necesidad de programar."
        icon={ShieldCheck}
        action={canManage && (
          <Button leftIcon={<Plus className="size-4" />} onClick={openCreate}>
            Crear rol
          </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  {role.name}
                  {role.isSystem && <Lock className="size-3.5 text-ink-muted" />}
                </p>
                <p className="text-xs text-ink-muted">{role.code}</p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                {role.userCount} usuario{role.userCount === 1 ? '' : 's'}
              </span>
            </div>

            {role.description && (
              <CardDescription className="mt-2 flex-1">{role.description}</CardDescription>
            )}

            <p className="mt-3 text-xs text-ink-muted">
              {role.permissions.length === 0
                ? 'Sin permisos internos (no entra al panel)'
                : `${role.permissions.length} permisos`}
            </p>

            {canManage && (
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(role)}>
                  Editar permisos
                </Button>

                {!role.isProtected && !role.isSystem && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(role)}
                    aria-label="Eliminar rol"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal
        isOpen={isCreating || editing !== null}
        onClose={closeModal}
        title={isCreating ? 'Crear rol' : `Permisos de ${editing?.name ?? ''}`}
        description={
          isSuperAdmin
            ? 'Eres superadmin: puedes otorgar cualquier permiso.'
            : 'Solo puedes otorgar permisos que tu ya tienes.'
        }
      >
        <div className="space-y-4">
          {isCreating && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Codigo"
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                  }))
                }
                placeholder="nutricionista_junior"
                hint="Minusculas y guion bajo"
              />
              <Input
                label="Nombre"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nutricionista junior"
              />
            </div>
          )}

          {!isCreating && (
            <Input
              label="Nombre"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          )}

          <Input
            label="Descripcion"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="Que puede hacer este rol"
          />

          <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border border-line p-3">
            {groups.map((group) => (
              <fieldset key={group.module}>
                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {group.label}
                </legend>

                <div className="space-y-1">
                  {group.permissions.map((permission) => {
                    // No puedes dar lo que no tienes (el backend lo rechaza igual).
                    const canGrant = isSuperAdmin || ownPermissions.includes(permission.code);

                    return (
                      <label
                        key={permission.code}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-muted',
                          !canGrant && 'cursor-not-allowed opacity-40',
                        )}
                      >
                        <input
                          type="checkbox"
                          disabled={!canGrant}
                          checked={selected.has(permission.code)}
                          onChange={() => toggle(permission.code)}
                          className="size-4 accent-brand-600"
                        />
                        <span className="text-ink">{permission.label}</span>
                        <code className="ml-auto text-[10px] text-ink-muted">{permission.code}</code>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <Button className="w-full" isLoading={isSaving} onClick={handleSave}>
            {isCreating ? 'Crear rol' : 'Guardar permisos'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default RolesPage;
