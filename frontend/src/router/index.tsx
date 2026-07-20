import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ROUTES } from '@constants/routes';
import { PERM } from '@constants/permissions';
import { PublicLayout } from '@components/layout/PublicLayout';
import { AccountLayout } from '@components/layout/AccountLayout';
import { AdminLayout } from '@components/layout/AdminLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { PageLoader } from '@components/common/PageLoader';

// Lazy loading: cada pagina se descarga solo cuando se visita.
const HomePage = lazy(() => import('@features/home/pages/HomePage'));
const MenuPage = lazy(() => import('@features/catalog/pages/MenuPage'));
const ProductPage = lazy(() => import('@features/catalog/pages/ProductPage'));
const BuilderPage = lazy(() => import('@features/builder/pages/BuilderPage'));
const PlansPage = lazy(() => import('@features/plans/pages/PlansPage'));
const CoveragePage = lazy(() => import('@features/geo/pages/CoveragePage'));
const CartPage = lazy(() => import('@features/cart/pages/CartPage'));
const CheckoutPage = lazy(() => import('@features/checkout/pages/CheckoutPage'));
const CheckoutSuccessPage = lazy(() => import('@features/checkout/pages/CheckoutSuccessPage'));
const PaymentSimulatorPage = lazy(() => import('@features/checkout/pages/PaymentSimulatorPage'));
const LoginPage = lazy(() => import('@features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@features/auth/pages/RegisterPage'));
const OrdersPage = lazy(() => import('@features/orders/pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('@features/orders/pages/OrderDetailPage'));
const ProfilePage = lazy(() => import('@features/account/pages/ProfilePage'));
const AddressesPage = lazy(() => import('@features/account/pages/AddressesPage'));
const FavoritesPage = lazy(() => import('@features/favorites/pages/FavoritesPage'));
const SavedBowlsPage = lazy(() => import('@features/account/pages/SavedBowlsPage'));
const WalletPage = lazy(() => import('@features/plans/pages/WalletPage'));
const PanelHome = lazy(() => import('@features/admin/pages/PanelHome'));
const AdminDashboardPage = lazy(() => import('@features/admin/pages/AdminDashboardPage'));
const AdminOrdersPage = lazy(() => import('@features/admin/pages/AdminOrdersPage'));
const KitchenPage = lazy(() => import('@features/admin/pages/KitchenPage'));
const DeliveryPage = lazy(() => import('@features/admin/pages/DeliveryPage'));
const InventoryPage = lazy(() => import('@features/admin/pages/InventoryPage'));
const CatalogPage = lazy(() => import('@features/admin/pages/CatalogPage'));
const BuilderAdminPage = lazy(() => import('@features/admin/pages/BuilderAdminPage'));
const MediaLibraryPage = lazy(() => import('@features/admin/pages/MediaLibraryPage'));
const CouponsPage = lazy(() => import('@features/admin/pages/CouponsPage'));
const PlansAdminPage = lazy(() => import('@features/admin/pages/PlansAdminPage'));
const AdminCoveragePage = lazy(() => import('@features/admin/pages/CoveragePage'));
const UsersPage = lazy(() => import('@features/admin/pages/UsersPage'));
const RolesPage = lazy(() => import('@features/admin/pages/RolesPage'));
const DesignSystemPage = lazy(() => import('@features/admin/pages/DesignSystemPage'));
const ComplaintsPage = lazy(() => import('@features/legal/pages/ComplaintsPage'));
const PrivacyPage = lazy(() => import('@features/legal/pages/PrivacyPage'));
const TermsPage = lazy(() => import('@features/legal/pages/TermsPage'));
const NotFoundPage = lazy(() => import('@features/home/pages/NotFoundPage'));

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>{element}</Suspense>
);

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: ROUTES.home, element: withSuspense(<HomePage />) },
      { path: ROUTES.menu, element: withSuspense(<MenuPage />) },
      { path: ROUTES.product(), element: withSuspense(<ProductPage />) },
      { path: ROUTES.builder, element: withSuspense(<BuilderPage />) },
      { path: ROUTES.plans, element: withSuspense(<PlansPage />) },
      { path: ROUTES.coverage, element: withSuspense(<CoveragePage />) },
      { path: ROUTES.cart, element: withSuspense(<CartPage />) },
      { path: ROUTES.complaints, element: withSuspense(<ComplaintsPage />) },
      { path: ROUTES.privacy, element: withSuspense(<PrivacyPage />) },
      { path: ROUTES.terms, element: withSuspense(<TermsPage />) },
      { path: ROUTES.login, element: withSuspense(<LoginPage />) },
      { path: ROUTES.register, element: withSuspense(<RegisterPage />) },
      // El checkout NO exige sesion: se puede comprar como invitado (el backend
      // asocia el pedido al cliente si hay token).
      { path: ROUTES.checkout, element: withSuspense(<CheckoutPage />) },
      { path: ROUTES.paymentSimulator, element: withSuspense(<PaymentSimulatorPage />) },
      { path: ROUTES.checkoutSuccess, element: withSuspense(<CheckoutSuccessPage />) },
    ],
  },
  {
    path: ROUTES.account,
    element: (
      <ProtectedRoute>
        <AccountLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: withSuspense(<ProfilePage />) },
      { path: 'perfil', element: withSuspense(<ProfilePage />) },
      { path: 'pedidos', element: withSuspense(<OrdersPage />) },
      { path: 'pedidos/:orderNumber', element: withSuspense(<OrderDetailPage />) },
      { path: 'saldo', element: withSuspense(<WalletPage />) },
      { path: 'direcciones', element: withSuspense(<AddressesPage />) },
      { path: 'favoritos', element: withSuspense(<FavoritesPage />) },
      { path: 'bowls-guardados', element: withSuspense(<SavedBowlsPage />) },
    ],
  },
  {
    // El panel es UNO SOLO. Cada pantalla exige su permiso: el nutricionista y el
    // superadmin entran aqui mismo y ven cosas distintas (mismo edificio, otras llaves).
    path: ROUTES.admin,
    element: (
      <ProtectedRoute
        anyPermission={[
          PERM.ORDER_READ,
          PERM.KITCHEN_READ,
          PERM.DELIVERY_READ,
          PERM.INVENTORY_READ,
          PERM.CATALOG_PRODUCT_READ,
          PERM.CATALOG_CUSTOMIZATION_WRITE,
          PERM.NUTRITION_READ,
          PERM.PROMOTION_MANAGE,
          PERM.PLAN_MANAGE,
          PERM.GEO_READ,
          PERM.GEO_WRITE,
          PERM.USER_READ,
          PERM.ROLE_READ,
          PERM.REPORT_SALES_READ,
          PERM.REPORT_OPERATIONS_READ,
          PERM.SETTINGS_MANAGE,
        ]}
      >
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      // El recibidor manda a cada rol a su primera pantalla accesible.
      { index: true, element: withSuspense(<PanelHome />) },
      {
        path: 'resumen',
        element: (
          <ProtectedRoute anyPermission={[PERM.REPORT_SALES_READ, PERM.REPORT_OPERATIONS_READ]}>
            {withSuspense(<AdminDashboardPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'pedidos',
        element: (
          <ProtectedRoute permissions={[PERM.ORDER_READ]}>
            {withSuspense(<AdminOrdersPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'cocina',
        element: (
          <ProtectedRoute permissions={[PERM.KITCHEN_READ]}>
            {withSuspense(<KitchenPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'reparto',
        element: (
          <ProtectedRoute permissions={[PERM.DELIVERY_READ]}>
            {withSuspense(<DeliveryPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventario',
        element: (
          <ProtectedRoute permissions={[PERM.INVENTORY_READ]}>
            {withSuspense(<InventoryPage />)}
          </ProtectedRoute>
        ),
      },
      {
        // El nutricionista entra con nutrition.read; el gestor, con catalog.product.read.
        path: 'catalogo',
        element: (
          <ProtectedRoute anyPermission={[PERM.CATALOG_PRODUCT_READ, PERM.NUTRITION_READ]}>
            {withSuspense(<CatalogPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'constructor',
        element: (
          <ProtectedRoute permissions={[PERM.CATALOG_CUSTOMIZATION_WRITE]}>
            {withSuspense(<BuilderAdminPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'medios',
        element: (
          <ProtectedRoute anyPermission={[PERM.CATALOG_PRODUCT_WRITE, PERM.CATALOG_CUSTOMIZATION_WRITE]}>
            {withSuspense(<MediaLibraryPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'cupones',
        element: (
          <ProtectedRoute permissions={[PERM.PROMOTION_MANAGE]}>
            {withSuspense(<CouponsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'planes',
        element: (
          <ProtectedRoute permissions={[PERM.PLAN_MANAGE]}>
            {withSuspense(<PlansAdminPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'cobertura',
        element: (
          <ProtectedRoute anyPermission={[PERM.GEO_READ, PERM.GEO_WRITE]}>
            {withSuspense(<AdminCoveragePage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'usuarios',
        element: (
          <ProtectedRoute permissions={[PERM.USER_READ]}>
            {withSuspense(<UsersPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'roles',
        element: (
          <ProtectedRoute permissions={[PERM.ROLE_READ]}>
            {withSuspense(<RolesPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'sistema-diseno',
        element: (
          <ProtectedRoute permissions={[PERM.SETTINGS_MANAGE]}>
            {withSuspense(<DesignSystemPage />)}
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: '*', element: withSuspense(<NotFoundPage />) },
]);
