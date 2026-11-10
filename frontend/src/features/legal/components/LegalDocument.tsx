import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ArrowUpRight, BookOpen, CheckCircle2, ChevronRight, FileText, Printer, ShieldCheck } from 'lucide-react';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { ROUTES } from '@constants/routes';
import { useBusinessInfo } from '@services/businessInfo';

export interface LegalSection {
  title: string;
  body: ReactNode;
}

interface LegalDocumentProps {
  title: string;
  updatedAt: string;
  intro?: ReactNode;
  sections: LegalSection[];
}

const toAnchor = (title: string, index: number) =>
  `documento-legal-${index + 1}-${title.toLocaleLowerCase('es').replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '')}`;

/** Shell compartido para las políticas públicas de privacidad y cookies. */
export const LegalDocument = ({ title, updatedAt, intro, sections }: LegalDocumentProps) => {
  const business = useBusinessInfo();

  return (
    <div className="legal-document-page" id="top">
      <header className="border-b border-brand-100 bg-brand-50/60">
        <div className="container-shell">
          <div className="pt-5 sm:pt-7">
            <Breadcrumbs
              items={[{ label: 'Inicio', to: ROUTES.home }, { label: 'Legal' }, { label: title }]}
            />
          </div>

          <div className="grid gap-7 py-10 sm:py-14 lg:grid-cols-3 lg:items-end lg:py-16">
            <div className="lg:col-span-2">
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-brand-700">
                <FileText className="size-4" aria-hidden="true" /> Documento legal
              </p>
              <h1 className="mt-5 max-w-4xl text-[clamp(2.2rem,5vw,4.5rem)] font-black leading-[1.03] tracking-[-.055em] text-ink">
                {title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-ink-muted sm:text-lg">
                Lee cómo tratamos la información y qué opciones tienes para gestionar tus datos y preferencias.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3.5 text-brand-800">
                  <CheckCircle2 className="size-4 text-brand-600" aria-hidden="true" /> Versión vigente
                </span>
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-white/70 px-3.5 text-ink-muted">
                  <BookOpen className="size-4 text-brand-700" aria-hidden="true" /> Actualizada el {updatedAt}
                </span>
              </div>
            </div>

            <div className="rounded-card border border-brand-200 bg-white p-5 shadow-e2 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Documento vigente</p>
              <p className="mt-3 text-sm leading-6 text-ink-muted">
                Esta versión es la que aplica a las solicitudes realizadas desde la web y la aplicación.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-field bg-brand-700 px-3.5 text-sm font-bold text-white transition hover:bg-brand-800"
                >
                  <Printer className="size-4" aria-hidden="true" /> Imprimir / PDF
                </button>
                <RouterLink
                  to={ROUTES.terms}
                  className="inline-flex min-h-10 items-center gap-1.5 px-2 text-sm font-bold text-brand-700 hover:underline"
                >
                  Ver términos <ArrowUpRight className="size-4" aria-hidden="true" />
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container-shell grid gap-7 py-8 sm:py-10 lg:grid-cols-3 lg:gap-10 lg:py-12">
        <aside className="legal-document-toc min-w-0 lg:sticky lg:top-24 lg:self-start">
          <details className="rounded-card border border-line bg-white shadow-e1 lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-black text-ink">
              En esta página <ChevronRight className="size-4 text-brand-700" aria-hidden="true" />
            </summary>
            <nav className="border-t border-line px-3 py-3" aria-label="Secciones del documento">
              {sections.map((section, index) => (
                <a
                  key={section.title}
                  href={`#${toAnchor(section.title, index)}`}
                  className="group flex min-h-10 items-center gap-3 rounded-field px-2 text-sm font-bold text-ink-muted hover:bg-brand-50 hover:text-brand-700"
                >
                  <span className="text-xs font-black text-brand-700">{String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate">{section.title}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-brand-400 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </a>
              ))}
            </nav>
          </details>

          <div className="hidden rounded-card border border-line bg-white p-4 shadow-e1 lg:block">
            <p className="px-2 text-xs font-black uppercase tracking-[.16em] text-brand-700">En esta página</p>
            <nav className="mt-3 space-y-1" aria-label="Secciones del documento">
              {sections.map((section, index) => (
                <a
                  key={section.title}
                  href={`#${toAnchor(section.title, index)}`}
                  className="group flex min-h-10 items-center gap-3 rounded-field px-2 text-sm font-bold text-ink-muted hover:bg-brand-50 hover:text-brand-700"
                >
                  <span className="text-xs font-black text-brand-700">{String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate">{section.title}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-brand-400 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </a>
              ))}
            </nav>
          </div>

          <div className="legal-document-contact mt-5 rounded-card border border-brand-200 bg-brand-50 p-5">
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">¿Necesitas ayuda?</p>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Para ejercer tus derechos o resolver una duda, escríbenos y te orientaremos.
            </p>
            <a href={`mailto:${business.supportEmail}`} className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-brand-700 hover:underline">
              <ShieldCheck className="size-4" aria-hidden="true" /> {business.supportEmail}
            </a>
          </div>
        </aside>

        <div className="min-w-0 lg:col-span-2">
          <section className="mb-7 rounded-card border border-brand-100 bg-white p-5 shadow-e1 sm:p-7" aria-labelledby="legal-summary-title">
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Antes de continuar</p>
            <h2 id="legal-summary-title" className="mt-2 text-xl font-black text-ink">Información clara y control sobre tus datos</h2>
            <div className="mt-3 text-sm leading-7 text-ink-muted">{intro}</div>
          </section>

          <article className="legal-document-content rounded-card border border-line bg-white p-5 shadow-e1 sm:p-8" aria-label={title}>
            {sections.map((section, index) => (
              <section
                id={toAnchor(section.title, index)}
                key={section.title}
                className="scroll-mt-28 border-t border-line py-7 first:border-t-0 first:pt-0 last:pb-0"
              >
                <div className="flex items-start gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-card bg-brand-50 text-sm font-black text-brand-700">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-black leading-7 tracking-tight text-ink sm:text-2xl">{section.title}</h2>
                    <div className="legal-section-body mt-4 text-sm leading-7 text-ink-muted sm:text-base">{section.body}</div>
                  </div>
                </div>
              </section>
            ))}
          </article>

          <section className="legal-document-related mt-8" aria-labelledby="related-legal-title">
            <div>
              <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Documentos relacionados</p>
              <h2 id="related-legal-title" className="mt-2 text-2xl font-black tracking-tight text-ink">Consulta también</h2>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <RouterLink to={ROUTES.terms} className="group rounded-card border border-line bg-white p-4 shadow-e1 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2">
                <FileText className="size-5 text-brand-700" aria-hidden="true" />
                <strong className="mt-3 block text-sm text-ink">Términos y condiciones</strong>
                <span className="mt-1 block text-xs leading-5 text-ink-muted">Reglas de compra, pagos y entregas.</span>
                <ArrowUpRight className="mt-3 size-4 text-brand-600 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </RouterLink>
              <RouterLink to={ROUTES.cookies} className="group rounded-card border border-line bg-white p-4 shadow-e1 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2">
                <BookOpen className="size-5 text-brand-700" aria-hidden="true" />
                <strong className="mt-3 block text-sm text-ink">Cookies y almacenamiento</strong>
                <span className="mt-1 block text-xs leading-5 text-ink-muted">Tus preferencias y almacenamiento local.</span>
                <ArrowUpRight className="mt-3 size-4 text-brand-600 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </RouterLink>
              <RouterLink to={ROUTES.privacy} className="group rounded-card border border-line bg-white p-4 shadow-e1 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2">
                <ShieldCheck className="size-5 text-brand-700" aria-hidden="true" />
                <strong className="mt-3 block text-sm text-ink">Política de privacidad</strong>
                <span className="mt-1 block text-xs leading-5 text-ink-muted">Datos, derechos y solicitudes ARCO.</span>
                <ArrowUpRight className="mt-3 size-4 text-brand-600 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </RouterLink>
            </div>
          </section>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-ink-muted">
            <span>Documento informativo de {business.commercialName}</span>
            <a href="#top" className="font-bold text-brand-700 hover:underline">Volver al inicio</a>
          </div>
        </div>
      </div>
    </div>
  );
};
