import { lazy as lazyExperience } from 'react';
const ExperiencePage = lazyExperience(() => import('@features/experiences/ExperiencePage'));
const ExperienceStudioPage = lazyExperience(() => import('@features/experiences/ExperienceStudioPage'));
const RenzoArtifactPage = lazyExperience(() => import('@features/experiences/RenzoArtifactPage'));
const RenzoArtifactQrPage = lazyExperience(() => import('@features/experiences/RenzoArtifactQrPage'));
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
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
const HowToOrderPage = lazy(() => import('@features/home/pages/HowToOrderPage'));
const HomeContentPage = lazy(() => import('@features/admin/pages/HomeContentPage'));
const MenuPage = lazy(() => import('@features/catalog/pages/MenuPage'));
const BusinessPage = lazy(() => import('@features/cakes/pages/BusinessPage'));
const CustomCakeEntryPage = lazy(() => import('@features/cakes/pages/CustomCakeEntryPage'));
const SpecialCakeRequestEntryPage = lazy(() => import('@features/cakes/pages/SpecialCakeRequestEntryPage'));
const CakePage = lazy(() => import('@features/cakes/pages/CakePage'));
const CakeSharedPreviewPage = lazy(() => import('@features/cakes/pages/CakeSharedPreviewPage'));
const ExperienceCampaignPage = lazy(() => import('@features/experiences/ExperienceCampaignPage'));
const DesignRequestsPage = lazy(() => import('@features/cakes/pages/AccountDesignRequestsPage'));
const AdminCakesPage = lazy(() => import('@features/cakes/pages/AdminCakesPage'));
const CakeThemesAdminPage = lazy(() => import('@features/cakes/pages/CakeThemesAdminPage'));
const BuilderPage = lazy(() => import('@features/builder/pages/BuilderPage'));
const PlansPage = lazy(() => import('@features/subscriptions/SubscriptionPlansPage'));
const AccountSubscriptionsPage = lazy(() => import('@features/subscriptions/AccountSubscriptionsPage'));
const CoveragePage = lazy(() => import('@features/geo/pages/CoveragePage'));
const DineInQrPage = lazy(() => import('@features/dining/pages/DineInQrPage'));
const GiftPage = lazy(() => import('@features/orders/pages/GiftPage'));
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
const DirectPaymentsPage = lazy(() => import('@features/admin/pages/DirectPaymentsPage'));
const CommunicationsPage = lazy(() => import('@features/admin/pages/CommunicationsPage'));
const PosPage = lazy(() => import('@features/admin/pages/PosPage'));
const DiningPage = lazy(() => import('@features/admin/pages/DiningPage'));
const KitchenPage = lazy(() => import('@features/admin/pages/KitchenPage'));
const DeliveryPage = lazy(() => import('@features/admin/pages/DeliveryPage'));
const InventoryPage = lazy(() => import('@features/admin/pages/InventoryPage'));
const ProcurementPage = lazy(() => import('@features/admin/pages/ProcurementPage'));
const CatalogPage = lazy(() => import('@features/admin/pages/CatalogPage'));
const BuilderAdminPage = lazy(() => import('@features/admin/pages/BuilderAdminPage'));
const MediaLibraryPage = lazy(() => import('@features/admin/pages/MediaLibraryPage'));
const CouponsPage = lazy(() => import('@features/admin/pages/CouponsPage'));
const PlansAdminPage = lazy(() => import('@features/admin/pages/PlansAdminPage'));
const SubscriptionsAdminPage = lazy(() => import('@features/subscriptions/SubscriptionsAdminPage'));
const AdminCoveragePage = lazy(() => import('@features/admin/pages/CoveragePage'));
const UsersPage = lazy(() => import('@features/admin/pages/UsersPage'));
const CustomersPage = lazy(() => import('@features/admin/pages/CustomersPage'));
const TeamsPage = lazy(() => import('@features/admin/pages/TeamsPage'));
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
const NotificationsPage = lazy(() => import('@features/account/pages/NotificationsPage'));
const NotFoundPage = lazy(() => import('@features/home/pages/NotFoundPage'));

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>{element}</Suspense>
);

/**
 * Permisos de una pantalla del panel: se leen de la MISMA fila de
 * `constants/adminNav.ts` que pinta su entrada en el menu.
 *
 * Cuando el router mantenia su propia lista, las dos divergian y aparecia el
 * rebote: el usuario veia la entrada, entraba y salia expulsado. Aqui ya no
 * hay dos verdades que sincronizar.
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

// Las sesiones de pago abiertas antes de corregir la URL base conservan un
// retorno con "//". Recuperarlas antes de crear el router evita mostrar un 404
// después del cobro y preserva el número de pedido en la query.
const legacyPaymentPath = window.location.pathname.replace(/^\/{2,}/, '/');
if (legacyPaymentPath !== window.location.pathname && new Set([
  ROUTES.checkoutSuccess, '/checkout/movil', '/planes/movil', '/cuenta/saldo', '/planes',
]).has(legacyPaymentPath)) {
  window.history.replaceState(window.history.state, '', `${legacyPaymentPath}${window.location.search}${window.location.hash}`);
}

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    // Los tres nodos raiz lo declaran: una excepcion de render no puede dejar al
    // cliente en la pantalla cruda de react-router, sin marca y sin salida.
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: ROUTES.home, element: withSuspense(<HomePage />) },
      { path: ROUTES.howToOrder, element: withSuspense(<HowToOrderPage />) },
      { path: ROUTES.menu, element: withSuspense(<MenuPage />) },
      { path: '/experiencias/renzo', element: withSuspense(<RenzoArtifactPage />) },
      { path: '/experiencias/renzo-qr', element: withSuspense(<RenzoArtifactQrPage />) },
      { path: '/experiencias/plantillas/:slug', element: withSuspense(<RenzoArtifactPage />) },
      { path: '/experiencias/plantillas/:slug/qr', element: withSuspense(<RenzoArtifactQrPage />) },
      { path: '/experiencias/:token', element: withSuspense(<ExperiencePage />) },
      { path: ROUTES.business, element: withSuspense(<BusinessPage />) },
      { path: ROUTES.customCake, element: withSuspense(<CustomCakeEntryPage />) },
      { path: ROUTES.specialCake, element: withSuspense(<SpecialCakeRequestEntryPage />) },
      { path: ROUTES.product(), element: withSuspense(<CakePage />) },
      { path: ROUTES.cake(), element: withSuspense(<CakePage />) },
      { path: ROUTES.cakePreview(), element: withSuspense(<CakeSharedPreviewPage />) },
      { path: ROUTES.cakeAr, element: withSuspense(<ExperienceCampaignPage />) },
      { path: ROUTES.legacyDesignRequests, element: <Navigate to={ROUTES.designRequests} replace /> },
      { path: ROUTES.builder, element: withSuspense(<BuilderPage />) },
      { path: ROUTES.plans, element: withSuspense(<PlansPage />) },
      { path: ROUTES.coverage, element: withSuspense(<CoveragePage />) },
      { path: ROUTES.diningTable(), element: withSuspense(<DineInQrPage />) },
      { path: '/regalos/:token', element: <GiftPage /> },
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
      /* El checkout se mantiene abierto para que un visitante pueda elegir destino,
       * horario y contacto. La sesión se solicita al confirmar el pago, justo antes
       * de crear el pedido, para conservar el carrito y el contexto de compra. */
      { path: ROUTES.checkout, element: withSuspense(<CheckoutPage />) },
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
      { path: 'notificaciones', element: withSuspense(<NotificationsPage />) },
      { path: 'perfil', element: withSuspense(<ProfilePage />) },
      { path: 'pedidos', element: withSuspense(<OrdersPage />) },
      { path: 'pedidos/:orderNumber', element: withSuspense(<OrderDetailPage />) },
      { path: 'saldo', element: withSuspense(<WalletPage />) },
      { path: 'suscripciones', element: withSuspense(<AccountSubscriptionsPage />) },
      { path: 'direcciones', element: withSuspense(<AddressesPage />) },
      { path: 'favoritos', element: withSuspense(<FavoritesPage />) },
      { path: 'bowls-guardados', element: withSuspense(<SavedBowlsPage />) },
      { path: 'opiniones', element: withSuspense(<ReviewsPage />) },
      { path: 'disenos', element: withSuspense(<DesignRequestsPage />) },
    ],
  },
  {
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
      { path: 'pagos-directos', element: <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminDirectPayments)}>{withSuspense(<DirectPaymentsPage />)}</ProtectedRoute> },
      { path: 'comunicaciones', element: <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminCommunications)}>{withSuspense(<CommunicationsPage />)}</ProtectedRoute> },
      {
        path: 'punto-venta',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminPos)}>
            {withSuspense(<PosPage />)}
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
        path: 'tortas',
        element: <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminCakes)}>{withSuspense(<AdminCakesPage />)}</ProtectedRoute>,
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
        path: 'compras',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminProcurement)}>
            {withSuspense(<ProcurementPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalogo',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminCatalog)}>
            {withSuspense(<CatalogPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalogo/disenos',
        element: <Navigate to={ROUTES.adminCakeThemes} replace />,
      },
      {
        path: 'empresas',
        element: <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminCakeThemes)}>{withSuspense(<CakeThemesAdminPage />)}</ProtectedRoute>,
      },
      {
        path: 'experiencias-qr',
        element: <ProtectedRoute anyPermission={navAnyOf('/admin/experiencias-qr')}>{withSuspense(<ExperienceStudioPage />)}</ProtectedRoute>,
      },
      {
        path: 'constructor',
        // El catálogo administra los modelos; el constructor mantiene las opciones.
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
            {withSuspense(<SubscriptionsAdminPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'recargas',
        element: <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminLegacyPlans)}>{withSuspense(<PlansAdminPage />)}</ProtectedRoute>,
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
        path: 'clientes',
        element: (
          <ProtectedRoute anyPermission={navAnyOf(ROUTES.adminCustomers)}>
            {withSuspense(<CustomersPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'equipos',
        element: (
          <ProtectedRoute superAdminOnly>
            {withSuspense(<TeamsPage />)}
          </ProtectedRoute>
        ),
      },
      {
        path: 'roles',
        element: (
          <ProtectedRoute superAdminOnly>
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
        path: 'contenido-inicio',
        element: <ProtectedRoute superAdminOnly>{withSuspense(<HomeContentPage />)}</ProtectedRoute>,
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
          <ProtectedRoute superAdminOnly>
            {withSuspense(<DesignSystemPage />)}
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
