import { useAppSelector } from '@app/hooks';
import {
  HomeBenefits,
  HomeChoiceSection,
  HomeFinalCta,
  HomeFeaturedMenu,
  HomeHero,
  HomePlansSection,
  HomeReturningCustomer,
  HomeStepsSection,
  HomeTransparencySection,
} from '../components';

/** Portada pública compuesta por secciones independientes y reutilizables. */
const HomePage = () => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  return (
    <>
      {/* Con sesion se antepone la continuidad (pedido en curso, volver a pedir,
        * saldo y favoritos). Sin sesion la portada es exactamente la de captacion:
        * el invitado no ve ni un pixel distinto ni una peticion de mas. */}
      {isAuthenticated && <HomeReturningCustomer />}
      <HomeHero />
      <HomeBenefits />
      <HomeFeaturedMenu />
      <HomeChoiceSection />
      <HomeStepsSection />
      <HomeTransparencySection />
      <HomePlansSection />
      <HomeFinalCta />
    </>
  );
};

export default HomePage;
