import { supabase } from './supabase';

function normToken(val) {
  return String(val || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Compute discount & delivery savings from an Orda 5-rule promotion record.
 * Supports:
 * - cart_percent (`Percentage Discount On Cart (Subtotal)`)
 * - cart_fixed (`Fixed Discount On Cart`)
 * - delivery_percent (`Percentage Discount On Delivery`)
 * - grand_total_percent (`Percentage Discount On Cart Total (Grand Total)`)
 * - loyalty (`Loyalty Program`)
 */
export function evaluatePromotionDiscount({
  promo,
  subtotal = 0,
  deliveryFee = 0,
  grandTotalBeforePromo = 0,
  diningOption = 'Pickup',
  paymentMethod = 'Cash',
  customerOrderCount = 0,
}) {
  if (!promo) return { valid: false, reason: 'Invalid promo code.', discountAmount: 0, deliveryDiscount: 0 };
  if (promo.is_active === false) {
    return { valid: false, reason: 'This promotion is inactive.', discountAmount: 0, deliveryDiscount: 0 };
  }

  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
    return { valid: false, reason: 'This promotion has not started yet.', discountAmount: 0, deliveryDiscount: 0 };
  }
  if ((promo.has_expiry || promo.expires_at) && promo.expires_at && new Date(promo.expires_at).getTime() < now) {
    return { valid: false, reason: 'This promotion has expired.', discountAmount: 0, deliveryDiscount: 0 };
  }
  if (Number(promo.max_total_uses || 0) > 0 && Number(promo.current_uses || 0) >= Number(promo.max_total_uses)) {
    return { valid: false, reason: 'Maximum redemptions reached for this promotion.', discountAmount: 0, deliveryDiscount: 0 };
  }
  if (Number(promo.usage_per_customer || 0) > 0 && customerOrderCount >= Number(promo.usage_per_customer)) {
    return { valid: false, reason: 'Customer redemption limit reached for this promotion.', discountAmount: 0, deliveryDiscount: 0 };
  }

  const minOrder = Number(promo.min_order_amount || 0);
  if (minOrder > 0 && subtotal < minOrder) {
    return {
      valid: false,
      reason: `Minimum order of KES ${minOrder.toLocaleString()} required.`,
      discountAmount: 0,
      deliveryDiscount: 0,
    };
  }

  const allowedFulfilments = Array.isArray(promo.fulfilment_types) ? promo.fulfilment_types : [];
  if (allowedFulfilments.length > 0) {
    const orderNorm = normToken(diningOption === 'Takeaway' ? 'Pickup' : diningOption);
    if (!allowedFulfilments.some((f) => normToken(f) === orderNorm)) {
      return {
        valid: false,
        reason: `Valid only for ${allowedFulfilments.join(', ')} orders.`,
        discountAmount: 0,
        deliveryDiscount: 0,
      };
    }
  }

  const allowedPayments = Array.isArray(promo.payment_options) ? promo.payment_options : [];
  if (allowedPayments.length > 0) {
    const payNorm = normToken(paymentMethod);
    if (!allowedPayments.some((p) => normToken(p) === payNorm)) {
      return {
        valid: false,
        reason: `Valid only for ${allowedPayments.join(', ')} payment.`,
        discountAmount: 0,
        deliveryDiscount: 0,
      };
    }
  }

  const rule = promo.promo_rule_type || (promo.type === 'fixed' ? 'cart_fixed' : 'cart_percent');
  const rawValue = Number(promo.value ?? promo.discount_percent ?? promo.discount_amount ?? promo.discount_value ?? 0);
  const maxCap = Number(promo.max_discount_value || 0);

  let discountAmount = 0;
  let deliveryDiscount = 0;

  if (rule === 'cart_fixed') {
    discountAmount = Math.min(subtotal, Math.max(0, Math.round(rawValue)));
  } else if (rule === 'delivery_percent') {
    deliveryDiscount = Math.round((Math.max(0, deliveryFee) * rawValue) / 100);
    if (maxCap > 0) deliveryDiscount = Math.min(deliveryDiscount, maxCap);
    deliveryDiscount = Math.min(deliveryDiscount, deliveryFee);
  } else if (rule === 'grand_total_percent') {
    const base = grandTotalBeforePromo > 0 ? grandTotalBeforePromo : subtotal + deliveryFee;
    discountAmount = Math.round((base * rawValue) / 100);
    if (maxCap > 0) discountAmount = Math.min(discountAmount, maxCap);
    discountAmount = Math.min(discountAmount, base);
  } else {
    // cart_percent (or default percentage)
    discountAmount = Math.round((subtotal * rawValue) / 100);
    if (maxCap > 0) discountAmount = Math.min(discountAmount, maxCap);
    discountAmount = Math.min(discountAmount, subtotal);
  }

  return {
    valid: true,
    reason: '',
    rule,
    discountAmount,
    deliveryDiscount,
    totalSavings: discountAmount + deliveryDiscount,
  };
}

/**
 * Ray-casting point-in-polygon check for Orda Geo-Delivery Polygon Zones.
 * Expects `polygon` array of `{ lat, lng }` or `[lng, lat]` pairs.
 */
export function isPointInPolygon(lat, lng, polygon = []) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }
  const pts = polygon.map((p) =>
    Array.isArray(p) ? { lat: Number(p[1]), lng: Number(p[0]) } : { lat: Number(p.lat), lng: Number(p.lng) }
  );

  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lng;
    const yi = pts[i].lat;
    const xj = pts[j].lng;
    const yj = pts[j].lat;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Match a delivery point against active delivery_zones polygons first, then distance fee brackets.
 */
export function matchDeliveryZoneOrBracket({
  lat = null,
  lng = null,
  distanceKm = null,
  zones = [],
  brackets = [],
  fallbackFee = 0,
}) {
  if (Number.isFinite(lat) && Number.isFinite(lng) && Array.isArray(zones)) {
    const zone = zones.find(
      (z) => z.is_active !== false && isPointInPolygon(lat, lng, z.polygon_geojson || [])
    );
    if (zone) {
      return {
        matchedType: 'polygon',
        zoneId: zone.id,
        zoneCaption: zone.caption,
        fee: Number(zone.delivery_fee || 0),
      };
    }
  }

  if (Number.isFinite(distanceKm) && Array.isArray(brackets) && brackets.length > 0) {
    const sorted = [...brackets].sort((a, b) => Number(a.max_km || 999) - Number(b.max_km || 999));
    const bracket = sorted.find(
      (b) => distanceKm >= Number(b.min_km || 0) && distanceKm <= Number(b.max_km || 999)
    );
    if (bracket) {
      return {
        matchedType: 'bracket',
        zoneId: null,
        zoneCaption: `${bracket.min_km}–${bracket.max_km} km`,
        fee: Number(bracket.fee || 0),
      };
    }
  }

  return {
    matchedType: 'fallback',
    zoneId: null,
    zoneCaption: '',
    fee: Number(fallbackFee || 0),
  };
}

/**
 * Fetch active delivery zones safely (returns [] if Wave 3 SQL not yet applied).
 */
export async function fetchDeliveryZones(restaurantId) {
  if (!restaurantId) return [];
  try {
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true);
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * Fetch active loyalty programs safely and calculate points earned for a settled order.
 */
export async function awardLoyaltyPointsForOrder({
  restaurantId,
  guestId,
  orderId,
  orderTotal = 0,
  diningOption = 'Pickup',
  paymentMethod = 'Cash',
}) {
  if (!restaurantId || !guestId || !orderId || orderTotal <= 0) return 0;
  try {
    const { data: programs, error } = await supabase
      .from('loyalty_programs')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true);
    if (error || !Array.isArray(programs) || programs.length === 0) return 0;

    const now = Date.now();
    const orderNorm = normToken(diningOption === 'Takeaway' ? 'Pickup' : diningOption);
    const payNorm = normToken(paymentMethod);

    const eligible = programs.find((p) => {
      if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
      if ((p.has_expiry || p.expires_at) && p.expires_at && new Date(p.expires_at).getTime() < now) return false;
      if (Number(p.min_order_value || 0) > 0 && orderTotal < Number(p.min_order_value)) return false;
      const fList = Array.isArray(p.fulfilment_types) ? p.fulfilment_types : [];
      if (fList.length > 0 && !fList.some((f) => normToken(f) === orderNorm)) return false;
      const pList = Array.isArray(p.payment_options) ? p.payment_options : [];
      if (pList.length > 0 && !pList.some((m) => normToken(m) === payNorm)) return false;
      return true;
    });

    if (!eligible) return 0;
    const rateAmount = Math.max(1, Number(eligible.rate_amount || 100));
    const pointsPerUnit = Math.max(1, Number(eligible.points_per_unit || 1));
    const earned = Math.floor(orderTotal / rateAmount) * pointsPerUnit;
    if (earned <= 0) return 0;

    await supabase.from('loyalty_logs').insert([
      {
        restaurant_id: restaurantId,
        guest_id: guestId,
        program_id: eligible.id,
        order_id: orderId,
        points_delta: earned,
        cash_value: orderTotal,
        entry_type: 'earn',
        remark: `Earned from Order`,
      },
    ]);

    const { data: gRow } = await supabase
      .from('guests')
      .select('loyalty_points')
      .eq('id', guestId)
      .maybeSingle();

    const nextPts = Number(gRow?.loyalty_points || 0) + earned;
    await supabase.from('guests').update({ loyalty_points: nextPts }).eq('id', guestId);
    return earned;
  } catch {
    return 0;
  }
}
