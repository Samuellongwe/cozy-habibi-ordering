require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { z } = require('zod');

// ============================================================================
// PRODUCTION CONFIG
// ============================================================================
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || './data/cozy.db';
const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || (NODE_ENV === 'production' ? false : true);
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');

// Validation
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long (32+ random hex or base64).');
}
if (NODE_ENV === 'production' && CORS_ORIGIN === true) {
  throw new Error('CORS_ORIGIN must be explicitly set in production (do not use wildcard).');
}

// ============================================================================
// LOGGER (RFC 5424 / structured logging)
// ============================================================================
class Logger {
  constructor(level = 'info') {
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
    this.level = this.levels[level] || 1;
  }
  log(severity, msg, ctx = {}) {
    if (this.levels[severity] < this.level) return;
    const ts = new Date().toISOString();
    const data = { ts, severity, msg, ...ctx };
    console.log(NODE_ENV === 'production' ? JSON.stringify(data) : `[${severity.toUpperCase()}] ${msg}`, ctx);
  }
  debug(msg, ctx) { this.log('debug', msg, ctx); }
  info(msg, ctx) { this.log('info', msg, ctx); }
  warn(msg, ctx) { this.log('warn', msg, ctx); }
  error(msg, ctx) { this.log('error', msg, ctx); }
}
const logger = new Logger(LOG_LEVEL);

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL'); // WAL + NORMAL = good durability + perf
logger.info('Database initialized', { path: DB_PATH });

// Schema with audit columns
db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price>=0),
  image TEXT,
  description TEXT,
  sku TEXT UNIQUE,
  stock INTEGER DEFAULT -1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  table_number TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL CHECK(total>=0),
  tax INTEGER DEFAULT 0,
  discount INTEGER DEFAULT 0,
  notes TEXT,
  special_requests TEXT,
  channel TEXT DEFAULT 'web',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price>=0),
  quantity INTEGER NOT NULL CHECK(quantity>0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  guests INTEGER NOT NULL CHECK(guests BETWEEN 1 AND 20),
  special_requests TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  tier TEXT DEFAULT 'bronze',
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES admins(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  changes TEXT,
  request_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status_code INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_loyalty_phone ON loyalty_members(phone);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`);

// ============================================================================
// SEED DATA (on first run only)
// ============================================================================
const seed = [
  ['Chicken Zinger Strips','International',185,'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=800&q=80','Crispy, seasoned chicken strips.'],
  ['Cheeseburger','International',240,'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80','Stacked, toasted and loaded.'],
  ['Hummus','Lebanese Fusion',120,'https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=800&q=80','Creamy chickpea classic with warmth.'],
  ['Lebanese Grill','Lebanese Fusion',320,'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80','A generous plate for serious cravings.'],
  ['Sushi Selection','Sushi',280,'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80','Fresh Japanese-inspired favourites.'],
  ['Caterpillar Roll','Sushi',260,'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80','Crispy, creamy and finished with avocado.'],
  ['Morning Bun','Breakfast',160,'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80','Golden egg, cheddar and breakfast comfort.'],
  ['Grain & Egg Bowl','Breakfast',170,'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80','Fresh, filling and full of colour.'],
  ['Lotus Waffle','Dessert',150,'https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=800&q=80','Crispy waffle, ice cream and indulgence.'],
  ['Cheesecake Crepe','Dessert',170,'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=800&q=80','A dessert worth coming back for.'],
  ['Watermelon Fresh','International',90,'https://images.unsplash.com/photo-1563114773-84221bd62daa?auto=format&fit=crop&w=800&q=80','Fresh and refreshing.'],
  ['Arabic Coffee','Breakfast',80,'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80','A warm finish to your morning.']
];

if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
  const stmt = db.prepare('INSERT INTO products(name,category,price,image,description) VALUES(?,?,?,?,?)');
  const tx = db.transaction(() => seed.forEach(row => stmt.run(...row)));
  tx();
  logger.info('Database seeded with menu items', { count: seed.length });
}

// ============================================================================
// SCHEMAS (Zod validation)
// ============================================================================
const orderItemSchema = z.object({
  productId: z.number().int().positive('Product ID must be positive'),
  quantity: z.number().int().min(1, 'Quantity minimum is 1').max(50, 'Quantity maximum is 50')
});

const orderSchema = z.object({
  tableNumber: z.string().max(20).optional().nullable(),
  customerName: z.string().min(1).max(100).optional().nullable(),
  customerPhone: z.string().regex(/^\+?[\d\s\-\(\)]{5,30}$/, 'Invalid phone format').optional().nullable(),
  customerEmail: z.string().email().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  items: z.array(orderItemSchema).min(1, 'At least one item required').max(50)
});

const reservationSchema = z.object({
  name: z.string().min(2, 'Name minimum 2 chars').max(100),
  phone: z.string().regex(/^\+?[\d\s\-\(\)]{5,30}$/, 'Invalid phone format'),
  email: z.string().email().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  guests: z.number().int().min(1, 'Minimum 1 guest').max(20, 'Maximum 20 guests'),
  specialRequests: z.string().max(500).optional().nullable()
});

const memberSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\+?[\d\s\-\(\)]{5,30}$/, 'Invalid phone format'),
  email: z.string().email().optional().nullable()
});

const adminLoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(1)
});

const statusUpdateSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'])
});

const reservationStatusSchema = z.object({
  status: z.enum(['requested', 'confirmed', 'seated', 'completed', 'cancelled'])
});

// ============================================================================
// MIDDLEWARE & HELPERS
// ============================================================================

// Request ID for tracing
function requestIdMiddleware(req, res, next) {
  req.id = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  next();
}

// Client IP (respects X-Forwarded-For behind proxy)
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown';
}

// JWT auth
function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new Error('Missing Bearer token');
    const token = header.slice(7);
    req.admin = jwt.verify(token, JWT_SECRET);
    if (!req.admin.id) throw new Error('Invalid token payload');
    next();
  } catch (err) {
    logger.warn('Auth failed', { requestId: req.id, error: err.message, ip: getClientIp(req) });
    return res.status(401).json({ error: 'Unauthorized', requestId: req.id });
  }
}

// Audit log helper
function auditLog(req, action, resourceType, resourceId, changes = {}, statusCode = 200) {
  try {
    db.prepare(`
      INSERT INTO audit_log(admin_id, action, resource_type, resource_id, changes, request_id, ip_address, user_agent, status_code)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.admin?.id || null,
      action,
      resourceType,
      resourceId || null,
      JSON.stringify(changes),
      req.id,
      getClientIp(req),
      req.headers['user-agent'] || 'unknown',
      statusCode
    );
  } catch (err) {
    logger.error('Audit log failed', { requestId: req.id, error: err.message });
  }
}

// Order number generator
function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `CZ-${date}-${rand}`;
}

// Safe error response (no stack in production)
function errorResponse(err, req, statusCode = 500) {
  logger.error('Request error', { requestId: req.id, error: err.message, stack: err.stack });
  const message = NODE_ENV === 'production' ? 'Internal server error' : err.message;
  return { error: message, requestId: req.id };
}

// ============================================================================
// EXPRESS APP
// ============================================================================
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('json spaces', NODE_ENV === 'production' ? 0 : 2);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false
}));

app.use(compression());
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

// Logging & CORS
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

// Request tracking
app.use(requestIdMiddleware);

// Rate limiting (stricter auth endpoints)
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many authentication attempts, please try again later',
  skip: req => NODE_ENV !== 'production'
}));
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => NODE_ENV !== 'production'
}));

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'cozy-ordering',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

// Menu (public)
app.get('/api/menu', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT id, name, category, price, image, description, sku, stock
      FROM products
      WHERE active = 1
      ORDER BY category, name
    `).all();
    res.json({ items });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Admin login
app.post('/api/auth/login', async (req, res) => {
  try {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      auditLog(req, 'LOGIN_FAILED', 'admin', null, { reason: 'validation' }, 400);
      return res.status(400).json({ error: 'Invalid credentials', requestId: req.id });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND active = 1').get(parsed.data.username);
    if (!admin) {
      auditLog(req, 'LOGIN_FAILED', 'admin', null, { reason: 'user_not_found' }, 401);
      logger.warn('Login: user not found', { username: parsed.data.username, requestId: req.id });
      return res.status(401).json({ error: 'Invalid credentials', requestId: req.id });
    }

    const passwordMatch = await bcrypt.compare(parsed.data.password, admin.password_hash);
    if (!passwordMatch) {
      auditLog(req, 'LOGIN_FAILED', 'admin', admin.id, { reason: 'password_mismatch' }, 401);
      logger.warn('Login: password mismatch', { adminId: admin.id, requestId: req.id });
      return res.status(401).json({ error: 'Invalid credentials', requestId: req.id });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: '8h' });
    auditLog(req, 'LOGIN_SUCCESS', 'admin', admin.id, {}, 200);
    logger.info('Admin login', { adminId: admin.id, username: admin.username, requestId: req.id });
    res.json({ token });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Create order (public, server-side calculation)
app.post('/api/orders', (req, res) => {
  let requestId = req.id;
  try {
    const parsed = orderSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn('Order validation failed', { requestId, errors: parsed.error.flatten() });
      return res.status(400).json({
        error: 'Invalid order',
        details: parsed.error.flatten(),
        requestId
      });
    }

    const { items, ...meta } = parsed.data;
    const productIds = items.map(i => i.productId);
    const placeholders = productIds.map(() => '?').join(',');

    // Fetch all products in one query (prevents price tampering)
    const products = db.prepare(`
      SELECT id, name, price, active, stock
      FROM products
      WHERE active = 1 AND id IN (${placeholders})
    `).all(...productIds);

    if (products.length !== new Set(productIds).size) {
      logger.warn('Order: missing/invalid products', { requestId, requestedIds: productIds, foundCount: products.length });
      return res.status(400).json({ error: 'One or more menu items are unavailable', requestId });
    }

    // Inventory check
    const byId = new Map(products.map(p => [p.id, p]));
    for (const item of items) {
      const product = byId.get(item.productId);
      if (product.stock >= 0 && product.stock < item.quantity) {
        logger.warn('Order: insufficient stock', { requestId, productId: item.productId, requested: item.quantity, available: product.stock });
        return res.status(400).json({ error: `Insufficient stock for ${product.name}`, requestId });
      }
    }

    // Calculate server-side
    let total = 0;
    const normalized = items.map(i => {
      const p = byId.get(i.productId);
      total += p.price * i.quantity;
      return { ...i, name: p.name, price: p.price };
    });

    const orderNumber = generateOrderNumber();

    // Transaction: create order + items
    const orderId = db.transaction(() => {
      const orderStmt = db.prepare(`
        INSERT INTO orders(order_number, table_number, customer_name, customer_phone, customer_email, total, notes, channel)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const orderRes = orderStmt.run(
        orderNumber,
        meta.tableNumber || null,
        meta.customerName || null,
        meta.customerPhone || null,
        meta.customerEmail || null,
        total,
        meta.notes || null,
        'web'
      );

      const itemStmt = db.prepare(`
        INSERT INTO order_items(order_id, product_id, name, price, quantity)
        VALUES(?, ?, ?, ?, ?)
      `);
      normalized.forEach(i => itemStmt.run(orderRes.lastInsertRowid, i.productId, i.name, i.price, i.quantity));

      return orderRes.lastInsertRowid;
    })();

    auditLog(req, 'ORDER_CREATED', 'order', orderId, { orderNumber, total }, 201);
    logger.info('Order created', { requestId, orderId, orderNumber, total });
    res.status(201).json({ id: orderId, orderNumber, total, status: 'pending' });
  } catch (err) {
    auditLog(req, 'ORDER_FAILED', 'order', null, { error: err.message }, 500);
    res.status(500).json(errorResponse(err, req));
  }
});

// List orders (admin)
app.get('/api/orders', authMiddleware, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const orders = db.prepare(`
      SELECT o.*,
             json_group_array(json_object('id', oi.id, 'name', oi.name, 'price', oi.price, 'quantity', oi.quantity)) items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) c FROM orders').get().c;

    const parsed = orders.map(o => ({
      ...o,
      items: JSON.parse(o.items || '[]')
    }));

    res.json({ items: parsed, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Get single order (public - by order number)
app.get('/api/orders/:orderNumber', (req, res) => {
  try {
    const order = db.prepare(`
      SELECT o.*,
             json_group_array(json_object('name', oi.name, 'price', oi.price, 'quantity', oi.quantity)) items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.order_number = ?
      GROUP BY o.id
    `).get(req.params.orderNumber);

    if (!order) return res.status(404).json({ error: 'Order not found', requestId: req.id });

    res.json({ ...order, items: JSON.parse(order.items || '[]') });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Update order status (admin)
app.patch('/api/orders/:id/status', authMiddleware, (req, res) => {
  try {
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid status', requestId: req.id });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found', requestId: req.id });

    const completedAt = parsed.data.status === 'completed' ? new Date().toISOString() : null;
    db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP, completed_at = ? WHERE id = ?')
      .run(parsed.data.status, completedAt, req.params.id);

    auditLog(req, 'ORDER_STATUS_UPDATED', 'order', req.params.id, { from: order.status, to: parsed.data.status });
    logger.info('Order status updated', { requestId: req.id, orderId: req.params.id, newStatus: parsed.data.status });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Create reservation (public)
app.post('/api/reservations', (req, res) => {
  try {
    const parsed = reservationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid reservation', details: parsed.error.flatten(), requestId: req.id });
    }

    // Check for existing reservation (same phone, date, time ±30min)
    const existing = db.prepare(`
      SELECT COUNT(*) c FROM reservations
      WHERE phone = ? AND date = ? AND status NOT IN ('cancelled')
      AND time BETWEEN datetime(? || ' -30 minutes') AND datetime(? || ' +30 minutes')
    `).get(parsed.data.phone, parsed.data.date, parsed.data.time, parsed.data.time).c;

    if (existing) {
      logger.warn('Reservation: duplicate attempt', { requestId: req.id, phone: parsed.data.phone, date: parsed.data.date });
      return res.status(409).json({ error: 'Reservation already exists for this date/time', requestId: req.id });
    }

    const result = db.prepare(`
      INSERT INTO reservations(name, phone, email, date, time, guests, special_requests)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `).run(
      parsed.data.name,
      parsed.data.phone,
      parsed.data.email || null,
      parsed.data.date,
      parsed.data.time,
      parsed.data.guests,
      parsed.data.specialRequests || null
    );

    logger.info('Reservation created', { requestId: req.id, reservationId: result.lastInsertRowid });
    res.status(201).json({ id: result.lastInsertRowid, status: 'requested' });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// List reservations (admin)
app.get('/api/reservations', authMiddleware, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const reservations = db.prepare(`
      SELECT * FROM reservations
      ORDER BY date DESC, time DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) c FROM reservations').get().c;

    res.json({ items: reservations, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Update reservation status (admin)
app.patch('/api/reservations/:id/status', authMiddleware, (req, res) => {
  try {
    const parsed = reservationStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid status', requestId: req.id });
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    if (!reservation) return res.status(404).json({ error: 'Reservation not found', requestId: req.id });

    db.prepare('UPDATE reservations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(parsed.data.status, req.params.id);

    auditLog(req, 'RESERVATION_STATUS_UPDATED', 'reservation', req.params.id, { from: reservation.status, to: parsed.data.status });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Join loyalty (public)
app.post('/api/loyalty/join', (req, res) => {
  try {
    const parsed = memberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid member details', details: parsed.error.flatten(), requestId: req.id });
    }

    const existing = db.prepare('SELECT id FROM loyalty_members WHERE phone = ?').get(parsed.data.phone);
    if (existing) {
      logger.warn('Loyalty: duplicate phone', { requestId: req.id, phone: parsed.data.phone });
      return res.status(409).json({ error: 'Member with this phone already exists', requestId: req.id });
    }

    const result = db.prepare(`
      INSERT INTO loyalty_members(name, phone, email)
      VALUES(?, ?, ?)
    `).run(parsed.data.name, parsed.data.phone, parsed.data.email || null);

    logger.info('Loyalty member created', { requestId: req.id, memberId: result.lastInsertRowid });
    res.status(201).json({ id: result.lastInsertRowid, points: 0 });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// List loyalty members (admin)
app.get('/api/loyalty', authMiddleware, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const members = db.prepare(`
      SELECT id, name, phone, email, points, tier, created_at
      FROM loyalty_members
      WHERE active = 1
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) c FROM loyalty_members WHERE active = 1').get().c;

    res.json({ items: members, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Admin stats (admin)
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  try {
    const stats = {
      orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c,
      pendingOrders: db.prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('pending', 'confirmed', 'preparing')").get().c,
      completedToday: db.prepare("SELECT COUNT(*) c FROM orders WHERE status='completed' AND date(created_at)=date('now')").get().c,
      reservations: db.prepare("SELECT COUNT(*) c FROM reservations WHERE status IN ('requested', 'confirmed')").get().c,
      members: db.prepare('SELECT COUNT(*) c FROM loyalty_members WHERE active = 1').get().c,
      revenue: db.prepare("SELECT COALESCE(SUM(total), 0) v FROM orders WHERE status = 'completed'").get().v,
      revenueToday: db.prepare("SELECT COALESCE(SUM(total), 0) v FROM orders WHERE status='completed' AND date(created_at)=date('now')").get().v
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Audit log (admin only)
app.get('/api/admin/audit', authMiddleware, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const logs = db.prepare(`
      SELECT id, admin_id, action, resource_type, resource_id, changes, request_id, ip_address, status_code, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c;

    res.json({ items: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json(errorResponse(err, req));
  }
});

// Static files & SPA fallback
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', requestId: req.id });
});

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  auditLog(req, 'ERROR', 'system', null, { error: err.message }, statusCode);
  res.status(statusCode).json(errorResponse(err, req, statusCode));
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
let isShuttingDown = false;
const shutdownGracefully = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('Graceful shutdown initiated');

  server.close(() => {
    logger.info('HTTP server closed');
    try {
      db.close();
      logger.info('Database closed');
    } catch (err) {
      logger.error('Database close error', { error: err.message });
    }
    process.exit(0);
  });

  // Force exit after 30s
  setTimeout(() => {
    logger.error('Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', shutdownGracefully);
process.on('SIGINT', shutdownGracefully);
process.on('uncaughtException', err => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdownGracefully();
});
process.on('unhandledRejection', err => {
  logger.error('Unhandled rejection', { error: err?.message || err, stack: err?.stack });
  shutdownGracefully();
});

// ============================================================================
// START SERVER
// ============================================================================
const server = app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: NODE_ENV,
    database: DB_PATH,
    corsOrigin: CORS_ORIGIN === true ? 'any' : CORS_ORIGIN
  });
});

module.exports = { app, db };
