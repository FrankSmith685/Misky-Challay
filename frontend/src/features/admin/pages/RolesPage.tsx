import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, Lock, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card, CardDescription } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { cn } from '@lib/cn';
import { accessApi, type PermissionGroup, type RoleRow } from '../services/access.service';
import { OperationsMetricStrip } from '../components/OperationsMetricStrip';

/**
 * Roles y permisos.
 *
 * El ROL es un paquete de permisos con nombre. Aqui se arman esos paquetes sin
 * programar: un rol nuevo es una fila en la base de datos, no un despliegue.
 */
const RolesPage = () => {
  const { can, isSuperAdmin, permissions: ownPermissions } = usePermissions();
  const canManage = can(PERM.ROLE_MANAGE);
  const confirm = useConfirm();

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  // Id del rol que se esta borrando: sin esto el segundo clic llega a un rol que
  // ya no existe y el usuario recibe un 404 que no explica nada.
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [roleRows, permissionGroups] = await Promise.all([
        accessApi.roles(),
        accessApi.permissions(),
      ]);
      setRoles(roleRows);
      setGroups(permissionGroups);
      setLoadError(null);
    } catch (error) {
      // Antes el fallo era un toast y una rejilla vacia: se leia como "no hay
      // ningun rol", que en esta pantalla es una afirmacion imposible.
      setLoadError(getApiErrorMessage(error));
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
    // Solo al CREAR se exige marcar algo: un rol nuevo sin permisos no sirve para
    // nada. Al editar, quedarse en cero es una decision legitima (deja al rol sin
    // acceso al panel) y exigir uno obligaba a otorgar algo para poder salir.
    if (isCreating && selected.size === 0) {
      toast.error('Marca al menos un permiso');
      return;
    }

    if (editing && editing.userCount > 0) {
      const { confirmed } = await confirm({
        title: `¿Guardar los permisos de ${editing.name}?`,
        message: `El cambio se aplica ahora mismo a ${editing.userCount} usuario${editing.userCount === 1 ? '' : 's'} con este rol. Tendrán que volver a ingresar para que surta efecto.`,
        confirmLabel: 'Guardar permisos',
      });
      if (!confirmed) return;
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
    const { confirmed } = await confirm({
      title: `¿Eliminar el rol ${role.name}?`,
      message:
        'El rol y sus permisos se borran definitivamente. Solo se puede si ya no lo tiene ningún usuario.',
      confirmLabel: 'Eliminar rol',
      tone: 'danger',
    });
    if (!confirmed) return;

    setDeletingId(role.id);
    try {
      await accessApi.deleteRole(role.id);
      toast.success('Rol eliminado');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setDeletingId(null);
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
        action={canManage && !loadError && (
          <Button leftIcon={<Plus className="size-4" />} onClick={openCreate}>
            Crear rol
          </Button>
        )}
      />

      <OperationsMetricStrip
        className="mb-5"
        ariaLabel="Resumen de seguridad"
        metrics={[
          { label: 'Roles configurados', value: roles.length, icon: ShieldCheck },
          { label: 'Usuarios asignados', value: roles.reduce((total, role) => total + role.userCount, 0), icon: Users, tone: 'brand' },
          { label: 'Permisos disponibles', value: groups.reduce((total, group) => total + group.permissions.length, 0), icon: KeyRound, tone: 'neutral' },
          { label: 'Roles protegidos', value: roles.filter((role) => role.isProtected).length, icon: Lock, tone: 'accent' },
        ]}
      />

      {loadError ? (
        <LoadError message={loadError} onRetry={() => void load()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <Card key={role.id} className={cn('flex flex-col overflow-hidden', role.isProtected ? 'border-accent-200 bg-gradient-to-br from-white to-accent-50/35' : 'border-brand-100')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-card', role.isProtected ? 'bg-accent-100 text-accent-700' : 'bg-brand-50 text-brand-700')}><ShieldCheck className="size-5" /></span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-bold text-ink">{role.name}{role.isSystem && <Lock className="size-3.5 text-ink-muted" />}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-muted">{role.code}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-pill bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                  {role.userCount} usuario{role.userCount === 1 ? '' : 's'}
                </span>
              </div>

              {role.description && (
                <CardDescription className="mt-2 flex-1">{role.description}</CardDescription>
              )}

              <div className="mt-4 rounded-card border border-line bg-surface-muted/55 p-3">
                <p className="text-xs font-bold text-ink">{role.permissions.length === 0 ? 'Sin acceso al panel' : `${role.permissions.length} permisos en ${new Set(role.permissions.map((permission) => permission.split('.')[0])).size} áreas`}</p>
                {role.permissions.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{[...new Set(role.permissions.map((permission) => permission.split('.')[0]))].slice(0, 5).map((module) => <span key={module} className="rounded-pill border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink-muted">{module}</span>)}{new Set(role.permissions.map((permission) => permission.split('.')[0])).size > 5 && <span className="px-1 text-[10px] text-ink-muted">+ más</span>}</div>}
              </div>

              {canManage && (
                <div className="mt-4 flex gap-2">
                  {role.isProtected ? (
                    /*
                     * ROL PROTEGIDO: NO SE LE TOCAN LOS PERMISOS DESDE AQUI.
                     *
                     * "Cliente" lo tiene TODA persona registrada en la tienda:
                     * marcarle una casilla convertia a la base entera de clientes
                     * en personal del panel, y el servidor ahora lo rechaza.
                     * "Administrador general" es el otro extremo: el sembrado le
                     * devuelve sus permisos en cada arranque, asi que quitarselos
                     * aqui solo produce un rol que miente hasta el reinicio. Para
                     * recortar a alguien se crea un rol nuevo y se le asigna.
                     */
                    <p className="flex items-start gap-1.5 text-xs text-ink-muted">
                      <Lock className="mt-0.5 size-3.5 shrink-0" />
                      Rol protegido: sus permisos no se editan desde el panel.
                    </p>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(role)}>
                        Editar permisos
                      </Button>

                      {!role.isSystem && (
                        <Button
                          size="sm"
                          variant="ghost"
                          isLoading={deletingId === role.id}
                          onClick={() => void handleDelete(role)}
                          aria-label={`Eliminar el rol ${role.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={isCreating || editing !== null}
        onClose={closeModal}
        title={isCreating ? 'Crear rol' : `Permisos de ${editing?.name ?? ''}`}
        description={
          isSuperAdmin
            ? 'Eres superadmin: puedes otorgar cualquier permiso.'
            : 'Solo puedes otorgar permisos que tu ya tienes.'
        }
        icon={ShieldCheck}
        eyebrow="Control de acceso"
        maxWidth="lg"
        disableBackdropClose
        actions={<><Button variant="outline" disabled={isSaving} onClick={closeModal}>Cancelar</Button><Button isLoading={isSaving} onClick={() => void handleSave()}>{isCreating ? 'Crear rol' : 'Guardar permisos'}</Button></>}
      >
        <div className="grid gap-4">
          {editing && editing.userCount > 0 && (
            // El alcance real del cambio, antes de hacerlo: un rol no es una ficha
            // suelta, es lo que N personas van a poder (o no poder) hacer manana.
            <div className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                Ahora mismo {editing.userCount} usuario{editing.userCount === 1 ? '' : 's'} tiene
                {editing.userCount === 1 ? '' : 'n'} este rol. Lo que marques o desmarques les
                cambia lo que pueden hacer.
              </p>
            </div>
          )}

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
                placeholder="pastelero_editor"
                hint="Minusculas y guion bajo"
              />
              <Input
                label="Nombre"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Editor de pastelería"
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

          <div className="grid max-h-72 gap-4 overflow-y-auto rounded-card border border-line p-3">
            {groups.map((group) => (
              <fieldset key={group.module}>
                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {group.label}
                </legend>

                <div className="grid gap-1">
                  {group.permissions.map((permission) => {
                    // No puedes dar lo que no tienes (el backend lo rechaza igual).
                    const canGrant = isSuperAdmin || ownPermissions.includes(permission.code);

                    return (
                      <label
                        key={permission.code}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-field px-2 py-1 text-sm hover:bg-surface-muted',
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

          {!isCreating && selected.size === 0 && (
            <p className="text-xs text-ink-muted">
              Sin ningún permiso marcado, quien tenga este rol dejará de entrar al panel.
            </p>
          )}

        </div>
      </Modal>
    </div>
  );
};

export default RolesPage;
