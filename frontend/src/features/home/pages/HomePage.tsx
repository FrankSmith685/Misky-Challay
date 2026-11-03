import { useAppSelector } from '@app/hooks';
import { HomeReturningCustomer } from '../components/HomeReturningCustomer';
import { HomeEditorial } from '../components/HomeLearningContent';
import { useStorefront } from '../content/StorefrontContext';

const HomePage = () => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { content } = useStorefront();
  return (
    <>
      {isAuthenticated && <HomeReturningCustomer />}
      <HomeEditorial content={content} />
    </>
  );
};
export default HomePage;
