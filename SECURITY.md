# ManiPOS Security Specification & Threat Model

This document outlines the security architecture, threat model, authentication mechanisms, and data isolation controls enforced across ManiPOS.

---

## 1. Security Architecture & Threat Model

| Threat Scenario | Risk Level | Defense Mechanism |
| :--- | :---: | :--- |
| **DevTools Tenant Manipulation** (`localStorage.setItem('restaurantId', ...)`)| **CRITICAL** | **Supabase Row-Level Security (RLS)** policies enforce tenant isolation at the database level. Changing client-side state returns 0 unauthorized database rows. |
| **Shared Auth Credential Leak** | **HIGH** | Hardcoded fallback logins (`receiver@poj.com`) eliminated. All staff log in via `verify_staff_pin` RPC function. |
| **Plaintext PIN Storage** | **HIGH** | PIN codes are stored as salted bcrypt hashes (`pin_hash`) using Postgres `pgcrypto`. |
| **Duplicate Order Billing** | **HIGH** | Every order contains a unique `idempotency_key` (UUID). Postgres enforces a `UNIQUE(idempotency_key)` constraint. |
| **Cashier Price & Discount Abuse** | **MEDIUM** | Cashier voids, refunds, custom discounts, and price overrides write immutable audit records to `public.audit_logs`. |

---

## 2. Row-Level Security (RLS) Policy Matrix

All multi-tenant database tables enforce RLS:

- `public.restaurants`
- `public.staff_access`
- `public.pos_orders`
- `public.pos_menu`
- `public.pos_shifts`
- `public.pos_categories`
- `public.pos_discounts`
- `public.menu_modifier_groups`
- `public.restaurant_settings`
- `public.suppliers`
- `public.audit_logs`

### Sample Policy Enforcement

```sql
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant operational access" ON public.pos_orders
    FOR ALL TO public
    USING (restaurant_id = auth.jwt() ->> 'restaurant_id')
    WITH CHECK (restaurant_id = auth.jwt() ->> 'restaurant_id');
```

---

## 3. Staff Authentication Workflow

```
[Cashier/Manager] ──> Enter Tenant Slug & 4-Digit PIN
                              │
                              ▼
           Call RPC: verify_staff_pin(slug, pin)
                              │
                              ▼
            Postgres checks pgcrypto crypt hash
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
        [ Match Found ]             [ Invalid PIN ]
   Returns staff payload           Returns 401 Error
```

---

## 4. Secret & Environment Variable Policy

1. **Zero Hardcoded Secrets**: Source code files MUST NOT contain passwords, database secrets, or API tokens.
2. **Environment Variables**:
   - `VITE_SUPABASE_URL`: Public Supabase Project API URL.
   - `VITE_SUPABASE_ANON_KEY`: Public Supabase Anonymous Key (safe for frontend distribution).
