import chopNowNowMenu from './chopnownow_menu.json';

/**
 * Static tenant registry.
 *
 * This is the last-resort fallback used when the database is unreachable or a
 * tenant has just been onboarded and its remote branding has not been saved yet.
 * Runtime values from `restaurants` + `restaurant_settings` always win.
 */
export const TENANT_REGISTRY = {
  chopnownow: {
    slug: 'chopnownow',
    name: 'Chop Now Now',
    legalName: 'Chop Now Now Nigerian Restaurant',
    tagline: 'Naija flavour, now now.',
    description:
      'Authentic Nigerian food in Nairobi — smoky party jollof, egusi, pounded yam, suya, pepper soup and small chops, cooked fresh and delivered fast.',
    cuisine: 'Nigerian',
    businessType: 'restaurant',
    currency: 'KES',
    currencySymbol: 'KSh',
    locale: 'en-KE',
    timezone: 'Africa/Nairobi',
    country: 'Kenya',
    city: 'Nairobi',
    address: 'Kilimani, Nairobi',
    phone: '+254700000000',
    whatsapp: '254700000000',
    email: 'hello@chopnownow.com',
    // Replace with the restaurant's real M-Pesa merchant details before launch.
    paybill: '',
    account: '',
    deliveryFee: 200,
    freeDeliveryOver: 3500,
    minOrder: 800,
    etaMinutes: '35–50 min',
    rating: 4.8,
    reviewCount: 126,
    priceRange: 'KES 250 – 1,350',
    logo: '/chopnownow-logo.svg',
    cover: '/manipos_african_hero.png',
    colors: {
      primary: '#0B6B3A',
      primaryDark: '#064D29',
      accent: '#F97316',
      accentSoft: '#FFF3E8',
    },
    socials: {
      instagram: 'https://instagram.com/chopnownow',
      facebook: 'https://facebook.com/chopnownow',
      tiktok: 'https://tiktok.com/@chopnownow',
    },
    hours: [
      { day: 'Mon – Thu', open: '10:00', close: '22:00' },
      { day: 'Fri – Sat', open: '10:00', close: '23:30' },
      { day: 'Sunday', open: '12:00', close: '21:00' },
    ],
    features: ['delivery', 'takeaway', 'dine-in', 'online-ordering', 'loyalty'],
    menu: chopNowNowMenu,
  },

  potofjollof: {
    slug: 'potofjollof',
    name: 'Pot of Jollof',
    legalName: 'Pot of Jollof Kitchen',
    tagline: 'Nairobi’s home of smokey party jollof.',
    description:
      'Authentic Nigerian cuisine in Nairobi — party jollof rice, egusi, pounded yam, goat meat pepper soup and suya.',
    cuisine: 'Nigerian',
    businessType: 'restaurant',
    currency: 'KES',
    currencySymbol: 'KSh',
    locale: 'en-KE',
    timezone: 'Africa/Nairobi',
    country: 'Kenya',
    city: 'Nairobi',
    address: '1st floor, Maralal Oasis, Hurlingham, Nairobi',
    phone: '0795384140',
    whatsapp: '254795384140',
    email: 'potofjollofke@gmail.com',
    paybill: '542542',
    account: '992422',
    deliveryFee: 200,
    freeDeliveryOver: 3500,
    minOrder: 800,
    etaMinutes: '30–45 min',
    rating: 4.9,
    reviewCount: 320,
    priceRange: 'KES 250 – 1,500',
    logo: '/jollof_logo.png',
    cover: '/manipos_african_hero.png',
    colors: {
      primary: '#B45309',
      primaryDark: '#78350F',
      accent: '#F59E0B',
      accentSoft: '#FFFBEB',
    },
    socials: {
      instagram: 'https://instagram.com/potofjollof',
      facebook: 'https://facebook.com/potofjollof',
    },
    hours: [
      { day: 'Mon – Sun', open: '10:00', close: '22:00' },
    ],
    features: ['delivery', 'takeaway', 'dine-in', 'online-ordering', 'loyalty'],
    menu: [],
  },
};

export function getRegistryTenant(slug) {
  if (!slug) return null;
  return TENANT_REGISTRY[String(slug).toLowerCase().trim()] || null;
}

export function getRegistryMenu(slug) {
  const tenant = getRegistryTenant(slug);
  return tenant?.menu || [];
}

export function getRegistrySlugs() {
  return Object.keys(TENANT_REGISTRY);
}
