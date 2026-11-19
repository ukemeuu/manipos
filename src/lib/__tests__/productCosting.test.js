import { describe, expect, it } from 'vitest';
import {
  resolveChannelCommission,
  resolveChannelCommissionWithFallback,
  attachLineCosting,
} from '../productCosting';

const rows = [
  { channel: 'Glovo', brand: null, commission_percent: 20, is_active: true },
  { channel: 'Glovo', brand: 'Little Lagos', commission_percent: 27, is_active: true },
  { channel: 'Glovo', brand: 'Pot of Jollof', commission_percent: 29, is_active: true },
  { channel: 'Ubereats', brand: null, commission_percent: 18, is_active: true },
];

describe('per-brand channel commissions', () => {
  it('uses the brand-specific rate before the channel-wide default', () => {
    expect(resolveChannelCommission(rows, 'Glovo', 'Pot of Jollof')).toBe(29);
    expect(resolveChannelCommission(rows, 'Glovo', 'Little Lagos')).toBe(27);
  });

  it('falls back to the channel default when the brand has no override', () => {
    expect(resolveChannelCommission(rows, 'Glovo', 'Some Other Brand')).toBe(20);
    expect(resolveChannelCommission(rows, 'Glovo', '')).toBe(20);
    expect(resolveChannelCommission(rows, 'Ubereats', 'Little Lagos')).toBe(18);
  });

  it('matches brands and channels case/space insensitively', () => {
    expect(resolveChannelCommission(rows, 'glovo', 'POT OF JOLLOF')).toBe(29);
    expect(resolveChannelCommission(rows, 'Glovo ', 'little_lagos')).toBe(27);
  });

  it('ignores inactive rows', () => {
    const withInactive = [
      { channel: 'Glovo', brand: 'Little Lagos', commission_percent: 27, is_active: false },
      { channel: 'Glovo', brand: null, commission_percent: 20, is_active: true },
    ];
    expect(resolveChannelCommission(withInactive, 'Glovo', 'Little Lagos')).toBe(20);
  });

  it('falls back to the settings JSON map only when the table has no rate', () => {
    const settingsMap = { Glovo: 22, BoltFood: 30 };
    expect(resolveChannelCommissionWithFallback([], settingsMap, 'Glovo', 'Pot of Jollof')).toBe(22);
    // The table (brand or channel row) wins over the legacy settings map.
    expect(resolveChannelCommissionWithFallback(rows, settingsMap, 'Glovo', 'Pot of Jollof')).toBe(29);
    expect(resolveChannelCommissionWithFallback(rows, settingsMap, 'Glovo', 'Little Lagos')).toBe(27);
    // Brand override missing -> table channel default (20), not the JSON map (22).
    expect(resolveChannelCommissionWithFallback(rows, settingsMap, 'Glovo', 'Unknown')).toBe(20);
  });

  it('snapshots the resolved rate onto order lines', () => {
    const lines = attachLineCosting(
      [{ name: 'Jollof Rice', price: 1000, quantity: 2, cogs_percent: 25 }],
      { baseCogsPercent: 25, commissionPercent: resolveChannelCommission(rows, 'Glovo', 'Pot of Jollof') }
    );
    expect(lines[0].commission_percent).toBe(29);
    expect(lines[0].commission_amount).toBe(580);
    expect(lines[0].cogs_amount).toBe(500);
  });
});
