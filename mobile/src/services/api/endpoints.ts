/**
 * Fuente unica de las rutas del API (prefijo /api/v1, ya incluido en env.apiUrl).
 * Ninguna pantalla escribe una ruta a mano: si el backend la mueve, se cambia aqui.
 */
export const ENDPOINTS = {
  health: '/health',

  auth: {
    login: '/auth/login',
    register: '/auth/register',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
  },

  settings: {
    public: '/settings/public',
  },

  locations: {
    cities: '/locations/cities',
    branches: '/locations/branches',
    departments: '/locations/departments',
    provinces: '/locations/provinces',
    /** Distritos geograficos del INEI (los del selector de direccion). */
    districts: '/locations/geographic-districts',
    /** Distritos operativos: solo aquellos donde repartimos. */
    operativeDistricts: '/locations/districts',
    suggestions: '/locations/address-suggestions',
    resolve: '/locations/resolve-address',
    reverse: '/locations/reverse-address',
    coverage: '/locations/coverage',
    slots: '/locations/slots',
  },

  catalog: {
    categories: '/catalog/categories',
    allergens: '/catalog/allergens',
    dietaryTags: '/catalog/dietary-tags',
    products: '/catalog/products',
    product: (slug: string) => `/catalog/products/${encodeURIComponent(slug)}`,
  },

  orders: {
    root: '/orders',
    detail: (orderNumber: string) => `/orders/${encodeURIComponent(orderNumber)}`,
    cancel: (orderNumber: string) => `/orders/${encodeURIComponent(orderNumber)}/cancel`,
    /**
     * Reintentar el cobro de un pedido que quedo en PENDING_PAYMENT (la sesion
     * de la pasarela caduco o el cliente cerro el navegador). Devuelve un
     * checkoutUrl vigente, sin recotizar ni tocar lo ya reservado.
     */
    paymentRetry: (orderNumber: string) =>
      `/orders/${encodeURIComponent(orderNumber)}/payment/retry`,
  },

  account: {
    profile: '/account/profile',
    profileAvatar: '/account/profile/avatar',
    password: '/account/password',
    notifications: '/account/notifications',
    notificationsRead: '/account/notifications/read',
    foodPreferences: '/account/food-preferences',
    purchaseContext: '/account/purchase-context',
    addresses: '/account/addresses',
    address: (id: number) => `/account/addresses/${id}`,
    savedBowls: '/account/saved-bowls',
    savedBowl: (id: number) => `/account/saved-bowls/${id}`,
    availabilityAlerts: '/account/availability-alerts',
    mobileDevices: '/account/mobile-devices',
    /** Baja de la cuenta a peticion del titular; ambas tiendas la exigen. */
    delete: '/account',
  },

  customizations: {
    config: (productId: number) => `/customizations/${productId}`,
    quote: '/customizations/quote',
    events: '/customizations/events',
  },

  checkout: {
    quote: '/checkout/quote',
    place: '/checkout/place',
  },

  plans: {
    root: '/plans',
    purchase: '/plans/purchase',
    wallet: '/plans/wallet',
    transactions: '/plans/wallet/transactions',
  },

  dining: {
    table: (token: string) => `/operations/dining/qr/${encodeURIComponent(token)}`,
    order: (token: string) => `/operations/dining/qr/${encodeURIComponent(token)}/orders`,
  },

  engagement: {
    events: '/engagement/events',
    recommendations: '/engagement/recommendations',
    favorites: '/engagement/favorites',
    favorite: (productId: number) => `/engagement/favorites/${productId}`,
    reviews: (productId: number) => `/engagement/products/${productId}/reviews`,
    pendingReviews: '/engagement/reviews/pending',
    createReview: '/engagement/reviews',
    updateReview: (id: number) => `/engagement/reviews/${id}`,
    newsletter: '/engagement/newsletter',
  },

  complaints: {
    root: '/complaints',
    track: '/complaints/track',
  },

  media: {
    file: (filename: string) => `/media/files/${encodeURIComponent(filename)}`,
  },
} as const;
