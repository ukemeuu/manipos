/**
 * ManiPOS Centralized Feature Visibility Architecture
 * 
 * Defines feature readiness states across public marketing (manipos.com)
 * and internal application modules.
 * 
 * States:
 * - LIVE: Production-ready and actively available for store operations.
 * - COMING_SOON: Under active internal development; displayed publicly with "Coming Soon" badge.
 * - HIDDEN: Omitted from public marketing entirely.
 */

export const FEATURE_STATUS = {
  LIVE: 'live',
  COMING_SOON: 'coming_soon',
  HIDDEN: 'hidden'
};

export const FEATURES = {
  posRegister: {
    id: 'posRegister',
    title: 'Live POS Register & Offline Sync',
    description: 'Lightning-fast cloud POS terminal with zero-downtime offline order queuing, thermal printing & multi-cashier PIN auth.',
    status: FEATURE_STATUS.LIVE,
    category: 'Core Operations'
  },
  menuManagement: {
    id: 'menuManagement',
    title: 'Multi-Brand Menu & Modifiers',
    description: 'Catalog controls, item modifier groups, channel pricing & real-time stock toggles across single or multi-concept brands.',
    status: FEATURE_STATUS.LIVE,
    category: 'Catalog'
  },
  staffAccess: {
    id: 'staffAccess',
    title: 'Staff Roles & Security PINs',
    description: 'Granular cashier vs manager RBAC permissions, encrypted security PINs & immutable audit logs.',
    status: FEATURE_STATUS.LIVE,
    category: 'Staffing'
  },
  digitalMicrosite: {
    id: 'digitalMicrosite',
    title: 'QR Code Digital Menu',
    description: 'Instant customer-facing mobile menu microsite for table QR ordering & direct WhatsApp checkout.',
    status: FEATURE_STATUS.LIVE,
    category: 'Guest Experience'
  },
  inventoryTracking: {
    id: 'inventoryTracking',
    title: 'Inventory & Recipe Stock Control',
    description: 'Ingredient recipe batch deduction, automated supplier purchase orders & low-stock alerts.',
    status: FEATURE_STATUS.COMING_SOON,
    category: 'Inventory'
  },
  advancedAnalytics: {
    id: 'advancedAnalytics',
    title: 'AI Sales Analytics & Demand Forecasting',
    description: 'Predictive revenue forecasting, peak-hour sales heatmaps & automated daily Z-report digests.',
    status: FEATURE_STATUS.COMING_SOON,
    category: 'Analytics'
  },
  tableReservations: {
    id: 'tableReservations',
    title: 'Floorplan & Dine-In Reservations',
    description: 'Interactive floorplan table management, advance reservation booking & guest waitlist queue.',
    status: FEATURE_STATUS.COMING_SOON,
    category: 'Floor Management'
  },
  kitchenDisplay: {
    id: 'kitchenDisplay',
    title: 'Kitchen Display System (KDS)',
    description: 'Real-time kitchen order tickets (KOT), cook timers, prep station routing & bump screen controls.',
    status: FEATURE_STATUS.COMING_SOON,
    category: 'Kitchen'
  }
};

/**
 * Helper utility to get features filtered by status
 */
export function getPublicFeatures() {
  return Object.values(FEATURES).filter(f => f.status !== FEATURE_STATUS.HIDDEN);
}

export function getLiveFeatures() {
  return Object.values(FEATURES).filter(f => f.status === FEATURE_STATUS.LIVE);
}

export function getComingSoonFeatures() {
  return Object.values(FEATURES).filter(f => f.status === FEATURE_STATUS.COMING_SOON);
}
