import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Mail,
  MessageCircle,
  Printer,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { PageLoader } from '@components/common/PageLoader';
import { ROUTES } from '@constants/routes';
import { useBusinessInfo } from '@services/businessInfo';
import { whatsappLink } from '@lib/whatsapp';
import { useCheckoutTerms } from '@services/checkoutTerms';

type TermsBlock = { type: 'paragraph' | 'list'; lines: string[] };
type TermsSection = { number: string; title: string; blocks: TermsBlock[] };

const parseTerms = (content: string, fallbackTitle: string): TermsSection[] => {
  const chunks = content.replace(/\r\n/g, '\n').trim().split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean);
  const sections: TermsSection[] = [];

  chunks.forEach((chunk) => {
    const heading = chunk.match(/^(\d+)\.\s+([^\n]+)(?:\n|$)/);
    if (heading) {
      const body = chunk.slice(heading[0].length).trim();
      const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
      const isList = lines.length > 0 && lines.every((line) => /^[-•]\s+/.test(line));
      sections.push({
        number: heading[1],
        title: heading[2].trim(),
        blocks: body ? [{ type: isList ? 'list' : 'paragraph', lines }] : [],
      });
      return;
    }

    const current = sections[sections.length - 1];
    if (!current) return;
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((line) => /^[-•]\s+/.test(line));
    current.blocks.push({ type: isList ? 'list' : 'paragraph', lines });
  });

  if (sections.length === 0 && content.trim()) {
    const lines = content.trim().split(/\n{2,}/).map((line) => line.trim()).filter(Boolean);
    return [{
      number: '1',
      title: fallbackTitle,
      blocks: lines.map((line) => ({ type: 'paragraph' as const, lines: [line] })),
    }];
  }

  return sections;
};

const publishedDate = (value: string) => new Date(value).toLocaleDateString('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const TermsPage = () => {
  const [params] = useSearchParams();
  const subscription = params.get('documento') === 'suscripcion';
  const { terms, error, refresh } = useCheckoutTerms(subscription);
  const business = useBusinessInfo();
  const whatsapp = whatsappLink(
    business.whatsappPhone ?? business.phone,
    'Hola, tengo una consulta sobre los términos y condiciones de Misky Challay.',
  );
  const sections = useMemo(() => (terms ? parseTerms(terms.content, terms.title) : []), [terms]);

  if (error) {
    return (
      <section className="container-shell py-16" role="alert">
        <div className="mx-auto max-w-xl rounded-card border border-line bg-white p-7 text-center shadow-e2 sm:p-10">
          <span className="mx-auto grid size-14 place-items-center rounded-card bg-brand-50 text-brand-700"><FileText className="size-6" aria-hidden="true" /></span>
          <h1 className="mt-5 text-2xl font-black text-ink">No pudimos cargar el documento</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Revisa tu conexión e intenta abrir los términos nuevamente.</p>
          <Button className="mt-6" onClick={() => void refresh()}>Reintentar</Button>
        </div>
      </section>
    );
  }

  if (!terms) return <PageLoader />;

  const documentLabel = subscription ? 'Condiciones de suscripción' : 'Documento legal';

  return (
    <div className="terms-page">
      <header id="terms-top" className="border-b border-brand-100 bg-brand-50/60">
        <div className="container-shell py-8 sm:py-12 lg:py-14">
          <Breadcrumbs items={[{ label: 'Inicio', to: ROUTES.home }, { label: 'Legal' }, { label: terms.title }]} />
          <div className="mt-8 grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-brand-700">
                <span className="h-px w-8 bg-accent-500" aria-hidden="true" />
                <ScrollText className="size-4" aria-hidden="true" />
                {documentLabel}
              </p>
              <h1 className="mt-5 max-w-3xl text-[clamp(2.35rem,5vw,4.6rem)] font-black leading-[1.03] tracking-[-.055em] text-ink">{terms.title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-ink-muted sm:text-lg">
                Conoce las condiciones que regulan tu cuenta, tus pedidos, los pagos y los servicios de Misky Challay.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3 text-xs font-semibold text-ink-muted">
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3.5 text-brand-800"><CheckCircle2 className="size-4 text-brand-600" aria-hidden="true" />Versión {terms.version} vigente</span>
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-white/70 px-3.5"><BookOpen className="size-4 text-brand-700" aria-hidden="true" />Publicada el {publishedDate(terms.publishedAt)}</span>
              </div>
            </div>

            <aside className="rounded-[1.25rem] border border-white/90 bg-white p-5 shadow-e3 sm:p-7" aria-label="Resumen del documento">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-800 text-white"><ShieldCheck className="size-5" aria-hidden="true" /></span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Documento vigente</p>
                  <h2 className="mt-2 text-xl font-black leading-7 text-ink">Lee antes de confirmar</h2>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-ink-muted">Estas condiciones se aplican a la compra y al uso de los servicios. Cuando aceptas una versión, guardamos su número y fecha junto con tu operación.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => window.print()} leftIcon={<Printer className="size-4" aria-hidden="true" />}>Imprimir / guardar PDF</Button>
                <Link to={ROUTES.privacy} className="inline-flex min-h-10 items-center gap-1.5 px-2 text-xs font-bold text-brand-700 hover:underline">Ver privacidad<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
              </div>
            </aside>
          </div>
        </div>
      </header>

      <div className="container-shell grid items-start gap-8 py-10 sm:py-14 lg:grid-cols-3 lg:gap-12 lg:py-16">
        <aside className="terms-toc min-w-0 lg:col-span-1 lg:sticky lg:top-24">
          <details className="rounded-card border border-line bg-white shadow-e1 lg:hidden">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 text-sm font-black text-ink marker:content-none [&::-webkit-details-marker]:hidden">
              En este documento
              <ChevronDown className="size-4 text-brand-700" aria-hidden="true" />
            </summary>
            <nav className="border-t border-line px-3 pb-3 pt-2" aria-label="Secciones del documento">
              {sections.map((section) => <a key={section.number} href={`#terminos-${section.number}`} className="flex min-h-10 items-center gap-3 rounded-field px-2 text-sm font-bold text-ink-muted hover:bg-brand-50 hover:text-brand-700"><span className="text-xs font-black text-brand-700">{section.number.padStart(2, '0')}</span><span className="min-w-0 truncate">{section.title}</span></a>)}
            </nav>
          </details>

          <div className="hidden rounded-card border border-line bg-white p-5 shadow-e1 lg:block">
            <p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">En este documento</p>
            <nav className="mt-4 space-y-1" aria-label="Secciones del documento">
              {sections.map((section) => <a key={section.number} href={`#terminos-${section.number}`} className="group flex min-h-10 items-center gap-3 rounded-field px-2 text-sm font-bold text-ink-muted hover:bg-brand-50 hover:text-brand-700"><span className="text-xs font-black text-brand-700">{section.number.padStart(2, '0')}</span><span className="min-w-0 flex-1 truncate">{section.title}</span><ChevronRight className="size-3.5 shrink-0 text-brand-400 transition-transform group-hover:translate-x-1" aria-hidden="true" /></a>)}
            </nav>
          </div>

          <div className="terms-actions mt-5 rounded-card border border-brand-200 bg-brand-50 p-5">
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">¿Tienes una consulta?</p>
            <p className="mt-2 text-sm leading-6 text-ink-muted">Nuestro equipo puede ayudarte a entender una condición antes de realizar tu pedido.</p>
            <div className="mt-4 flex flex-col gap-2">
              <a href={`mailto:${business.supportEmail}`} className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-brand-700 hover:underline"><Mail className="size-4" aria-hidden="true" />{business.supportEmail}</a>
              {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-brand-700 hover:underline"><MessageCircle className="size-4" aria-hidden="true" />Consultar por WhatsApp</a>}
            </div>
          </div>
        </aside>

        <div className="min-w-0 lg:col-span-2">
          <section className="mb-7 rounded-card border border-brand-100 bg-white p-5 shadow-e1 sm:p-7" aria-labelledby="terms-summary-title">
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Resumen de aplicación</p>
            <h2 id="terms-summary-title" className="mt-2 text-xl font-black text-ink">Condiciones claras para tu compra</h2>
            <p className="mt-3 text-sm leading-7 text-ink-muted">Este documento explica cómo funcionan las cuentas, los productos, los precios, los pedidos, los pagos, las entregas, las cancelaciones, los saldos y las suscripciones. Si una condición particular aparece en el checkout o en un plan, se aplica junto con este documento.</p>
          </section>

          <article className="terms-content rounded-card border border-line bg-white p-5 shadow-e1 sm:p-8" aria-label={terms.title}>
            {sections.map((section) => (
              <section id={`terminos-${section.number}`} key={section.number} className="scroll-mt-28 border-t border-line py-7 first:border-t-0 first:pt-0 last:pb-0">
                <div className="flex items-start gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-card bg-brand-50 text-sm font-black text-brand-700">{section.number.padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-black leading-7 tracking-tight text-ink sm:text-2xl">{section.title}</h2>
                    <div className="mt-4 space-y-4 text-sm leading-7 text-ink-muted sm:text-base">
                      {section.blocks.map((block, index) => block.type === 'list' ? (
                        <ul key={index} className="list-disc space-y-2 pl-5 marker:text-brand-600">
                          {block.lines.map((line) => <li key={line}>{line.replace(/^[-•]\s+/, '')}</li>)}
                        </ul>
                      ) : <p key={index}>{block.lines.join(' ')}</p>)}
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </article>

          <section className="terms-related mt-8" aria-labelledby="related-legal-title">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Documentos relacionados</p>
                <h2 id="related-legal-title" className="mt-2 text-2xl font-black tracking-tight text-ink">Consulta también</h2>
              </div>
              <Link to={ROUTES.howToOrder} className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-brand-700 hover:underline">Cómo hacer tu pedido<ArrowUpRight className="size-4" aria-hidden="true" /></Link>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Link to={ROUTES.privacy} className="group rounded-card border border-line bg-white p-4 shadow-e1 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2"><ShieldCheck className="size-5 text-brand-700" aria-hidden="true" /><strong className="mt-3 block text-sm text-ink">Política de privacidad</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">Cómo tratamos tus datos y derechos.</span><ArrowUpRight className="mt-3 size-4 text-brand-600 transition-transform group-hover:translate-x-1" aria-hidden="true" /></Link>
              <Link to={ROUTES.cookies} className="group rounded-card border border-line bg-white p-4 shadow-e1 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2"><BookOpen className="size-5 text-brand-700" aria-hidden="true" /><strong className="mt-3 block text-sm text-ink">Cookies y almacenamiento</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">Tus preferencias y almacenamiento local.</span><ArrowUpRight className="mt-3 size-4 text-brand-600 transition-transform group-hover:translate-x-1" aria-hidden="true" /></Link>
              <Link to={ROUTES.complaints} className="group rounded-card border border-line bg-white p-4 shadow-e1 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2"><FileText className="size-5 text-brand-700" aria-hidden="true" /><strong className="mt-3 block text-sm text-ink">Libro de Reclamaciones</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">Presenta o consulta una solicitud.</span><ArrowUpRight className="mt-3 size-4 text-brand-600 transition-transform group-hover:translate-x-1" aria-hidden="true" /></Link>
            </div>
          </section>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-ink-muted">
            <span>Versión {terms.version} · Publicada el {publishedDate(terms.publishedAt)}</span>
            <a href="#terms-top" className="font-bold text-brand-700 hover:underline">Volver al inicio</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
