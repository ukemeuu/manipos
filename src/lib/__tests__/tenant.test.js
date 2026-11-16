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

  it('routes Android Capacitor app.manipos.com and ?logout=1 to neutral ManiPOS POS without locking to a tenant', () => {
    setTestUrl('https://app.manipos.com/?page=pos');
    const appInfo = getTenantInfo();
    expect(appInfo.isPosDomain).toBe(true);
    expect(appInfo.tenantSlug).toBe(null);
    expect(appInfo.isGuestMicrosite).toBe(false);

    setTestUrl('https://potofjollof.pos.manipos.com/?page=login&logout=1');
    const logoutInfo = getTenantInfo();
    expect(logoutInfo.isPosDomain).toBe(true);
    expect(logoutInfo.tenantSlug).toBe(null);
    expect(logoutInfo.isGuestMicrosite).toBe(false);
  });
});
