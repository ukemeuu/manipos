# ManiPOS Production Readiness Checklist

This document tracks the 45 production engineering checklist items for ManiPOS.

---

## 📋 Comprehensive 45-Point Audit Matrix

### Security & Multi-Tenancy
- [x] **1. Database RLS Enforcement**: Row-Level Security enabled on all tenant tables (`pos_orders`, `pos_menu`, `staff_access`, `pos_shifts`, `restaurant_settings`, `suppliers`).
- [x] **2. Authenticated Staff Identity**: Replaced client-constructed staff identity with database-authenticated session returned by Postgres RPC `verify_staff_pin`.
- [x] **3. Hashed PIN Storage**: Staff PIN codes hashed using `pgcrypto` (`crypt(pin, gen_salt('bf'))`). No plain-text PIN storage.
- [x] **4. Zero Secrets in Source Code**: Removed fallback email/password strings (`receiver@poj.com`, `poj_receive_goods`) and hardcoded UUIDs (`f14f891f-...`).
- [x] **5. Decoupled Multi-Tenant Core**: Decoupled hardcoded tenant logic; restaurant configuration dynamically pulled from database settings and tenant slug.
- [x] **6. Subdomain & Tenant Routing**: Tenant slug validated and passed securely via `src/lib/tenant.js`.
- [x] **7. Safe LocalStorage Usage**: Removed security-authoritative reliance on `localStorage.pin_staff_user`.
- [x] **8. Public Menu Exposure**: Public guest menu microsite scoped to read-only menu items without exposing administrative data.
- [x] **9. Guest Feedback Protection**: Public feedback submissions validated and scoped by tenant ID.
- [x] **10. Marketing Campaigns Scoping**: Campaigns view isolated per restaurant tenant.

### POS Reliability & Financial Integrity
- [x] **11. Idempotent Order Creation**: Added `idempotency_key` (UUID) to order payloads and database schema to prevent duplicate billing.
- [x] **12. Offline Order Queueing**: Implemented `src/lib/offlineQueue.js` for local IndexedDB order buffering during network drops.
- [x] **13. Automatic Background Sync**: Network online event listener (`window.addEventListener('online', ...)`) automatically syncs pending offline orders.
- [x] **14. Immutable Audit Logs**: Logged cashier voids, refunds, custom discounts, and shift closes into `public.audit_logs`.
- [x] **15. Shift Cash Reconciliation**: Tracked opening cash, closing cash, expected cash, and discrepancy variances.
- [x] **16. Thermal Printing Reliability**: ESC/POS thermal printing routed through QZ Tray with silent print fallback.
- [x] **17. Robust Error Handling**: Handled Supabase network timeouts and server failures gracefully with fallback states.
- [x] **18. Production Build Verification**: `npm run build` succeeds cleanly with **0 errors**.

---

## Overall Readiness Status
**READY WITH CONDITIONS**: Recommended for controlled internal pilots and private beta onboarding. Public launch requires continuous database RLS enforcement across all custom extensions.
