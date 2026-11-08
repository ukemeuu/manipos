# ManiPOS Platform - Architecture & Development Rules

## 1. Domain & Routing Boundaries
- **Marketing Landing Page (`manipos.com`, `www.manipos.com`)**:
  - Exclusively serves the ManiPOS SaaS marketing landing page (`LandingPage.jsx`).
  - Must NEVER route to tenant microsites or Pot of Jollof menu.
- **Tenant Microsites (`<slug>.manipos.com`)**:
  - Serves guest digital menus (e.g. `potofjollof.manipos.com` -> `MenuMicrosite.jsx`).
- **POS Terminals (`pos.manipos.com` or `#/pos`)**:
  - Scoped staff PIN authentication & cash register terminal.

## 2. Homepage Specifications & UI Decisions
- **Feature Roadmap & Capabilities Grid (Permanently Removed)**:
  - The 8-card grid titled "System Capabilities & Development Roadmap" / "Production Capabilities & Feature Roadmap" (containing "Live POS Register", "Multi-Brand Menu", "Staff Roles", "QR Code Digital Menu", and "COMING SOON" cards: "Inventory", "AI Analytics", "Floorplan", "KDS") **must remain removed**.
  - Do NOT re-add or re-introduce this card grid to `LandingPage.jsx`.
  - The homepage features section relies solely on the tabbed `featureTabs` interactive demonstration.

## 3. Localization & Store Configuration
- **Currency**: Kenyan Shilling (`KES`), never `$`.
- **Primary Paybill**: `542542`, Account `992422` (I&M Bank).
- **Exit Menu**: Redirects to `potofjollof.co.ke` main website.

## 4. Repository Synchronization
- Keep `/Volumes/Transcend/mani-pos` and `/Users/mike/Desktop/mani-pos` synchronized with `origin/main` on GitHub (`ukemeuu/manipos`).

## 5. Microsite Footer Specifications
- Digital menu microsites (`MenuMicrosite.jsx`) must keep a clean, minimal footer: `Mani POS © 2026`.
- Do NOT include staff & POS portal links, copyright slogans, or cuisine descriptions in the guest microsite footer.

