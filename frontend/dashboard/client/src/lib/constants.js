export const PRICE_MODE = {
    AUTO: 'AUTO',
    MANUAL: 'MANUAL',
};

export const ROUTES = {
    OVERVIEW: '/',
    PRODUCTS: '/products',
    HISTORY: '/history',
    ORDERS: '/orders',
    USDERS: '/users',
};

export const THEME = {
    LIGHT: 'light',
    DARK: 'dark',
};

export const API_ENDPOINTS = {
    PRODUCTS: '/api/products',
    COMPANY_PRODUCTS: '/api/company/products',
    COMPARE: '/api/compare',
    HISTORY: '/api/history/compare',
    PRICING: (id) => `/api/company/products/${id}/pricing`,
};

export const NOTIFICATION_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
};