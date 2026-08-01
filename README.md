# ManiPOS — Standalone POS Terminal

A fast, lightweight cloud-based Point of Sale terminal designed for restaurants and kitchens. Extracting the core transaction entry system and local QZ-Tray thermal print engine into a standalone SaaS product.

## Folder Setup

- **`/src/App.jsx`**: Manages terminal entry flow (switches between PIN entry and POS screen).
- **`/src/components/PosTerminal.jsx`**: The central POS register. Handles shopping cart calculation, payment status, and printing templates.
- **`/src/components/PinLogin.jsx`**: Local terminal cashier login.
- **`/src/lib/qzPrint.js`**: Bridge that interfaces with the local receipt printer.
- **`/src/lib/supabase.js`**: Database client configuration.

## Getting Started

1. Navigate to the standalone directory:
   ```bash
   cd /Volumes/Transcend/manipos-standalone
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Copy the environment variables template and configure your keys:
   ```bash
   cp .env.template .env
   ```
4. Run the development server locally:
   ```bash
   npm run dev
   ```

## Database Schema (Required Tables)

To run this standalone POS terminal, make sure your Supabase project contains the following tables:

### 1. `staff_access`
Stores authorized cashiers and kitchen operators along with their PIN code.
* Columns:
  - `id` (uuid, primary key)
  - `name` (text)
  - `pin` (text, 4 digits)
  - `role` (text: e.g., 'cashier', 'kitchen', 'admin')

### 2. `menu_items`
Contains the catalog of dishes and drinks.
* Columns:
  - `id` (uuid, primary key)
  - `name` (text)
  - `price` (numeric)
  - `category` (text)
  - `brand` (text: e.g., 'POT OF JOLLOF', 'LITTLE LAGOS')
  - `is_available` (boolean)

### 3. `pos_orders`
Tracks all transactions entered at the terminal registers.
* Columns:
  - `id` (uuid, primary key)
  - `ticket_number` (text / int)
  - `customer_name` (text)
  - `brand` (text)
  - `items` (jsonb array containing item list, quantities, and price)
  - `total_amount` (numeric)
  - `discount` (numeric)
  - `payment_method` (text: 'CASH', 'MPESA', 'CARD')
  - `payment_status` (text: 'PAID', 'PENDING', 'VOIDED')
  - `dining_option` (text: 'DINE IN', 'DELIVERY', 'TAKEAWAY')
  - `status` (text: 'Received', 'Preparing', 'Packed', 'Returned', 'Cancelled')
  - `cashier_name` (text)
  - `created_at` (timestamptz)
