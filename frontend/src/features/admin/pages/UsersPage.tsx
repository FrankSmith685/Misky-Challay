import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clipboard, Crown, KeyRound, LogIn, Plus, Users } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card } from '@components/ui/Card';
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
import { ADMIN_LANDING_ORDER } from '@constants/adminNav';
import { formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { StatusBadge } from '@components/ui/StatusBadge';
import { geoApi } from '@features/geo/services/geo.service';
import type { Branch } from '@features/geo/types';
import { accessApi, type RoleRow, type StaffRow } from '../services/access.service';

const EMPTY_FORM = { email: '', password: '', firstName: '', lastName: '' };

const BRANCH_SCOPED_ROLE_CODES = new Set(['kitchen', 'purchasing', 'cashier', 'waiter', 'dispatcher', 'driver', 'branch_admin']);

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
  const confirm = useConfirm();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [branchIds, setBranchIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Id de la fila cuya accion esta en vuelo: sin esto, ni el boton avisa de que se
  // pulso ni impide el segundo toque, que llega a un estado ya cambiado.
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createdAccess, setCreatedAccess] = useState<CreatedAccess | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL');
  const [showArchived, setShowArchived] = useState(false);
  const [sessionsUser, setSessionsUser] = useState<StaffRow | null>(null);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof accessApi.sessions>>>([]);
  const [mfaUser, setMfaUser] = useState<StaffRow | null>(null);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const selectedRoles = roles.filter((role) => roleIds.includes(role.id));
  const selectedPermissions = new Set(selectedRoles.flatMap((role) => role.permissions));
  /*
   * El aterrizaje sale de la MISMA tabla que el menu lateral y el recibidor
   * (`constants/adminNav.ts`). Aqui habia una tercera lista escrita a mano a la
   * que le faltaban Reclamaciones, Medios y Bitacora: se prometia una pantalla
   * distinta de la que el usuario iba a ver al ingresar.
   */
  const landing = ADMIN_LANDING_ORDER.find((entry) =>
    entry.anyOf.some((permission) => selectedPermissions.has(permission)),
  );
  const requiresBranch = selectedRoles.some((role) => BRANCH_SCOPED_ROLE_CODES.has(role.code));

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [staffRows, roleRows, branchRows] = await Promise.all([
        accessApi.staff({ includeArchived: true }),
        accessApi.roles(),
        geoApi.getBranches(),
      ]);
      setStaff(staffRows);
      setRoles(roleRows.filter((role) => role.permissions.length > 0)); // roles internos
      setBranches(branchRows);
      setLoadError(null);
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const visibleStaff = staff.filter((user) => {
    const query = search.trim().toLocaleLowerCase('es');
    const haystack = [user.email, user.firstName, user.lastName, ...user.roles.map((role) => role.name)].filter(Boolean).join(' ').toLocaleLowerCase('es');
    return (!query || haystack.includes(query)) && (statusFilter === 'ALL' || user.status === statusFilter) && (showArchived || !user.archivedAt);
  });
  const reviewAlerts = staff.filter((user) => {
    const dormant = user.lastLoginAt ? Date.now() - new Date(user.lastLoginAt).getTime() > 90 * 24 * 60 * 60 * 1000 : false;
    return !user.archivedAt && (user.mustChangePassword || !user.lastLoginAt || dormant || user.status === 'BLOCKED' || (user.isSuperAdmin && !user.mfaEnabled));
  }).length;

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setIsCreating(true);
    setEditing(null);
    setForm(EMPTY_FORM);
    setRoleIds([]);
    setBranchIds([]);
  };

  const openEdit = (user: StaffRow) => {
    setEditing(user);
    setIsCreating(false);
    setRoleIds(user.roles.map((role) => role.id));
    setBranchIds(user.branchIds);
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

  const toggleBranch = (id: number) => {
    setBranchIds((current) => current.includes(id) ? current.filter((branchId) => branchId !== id) : [...current, id]);
  };

  const handleSave = async () => {
    if (roleIds.length === 0) {
      toast.error('Asigna al menos un rol');
      return;
    }
    if (requiresBranch && branchIds.length === 0) {
      toast.error('Este rol operativo necesita una cocina asignada');
      return;
    }

    setIsSaving(true);
    try {
      if (isCreating) {
        await accessApi.createStaff({
          ...form,
          roleIds,
          branchIds,
        });
        const selectedBranches = branches.filter((branch) => branchIds.includes(branch.id));
        setCreatedAccess({
          email: form.email,
          password: form.password,
          roleNames: selectedRoles.map((role) => role.name).join(', '),
          scope: selectedBranches.length ? selectedBranches.map((branch) => branch.name).join(', ') : 'Todas las sucursales (global)',
          landing: landing?.label ?? 'Sin pantalla asignada',
          loginUrl: `${window.location.origin}/ingresar`,
        });
        toast.success('Usuario creado e invitacion generada');
      } else if (editing) {
        await accessApi.updateStaffRoles(editing.id, {
          roleIds,
          branchIds,
          expectedVersion: editing.version,
        });
        toast.success('Roles actualizados. Deberá volver a ingresar para que apliquen.');
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
      'Acceso al panel de Misky Challay',
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

  const fullNameOf = (user: StaffRow): string =>
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || `Usuario #${user.id}`;

  const handleToggleStatus = async (user: StaffRow) => {
    const blocking = user.status === 'ACTIVE';

    if (blocking) {
      // Bloquear corta la sesion EN CURSO: el servidor sube la version del token.
      // Por eso se confirma, y por eso el aviso dice lo que va a pasar de verdad.
      const { confirmed } = await confirm({
        title: `¿Bloquear a ${fullNameOf(user)}?`,
        message:
          'Se cerrará su sesión de inmediato y no podrá volver a ingresar al panel hasta que lo actives otra vez. Su historial y sus acciones se conservan.',
        confirmLabel: 'Bloquear',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    setBusyId(user.id);
    try {
      await accessApi.setStatus(user.id, blocking ? 'BLOCKED' : 'ACTIVE', user.version, blocking ? 'Bloqueo solicitado desde el panel' : 'Reactivación solicitada desde el panel');
      toast.success(blocking ? 'Usuario bloqueado' : 'Usuario activado');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleSuperAdmin = async (user: StaffRow) => {
    const granting = !user.isSuperAdmin;

    /*
     * Superadmin no es un rol: es saltarse la verificacion de permisos entera, en
     * los dos lados. Se pide teclear el email para que no se conceda desde un
     * boton llamado "Hacer SA" en una fila que se parece a las demas.
     */
    const { confirmed } = await confirm({
      title: granting ? '¿Conceder superadmin?' : '¿Retirar el superadmin?',
      message: granting
        ? `${fullNameOf(user)} podrá hacer TODO en el sistema sin ninguna verificación de permisos: mover dinero, cambiar precios, editar roles y crear usuarios. No hay forma de limitarlo después salvo retirándoselo.`
        : `${fullNameOf(user)} pasará a depender solo de los permisos de sus roles, y su sesión actual se cerrará. Si es la última persona con superadmin, el sistema lo impedirá.`,
      confirmLabel: granting ? 'Conceder superadmin' : 'Retirar superadmin',
      tone: 'danger',
      requireTypedText: user.email ?? undefined,
    });
    if (!confirmed) return;

    setBusyId(user.id);
    try {
      await accessApi.setSuperAdmin(user.id, granting, user.version, granting ? 'Concesión aprobada por superadmin' : 'Retiro aprobado por superadmin');
      toast.success(granting ? 'Superadmin concedido' : 'Superadmin retirado');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const openSessions = async (user: StaffRow) => {
    try {
      setSessions(await accessApi.sessions(user.id));
      setSessionsUser(user);
    } catch (error) { toast.error(getApiErrorMessage(error)); }
  };

  const revokeUserSessions = async (sessionId?: number) => {
    if (!sessionsUser) return;
    await accessApi.revokeSessions(sessionsUser.id, sessionId);
    setSessions(await accessApi.sessions(sessionsUser.id));
    toast.success('Sesiones revocadas');
  };

  const openMfa = async (user: StaffRow) => {
    try {
      const setup = await accessApi.prepareMfa(user.id);
      setMfaUser(user); setMfaSetup(setup); setMfaCode(''); setRecoveryCodes([]);
    } catch (error) { toast.error(getApiErrorMessage(error)); }
  };

  const confirmMfa = async () => {
    if (!mfaUser || !mfaCode) return;
    try {
      const result = await accessApi.confirmMfa(mfaUser.id, mfaCode);
      setRecoveryCodes(result.recoveryCodes); toast.success('MFA activado'); await load();
    } catch (error) { toast.error(getApiErrorMessage(error)); }
  };

  const disableMfa = async (user: StaffRow) => {
    const { confirmed } = await confirm({ title: '¿Desactivar MFA?', message: `Se quitará la segunda verificación de ${fullNameOf(user)}.`, confirmLabel: 'Desactivar', tone: 'danger' });
    if (!confirmed) return;
    try { await accessApi.disableMfa(user.id, user.version, 'Desactivación solicitada por superadmin'); toast.success('MFA desactivado'); await load(); } catch (error) { toast.error(getApiErrorMessage(error)); }
  };

  const archiveUser = async (user: StaffRow) => {
    const { confirmed } = await confirm({ title: `¿Archivar a ${fullNameOf(user)}?`, message: 'Se bloqueará la cuenta, se revocarán sus sesiones y se conservará el historial.', confirmLabel: 'Archivar usuario', tone: 'danger' });
    if (!confirmed) return;
    try { await accessApi.archiveStaff(user.id, user.version, 'Baja de acceso interno'); toast.success('Usuario archivado'); await load(); } catch (error) { toast.error(getApiErrorMessage(error)); }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Acceso interno"
        title="Usuarios internos"
        description="Define quién entra al panel, con qué rol y sobre qué sucursal."
        icon={Users}
        action={canManage && !loadError && (
          <Button leftIcon={<Plus className="size-4" />} onClick={openCreate}>
            Nuevo usuario
          </Button>
        )}
      />

      <Card className="mb-5 border-brand-100 bg-gradient-to-r from-brand-50 to-white">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-card bg-brand-600 text-white">
            <KeyRound className="size-5" />
          </div>
          <div>
            <p className="font-semibold text-ink">¿Cómo ingresa el personal?</p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Crea el usuario, asígnale rol y cocina, y comparte el acceso generado. Todos ingresan
              en <strong className="text-ink">/ingresar</strong>; Cocina irá a su tablero y
              Catálogo y Cocina mostrarán sus pantallas según los permisos asignados.
            </p>
          </div>
        </div>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Personal interno</p><p className="mt-1 text-2xl font-black text-ink">{staff.filter((user) => !user.archivedAt).length}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Superadmins con MFA</p><p className="mt-1 text-2xl font-black text-brand-800">{staff.filter((user) => user.isSuperAdmin && user.mfaEnabled).length}</p></Card>
        <Card className={cn('p-4', reviewAlerts ? 'border-amber-200 bg-amber-50/50' : '')}><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Revisiones pendientes</p><p className="mt-1 text-2xl font-black text-ink">{reviewAlerts}</p></Card>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-3">
        <Input label="Buscar usuario o rol" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-[240px] flex-1" />
        <label className="grid gap-1 text-xs font-semibold text-ink-muted">Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-11 rounded-field border border-line bg-white px-3 text-sm text-ink"><option value="ALL">Todos</option><option value="ACTIVE">Activos</option><option value="BLOCKED">Bloqueados</option></select></label>
        <label className="flex h-11 items-center gap-2 text-sm text-ink-muted"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="size-4 accent-brand-600" />Mostrar archivados</label>
      </div>

      {loadError ? (
        <LoadError message={loadError} onRetry={() => void load()} />
      ) : (
        <>
        <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">
              Personal interno con sus roles, su sucursal y el estado de su cuenta
            </caption>
            <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="p-3">Usuario</th>
                <th scope="col" className="p-3">Roles</th>
                <th scope="col" className="p-3">Sucursal</th>
                <th scope="col" className="p-3">Estado</th>
                <th scope="col" className="p-3">Ultimo acceso</th>
                <th scope="col" className="p-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>

            <tbody>
              {visibleStaff.map((user) => {
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
                            className="inline-flex items-center gap-1 rounded-pill bg-accent-400/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-700"
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
                      <StatusBadge
                        status={user.status}
                        map={{ ACTIVE: { label: 'Activo', variant: 'brand' } }}
                        fallback={{ label: 'Bloqueado', variant: 'danger' }}
                      />
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
                          <Button size="sm" variant="ghost" onClick={() => void openSessions(user)}>Sesiones</Button>
                          {user.isSuperAdmin && <Button size="sm" variant="ghost" onClick={() => user.mfaEnabled ? void disableMfa(user) : void openMfa(user)}>{user.mfaEnabled ? 'MFA activo' : 'Configurar MFA'}</Button>}

                          {isSuperAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              isLoading={busyId === user.id}
                              onClick={() => void handleToggleSuperAdmin(user)}
                            >
                              {user.isSuperAdmin ? 'Quitar SA' : 'Hacer SA'}
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={busyId === user.id}
                            onClick={() => void handleToggleStatus(user)}
                          >
                            {user.status === 'ACTIVE' ? 'Bloquear' : 'Activar'}
                          </Button>
                          {!user.archivedAt ? <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void archiveUser(user)}>Archivar</Button> : <Button size="sm" variant="ghost" onClick={() => void accessApi.restoreStaff(user.id, user.version).then(() => load())}>Restaurar</Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {visibleStaff.length === 0 && (
            <Card className="border-0 py-10 text-center">
              <p className="text-sm text-ink-muted">Todavia no hay usuarios internos.</p>
            </Card>
          )}
        </div>

        <div className="grid gap-3 md:hidden" aria-label="Personal interno">
          {visibleStaff.map((user) => {
            const branchNames = user.branchIds
              .map((id) => branches.find((branch) => branch.id === id)?.name ?? `#${id}`)
              .join(', ');
            return (
              <Card key={user.id} className="p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-bold text-ink">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                      {user.isSuperAdmin && <span className="inline-flex items-center gap-1 rounded-pill bg-accent-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700"><Crown className="size-3" /> Superadmin</span>}
                    </p>
                    <p className="mt-0.5 break-all text-xs text-ink-muted">{user.email}</p>
                  </div>
                  <StatusBadge status={user.status} map={{ ACTIVE: { label: 'Activo', variant: 'brand' } }} fallback={{ label: 'Bloqueado', variant: 'danger' }} />
                </div>

                <dl className="mt-4 grid gap-3 rounded-card bg-surface-muted p-3 text-xs">
                  <div><dt className="font-bold uppercase tracking-wide text-ink-muted">Roles</dt><dd className="mt-1 text-ink">{user.roles.map((role) => role.name).join(', ') || 'Sin rol asignado'}</dd></div>
                  <div><dt className="font-bold uppercase tracking-wide text-ink-muted">Alcance</dt><dd className="mt-1 text-ink">{branchNames || <span className="font-semibold text-brand-700">Todas las sucursales</span>}</dd></div>
                  <div><dt className="font-bold uppercase tracking-wide text-ink-muted">Último acceso</dt><dd className="mt-1 text-ink">{user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Nunca'}</dd></div>
                </dl>

                {canManage && <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(user)}>Roles y alcance</Button>
                  <Button size="sm" variant="ghost" onClick={() => void openSessions(user)}>Sesiones</Button>
                  <Button size="sm" variant="ghost" isLoading={busyId === user.id} onClick={() => void handleToggleStatus(user)}>{user.status === 'ACTIVE' ? 'Bloquear' : 'Activar'}</Button>
                  {isSuperAdmin && <Button className="col-span-2" size="sm" variant="ghost" isLoading={busyId === user.id} onClick={() => void handleToggleSuperAdmin(user)}>{user.isSuperAdmin ? 'Quitar superadmin' : 'Convertir en superadmin'}</Button>}
                  {user.isSuperAdmin && <Button className="col-span-2" size="sm" variant="ghost" onClick={() => user.mfaEnabled ? void disableMfa(user) : void openMfa(user)}>{user.mfaEnabled ? 'MFA activo' : 'Configurar MFA'}</Button>}
                  {!user.archivedAt ? <Button className="col-span-2 text-red-700" size="sm" variant="ghost" onClick={() => void archiveUser(user)}>Archivar usuario</Button> : <Button className="col-span-2" size="sm" variant="ghost" onClick={() => void accessApi.restoreStaff(user.id, user.version).then(() => load())}>Restaurar usuario</Button>}
                </div>}
              </Card>
            );
          })}
          {visibleStaff.length === 0 && <Card className="border-dashed py-10 text-center"><p className="text-sm text-ink-muted">Todavía no hay usuarios internos.</p></Card>}
        </div>
        </>
      )}

      <Modal
        isOpen={isCreating || editing !== null}
        onClose={closeModal}
        title={isCreating ? 'Nuevo usuario interno' : `Roles de ${editing?.firstName ?? ''}`}
        description="Sin sucursal asignada, el usuario tiene alcance global."
        icon={isCreating ? Users : KeyRound}
        eyebrow={isCreating ? 'Alta de personal' : 'Accesos y alcance'}
        disableBackdropClose
        actions={<><Button variant="outline" disabled={isSaving} onClick={closeModal}>Cancelar</Button><Button isLoading={isSaving} onClick={() => void handleSave()}>{isCreating ? 'Crear usuario' : 'Guardar cambios'}</Button></>}
      >
        <div className="grid gap-4">
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
            <div className="grid gap-1 rounded-card border border-line p-3">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-start gap-2 rounded-field px-2 py-1.5 text-sm hover:bg-surface-muted"
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

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Sucursales asignadas</p>
            <div className="grid gap-1 rounded-card border border-line p-3 sm:grid-cols-2">
              {branches.map((branch) => (
                <label key={branch.id} className="flex cursor-pointer items-center gap-2 rounded-field px-2 py-1.5 text-sm hover:bg-surface-muted">
                  <input type="checkbox" checked={branchIds.includes(branch.id)} onChange={() => toggleBranch(branch.id)} className="size-4 accent-brand-600" />
                  <span>{branch.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div
            className={cn(
              'rounded-card border p-3 text-sm',
              landing && !(requiresBranch && branchIds.length === 0)
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
              {requiresBranch && branchIds.length === 0
                ? 'Selecciona una cocina: este es un rol operativo y no debe quedar con alcance global.'
                : branchIds.length === 0
                  ? 'Alcance global sobre todas las sucursales.'
                  : `Trabajará solamente en ${branches.filter((branch) => branchIds.includes(branch.id)).map((branch) => branch.name).join(', ')}.`}
            </p>
          </div>

          {editing && (
            <p className="text-xs text-ink-muted">
              Al guardar, {fullNameOf(editing)} tendrá que volver a ingresar: los permisos y la
              sucursal viajan dentro de su sesión.
            </p>
          )}

        </div>
      </Modal>

      <Modal
        isOpen={createdAccess !== null}
        onClose={() => setCreatedAccess(null)}
        title="Acceso del usuario creado"
        description="Comparte estos datos una sola vez. Si SMTP está configurado, el sistema también envía la invitación por correo."
        icon={CheckCircle2}
        eyebrow="Usuario creado correctamente"
        tone="neutral"
      >
        {createdAccess && (
          <div className="grid gap-4">
            <div className="flex items-start gap-3 rounded-card border border-brand-200 bg-brand-50 p-3 text-brand-800">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">Usuario listo para ingresar</p>
                <p className="mt-0.5 text-xs">Será dirigido a {createdAccess.landing} según sus permisos.</p>
              </div>
            </div>

            <dl className="divide-y divide-line overflow-hidden rounded-card border border-line text-sm">
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

      <Modal isOpen={sessionsUser !== null} onClose={() => setSessionsUser(null)} title={`Sesiones de ${sessionsUser ? fullNameOf(sessionsUser) : ''}`} description="Revoca accesos perdidos o sesiones que ya no reconozcas." icon={KeyRound}>
        <div className="grid gap-3">
          {sessions.map((session) => (
            <div key={session.id} className="rounded-card border border-line p-3 text-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink">{session.deviceLabel || 'Dispositivo sin identificar'}</p><p className="text-xs text-ink-muted">Último acceso: {formatDate(session.lastSeenAt)} · IP {session.ip ?? '—'}</p></div><StatusBadge status={session.active ? 'ACTIVE' : 'REVOKED'} map={{ ACTIVE: { label: 'Activa', variant: 'success' }, REVOKED: { label: 'Revocada', variant: 'neutral' } }} /></div>
              {session.active && <Button className="mt-2" size="sm" variant="outline" onClick={() => void revokeUserSessions(session.id)}>Revocar esta sesión</Button>}
            </div>
          ))}
          {sessions.length === 0 && <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">No hay sesiones registradas.</p>}
          {sessions.some((session) => session.active) && <Button variant="ghost" className="text-red-700" onClick={() => void revokeUserSessions()}>Revocar todas</Button>}
        </div>
      </Modal>

      <Modal isOpen={mfaUser !== null} onClose={() => { setMfaUser(null); setMfaSetup(null); setRecoveryCodes([]); }} title="Configurar MFA" description="Escanea el código en tu aplicación autenticadora y confirma el código de seis dígitos." icon={KeyRound}>
        {mfaSetup && <div className="grid gap-4"><div className="rounded-card border border-line bg-surface-muted p-3 text-xs"><p className="font-bold text-ink">Secreto manual</p><code className="mt-1 block break-all text-ink-muted">{mfaSetup.secret}</code><p className="mt-2 text-ink-muted">URI: {mfaSetup.otpauthUrl}</p></div><Input label="Código MFA" inputMode="numeric" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} /><Button onClick={() => void confirmMfa()} disabled={mfaCode.length !== 6}>Confirmar MFA</Button>{recoveryCodes.length > 0 && <div className="rounded-card border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-bold text-amber-900">Códigos de recuperación</p><p className="mt-1 text-xs text-amber-800">Guárdalos ahora. Se muestran una sola vez.</p><code className="mt-2 block break-all text-amber-900">{recoveryCodes.join(' · ')}</code></div>}</div>}
      </Modal>
    </div>
  );
};
export default UsersPage;
