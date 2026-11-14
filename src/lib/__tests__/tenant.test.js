import { describe, it, expect, beforeEach } from 'vitest';
import { getTenantInfo } from '../tenant';

function setTestUrl(href) {
  delete window.location;
  window.location = new URL(href);
}

describe('tenant routing boundaries', () => {
  beforeEach(() => {
    setTestUrl('https://manipos.com/');
  });

  it('routes root domain manipos.com to marketing homepage only', () => {
    setTestUrl('https://manipos.com/');
    const info = getTenantInfo();
    expect(info.isMarketingDomain).toBe(true);
    expect(info.isGuestMicrosite).toBe(false);
    expect(info.isPosDomain).toBe(false);
    expect(info.tenantSlug).toBe(null);
  });

  it('routes <slug>.manipos.com strictly to guest microsite', () => {
    setTestUrl('https://littlelagos.manipos.com/');
    const info = getTenantInfo();
    expect(info.isGuestMicrosite).toBe(true);
    expect(info.tenantSlug).toBe('littlelagos');
    expect(info.isPosDomain).toBe(false);
  });

  it('routes <slug>.pos.manipos.com strictly to scoped POS terminal', () => {
    setTestUrl('https://potofjollof.pos.manipos.com/');
    const info = getTenantInfo();
    expect(info.isPosDomain).toBe(true);
    expect(info.tenantSlug).toBe('potofjollof');
    expect(info.isGuestMicrosite).toBe(false);
  });
});
