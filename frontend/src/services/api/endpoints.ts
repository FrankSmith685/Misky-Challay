/** Fuente unica de las rutas del API (seccion 16.3 del analisis funcional). */
export const ENDPOINTS = {
  health: '/health',

  auth: {
    register: '/auth/register',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
  },

  locations: {
    cities: '/locations/cities',
    districts: '/locations/districts',
    branches: '/locations/branches',
    slots: '/locations/slots',
    coverage: '/locations/coverage',
  },

  account: {
    profile: '/account/profile',
    password: '/account/password',
    foodPreferences: '/account/food-preferences',
    notifications: '/account/notifications',
    addresses: '/account/addresses',
    address: (id: number | string) => `/account/addresses/${id}`,
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
} as const;
