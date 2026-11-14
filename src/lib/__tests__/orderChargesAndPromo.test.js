import { describe, it, expect } from 'vitest';
import { computeOrderCharges } from '../orderCharges';
import { evaluatePromotionDiscount } from '../promoEngine';

describe('computeOrderCharges', () => {
  it('calculates scoped VAT and flat service fee excluding exempt items', () => {
    const res = computeOrderCharges({
      subtotal: 2000,
      taxableSubtotal: 1500,
      discountAmount: 100,
      diningOption: 'Dine In',
      paymentMethod: 'M-Pesa',
      charges: [
        {
          id: 'c1',
          title: 'VAT 16%',
          is_tax_charge: true,
          charge_type: 'percent',
          charge_value: 16,
          order_methods: ['Dine In', 'Delivery'],
          payment_methods: [],
          is_active: true,
        },
        {
          id: 'c2',
          title: 'Packaging Fee',
          is_tax_charge: false,
          charge_type: 'fixed',
          charge_value: 50,
          order_methods: ['Pickup'],
          payment_methods: [],
          is_active: true,
        },
      ],
    });

    expect(res.taxTotal).toBe(224); // 16% of (1500 - 100)
    expect(res.otherChargesTotal).toBe(0); // Pickup-only charge skipped for Dine In
    expect(res.lines).toHaveLength(1);
  });
});

describe('evaluatePromotionDiscount', () => {
  it('enforces minimum spend and caps cart percentage savings', () => {
    const promo = {
      is_active: true,
      promo_rule_type: 'cart_percent',
      value: 20,
      max_discount_value: 300,
      min_order_amount: 1000,
    };

    const tooLow = evaluatePromotionDiscount({ promo, subtotal: 800 });
    expect(tooLow.valid).toBe(false);

    const valid = evaluatePromotionDiscount({ promo, subtotal: 2500 });
    expect(valid.valid).toBe(true);
    expect(valid.discountAmount).toBe(300); // capped at 300 instead of 500
  });

  it('handles delivery_percent promotion rule without exceeding delivery fee', () => {
    const promo = {
      is_active: true,
      promo_rule_type: 'delivery_percent',
      value: 50,
    };
    const res = evaluatePromotionDiscount({
      promo,
      subtotal: 1200,
      deliveryFee: 200,
    });
    expect(res.valid).toBe(true);
    expect(res.deliveryDiscount).toBe(100);
    expect(res.discountAmount).toBe(0);
  });
});
