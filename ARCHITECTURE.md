# ManiPOS System Architecture

ManiPOS is a multi-tenant, cloud-native Point-of-Sale (POS) and restaurant management operating system designed for single-location restaurants, multi-location brands, and restaurant groups.

---

## 1. High-Level Architecture

```
                               ┌────────────────────────────────┐
                               │     Browsers / Terminals       │
                               │  pos.manipos.com / Subdomains  │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │       Vite / React SPA         │
                               │   State, Offline Queue, QZ     │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │      Supabase BaaS Layer       │
                               │   Auth, REST API, WebSockets   │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │      Postgres Database         │
                               │  RLS Policies & RPC Functions  │
                               └────────────────────────────────┘
```

---

## 2. Technology Stack

- **Frontend**: React 18, Vite 7, TailwindCSS, Framer Motion, Lucide Icons.
- **Backend**: Supabase (Postgres Database, PostgREST API, Row-Level Security, RPC Functions, WebSockets Realtime).
- **Hardware Integration**: QZ Tray API (WebSocket thermal receipt & kitchen printer routing).
- **Offline Buffer**: LocalStorage / IndexedDB queue with automatic background sync (`src/lib/offlineQueue.js`).
- **Reporting & PDFs**: jsPDF & AutoTable for Z-reports and items-sold reports.

---

## 3. Core Subsystems

### A. Authentication & Staff Identity
- **PIN Verification**: 4-digit staff security PINs authenticated via server-side Postgres RPC function `verify_staff_pin(restaurant_slug, pin)`.
- **Hashed Secrets**: PIN hashes stored using Postgres `pgcrypto` (`crypt(pin, gen_salt('bf'))`).
- **Session Tokens**: Authenticated session payload returned directly from database execution (`id`, `name`, `role`, `restaurantId`, `tenantSlug`).

### B. Tenant Isolation & Database Security
- **Database Level**: Enforced via Supabase Row-Level Security (RLS) on all tenant-sensitive tables (`pos_orders`, `pos_menu`, `staff_access`, `pos_shifts`, `restaurant_settings`, `suppliers`).
- **Zero Client Proxy Trust**: Database queries executed standardly without client-side query modification or `localStorage` proxying.

### C. POS Terminal & Order Lifecycle
- **Idempotency**: Every cart submission generates a unique UUID `idempotency_key` to prevent duplicate billing or order creation.
- **Offline Failover**: Network drops trigger `offlineQueue.js`, queueing orders locally and auto-syncing when `window.onLine` fires.
- **Printing**: QZ Tray integration sends raw ESC/POS commands to thermal receipt and kitchen printers with silent printing fallback.

### D. Audit Logging & Security Trails
- Immutable audit log records (`public.audit_logs`) tracking cashier voids, refunds, custom discounts, price overrides, and shift closes.

---

## 4. Directory & Module Structure

```
/src
  ├── /components
  │     ├── PosTerminal.jsx       # Core register UI, cart & checkout logic
  │     ├── AdminDashboard.jsx    # Back-office analytics, menu management, audit logs
  │     ├── PinLogin.jsx          # Staff PIN authentication form
  │     ├── MenuMicrosite.jsx     # Guest digital menu & public ordering
  │     ├── FeedbackForm.jsx      # Guest meal feedback & rating submission
  │     ├── RestaurantLinkHub.jsx # Restaurant social links & landing page
  │     ├── CampaignsView.jsx     # Marketing campaigns & promotions
  │     └── ErrorBoundary.jsx     # Production runtime error boundary
  ├── /lib
  │     ├── supabase.js           # Supabase client initialization
  │     ├── tenant.js             # Subdomain & tenant slug routing helpers
  │     ├── offlineQueue.js       # Offline order buffer & background auto-sync
  │     ├── auditLogger.js        # Audit trail logging utility
  │     ├── qzPrint.js            # Thermal printing & QZ Tray integration
  │     └── pdfGenerator.js       # Z-report & sales PDF generation
```
