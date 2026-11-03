import { Link } from 'react-router-dom';
import { ArrowDown, Sparkles } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';

type MenuHeroProps = {
  customView?: boolean;
};

export const MenuHero = ({ customView = false }: MenuHeroProps) => (
  <section className="relative overflow-hidden bg-brand-900 text-white">
    <div className="container-shell grid items-center gap-8 py-12 lg:grid-cols-2 lg:py-16">
      <div>
        <p className="text-xs font-black uppercase tracking-[.2em] text-brand-200">
          {customView ? 'Crea tu torta' : 'Catálogo Misky Challay'}
        </p>
        <h1 className="mt-4 text-[clamp(2.8rem,5vw,4.7rem)] font-black leading-none tracking-tight">
          {customView ? 'Diseña una torta a tu manera.' : 'Dulces momentos para compartir.'}
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-brand-100">
          {customView
            ? 'Elige sabores, rellenos y detalles para crear una torta especial para tu celebración.'
            : 'Descubre tortas, postres, turrones y bocaditos. Elige tu favorito y encuentra la presentación para tu ocasión.'}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button component="a" href="#catalogo" size="lg" className="bg-white text-brand-900" leftIcon={<ArrowDown size={18} />}>
            {customView ? 'Ver opciones' : 'Explorar catálogo'}
          </Button>
          <Button
            component={Link}
            to={customView ? ROUTES.menu : ROUTES.menuMode('CUSTOM')}
            size="lg"
            variant="outline"
            leftIcon={<Sparkles size={18} />}
            sx={{ bgcolor: 'transparent', color: '#fff', borderColor: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', borderColor: '#fff' } }}
          >
            {customView ? 'Ver catálogo' : 'Crea tu torta'}
          </Button>
        </div>
      </div>
      <img
        src="/images/cakes/vanilla.svg"
        alt={customView ? 'Torta personalizada Misky Challay' : 'Torta clásica Misky Challay'}
        className="hidden w-full rounded-3xl border border-white/20 shadow-2xl lg:block"
      />
    </div>
  </section>
);
