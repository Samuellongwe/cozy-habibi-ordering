# Cozy Habibi — Production Ordering System

This is a production-ready restaurant operations backend, built on the Cozy Habibi sales demo prototype. The system upgrades the original frontend prototype with a real API, database, and operational infrastructure.

## What's Included

### Security & Compliance
- **Express production server** with Helmet (HSTS, CSP), compression, CORS, and rate limiting
- **JWT authentication** (8-hour expiry) for admin endpoints
- **Bcryptjs password hashing** for admin credentials
- **Audit logging** on all admin actions, auth events, and errors
- **Request ID tracing** for debugging and compliance
- **Input validation** with Zod (phone format, inventory checks, server-side price calculation)
- **SQL injection protection** via parameterized queries
- **CORS enforcement** in production (no wildcard origins)

### Database
- **SQLite in WAL mode** with `synchronous=NORMAL` for durability + performance
- **Normalized schema**:
  - `admins` — role-based access control (admin, role field)
  - `products` — menu with SKU, stock tracking, active/inactive status
  - `orders` — order workflow (pending → confirmed → preparing → ready → completed/cancelled)
  - `order_items` — line items (server-side price snapshot, prevents tampering)
  - `reservations` — reservation workflow with guest count validation
  - `loyalty_members` — loyalty club with points and tier system
  - `audit_log` — immutable audit trail (admin, action, resource, IP, timestamp)
- **Indexes** on high-query fields: `orders.created_at`, `orders.status`, `orders.customer_phone`, `reservations.date`, `loyalty_members.phone`, `audit_log.admin_id`, `audit_log.created_at`
- **Data integrity**: Foreign keys, CHECK constraints, UNIQUE constraints, NOT NULL enforcement

### API Features
- **Public endpoints** (no auth required):
  - `GET /api/health` — service status
  - `GET /api/menu` — active menu items with price, stock, category
  - `POST /api/orders` — create order (server-side validation & price calculation)
  - `GET /api/orders/:orderNumber` — public order lookup by order number
  - `POST /api/reservations` — create reservation (duplicate detection, ±30min window)
  - `POST /api/loyalty/join` — join loyalty club

- **Admin endpoints** (JWT-protected, rate-limited):
  - `POST /api/auth/login` — authenticate with username/password, receive JWT token
  - `GET /api/orders` — list orders with pagination
  - `PATCH /api/orders/:id/status` — update order status, audit logged
  - `GET /api/reservations` — list reservations with pagination
  - `PATCH /api/reservations/:id/status` — update reservation status
  - `GET /api/loyalty` — list loyalty members
  - `GET /api/admin/stats` — dashboard stats (orders, revenue, pending count, etc.)
  - `GET /api/admin/audit` — audit log with pagination (actions, IPs, timestamps)

### Logging & Observability
- **Structured JSON logging** in production (RFC 5424 style): `{ts, severity, msg, ...context}`
- **Human-readable logging** in development
- **Log levels**: `debug`, `info`, `warn`, `error` (configurable via `LOG_LEVEL` env var)
- **Request ID** on every response (`X-Request-ID` header and `requestId` JSON field)
- **Client IP extraction** (respects `X-Forwarded-For` behind proxies)
- **Auth event logging** (successful logins, failed attempts, reasons)

### Error Handling & Resilience
- **Per-route try-catch** with meaningful error messages
- **Global error handler** catches unhandled exceptions
- **Production error responses** hide stack traces (only error message shown)
- **Graceful shutdown** (30-second timeout for clean database closure)
- **Uncaught exception & unhandled rejection handlers** log and terminate safely

### Operational Readiness
- **Environment-aware configuration** (development vs. production modes)
- **Startup validation** (JWT_SECRET length check, CORS_ORIGIN enforcement)
- **Database initialization** on startup (creates schema, seeds menu if empty)
- **Pagination** on all list endpoints (configurable limit 1-100, default 50)
- **Inventory checks** before order creation (prevents overselling)
- **Duplicate reservation detection** (same phone, date, time ±30 minutes)
- **Order number generation** using cryptographic randomness (not Math.random())

## Run Locally

### Prerequisites
- Node.js 20+
- npm or yarn

### Setup
```bash
# Clone or download the repo
cd cozy-habibi-ordering

# Install dependencies
npm install

# Copy .env.example to .env and configure
cp .env .env

# Edit .env: set JWT_SECRET (32+ random hex) and ADMIN_PASSWORD (12+ chars)
# See .env for guidance

# Initialize admin user
npm run init-admin
# This will prompt you for admin username and password
# Creates hashed credentials in the database

# Start the server
npm start
# or for development with file watching:
npm run dev

# Open in browser
# Frontend: http://localhost:3000
# Admin dashboard: http://localhost:3000/admin
```

## Production Deployment

### Checklist
- [ ] **Environment**: Set `NODE_ENV=production` and `LOG_LEVEL=info`
- [ ] **Security**: Set `CORS_ORIGIN=https://your-domain.com` (exact origin, no wildcard)
- [ ] **JWT Secret**: Generate a strong 32+ character random secret (never commit)
- [ ] **Database**: Use a persistent volume (Docker) or absolute path for `DB_PATH`
- [ ] **HTTPS**: Run behind a reverse proxy/load balancer (Nginx, Caddy, CloudFlare)
- [ ] **Backups**: Set up daily database backups (`data/*.db`)
- [ ] **Menu Data**: Replace demo prices and images with Cozy-approved values
- [ ] **WhatsApp**: Wire the real WhatsApp business number into the frontend
- [ ] **Monitoring**: Add logging aggregation (e.g., Datadog, ELK, CloudWatch)
- [ ] **Secrets**: Use your platform's secret manager (GitHub Secrets, AWS Secrets Manager, etc.) — never commit `.env`

### Docker Deployment
```bash
# Build
docker-compose build

# Run
docker-compose up -d

# Logs
docker-compose logs -f cozy

# Restart
docker-compose restart cozy

# Stop
docker-compose down
```

### Environment Variables (Production)
```bash
PORT=3000
NODE_ENV=production
DB_PATH=/persistent/volume/cozy.db
JWT_SECRET=<32+ random hex>
CORS_ORIGIN=https://your-production-domain.com
LOG_LEVEL=info
```

## API Examples

### Create an Order
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "John Doe",
    "customerPhone": "+260971234567",
    "items": [{"productId": 1, "quantity": 2}]
  }'
```

### Admin Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'
# Response: {"token": "eyJhbGc..."}
```

### List Orders (Admin)
```bash
curl -X GET http://localhost:3000/api/orders \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json"
```

### Update Order Status (Admin)
```bash
curl -X PATCH http://localhost:3000/api/orders/1/status \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed"}'
```

### Get Dashboard Stats (Admin)
```bash
curl -X GET http://localhost:3000/api/admin/stats \
  -H "Authorization: Bearer eyJhbGc..."
# Response: {"orders": 42, "pendingOrders": 5, "revenue": 15000, ...}
```

## Beyond This Foundation

This is a **production-oriented** application foundation. The following require Cozy's operational decisions and credentials:

- **Payment provider integration** (Stripe, PayPal, Pesapal, etc.) — requires merchant account
- **Kitchen printer/POS integration** — requires hardware and driver setup
- **Tax calculation** — depends on jurisdiction and Cozy's tax structure
- **Inventory management** — requires real-time stock sync with physical locations
- **Backup & disaster recovery** — depends on your cloud provider
- **Domain & DNS** — your hosting provider's control panel
- **Monitoring & alerting** — choose your APM platform
- **Email notifications** — wire SMTP or transactional email service
- **SMS/WhatsApp webhooks** — integrate with WhatsApp Business API

## Production Boundary

This codebase provides:
✅ Order & reservation workflow  
✅ Admin authentication & audit logs  
✅ Rate limiting & input validation  
✅ Error handling & graceful shutdown  
✅ Database schema & migrations  
✅ Structured logging  
✅ API contracts and pagination  

This codebase does **not** provide:
❌ Payment processing or PCI compliance  
❌ Email/SMS notifications (hook-in points exist)  
❌ Kitchen display system (KDS) integration  
❌ Multi-location or multi-currency  
❌ Refund workflow  
❌ Advanced inventory forecasting  

## Support & Questions

For issues, feature requests, or operational questions, contact Cozy Restaurant & Lounge.

**Cozy Restaurant & Lounge**  
Lamasat Complex, Linda Road, Makeni, Lusaka  
+260 97 593 9999  

---

**Version**: 1.0.0  
**Last Updated**: August 2026  
**License**: Proprietary — Cozy Restaurant & Lounge  
