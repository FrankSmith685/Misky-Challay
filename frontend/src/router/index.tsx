import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ROUTES } from '@constants/routes';
import { ADMIN_NAV, ADMIN_ROOT_PERMISSIONS } from '@constants/adminNav';
import { PublicLayout } from '@components/layout/PublicLayout';
import { AccountLayout } from '@components/layout/AccountLayout';
import { AdminLayout } from '@components/layout/AdminLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { GuestRoute } from './GuestRoute';
import { PageLoader } from '@components/common/PageLoader';
// Sin lazy: es la pantalla que tiene que seguir en pie cuando algo se rompe.
import { RouteErrorBoundary } from '@components/common/RouteErrorBoundary';

// Lazy loading: cada pagina se descarga solo cuando se visita.
const HomePage = lazy(() => import('@features/home/pages/HomePage'));
const MenuPage = lazy(() => import('@features/catalog/pages/MenuPage'));
const ProductPage = lazy(() => import('@features/catalog/pages/ProductPage'));
const BuilderPage = lazy(() => import('@features/builder/pages/BuilderPage'));
const PlansPage = lazy(() => import('@features/plans/pages/PlansPage'));
const CoveragePage = lazy(() => import('@features/geo/pages/CoveragePage'));
const DineInQrPage = lazy(() => import('@features/dining/pages/DineInQrPage'));
const CartPage = lazy(() => import('@features/cart/pages/CartPage'));
const CheckoutPage = lazy(() => import('@features/checkout/pages/CheckoutPage'));
const CheckoutSuccessPage = lazy(() => import('@features/checkout/pages/CheckoutSuccessPage'));
const PaymentSimulatorPage = lazy(() => import('@features/checkout/pages/PaymentSimulatorPage'));
const MobilePaymentReturnPage = lazy(() => import('@features/checkout/pages/MobilePaymentReturnPage'));
const MobilePlanReturnPage = lazy(() => import('@features/plans/pages/MobilePlanReturnPage'));
const LoginPage = lazy(() => import('@features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@features/auth/pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@features/auth/pages/ResetPasswordPage'));
const MobileResetPasswordPage = lazy(() => import('@features/auth/pages/MobileResetPasswordPage'));
const OrdersPage = lazy(() => import('@features/orders/pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('@features/orders/pages/OrderDetailPage'));
const ProfilePage = lazy(() => import('@features/account/pages/ProfilePage'));
const AddressesPage = lazy(() => import('@features/account/pages/AddressesPage'));
const FavoritesPage = lazy(() => import('@features/favorites/pages/FavoritesPage'));
const SavedBowlsPage = lazy(() => import('@features/account/pages/SavedBowlsPage'));
const ReviewsPage = lazy(() => import('@features/reviews/pages/ReviewsPage'));
const WalletPage = lazy(() => import('@features/plans/pages/WalletPage'));
const PanelHome = lazy(() => import('@features/admin/pages/PanelHome'));
const AdminDashboardPage = lazy(() => import('@features/admin/pages/AdminDashboardPage'));
const AdminOrdersPage = lazy(() => import('@features/admin/pages/AdminOrdersPage'));
const CashPage = lazy(() => import('@features/admin/pages/CashPage'));
const DiningPage = lazy(() => import('@features/admin/pages/DiningPage'));
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
const BusinessSettingsPage = lazy(() => import('@features/admin/pages/BusinessSettingsPage'));
const ComplaintsPage = lazy(() => import('@features/legal/pages/ComplaintsPage'));
const PrivacyPage = lazy(() => import('@features/legal/pages/PrivacyPage'));
const TermsPage = lazy(() => import('@features/legal/pages/TermsPage'));
const CookiesPage = lazy(() => import('@features/legal/pages/CookiesPage'));
const DeleteAccountPage = lazy(() => import('@features/legal/pages/DeleteAccountPage'));
const AdminComplaintsPage = lazy(() => import('@features/admin/pages/AdminComplaintsPage'));
const AuditLogPage = lazy(() => import('@features/admin/pages/AuditLogPage'));
const AccountHomePage = lazy(() => import('@features/account/pages/AccountHomePage'));
const NotFoundPage = lazy(() => import('@features/home/pages/NotFoundPage'));

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>{element}</Suspense>
);

/**
 * Permisos de una pantalla del panel: se leen de la MISMA fila de
 * `constants/adminNav.ts` que pinta su entrada en el menu.
 *
 * Cuando el router mantenia su propia lista, las dos divergian y aparecia el
 * rebote: el usuario veia la entrada, entraba y salia expulsado. Le pasaba a
 * Soporte con Planes (`plan.manage` aqui, `plan.read` en el backend) y al
 * nutricionista con el Constructor, donde viven los alergenos que solo el puede
 * editar. Aqui ya no hay dos verdades que sincronizar.
 *
 * Una ruta sin fila revienta al arrancar a proposito: el fallo alternativo es un
 * `anyPermission` vacio, que deja fuera del panel a todo el que no sea superadmin
 * y no se nota hasta que alguien se queja.
 */
const navAnyOf = (to: string): string[] => {
  const entry = ADMIN_NAV.find((item) => item.to === to);
  if (!entry) throw new Error(`Ruta del panel sin fila en ADMIN_NAV: ${to}`);
  return entry.anyOf;
};

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    // Los tres nodos raiz lo declaran: una excepcion de render no puede dejar al
    // cliente en la pantalla cruda de react-router, sin marca y sin salida.
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: ROUTES.home, element: withSuspense(<HomePage />) },
      { path: ROUTES.menu, element: withSuspense(<MenuPage />) },
      { path: ROUTES.product(), element: withSuspense(<ProductPage />) },
      { path: ROUTES.builder, element: withSuspense(<BuilderPage />) },
      { path: ROUTES.plans, element: withSuspense(<PlansPage />) },
      { path: ROUTES.coverage, element: withSuspense(<CoveragePage />) },
      { path: ROUTES.diningTable(), element: withSuspense(<DineInQrPage />) },
      { path: ROUTES.cart, element: withSuspense(<CartPage />) },
      { path: ROUTES.complaints, element: withSuspense(<ComplaintsPage />) },
      { path: ROUTES.privacy, element: withSuspense(<PrivacyPage />) },
      { path: ROUTES.terms, element: withSuspense(<TermsPage />) },
      { path: ROUTES.cookies, element: withSuspense(<CookiesPage />) },
      /* Sin ProtectedRoute a proposito: la tienda de aplicaciones revisa esta URL
       * sin sesion. La pagina informa siempre y solo pide la clave si hay sesion. */
      { path: ROUTES.deleteAccount, element: withSuspense(<DeleteAccountPage />) },
      /* Las tres pantallas de acceso son para quien NO tiene sesion: si ya entro,
       * GuestRoute lo devuelve a donde iba en vez de pedirle la clave otra vez. */
      { path: ROUTES.login, element: <GuestRoute>{withSuspense(<LoginPage />)}</GuestRoute> },
      { path: ROUTES.register, element: <GuestRoute>{withSuspense(<RegisterPage />)}</GuestRoute> },
      {
        path: ROUTES.forgotPassword,
        element: <GuestRoute>{withSuspense(<ForgotPasswordPage />)}</GuestRoute>,
      },
      /* Restablecer SI queda abierto con sesion: se llega desde el enlace del correo
       * y el token es la unica prueba que cuenta. Cerrarlo dejaria tirado a quien
       * pidio la recuperacion desde otro dispositivo con la sesion aun viva aqui. */
      { path: ROUTES.resetPassword, element: withSuspense(<ResetPasswordPage />) },
      { path: ROUTES.mobileResetPassword, element: withSuspense(<MobileResetPasswordPage />) },
      /* Confirmar un pedido EXIGE sesion (el backend rechaza /checkout/place sin
       * ella): sin cliente no hay a quien notificar el estado, ni "Mis pedidos",
       * ni contra quien validar cupones, saldo o un reclamo posterior.
       * ProtectedRoute guarda de donde venia, asi que tras identificarse vuelve
       * aqui con el carrito intacto. */
      {
        path: ROUTES.checkout,
        element: <ProtectedRoute>{withSuspense(<CheckoutPage />)}</ProtectedRoute>,
      },
      { path: ROUTES.paymentSimulator, element: withSuspense(<PaymentSimulatorPage />) },
      { path: '/checkout/movil', element: withSuspense(<MobilePaymentReturnPage />) },
      { path: '/planes/movil', element: withSuspense(<MobilePlanReturnPage />) },
      { path: ROUTES.checkoutSuccess, element: withSuspense(<CheckoutSuccessPage />) },
      /* La 404 cuelga del layout publico: un enlace roto compartido por WhatsApp
       * aterriza con cabecera, carrito, pie y RouteEffects, no en una tarjeta suelta. */
      { path: '*', element: withSuspense(<NotFoundPage />) },
    ],
  },
  {
    path: ROUTES.account,
    element: (
      <ProtectedRoute>
        <AccountLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      // El indice es el panel de inicio: aterrizar en el formulario de perfil dejaba
      // ademas la navegacion sin ninguna seccion marcada.
      { index: true, element: withSuspense(<AccountHomePage />) },
      { path: 'perfil', element: withSuspense(<ProfilePage />) },
      { path: 'pedidos', element: withSuspense(<OrdersPage />) },
      { path: 'pedidos/:orderNumber', element: withSuspense(<OrderDetailPage />) },
      { path: 'saldo', element: withSuspense(<WalletPage />) },
      { path: 'direcciones', element: withSuspense(<AddressesPage />) },
      { path: 'favoritos', element: withSuspense(<FavoritesPage />) },
      { path: 'bowls-guardados', element: withSuspense(<SavedBowlsPage />) },
      { path: 'opiniones', element: withSuspense(<ReviewsPage />) },
    ],
  },
  {
    // El panel es UNO SOLO. Cada pantalla exige su permiso: el nutricionista y el
    // superadmin entran aqui mismo y ven cosas distintas (mismo edificio, otras llaves).
    path: ROUTES.admin,
    element: (
      /* Lista blanca DERIVADA de la tabla de navegacion: la union de los permisos
       * de las 17 pantallas. Escrita a mano se quedo en 17 permisos y omitia ocho
       * reales (audit.read, inventory.manage, order.cancel, user.manage...), asi
       * que un rol creado desde el propio panel con uno solo de ellos no podia
       * entrar a trabajar. */
      <ProtectedRoute anyPermission={ADMIN_ROOT_PERMISSIONS}>
        <AdminLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      // El recibidor manda a cada rol a su primera pantalla accesible.
      { index: true, element: withSuspense(<PanelHome />) },
      {
        path: 'resumen',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminDashboard)}>
            {withSuspense(<AdminDashboardPage />)}
          </ProtectedRoute>
        ),
      },
      {
        // Tambien con payment.read / payment.refund: el pago y su devolucion se
        // atienden desde la ficha del pedido, no en una pantalla aparte.
        path: 'pedidos',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminOrders)}>
            {withSuspense(<AdminOrdersPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'caja',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminCash)}>
            {withSuspense(<CashPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'salon',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminDining)}>
            {withSuspense(<DiningPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'cocina',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminKitchen)}>
            {withSuspense(<KitchenPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'reparto',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminDelivery)}>
            {withSuspense(<DeliveryPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventario',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminInventory)}>
            {withSuspense(<InventoryPage />)}
          </ProtectedRoute>
        ),
      },
      {
        // El nutricionista entra con nutrition.read; el gestor, con catalog.product.read.
        path: 'catalogo',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminCatalog)}>
            {withSuspense(<CatalogPage />)}
          </ProtectedRoute>
        ),
      },
      {
        /* Abierto tambien a nutrition.write / allergen.write: los alergenos y los
         * macros de CADA ingrediente solo se editan aqui, y el nutricionista —el
         * unico responsable de ellos— no tiene catalog.customization.write, asi
         * que quedaba fuera. Que campos ve dentro lo decide la propia pantalla. */
        path: 'constructor',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminBuilder)}>
            {withSuspense(<BuilderAdminPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'medios',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminMedia)}>
            {withSuspense(<MediaLibraryPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'cupones',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminCoupons)}>
            {withSuspense(<CouponsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        // El backend ya abrio GET /admin/plans a plan.read: Soporte tenia el
        // permiso y era este router el que le cerraba la puerta.
        path: 'planes',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminPlans)}>
            {withSuspense(<PlansAdminPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'cobertura',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminCoverage)}>
            {withSuspense(<AdminCoveragePage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'usuarios',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminUsers)}>
            {withSuspense(<UsersPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'roles',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminRoles)}>
            {withSuspense(<RolesPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'reclamaciones',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminComplaints)}>
            {withSuspense(<AdminComplaintsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        // La pantalla que justifica al Auditor: "solo lectura de todo, incluida la
        // bitacora". El endpoint existia con filtros y paginacion desde el principio
        // y `audit.read` no tenia donde ejercerse.
        path: 'bitacora',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminAudit)}>
            {withSuspense(<AuditLogPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'configuracion-negocio',
        element: (
          <ProtectedRoute superAdminOnly>
            {withSuspense(<BusinessSettingsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'sistema-diseno',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminDesign)}>
            {withSuspense(<DesignSystemPage />)}
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
