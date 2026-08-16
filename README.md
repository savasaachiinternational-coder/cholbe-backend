# Cholbe Pharmacy API

NestJS + Prisma + PostgreSQL backend for the Cholbe mobile app (`cholbe-app`).

## Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS 11 |
| ORM | Prisma 6 |
| Database | PostgreSQL |
| Auth | JWT (passport-jwt) + bcrypt |
| Docs | Swagger at `/docs` |
| Uploads | Local disk (`/uploads`) |

## Quick start

```bash
cd server
cp .env.example .env
# Edit DATABASE_URL in .env

npm install
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev
```

- API base: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs`

## Seed accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cholbe.com | Password123! |
| Customer | rayhan@gmail.com | Password123! |
| Vendor | vendor@cholbe.com | Password123! |
| Doctor | doctor@cholbe.com | Password123! |

## Medicine upload — two paths

### 1. Doctor creates medicine (catalog / prescription)

```
POST /api/v1/medicines/doctor
Authorization: Bearer <doctor-token>
```

Creates a `Medicine` record with `source: DOCTOR`. Used when doctors add medicines during consultation.

### 2. Vendor uploads sellable inventory

```
POST /api/v1/uploads/product-image   (multipart, optional)
POST /api/v1/vendor/products
Authorization: Bearer <vendor-token>
```

Creates `VendorProduct` with price/stock. Optionally links to existing doctor medicine via `medicineId`, or auto-creates a `VENDOR`-sourced `Medicine`.

### Admin platform catalog

```
POST /api/v1/medicines/admin
Authorization: Bearer <admin-token>
```

## Health report upload

```
POST /api/v1/uploads/report          (multipart file)
POST /api/v1/reports                 (metadata + fileUrl)
```

## Prescription upload

```
POST /api/v1/uploads/prescription
POST /api/v1/prescriptions          (fileUrl + optional extracted medicines)
```

## Checkout flow

```
GET  /api/v1/pharmacy/products       Browse shop
POST /api/v1/cart/items              Add to cart
GET  /api/v1/addresses               List addresses
POST /api/v1/orders/checkout         Create order (clears cart, decrements stock)
POST /api/v1/orders/:id/payment/confirm   Confirm bKash/Nagad/Card (mock)
GET  /api/v1/orders                  Order history + tracking events
```

## Auth flow (matches mobile app)

```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/otp/send
POST /api/v1/auth/otp/verify
POST /api/v1/auth/onboarding/patient
POST /api/v1/auth/onboarding/medical-history
GET  /api/v1/auth/me
```

## Admin endpoints

| Endpoint | Maps to app screen |
|----------|-------------------|
| `GET /admin/dashboard` | Admin Home |
| `GET /admin/orders` | Admin Orders |
| `GET /admin/vendors` | Admin Vendors |
| `GET /medicines` | Admin Medicines |
| `GET /admin/inventory/overview` | Admin Inventory |
| `GET /admin/reports/sales` | Admin Reports |
| `GET /admin/users` | Admin Users |
| `GET /admin/payments` | Admin Payments |

## Vendor endpoints

| Endpoint | Maps to app screen |
|----------|-------------------|
| `GET /vendor/dashboard` | Vendor Home |
| `GET /vendor/products` | Vendor Inventory |
| `POST /vendor/products` | Vendor Add Product |
| `GET /orders/vendor/list` | Vendor Orders |
| `GET /admin/payments` (vendor scope TBD) | Vendor Payments |

## Project structure

```
server/
├── prisma/schema.prisma    # Full data model
├── prisma/seed.ts          # Demo users & products
└── src/
    ├── auth/               # Register, login, OTP, onboarding
    ├── medicines/          # Doctor + admin medicine catalog
    ├── vendor-products/    # Vendor inventory + pharmacy shop
    ├── reports/            # Health report CRUD
    ├── prescriptions/      # Prescription upload
    ├── uploads/            # File upload handlers
    ├── cart/               # Shopping cart
    ├── orders/             # Checkout & tracking
    ├── addresses/          # Delivery addresses
    ├── vendors/            # Vendor portal
    ├── doctors/            # Doctor list & appointments
    ├── admin/              # Platform admin
    └── users/              # Profile updates
```

## Frontend integration

Point the React Native app to `http://<host>:3000/api/v1`. Recommended next steps in `cholbe-app`:

1. Add `src/api/client.ts` with axios/fetch + JWT interceptor
2. Wire `SignInScreen` → `POST /auth/login`
3. Wire pharmacy checkout screens → cart/orders endpoints
4. Wire vendor `VAddProduct` → `POST /vendor/products`
5. Wire report upload screens → `/uploads/report` + `/reports`

## Environment variables

See `.env.example` for `DATABASE_URL`, `JWT_SECRET`, `PORT`, `UPLOAD_DIR`.
