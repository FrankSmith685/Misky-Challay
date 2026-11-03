import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChefHat, ClipboardList, Palette, ShieldCheck, ShoppingCart, Truck, Users } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Badge } from '@components/ui/Badge';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { LoadError } from '@components/common/LoadError';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import { accessApi, type RoleRow, type StaffRow } from '../services/access.service';

const TEAM_DEFINITIONS = [
  { key: 'direccion', name: 'Dirección', description: 'Supervisa ventas, costos, rentabilidad y decisiones del negocio.', icon: ShieldCheck, route: ROUTES.adminDashboard, roleCodes: ['admin', 'branch_admin'] },
  { key: 'ventas', name: 'Ventas y caja', description: 'Atiende el punto de venta, pedidos, pagos y cierre de caja.', icon: ShoppingCart, route: ROUTES.adminPos, roleCodes: ['cashier', 'branch_admin'] },
  { key: 'produccion', name: 'Producción y cocina', description: 'Prepara tortas, administra comandas y confirma consumos.', icon: ChefHat, route: ROUTES.adminKitchen, roleCodes: ['kitchen', 'branch_admin'] },
  { key: 'abastecimiento', name: 'Compras y almacén', description: 'Compra insumos, recibe lotes, controla vencimientos y costos.', icon: Truck, route: ROUTES.adminProcurement, roleCodes: ['purchasing', 'branch_admin'] },
  { key: 'diseño', name: 'Diseño y catálogo', description: 'Mantiene productos, opciones, fotos, recetas y personalización.', icon: Palette, route: ROUTES.adminBuilder, roleCodes: ['catalog_manager', 'branch_admin'] },
  { key: 'soporte', name: 'Soporte y control', description: 'Gestiona usuarios, permisos, reclamos y trazabilidad.', icon: Users, route: ROUTES.adminUsers, roleCodes: ['support', 'auditor', 'admin'] },
] as const;

const TeamsPage = () => {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const [staffRows, roleRows] = await Promise.all([accessApi.staff(), accessApi.roles()]); setStaff(staffRows); setRoles(roleRows); }
    catch (loadError) { setError(getApiErrorMessage(loadError)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const roleByCode = useMemo(() => new Map(roles.map((role) => [role.code, role])), [roles]);
  const countForTeam = (roleCodes: readonly string[]) => staff.filter((person) => person.isSuperAdmin || person.roles.some((role) => roleCodes.includes(role.code))).length;

  if (loading) return <PageLoader />;
  if (error) return <LoadError message={error} onRetry={load} />;
  return <div className="grid gap-6"><PageHeader eyebrow="Administración" title="Equipos y accesos" description="Organiza el trabajo del taller por responsabilidades. Cada equipo recibe solo las pantallas y permisos que necesita." action={<Button variant="outline" onClick={() => void load()} leftIcon={<Users size={16} />}>Actualizar equipo</Button>} />
    <Card className="border-brand-200 bg-brand-50/40"><CardHeader><CardTitle>Cómo se organiza la operación</CardTitle><CardDescription>Los roles siguen siendo configurables desde Roles y permisos. Estas estaciones hacen visible qué equipo es responsable de cada parte del ciclo de una torta.</CardDescription></CardHeader><div className="grid gap-3 text-sm text-ink-muted sm:grid-cols-3"><div><strong className="text-ink">1. Venta</strong><p>Se registra el pedido y el pago.</p></div><div><strong className="text-ink">2. Producción</strong><p>Cocina reserva y consume insumos.</p></div><div><strong className="text-ink">3. Abastecimiento</strong><p>Compras repone por lotes y costos.</p></div></div></Card>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{TEAM_DEFINITIONS.map((team) => { const Icon = team.icon; const roleRows = team.roleCodes.map((code) => roleByCode.get(code)).filter(Boolean) as RoleRow[]; return <Card key={team.key} className="flex h-full flex-col"><div className="mb-4 flex items-start justify-between"><span className="grid size-11 place-items-center rounded-field bg-brand-50 text-brand-700"><Icon size={22} /></span><Badge variant={countForTeam(team.roleCodes) ? 'success' : 'neutral'}>{countForTeam(team.roleCodes)} personas</Badge></div><CardTitle>{team.name}</CardTitle><CardDescription className="mt-2">{team.description}</CardDescription><div className="mt-4 flex flex-wrap gap-1.5">{roleRows.map((role) => <Badge key={role.id} variant="outline">{role.name}</Badge>)}{!roleRows.length && <span className="text-xs text-ink-muted">Rol pendiente de crear</span>}</div><div className="mt-auto pt-5"><Button component="a" href={team.route} variant="outline" size="sm" leftIcon={<ArrowRight size={15} />}>Abrir estación</Button></div></Card>; })}</div>
    <Card><CardHeader><CardTitle>Reglas de acceso recomendadas</CardTitle><CardDescription>Usa roles por función y asigna una sucursal cuando el equipo trabaja en una cocina específica.</CardDescription></CardHeader><ul className="grid gap-2 text-sm text-ink-muted md:grid-cols-2"><li className="flex gap-2"><ClipboardList size={16} className="mt-0.5 text-brand-600" />Ventas puede crear pedidos, pero no modificar recetas ni inventario.</li><li className="flex gap-2"><Truck size={16} className="mt-0.5 text-brand-600" />Compras puede recibir mercadería y ver costos, sin administrar usuarios.</li><li className="flex gap-2"><ChefHat size={16} className="mt-0.5 text-brand-600" />Cocina ve comandas e inventario operativo de su sucursal.</li><li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 text-brand-600" />Administración conserva roles, usuarios, auditoría y configuración.</li></ul></Card>
  </div>;
};

export default TeamsPage;
