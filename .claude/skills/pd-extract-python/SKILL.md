---
name: pd-extract-python
description: >-
  Extract Pizza Doc entities (models, tables, components) from a Python
  codebase and emit them as JSONL. Handles FastAPI, Django, Flask,
  Pydantic, SQLAlchemy. Output feeds `pd import --from-jsonl`. Used by
  `pd-scanner` and `pd-drift-auditor`.
---

# pd-extract-python — Python → JSONL

Read a Python source tree and emit a JSONL stream of Pizza Doc entity
declarations. Same contract and output as `pd-extract-java` /
`pd-extract-typescript`.

## When to use

- `pd-scanner` with `implementationLanguage: python`.
- `pd-drift-auditor` with the same.
- User directly: "extract entities from apps/api (FastAPI)".

## Inputs

1. Source directory.
2. `spaceId` + placement map.
3. Output path (default `/tmp/<spaceId>-entities.jsonl`).

## Output contract

Same as `pd-extract-java`. See its SKILL.md for the JSON shape.

## Algorithm

### Step 1 — Walk the tree

Skip:
- `__pycache__/`, `.venv/`, `venv/`, `site-packages/`, `.eggs/`,
  `dist/`, `build/`, `.mypy_cache/`.
- `test_*.py`, `*_test.py`, `tests/` — use cases come from tests
  separately.
- `*.pyi` — type stubs.

### Step 2 — Classify each module

| Markers present | Entity kind |
|---|---|
| `class Foo(Base)` with `__tablename__ = "…"` (SQLAlchemy 1.x) | model (entity) + table (if raw DDL not used) |
| `class Foo(Base)` with `Mapped[...]` fields (SQLAlchemy 2.x) | same |
| Django `class Foo(models.Model)` | model (entity) + table |
| `class Foo(BaseModel)` (Pydantic v1 or v2) | model (dto) |
| `@dataclass class Foo` | model (dto or value-object) |
| FastAPI `@app.get/post("/…")` or `@router.post(…)` | component (controller) |
| Django views (`class FooView(View)`) | component (controller) |
| Flask `@app.route(…)` | component (controller) |
| Service class with dependency injection (dependency-injector, punq, wired) | component (service) |
| Repository-like class (methods naming `find_by_*`, `save_*`) | component (repository) |
| Celery task (`@celery.task` / `@shared_task`) | component (job) |
| Django middleware / FastAPI middleware | component (infrastructure) |

### Step 3 — Field extraction

**Pydantic DTO:**
```py
class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
```
→ DTO model `CreateUserRequest` with fields `email`, `password`, `name`
(all `type: string`). Validator metadata (`EmailStr`, `min_length`)
reserved for `Field.validation`.

**SQLAlchemy entity:**
```py
class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    orders: Mapped[list["Order"]] = relationship(back_populates="user")
```

Emit:
- A `table` entry (if no raw DDL: the `__tablename__` is the table
  name, `mapped_column(primary_key=…, unique=…, server_default=…)`
  feed the column flags).
- An `entity` model with `persistedAs`, fields mirror the mapped
  columns, `orders: Mapped[list["Order"]]` becomes `List<Order>` +
  `persisted: false`.

**Django model:** similar — `Meta.db_table` or Django's default name
becomes the table; `CharField`, `UUIDField`, etc. map to Pizza Doc types.

**Dataclass:** simplest — each field is a model field; no persistence
unless the class is also persisted elsewhere.

**Type mapping (Python → Pizza Doc):**

| Python | Pizza Doc |
|---|---|
| `str` | `string` |
| `int` | `int` |
| `float` | `decimal` (ask user for precision) |
| `bool` | `boolean` |
| `uuid.UUID`, Pydantic `UUID4` | `uuid` |
| `decimal.Decimal` | `decimal(19,4)` (default; refine from `Column(Numeric(…))`) |
| `datetime.datetime` | `timestamp` |
| `datetime.datetime` + `timezone`-aware / `DateTime(timezone=True)` | `timestamptz` |
| `datetime.date` | `date` |
| `list[T]`, `List[T]` | `List<T>` |
| `Optional[T]`, `T \| None` | `T` + `optional: true` |
| `dict[str, T]` | `Map<string, T>` |
| Enum subclass | string |
| Pydantic `EmailStr` | `string` (validation comes later) |

### Step 4 — Methods

**FastAPI:**
```py
@app.post("/v1/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest, auth_service: AuthService = Depends()):
    return await auth_service.login(request.email, request.password)
```

Emit the surrounding module as a `controller` component (or wrap
related routes in a subclass named after the file — e.g. `auth.py` →
component `AuthController`).

Method:
- `name: 'login'`
- `httpMethod: 'POST'`, `httpPath: '/v1/auth/login'`
- `params: [{ name: 'request', type: 'LoginRequest' }]`
- `returns: 'AuthResponse'`
- `calls:` extracted from `auth_service.<method>(…)` calls — map to
  `AuthService` component refs.

**Django views:** `def get(self, request, …)` / `def post(self, request, …)`
→ each becomes a method. `self.<service_name>` shows up as injected
dependency.

**Flask:** route handlers become methods inside a "group" component
named after the blueprint.

### Step 5 — Service / repository methods

Public methods (no leading underscore). `calls:` filled from method
body grep: `self.<dep>.<method>(…)`.

### Step 6 — Emit JSONL

Compact, one line per entity, UTF-8.

### Step 7 — Hand off

Orchestrator runs `pnpm pd import --from-jsonl <file>`.

## Failure modes

- **Dynamic imports / late-binding DI.** A call like `container.get(UserRepo)()`
  hides the dependency name. Fall back to scanning the module's
  `__init__` or ask the user.
- **Django migrations vs models.** Both describe DB schema. Prefer
  migrations for tables (SQL DDL is universal); models for entity
  shapes.
- **Type hints missing on older code.** Emit `type: any`, flag to user.
- **Metaclass-driven ORM surprises.** If a class uses something exotic
  (`pydantic.BaseModel.Config.alias_generator`), don't guess field
  names — read the config.

## What you don't do

- Don't run Python to "execute" parsers. Static read only.
- Don't emit use-case entries.
- Don't modify source.

## v0.2 contract extensions

### `Field.validation`

| Pydantic / marshmallow / dataclasses | Pizza Doc |
|---|---|
| `EmailStr` | `format: email` |
| `Field(min_length=X, max_length=Y)` | `minLength: X`, `maxLength: Y` |
| `Field(ge=X)` / `Field(gt=X-1)` | `min: X` |
| `Field(le=Y)` | `max: Y` |
| `constr(regex='…')` / `Field(pattern='…')` | `pattern: "…"` |
| `UUID4`, `UUID` | `format: uuid` |

Pydantic v2 `Annotated[str, Field(...)]` unfolds the same way.

### `Model.stateMachine`

Look for `transitions` libraries, SQLAlchemy-based state machines
(`sqlalchemy-state-machine`), or enum fields with documented transition
tables. Django signals / FSMField (`django-fsm`) are another tell.

### `Module.errorMapping`

FastAPI `@app.exception_handler(…)` blocks. Flask `@app.errorhandler`.
Django custom middleware mapping exceptions → responses. Collect each
`exception_class → status_code` pair.

### `UseCase.requires`

FastAPI dependencies like `Depends(require_role("SUPER_ADMIN"))`,
Django `@permission_required`, custom auth middleware role checks.

### `sourceRef` (required)

Every component / model / table: `apps/api/app/models/user.py:12`,
relative to the codebase root. Contract, not courtesy: `pd drift` pairs
renamed symbols by this file path and `pd anchors` resolves it in CI.
Omitting it opts the entity out of both.

### `Model.topic` (event-kind)

Celery task names (`@celery.task(name="…")`), RabbitMQ queue bindings,
Kafka topic constants.

## v0.3 operations evidence (config-refs + external-calls)

Beyond entities, scan for **operations evidence** — config reads and
outbound network calls. These don't become spec entities; they feed
`pd drift --from-jsonl`. Both kinds go in the same JSONL stream as
entities.

### `kind: config-ref`

```jsonl
{"kind":"config-ref","key":"STRIPE_SECRET_KEY","_placement":{"module":"backend","file":"app/payments/stripe.py","line":12}}
```

`_placement.module` is required; skip if you can't determine it.

Python patterns:

- `os.environ["X"]`, `os.environ.get("X")`, `os.getenv("X")` — `key = X`.
- `pydantic.BaseSettings` / `pydantic_settings.BaseSettings` field — emit one entry per field; `key = field_name.upper()` unless `Field(env=...)` overrides.
- `dynaconf.settings.X` / `from dynaconf import settings` accessors.
- `decouple.config("X")` (`python-decouple`).
- `django.conf.settings.X` — Django settings; emit `key = X`.
- `flask.current_app.config["X"]`.
- `airflow.models.Variable.get("X")`.

### `kind: external-call`

```jsonl
{"kind":"external-call","endpoint":"api.stripe.com","protocol":"https","_placement":{"module":"backend","file":"app/payments/stripe.py","line":40}}
```

Endpoint = host (or `host:port`). `protocol` = wire kind.

Patterns:

- `httpx.AsyncClient.get/post(url)`, `httpx.Client(...)`, `httpx.get(url)`.
- `requests.get/post/put/delete(url)`, `requests.Session().get(url)`.
- `aiohttp.ClientSession.get(url)`.
- `urllib.request.urlopen(url)`, `http.client.HTTPSConnection(host, port)`.
- gRPC: `grpc.insecure_channel(target)` / `grpc.secure_channel(target, ...)` — `target` is `host:port`.
- DB drivers: `psycopg2.connect("postgres://...")`, `psycopg.connect`, `asyncpg.connect`, `pymysql.connect`, `pymongo.MongoClient(...)`, `redis.Redis(host, port)` — emit `endpoint: host:port`, `protocol: postgres / mysql / mongodb / redis`.
- SDKs: OpenAI `openai.OpenAI(...)`, Anthropic `anthropic.Anthropic(...)`, AWS `boto3.client("s3")`, Twilio, SendGrid — emit canonical host.
- Celery `broker_url` / `result_backend` config — emit `endpoint: <host:port>`, `protocol: amqp / redis / kafka`.

Internal service-to-service calls (Django views calling your own DRF
endpoints, FastAPI dependency injection between local services in the
same process) are **NOT** external. Don't emit them.
