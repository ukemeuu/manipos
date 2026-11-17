-- ============================================================================
-- ManiPOS · Audit hardening (18 Nov 2026)
--
-- 1. Wallet ledger and device-loan requests are write-only from verified
--    payment callbacks / service role. Clients may read their tenant's ledger.
-- 2. MenuBuilder storage paths are tenant-scoped (${restaurantId}/...), which
--    matches the menu_images RLS policy.
-- ============================================================================

revoke insert, update, delete on public.merchant_wallet_ledger from anon, authenticated;
revoke insert, update, delete on public.device_loan_requests from anon, authenticated;

-- Keep public menu reads working while preventing anonymous writes.
-- (Tenant-scoped policies from 20261127_security_hardening_cleanup.sql remain
-- the primary guard; this revoke is explicit defense in depth.)
