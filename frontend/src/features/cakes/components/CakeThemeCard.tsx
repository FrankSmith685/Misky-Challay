import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, Palette } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ProductMedia } from '@components/ui/ProductMedia';
import { ROUTES } from '@constants/routes';
import { formatCurrency } from '@lib/format';
import type { CakeTheme } from '../cakeThemes.service';

export const CakeThemeCard = ({ theme }: { theme: CakeTheme }) => {
  const to = `${ROUTES.cake(theme.productSlug)}?diseno=${encodeURIComponent(theme.slug)}`;
  return <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-white shadow-e2">
    <Link to={to} className="block" aria-label={`Ver diseño ${theme.name}`}>
      <ProductMedia src={theme.imageUrls[0]} alt={theme.name} ratio="4/3"><span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-brand-800">{theme.saleMode === 'QUOTE' ? 'Diseño por cotización' : 'Diseño configurable'}</span></ProductMedia>
    </Link>
    <div className="flex flex-1 flex-col p-5"><p className="flex items-center gap-1.5 text-xs font-medium text-brand-700"><Palette className="size-3.5" aria-hidden="true" />{theme.theme}</p><h3 className="mt-2 text-xl font-extrabold leading-tight">{theme.name}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">{theme.description}</p><p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted"><Clock3 className="size-3.5" aria-hidden="true" />Con {theme.minLeadHours} h de anticipación</p>
      <div className="mt-auto pt-5"><p className="text-xs text-ink-muted">{theme.priceFrom === null ? 'Según tu idea y las porciones' : 'Desde'}</p><p className="mt-1 text-2xl font-bold tracking-tight text-ink">{theme.priceFrom === null ? 'Por cotización' : formatCurrency(theme.priceFrom)}</p></div>
    </div>
    <div className="border-t border-line p-5"><Button component={Link} to={to} className="w-full" variant={theme.saleMode === 'QUOTE' ? 'outline' : 'primary'}>{theme.saleMode === 'QUOTE' ? 'Solicitar cotización' : 'Elegir este diseño'}<ArrowRight className="ml-2 size-4" /></Button>{!theme.isAvailable && <p className="mt-2 text-xs leading-5 text-ink-muted">Revisa otro taller o solicita una adaptación.</p>}</div>
  </article>;
};
