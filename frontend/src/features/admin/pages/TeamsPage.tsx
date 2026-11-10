import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock3,
  CreditCard,
  Download,
  PackageSearch,
  Palette,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  XCircle,
} from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Badge } from '@components/ui/Badge';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { LoadError } from '@components/common/LoadError';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import { usePermissions } from '@hooks/usePermissions';
import toast from '@components/mui/MuiToast';
import { accessApi, type StaffRow, type TeamsOverview } from '../services/access.service';

const ICONS = {
  direccion: ShieldCheck,
  ventas: ShoppingCart,
  produccion: ChefHat,
  abastecimiento: Truck,
  diseno: Palette,
  soporte: Users,
} as const;

const HEALTH_META = {
  READY: { label: 'Listo', variant: 'success' as const, icon: CheckCircle2 },
  REVIEW: { label: 'Requiere revisión', variant: 'warning' as const, icon: AlertTriangle },
  EMPTY: { label: 'Sin cobertura', variant: 'danger' as const, icon: XCircle },
};

const metricRows = (metrics: TeamsOverview['metrics']) => [
  { label: 'Pedidos abiertos', value: metrics.pendingOrders, icon: ClipboardList, route: ROUTES.adminOrders },
  { label: 'Tickets en cocina', value: metrics.openKitchenTickets, icon: ChefHat, route: ROUTES.adminKitchen },
  { label: 'Repartos sin asignar', value: metrics.unassignedDeliveries, icon: Truck, route: ROUTES.adminDelivery },
  { label: 'Pagos pendientes', value: metrics.pendingPayments, icon: CreditCard, route: ROUTES.adminDirectPayments },
  { label: 'Compras pendientes', value: metrics.pendingPurchases, icon: PackageSearch, route: ROUTES.adminProcurement },
  { label: 'Reclamos abiertos', value: metrics.openComplaints, icon: AlertTriangle, route: ROUTES.adminComplaints },
];

const TeamsPage = () => {
  const { isSuperAdmin } = usePermissions();
  const [overview, setOverview] = useState<TeamsOverview | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [teamDraft, setTeamDraft] = useState({ name: '', description: '', route: '', roleCodes: '', branchRequired: false, minimumPerBranch: 0 });
  const [assignmentDraft, setAssignmentDraft] = useState({ userId: '', branchId: '', responsibility: 'PRIMARY' as 'PRIMARY' | 'BACKUP', availability: 'AVAILABLE' as 'AVAILABLE' | 'AWAY' | 'UNAVAILABLE', effectiveFrom: '', effectiveUntil: '', reason: '' });
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, staffRows] = await Promise.all([accessApi.teamsOverview(), accessApi.staff()]);
      setOverview(summary);
      setStaff(staffRows.filter((person) => person.status === 'ACTIVE' && !person.archivedAt));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  const startAssignment = (teamId: number) => {
    setSelectedTeamId(teamId);
    setAssignmentDraft({ userId: '', branchId: '', responsibility: 'PRIMARY', availability: 'AVAILABLE', effectiveFrom: '', effectiveUntil: '', reason: '' });
  };

  const startTeamEdit = (team: TeamsOverview['teams'][number]) => {
    if (!team.id) return;
    setEditingTeamId(team.id);
    setTeamDraft({ name: team.name, description: team.description, route: team.route, roleCodes: team.roleCodes.join(', '), branchRequired: team.branchRequired, minimumPerBranch: team.minimumPerBranch });
  };

  const saveTeam = async (team: TeamsOverview['teams'][number]) => {
    if (!team.id || !teamDraft.name.trim() || !teamDraft.route.trim()) {
      toast.error('Completa el nombre y la estación del equipo');
      return;
    }
    try {
      await accessApi.updateTeam(team.id, { name: teamDraft.name.trim(), description: teamDraft.description.trim() || null, route: teamDraft.route.trim(), roleCodes: teamDraft.roleCodes.split(',').map((code) => code.trim()).filter(Boolean), branchRequired: teamDraft.branchRequired, minimumPerBranch: teamDraft.branchRequired ? Math.max(1, teamDraft.minimumPerBranch) : 0 });
      toast.success('Equipo actualizado');
      setEditingTeamId(null);
      await load();
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError));
    }
  };

  const saveAssignment = async (team: TeamsOverview['teams'][number]) => {
    if (!team.id || !assignmentDraft.userId) {
      toast.error('Selecciona un responsable');
      return;
    }
    if (team.branchRequired && !assignmentDraft.branchId) {
      toast.error('Selecciona la sucursal que cubrirá');
      return;
    }
    setSavingAssignment(true);
    try {
      await accessApi.createTeamAssignment(team.id, {
        userId: Number(assignmentDraft.userId),
        branchId: assignmentDraft.branchId ? Number(assignmentDraft.branchId) : null,
        responsibility: assignmentDraft.responsibility,
        availability: assignmentDraft.availability,
        effectiveFrom: assignmentDraft.effectiveFrom || undefined,
        effectiveUntil: assignmentDraft.effectiveUntil || null,
        reason: assignmentDraft.reason.trim() || null,
      });
      toast.success('Responsable asignado');
      setSelectedTeamId(null);
      await load();
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError));
    } finally {
      setSavingAssignment(false);
    }
  };

  const removeAssignment = async (teamId: number, assignmentId: number) => {
    if (!window.confirm('¿Retirar esta responsabilidad vigente?')) return;
    try {
      await accessApi.removeTeamAssignment(teamId, assignmentId);
      toast.success('Responsabilidad retirada');
      await load();
    } catch (removeError) {
      toast.error(getApiErrorMessage(removeError));
    }
  };

  const exportCoverage = () => {
    if (!overview) return;
    const header = ['Sucursal', ...overview.teams.map((team) => team.name)];
    const rows = overview.branches.map((branch) => [branch.name, ...overview.teams.map((team) => {
      const cell = branch.teams.find((row) => row.teamKey === team.key);
      return cell?.covered ? `${cell.people}` : `${cell?.people ?? 0}/${cell?.minimum ?? 0} REVISAR`;
    })]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cobertura-equipos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    void load();
  }, [load]);

  const branchIssues = useMemo(
    () => overview?.branches.flatMap((branch) => branch.teams.filter((team) => !team.covered).map((team) => ({ branch, team }))) ?? [],
    [overview],
  );

  if (loading) return <PageLoader />;
  if (error || !overview) return <LoadError message={error ?? 'No se pudo cargar el resumen de equipos'} onRetry={load} />;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Administración"
        title="Equipos y operación"
        description="Controla la cobertura por sucursal, las responsabilidades y las alertas de acceso desde una sola vista. El superadmin global se muestra aparte y no cuenta como personal operativo."
        action={<><Button variant="outline" onClick={exportCoverage} leftIcon={<Download size={16} />}>Exportar cobertura</Button><Button variant="outline" onClick={() => void load()} leftIcon={<RefreshCw size={16} />}>Actualizar resumen</Button></>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-brand-200 bg-brand-50/50"><p className="text-sm text-ink-muted">Personal operativo activo</p><p className="mt-1 text-3xl font-bold text-ink">{overview.governance.activeStaff}</p><p className="mt-1 text-xs text-ink-muted">Superadmins globales: {overview.governance.superadmins}</p></Card>
        <Card className={overview.governance.reviewAlerts ? 'border-amber-200 bg-amber-50/50' : 'border-brand-200 bg-brand-50/50'}><p className="text-sm text-ink-muted">Revisiones pendientes</p><p className="mt-1 text-3xl font-bold text-ink">{overview.governance.reviewAlerts}</p><p className="mt-1 text-xs text-ink-muted">Bloqueados: {overview.governance.blockedUsers} · Contraseña pendiente: {overview.governance.forcedPasswordUsers}</p></Card>
        <Card className={overview.governance.superadminsWithoutMfa ? 'border-amber-200 bg-amber-50/50' : 'border-brand-200 bg-brand-50/50'}><p className="text-sm text-ink-muted">Superadmins sin MFA</p><p className="mt-1 text-3xl font-bold text-ink">{overview.governance.superadminsWithoutMfa}</p><p className="mt-1 text-xs text-ink-muted">El acceso global requiere una revisión reforzada.</p></Card>
        <Card className={branchIssues.length ? 'border-amber-200 bg-amber-50/50' : 'border-brand-200 bg-brand-50/50'}><p className="text-sm text-ink-muted">Coberturas faltantes</p><p className="mt-1 text-3xl font-bold text-ink">{branchIssues.length}</p><p className="mt-1 text-xs text-ink-muted">Sucursal y equipo que necesitan responsable.</p></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Carga operativa actual</CardTitle>
          <CardDescription>Indicadores del sistema para priorizar el trabajo de cada estación.</CardDescription>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {metricRows(overview.metrics).map((metric) => {
            const Icon = metric.icon;
            return <a key={metric.label} href={metric.route} className="rounded-field border border-line bg-surface-muted p-3 transition hover:border-brand-400 hover:shadow-e1"><Icon size={17} className="text-brand-700" /><p className="mt-3 text-2xl font-bold text-ink">{metric.value}</p><p className="text-xs text-ink-muted">{metric.label}</p><span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700">Abrir estación <ArrowRight size={12} /></span></a>;
          })}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {overview.teams.map((team) => {
          const Icon = ICONS[team.key as keyof typeof ICONS] ?? Users;
          const health = HEALTH_META[team.health];
          const HealthIcon = health.icon;
          return (
            <Card key={team.key} className="flex h-full flex-col">
              <div className="mb-4 flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-field bg-brand-50 text-brand-700"><Icon size={22} /></span>
                <Badge variant={health.variant}><HealthIcon size={13} />{health.label}</Badge>
              </div>
              <CardTitle>{team.name}</CardTitle>
              <CardDescription className="mt-2">{team.description}</CardDescription>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {team.roles.map((role) => <Badge key={role.id} variant="outline">{role.name}</Badge>)}
                {!team.roles.length && <span className="text-xs text-ink-muted">Rol pendiente de crear</span>}
              </div>
              <p className="mt-2 text-xs text-ink-muted">Permisos efectivos del equipo: {new Set(team.roles.flatMap((role) => role.permissions)).size}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-field bg-surface-muted p-2"><strong className="block text-lg text-ink">{team.activeMembers}</strong><span className="text-ink-muted">Activos</span></div>
                <div className="rounded-field bg-surface-muted p-2"><strong className="block text-lg text-ink">{team.noBranchScope}</strong><span className="text-ink-muted">Sin sucursal</span></div>
                <div className="rounded-field bg-surface-muted p-2"><strong className="block text-lg text-ink">{team.globalScope}</strong><span className="text-ink-muted">Globales</span></div>
              </div>
              {team.issues.length > 0 && <ul className="mt-4 grid gap-1 text-xs text-amber-800">{team.issues.map((issue) => <li key={issue} className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{issue}</li>)}</ul>}
              <div className="mt-4 rounded-field border border-line bg-surface-muted p-3 text-xs">
                <p className="font-semibold text-ink">Responsables vigentes</p>
                {team.responsibilities.length ? <ul className="mt-2 grid gap-1.5 text-ink-muted">{team.responsibilities.map((assignment) => <li key={assignment.id} className="flex items-center justify-between gap-2"><span>{assignment.responsibility === 'PRIMARY' ? 'Principal' : 'Reemplazo'}: {assignment.userName}{assignment.branchId ? ` · sucursal #${assignment.branchId}` : ' · global'}</span><span className="inline-flex items-center gap-1"><Badge variant={assignment.availability === 'AVAILABLE' ? 'success' : 'warning'}>{assignment.availability === 'AVAILABLE' ? 'Disponible' : assignment.availability === 'AWAY' ? 'Ausente' : 'No disponible'}</Badge>{team.id && <button type="button" className="text-red-700 underline" onClick={() => void removeAssignment(team.id as number, assignment.id)}>Retirar</button>}</span></li>)}</ul> : <p className="mt-2 text-amber-800">Asigna un principal y un reemplazo desde la gestión de equipos.</p>}
              </div>
              {team.id && isSuperAdmin && <div className="mt-3"><Button variant="ghost" size="sm" onClick={() => startAssignment(team.id as number)} leftIcon={<Users size={15} />}>Asignar responsable</Button>{selectedTeamId === team.id && <div className="mt-2 grid gap-2 rounded-field border border-brand-200 bg-brand-50/40 p-3"><label className="grid gap-1 text-xs font-medium text-ink">Persona<select className="h-10 rounded-field border border-line bg-surface px-2 text-sm" value={assignmentDraft.userId} onChange={(event) => setAssignmentDraft((current) => ({ ...current, userId: event.target.value }))}><option value="">Selecciona una persona</option>{staff.map((person) => <option key={person.id} value={person.id}>{[person.firstName, person.lastName].filter(Boolean).join(' ') || person.email}</option>)}</select></label><div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium text-ink">Tipo<select className="h-10 rounded-field border border-line bg-surface px-2 text-sm" value={assignmentDraft.responsibility} onChange={(event) => setAssignmentDraft((current) => ({ ...current, responsibility: event.target.value as 'PRIMARY' | 'BACKUP' }))}><option value="PRIMARY">Principal</option><option value="BACKUP">Reemplazo</option></select></label><label className="grid gap-1 text-xs font-medium text-ink">Sucursal<select className="h-10 rounded-field border border-line bg-surface px-2 text-sm" value={assignmentDraft.branchId} onChange={(event) => setAssignmentDraft((current) => ({ ...current, branchId: event.target.value }))}><option value="">Global</option>{overview.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div><label className="grid gap-1 text-xs font-medium text-ink">Motivo<input className="h-10 rounded-field border border-line bg-surface px-2 text-sm" value={assignmentDraft.reason} onChange={(event) => setAssignmentDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Ej. cobertura de vacaciones" /></label><div className="flex gap-2"><Button size="sm" isLoading={savingAssignment} onClick={() => void saveAssignment(team)}>Guardar</Button><Button size="sm" variant="outline" onClick={() => setSelectedTeamId(null)}>Cancelar</Button></div></div>}</div>}
              {team.id && isSuperAdmin && <div className="mt-1"><Button variant="ghost" size="sm" onClick={() => startTeamEdit(team)} leftIcon={<Palette size={15} />}>Editar equipo</Button>{editingTeamId === team.id && <div className="mt-2 grid gap-2 rounded-field border border-line bg-surface-muted p-3"><label className="grid gap-1 text-xs font-medium text-ink">Nombre<input className="h-10 rounded-field border border-line bg-surface px-2 text-sm" value={teamDraft.name} onChange={(event) => setTeamDraft((current) => ({ ...current, name: event.target.value }))} /></label><label className="grid gap-1 text-xs font-medium text-ink">Descripción<textarea className="min-h-20 rounded-field border border-line bg-surface px-2 py-2 text-sm" value={teamDraft.description} onChange={(event) => setTeamDraft((current) => ({ ...current, description: event.target.value }))} /></label><label className="grid gap-1 text-xs font-medium text-ink">Estación o ruta<input className="h-10 rounded-field border border-line bg-surface px-2 text-sm" value={teamDraft.route} onChange={(event) => setTeamDraft((current) => ({ ...current, route: event.target.value }))} /></label><label className="grid gap-1 text-xs font-medium text-ink">Códigos de rol separados por coma<input className="h-10 rounded-field border border-line bg-surface px-2 text-sm" value={teamDraft.roleCodes} onChange={(event) => setTeamDraft((current) => ({ ...current, roleCodes: event.target.value }))} /></label><label className="flex items-center gap-2 text-xs font-medium text-ink"><input type="checkbox" checked={teamDraft.branchRequired} onChange={(event) => setTeamDraft((current) => ({ ...current, branchRequired: event.target.checked }))} />Requiere cobertura por sucursal</label>{teamDraft.branchRequired && <label className="grid gap-1 text-xs font-medium text-ink">Mínimo por sucursal<input type="number" min={1} max={100} className="h-10 rounded-field border border-line bg-surface px-2 text-sm" value={teamDraft.minimumPerBranch} onChange={(event) => setTeamDraft((current) => ({ ...current, minimumPerBranch: Number(event.target.value) }))} /></label>}<div className="flex gap-2"><Button size="sm" onClick={() => void saveTeam(team)}>Guardar cambios</Button><Button size="sm" variant="outline" onClick={() => setEditingTeamId(null)}>Cancelar</Button></div></div>}</div>}
              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Ver integrantes ({team.activeMembers})</summary>
                <ul className="mt-3 grid gap-2 text-sm">
                  {team.members.length ? team.members.map((member) => <li key={member.id} className="flex items-start justify-between gap-3"><span><strong className="block text-ink">{member.name}</strong><span className="text-xs text-ink-muted">{member.roles.join(', ')}{member.globalScope ? ' · alcance global' : member.branchIds.length ? ` · ${member.branchIds.length} sucursal(es)` : ' · sin sucursal'}</span></span>{member.mustChangePassword && <Badge variant="warning">Revisar</Badge>}</li>) : <li className="text-xs text-ink-muted">No hay integrantes operativos activos.</li>}
                </ul>
              </details>
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <Button component="a" href={team.route} variant="outline" size="sm" leftIcon={<ArrowRight size={15} />}>Abrir estación</Button>
                <Button component="a" href="/admin/usuarios" variant="ghost" size="sm" leftIcon={<Users size={15} />}>Gestionar accesos</Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matriz de cobertura por sucursal</CardTitle>
          <CardDescription>Las áreas operativas requieren al menos una persona asignada a la sucursal. Un superadmin global no cubre esta matriz.</CardDescription>
        </CardHeader>
        {overview.branches.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted"><th className="px-3 py-3">Sucursal</th>{overview.teams.map((team) => <th key={team.key} className="px-3 py-3">{team.name}</th>)}</tr></thead><tbody>{overview.branches.map((branch) => <tr key={branch.id} className="border-b border-line last:border-0"><td className="px-3 py-3 font-semibold text-ink">{branch.name}</td>{branch.teams.map((team) => <td key={team.teamKey} className="px-3 py-3">{team.covered ? <span className="inline-flex items-center gap-1 text-brand-700"><CheckCircle2 size={15} />{team.people}</span> : <span className="inline-flex items-center gap-1 text-red-700"><XCircle size={15} />{team.people}/{team.minimum}</span>}</td>)}</tr>)}</tbody></table></div> : <p className="text-sm text-ink-muted">No hay sucursales activas configuradas.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Gobierno de accesos</CardTitle><CardDescription>Alertas que requieren una decisión del superadmin.</CardDescription></CardHeader>
          <ul className="grid gap-2 text-sm text-ink-muted">
            <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Clock3 size={16} />Usuarios sin acceso en 90 días</span><Badge variant={overview.governance.dormantUsers ? 'warning' : 'success'}>{overview.governance.dormantUsers}</Badge></li>
            <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><ShieldCheck size={16} />Usuarios con alcance global</span><Badge variant={overview.governance.globalScopeUsers ? 'warning' : 'success'}>{overview.governance.globalScopeUsers}</Badge></li>
            <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Users size={16} />Usuarios sin equipo</span><Badge variant={overview.governance.usersWithoutTeam.length ? 'warning' : 'success'}>{overview.governance.usersWithoutTeam.length}</Badge></li>
            <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><ShieldCheck size={16} />Roles sin equipo</span><Badge variant={overview.governance.rolesWithoutTeam.length ? 'warning' : 'success'}>{overview.governance.rolesWithoutTeam.length}</Badge></li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2"><Button component="a" href="/admin/usuarios" variant="outline" size="sm">Revisar usuarios</Button><Button component="a" href="/admin/roles" variant="outline" size="sm">Revisar roles</Button></div>
        </Card>
        <Card className="border-brand-200 bg-brand-50/30">
          <CardHeader><CardTitle>Reglas de operación</CardTitle><CardDescription>El equipo organiza responsabilidades; los roles siguen controlando permisos y alcance.</CardDescription></CardHeader>
          <ul className="grid gap-2 text-sm text-ink-muted"><li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 text-brand-700" />Ventas, cocina, compras y reparto deben tener sucursal asignada.</li><li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 text-brand-700" />Los superadmins aparecen como gobierno global y no como cobertura de una sucursal.</li><li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 text-brand-700" />Las delegaciones temporales deben resolverse desde usuarios y roles, conservando auditoría.</li><li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 text-brand-700" />Cada alerta enlaza con la estación o módulo donde se corrige.</li></ul>
        </Card>
      </div>
    </div>
  );
};

export default TeamsPage;
