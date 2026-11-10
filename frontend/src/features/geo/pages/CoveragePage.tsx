import { useCallback, useEffect, useState } from 'react';
import { Bike, Clock3, LockKeyhole, MapPin, RefreshCw, ShieldCheck, Store } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { ROUTES } from '@constants/routes';
import { BranchCard } from '../components/BranchCard';
import { CoverageChecker } from '../components/CoverageChecker';
import { CoverageHero } from '../components/CoverageHero';
import { geoApi } from '../services/geo.service';
import type { Branch } from '../types';

const serviceSignals = [
  {
    icon: Bike,
    title: 'Entrega coordinada',
    description: 'Asignamos el local adecuado según tu ubicación.',
  },
  {
    icon: ShieldCheck,
    title: 'Costo transparente',
    description: 'Conoce la tarifa y el pedido mínimo antes de comprar.',
  },
  {
    icon: Clock3,
    title: 'Tiempo estimado',
    description: 'Te mostramos cuánto tardaría tu pedido.',
  },
];

/** Página pública de cobertura: valida la zona y presenta los locales disponibles. */
const CoveragePage = () => {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [branchesError, setBranchesError] = useState(false);

  const loadBranches = useCallback(async () => {
    setIsLoadingBranches(true);
    setBranchesError(false);
    try {
      setBranches(await geoApi.getBranches());
    } catch {
      setBranches([]);
      setBranchesError(true);
    } finally {
      setIsLoadingBranches(false);
    }
  }, []);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  return (
    <div className="bg-surface-muted">
      <CoverageHero branchCount={branches.length} />

      <div className="mx-auto max-w-8xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <section id="verificar-cobertura" className="scroll-mt-24">
          <div className="mx-auto mb-8 max-w-3xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand-700">
              Verifica antes de elegir
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-.03em] text-ink sm:text-4xl">
              ¿Llegamos a tu dirección?
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink-muted sm:text-base">
              Completa los datos una sola vez. Guardaremos la ubicación confirmada para mostrarte
              disponibilidad y tiempos más precisos durante tu compra.
            </p>
          </div>

          <div className="mb-6 grid gap-3 rounded-card border border-brand-100 bg-brand-50/70 p-4 text-xs leading-5 text-ink-muted sm:grid-cols-3 sm:gap-5 sm:p-5">
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
              <p><strong className="block text-ink">Dirección exacta</strong>Usa el pin en la entrada donde recibirás el pedido.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock3 className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
              <p><strong className="block text-ink">Datos antes de pagar</strong>Verás tarifa, mínimo y tiempo estimado.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
              <p><strong className="block text-ink">Tu ubicación, bajo control</strong>Solo la guardamos cuando confirmas y tienes una cuenta. <Link to={ROUTES.privacy} className="font-semibold text-brand-700 underline underline-offset-2">Ver privacidad</Link></p>
            </div>
          </div>

          <div className="rounded-card border border-line bg-white/90 p-4 shadow-e2 backdrop-blur-sm sm:p-6 lg:p-8">
            <CoverageChecker onContinue={() => navigate(ROUTES.menu)} />
          </div>
        </section>

        <section id="locales" className="mt-14 scroll-mt-24 sm:mt-20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand-700">
                Nuestra red
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-.02em] text-ink sm:text-3xl">
                {branches.length === 1 ? 'Nuestro local' : 'Locales listos para atenderte'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                La asignación final depende de tu dirección, los horarios y la disponibilidad del
                local. Si prefieres recojo, elige una sede disponible al comprar.
              </p>
            </div>
            {!isLoadingBranches && branches.length > 0 && (
              <span className="inline-flex w-fit items-center gap-2 rounded-pill border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-800">
                <Store className="size-3.5" />
                {branches.length} {branches.length === 1 ? 'local publicado' : 'locales publicados'}
              </span>
            )}
          </div>

          {isLoadingBranches ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <Card key={item} className="h-52 animate-pulse border-line/70">
                  <div className="size-11 rounded-card bg-neutral-100" />
                  <div className="mt-4 h-4 w-2/5 rounded bg-neutral-100" />
                  <div className="mt-3 h-3 w-4/5 rounded bg-neutral-100" />
                  <div className="mt-6 h-16 rounded-card bg-neutral-100" />
                </Card>
              ))}
            </div>
          ) : branchesError ? (
            <div className="mt-6">
            <Card className="flex flex-col items-center gap-3 border-dashed py-9 text-center">
              <span className="grid size-11 place-items-center rounded-card bg-amber-50 text-amber-800">
                <RefreshCw className="size-5" />
              </span>
              <h3 className="font-extrabold text-ink">No pudimos cargar los locales</h3>
              <p className="text-sm text-ink-muted">Puedes reintentarlo sin perder tu dirección.</p>
              <Button
                variant="outline"
                leftIcon={<RefreshCw className="size-4" />}
                onClick={() => void loadBranches()}
              >
                Intentar nuevamente
              </Button>
            </Card>
            </div>
          ) : branches.length === 0 ? (
            <div className="mt-6">
            <Card className="grid justify-items-center gap-3 border-dashed py-9 text-center">
              <Store className="mx-auto size-6 text-brand-700" />
              <p className="font-extrabold text-ink">Aún no hay locales publicados</p>
              <p className="text-sm text-ink-muted">Estamos preparando nuevas zonas de atención.</p>
            </Card>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {branches.map((branch) => (
                <BranchCard key={branch.id} branch={branch} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 grid gap-3 rounded-card border border-brand-100 bg-brand-900 p-4 text-white sm:grid-cols-3 sm:p-5">
          {serviceSignals.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-3 rounded-card bg-white/10 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-card bg-white/10 text-brand-200">
                <Icon className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-brand-50/70">{description}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default CoveragePage;
