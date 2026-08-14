# ManiPOS Production Deployment & Onboarding Guide

This document provides step-by-step instructions for deploying ManiPOS to production environments and onboarding new restaurant tenants.

---

## 1. Prerequisites

- **Supabase Account**: A dedicated Supabase project.
- **Node.js**: v18 or later.
- **Domain Name**: Custom domain (e.g. `manipos.com`).

---

## 2. Database Deployment

1. Log into your **[Supabase Dashboard](https://supabase.com/dashboard)**.
2. Select your project and navigate to the **SQL Editor**.
3. Copy the entire contents of [`supabase_master_setup.sql`](file:///Volumes/Transcend/mani-pos/supabase_master_setup.sql).
4. Paste into the SQL Editor and click **Run**.

---

## 3. Frontend Deployment (Hostinger / Netlify)

### A. Environment Configuration
Set the following environment variables in your hosting dashboard or local `.env` file:

```env
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### B. Building & Deploying
Run the production build command:

```bash
npm run build
```

The output in the `dist/` directory contains all compiled static assets ready for deployment.

---

## 4. Restaurant Tenant Onboarding SOP

To onboard a new restaurant client (e.g., `Mama Oliech Kitchen`):

1. **Create Restaurant Record**:
   Run the following SQL in Supabase SQL Editor:
   ```sql
   INSERT INTO public.restaurants (name, slug)
   VALUES ('Mama Oliech Kitchen', 'mamaoliech');
   ```

2. **Create Initial Admin Staff Account**:
   ```sql
   INSERT INTO public.staff_access (restaurant_id, name, role, pin_code, pin_hash)
   VALUES (
       (SELECT id FROM public.restaurants WHERE slug = 'mamaoliech'),
       'Manager Account',
       'admin',
       '1234',
       crypt('1234', gen_salt('bf'))
   );
   ```

3. **Provide Terminal Login URL**:
   Provide the restaurant client with their dedicated login portal:
   `https://mamaoliech.pos.manipos.com` (or `https://pos.manipos.com/?tenant=mamaoliech`).
