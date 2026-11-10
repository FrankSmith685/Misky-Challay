import { FeatureTile } from '@components/marketing';
import { RevealGroup } from '@components/ui/Reveal';
import { CakeSlice, CalendarDays, ChefHat, Flame, MapPin, Truck, type LucideIcon } from 'lucide-react';
import { HOME_BENEFITS } from '../homeContent';
import type { StorefrontContent } from '../content/storefront.schema';

const ICONS = { cake: CakeSlice, flame: Flame, calendar: CalendarDays, 'map-pin': MapPin, 'chef-hat': ChefHat, truck: Truck } as const;

export const HomeBenefits = ({ benefits }: { benefits?: StorefrontContent['benefits'] }) => {
  const rows: Array<{ title: string; description: string; icon: LucideIcon }> = benefits?.length
    ? benefits.map((benefit) => ({ title: benefit.title, description: benefit.description, icon: benefit.icon ? ICONS[benefit.icon] : CakeSlice }))
    : HOME_BENEFITS;
  return (
    <section className="relative z-10 border-b border-line bg-white" aria-label="Por qué elegir Misky Challay">
      <RevealGroup className="container-shell grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
        {rows.map((benefit, index) => {
          return (
            <FeatureTile
              key={benefit.title}
              icon={benefit.icon}
              title={benefit.title}
              description={benefit.description}
              eyebrow={`0${index + 1}`}
              tone={index === 1 ? 'accent' : index === 2 ? 'tertiary' : 'brand'}
              className="px-1 py-7 md:px-6 md:py-8"
            />
          );
        })}
      </RevealGroup>
    </section>
  );
};
