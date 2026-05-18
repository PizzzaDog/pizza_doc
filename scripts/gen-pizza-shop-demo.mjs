// Phase 2 generator: writes spaces/pizza-shop-demo/ per page 08.
// Every `description: "TODO: ..."` marks a spot the human should review.
// Re-runnable: wipes and rewrites the directory.
// Uses yaml.stringify so descriptions with colons/braces/apostrophes are
// quoted correctly.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringify as yamlStringify } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../spaces/pizza-shop-demo')

rmSync(ROOT, { recursive: true, force: true })

function write(rel, data) {
  const abs = path.join(ROOT, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, yamlStringify(data, { lineWidth: 0 }))
}

// ---------- space.yaml ----------
write('space.yaml', {
  meta: {
    id: 'pizza-shop-demo',
    name: 'Pizza Shop Demo',
    description:
      'A minimal pizza-ordering web app that exercises every feature of Pizza Doc — three actors, four modules, seven use cases, cross-module dataFlow, and database interactions.',
    version: '0.1.0',
    pizzaDocVersion: '0.1.0',
  },
})

// ---------- actors ----------
write('actors/anonymous-visitor.yaml', {
  kind: 'actor',
  id: 'anonymous-visitor',
  name: 'Anonymous Visitor',
  type: 'user',
  description: 'A site visitor who has not yet registered or logged in.',
})
write('actors/customer.yaml', {
  kind: 'actor',
  id: 'customer',
  name: 'Customer',
  type: 'user',
  description: 'A registered user who browses the menu and places pizza orders.',
})
write('actors/admin.yaml', {
  kind: 'actor',
  id: 'admin',
  name: 'Admin',
  type: 'user',
  description: 'Staff user who manages the pizza catalog.',
})

// ---------- modules ----------
write('modules/web-frontend/module.yaml', {
  kind: 'module',
  id: 'web-frontend',
  name: 'Web Frontend',
  type: 'frontend',
  techStack: 'React 19 + TypeScript + Vite',
  description: 'Customer-facing and admin-facing SPA that talks to api-server over HTTP.',
})
write('modules/api-server/module.yaml', {
  kind: 'module',
  id: 'api-server',
  name: 'API Server',
  type: 'service',
  techStack: 'Spring Boot 3 + Java 21',
  description:
    'Backend service that owns authentication, menu, and order processing; persists to postgres-db.',
})
write('modules/postgres-db/module.yaml', {
  kind: 'module',
  id: 'postgres-db',
  name: 'Postgres',
  type: 'database',
  techStack: 'PostgreSQL 16',
  description: 'Relational store for users, sessions, menu items, and orders.',
})
write('modules/stripe/module.yaml', {
  kind: 'module',
  id: 'stripe',
  name: 'Stripe',
  type: 'external',
  techStack: 'Stripe REST API',
  description: 'External payment provider; the only path through which money leaves the system.',
})

// ---------- api-server domains ----------
write('modules/api-server/domains/users/domain.yaml', {
  id: 'users',
  name: 'Users',
  description: 'User accounts, password credentials, and session tokens.',
})
write('modules/api-server/domains/menu/domain.yaml', {
  id: 'menu',
  name: 'Menu',
  description: 'The pizza catalog visible to customers and editable by admins.',
})
write('modules/api-server/domains/orders/domain.yaml', {
  id: 'orders',
  name: 'Orders',
  description: 'Shopping-cart checkout and payment orchestration.',
})

// ---------- postgres-db domains ----------
write('modules/postgres-db/domains/users/domain.yaml', {
  id: 'users',
  name: 'Users schema',
  description: 'Tables for user accounts and active sessions.',
})
write('modules/postgres-db/domains/menu/domain.yaml', {
  id: 'menu',
  name: 'Menu schema',
  description: 'Table for the pizza catalog.',
})
write('modules/postgres-db/domains/orders/domain.yaml', {
  id: 'orders',
  name: 'Orders schema',
  description: 'Tables for orders and their line items.',
})

// ---------- tables ----------
// Non-null created_at columns deliberately produce a DATAFLOW_UNWRITTEN_COLUMN
// warning until ColumnSchema grows a `default` attribute in v0.2. The warning
// honestly surfaces the spec gap; a nullable hack would hide it.
const CREATED_AT_NOTE =
  'Non-null; populated server-side (DB DEFAULT now()). Pizza Doc has no `default` column attribute yet — validator will warn until v0.2.'

write('modules/postgres-db/domains/users/tables/users.yaml', {
  kind: 'table',
  id: 'users',
  name: 'users',
  description: 'One row per registered user; email is unique.',
  columns: [
    { name: 'id', sqlType: 'uuid', primaryKey: true },
    { name: 'email', sqlType: 'varchar(255)', unique: true },
    {
      name: 'password_hash',
      sqlType: 'varchar(255)',
      description: 'Bcrypt hash; plaintext password is never stored.',
    },
    { name: 'display_name', sqlType: 'varchar(100)', nullable: true },
    { name: 'created_at', sqlType: 'timestamptz', description: CREATED_AT_NOTE },
  ],
  indexes: [{ name: 'idx_users_email', columns: ['email'], unique: true }],
})
write('modules/postgres-db/domains/users/tables/sessions.yaml', {
  kind: 'table',
  id: 'sessions',
  name: 'sessions',
  description: 'Active session tokens issued by login; expires_at lets us purge stale rows.',
  columns: [
    { name: 'id', sqlType: 'uuid', primaryKey: true },
    {
      name: 'user_id',
      sqlType: 'uuid',
      foreignKey: { table: 'module:postgres-db/domain:users/table:users', column: 'id' },
    },
    { name: 'token', sqlType: 'varchar(255)', unique: true },
    { name: 'expires_at', sqlType: 'timestamptz' },
    {
      name: 'created_at',
      sqlType: 'timestamptz',
      description:
        'Non-null; populated server-side (DB DEFAULT now()). Same v0.2 note as users.created_at.',
    },
  ],
  indexes: [{ name: 'idx_sessions_token', columns: ['token'], unique: true }],
})
write('modules/postgres-db/domains/menu/tables/pizzas.yaml', {
  kind: 'table',
  id: 'pizzas',
  name: 'pizzas',
  description:
    'Menu items; price_cents is stored as integer cents to avoid floating-point rounding.',
  columns: [
    { name: 'id', sqlType: 'uuid', primaryKey: true },
    { name: 'name', sqlType: 'varchar(100)' },
    { name: 'price_cents', sqlType: 'int' },
    {
      name: 'available',
      sqlType: 'boolean',
      description:
        'Soft-delete flag; admins toggle this instead of removing rows so historical orders keep referring to real pizzas.',
    },
    { name: 'image_url', sqlType: 'varchar(500)', nullable: true },
    {
      name: 'created_at',
      sqlType: 'timestamptz',
      description:
        'Non-null; populated server-side (DB DEFAULT now()). Same v0.2 note as users.created_at.',
    },
  ],
})
write('modules/postgres-db/domains/orders/tables/orders.yaml', {
  kind: 'table',
  id: 'orders',
  name: 'orders',
  description: 'One row per placed order; total_cents is the final charged amount.',
  columns: [
    { name: 'id', sqlType: 'uuid', primaryKey: true },
    {
      name: 'user_id',
      sqlType: 'uuid',
      foreignKey: { table: 'module:postgres-db/domain:users/table:users', column: 'id' },
    },
    {
      name: 'status',
      sqlType: 'varchar(32)',
      description:
        'TODO: enumerate allowed values (pending/paid/failed/cancelled) — DB enum or free varchar with app-side whitelist?',
    },
    { name: 'total_cents', sqlType: 'int' },
    {
      name: 'stripe_charge_id',
      sqlType: 'varchar(255)',
      nullable: true,
      description:
        'Populated after a successful Stripe charge; null for failed or not-yet-charged orders.',
    },
    {
      name: 'created_at',
      sqlType: 'timestamptz',
      description:
        'Non-null; populated server-side (DB DEFAULT now()). Same v0.2 note as users.created_at.',
    },
  ],
})
write('modules/postgres-db/domains/orders/tables/order_items.yaml', {
  kind: 'table',
  id: 'order_items',
  name: 'order_items',
  description:
    "Line items; unit_price_cents is snapshotted at order time so later price changes don't mutate history.",
  columns: [
    { name: 'id', sqlType: 'uuid', primaryKey: true },
    {
      name: 'order_id',
      sqlType: 'uuid',
      foreignKey: { table: 'module:postgres-db/domain:orders/table:orders', column: 'id' },
    },
    {
      name: 'pizza_id',
      sqlType: 'uuid',
      foreignKey: { table: 'module:postgres-db/domain:menu/table:pizzas', column: 'id' },
    },
    { name: 'quantity', sqlType: 'int' },
    {
      name: 'unit_price_cents',
      sqlType: 'int',
      description: 'Copied from pizzas.price_cents at the moment the order is placed.',
    },
  ],
})

// ---------- models: users domain ----------
write('modules/api-server/domains/users/models/CreateUserRequest.yaml', {
  kind: 'model',
  id: 'CreateUserRequest',
  name: 'CreateUserRequest',
  modelKind: 'dto',
  description: 'Request body of POST /api/auth/signup.',
  fields: [
    {
      name: 'email',
      type: 'string',
      description: 'RFC-5322 email; uniqueness is enforced at the DB level.',
    },
    {
      name: 'password',
      type: 'string',
      description: 'Plaintext password, at least 8 characters; never persisted in this form.',
    },
    {
      name: 'displayName',
      type: 'string',
      optional: true,
      description: 'Optional human-readable name shown in the UI.',
    },
  ],
})
write('modules/api-server/domains/users/models/LoginRequest.yaml', {
  kind: 'model',
  id: 'LoginRequest',
  name: 'LoginRequest',
  modelKind: 'dto',
  description: 'Request body of POST /api/auth/login.',
  fields: [
    { name: 'email', type: 'string' },
    { name: 'password', type: 'string' },
  ],
})
write('modules/api-server/domains/users/models/RegisterResponse.yaml', {
  kind: 'model',
  id: 'RegisterResponse',
  name: 'RegisterResponse',
  modelKind: 'dto',
  description:
    'Response to a successful signup; does not include a session — the client must follow up with /login.',
  fields: [
    { name: 'userId', type: 'uuid' },
    { name: 'email', type: 'string' },
  ],
})
write('modules/api-server/domains/users/models/LoginResponse.yaml', {
  kind: 'model',
  id: 'LoginResponse',
  name: 'LoginResponse',
  modelKind: 'dto',
  description:
    'Response to a successful login; the token is the session token the client attaches to subsequent requests.',
  fields: [
    { name: 'token', type: 'string' },
    { name: 'userId', type: 'uuid' },
    { name: 'expiresAt', type: 'timestamp' },
  ],
})
write('modules/api-server/domains/users/models/User.yaml', {
  kind: 'model',
  id: 'User',
  name: 'User',
  modelKind: 'entity',
  persistedAs: 'module:postgres-db/domain:users/table:users',
  description: 'Domain entity for a registered user; maps one-to-one to the users table.',
  fields: [
    { name: 'id', type: 'uuid' },
    { name: 'email', type: 'string' },
    { name: 'passwordHash', type: 'string' },
    { name: 'displayName', type: 'string', optional: true },
    { name: 'createdAt', type: 'timestamp', optional: true },
  ],
})
write('modules/api-server/domains/users/models/SessionToken.yaml', {
  kind: 'model',
  id: 'SessionToken',
  name: 'SessionToken',
  modelKind: 'entity',
  persistedAs: 'module:postgres-db/domain:users/table:sessions',
  description: 'Issued on login; persisted so it can be revoked and expired.',
  fields: [
    { name: 'id', type: 'uuid' },
    { name: 'userId', type: 'uuid' },
    { name: 'token', type: 'string' },
    { name: 'expiresAt', type: 'timestamp' },
  ],
})

// ---------- models: menu domain ----------
write('modules/api-server/domains/menu/models/Pizza.yaml', {
  kind: 'model',
  id: 'Pizza',
  name: 'Pizza',
  modelKind: 'entity',
  persistedAs: 'module:postgres-db/domain:menu/table:pizzas',
  description:
    "A menu item; 'available: false' hides it from the customer menu without deleting history.",
  fields: [
    { name: 'id', type: 'uuid' },
    { name: 'name', type: 'string' },
    { name: 'priceCents', type: 'int' },
    { name: 'available', type: 'boolean' },
    { name: 'imageUrl', type: 'string', optional: true },
  ],
})
write('modules/api-server/domains/menu/models/PizzaListResponse.yaml', {
  kind: 'model',
  id: 'PizzaListResponse',
  name: 'PizzaListResponse',
  modelKind: 'dto',
  description: 'Response body of GET /api/menu; a flat list of pizzas.',
  fields: [{ name: 'pizzas', type: 'List<Pizza>' }],
})
write('modules/api-server/domains/menu/models/CreatePizzaRequest.yaml', {
  kind: 'model',
  id: 'CreatePizzaRequest',
  name: 'CreatePizzaRequest',
  modelKind: 'dto',
  description: 'Admin-only request body of POST /api/admin/menu.',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'priceCents', type: 'int' },
    { name: 'available', type: 'boolean' },
    { name: 'imageUrl', type: 'string', optional: true },
  ],
})
write('modules/api-server/domains/menu/models/UpdatePizzaRequest.yaml', {
  kind: 'model',
  id: 'UpdatePizzaRequest',
  name: 'UpdatePizzaRequest',
  modelKind: 'dto',
  description: 'Partial update; any omitted field keeps its current value.',
  fields: [
    { name: 'name', type: 'string', optional: true },
    { name: 'priceCents', type: 'int', optional: true },
    { name: 'available', type: 'boolean', optional: true },
    { name: 'imageUrl', type: 'string', optional: true },
  ],
})

// ---------- models: orders domain ----------
// OrderItem (entity, persisted) vs CreateOrderItemRequest (wire DTO from client)
// is split deliberately so id/orderId/unitPriceCents stay required on the
// entity while the client-facing shape only carries pizzaId + quantity.
write('modules/api-server/domains/orders/models/OrderItem.yaml', {
  kind: 'model',
  id: 'OrderItem',
  name: 'OrderItem',
  modelKind: 'entity',
  persistedAs: 'module:postgres-db/domain:orders/table:order_items',
  description:
    'A single pizza line on an order. All fields required on the persisted entity; client-side checkout uses CreateOrderItemRequest instead.',
  fields: [
    { name: 'id', type: 'uuid' },
    { name: 'orderId', type: 'uuid' },
    { name: 'pizzaId', type: 'uuid' },
    { name: 'quantity', type: 'int' },
    {
      name: 'unitPriceCents',
      type: 'int',
      description: 'Snapshotted from pizzas.price_cents at the moment OrderService.place runs.',
    },
  ],
})
write('modules/api-server/domains/orders/models/CreateOrderItemRequest.yaml', {
  kind: 'model',
  id: 'CreateOrderItemRequest',
  name: 'CreateOrderItemRequest',
  modelKind: 'dto',
  description:
    'Client-side line-item shape sent inside CreateOrderRequest.items. id, orderId, and unitPriceCents are set by the server and intentionally absent here.',
  fields: [
    { name: 'pizzaId', type: 'uuid' },
    { name: 'quantity', type: 'int' },
  ],
})
write('modules/api-server/domains/orders/models/Order.yaml', {
  kind: 'model',
  id: 'Order',
  name: 'Order',
  modelKind: 'entity',
  persistedAs: 'module:postgres-db/domain:orders/table:orders',
  description:
    'The persisted order aggregate. Items are embedded for simplicity; real projects may split into Order (persisted) + OrderAggregate (projected with items joined from order_items).',
  fields: [
    { name: 'id', type: 'uuid' },
    { name: 'userId', type: 'uuid' },
    { name: 'status', type: 'string' },
    { name: 'totalCents', type: 'int' },
    {
      name: 'items',
      type: 'List<OrderItem>',
      description:
        'Aggregate embedding; joined from order_items. MODEL_FIELD_MISSING_COLUMN will warn on this field — that is the validator honestly flagging the aggregate/projection gap.',
    },
    { name: 'stripeChargeId', type: 'string', optional: true },
  ],
})
write('modules/api-server/domains/orders/models/CreateOrderRequest.yaml', {
  kind: 'model',
  id: 'CreateOrderRequest',
  name: 'CreateOrderRequest',
  modelKind: 'dto',
  description: 'Customer checkout payload; items is a list of {pizzaId, quantity}.',
  fields: [
    {
      name: 'items',
      type: 'List<CreateOrderItemRequest>',
      description:
        'Line items as sent by the client. Server re-prices each from the current pizzas.price_cents at order time.',
    },
    {
      name: 'sourceToken',
      type: 'string',
      description: 'Stripe payment-method token captured by Stripe.js on the client.',
    },
  ],
})
write('modules/api-server/domains/orders/models/OrderResponse.yaml', {
  kind: 'model',
  id: 'OrderResponse',
  name: 'OrderResponse',
  modelKind: 'dto',
  description:
    'Response to a successful checkout; minimum info the UI needs to show an order summary.',
  fields: [
    { name: 'orderId', type: 'uuid' },
    { name: 'status', type: 'string' },
    { name: 'totalCents', type: 'int' },
  ],
})
write('modules/api-server/domains/orders/models/PaymentRequest.yaml', {
  kind: 'model',
  id: 'PaymentRequest',
  name: 'PaymentRequest',
  modelKind: 'dto',
  description: "What PaymentGateway sends to Stripe; amount is in cents to match Stripe's API.",
  fields: [
    { name: 'orderId', type: 'uuid' },
    { name: 'amountCents', type: 'int' },
    { name: 'sourceToken', type: 'string' },
  ],
})
write('modules/api-server/domains/orders/models/PaymentResult.yaml', {
  kind: 'model',
  id: 'PaymentResult',
  name: 'PaymentResult',
  modelKind: 'dto',
  description:
    "Stripe's response reshaped for our use; success=false means the charge was declined.",
  fields: [
    { name: 'success', type: 'boolean' },
    { name: 'chargeId', type: 'string', optional: true },
    { name: 'declineReason', type: 'string', optional: true },
  ],
})

// ---------- components: web-frontend ----------
write('modules/web-frontend/components/SignupPage.yaml', {
  kind: 'component',
  id: 'SignupPage',
  name: 'SignupPage',
  type: 'page',
  description: 'Signup form at /signup that captures email, password, and optional display name.',
  methods: [
    {
      name: 'submit',
      params: [{ name: 'form', type: 'CreateUserRequest' }],
      returns: 'void',
      calls: ['module:web-frontend/component:authClient/method:signup'],
      description: "Invoked by the form's onSubmit; delegates the HTTP call to authClient.",
    },
  ],
})
write('modules/web-frontend/components/LoginPage.yaml', {
  kind: 'component',
  id: 'LoginPage',
  name: 'LoginPage',
  type: 'page',
  description:
    'Login form at /login; on success, stores the returned session token in an HTTP-only cookie.',
  methods: [
    {
      name: 'submit',
      params: [{ name: 'form', type: 'LoginRequest' }],
      returns: 'void',
      calls: ['module:web-frontend/component:authClient/method:login'],
    },
  ],
})
write('modules/web-frontend/components/MenuPage.yaml', {
  kind: 'component',
  id: 'MenuPage',
  name: 'MenuPage',
  type: 'page',
  description: '/menu — fetches pizzas on mount and renders each via PizzaCard.',
  methods: [
    {
      name: 'load',
      returns: 'PizzaListResponse',
      calls: ['module:web-frontend/component:menuClient/method:list'],
    },
  ],
})
write('modules/web-frontend/components/CartPage.yaml', {
  kind: 'component',
  id: 'CartPage',
  name: 'CartPage',
  type: 'page',
  description: '/cart — shows the current cart via CartSummary and triggers checkout on submit.',
  methods: [
    {
      name: 'checkout',
      params: [{ name: 'order', type: 'CreateOrderRequest' }],
      returns: 'OrderResponse',
      calls: [
        'module:web-frontend/component:CartSummary/method:compute',
        'module:web-frontend/component:orderClient/method:create',
      ],
      description:
        'Computes totals locally for display, then submits the full order to orderClient.',
    },
  ],
})
write('modules/web-frontend/components/OrderHistoryPage.yaml', {
  kind: 'component',
  id: 'OrderHistoryPage',
  name: 'OrderHistoryPage',
  type: 'page',
  description: "/orders — lists the current customer's past orders.",
  methods: [
    {
      name: 'load',
      returns: 'List<Order>',
      calls: ['module:web-frontend/component:orderClient/method:listMine'],
      description:
        'Fetches the current customer\'s orders. Pagination is out of scope for v0.1 — see docs/backlog.md.',
    },
  ],
})
write('modules/web-frontend/components/AdminMenuPage.yaml', {
  kind: 'component',
  id: 'AdminMenuPage',
  name: 'AdminMenuPage',
  type: 'page',
  description: '/admin/menu — admin-only CRUD over the pizza catalog.',
  methods: [
    {
      name: 'addPizza',
      params: [{ name: 'request', type: 'CreatePizzaRequest' }],
      returns: 'void',
      calls: ['module:web-frontend/component:menuClient/method:create'],
    },
    {
      name: 'updatePizza',
      params: [{ name: 'request', type: 'UpdatePizzaRequest' }],
      returns: 'void',
      calls: ['module:web-frontend/component:menuClient/method:update'],
    },
  ],
})
write('modules/web-frontend/components/authClient.yaml', {
  kind: 'component',
  id: 'authClient',
  name: 'authClient',
  type: 'client',
  description: 'HTTP client for /api/auth/*; uses fetch + JSON.',
  methods: [
    {
      name: 'signup',
      params: [{ name: 'request', type: 'CreateUserRequest' }],
      returns: 'RegisterResponse',
      httpMethod: 'POST',
      httpPath: '/api/auth/signup',
    },
    {
      name: 'login',
      params: [{ name: 'request', type: 'LoginRequest' }],
      returns: 'LoginResponse',
      httpMethod: 'POST',
      httpPath: '/api/auth/login',
    },
  ],
})
write('modules/web-frontend/components/menuClient.yaml', {
  kind: 'component',
  id: 'menuClient',
  name: 'menuClient',
  type: 'client',
  description: 'HTTP client for /api/menu/* and /api/admin/menu/*.',
  methods: [
    { name: 'list', returns: 'PizzaListResponse', httpMethod: 'GET', httpPath: '/api/menu' },
    {
      name: 'create',
      params: [{ name: 'request', type: 'CreatePizzaRequest' }],
      returns: 'Pizza',
      httpMethod: 'POST',
      httpPath: '/api/admin/menu',
    },
    {
      name: 'update',
      params: [{ name: 'request', type: 'UpdatePizzaRequest' }],
      returns: 'Pizza',
      httpMethod: 'PATCH',
      httpPath: '/api/admin/menu/{id}',
      description:
        'TODO: pizza id is in the URL path, not the body — do we want a separate {id, request} param shape to make that explicit?',
    },
  ],
})
write('modules/web-frontend/components/orderClient.yaml', {
  kind: 'component',
  id: 'orderClient',
  name: 'orderClient',
  type: 'client',
  description: 'HTTP client for /api/orders; authenticated via session cookie.',
  methods: [
    {
      name: 'create',
      params: [{ name: 'request', type: 'CreateOrderRequest' }],
      returns: 'OrderResponse',
      httpMethod: 'POST',
      httpPath: '/api/orders',
    },
    {
      name: 'listMine',
      returns: 'List<Order>',
      httpMethod: 'GET',
      httpPath: '/api/orders',
    },
  ],
})
write('modules/web-frontend/components/PizzaCard.yaml', {
  kind: 'component',
  id: 'PizzaCard',
  name: 'PizzaCard',
  type: 'widget',
  description:
    'Presentational card for a single pizza (name, price, availability, image). Rendering is intentionally not modeled as a method — Pizza Doc describes structure and runtime flows, not React render trees; the widget is exposed so designers and docs can reference it by ref.',
})
write('modules/web-frontend/components/CartSummary.yaml', {
  kind: 'component',
  id: 'CartSummary',
  name: 'CartSummary',
  type: 'widget',
  description:
    'Inline summary at the top of CartPage; recomputes subtotal client-side as quantities change.',
  methods: [
    {
      name: 'compute',
      params: [{ name: 'items', type: 'List<OrderItem>' }],
      returns: 'int',
      description:
        'Returns the subtotal in cents; should match server-side Order.totalCents at checkout time.',
    },
  ],
})

// ---------- components: api-server users ----------
write('modules/api-server/domains/users/components/AuthController.yaml', {
  kind: 'component',
  id: 'AuthController',
  name: 'AuthController',
  type: 'controller',
  description: 'HTTP entry point for signup and login.',
  methods: [
    {
      name: 'signup',
      params: [{ name: 'request', type: 'CreateUserRequest' }],
      returns: 'RegisterResponse',
      httpMethod: 'POST',
      httpPath: '/api/auth/signup',
      calls: ['module:api-server/domain:users/component:UserService/method:create'],
      throws: ['EmailAlreadyExistsException', 'WeakPasswordException'],
    },
    {
      name: 'login',
      params: [{ name: 'request', type: 'LoginRequest' }],
      returns: 'LoginResponse',
      httpMethod: 'POST',
      httpPath: '/api/auth/login',
      calls: ['module:api-server/domain:users/component:UserService/method:authenticate'],
      throws: ['InvalidCredentialsException'],
    },
  ],
})
write('modules/api-server/domains/users/components/UserService.yaml', {
  kind: 'component',
  id: 'UserService',
  name: 'UserService',
  type: 'service',
  description:
    'Owns user-lifecycle invariants — unique email on create, password policy, and credentials check on login.',
  methods: [
    {
      name: 'create',
      params: [{ name: 'request', type: 'CreateUserRequest' }],
      returns: 'User',
      calls: [
        'module:api-server/domain:users/component:UserRepository/method:findByEmail',
        'module:api-server/domain:users/component:PasswordHasher/method:hash',
        'module:api-server/domain:users/component:UserRepository/method:save',
      ],
      throws: ['EmailAlreadyExistsException', 'WeakPasswordException'],
      description:
        'Rejects duplicates via findByEmail, hashes the password, then persists the row.',
    },
    {
      name: 'authenticate',
      params: [{ name: 'request', type: 'LoginRequest' }],
      returns: 'SessionToken',
      calls: [
        'module:api-server/domain:users/component:UserRepository/method:findByEmail',
        'module:api-server/domain:users/component:PasswordHasher/method:verify',
        'module:api-server/domain:users/component:SessionTokenService/method:issue',
      ],
      throws: ['InvalidCredentialsException'],
      description:
        'Verifies credentials and delegates token issuance; the controller layer turns the SessionToken into an HTTP cookie.',
    },
  ],
})
write('modules/api-server/domains/users/components/UserRepository.yaml', {
  kind: 'component',
  id: 'UserRepository',
  name: 'UserRepository',
  type: 'repository',
  description: 'Persists and retrieves user entities from the users table.',
  methods: [
    { name: 'save', params: [{ name: 'user', type: 'User' }], returns: 'User' },
    {
      name: 'findByEmail',
      params: [{ name: 'email', type: 'string' }],
      returns: 'Optional<User>',
      description:
        'Returns the matched user or empty; UserService turns empty into InvalidCredentialsException on login or enters the insert branch on signup.',
    },
  ],
})
write('modules/api-server/domains/users/components/PasswordHasher.yaml', {
  kind: 'component',
  id: 'PasswordHasher',
  name: 'PasswordHasher',
  type: 'infrastructure',
  description:
    'Bcrypt wrapper; hash is one-way, verify compares a plaintext attempt to a stored hash.',
  methods: [
    { name: 'hash', params: [{ name: 'plaintext', type: 'string' }], returns: 'string' },
    {
      name: 'verify',
      params: [
        { name: 'plaintext', type: 'string' },
        { name: 'hash', type: 'string' },
      ],
      returns: 'boolean',
    },
  ],
})
write('modules/api-server/domains/users/components/SessionTokenService.yaml', {
  kind: 'component',
  id: 'SessionTokenService',
  name: 'SessionTokenService',
  type: 'infrastructure',
  description:
    'Mints new session tokens, persists them to the sessions table, and validates incoming tokens.',
  methods: [
    {
      name: 'issue',
      params: [{ name: 'userId', type: 'uuid' }],
      returns: 'SessionToken',
      description:
        'Generates a random token and writes a row into sessions with expires_at = now + 7d.',
    },
    {
      name: 'validate',
      params: [{ name: 'token', type: 'string' }],
      returns: 'uuid',
      description:
        'Returns the userId if the token exists and is not expired; throws InvalidCredentialsException otherwise.',
    },
  ],
})

// ---------- components: api-server menu ----------
write('modules/api-server/domains/menu/components/MenuController.yaml', {
  kind: 'component',
  id: 'MenuController',
  name: 'MenuController',
  type: 'controller',
  description: 'HTTP entry point for the public menu and the admin CRUD endpoints.',
  methods: [
    {
      name: 'list',
      returns: 'PizzaListResponse',
      httpMethod: 'GET',
      httpPath: '/api/menu',
      calls: ['module:api-server/domain:menu/component:MenuService/method:list'],
    },
    {
      name: 'create',
      params: [{ name: 'request', type: 'CreatePizzaRequest' }],
      returns: 'Pizza',
      httpMethod: 'POST',
      httpPath: '/api/admin/menu',
      calls: ['module:api-server/domain:menu/component:MenuService/method:add'],
      throws: ['UnauthorizedException', 'ValidationException'],
    },
    {
      name: 'update',
      params: [{ name: 'request', type: 'UpdatePizzaRequest' }],
      returns: 'Pizza',
      httpMethod: 'PATCH',
      httpPath: '/api/admin/menu/{id}',
      calls: ['module:api-server/domain:menu/component:MenuService/method:update'],
      throws: ['UnauthorizedException', 'ValidationException'],
    },
  ],
})
write('modules/api-server/domains/menu/components/MenuService.yaml', {
  kind: 'component',
  id: 'MenuService',
  name: 'MenuService',
  type: 'service',
  description:
    'Menu business logic; admin-supplied fields are validated here before hitting the repository.',
  methods: [
    {
      name: 'list',
      returns: 'PizzaListResponse',
      calls: ['module:api-server/domain:menu/component:PizzaRepository/method:findAvailable'],
      description:
        'Calls findAvailable (which pushes the available=true filter into the repository), then wraps the List<Pizza> into PizzaListResponse.',
    },
    {
      name: 'add',
      params: [{ name: 'request', type: 'CreatePizzaRequest' }],
      returns: 'Pizza',
      calls: ['module:api-server/domain:menu/component:PizzaRepository/method:save'],
      throws: ['ValidationException'],
    },
    {
      name: 'update',
      params: [{ name: 'request', type: 'UpdatePizzaRequest' }],
      returns: 'Pizza',
      calls: [
        'module:api-server/domain:menu/component:PizzaRepository/method:findById',
        'module:api-server/domain:menu/component:PizzaRepository/method:save',
      ],
      throws: ['ValidationException'],
    },
  ],
})
write('modules/api-server/domains/menu/components/PizzaRepository.yaml', {
  kind: 'component',
  id: 'PizzaRepository',
  name: 'PizzaRepository',
  type: 'repository',
  description: 'Persistence for the pizzas table.',
  methods: [
    {
      name: 'findAvailable',
      returns: 'List<Pizza>',
      description: 'Returns entities; MenuService wraps the list into PizzaListResponse.',
    },
    {
      name: 'findById',
      params: [{ name: 'id', type: 'uuid' }],
      returns: 'Optional<Pizza>',
    },
    { name: 'save', params: [{ name: 'pizza', type: 'Pizza' }], returns: 'Pizza' },
  ],
})

// ---------- components: api-server orders ----------
write('modules/api-server/domains/orders/components/OrderController.yaml', {
  kind: 'component',
  id: 'OrderController',
  name: 'OrderController',
  type: 'controller',
  description: 'HTTP entry point for checkout and personal order history.',
  methods: [
    {
      name: 'create',
      params: [{ name: 'request', type: 'CreateOrderRequest' }],
      returns: 'OrderResponse',
      httpMethod: 'POST',
      httpPath: '/api/orders',
      calls: ['module:api-server/domain:orders/component:OrderService/method:place'],
      throws: ['StripeDeclinedException', 'OutOfStockException'],
    },
    {
      name: 'listMine',
      returns: 'List<Order>',
      httpMethod: 'GET',
      httpPath: '/api/orders',
      calls: ['module:api-server/domain:orders/component:OrderRepository/method:findByUser'],
    },
  ],
})
write('modules/api-server/domains/orders/components/OrderService.yaml', {
  kind: 'component',
  id: 'OrderService',
  name: 'OrderService',
  type: 'service',
  description: 'Orchestrates checkout — stock check, pricing, charge, persist, in that order.',
  methods: [
    {
      name: 'place',
      params: [
        { name: 'request', type: 'CreateOrderRequest' },
        { name: 'userId', type: 'uuid' },
      ],
      returns: 'OrderResponse',
      calls: [
        'module:api-server/domain:menu/component:PizzaRepository/method:findById',
        'module:api-server/domain:orders/component:PaymentGateway/method:charge',
        'module:api-server/domain:orders/component:OrderRepository/method:save',
      ],
      throws: ['StripeDeclinedException', 'OutOfStockException'],
      description:
        'For each item, verify the pizza is available and read current price; charge Stripe; persist the order. Rolls back persist if Stripe declines.',
    },
  ],
})
write('modules/api-server/domains/orders/components/OrderRepository.yaml', {
  kind: 'component',
  id: 'OrderRepository',
  name: 'OrderRepository',
  type: 'repository',
  description:
    'Persists orders and their line items; save is transactional across orders and order_items.',
  methods: [
    { name: 'save', params: [{ name: 'order', type: 'Order' }], returns: 'Order' },
    {
      name: 'findByUser',
      params: [{ name: 'userId', type: 'uuid' }],
      returns: 'List<Order>',
    },
  ],
})
write('modules/api-server/domains/orders/components/PaymentGateway.yaml', {
  kind: 'component',
  id: 'PaymentGateway',
  name: 'PaymentGateway',
  type: 'infrastructure',
  description:
    "Thin wrapper around StripeAPI; translates our PaymentRequest into Stripe's schema and back.",
  methods: [
    {
      name: 'charge',
      params: [{ name: 'request', type: 'PaymentRequest' }],
      returns: 'PaymentResult',
      calls: ['module:stripe/component:StripeAPI/method:createCharge'],
      throws: ['StripeDeclinedException'],
    },
  ],
})

// ---------- components: stripe ----------
write('modules/stripe/components/StripeAPI.yaml', {
  kind: 'component',
  id: 'StripeAPI',
  name: 'StripeAPI',
  type: 'client',
  description:
    "External REST client; only createCharge is modeled — other endpoints aren't in our critical path.",
  methods: [
    {
      name: 'createCharge',
      params: [{ name: 'request', type: 'PaymentRequest' }],
      returns: 'PaymentResult',
      httpMethod: 'POST',
      httpPath: '/v1/charges',
      description:
        "Stripe's real API also takes a currency field; omitted here for demo simplicity. A real integration would include it on PaymentRequest.",
    },
  ],
})

// ---------- use cases ----------
write('use-cases/user-registration.yaml', {
  kind: 'usecase',
  id: 'user-registration',
  name: 'User registers in the system',
  actor: 'actor:anonymous-visitor',
  trigger: 'Submitting the signup form on /signup in web-frontend',
  description:
    'Demonstrates a simple three-tier flow (page → service → DB) plus a DTO transformation (password → bcrypt hash) and basic invariants.',
  invariants: {
    pre: [
      'No user with the provided email exists in the users table',
      'Password is at least 8 characters long',
    ],
    post: [
      'A new row exists in users with the provided email',
      'users.password_hash contains a bcrypt hash of the provided password',
      "The response returned to the client contains the new user's id",
    ],
  },
  steps: [
    {
      from: 'module:web-frontend/component:SignupPage',
      to: 'module:web-frontend/component:authClient',
      via: 'module:api-server/domain:users/model:CreateUserRequest',
      protocol: 'internal-call',
      description: 'Page-level submit handler delegates to the HTTP client wrapper.',
    },
    {
      from: 'module:web-frontend/component:authClient',
      to: 'module:api-server/domain:users/component:AuthController',
      via: 'module:api-server/domain:users/model:CreateUserRequest',
      protocol: 'http',
      description: 'POST /api/auth/signup over the wire.',
    },
    {
      from: 'module:api-server/domain:users/component:AuthController',
      to: 'module:api-server/domain:users/component:UserService',
      via: 'module:api-server/domain:users/model:CreateUserRequest',
      protocol: 'internal-call',
    },
    {
      from: 'module:api-server/domain:users/component:UserService',
      to: 'module:api-server/domain:users/component:UserRepository',
      via: 'module:api-server/domain:users/model:User',
      protocol: 'internal-call',
      description: 'After password hashing, persist the User entity.',
    },
    {
      from: 'module:api-server/domain:users/component:UserRepository',
      to: 'module:postgres-db/domain:users/table:users',
      protocol: 'sql',
      description: 'INSERT INTO users (id, email, password_hash, display_name).',
    },
  ],
  errorFlows: [
    {
      id: 'email-already-exists',
      condition: 'A user with this email already exists in users',
      steps: [
        {
          from: 'module:api-server/domain:users/component:UserRepository',
          to: 'module:api-server/domain:users/component:UserService',
          description:
            'findByEmail returns a non-empty user; UserService raises the duplicate signal.',
        },
        {
          from: 'module:api-server/domain:users/component:UserService',
          to: 'module:api-server/domain:users/component:AuthController',
          description: 'UserService throws EmailAlreadyExistsException.',
        },
      ],
      resultDescription: 'Returns 409 Conflict with { error: "EMAIL_EXISTS" }',
    },
    {
      id: 'weak-password',
      condition: 'Password is shorter than 8 characters',
      steps: [
        {
          from: 'module:api-server/domain:users/component:UserService',
          to: 'module:api-server/domain:users/component:AuthController',
          description: 'UserService throws WeakPasswordException before any DB call.',
        },
      ],
      resultDescription: 'Returns 400 Bad Request with { error: "WEAK_PASSWORD" }',
    },
  ],
  dataFlow: [
    { sourceField: 'CreateUserRequest.email', targetField: 'users.email' },
    {
      sourceField: 'CreateUserRequest.password',
      targetField: 'users.password_hash',
      transform: 'via PasswordHasher.hash (bcrypt)',
    },
    { sourceField: 'CreateUserRequest.displayName', targetField: 'users.display_name' },
  ],
})
write('use-cases/user-login.yaml', {
  kind: 'usecase',
  id: 'user-login',
  name: 'Customer logs in',
  actor: 'actor:customer',
  trigger: 'Submitting the login form on /login in web-frontend',
  description:
    'Demonstrates return values flowing back from the DB to the client and session creation.',
  invariants: {
    pre: [
      'A user with the provided email exists',
      'The provided password matches users.password_hash under bcrypt.verify',
    ],
    post: [
      'A new row exists in the sessions table for this user',
      'The LoginResponse returned to the client carries a valid session token',
    ],
  },
  steps: [
    {
      from: 'module:web-frontend/component:LoginPage',
      to: 'module:web-frontend/component:authClient',
      via: 'module:api-server/domain:users/model:LoginRequest',
      protocol: 'internal-call',
    },
    {
      from: 'module:web-frontend/component:authClient',
      to: 'module:api-server/domain:users/component:AuthController',
      via: 'module:api-server/domain:users/model:LoginRequest',
      protocol: 'http',
      description: 'POST /api/auth/login.',
    },
    {
      from: 'module:api-server/domain:users/component:AuthController',
      to: 'module:api-server/domain:users/component:UserService',
      via: 'module:api-server/domain:users/model:LoginRequest',
      protocol: 'internal-call',
    },
    {
      from: 'module:api-server/domain:users/component:UserService',
      to: 'module:api-server/domain:users/component:UserRepository',
      protocol: 'internal-call',
      description: 'findByEmail to load the stored hash.',
    },
    {
      from: 'module:api-server/domain:users/component:UserRepository',
      to: 'module:postgres-db/domain:users/table:users',
      protocol: 'sql',
      description: 'SELECT id, password_hash FROM users WHERE email = ?.',
    },
    {
      from: 'module:api-server/domain:users/component:UserService',
      to: 'module:api-server/domain:users/component:SessionTokenService',
      protocol: 'internal-call',
      description: 'After bcrypt.verify succeeds, mint a session token.',
    },
    {
      from: 'module:api-server/domain:users/component:SessionTokenService',
      to: 'module:postgres-db/domain:users/table:sessions',
      protocol: 'sql',
      description: 'INSERT INTO sessions (id, user_id, token, expires_at).',
    },
  ],
  errorFlows: [
    {
      id: 'invalid-credentials',
      condition: 'No user with this email OR bcrypt.verify returns false',
      steps: [
        {
          from: 'module:api-server/domain:users/component:UserService',
          to: 'module:api-server/domain:users/component:AuthController',
          description: 'UserService throws InvalidCredentialsException.',
        },
      ],
      resultDescription: 'Returns 401 Unauthorized with { error: "INVALID_CREDENTIALS" }',
    },
  ],
  dataFlow: [
    { sourceField: 'SessionToken.userId', targetField: 'sessions.user_id' },
    { sourceField: 'SessionToken.token', targetField: 'sessions.token' },
    { sourceField: 'SessionToken.expiresAt', targetField: 'sessions.expires_at' },
  ],
})
write('use-cases/browse-menu.yaml', {
  kind: 'usecase',
  id: 'browse-menu',
  name: 'Customer browses the menu',
  actor: 'actor:customer',
  trigger: 'Navigating to /menu in web-frontend',
  description:
    'Read-only flow. Cacheable end-to-end — both MenuService (in-process) and HTTP response (Cache-Control) can cache. Page 08 calls this the "caching implications" showcase.',
  invariants: {
    pre: ['No pre-conditions beyond a working DB connection'],
    post: ['The UI displays a list of currently-available pizzas'],
  },
  steps: [
    {
      from: 'module:web-frontend/component:MenuPage',
      to: 'module:web-frontend/component:menuClient',
      protocol: 'internal-call',
    },
    {
      from: 'module:web-frontend/component:menuClient',
      to: 'module:api-server/domain:menu/component:MenuController',
      protocol: 'http',
      description: 'GET /api/menu.',
    },
    {
      from: 'module:api-server/domain:menu/component:MenuController',
      to: 'module:api-server/domain:menu/component:MenuService',
      protocol: 'internal-call',
    },
    {
      from: 'module:api-server/domain:menu/component:MenuService',
      to: 'module:api-server/domain:menu/component:PizzaRepository',
      protocol: 'internal-call',
    },
    {
      from: 'module:api-server/domain:menu/component:PizzaRepository',
      to: 'module:postgres-db/domain:menu/table:pizzas',
      protocol: 'sql',
      description: 'SELECT * FROM pizzas WHERE available = true.',
    },
  ],
})
write('use-cases/place-order.yaml', {
  kind: 'usecase',
  id: 'place-order',
  name: 'Customer places an order',
  actor: 'actor:customer',
  trigger: 'Submitting the checkout form on /cart in web-frontend',
  description:
    'The cross-module showcase. Involves frontend, service, DB, and an external payment provider; demonstrates field-level dataFlow across many destinations.',
  invariants: {
    pre: [
      'Every pizzaId in the request corresponds to an existing pizza with available=true',
      'The provided sourceToken is a valid Stripe payment-method token',
    ],
    post: [
      "On success, orders has one new row with status='paid' and a non-null stripe_charge_id",
      'On success, order_items has one row per line item, each with unit_price_cents snapshotted from pizzas.price_cents at order time',
      'On Stripe decline, no rows are persisted to orders or order_items',
    ],
  },
  steps: [
    {
      from: 'module:web-frontend/component:CartPage',
      to: 'module:web-frontend/component:orderClient',
      via: 'module:api-server/domain:orders/model:CreateOrderRequest',
      protocol: 'internal-call',
    },
    {
      from: 'module:web-frontend/component:orderClient',
      to: 'module:api-server/domain:orders/component:OrderController',
      via: 'module:api-server/domain:orders/model:CreateOrderRequest',
      protocol: 'http',
      description: 'POST /api/orders.',
    },
    {
      from: 'module:api-server/domain:orders/component:OrderController',
      to: 'module:api-server/domain:orders/component:OrderService',
      via: 'module:api-server/domain:orders/model:CreateOrderRequest',
      protocol: 'internal-call',
    },
    {
      from: 'module:api-server/domain:orders/component:OrderService',
      to: 'module:api-server/domain:menu/component:PizzaRepository',
      protocol: 'internal-call',
      description: 'For each item, findById to confirm availability and read current price_cents.',
    },
    {
      from: 'module:api-server/domain:menu/component:PizzaRepository',
      to: 'module:postgres-db/domain:menu/table:pizzas',
      protocol: 'sql',
      description: 'SELECT id, price_cents, available FROM pizzas WHERE id = ?.',
    },
    {
      from: 'module:api-server/domain:orders/component:OrderService',
      to: 'module:api-server/domain:orders/component:PaymentGateway',
      via: 'module:api-server/domain:orders/model:PaymentRequest',
      protocol: 'internal-call',
      description: 'Charge the computed total.',
    },
    {
      from: 'module:api-server/domain:orders/component:PaymentGateway',
      to: 'module:stripe/component:StripeAPI',
      via: 'module:api-server/domain:orders/model:PaymentRequest',
      protocol: 'external-api',
      description: 'POST /v1/charges to Stripe.',
    },
    {
      from: 'module:api-server/domain:orders/component:OrderService',
      to: 'module:api-server/domain:orders/component:OrderRepository',
      via: 'module:api-server/domain:orders/model:Order',
      protocol: 'internal-call',
      description: 'After a successful charge, persist the order aggregate.',
    },
    {
      from: 'module:api-server/domain:orders/component:OrderRepository',
      to: 'module:postgres-db/domain:orders/table:orders',
      protocol: 'sql',
      description: 'INSERT INTO orders.',
    },
    {
      from: 'module:api-server/domain:orders/component:OrderRepository',
      to: 'module:postgres-db/domain:orders/table:order_items',
      protocol: 'sql',
      description: 'INSERT INTO order_items, one row per line item, inside the same transaction.',
    },
  ],
  errorFlows: [
    {
      id: 'stripe-declined',
      condition: 'StripeAPI.createCharge returns success=false',
      steps: [
        {
          from: 'module:api-server/domain:orders/component:PaymentGateway',
          to: 'module:api-server/domain:orders/component:OrderService',
          description:
            'PaymentGateway throws StripeDeclinedException; OrderService skips persist.',
        },
        {
          from: 'module:api-server/domain:orders/component:OrderService',
          to: 'module:api-server/domain:orders/component:OrderController',
          description: 'Propagates to the controller.',
        },
      ],
      resultDescription:
        'Returns 402 Payment Required with { error: "STRIPE_DECLINED", reason: ... }',
    },
    {
      id: 'out-of-stock',
      condition: 'At least one pizzaId resolves to a pizza with available=false or missing',
      steps: [
        {
          from: 'module:api-server/domain:orders/component:OrderService',
          to: 'module:api-server/domain:orders/component:OrderController',
          description: 'OrderService throws OutOfStockException before any charge.',
        },
      ],
      resultDescription: 'Returns 409 Conflict with { error: "OUT_OF_STOCK", pizzaIds: [...] }',
    },
  ],
  dataFlow: [
    {
      sourceField: 'CreateOrderRequest.sourceToken',
      targetField: 'orders.stripe_charge_id',
      transform: 'via StripeAPI.createCharge (PaymentResult.chargeId is stored)',
    },
    {
      sourceField: 'Order.id',
      targetField: 'order_items.order_id',
      transform: 'set by OrderRepository.save when inserting the parent order in the same transaction',
    },
    { sourceField: 'CreateOrderItemRequest.pizzaId', targetField: 'order_items.pizza_id' },
    { sourceField: 'CreateOrderItemRequest.quantity', targetField: 'order_items.quantity' },
    {
      sourceField: 'Pizza.priceCents',
      targetField: 'order_items.unit_price_cents',
      transform: 'snapshotted from pizzas.price_cents at order time via OrderService.place',
    },
    {
      sourceField: 'Pizza.priceCents',
      targetField: 'orders.total_cents',
      transform: 'sum(OrderItem.quantity * Pizza.priceCents) computed in OrderService.place',
    },
    { sourceField: 'Order.userId', targetField: 'orders.user_id' },
    { sourceField: 'Order.status', targetField: 'orders.status' },
  ],
})
write('use-cases/admin-adds-pizza.yaml', {
  kind: 'usecase',
  id: 'admin-adds-pizza',
  name: 'Admin adds a pizza to the catalog',
  actor: 'actor:admin',
  trigger: 'Submitting the "Add pizza" form in /admin/menu in web-frontend',
  description:
    'Exercises an authorization invariant — the actor must hold the admin role — plus simple validation (name non-empty, price_cents > 0).',
  invariants: {
    pre: [
      'The authenticated actor has the admin role',
      'The request body passes server-side validation (name non-empty, priceCents > 0)',
    ],
    post: [
      'A new row exists in pizzas with the provided fields and available=true (default from the form)',
    ],
  },
  steps: [
    {
      from: 'module:web-frontend/component:AdminMenuPage',
      to: 'module:web-frontend/component:menuClient',
      via: 'module:api-server/domain:menu/model:CreatePizzaRequest',
      protocol: 'internal-call',
    },
    {
      from: 'module:web-frontend/component:menuClient',
      to: 'module:api-server/domain:menu/component:MenuController',
      via: 'module:api-server/domain:menu/model:CreatePizzaRequest',
      protocol: 'http',
      description: 'POST /api/admin/menu.',
    },
    {
      from: 'module:api-server/domain:menu/component:MenuController',
      to: 'module:api-server/domain:menu/component:MenuService',
      via: 'module:api-server/domain:menu/model:CreatePizzaRequest',
      protocol: 'internal-call',
    },
    {
      from: 'module:api-server/domain:menu/component:MenuService',
      to: 'module:api-server/domain:menu/component:PizzaRepository',
      via: 'module:api-server/domain:menu/model:Pizza',
      protocol: 'internal-call',
    },
    {
      from: 'module:api-server/domain:menu/component:PizzaRepository',
      to: 'module:postgres-db/domain:menu/table:pizzas',
      protocol: 'sql',
      description: 'INSERT INTO pizzas (id, name, price_cents, available, image_url).',
    },
  ],
  errorFlows: [
    {
      id: 'unauthorized',
      condition: 'The authenticated actor is not an admin',
      steps: [
        {
          from: 'module:api-server/domain:menu/component:MenuController',
          to: 'module:web-frontend/component:menuClient',
          description:
            'Controller short-circuits with UnauthorizedException before hitting the service.',
        },
      ],
      resultDescription: 'Returns 403 Forbidden with { error: "UNAUTHORIZED" }',
    },
    {
      id: 'validation-error',
      condition: 'Name is empty OR priceCents <= 0',
      steps: [
        {
          from: 'module:api-server/domain:menu/component:MenuService',
          to: 'module:api-server/domain:menu/component:MenuController',
          description: 'MenuService throws ValidationException before touching the repository.',
        },
      ],
      resultDescription: 'Returns 400 Bad Request with { error: "VALIDATION", field: ... }',
    },
  ],
  dataFlow: [
    { sourceField: 'CreatePizzaRequest.name', targetField: 'pizzas.name' },
    { sourceField: 'CreatePizzaRequest.priceCents', targetField: 'pizzas.price_cents' },
    { sourceField: 'CreatePizzaRequest.available', targetField: 'pizzas.available' },
    { sourceField: 'CreatePizzaRequest.imageUrl', targetField: 'pizzas.image_url' },
  ],
})

console.log('spaces/pizza-shop-demo/ generated.')
