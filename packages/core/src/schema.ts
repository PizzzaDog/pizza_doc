import { z } from 'zod'

// ---------- Primitive building blocks ----------

export const IdSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
export const RefSchema = z.string().regex(/^(module|usecase|actor):[a-zA-Z0-9_\-/:]+$/)

/**
 * Relative path to the source file that backs this entity, optionally
 * with a line suffix. Used by `pd-drift-auditor` to detect when the code
 * has moved out of step with the spec, and by `pd-implementer` to open
 * the right file on each step. Free-form string — no validator
 * enforcement of the path shape, since the layout depends on the target
 * stack.
 *
 *   sourceRef: apps/backend/src/main/java/online/restik/identity/internal/domain/User.java:12
 *   sourceRef: packages/api/src/controllers/auth.ts
 */
export const SourceRefSchema = z.string()

export const ReadinessOrphanSchema = z
  .object({
    /**
     * Required machine-readable waiver reason for an intentionally
     * unreferenced entity. Production readiness ignores broad comments and
     * old suppress lists; it only accepts explicit, local reasons.
     */
    reason: z.string().min(1),
  })
  .strict()

export const EntityReadinessSchema = z
  .object({
    orphan: ReadinessOrphanSchema.optional(),
  })
  .strict()

export const ComponentEntrypointSchema = z
  .object({
    /**
     * Why this component may legitimately have no inbound use-case/call
     * reference while still being alive at runtime.
     */
    kind: z.enum(['composition-root', 'framework-entrypoint', 'runtime-entrypoint']),
    reason: z.string().min(1),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

export const ImplementationProofSchema = z
  .object({
    /**
     * Source location for the code/test/script proving this mapping or
     * contract exists.
     */
    sourceRef: SourceRefSchema.optional(),
    /**
     * Pizza Doc ref to the handler/component/method that implements the
     * proof. Use sourceRef when the handler is outside the modeled graph.
     */
    handlerRef: RefSchema.optional(),
    description: z.string().optional(),
  })
  .strict()

/**
 * Field-level validation rules that outlive the framework the code
 * ended up in. Extractors fill these from `@Email`, `@Size`, zod
 * `.email().min(…)`, Pydantic `EmailStr`, validator tags, etc. Used by
 * `pd-implementer` to render framework-native validators on the way
 * back to code. Not enforced by Pizza Doc at runtime; it's a contract
 * for humans and downstream generators.
 */
export const ValidationSchema = z
  .object({
    /**
     * Structured format hint — `email`, `uri`, `url`, `uuid`, `ipv4`,
     * `ipv6`, `hostname`, `date`, `time`, `date-time`, or any other
     * JSON-Schema `format` value. Free-form string so authors can
     * invent project-specific formats (`phone-e164`, `iban`) when the
     * core list isn't enough.
     */
    format: z.string().optional(),
    /** Inclusive lower bound for numeric fields. */
    min: z.number().optional(),
    /** Inclusive upper bound for numeric fields. */
    max: z.number().optional(),
    /** String length bounds (chars). */
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().optional(),
    /** Regex pattern. Same syntax as JSON Schema / ECMAScript. */
    pattern: z.string().optional(),
    /**
     * Enumeration of allowed values. When set, `type` still describes
     * the underlying primitive, but readers / generators should reject
     * anything outside this list.
     */
    enumValues: z.array(z.string()).min(1).optional(),
    /** Human prose — shown in UI tooltips and AI export. */
    description: z.string().optional(),
  })
  .strict()

export const FieldSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    optional: z.boolean().default(false),
    /**
     * `false` for derived / non-persisted fields on entity models — JPA
     * `@OneToMany` relations, `@Transient` properties, computed getters.
     * Defaults to `true` so existing specs keep working. When `false`, the
     * cross-module rule `MODEL_FIELD_MISSING_COLUMN` skips this field.
     */
    persisted: z.boolean().default(true),
    /**
     * Structured validation rules. See ValidationSchema.
     */
    validation: ValidationSchema.optional(),
    description: z.string().optional(),
    example: z.unknown().optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

export const ColumnSchema = z
  .object({
    name: z.string(),
    sqlType: z.string(),
    primaryKey: z.boolean().default(false),
    nullable: z.boolean().default(false),
    unique: z.boolean().default(false),
    /**
     * Free-form SQL default expression — e.g. `gen_random_uuid()`, `now()`,
     * `'DRAFT'`, `0`. When set, the column is treated as "write-optional" by
     * `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN`: authors don't need a dataFlow
     * entry to map it because the DB supplies the value.
     */
    default: z.string().optional(),
    foreignKey: z
      .object({
        table: RefSchema,
        column: z.string(),
      })
      .strict()
      .optional(),
    description: z.string().optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

// ---------- Calls + routes (v0.3 contract layer — A1) ----------

/**
 * Authentication credential the caller attaches to an outbound call.
 * Pairs with the callee's declared `routes[].auth` for the
 * `CONTRACT_CALL_HEADER_MISMATCH` / `CONTRACT_CALL_ENV_MISMATCH` checks
 * under `--strict-contracts` (see A5).
 *
 * Field `env` names a config-map key — drift-auditor verifies the caller
 * actually reads it; A5's `--strict-contracts` flag verifies the key is
 * declared in some `config-map.yaml`.
 */
export const CallCredentialSchema = z
  .object({
    /**
     * Auth scheme. `shared-secret` — static header value from env (typical
     * internal s2s). `signed-token` — caller mints a short-lived token
     * (vm-token style). `user-jwt` — propagated end-user JWT. `none` —
     * explicit "no credential" for development/public surfaces.
     */
    type: z.enum(['shared-secret', 'signed-token', 'user-jwt', 'none']),
    /**
     * Config-map key (env var) whose value is the credential. Required for
     * `shared-secret`; recommended for `signed-token` (signing key) and
     * `user-jwt` (verification key). Omitted for `none`.
     */
    env: z.string().optional(),
    /**
     * Canonical HTTP header name the caller attaches and the callee
     * verifies. Required for `shared-secret` and `signed-token` over HTTP.
     */
    header: z.string().optional(),
  })
  .strict()

/**
 * Object form of an outbound call. Lives on `method.calls[]` alongside the
 * legacy string-ref shorthand. The legacy form `"module:foo/component:Bar"`
 * is auto-normalized at parse time into `{target: <ref>}` so existing specs
 * keep working unchanged.
 */
export const CallTargetSchema = z
  .object({
    /** Pizza Doc ref to the callee component or method. */
    target: RefSchema,
    /**
     * HTTP path the caller hits on the callee. Pairs with the callee's
     * `routes[].path` (or `method.httpPath`) for orphan-path detection.
     */
    path: z.string().optional(),
    /** HTTP verb. Omit for non-HTTP protocols. */
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    /** Credential the caller attaches. See CallCredentialSchema. */
    credential: CallCredentialSchema.optional(),
    /**
     * `true` when the call is best-effort and the caller copes with the
     * callee being down (timeouts → cached value, fallback path). `false`
     * (default) means the caller's success depends on the callee.
     */
    optional: z.boolean().default(false),
    description: z.string().optional(),
  })
  .strict()

/**
 * Zod schema for one entry in `method.calls[]`. Accepts either:
 *   1. Legacy ref string `"module:foo/component:Bar"` — normalized to
 *      `{target: <ref>, optional: false}` at parse time.
 *   2. New object form (CallTargetSchema).
 *
 * Helpers `getCallTarget` / `isLegacyCall` (below) hide the union from
 * downstream code.
 */
export const CallSpecSchema = z.union([
  RefSchema.transform(
    (ref) => ({ target: ref, optional: false }) as z.infer<typeof CallTargetSchema>,
  ),
  CallTargetSchema,
])

/**
 * Callee-side auth declaration on a route. Mirrors CallCredentialSchema —
 * the caller's `credential` and the callee's `auth` must agree on `header`
 * and `env` for `--check-orphan-paths` / `--strict-contracts` to pass.
 */
export const RouteAuthSchema = z
  .object({
    type: z.enum(['shared-secret', 'signed-token', 'user-jwt', 'none']),
    env: z.string().optional(),
    header: z.string().optional(),
  })
  .strict()

/**
 * Standalone inbound route on a component. Use this when the callee's
 * inbound HTTP surface isn't cleanly bound to a single modelled method
 * (e.g. middleware, filter, generic webhook receiver). When a route IS
 * served by a specific method, prefer setting `httpMethod`/`httpPath`/
 * `routeAuth` on the method directly — `routes[]` and method-level
 * fields are both consulted by the orphan-path checker.
 */
export const RouteSchema = z
  .object({
    path: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    auth: RouteAuthSchema.optional(),
    description: z.string().optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

/**
 * Helper: extract the target ref from a CallSpec. Always returns a string —
 * downstream code (refs walker, cycle detector, COMPONENT_UNUSED) can stay
 * call-shape-agnostic by using this instead of inspecting the union.
 */
export function getCallTarget(call: z.infer<typeof CallSpecSchema>): string {
  return call.target
}

// ---------- Pub/sub edges (v0.5 — B2) ----------

/**
 * A component declares it publishes an event. The `event` ref targets a
 * `modelKind: event` model — that's the payload contract. Validator
 * `EVENT_EMIT_TARGET_NOT_EVENT` checks the ref resolves to such a model.
 *
 * Production feedback hit this gap: event-driven
 * components (`EventDispatcher → SomeStore`) had no first-class edge
 * in Pizza Doc, so subscribers showed up as `COMPONENT_UNUSED`. With
 * `emits` + `subscribes` on both ends, the call-graph traversal can mark
 * subscribers alive via their published event.
 */
export const EventEmitSchema = z
  .object({
    /** Pizza Doc ref of the event payload model (modelKind=event). */
    event: RefSchema,
    /**
     * Optional explicit subscriber list. Pure documentation — the graph
     * traversal computes the actual receivers from `subscribes` on every
     * component. Use this when readers want to see the wiring without
     * grepping across modules.
     */
    to: z.array(RefSchema).default([]),
    description: z.string().optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

/**
 * A component declares it consumes an event. `via` optionally names the
 * bus / dispatcher component carrying the event (a WebSocket dispatcher,
 * a queue consumer, an in-memory pub/sub registry). The subscriber's
 * inclusion in the alive-set depends only on the `event` ref matching a
 * publisher — `via` is documentation.
 */
export const EventSubscribeSchema = z
  .object({
    event: RefSchema,
    via: RefSchema.optional(),
    description: z.string().optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

// ---------- Wire capture (v0.5 — B3) ----------

/**
 * One captured-traffic scenario. The `path` lives on the WireCapture
 * envelope; each scenario names a specific shape (success / error /
 * pagination / etc.) and optionally pins concrete values the harness
 * should assert (`promptTokens: 353`).
 *
 * Free-form `assertions` because what matters varies by integration —
 * token counts for an LLM SSE, status codes for a REST round-trip,
 * signed-headers for a webhook receiver.
 */
export const WireCaptureScenarioSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    /** Concrete assertions for this scenario. Free-form key/value map. */
    assertions: z.record(z.unknown()).optional(),
  })
  .strict()

/**
 * Captured-traffic artefact pinning a component's external-integration
 * contract to real wire shape. v0.5 (B3). Production feedback
 * called this the highest-leverage gap: synthesized fixtures lied about
 * vendor SSE shape and 5 hours of prod debugging followed. Spec
 * declaring `wireCapture` with a path + capture date is the gate.
 *
 * `source` examples:
 *   - `tcpdump`        — raw pcap converted to text/HAR
 *   - `curl-live`      — saved response from a live `curl` invocation
 *   - `debug-log`      — captured by setting a wire-debug env flag
 *   - `replay-from-prod` — sanitized prod payload
 *   - any custom string
 */
export const WireCaptureSchema = z
  .object({
    /** How the capture was produced. */
    source: z.string().min(1),
    /**
     * Space-relative path to the captured artefact. Conventional
     * location: `.pizza-doc/wire-captures/<integration>/<scenario>.txt`,
     * but any relative path is accepted.
     */
    path: z.string().min(1),
    /** ISO date the capture was taken (YYYY-MM-DD). */
    capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'capturedAt must be ISO date YYYY-MM-DD',
    }),
    /**
     * Free-form descriptor of the vendor/version the capture is valid
     * against. E.g. `openrouter@v1.234`, `stripe-api@2024-06-20`,
     * `aws-sdk@v3`. Drift-auditor compares this against `capturedAt`
     * staleness; humans use it to triage "is this still valid after the
     * vendor changelog landed last week".
     */
    capturedAgainst: z.string().min(1).optional(),
    scenarios: z.array(WireCaptureScenarioSchema).default([]),
    description: z.string().optional(),
  })
  .strict()

// ---------- Methods ----------

export const MethodSchema = z
  .object({
    name: z.string(),
    params: z.array(FieldSchema).default([]),
    /**
     * Return type. Omit for void — the YAML stays clean and the AI export
     * renders "void" explicitly. Before this default every no-return method
     * needed a manual `returns: void` line.
     */
    returns: z.string().default('void'),
    /**
     * Outbound calls this method makes. Each entry is either a legacy ref
     * string (auto-normalized to `{target: <ref>}`) or a v0.3 object with
     * path/method/credential/optional. See CallSpecSchema.
     */
    calls: z.array(CallSpecSchema).default([]),
    throws: z.array(z.string()).default([]),
    description: z.string().optional(),
    httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    httpPath: z.string().optional(),
    /**
     * Inbound auth declaration when this method serves an HTTP route. Pairs
     * with caller's `calls[].credential` for header/env parity checks under
     * `--strict-contracts`. Independent of `httpMethod`/`httpPath` so a
     * method that doesn't bind a route can still declare auth requirements
     * (rare).
     */
    routeAuth: RouteAuthSchema.optional(),
    /**
     * Production-readiness metadata for method-level surfaces. For HTTP
     * methods this can locally justify an intentionally uncovered endpoint.
     */
    readiness: EntityReadinessSchema.optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

// ---------- Models (DTOs, entities, value objects, events) ----------

export const ModelKind = z.enum(['dto', 'entity', 'value-object', 'event', 'enum'])

/**
 * Pre/post invariants attached to a transition. Free-form strings that
 * downstream tooling (Codex C1: scenario test generation) interprets:
 *
 *   pre:  ["job.attempt < max_attempts"]
 *   post: ["provisioning_error_non_null"]   # would catch markFailed-rollback
 *
 * Static `pd drift` cannot prove a Spring `@Transactional` rollback won't
 * erase the `provisioning_error` write — these strings describe what the
 * scenario harness should assert.
 */
export const StateMachineInvariantsSchema = z
  .object({
    pre: z.array(z.string()).default([]),
    post: z.array(z.string()).default([]),
  })
  .strict()

/**
 * A single contract test derived from (or paired with) one or more
 * transitions. Mirrors the markFailed-rollback example from the
 * improvements prompt:
 *
 *   id: provisioning-failure-persists-error
 *   given: workspace in CREATING_VM
 *   when:  trigger infra-service.vm-provision-failed
 *   then:
 *     - workspace.provision_state == FAILED
 *     - workspace.provisioning_error != null
 *     - workspace.attempt > 0
 *
 * The harness that turns these into runnable tests lives outside the
 * framework (a Codex skill or a per-language scaffolder). Pizza Doc only
 * stores them and reports coverage.
 */
export const StateMachineScenarioSchema = z
  .object({
    id: IdSchema,
    given: z.string(),
    when: z.string(),
    then: z.array(z.string()).min(1),
    description: z.string().optional(),
  })
  .strict()

export const StateMachineTransitionSchema = z
  .object({
    from: z.string(),
    to: z.union([z.string(), z.array(z.string()).min(1)]),
    /**
     * Event / method name that triggers the transition. Legacy field name.
     * `trigger` is the v0.3 synonym preferred for cross-module triggers
     * named like `WorkspaceProvisionWorker.pickup`.
     */
    on: z.string().optional(),
    /**
     * v0.3 trigger label — matches the improvements prompt's vocabulary.
     * Tooling treats `trigger` and `on` interchangeably; authors may set
     * either. Validators check at most one is set.
     */
    trigger: z.string().optional(),
    /**
     * Who initiates the transition. `user` — direct human action. `system`
     * — internal worker / scheduler / event handler. Free-form string for
     * forward compatibility (e.g. `subsystem:billing`).
     */
    actor: z.string().optional(),
    /** Prose-level pre-condition. */
    guard: z.string().optional(),
    /** Structured invariants — see StateMachineInvariantsSchema. */
    invariants: StateMachineInvariantsSchema.optional(),
    description: z.string().optional(),
  })
  .strict()

/**
 * Optional per-state config — terminality and stall-protection timeout.
 * Used both inline on a model's `stateMachine.states[]` (legacy: states is
 * a plain `string[]`) and on standalone state machine files via `stateConfig`.
 */
export const StateMachineStateConfigSchema = z
  .object({
    id: z.string(),
    /** When true the state has no outgoing transitions. */
    terminal: z.boolean().default(false),
    /**
     * Stall protection: how long the entity may sit in this non-terminal
     * state before tooling fires an alarm and the SM should transition to
     * `transition_to`. Free-form duration (`5m`, `1h`, `24h`) — the
     * runtime decides interpretation.
     */
    timeout: z
      .object({
        after: z.string().min(1),
        transition_to: z.string().min(1),
        reason: z.string().optional(),
      })
      .strict()
      .optional(),
    description: z.string().optional(),
  })
  .strict()

/**
 * Finite state machine attached to a model. Mostly used on entities
 * that carry a `status` / `state` field with a fixed lifecycle (order
 * status, invoice state, subscription, KYC review, …). `pd-implementer`
 * turns the states into an enum and the transitions into a guard
 * (`canTransitionTo`-style) in the target language. Free-form `on` /
 * `guard` strings so they can carry method names or business prose.
 */
export const StateMachineSchema = z
  .object({
    /** The field on this model that holds the current state. */
    field: z.string(),
    /** All reachable state values. Each transition's from/to must be listed. */
    states: z.array(z.string()).min(2),
    /** Initial state assigned on construction. Must be in `states`. */
    initial: z.string().optional(),
    /** States that don't allow outgoing transitions. Must be in `states`. */
    terminal: z.array(z.string()).default([]),
    /**
     * Optional per-state metadata. Keyed by state name. Lets authors attach
     * timeout / description / terminal to states without breaking the
     * `states: string[]` shape downstream tools rely on. Added in v0.3 (A2).
     */
    stateConfig: z.array(StateMachineStateConfigSchema).default([]),
    transitions: z.array(StateMachineTransitionSchema).default([]),
    /**
     * Optional scenario tests derived from transitions. v0.3 — see
     * StateMachineScenarioSchema. Default `[]`. Tooling can require at
     * least one scenario per non-trivial transition under a coverage flag.
     */
    scenarios: z.array(StateMachineScenarioSchema).default([]),
    description: z.string().optional(),
  })
  .strict()

/**
 * Standalone state-machine file (v0.3 — A2). Lives at
 * `modules/<m>/state-machines/<id>.yaml`. Useful when:
 *   - the state machine spans multiple models or modules
 *     (workspace provisioning lifecycle touches workspace + job + vm),
 *   - the state machine is the contract (not an attribute of a model),
 *   - you want scenarios to live independently of any single model.
 *
 * Standalone state machines do NOT replace model.stateMachine — both
 * forms coexist. Inline is for the simple case (one entity + one field +
 * a small lifecycle); standalone is for cross-cutting protocols.
 */
export const StateMachineFileSchema = z
  .object({
    kind: z.literal('state-machine'),
    id: IdSchema,
    name: z.string(),
    description: z.string().optional(),
    /**
     * Free-form ref pointing at the model.field this machine governs.
     * Optional because standalone state machines may describe a protocol
     * that doesn't pin to a single model column (e.g. distributed saga).
     * When set, the validator can cross-check enum coverage against the
     * model's `status` field type.
     */
    governs: z.string().optional(),
    states: z.array(z.string()).min(2),
    initial: z.string().optional(),
    terminal: z.array(z.string()).default([]),
    stateConfig: z.array(StateMachineStateConfigSchema).default([]),
    transitions: z.array(StateMachineTransitionSchema).default([]),
    scenarios: z.array(StateMachineScenarioSchema).default([]),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

export const ModelSchema = z
  .object({
    kind: z.literal('model'),
    id: IdSchema,
    name: z.string(),
    modelKind: ModelKind,
    /**
     * Required for DTOs / entities / value-objects / events. Optional (and
     * typically omitted) for `modelKind: enum` — see `values` below.
     */
    fields: z.array(FieldSchema).default([]),
    /**
     * For `modelKind: enum` — the closed set of literal string values this
     * type can take (e.g. `['claude-code', 'opencode']`). Field types
     * elsewhere can name this model and the validator treats them as
     * constrained to these values. Required for enums; not allowed for
     * other model kinds (Pass-1 check enforces this).
     */
    values: z.array(z.string()).optional(),
    description: z.string().optional(),
    persistedAs: RefSchema.optional(),
    /**
     * For `modelKind: event` — queue / topic name the event is
     * published to. Links the event shape to the transport channel.
     * Silently ignored for other model kinds.
     */
    topic: z.string().optional(),
    /**
     * Optional state machine attached to a field on this model.
     * Typically used when `modelKind: entity` and the model has a
     * lifecycle field like `status`.
     */
    stateMachine: StateMachineSchema.optional(),
    /**
     * Codes the validator should silently drop for this model — usually
     * `DTO_UNUSED` for forward-declared types or model-fixtures used
     * only by upstream/downstream code outside the spec.
     */
    suppress: z.array(z.string()).optional(),
    /**
     * Production-readiness metadata. `readiness.orphan.reason` allows a
     * deliberately unreferenced model without hiding ordinary gaps.
     */
    readiness: EntityReadinessSchema.optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

// ---------- Components ----------

export const ComponentType = z.enum([
  'controller',
  'service',
  'repository',
  'infrastructure',
  'page',
  'widget',
  'client',
  'job',
  // Push-side component types: handle inbound messages they did not request.
  // `consumer` — short-lived: webhook receivers, queue consumers, push handlers.
  // `subscriber` — long-lived: SSE/WS clients, durable queue subscribers, MCP listeners.
  // For step.protocol = `http`/`sse`/`websocket`/`ws`, both are valid targets in
  // place of a controller; see `ruleHttpStepTargetController`.
  'consumer',
  'subscriber',
  // HTTP request lifecycle hooks that aren't the final handler:
  // auth filters, request loggers, rate limiters, CORS interceptors,
  // distributed-tracing wrappers. They sit *between* the wire and the
  // controller and can short-circuit the request (401 from AuthFilter).
  // Valid as an HTTP step target like controller / consumer / subscriber.
  'middleware',
])

export const ComponentSchema = z
  .object({
    kind: z.literal('component'),
    id: IdSchema,
    name: z.string(),
    type: ComponentType,
    methods: z.array(MethodSchema).default([]),
    description: z.string().optional(),
    /**
     * Components this one *contains* without invoking via a method call.
     * UI parent/child (e.g. `ChatView` composes `MessageList` and
     * `ComposerInput` — they are mounted, not called) is the canonical
     * case. Counts as "use" for the COMPONENT_UNUSED rule: anything
     * referenced from a composes[] list is considered alive.
     *
     * For request/response chains use `methods[].calls:` instead — that
     * carries call-graph semantics. `composes:` is purely structural.
     */
    composes: z.array(RefSchema).optional(),
    /**
     * Standalone inbound HTTP routes this component serves. Use when the
     * route isn't bound to a single modelled method (middleware, filter,
     * generic webhook). For routes that DO bind to a method, prefer
     * `method.httpMethod`/`httpPath`/`routeAuth` — the orphan-path checker
     * looks in both places. See RouteSchema.
     */
    routes: z.array(RouteSchema).default([]),
    /**
     * Events this component publishes. v0.5 (B2). Pairs with
     * `subscribes` on receivers. The call-graph traversal marks any
     * component subscribed to one of these events as alive — that's how
     * event-driven receivers escape the legitimate-but-noisy
     * COMPONENT_UNUSED warning.
     *
     * Each entry's `event` must resolve to a model with `modelKind: event`
     * (validator code `EVENT_EMIT_TARGET_NOT_EVENT`).
     */
    emits: z.array(EventEmitSchema).default([]),
    /**
     * Events this component consumes. v0.5 (B2). The `via` field
     * optionally names the bus/dispatcher component carrying the event;
     * it's pure documentation and doesn't change reachability.
     */
    subscribes: z.array(EventSubscribeSchema).default([]),
    /**
     * Captured-traffic artefact pinning this component's external
     * integration to real wire shape. v0.5 (B3). Required (under
     * `--strict-wire-capture`) when the component is the `consumer:` of
     * an `http-api` external-dep — otherwise the fixture-vs-real-wire
     * gap is silent until prod.
     *
     * See WireCaptureSchema.
     */
    wireCapture: WireCaptureSchema.optional(),
    /**
     * ADR ids whose decisions shape this component. Back-reference to
     * `decisions/ADR-NNN-*.md`. v0.4.0 (B1) — `Module.decisions[]` is the
     * coarser counterpart; use `decidedBy` here to anchor an ADR to a
     * single component rather than the whole module (e.g. ADR-026
     * decides how `AnthropicSseParser` shapes wire events).
     *
     * Validator:
     *   - `COMPONENT_DECIDED_BY_INVALID_ADR` (error) — id not present in
     *     `space.decisions[]`. Same shape as `ADR_BROKEN_LINK`.
     *   - `COMPONENT_DECIDED_BY_SUPERSEDED_ADR` (warning) — ADR exists
     *     but its `status` is `superseded` or `deprecated`; suggests
     *     pointing at the superseder.
     */
    decidedBy: z.array(z.string().regex(/^ADR-[0-9]{3,}$/)).default([]),
    /**
     * Codes the validator should silently drop for this component, e.g.
     * `[COMPONENT_UNUSED]` when an entry-point widget is rendered by a
     * router config the spec doesn't model, or `[CYCLIC_CALLS]` when a
     * cycle is intentional. Schema-level codes (`SCHEMA_*`) and
     * ref-resolution codes (`REF_*`) are NOT suppressible — those are
     * structural correctness, not preferences.
     */
    suppress: z.array(z.string()).optional(),
    /**
     * Mark runtime entrypoints/composition roots that are reached by
     * framework configuration or bootstrapping rather than by another
     * modeled component. Requires a reason so readiness reports stay honest.
     */
    entrypoint: ComponentEntrypointSchema.optional(),
    /**
     * Production-readiness metadata. Prefer `entrypoint` for composition
     * roots; use `readiness.orphan.reason` for other intentionally
     * unreferenced components.
     */
    readiness: EntityReadinessSchema.optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

// ---------- Tables ----------

export const IndexSchema = z
  .object({
    name: z.string(),
    columns: z.array(z.string()),
    unique: z.boolean().default(false),
  })
  .strict()

/**
 * One migration that has been applied to this table. v0.5 (B4). The list
 * is meant to be the *ordered history* of migrations the schema has gone
 * through — useful documentation, and the validator cross-checks
 * `add-column` / `drop-column` entries against the current `columns: [...]`
 * snapshot:
 *
 *   - declared `action: drop-column, columns: ['dust_reserved']` but the
 *     column is still in `columns` → `MIGRATION_COLUMN_INCONSISTENT` error.
 *   - declared `action: add-column, columns: ['wallet_balance']` but the
 *     column is missing from `columns` → same error.
 *
 * Production feedback drove this: a column was dropped
 * in code but the spec lagged, no validator caught it. With `migrations`
 * declared, the gate fires.
 *
 * `action: create` is the baseline migration (initial DDL); `columns` is
 * optional there since the snapshot is the full column list.
 *
 * `action: alter-column` doesn't enforce presence — just records a shape
 * change. (Adding shape diff validation needs JSONL drift from real DDL,
 * out of scope for v0.5.)
 */
export const TableMigrationSchema = z
  .object({
    /** Migration id, e.g. `V0028` or `2026-05-15-drop-reserved`. */
    id: z.string().min(1),
    action: z.enum(['create', 'add-column', 'drop-column', 'alter-column']),
    /**
     * Column names affected by this migration. Required for add/drop
     * (the validator cross-checks these against `columns`); optional for
     * create / alter-column.
     */
    columns: z.array(z.string()).default([]),
    description: z.string().optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

export const TableSchema = z
  .object({
    kind: z.literal('table'),
    id: IdSchema,
    name: z.string(),
    columns: z.array(ColumnSchema),
    indexes: z.array(IndexSchema).default([]),
    description: z.string().optional(),
    /**
     * Ordered migration history. v0.5 (B4). See TableMigrationSchema.
     * Optional — legacy specs without migration tracking keep parsing.
     * Validator cross-checks declared add/drop entries against
     * `columns` and flags ordering gaps.
     */
    migrations: z.array(TableMigrationSchema).default([]),
    /**
     * Production-readiness metadata. `readiness.orphan.reason` allows a
     * deliberately unreferenced table without hiding ordinary gaps.
     */
    readiness: EntityReadinessSchema.optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

// ---------- Domain (optional grouping inside a module) ----------

export const DomainSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    description: z.string().optional(),
    components: z.array(ComponentSchema).default([]),
    models: z.array(ModelSchema).default([]),
    tables: z.array(TableSchema).default([]),
  })
  .strict()

// ---------- Operations: config-map ----------

/**
 * One configuration knob a module reads from outside itself. Captures the
 * "list of wires that have to be connected" so a deployer (or `pd-drift-
 * auditor` against application code) can see what's required without
 * reading the source.
 *
 * The schema is intentionally org-neutral: it says *what* the value is
 * (secret? lifecycle?) and *where it goes* (which component reads it),
 * but never *how* it gets to the runtime. Provisioning / rotation /
 * secret store choice live in org-specific runbooks, not here.
 */
export const ConfigMapEntrySchema = z
  .object({
    /**
     * The name as the application sees it. Convention: UPPER_SNAKE_CASE
     * for env vars; original spelling for property keys. Must be unique
     * within the module's config-map.
     */
    key: z
      .string()
      .min(1)
      .regex(/^[A-Z][A-Z0-9_]*$|^[a-zA-Z][a-zA-Z0-9._-]*$/, {
        message: 'config key must be UPPER_SNAKE_CASE or a property-style identifier',
      }),
    /**
     * `secret` — sensitive: must not live in VCS / config-map / build
     *   artifacts. Comes from a secrets manager / vault / sealed env.
     * `non-secret` — fine to keep in plain config / git.
     */
    type: z.enum(['secret', 'non-secret']),
    /**
     * When the value is consumed:
     * - `build`   — baked into the artifact at build time (e.g. VITE_*).
     * - `startup` — read by the process on boot; not re-read after.
     * - `runtime` — read (and possibly mutated) while the process is up.
     */
    lifecycle: z.enum(['build', 'startup', 'runtime']),
    /**
     * How rotatable the value is:
     * - `immortal`   — rotation breaks data (e.g. master encryption key).
     * - `rotatable`  — rotation requires a redeploy of consumers.
     * - `hot-reload` — a value change is picked up without redeploy.
     */
    mutability: z.enum(['immortal', 'rotatable', 'hot-reload']),
    consumer: z
      .object({
        /**
         * Pizza Doc ref of the component that reads the value. Module-
         * level refs are allowed for "all components in this module
         * read this", e.g. `module:backend` for `DB_URL`.
         */
        component: RefSchema,
        /**
         * Optional human-readable code snippet showing how the key is
         * read (e.g. `@Value("${auth.google.client-id}")` or
         * `os.Getenv("DB_URL")`). Drift detection uses `sourceRef`
         * separately for actual file/line; this is for the spec reader.
         */
        callsite: z.string().optional(),
      })
      .strict(),
    description: z.string().optional(),
    /**
     * Other config keys this one is paired with. Use the prefixed form
     * `config-map:<MODULE>/<KEY>` for cross-module pairs (e.g. backend's
     * `GOOGLE_CLIENT_ID` ↔ frontend's `VITE_GOOGLE_CLIENT_ID`).
     * A bare `<KEY>` is shorthand for "another key in this module's
     * config-map.yaml".
     */
    related: z.array(z.string()).default([]),
    /**
     * For `type: secret` — where the canonical value lives. Free-form
     * string. The validator only enforces that this is non-empty for
     * secrets; the wording is up to you. Examples: `"vault:secret/app/db/url"`,
     * `"external (Cloud Console)"`, `"AWS Secrets Manager: prod/app/openai-key"`.
     */
    sourceOfTruth: z.string().optional(),
    /**
     * Declared fallback value when the key is absent from the runtime
     * environment. Keep secrets out of this field; for secrets it should
     * usually stay unset and `sourceOfTruth` should point at the secret
     * store.
     */
    defaultValue: z.string().optional(),
    /**
     * Defaults observed in code, workflow, deploy, or bootstrap files.
     * `pd validate` compares these against `defaultValue` so docs cannot
     * silently say "/var/lib/workers" while code still boots with an older
     * fallback.
     */
    defaultSources: z
      .array(
        z
          .object({
            source: z
              .enum(['code', 'workflow', 'deploy', 'bootstrap', 'script', 'docs'])
              .optional(),
            value: z.string(),
            sourceRef: SourceRefSchema,
            description: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

export const ConfigMapFileSchema = z.array(ConfigMapEntrySchema)

// ---------- Operations: external-deps ----------

const ExternalDepCheckSchema = z
  .object({
    sourceRef: SourceRefSchema,
    description: z.string().optional(),
  })
  .strict()

const ExternalDepArgDefaultSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const ExternalDepPositionalArgSchema = z
  .object({
    position: z.number().int().positive(),
    name: z.string().min(1),
    /**
     * Free-form scalar/shape hint. Common values: `string`,
     * `positive-int`, `secret`, `enum`, `json-object`.
     */
    type: z.string().min(1),
    required: z.boolean().default(true),
    nonempty: z.boolean().default(false),
    secret: z.boolean().default(false),
    defaultValue: ExternalDepArgDefaultSchema.optional(),
    enumValues: z.array(z.string()).min(1).optional(),
    description: z.string().optional(),
  })
  .strict()

export const ExternalDepPositionalArgsSchema = z
  .object({
    name: z.string().optional(),
    args: z.array(ExternalDepPositionalArgSchema).default([]),
    contractTest: ExternalDepCheckSchema.optional(),
    acceptanceCriteria: z.array(z.string()).default([]),
  })
  .strict()

// v0.3 (A3) — shared building blocks for host-installed dependencies.

/**
 * Per-environment requirement. Lets a host dep be required in `prod` while
 * optional in `local`, so `pd validate` can warn about missing prod owners
 * without bothering dev-only spaces.
 */
export const DepProfileSchema = z.string().min(1)

/**
 * When the dep is installed/refreshed. `bootstrap` — once when the host
 * comes up (OS packages, kernels). `deploy` — on each deploy (a rebuilt
 * rootfs image, an app-bundled binary). `runtime` — installed on-demand
 * while the service is up (rare; usually code with strict caching).
 */
export const DepLifecycleSchema = z.enum(['bootstrap', 'deploy', 'runtime'])

/**
 * Concrete preflight probe. The deploy workflow / boot script runs
 * `command` and the dep is considered present iff the result matches
 * `expected`. Free-form `expected` so authors can describe non-trivial
 * cases (`expected: stdout_contains_sha256`).
 */
export const DepPreflightSchema = z
  .object({
    command: z.string().min(1),
    expected: z.string().min(1).default('exit_code_0'),
    description: z.string().optional(),
  })
  .strict()

/**
 * Source spec for a host-installed binary or artifact. Discriminated by
 * `type` so static checks can demand a sha256 pin on `github-release`/`url`
 * and an input checksum list on `build-on-host`.
 */
export const DepSourceSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('github-release'),
      repo: z.string().min(1),
      asset: z.string().min(1),
      sha256: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('url'),
      url: z.string().url(),
      sha256: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('build-on-host'),
      recipe: z.string().min(1),
      input_checksums: z.array(z.string()).default([]),
    })
    .strict(),
  z
    .object({
      type: z.literal('apt'),
      version: z.string().optional(),
    })
    .strict(),
])

/**
 * Fields shared by every host-installed kind: a single path on disk, an
 * owning team, optional install workflow, profile/lifecycle/preflight.
 */
const HostDepBaseFields = {
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, {
    message: 'external-dep name must be kebab-case starting with a letter',
  }),
  description: z.string().optional(),
  install_path: z.string().min(1).optional(),
  install_owner: z.string().min(1).optional(),
  install_workflow: z.string().optional(),
  required_in_profiles: z.array(DepProfileSchema).default([]),
  lifecycle: DepLifecycleSchema.optional(),
  preflight: DepPreflightSchema.optional(),
  sourceRef: SourceRefSchema.optional(),
}

/**
 * `kind: host-binary` — a single executable / kernel / library installed
 * on the host. Examples: firecracker binary, vmlinux kernel image,
 * jailer binary.
 */
export const HostBinaryDepSchema = z
  .object({
    kind: z.literal('host-binary'),
    ...HostDepBaseFields,
    install_path: z.string().min(1), // required for host-binary
    source: DepSourceSchema.optional(),
  })
  .strict()

/**
 * `kind: host-artifact` — a non-executable build artifact installed on
 * the host. Examples: golden rootfs image (built via `build-golden.sh`),
 * generated SSL bundles, prebuilt model weights.
 */
export const HostArtifactDepSchema = z
  .object({
    kind: z.literal('host-artifact'),
    ...HostDepBaseFields,
    install_path: z.string().min(1), // required for host-artifact
    source: DepSourceSchema.optional(),
  })
  .strict()

/**
 * `kind: apt-package` — an OS package installed via the host package
 * manager (apt, dnf, apk, brew, …). Generalised name despite the apt-
 * prefix; the field `manager` lets authors record the actual tool.
 */
export const AptPackageDepSchema = z
  .object({
    kind: z.literal('apt-package'),
    ...HostDepBaseFields,
    manager: z.enum(['apt', 'dnf', 'apk', 'brew', 'choco', 'pacman']).default('apt'),
    used_by_scripts: z.array(z.string()).default([]),
  })
  .strict()

/**
 * One outbound (or inbound webhook) connection a module has to a thing
 * outside the application boundary. Internal in-cluster service-to-service
 * calls are modelled as use-case steps with a target module of `type:
 * service`, not here — those aren't external.
 */
export const HttpApiDepSchema = z
  .object({
    /**
     * Discriminator. Legacy entries without `kind` are treated as `http-api`
     * by the parser (see ExternalDepEntrySchema below).
     */
    kind: z.literal('http-api').optional(),
    /**
     * Short slug, unique within the module. Becomes the entity's id in
     * `pd_search` results and in `pd export operations`.
     */
    name: z.string().regex(/^[a-z][a-z0-9-]*$/, {
      message: 'external-dep name must be kebab-case starting with a letter',
    }),
    /**
     * Who calls whom:
     * - `outbound`     — the module dials out (most common).
     * - `inbound`      — an outsider dials in (webhooks, push callbacks).
     * - `bidirectional`— both directions, e.g. WebSocket / gRPC streams.
     */
    direction: z.enum(['outbound', 'inbound', 'bidirectional']),
    /**
     * Wire protocol or transport. Free-form string; canonical values
     * include `https`, `http`, `tcp`, `grpc`, `websocket`, `sse`, `smtp`,
     * `amqp`, `kafka`, `redis`, `postgres`, `mongodb`, `s3`. Custom
     * protocols are accepted.
     */
    protocol: z.string().min(1),
    /**
     * Where to find the dependency. Hostname, hostname+port, URL prefix,
     * service-discovery name — whatever the application configuration
     * uses. Don't put secrets here; reference the config key via
     * `usesConfigKey` instead.
     */
    endpoint: z.string().min(1),
    /** One-line purpose statement: "what does this dep do for us". */
    purpose: z.string().optional(),
    /**
     * Pizza Doc ref to the component (or module) that owns the
     * connection. For "all components in module X" use `module:X`.
     */
    consumer: RefSchema,
    /**
     * Authentication scheme. The actual secret comes from `usesConfigKey`
     * — this field is just the shape of the auth.
     */
    auth: z.enum([
      'none',
      'bearer',
      'api-key',
      'basic',
      'mtls',
      'oauth2',
      'aws-signature',
      'custom',
    ]),
    /**
     * Config-map key (within this module) whose value carries the auth
     * token / credential. Required when `auth` is anything other than
     * `none` and `mtls` (those two often resolve via filesystem-mounted
     * material and may not have a single key). Validator checks that
     * the key exists in this module's config-map.
     */
    usesConfigKey: z.string().optional(),
    /**
     * What happens when the dep is unavailable / slow / errors. Free
     * prose; helps the on-call engineer reason about blast radius.
     * Examples: `"circuit break, return 503 to caller"`, `"fail-fast on
     * startup; runtime: connection-pool circuit"`, `"queue locally,
     * retry with exponential backoff"`.
     */
    failureMode: z.string().optional(),
    /**
     * Code or script that proves the dependency exists before the module
     * serves traffic. Required for file/device/exec dependencies.
     */
    preflightCheck: ExternalDepCheckSchema.optional(),
    /**
     * Code or script that detects drift after deploy. A drift probe may
     * substitute for a preflight check when the dependency is intentionally
     * runtime-only.
     */
    driftProbe: ExternalDepCheckSchema.optional(),
    /**
     * Positional argv contract for legacy exec boundaries. Use this when a
     * typed component has to cross into bash, CLI, or another ordered-arg
     * adapter where field names disappear.
     */
    positionalArgs: ExternalDepPositionalArgsSchema.optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

/**
 * The v0.3 (A3) discriminator over external-dep entries. Legacy entries
 * without `kind` are normalized to `kind: 'http-api'` so existing spaces
 * keep parsing unchanged.
 */
export const ExternalDepEntrySchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>
      if (obj.kind === undefined) {
        return { ...obj, kind: 'http-api' }
      }
    }
    return raw
  },
  z.discriminatedUnion('kind', [
    HttpApiDepSchema.extend({ kind: z.literal('http-api') }),
    HostBinaryDepSchema,
    HostArtifactDepSchema,
    AptPackageDepSchema,
  ]),
)

export const ExternalDepsFileSchema = z.array(ExternalDepEntrySchema)

// ---------- Operations: ADR (decision log) ----------

/**
 * Frontmatter of a single Architecture Decision Record file. The body of
 * the ADR is markdown and is NOT part of the schema — `pd export
 * --include-decisions` reads it lazily so default loads stay light.
 */
export const AdrFrontmatterSchema = z
  .object({
    /** Stable id, e.g. `ADR-007`. Filename must start with this. */
    id: z.string().regex(/^ADR-[0-9]{3,}$/, {
      message: 'ADR id must match ADR-NNN (three or more digits, leading zeros)',
    }),
    /** One-line title for the decision. Falls through to the file's first H1 if absent. */
    title: z.string().optional(),
    status: z.enum(['proposed', 'accepted', 'deprecated', 'superseded']),
    date: z.string().optional(),
    decider: z.string().optional(),
    /** ADR ids this one supersedes (older decisions now obsolete). */
    supersedes: z.array(z.string()).default([]),
    /** ADR id that supersedes THIS one (when the decision later changed). */
    supersededBy: z.string().nullable().optional(),
  })
  .strict()

/**
 * The loaded representation of an ADR — frontmatter + path + (optionally)
 * the title and body. Body is omitted from default loads; a separate
 * read pass populates it for `--include-decisions` exports.
 */
export const AdrRefSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    date: z.string().optional(),
    decider: z.string().optional(),
    supersedes: z.array(z.string()).default([]),
    supersededBy: z.string().nullable().optional(),
    /** Space-relative path, e.g. `decisions/ADR-001-runtime-choice.md`. */
    path: z.string(),
    /** Populated only when the loader is asked to include bodies. */
    body: z.string().optional(),
  })
  .strict()

// ---------- Operations: runbooks + health contracts (v0.3 — A4) ----------

/**
 * Frontmatter of a runbook markdown file at
 * `operations/runbooks/<id>.md`. Body is free markdown (trigger /
 * detection / fix / verification / prevention sections by convention).
 *
 * Severity drives `--check-runbook-coverage` (A5):
 *   - p0 / p1 — escalates the missing-runbook check to error
 *   - p2     — stays warn
 *   - validation-error — never required (user input failures)
 */
export const RunbookFrontmatterSchema = z
  .object({
    /** Stable id, must match the filename stem (`workspace-stuck-queued`). */
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/, {
      message: 'runbook id must be kebab-case starting with a letter',
    }),
    /** One-line title shown in tables; falls through to filename if absent. */
    title: z.string().optional(),
    /** Operational severity. */
    severity: z.enum(['p0', 'p1', 'p2', 'validation-error']),
    /**
     * Who owns this runbook. Free-form (team name, agent name, GitHub
     * handle). Validator does not enforce it resolves to an actor.
     */
    owner: z.string().min(1).optional(),
    /** Short description of the user-visible trigger (drives detection). */
    trigger: z.string().optional(),
    /**
     * Optional list of error_flow ids (or use-case error_flow refs) this
     * runbook covers. Drives `--check-runbook-coverage` linkage.
     */
    covers: z.array(z.string()).default([]),
    /**
     * Optional list of ADR ids that explain or prevent this class of
     * failure. Same shape as `Module.decisions`.
     */
    decisions: z.array(z.string().regex(/^ADR-[0-9]{3,}$/)).default([]),
  })
  .strict()

/**
 * Loaded representation of a runbook file. The body is captured for
 * exporters; loader-time it stays a single string blob, parsing happens
 * on demand.
 */
export const RunbookRefSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    severity: z.enum(['p0', 'p1', 'p2', 'validation-error']),
    owner: z.string().optional(),
    trigger: z.string().optional(),
    covers: z.array(z.string()).default([]),
    decisions: z.array(z.string()).default([]),
    /** Space-relative path, e.g. `operations/runbooks/workspace-stuck-queued.md`. */
    path: z.string(),
    /** Populated only when the loader is asked to include bodies. */
    body: z.string().optional(),
  })
  .strict()

/**
 * Health contract for a module. Declares the JSON shape of the module's
 * `/healthz` (or equivalent) response. Lets `pd validate` cross-check
 * monitors and dashboards against the canonical contract.
 *
 * Filename is `operations/health-contracts/<moduleId>.yaml`; the loader
 * keys these by module.
 */
export const HealthContractFieldSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    description: z.string().optional(),
    /**
     * For enum-typed fields, the closed set of allowed values. Lets
     * monitors check status codes statically.
     */
    enumValues: z.array(z.string()).min(1).optional(),
    /** Whether the field is mandatory in the response. */
    required: z.boolean().default(true),
  })
  .strict()

export const HealthContractFileSchema = z
  .object({
    kind: z.literal('health-contract'),
    /** Endpoint path on the module (typically `/healthz` or `/livez`). */
    path: z.string().min(1).default('/healthz'),
    /** HTTP status code returned when the contract is fully satisfied. */
    okStatus: z.number().int().min(100).max(599).default(200),
    fields: z.array(HealthContractFieldSchema).default([]),
    description: z.string().optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

// ---------- Modules ----------

export const ModuleType = z.enum(['frontend', 'service', 'database', 'queue', 'external'])

/**
 * `exception → httpStatus` translation rule. A service module declares
 * these so every use-case-level `errorFlow` has a concrete wire-level
 * outcome without repeating the mapping per flow. `pd-implementer`
 * wires the mapping into framework error handlers (Spring
 * `@ControllerAdvice`, NestJS filters, FastAPI exception handlers, …).
 */
export const ErrorMappingSchema = z
  .object({
    /** Exception / error class name as it appears in source. */
    exception: z.string(),
    /** Wire status code returned to the client. */
    httpStatus: z.number().int().min(100).max(599),
    /**
     * Optional machine-readable error code — callers usually key off
     * this rather than status. E.g. `STRIPE_DECLINED`, `NOT_FOUND`.
     */
    code: z.string().optional(),
    description: z.string().optional(),
    /**
     * Evidence that the documented mapping is implemented. Readiness accepts
     * either a direct sourceRef/handlerRef or the nested implementationProof
     * object; validate keeps the field optional for backward compatibility.
     */
    sourceRef: SourceRefSchema.optional(),
    handlerRef: RefSchema.optional(),
    implementationProof: ImplementationProofSchema.optional(),
  })
  .strict()

export const ModuleSchema = z
  .object({
    kind: z.literal('module'),
    id: IdSchema,
    name: z.string(),
    type: ModuleType,
    techStack: z.string().optional(),
    description: z.string().optional(),
    domains: z.array(DomainSchema).default([]),
    components: z.array(ComponentSchema).default([]),
    models: z.array(ModelSchema).default([]),
    tables: z.array(TableSchema).default([]),
    /**
     * Module-scoped exception → HTTP status table. Mostly useful on
     * service modules; silently ignored for other module types.
     */
    errorMapping: z.array(ErrorMappingSchema).default([]),
    /**
     * Configuration knobs this module reads from outside itself. Lives
     * in `modules/<id>/config-map.yaml` as a top-level YAML list; the
     * loader assembles entries here. Authors don't usually set this in
     * `module.yaml` directly.
     */
    configMap: z.array(ConfigMapEntrySchema).default([]),
    /**
     * Outbound (or inbound webhook) connections this module has to
     * external systems. Lives in `modules/<id>/external-deps.yaml`.
     * Same loader pattern as `configMap`.
     */
    externalDeps: z.array(ExternalDepEntrySchema).default([]),
    /**
     * ADR ids that record decisions affecting this module. The full
     * ADR bodies live in `decisions/ADR-NNN-*.md` and are NOT loaded
     * by default — see `Space.decisions` for the index. Authors set
     * this list in `module.yaml` to anchor decisions to modules.
     */
    decisions: z.array(z.string().regex(/^ADR-[0-9]{3,}$/)).default([]),
    /**
     * Standalone state machines (v0.3 — A2). Live in
     * `modules/<id>/state-machines/<id>.yaml` and are assembled here by
     * the loader. Authors do not set this list in `module.yaml`.
     */
    stateMachines: z.array(StateMachineFileSchema).default([]),
    /**
     * Optional health contract for this module (v0.3 — A4). Lives at
     * `operations/health-contracts/<moduleId>.yaml`. Loader-populated.
     */
    healthContract: HealthContractFileSchema.optional(),
  })
  .strict()

// ---------- Actors ----------

export const ActorSchema = z
  .object({
    kind: z.literal('actor'),
    id: IdSchema,
    name: z.string(),
    type: z.enum(['user', 'system', 'scheduler']).default('user'),
    description: z.string().optional(),
    /**
     * Codes the validator should silently drop for this actor — typically
     * `ACTOR_UNUSED` when a system actor is wired through events
     * the spec doesn't yet model.
     */
    suppress: z.array(z.string()).optional(),
  })
  .strict()

// ---------- Use Cases ----------

export const UseCaseStepSchema = z
  .object({
    from: RefSchema,
    to: RefSchema,
    via: RefSchema.optional(),
    /**
     * Wire protocol for this leg of the call chain.
     *
     * - `http` — client → controller (request direction).
     * - `http-response` — controller → client (response direction); lets the
     *   graph close a loop back to the frontend as a terminal step without
     *   pretending it's a new HTTP request.
     * - `sse` — server-sent events, push channel into a `subscriber` or
     *   `consumer` component on the receiving side.
     * - `websocket` — bidirectional channel; treated like `sse` for
     *   target-shape rules.
     * - `internal-call` — same-module function call.
     * - `sql` — repository → table.
     * - `event` — publish/consume via a queue.
     * - `external-api` — call to a third-party service.
     */
    protocol: z
      .enum([
        'http',
        'http-response',
        'sse',
        'websocket',
        // `ws` is an alias for `websocket` — same target-shape rules.
        // Authors that prefer the shorter form can use it; the validator
        // treats them identically downstream.
        'ws',
        'internal-call',
        'sql',
        'event',
        'external-api',
      ])
      .optional(),
    /**
     * Concurrency shape of this step relative to the use case's main flow.
     *
     * - omitted / `sync` — synchronous call: `from` calls `to` and waits.
     *   Continuity check expects `to` (or a frame above it) to be on the
     *   stack for the next step's `from`.
     * - `spawn` — `from` synchronously launches `to` as background work and
     *   returns immediately. `to` is added to the use case's "spawned set":
     *   subsequent steps may originate from `to` without tripping
     *   `USECASE_STEP_CHAIN_DISCONTINUITY`. Models goroutine fork, thread
     *   start, child process exec, Promise launch, queue publish-then-go.
     * - `parallel` — `from` fans out to `to` as one of several concurrent
     *   children. Same continuity treatment as `spawn`.
     */
    kind: z.enum(['sync', 'spawn', 'parallel']).optional(),
    description: z.string().optional(),
  })
  .strict()

export const ErrorFlowSchema = z
  .object({
    id: IdSchema,
    condition: z.string(),
    steps: z.array(UseCaseStepSchema),
    resultDescription: z.string().optional(),
  })
  .strict()

export const DataFlowSchema = z
  .object({
    sourceField: z.string(),
    targetField: z.string(),
    /**
     * `one` (default) — scalar field maps to a scalar column.
     * `many` — one list-valued field fans out into many rows on the target
     * table. Relaxes `DATAFLOW_TYPE_INCOMPATIBLE` on list↔scalar pairs and
     * documents the fan-out semantics explicitly so readers don't have to
     * guess from prose.
     */
    cardinality: z.enum(['one', 'many']).default('one'),
    transform: z.string().optional(),
  })
  .strict()

/**
 * Pre-conditions this use case needs before it runs, at the authorization
 * + context layer. `pd-implementer` renders these as framework-native
 * guards (Spring `@PreAuthorize`, NestJS guards, FastAPI dependencies,
 * middleware). Flags land as feature-flag checks.
 */
export const UseCaseRequirementSchema = z
  .object({
    /**
     * Global role the actor must hold. Matches the role strings on
     * `actor.type: user` tables (e.g. `SUPER_ADMIN`, `USER`).
     */
    role: z.string().optional(),
    /**
     * Tenant-scoped role (e.g. `TENANT_ADMIN`, `SHOP_MANAGER`). Only
     * meaningful in multi-tenant systems.
     */
    tenantRole: z.string().optional(),
    /**
     * `true` when the request must have a resolved tenant context
     * (e.g. tenant subdomain, JWT tenant claim). `false` — explicitly
     * tenant-less. Unset — doesn't matter for this use case.
     */
    tenantContext: z.boolean().optional(),
    /** Feature flag name that must be enabled. */
    flag: z.string().optional(),
    /** Free prose for requirements that don't fit the above. */
    description: z.string().optional(),
  })
  .strict()

export const UseCaseSchema = z
  .object({
    kind: z.literal('usecase'),
    id: IdSchema,
    name: z.string(),
    actor: RefSchema,
    trigger: z.string(),
    description: z.string().optional(),
    /**
     * Whose viewpoint this use case is described from.
     *
     * - `user`   — the canonical user-facing flow: starts at a frontend,
     *   passes through controllers, ends at a terminal. Default when
     *   `actor.type === 'user'`.
     * - `system` — a system-perspective slice: triggered by a user but
     *   described from inside a service / agent / queue. Skips the
     *   FIRST_STEP_NOT_FROM_FRONTEND warning even if `actor.type ===
     *   'user'`. Use when one user action fans out into multiple
     *   downstream flows you want to model separately.
     */
    perspective: z.enum(['user', 'system']).optional(),
    steps: z.array(UseCaseStepSchema),
    errorFlows: z.array(ErrorFlowSchema).default([]),
    invariants: z
      .object({
        pre: z.array(z.string()).default([]),
        post: z.array(z.string()).default([]),
      })
      .strict()
      .default({ pre: [], post: [] }),
    /**
     * Structured pre-conditions (role / tenant / flag). Separated from
     * `invariants.pre` because those are free prose; these are
     * machine-enforced.
     */
    requires: z.array(UseCaseRequirementSchema).default([]),
    dataFlow: z.array(DataFlowSchema).default([]),
    /**
     * Codes the validator should silently drop for this use case. Useful
     * for `USECASE_STEP_CHAIN_DISCONTINUITY` when async fan-out can't be
     * cleanly captured by `kind: spawn` (rare), or for
     * `USECASE_LAST_STEP_NOT_TERMINAL` on a flow that legitimately ends
     * mid-stack (a "fire and forget" job where the rest is async).
     * `SCHEMA_*` and `REF_*` codes are NOT suppressible.
     */
    suppress: z.array(z.string()).optional(),
    sourceRef: SourceRefSchema.optional(),
  })
  .strict()

// ---------- Space ----------

export const ChangeStatusSchema = z.enum([
  'draft',
  'design-review',
  'design-approved',
  'implementing',
  'verified',
  'adopted',
  'rejected',
])

export const ChangeSetSchema = z
  .object({
    id: IdSchema,
    title: z.string(),
    status: ChangeStatusSchema.default('draft'),
    createdAt: z.string(),
    owner: z.string().optional(),
    scope: z
      .object({
        modules: z.array(IdSchema).default([]),
        services: z.array(z.string()).default([]),
      })
      .strict()
      .optional(),
    implementation: z
      .object({
        requiredChecks: z.array(z.string()).default([]),
        requiredCodeOwners: z.array(z.string()).default([]),
      })
      .strict()
      .optional(),
    /**
     * Canonical space-relative files removed by this change when the overlay
     * is merged. Additions and modifications live under
     * `changes/<id>/overlay/<same path>`.
     */
    deletes: z.array(z.string()).default([]),
    adoptedAt: z.string().optional(),
    rejectedAt: z.string().optional(),
  })
  .strict()

export const SpaceMetaSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    description: z.string().optional(),
    version: z.string().default('0.1.0'),
    pizzaDocVersion: z.string().default('0.1.0'),
    /**
     * Optional hint for `pd-extract-*` / `pd-implementer` skills: what
     * language the backing code is (or will be) written in. Free-form
     * string — skills match case-insensitively. Typical values:
     * `java`, `kotlin`, `typescript`, `javascript`, `python`, `go`,
     * `rust`, `csharp`, `ruby`, `swift`. Unset = the user will tell the
     * agent explicitly.
     */
    implementationLanguage: z.string().optional(),
    /**
     * Optional framework hint within that language. Helps skills pick
     * the right idiom (e.g. Java+Spring vs Java+Quarkus). Also
     * free-form; canonical values include `spring`, `nestjs`, `express`,
     * `fastapi`, `django`, `gin`, `actix`, …
     */
    implementationFramework: z.string().optional(),
  })
  .strict()

export const SpaceFileSchema = z
  .object({
    meta: SpaceMetaSchema,
  })
  .strict()

export const SpaceSchema = z
  .object({
    meta: SpaceMetaSchema,
    actors: z.array(ActorSchema).default([]),
    modules: z.array(ModuleSchema).default([]),
    useCases: z.array(UseCaseSchema).default([]),
    /**
     * Architecture decision records loaded from `decisions/ADR-NNN-*.md`.
     * Frontmatter is parsed eagerly; bodies stay on disk and are read
     * only when an exporter is told to include them. Read-only on the
     * loaded space — authors edit the markdown files directly, not this
     * field.
     */
    decisions: z.array(AdrRefSchema).default([]),
    /**
     * Runbooks loaded from `operations/runbooks/<id>.md` (v0.3 — A4).
     * Same lazy-body strategy as ADRs. Read-only on the loaded space.
     */
    runbooks: z.array(RunbookRefSchema).default([]),
    /**
     * Cross-module state machines loaded from
     * `operations/state-machines/<id>.yaml` (v0.3 — A4). Module-scoped
     * state machines stay on `Module.stateMachines`; this collection is
     * for machines spanning multiple modules.
     */
    operationsStateMachines: z.array(StateMachineFileSchema).default([]),
  })
  .strict()

// ---------- Inferred types ----------

export type Id = z.infer<typeof IdSchema>
export type Ref = z.infer<typeof RefSchema>
export type Field = z.infer<typeof FieldSchema>
export type Column = z.infer<typeof ColumnSchema>
export type Method = z.infer<typeof MethodSchema>
export type Model = z.infer<typeof ModelSchema>
export type Component = z.infer<typeof ComponentSchema>
export type Table = z.infer<typeof TableSchema>
export type Index = z.infer<typeof IndexSchema>
export type Domain = z.infer<typeof DomainSchema>
export type Module = z.infer<typeof ModuleSchema>
export type Actor = z.infer<typeof ActorSchema>
export type ConfigMapEntry = z.infer<typeof ConfigMapEntrySchema>
export type ExternalDepPositionalArg = z.infer<typeof ExternalDepPositionalArgSchema>
export type ExternalDepEntry = z.infer<typeof ExternalDepEntrySchema>
export type AdrRef = z.infer<typeof AdrRefSchema>
export type AdrFrontmatter = z.infer<typeof AdrFrontmatterSchema>
export type UseCaseStep = z.infer<typeof UseCaseStepSchema>
export type ErrorFlow = z.infer<typeof ErrorFlowSchema>
export type DataFlow = z.infer<typeof DataFlowSchema>
export type UseCase = z.infer<typeof UseCaseSchema>
export type ChangeStatus = z.infer<typeof ChangeStatusSchema>
export type ChangeSet = z.infer<typeof ChangeSetSchema>
export type SpaceMeta = z.infer<typeof SpaceMetaSchema>
export type SpaceFile = z.infer<typeof SpaceFileSchema>
export type Space = z.infer<typeof SpaceSchema>
export type Validation = z.infer<typeof ValidationSchema>
export type StateMachine = z.infer<typeof StateMachineSchema>
export type ErrorMapping = z.infer<typeof ErrorMappingSchema>
export type UseCaseRequirement = z.infer<typeof UseCaseRequirementSchema>
export type CallCredential = z.infer<typeof CallCredentialSchema>
export type CallTarget = z.infer<typeof CallTargetSchema>
export type CallSpec = z.infer<typeof CallSpecSchema>
export type RouteAuth = z.infer<typeof RouteAuthSchema>
export type Route = z.infer<typeof RouteSchema>
export type EventEmit = z.infer<typeof EventEmitSchema>
export type EventSubscribe = z.infer<typeof EventSubscribeSchema>
export type WireCaptureScenario = z.infer<typeof WireCaptureScenarioSchema>
export type WireCapture = z.infer<typeof WireCaptureSchema>
export type TableMigration = z.infer<typeof TableMigrationSchema>
export type StateMachineInvariants = z.infer<typeof StateMachineInvariantsSchema>
export type StateMachineScenario = z.infer<typeof StateMachineScenarioSchema>
export type StateMachineTransition = z.infer<typeof StateMachineTransitionSchema>
export type StateMachineStateConfig = z.infer<typeof StateMachineStateConfigSchema>
export type StateMachineFile = z.infer<typeof StateMachineFileSchema>
export type RunbookFrontmatter = z.infer<typeof RunbookFrontmatterSchema>
export type RunbookRef = z.infer<typeof RunbookRefSchema>
export type HealthContractField = z.infer<typeof HealthContractFieldSchema>
export type HealthContractFile = z.infer<typeof HealthContractFileSchema>
