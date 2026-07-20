import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { SectionHeading } from '@components/common/SectionHeading';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { CoverageChecker } from '../components/CoverageChecker';
import { geoApi } from '../services/geo.service';
import type { Branch } from '../types';

/** Pagina publica de cobertura: valida la zona y lista los locales (M03). */
const CoveragePage = () => {
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    geoApi
      .getBranches()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <SectionHeading
        eyebrow="Cobertura"
        title="Llegamos a tu zona?"
        description="Elige tu distrito y te decimos que cocina te atiende, cuanto cuesta el delivery y en cuanto tiempo llega."
      />

      <div className="space-y-10">
        <div className="rounded-[1.6rem] border border-line bg-surface-muted/30 p-3 shadow-[0_16px_45px_rgba(20,55,37,.06)] sm:p-5">
          <CoverageChecker />
        </div>

        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Nuestros locales
          </h3>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {branches.length === 0 && (
              <Card className="border-dashed">
                <CardDescription>Aun no hay locales publicados.</CardDescription>
              </Card>
            )}

            {branches.map((branch) => (
              <Card key={branch.id}>
                <div className="flex items-start gap-3">
                  <Store className="mt-0.5 size-5 shrink-0 text-brand-600" />
                  <div>
                    <CardTitle className="text-base">{branch.name}</CardTitle>
                    <CardDescription className="mt-1">{branch.addressLine}</CardDescription>
                    <p className="mt-2 text-xs text-ink-muted">
                      Preparacion ~{branch.prepMinutes} min ·{' '}
                      {branch.acceptsPickup ? 'Recojo disponible' : 'Solo delivery'}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CoveragePage;
