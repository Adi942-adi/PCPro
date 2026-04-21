# PCPro (BuildCores-Style Full Project)

Full-stack PC builder and store workflow:

- Multi-page React frontend
- Express + MongoDB backend
- JWT auth (signup/login/me)
- PC builder with compatibility checks
- BuildCores-style compatibility checklist with score, warnings, and readiness state
- One-click build templates (Budget 1080p, Balanced 1440p, Creator 4K)
- Shareable builder links + markdown export for build summaries
- Public build share page (`/build-share/:shareId`)
- Regional pricing switch (USD / INR display)
- Saved builds per user
- Product catalog
- Cart + checkout flow
- Stripe-ready payment intent + controlled mock mode fallback
- Orders history
- Interactive 3D case viewer for every case in builder
- JSON dataset importer
- Admin panel (overview, components CRUD/import, orders, users, audit logs)
- Outside-app alerts (email + web push) for price drops and review moderation

## Important

This project clones functionality patterns only.  
Do not copy proprietary source, assets, branding, private APIs, or data from other products.

## Stack

- Frontend: React + Vite + React Router + Axios + Stripe JS
- Backend: Node.js + Express + Mongoose + JWT + bcrypt + Stripe SDK
- Database: MongoDB

## Project Structure

- `client/` frontend app
- `server/` backend API
- `server/data/datasets/components.dataset.json` importable dataset

## Environment

### Server `.env`

Copy `server/.env.example` to `server/.env` and set:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/pcpro
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=replace-with-a-random-64-char-secret
JWT_EXPIRES_IN=15m
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_DAYS=21
PASSWORD_RESET_TOKEN_MINUTES=30
AUTH_COOKIE_SAMESITE=lax
AUTH_COOKIE_SECURE=false
AUTH_ACCESS_COOKIE_MAX_AGE_MS=900000
SUPER_ADMIN_EMAILS=admin@pcpro.local
STRIPE_SECRET_KEY=
ALLOW_MOCK_PAYMENTS=true
CURRENCY=usd
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=PCPro <no-reply@example.com>
VAPID_SUBJECT=mailto:admin@example.com
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

### SMTP setup (Gmail)

Use app password (not regular Gmail password):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=PCPro <your-email@gmail.com>
SMTP_TEST_TO=your-email@gmail.com
```

Test SMTP:

```bash
cd server
npm run smtp:test
```

Generate VAPID keys (once):

```bash
cd server
npx web-push generate-vapid-keys
```

### Client `.env` (optional for real Stripe)

Create `client/.env`:

```env
VITE_API_URL=/api
VITE_STRIPE_PUBLISHABLE_KEY=
```

Mock checkout is allowed only when `ALLOW_MOCK_PAYMENTS=true` (recommended for local dev only).

## Setup

1. Install dependencies:

```bash
cd server
npm install
cd ../client
npm install
```

2. Import dataset:

```bash
cd ../server
npm run import:dataset
```

3. Start backend:

```bash
npm run dev
```

4. Start frontend (new terminal):

```bash
cd ../client
npm run dev
```

5. Open:

- Frontend: `http://localhost:5173`
- API health: `http://localhost:5000/api/health`

## Core API Endpoints

- Auth: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `GET /api/auth/me`
- Components: `GET /api/components`
- Builder: `POST /api/compatibility/check`, `GET/POST /api/builds`
- Public share: `GET /api/builds/share/:shareId`
- Ensure share id: `POST /api/builds/:id/share`
- Cart: `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/:itemId`
- Payments: `POST /api/payments/create-intent`
- Orders: `POST /api/orders/from-cart`, `GET /api/orders`
- Admin: `GET /api/admin/overview`
- Admin components: `GET/POST /api/admin/components`, `PATCH/DELETE /api/admin/components/:id`, `POST /api/admin/components/import-json`
- Admin orders: `GET /api/admin/orders`, `PATCH /api/admin/orders/:id/status`
- Admin users: `GET /api/admin/users`, `POST /api/admin/users`, `PATCH /api/admin/users/:id/role`
- Admin audit logs: `GET /api/admin/audit-logs`
- Notifications: `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all`
- Notification preferences: `GET/PATCH /api/notifications/preferences`
- Push subscription: `GET /api/notifications/push/public-key`, `GET/POST/DELETE /api/notifications/push/subscriptions`

## Admin Panel

1. Create a normal account from UI (`/signup`) or API.
2. Promote the user to admin:

```bash
cd server
npm run make-admin -- user@example.com
```

3. Log in with that account.
4. Open `http://localhost:5173/admin`.

Notes:

- Admin endpoints require JWT auth and `role=admin`.
- Every admin mutation writes an audit log entry.
- A logged-in admin cannot remove their own admin role.

## Dataset Import

Default command:

```bash
cd server
npm run import:dataset
```

Custom JSON file:

```bash
cd server
node src/importers/import-components.js path/to/your-components.json
```

Expected JSON shape:

```json
[
  {
    "type": "cpu",
    "name": "AMD Ryzen 5 7600",
    "brand": "AMD",
    "price": 219,
    "specs": { "socket": "AM5", "cores": 6, "threads": 12, "tdp": 65 }
  }
]
```
