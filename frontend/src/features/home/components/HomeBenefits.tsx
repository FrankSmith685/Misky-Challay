import { FeatureTile } from '@components/marketing';
import { RevealGroup } from '@components/ui/Reveal';
import { HOME_BENEFITS } from '../homeContent';

/** Barra de valor inmediatamente después del hero. */
export const HomeBenefits = () => (
  <section className="relative z-10 border-b border-line bg-white" aria-label="Por qué elegir Misky Challay">
    <RevealGroup className="container-shell grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
      {HOME_BENEFITS.map((benefit, index) => (
        <FeatureTile
          key={benefit.title}
          icon={benefit.icon}
          title={benefit.title}
          description={benefit.description}
          eyebrow={`0${index + 1}`}
          className="px-1 py-7 md:px-6 md:py-8"
        />
      ))}
    </RevealGroup>
  </section>
);
