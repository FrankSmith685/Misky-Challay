/** Rutas de la aplicacion. Se usan en el router y en los links (nunca strings sueltos). */
export const ROUTES = {
  home: '/',
  menu: '/menu',
  product: (slug = ':slug') => `/menu/${slug}`,
  builder: '/arma-tu-bowl',
  plans: '/planes',
  coverage: '/cobertura',
  branches: '/locales',
  diningTable: (token = ':token') => `/mesa/${token}`,
  faq: '/preguntas-frecuentes',
  complaints: '/libro-de-reclamaciones',
  privacy: '/privacidad',
  terms: '/terminos',
  cookies: '/cookies',
  /**
   * Publica a proposito: Google Play y App Store exigen una URL donde se pueda
   * pedir la baja de la cuenta sin instalar la aplicacion.
   */
  deleteAccount: '/eliminar-cuenta',

  login: '/ingresar',
  register: '/crear-cuenta',
  forgotPassword: '/recuperar-clave',
  resetPassword: '/restablecer-clave',
  mobileResetPassword: '/restablecer-clave/movil',

  cart: '/carrito',
  checkout: '/checkout',
  checkoutSuccess: '/checkout/confirmacion',
  /** Solo desarrollo: reemplaza a la pagina de Stripe mientras no haya claves. */
  paymentSimulator: '/checkout/simulador',

  account: '/cuenta',
  accountOrders: '/cuenta/pedidos',
  accountOrderDetail: (id: string | number = ':id') => `/cuenta/pedidos/${id}`,
  accountAddresses: '/cuenta/direcciones',
  accountWallet: '/cuenta/saldo',
  accountFavorites: '/cuenta/favoritos',
  accountSavedBowls: '/cuenta/bowls-guardados',
  accountReviews: '/cuenta/opiniones',
  accountProfile: '/cuenta/perfil',

  admin: '/admin',
  adminDashboard: '/admin/resumen',
  adminOrders: '/admin/pedidos',
  adminCash: '/admin/caja',
  adminDining: '/admin/salon',
  adminKitchen: '/admin/cocina',
  adminDelivery: '/admin/reparto',
  adminInventory: '/admin/inventario',
  adminCatalog: '/admin/catalogo',
  adminBuilder: '/admin/constructor',
  adminMedia: '/admin/medios',
  adminCoupons: '/admin/cupones',
  adminPlans: '/admin/planes',
  adminCoverage: '/admin/cobertura',
  adminUsers: '/admin/usuarios',
  adminRoles: '/admin/roles',
  adminComplaints: '/admin/reclamaciones',
  /** Bitacora de cambios sensibles. Es la pantalla que da destino a `audit.read`. */
  adminAudit: '/admin/bitacora',
  adminBusiness: '/admin/configuracion-negocio',
  adminDesign: '/admin/sistema-diseno',
} as const;
