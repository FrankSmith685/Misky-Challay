import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Building2, CalendarCheck, CalendarClock, Gift, PackageCheck, Palette, Search, SearchX, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { LoadError } from '@components/common/LoadError';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Input } from '@components/ui/Input';
import { ProductMedia } from '@components/ui/ProductMedia';
import { Select, SelectOption } from '@components/ui/Select';
import { ROUTES } from '@constants/routes';
import { useAppState } from '@context/AppStateContext';
import { BranchPrompt } from '@features/catalog/components/BranchPrompt';
import { ProductGridSkeleton } from '@features/catalog/components/ProductCardSkeleton';
import { catalogApi } from '@features/catalog/services/catalog.service';
import type { Product } from '@features/catalog/types';
import { getApiErrorMessage } from '@services/api/client';
import { cakeThemesApi, type CakeTheme } from '../cakeThemes.service';
import { CakeThemeCard } from '../components/CakeThemeCard';
import { BusinessQuotePanel } from '../components/BusinessQuotePanel';

const BUSINESS_NEEDS = [
  { icon: Gift, title: 'Regalos corporativos', description: 'Detalles para clientes, aliados o equipos de trabajo.', target: '#solicitar-propuesta', label: 'Pedir propuesta' },
  { icon: Users, title: 'Celebraciones internas', description: 'Cumpleaños, aniversarios y fechas especiales de tu equipo.', target: '#catalogo-empresas', label: 'Ver diseños' },
  { icon: PackageCheck, title: 'Pedidos por volumen', description: 'Coordinamos cantidades, fechas y presentación con anticipación.', target: '#solicitar-propuesta', label: 'Coordinar pedido' },
  { icon: Sparkles, title: 'Activaciones y eventos', description: 'Una propuesta dulce alineada con la experiencia de tu marca.', target: '#solicitar-propuesta', label: 'Hablar con el equipo' },
] as const;

const BUSINESS_BENEFITS = [
  { icon: BadgeCheck, title: 'Propuesta clara', text: 'Recibes precio, cantidades y condiciones antes de confirmar.' },
  { icon: CalendarCheck, title: 'Fecha coordinada', text: 'Validamos anticipación, disponibilidad y horario de entrega.' },
  { icon: ShieldCheck, title: 'Atención para empresas', text: 'Podemos considerar factura y referencias visuales de tu marca.' },
] as const;

const BUSINESS_FAQ = [
  { title: '¿Cuándo necesito una cotización?', text: 'Cuando buscas un diseño fuera de las opciones configurables, necesitas varias unidades o requieres una propuesta para un evento.' },
  { title: '¿Puedo solicitar factura?', text: 'Sí. Indícalo en la solicitud y comparte los datos de facturación antes de confirmar el pedido.' },
  { title: '¿Con cuánto tiempo debo solicitar?', text: 'Cada diseño muestra su anticipación mínima. Para pedidos por volumen recomendamos escribirnos con más tiempo para revisar capacidad y fecha.' },
  { title: '¿El QR o la realidad aumentada están incluidos?', text: 'Son una experiencia adicional que puede coordinarse para algunos pedidos. No reemplaza el diseño, la cotización ni la entrega.' },
] as const;

const searchable = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE');

const BusinessProjectCard = ({ product }: { product: Product }) => (
  <Card role="article" className="flex h-full min-w-0 flex-col overflow-hidden p-0">
    <ProductMedia src={product.imageUrl} alt={product.name} ratio="4/3" />
    <div className="flex flex-1 flex-col p-5">
      <p className="text-xs font-semibold text-brand-700">Proyecto a medida</p>
      <h3 className="mt-2 text-xl font-extrabold">{product.name}</h3>
      {product.description && (
        <p className="mt-2 text-sm leading-6 text-ink-muted">{product.description}</p>
      )}
      {Boolean(product.minLeadHours) && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
          <CalendarClock className="size-3.5 shrink-0" />
          Con {product.minLeadHours} h de anticipación
        </p>
      )}
      <p className="mt-auto pt-5 text-lg font-bold">Por cotización</p>
    </div>
    <div className="border-t border-line p-5">
      <Button
        component={Link}
        to={`${ROUTES.cake(product.slug)}?canal=empresas`}
        variant="outline"
        className="w-full"
        endIcon={<ArrowRight className="size-4" />}
      >
        Solicitar cotización
      </Button>
      {!product.isAvailable && (
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          Consulta la disponibilidad en otro taller.
        </p>
      )}
    </div>
  </Card>
);

/** Ofertas publicadas desde el panel: conserva precios, versiones y reglas de producción. */
const BusinessPage = () => {
  const { branchId, address, pickupBranch, deliveryType, openLocationModal } = useAppState();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const category = params.get('tematica') ?? '';
  const saleMode = params.get('venta') ?? '';
  const sort = params.get('orden') ?? 'RECOMMENDED';
  const [themes, setThemes] = useState<CakeTheme[]>([]);
  const [projects, setProjects] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const updateFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };
  const clearFilters = () => setParams({}, { replace: true });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      cakeThemesApi.list(branchId),
      catalogApi.getProducts({ branchId, audience: 'BUSINESS' }),
    ])
      .then(([designs, products]) => {
        if (!active) return;
        setThemes(designs);
        setProjects(products.filter((product) => product.cakeSaleMode === 'ADVANCED'));
        setLoading(false);
      })
      .catch((cause) => {
        if (!active) return;
        setThemes([]);
        setProjects([]);
        setError(getApiErrorMessage(cause));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId, retry]);

  const categories = useMemo(
    () => [...new Set(themes.map((theme) => theme.theme))].sort((a, b) => a.localeCompare(b, 'es')),
    [themes],
  );
  const entries = useMemo(
    () =>
      [
        ...themes.map((theme) => ({
          key: `theme-${theme.id}`,
          name: theme.name,
          description: `${theme.theme} ${theme.description}`,
          category: theme.theme,
          saleMode: theme.saleMode,
          price: theme.priceFrom,
          content: <CakeThemeCard theme={theme} />,
        })),
        ...projects.map((product) => ({
          key: `project-${product.id}`,
          name: product.name,
          description: product.description ?? '',
          category: '',
          saleMode: 'QUOTE',
          price: null,
          content: <BusinessProjectCard product={product} />,
        })),
      ]
        .filter(
          (entry) =>
            (!category || entry.category === category) &&
            (!saleMode || entry.saleMode === saleMode) &&
            searchable(`${entry.name} ${entry.description}`).includes(searchable(search.trim())),
        )
        .sort((a, b) => {
          if (sort === 'RECOMMENDED') return 0; // Orden gestionado desde el panel.
          if (a.price === null) return b.price === null ? 0 : 1;
          if (b.price === null) return -1;
          return sort === 'PRICE_DESC' ? b.price - a.price : a.price - b.price;
        }),
    [themes, projects, category, saleMode, search, sort],
  );
  const hasFilters = Boolean(search || category || saleMode);
  const selectedLocation = branchId
    ? deliveryType === 'PICKUP'
      ? pickupBranch?.name
      : address?.line1
    : undefined;

  return (
    <section className="container-shell py-8 sm:py-12" aria-label="Para empresas">
      <PageHeader
        eyebrow="Para empresas"
        icon={Building2}
        title="Diseños y propuestas para tu empresa"
        description="Celebra con tu equipo, sorprende a tus clientes o coordina un pedido por volumen. Elige un diseño o solicita una propuesta a medida."
        action={<><Button component="a" href="#catalogo-empresas" size="sm">Ver diseños</Button><Button component="a" href="#solicitar-propuesta" variant="outline" size="sm">Solicitar propuesta</Button></>}
        crumbs={[{ label: 'Inicio', to: ROUTES.home }, { label: 'Para empresas' }]}
      />

      <div className="mb-6 grid gap-5 overflow-hidden rounded-card border border-accent-200 bg-accent-50/60 p-5 sm:p-6 lg:grid-cols-[1fr_300px] lg:items-center"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-accent-800">Complemento opcional</p><h2 className="mt-1 font-bold">Un detalle que cobra vida</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">Añade video, dedicatoria o realidad aumentada accesibles desde un QR. Primero definimos tu producto y luego coordinamos la experiencia.</p><Button component={Link} to="/experiencias/demo" variant="outline" className="mt-4">Ver demostración QR</Button></div><div className="overflow-hidden rounded-2xl border border-white/80 bg-white shadow-e1"><img src="/brand/misky-challay-tech-web.webp" alt="Misky Challay, pastelería artesanal con IA y realidad aumentada" width="1024" height="683" loading="lazy" className="block aspect-[3/2] w-full object-cover" /></div></div>
      <section className="mb-7" aria-labelledby="business-needs-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-brand-700">Encuentra tu punto de partida</p><h2 id="business-needs-title" className="mt-2 text-2xl font-black tracking-tight text-ink sm:text-3xl">¿Qué quieres coordinar?</h2></div>
          <p className="max-w-sm text-xs leading-5 text-ink-muted">Puedes explorar los diseños sin iniciar sesión y pedir una propuesta cuando tengas los datos principales.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BUSINESS_NEEDS.map(({ icon: Icon, title, description, target, label }) => <article key={title} className="flex h-full flex-col rounded-card border border-line bg-white p-4 shadow-e1 transition-shadow hover:shadow-e2"><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><Icon className="size-5" aria-hidden="true" /></span><h3 className="mt-4 text-sm font-extrabold text-ink">{title}</h3><p className="mt-1 flex-1 text-xs leading-5 text-ink-muted">{description}</p><a href={target} className="mt-4 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-brand-700 underline underline-offset-4">{label}<ArrowRight className="size-3.5" aria-hidden="true" /></a></article>)}
        </div>
      </section>

      <ol
        className="mb-7 grid gap-3 sm:grid-cols-3"
        aria-label="Cómo hacer tu pedido para empresas"
      >
        {[
          {
            icon: Palette,
            title: '1. Elige tu diseño',
            description: 'Explora los modelos y sus opciones de personalización.',
          },
          {
            icon: Building2,
            title: '2. Define los detalles',
            description: 'Configura el modelo o solicita una propuesta para tu cantidad.',
          },
          {
            icon: CalendarClock,
            title: '3. Reserva la entrega',
            description: 'Validamos cobertura, factura y fecha antes de pagar.',
          },
        ].map(({ icon: Icon, title, description }) => (
          <li key={title} className="flex gap-3 rounded-card border border-line bg-white p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-field bg-brand-50 text-brand-700">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mb-7 grid gap-3 rounded-card border border-brand-100 bg-brand-900 p-4 text-white sm:grid-cols-3 sm:p-5">
        {BUSINESS_BENEFITS.map(({ icon: Icon, title, text }) => <div key={title} className="flex items-start gap-3 rounded-card bg-white/10 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-card bg-white/10 text-brand-200"><Icon className="size-4" aria-hidden="true" /></span><div><h3 className="text-sm font-extrabold">{title}</h3><p className="mt-1 text-xs leading-5 text-brand-50/75">{text}</p></div></div>)}
      </div>

      <div className="mb-7">
        <BranchPrompt onChooseLocation={openLocationModal} selectedLocation={selectedLocation} />
      </div>

      <BusinessQuotePanel selectedLocation={selectedLocation} />
      <Card id="catalogo-empresas" className="mb-5 scroll-mt-24 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Input
            type="search"
            label="Buscar diseño"
            value={search}
            onChange={(event) => updateFilter('q', event.target.value)}
            placeholder="Nombre, temática o celebración"
            startAdornment={<Search className="size-4 text-ink-muted" />}
          />
          <Select
            label="Temática"
            value={category}
            onChange={(event) => updateFilter('tematica', event.target.value)}
          >
            <SelectOption value="">Todas las temáticas</SelectOption>
            {categories.map((name) => (
              <SelectOption key={name} value={name}>
                {name}
              </SelectOption>
            ))}
          </Select>
          <Select
            label="Tipo de pedido"
            value={saleMode}
            onChange={(event) => updateFilter('venta', event.target.value)}
          >
            <SelectOption value="">Todos los diseños</SelectOption>
            <SelectOption value="CONFIGURED">Personalizar y comprar</SelectOption>
            <SelectOption value="QUOTE">Solicitar cotización</SelectOption>
          </Select>
        </div>
        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </Card>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-brand-700">
            Diseños especiales
          </p>
          <h2 className="mt-1.5 text-xl font-extrabold sm:text-2xl" aria-live="polite">
            {loading
              ? 'Preparando los diseños…'
              : error
                ? 'Diseños para tu próxima celebración'
                : `${entries.length} ${entries.length === 1 ? 'propuesta disponible' : 'propuestas disponibles'}`}
          </h2>
        </div>
        <div className="w-full sm:w-56">
          <Select
            label="Ordenar"
            value={sort}
            onChange={(event) => updateFilter('orden', event.target.value)}
          >
            <SelectOption value="RECOMMENDED">Recomendados</SelectOption>
            <SelectOption value="PRICE">Menor precio</SelectOption>
            <SelectOption value="PRICE_DESC">Mayor precio</SelectOption>
          </Select>
        </div>
      </div>
      {error ? (
        <LoadError
          title="No pudimos cargar los diseños para empresas"
          message={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      ) : loading ? (
        <div role="status" aria-label="Cargando diseños para empresas">
          <ProductGridSkeleton count={6} />
        </div>
      ) : entries.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:gap-6">
          {entries.map((entry) => (
            <div key={entry.key} className="min-w-0">
              {entry.content}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={hasFilters ? SearchX : Building2}
          title={
            hasFilters
              ? 'No hay diseños con estos filtros'
              : 'Estamos preparando los diseños para empresas'
          }
          description={
            hasFilters
              ? 'Prueba otra temática o limpia los filtros para explorar lo disponible.'
              : 'Los diseños aparecerán aquí cuando estén publicados y disponibles para recibir pedidos.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Ver todos los diseños
              </Button>
            ) : (
              <Button component={Link} to={ROUTES.menu} variant="outline">
                Explorar catálogo
              </Button>
            )
          }
        />
      )}
      <section className="mt-14 border-t border-line pt-10" aria-labelledby="business-faq-title">
        <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-12">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-brand-700">Antes de solicitar</p><h2 id="business-faq-title" className="mt-2 text-2xl font-black tracking-tight text-ink sm:text-3xl">Preguntas frecuentes</h2><p className="mt-3 text-sm leading-6 text-ink-muted">Revisa las condiciones principales o escríbenos si tu pedido necesita una coordinación especial.</p></div>
          <div className="border-t border-line">{BUSINESS_FAQ.map((item) => <details key={item.title} className="group border-b border-line py-1"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-bold text-ink">{item.title}<ArrowRight className="size-4 shrink-0 text-brand-600 transition-transform group-open:rotate-90" aria-hidden="true" /></summary><p className="pb-4 pr-6 text-sm leading-6 text-ink-muted">{item.text}</p></details>)}</div>
        </div>
      </section>
    </section>
  );
};

export default BusinessPage;
