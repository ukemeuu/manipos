# ManiPOS Offline-First Architecture Specification

This document details the offline-first system architecture, data flow, synchronization engine, offline authentication model, and failure recovery strategy for ManiPOS.

---

## 1. System Topology & Dual-Runtime Model

```
                    ┌─────────────────────────────────────────┐
                    │            MANIPOS CLOUD                │
                    │        Supabase Postgres DB             │
                    └────────────────────▲────────────────────┘
                                         │
                    Async Idempotent Sync Queue (HTTP REST)
                                         │
                    ┌────────────────────▼────────────────────┐
                    │      MANIPOS LOCAL-FIRST POS            │
                    │                                         │
                    │  ┌───────────────────────────────────┐  │
                    │  │       React 18 / Vite UI          │  │
                    │  └─────────────────▲─────────────────┘  │
                    │                    │ Sub-20ms           │
                    │  ┌─────────────────▼─────────────────┐  │
                    │  │      Service Layer (src/services) │  │
                    │  │  orderService  shiftService       │  │
                    │  │  menuService   staffService       │  │
                    │  └─────────────────▲─────────────────┘  │
                    │                    │                    │
                    │  ┌─────────────────▼─────────────────┐  │
                    │  │  Local DB Engine (IndexedDB/Store)│  │
                    │  └─────────────────▲─────────────────┘  │
                    │                    │                    │
                    │  ┌─────────────────▼─────────────────┐  │
                    │  │   Durable Sync Engine Queue       │  │
                    │  └───────────────────────────────────┘  │
                    └─────────────────────────────────────────┘
```

---

## 2. Service Layer Abstraction (`src/services/data/`)

UI components (`PosTerminal.jsx`, `PinLogin.jsx`, `AdminDashboard.jsx`) do NOT make direct HTTP/Supabase calls. They interface through dedicated local-first service interfaces:

- **`connectivityService.js`**: Health pings determine true system state (`ONLINE`, `OFFLINE`, `SYNCING`, `SYNC_ERROR`).
- **`localStoreService.js`**: Provides sub-20ms local database persistence for `pos_orders`, `pos_menu`, `pos_categories`, `pos_shifts`, `staff_access`, `restaurant_settings`, and `audit_logs`.
- **`orderService.js`**: Manages Local-First order creation using UUID `idempotency_key` and local ticket sequence numbers.
- **`staffService.js`**: Provisions salted offline PIN hashes on local device during online logins, enabling secure offline PIN login.
- **`shiftService.js`**: Manages offline shift opening, closing, cash reconciliation, and variance calculation.
- **`syncEngineService.js`**: Durable background sync engine that processes `sync_queue` items in FIFO order with exponential backoff and conflict resolution rules.

---

## 3. Idempotent Synchronization & Conflict Resolution Matrix

| Data Entity | Primary Authority | Conflict Resolution Rule | Idempotency Strategy |
| :--- | :--- | :--- | :--- |
| **POS Orders** | **Local Terminal** | Append-only. Offline orders are assigned a UUID `idempotency_key`. Retries on Postgres unique constraint return HTTP 200 without duplication. | `UUID idempotency_key` |
| **Menu Catalog** | **Cloud Backend** | Cloud wins. Incremental delta sync updates local cache when online. | `updated_at` timestamp cursor |
| **Shifts & Cash** | **Local Terminal** | Local shift reconciliation is authoritative for the device's open shift. | `shift_id` + `opened_at` |
| **Audit Logs** | **Local Terminal** | Append-only audit logs queued locally if offline and pushed to `audit_logs` table. | Log event UUID |

---

## 4. Offline Authentication Workflow

```
[Cashier/Manager] ──> Enter Restaurant Slug & 4-Digit PIN
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
        [ ONLINE MODE ]               [ OFFLINE MODE ]
   Call verify_staff_pin RPC      Match against locally
   Postgres verifies pgcrypto     provisioned staff hash
   Provisions offline hash        Grants local register
   on local machine device        access securely
```

---

## 5. Desktop Package Setup (Electron)

- **Entrypoint**: `main.js`
- **Build Commands**:
  - `npm run dev`: Launch Vite dev server.
  - `npm run electron`: Launch local Electron shell.
  - `npm run dist`: Compile native Windows installer (`ManiPOS-Setup-1.0.0.exe`).
