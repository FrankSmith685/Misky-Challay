/** Fuente unica de las rutas del API (seccion 16.3 del analisis funcional). */
export const ENDPOINTS = {
  health: '/health',

  auth: {
    register: '/auth/register',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
  },

  locations: {
    cities: '/locations/cities',
    departments: '/locations/departments',
    provinces: '/locations/provinces',
    geographicDistricts: '/locations/geographic-districts',
    districts: '/locations/districts',
    branches: '/locations/branches',
    slots: '/locations/slots',
    coverage: '/locations/coverage',
  },

  account: {
    profile: '/account/profile',
    profileAvatar: '/account/profile/avatar',
    password: '/account/password',
    foodPreferences: '/account/food-preferences',
    notifications: '/account/notifications',
    notificationsRead: '/account/notifications/read',
    availabilityAlerts: '/account/availability-alerts',
    addresses: '/account/addresses',
    address: (id: number | string) => `/account/addresses/${id}`,
    purchaseContext: '/account/purchase-context',
    /** Baja de la cuenta a peticion del titular; ambas tiendas la exigen. */
    delete: '/account',
  },

  catalog: {
    categories: '/catalog/categories',
    allergens: '/catalog/allergens',
    dietaryTags: '/catalog/dietary-tags',
    products: '/catalog/products',
    product: (slug: string) => `/catalog/products/${slug}`,
  },

  customizations: {
    config: (productId: number | string) => `/customizations/${productId}`,
    quote: '/customizations/quote',
  },

  cart: {
    root: '/cart',
    items: '/cart/items',
    item: (id: number | string) => `/cart/items/${id}`,
    coupon: '/cart/coupon',
  },

  checkout: {
    quote: '/checkout/quote',
    place: '/checkout/place',
  },

  orders: {
    root: '/orders',
    detail: (id: number | string) => `/orders/${id}`,
    cancel: (id: number | string) => `/orders/${id}/cancel`,
    repeat: (id: number | string) => `/orders/${id}/repeat`,
  },

  plans: {
    root: '/plans',
    purchase: '/plans/purchase',
    wallet: '/plans/wallet',
    transactions: '/plans/wallet/transactions',
    expire: '/plans/expire',
  },

  payments: {
    /** Solo desarrollo: simulador de pago mientras no haya claves de Stripe. */
    simulate: '/payments/dev/simulate',
  },

  settings: {
    public: '/settings/public',
    theme: '/settings/theme',
    themeAdmin: '/settings/theme/admin',
    themeDraft: '/settings/theme/draft',
    themePublish: '/settings/theme/publish',
    themeReset: '/settings/theme/reset',
    themeRevisions: '/settings/theme/revisions',
    themeRollback: (revisionId: number | string) => `/settings/theme/rollback/${revisionId}`,
    business: '/settings/business',
    localPayments: '/settings/local-payments',
    localPaymentsCheck: '/settings/local-payments/check',
    receipts: '/settings/receipts',
    communication: '/settings/communication',
    communicationTest: '/settings/communication/test',
    notificationHistory: '/settings/notification-history',
    integrations: '/settings/integrations',
    integrationsCheck: '/settings/integrations/check',
  },

  engagement: {
    reviews: (productId: number | string) => `/engagement/products/${productId}/reviews`,
    pendingReviews: '/engagement/reviews/pending',
    myReviews: '/engagement/reviews/mine',
    createReview: '/engagement/reviews',
    updateReview: (reviewId: number | string) => `/engagement/reviews/${reviewId}`,
  },

  complaints: {
    root: '/complaints',
    track: '/complaints/track',
    summary: '/complaints/summary',
    detail: (id: number | string) => `/complaints/${id}`,
    respond: (id: number | string) => `/complaints/${id}/respond`,
  },
} as const;
