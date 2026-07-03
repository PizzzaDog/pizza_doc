/**
 * Pass 3 — semantic validation.
 *
 * Every rule from page 05 (sections 3.1–3.6) is implemented as an
 * individually-callable, pure function of `(space, index)`. `validateSemanticPass`
 * runs them all; callers (future CLI / UI) can disable specific rules via the
 * `disabledRules` option.
 *
 * Rule codes (kept in sync with validator/types.ts):
 *   3.1 coherence:    USECASE_NO_STEPS · USECASE_STEP_CHAIN_DISCONTINUITY
 *                     USECASE_FIRST_STEP_NOT_FROM_FRONTEND · USECASE_LAST_STEP_NOT_TERMINAL
 *   3.2 DTO flow:     DTO_FLOW_VIA_TYPE_MISMATCH · HTTP_STEP_TARGET_NOT_CONTROLLER
 *                     SQL_STEP_TARGET_NOT_DATABASE
 *   3.3 data flow:    DATAFLOW_SOURCE_FIELD_MISSING · DATAFLOW_TARGET_FIELD_MISSING
 *                     DATAFLOW_TYPE_INCOMPATIBLE · DATAFLOW_TRANSFORM_MISSING
 *                     DATAFLOW_UNUSED_DTO_FIELD · DATAFLOW_UNWRITTEN_REQUIRED_COLUMN
 *   3.4 hygiene:      DUPLICATE_ID · CYCLIC_CALLS · ACTOR_UNUSED
 *                     COMPONENT_UNUSED · DTO_UNUSED
 *   3.5 cross-module: MODEL_FIELD_MISSING_COLUMN · FK_COLUMN_MISSING
 *   3.6 contracts:    STATE_MACHINE_INCOHERENT
 *   3.7 operations:   CONFIG_KEY_DUPLICATE · CONFIG_SECRET_SOURCE_UNRESOLVED
 *                     CONFIG_RUNTIME_NO_ADMIN_UI · CONFIG_RELATED_BROKEN
 *                     EXTERNAL_DEP_USES_UNKNOWN_CONFIG
 *                     EXTERNAL_DEP_ARG_CONTRACT_INVALID · ADR_BROKEN_LINK
 *                     ADR_DUPLICATE_ID · TOOL_SCHEMA_TOPLEVEL_COMBINATOR
 *                     ADR_EMBEDS_SCHEMA_LITERAL
 */

import { parse as parseYamlValue } from 'yaml'
import { closestMatches } from '../levenshtein.js'
import type { LoadedFile } from '../loader.js'
import type { RefIndex } from '../ref.js'
import type {
  Column,
  Component,
  ExternalDepEntry,
  Method,
  Model,
  Module,
  Space,
  Table,
  UseCase,
  UseCaseStep,
} from '../schema.js'
import type { ValidationCode, ValidationIssue } from './types.js'

// ---------- Public API ----------

export type SemanticRule = (
  space: Space,
  index: RefIndex,
  options?: SemanticPassOptions,
) => ValidationIssue[]

export interface SemanticPassOptions {
  /** Rule codes to skip (for future CLI --disable or UI rule toggles). */
  disabledRules?: ReadonlySet<string>
  /** Loaded raw files for rules that need literal/source-level checks. */
  files?: ReadonlyMap<string, LoadedFile>
}

/** All rules in a stable order; mirrors page 05 ordering. */
export const ALL_SEMANTIC_RULES: ReadonlyArray<{
  code: ValidationCode
  run: SemanticRule
}> = [
  { code: 'USECASE_NO_STEPS', run: ruleUseCaseNoSteps },
  { code: 'USECASE_STEP_CHAIN_DISCONTINUITY', run: ruleUseCaseStepChainContinuity },
  { code: 'USECASE_FIRST_STEP_NOT_FROM_FRONTEND', run: ruleUseCaseFirstStepFromFrontend },
  { code: 'USECASE_LAST_STEP_NOT_TERMINAL', run: ruleUseCaseLastStepTerminal },
  { code: 'DTO_FLOW_VIA_TYPE_MISMATCH', run: ruleDtoFlowViaTypeMismatch },
  { code: 'HTTP_STEP_TARGET_NOT_CONTROLLER', run: ruleHttpStepTargetController },
  { code: 'SQL_STEP_TARGET_NOT_DATABASE', run: ruleSqlStepTargetDatabase },
  { code: 'DATAFLOW_SOURCE_FIELD_MISSING', run: ruleDataFlowSourceFieldExists },
  { code: 'DATAFLOW_TARGET_FIELD_MISSING', run: ruleDataFlowTargetFieldExists },
  { code: 'DATAFLOW_TYPE_INCOMPATIBLE', run: ruleDataFlowTypeCompatibility },
  { code: 'DATAFLOW_TRANSFORM_MISSING', run: ruleDataFlowTransformExists },
  { code: 'DATAFLOW_UNUSED_DTO_FIELD', run: ruleDataFlowUnusedDtoField },
  { code: 'DATAFLOW_UNWRITTEN_REQUIRED_COLUMN', run: ruleDataFlowUnwrittenRequiredColumn },
  { code: 'DUPLICATE_ID', run: ruleDuplicateIds },
  { code: 'CYCLIC_CALLS', run: ruleCyclicCalls },
  { code: 'ACTOR_UNUSED', run: ruleActorUnused },
  { code: 'COMPONENT_UNUSED', run: ruleComponentUnused },
  { code: 'DTO_UNUSED', run: ruleDtoUnused },
  { code: 'MODEL_FIELD_MISSING_COLUMN', run: ruleModelFieldMissingColumn },
  { code: 'FK_COLUMN_MISSING', run: ruleFkColumnExists },
  { code: 'STATE_MACHINE_INCOHERENT', run: ruleStateMachineCoherence },
  { code: 'CONFIG_KEY_DUPLICATE', run: ruleConfigKeyDuplicate },
  { code: 'CONFIG_SECRET_SOURCE_UNRESOLVED', run: ruleConfigSecretSourceResolved },
  { code: 'CONFIG_RUNTIME_NO_ADMIN_UI', run: ruleConfigRuntimeNoAdminUi },
  { code: 'CONFIG_RELATED_BROKEN', run: ruleConfigRelatedBroken },
  { code: 'EXTERNAL_DEP_USES_UNKNOWN_CONFIG', run: ruleExternalDepUsesUnknownConfig },
  { code: 'EXTERNAL_DEP_ARG_CONTRACT_INVALID', run: ruleExternalDepArgContractValid },
  { code: 'ADR_BROKEN_LINK', run: ruleAdrBrokenLink },
  { code: 'ADR_DUPLICATE_ID', run: ruleAdrDuplicateId },
  { code: 'TOOL_SCHEMA_TOPLEVEL_COMBINATOR', run: ruleToolSchemaTopLevelCombinator },
  { code: 'ADR_EMBEDS_SCHEMA_LITERAL', run: ruleAdrEmbedsSchemaLiteral },
  // 3.9 Calls/routes contract layer (v0.3 — A1)
  { code: 'CONTRACT_CALL_CREDENTIAL_MISSING', run: ruleContractCallCredentialMissing },
  { code: 'CONTRACT_CALL_PATH_ORPHAN', run: ruleContractCallPathOrphan },
  { code: 'CONTRACT_CALL_HEADER_MISMATCH', run: ruleContractCallHeaderMismatch },
  { code: 'CONTRACT_CALL_ENV_MISMATCH', run: ruleContractCallEnvMismatch },
  // 3.10 State machines (v0.3 — A2)
  { code: 'STATE_MACHINE_SCENARIO_COVERAGE', run: ruleStateMachineScenarioCoverage },
  // 3.11 Host-installed external deps (v0.3 — A3)
  { code: 'HOST_DEP_BINARY_SHA256_MISSING', run: ruleHostDepBinarySha256Missing },
  { code: 'HOST_DEP_ARTIFACT_RECIPE_MISSING', run: ruleHostDepArtifactRecipeMissing },
  { code: 'HOST_DEP_PREFLIGHT_MISSING', run: ruleHostDepPreflightMissing },
  { code: 'HOST_DEP_PROD_OWNER_MISSING', run: ruleHostDepProdOwnerMissing },
  // 3.12 Operations / runbooks (v0.3 — A4)
  { code: 'RUNBOOK_COVERAGE', run: ruleRunbookCoverage },
  { code: 'RUNBOOK_BROKEN_LINK', run: ruleRunbookBrokenLink },
  // 3.13 ADR back-refs from components (v0.5 — B1)
  { code: 'COMPONENT_DECIDED_BY_INVALID_ADR', run: ruleComponentDecidedByInvalidAdr },
  { code: 'COMPONENT_DECIDED_BY_SUPERSEDED_ADR', run: ruleComponentDecidedBySupersededAdr },
  // 3.14 Pub/sub edges (v0.5 — B2)
  { code: 'EVENT_EMIT_TARGET_NOT_EVENT', run: ruleEventEmitTargetIsEvent },
  { code: 'EVENT_SUBSCRIBE_TARGET_NOT_EVENT', run: ruleEventSubscribeTargetIsEvent },
  { code: 'EVENT_NO_SUBSCRIBER', run: ruleEventNoSubscriber },
  { code: 'EVENT_SUBSCRIBE_NO_PUBLISHER', run: ruleEventSubscribeNoPublisher },
  // 3.15 Wire capture for external integrations (v0.5 — B3)
  { code: 'WIRE_CAPTURE_MISSING', run: ruleWireCaptureMissing },
  // 3.16 Table migration parity (v0.5 — B4)
  { code: 'MIGRATION_COLUMN_INCONSISTENT', run: ruleMigrationColumnInconsistent },
  // 3.17 Type closure + wiring parity (v0.6 — W1)
  { code: 'TYPE_UNRESOLVED', run: ruleTypeUnresolved },
  { code: 'WIRING_STEP_WITHOUT_CALL', run: ruleWiringStepWithoutCall },
  { code: 'WIRING_CALL_WITHOUT_STEP', run: ruleWiringCallWithoutStep },
  { code: 'STEP_VIA_MISSING', run: ruleStepViaMissing },
  // 3.18 Error mapping closure (v0.6 — W5)
  { code: 'THROWS_UNMAPPED', run: ruleThrowsUnmapped },
  // 3.19 Event delivery contract (v0.6 — W4)
  { code: 'EVENT_IDEMPOTENCY_MISSING', run: ruleEventIdempotencyMissing },
  { code: 'EVENT_KEY_FIELD_UNKNOWN', run: ruleEventKeyFieldUnknown },
  { code: 'EVENT_DELIVERY_ON_NON_EVENT', run: ruleEventDeliveryOnNonEvent },
]

export function validateSemanticPass(
  space: Space,
  index: RefIndex,
  options?: SemanticPassOptions,
): ValidationIssue[] {
  const disabled = options?.disabledRules ?? new Set<string>()
  const issues: ValidationIssue[] = []
  for (const rule of ALL_SEMANTIC_RULES) {
    if (disabled.has(rule.code)) continue
    issues.push(...rule.run(space, index, options))
  }
  return issues
}

// ---------- Shared helpers ----------

interface ComponentCtx {
  component: Component
  module: Module
  ref: string
}

interface ModelCtx {
  model: Model
  module: Module
  ref: string
}

interface TableCtx {
  table: Table
  module: Module
  ref: string
}

/** Pre-computed projections of the space used by multiple rules. */
interface SpaceIndex {
  componentsByRef: Map<string, ComponentCtx>
  componentsByName: Map<string, ComponentCtx[]>
  modelsByRef: Map<string, ModelCtx>
  modelsByName: Map<string, ModelCtx[]>
  tablesByRef: Map<string, TableCtx>
  tablesByName: Map<string, TableCtx[]>
  allUseCaseSteps: UseCase['steps']
}

function buildSpaceIndex(space: Space): SpaceIndex {
  const componentsByRef = new Map<string, ComponentCtx>()
  const componentsByName = new Map<string, ComponentCtx[]>()
  const modelsByRef = new Map<string, ModelCtx>()
  const modelsByName = new Map<string, ModelCtx[]>()
  const tablesByRef = new Map<string, TableCtx>()
  const tablesByName = new Map<string, TableCtx[]>()
  const allUseCaseSteps: UseCase['steps'] = []

  for (const module of space.modules) {
    const moduleRef = `module:${module.id}`
    for (const c of module.components) {
      const ref = `${moduleRef}/component:${c.id}`
      const ctx: ComponentCtx = { component: c, module, ref }
      componentsByRef.set(ref, ctx)
      pushToMultimap(componentsByName, c.name, ctx)
      pushToMultimap(componentsByName, c.id, ctx)
    }
    for (const m of module.models) {
      const ref = `${moduleRef}/model:${m.id}`
      const ctx: ModelCtx = { model: m, module, ref }
      modelsByRef.set(ref, ctx)
      pushToMultimap(modelsByName, m.name, ctx)
      pushToMultimap(modelsByName, m.id, ctx)
    }
    for (const t of module.tables) {
      const ref = `${moduleRef}/table:${t.id}`
      const ctx: TableCtx = { table: t, module, ref }
      tablesByRef.set(ref, ctx)
      pushToMultimap(tablesByName, t.name, ctx)
      pushToMultimap(tablesByName, t.id, ctx)
    }
    for (const d of module.domains) {
      const domainRef = `${moduleRef}/domain:${d.id}`
      for (const c of d.components) {
        const ref = `${domainRef}/component:${c.id}`
        const ctx: ComponentCtx = { component: c, module, ref }
        componentsByRef.set(ref, ctx)
        pushToMultimap(componentsByName, c.name, ctx)
        pushToMultimap(componentsByName, c.id, ctx)
      }
      for (const m of d.models) {
        const ref = `${domainRef}/model:${m.id}`
        const ctx: ModelCtx = { model: m, module, ref }
        modelsByRef.set(ref, ctx)
        pushToMultimap(modelsByName, m.name, ctx)
        pushToMultimap(modelsByName, m.id, ctx)
      }
      for (const t of d.tables) {
        const ref = `${domainRef}/table:${t.id}`
        const ctx: TableCtx = { table: t, module, ref }
        tablesByRef.set(ref, ctx)
        pushToMultimap(tablesByName, t.name, ctx)
        pushToMultimap(tablesByName, t.id, ctx)
      }
    }
  }

  for (const uc of space.useCases) {
    for (const s of uc.steps) allUseCaseSteps.push(s)
    for (const ef of uc.errorFlows) for (const s of ef.steps) allUseCaseSteps.push(s)
  }

  return {
    componentsByRef,
    componentsByName,
    modelsByRef,
    modelsByName,
    tablesByRef,
    tablesByName,
    allUseCaseSteps,
  }
}

function pushToMultimap<V>(map: Map<string, V[]>, key: string, value: V): void {
  const existing = map.get(key)
  if (existing) {
    if (!existing.includes(value)) existing.push(value)
  } else {
    map.set(key, [value])
  }
}

function camelToSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Za-z])([0-9])/g, '$1_$2')
    .replace(/([0-9])([A-Za-z])/g, '$1_$2')
    .toLowerCase()
}

/** Parse `"CreateUserRequest.email"` → `{ type: "CreateUserRequest", field: "email" }`. */
function parseQualifiedField(s: string): { type: string; field: string } | null {
  const dot = s.indexOf('.')
  if (dot < 0) return null
  const type = s.slice(0, dot)
  const field = s.slice(dot + 1)
  if (!type || !field) return null
  return { type, field }
}

type DataFlowSource =
  | { kind: 'model'; type: string; field: string }
  | { kind: 'path'; name: string }
  | { kind: 'query'; name: string }
  | { kind: 'header'; name: string }
  | { kind: 'const'; value: string }
  | { kind: 'invalid'; reason: string }

const KNOWN_SOURCE_PREFIXES = ['model', 'path', 'query', 'header', 'const'] as const

function parseDataFlowSource(s: string): DataFlowSource {
  if (!s) return { kind: 'invalid', reason: 'empty source' }
  const colon = s.indexOf(':')
  const looksPrefixed = colon > 0 && /^[a-z][a-z0-9-]*$/i.test(s.slice(0, colon))
  if (looksPrefixed) {
    const prefix = s.slice(0, colon)
    const rest = s.slice(colon + 1)
    if (prefix === 'model') {
      const parsed = parseQualifiedField(rest)
      if (!parsed) return { kind: 'invalid', reason: 'expected "model:Foo.bar"' }
      return { kind: 'model', type: parsed.type, field: parsed.field }
    }
    if (prefix === 'path' || prefix === 'query' || prefix === 'header') {
      if (!rest) return { kind: 'invalid', reason: `${prefix}: value is empty` }
      return { kind: prefix, name: rest }
    }
    if (prefix === 'const') {
      if (!rest) return { kind: 'invalid', reason: 'const: value is empty' }
      return { kind: 'const', value: rest }
    }
    return {
      kind: 'invalid',
      reason: `unknown prefix "${prefix}:" — known: ${KNOWN_SOURCE_PREFIXES.join(', ')}`,
    }
  }

  const parsed = parseQualifiedField(s)
  if (!parsed) {
    return {
      kind: 'invalid',
      reason: `expected "Type.field" or "<prefix>:..." (prefixes: ${KNOWN_SOURCE_PREFIXES.join(', ')})`,
    }
  }
  if (parsed.type === 'path' || parsed.type === 'query' || parsed.type === 'header') {
    return { kind: parsed.type, name: parsed.field }
  }
  if (parsed.type === 'const') return { kind: 'const', value: parsed.field }
  return { kind: 'model', type: parsed.type, field: parsed.field }
}

/**
 * Parse a `dataFlow.targetField`. Real systems route data well beyond DB
 * columns: CLI flags, env vars, files, network streams, queue topics, HTTP
 * headers. Pizza Doc accepts a small set of typed prefixes so the spec
 * captures these channels structurally instead of stuffing them into prose.
 *
 * Supported forms:
 *   - `Foo.bar`               → table column (legacy / default; same as `table:Foo.bar`)
 *   - `table:Foo.bar`         → table column (explicit)
 *   - `model:Foo.bar`         → DTO/entity field (cross-model dataflow)
 *   - `cli-flag:--prompt`     → CLI flag on the target component's invocation
 *   - `env-var:ANTHROPIC_KEY` → env var
 *   - `file:.app/state.json`  → file path
 *   - `stream:sse:/runs/x`    → network stream (sse / ws / grpc / http2)
 *   - `queue:run-events`      → queue topic
 *   - `http-header:X-Run-Id`  → HTTP header
 *
 * Returns a tagged result. Existence checks (table column / model field)
 * happen in the validator rule; format-only prefixes are accepted as-is
 * once the format passes.
 */
type DataFlowTarget =
  | { kind: 'table'; type: string; field: string }
  | { kind: 'model'; type: string; field: string }
  | { kind: 'cli-flag'; flag: string }
  | { kind: 'env-var'; name: string }
  | { kind: 'file'; path: string }
  | { kind: 'stream'; protocol: string; path: string }
  | { kind: 'queue'; topic: string }
  | { kind: 'http-header'; name: string }
  | { kind: 'invalid'; reason: string }

const KNOWN_TARGET_PREFIXES = [
  'table',
  'model',
  'cli-flag',
  'env-var',
  'file',
  'stream',
  'queue',
  'http-header',
] as const

function parseDataFlowTarget(s: string): DataFlowTarget {
  if (!s) return { kind: 'invalid', reason: 'empty target' }
  // Detect a typed prefix: `<word>:` at the start. The first colon is the
  // separator. Bare `Foo.bar` (no colon) falls through to the legacy table
  // form so existing specs keep validating.
  const colon = s.indexOf(':')
  const looksPrefixed = colon > 0 && /^[a-z][a-z0-9-]*$/i.test(s.slice(0, colon))
  if (!looksPrefixed) {
    const parsed = parseQualifiedField(s)
    if (!parsed) {
      return {
        kind: 'invalid',
        reason: `expected "Table.column" or "<prefix>:..." (prefixes: ${KNOWN_TARGET_PREFIXES.join(', ')})`,
      }
    }
    return { kind: 'table', type: parsed.type, field: parsed.field }
  }
  const prefix = s.slice(0, colon)
  const rest = s.slice(colon + 1)
  switch (prefix) {
    case 'table': {
      const parsed = parseQualifiedField(rest)
      if (!parsed) return { kind: 'invalid', reason: 'expected "table:Foo.bar"' }
      return { kind: 'table', type: parsed.type, field: parsed.field }
    }
    case 'model': {
      const parsed = parseQualifiedField(rest)
      if (!parsed) return { kind: 'invalid', reason: 'expected "model:Foo.bar"' }
      return { kind: 'model', type: parsed.type, field: parsed.field }
    }
    case 'cli-flag':
      if (!rest.startsWith('-')) {
        return { kind: 'invalid', reason: 'cli-flag must start with "-" or "--"' }
      }
      return { kind: 'cli-flag', flag: rest }
    case 'env-var':
      if (!rest) return { kind: 'invalid', reason: 'env-var name is empty' }
      return { kind: 'env-var', name: rest }
    case 'file':
      if (!rest) return { kind: 'invalid', reason: 'file path is empty' }
      return { kind: 'file', path: rest }
    case 'stream': {
      // `stream:<protocol>:<path>` — protocol token then a free path.
      const inner = rest.indexOf(':')
      if (inner < 0) {
        return {
          kind: 'invalid',
          reason: 'expected "stream:<protocol>:<path>" (e.g. stream:sse:/runs/x)',
        }
      }
      const protocol = rest.slice(0, inner)
      const tail = rest.slice(inner + 1)
      if (!protocol || !tail) {
        return { kind: 'invalid', reason: 'stream:<protocol>:<path> — both parts required' }
      }
      return { kind: 'stream', protocol, path: tail }
    }
    case 'queue':
      if (!rest) return { kind: 'invalid', reason: 'queue topic is empty' }
      return { kind: 'queue', topic: rest }
    case 'http-header':
      if (!rest) return { kind: 'invalid', reason: 'http-header name is empty' }
      return { kind: 'http-header', name: rest }
    default:
      return {
        kind: 'invalid',
        reason: `unknown prefix "${prefix}:" — known: ${KNOWN_TARGET_PREFIXES.join(', ')}`,
      }
  }
}

function walkAllSteps(uc: UseCase): Array<{ step: UseCaseStep; scope: 'happy' | string }> {
  const out: Array<{ step: UseCaseStep; scope: 'happy' | string }> = []
  for (const s of uc.steps) out.push({ step: s, scope: 'happy' })
  for (const ef of uc.errorFlows) {
    for (const s of ef.steps) out.push({ step: s, scope: ef.id })
  }
  return out
}

// ---------- 3.1 Use case coherence ----------

export function ruleUseCaseNoSteps(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const uc of space.useCases) {
    if (uc.steps.length === 0) {
      issues.push({
        severity: 'error',
        code: 'USECASE_NO_STEPS',
        message: `Use case '${uc.id}' has no steps. Every use case needs at least one step.`,
        entityRef: `usecase:${uc.id}`,
      })
    }
  }
  return issues
}

/**
 * Step-chain continuity with a **virtual call stack**.
 *
 * Call-graph semantics: a step `A → B` pushes `B` onto the active stack. The
 * next step's `from` is valid if it matches any frame already on the stack —
 * that's an implicit return of control to a previous caller, exactly how real
 * execution unwinds through a nested call tree.
 *
 * Only when `step.from` is a component that was never on the stack is the
 * jump a real modelling bug (e.g. the author forgot a step, or swapped two
 * components). That's the single case we still warn about.
 *
 * Terminals (DB tables, external components, frontend pages/widgets) are
 * popped immediately on entry — they can't host a call.
 *
 * Before this rule we had to author fake `table → service` return-steps to
 * keep the diagram quiet; those rendered as misleading reverse arrows on the
 * sequence canvas. With stack-awareness authors write only real calls, and
 * the validator recognises the implicit unwind for free.
 */
export function ruleUseCaseStepChainContinuity(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const uc of space.useCases) {
    if (uc.steps.length < 2) continue
    const first = uc.steps[0]
    if (!first) continue
    // The call stack holds the refs of active call frames, most-recent at the
    // end. The first step's `from` is the entry point; `to` is the first call.
    const stack: string[] = [first.from]
    // Spawned set: components reached by `kind: spawn` / `kind: parallel`
    // steps. They run in their own concurrent frame, so subsequent steps may
    // legitimately originate from them even after the sync stack has unwound.
    const spawned = new Set<string>()
    applyStep(stack, spawned, first, index)
    for (let i = 1; i < uc.steps.length; i++) {
      const step = uc.steps[i]
      if (!step) continue
      if (stack.includes(step.from)) {
        // Implicit return unwind: pop frames above `step.from` off the stack,
        // leaving `step.from` as the new active frame.
        const idx = stack.lastIndexOf(step.from)
        stack.length = idx + 1
        applyStep(stack, spawned, step, index)
        continue
      }
      if (spawned.has(step.from)) {
        // Author is continuing a previously spawned async branch. Not a
        // discontinuity — this is exactly what `kind: spawn` is for. Reset
        // the call stack to root the new sync frame at `step.from`.
        stack.length = 0
        stack.push(step.from)
        applyStep(stack, spawned, step, index)
        continue
      }
      // `step.from` was never on the stack — this is a real discontinuity, not
      // an implicit return. Warn once and keep walking from the new position
      // so later steps don't cascade into noise.
      issues.push({
        severity: 'warning',
        code: 'USECASE_STEP_CHAIN_DISCONTINUITY',
        message: `Use case '${uc.id}' step ${i + 1} starts at '${step.from}' but control has never been there in this flow (previous frames: ${stack.join(' → ') || '<empty>'}). Add the missing call, fix the step order, or mark the upstream step as kind: spawn / parallel if this is async fan-out.`,
        entityRef: `usecase:${uc.id}`,
      })
      stack.length = 0
      stack.push(step.from)
      applyStep(stack, spawned, step, index)
    }
  }
  return issues
}

function applyStep(
  stack: string[],
  spawned: Set<string>,
  step: UseCaseStep,
  index: RefIndex,
): void {
  const toTarget = index.get(step.to)
  // `kind: spawn|parallel` wins over the terminal short-circuit. Spawning
  // into an external-module component (e.g. fork/exec'ing a child binary
  // or launching a goroutine that talks to a third-party service) is a
  // legitimate fan-out — the spawned target *is* the new branch root,
  // and follow-up steps may originate from it. Recording it in `spawned`
  // before the terminal check prevents the previous bug where the
  // early-return on `isTerminal` dropped externals out of the spawned set.
  if (step.kind === 'spawn' || step.kind === 'parallel') {
    // Async fan-out: caller doesn't wait. Record `to` as a spawned branch
    // root so later steps can originate there, but don't push onto the
    // sync stack — the next step typically continues from `from`, not `to`.
    spawned.add(step.to)
    return
  }
  // Terminal targets never host outgoing calls — pop nothing but don't push
  // them onto the stack either.
  if (toTarget && isTerminal(toTarget, index, step)) return
  stack.push(step.to)
}

export function ruleUseCaseFirstStepFromFrontend(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  // Skip the rule entirely for service-only spaces: if the architecture
  // declares no `frontend` module at all, "must start in a frontend" can't
  // possibly be right. This catches API-only / vm-agent-style spaces where
  // the user actor talks to the service through some out-of-scope client.
  const hasFrontendModule = space.modules.some((m) => m.type === 'frontend')
  if (!hasFrontendModule) return issues
  for (const uc of space.useCases) {
    const first = uc.steps[0]
    if (!first) continue
    // Explicit `perspective: system` opts the use case out of the
    // frontend-first rule even when the actor is a user. This is the
    // legitimate case where the same user-triggered action is described
    // from a system viewpoint (a downstream service / agent / queue
    // consumer slice).
    if (uc.perspective === 'system') continue
    const actorTarget = index.get(uc.actor)
    if (!actorTarget || actorTarget.kind !== 'actor') continue
    if (actorTarget.entity.type !== 'user') continue
    const fromTarget = index.get(first.from)
    if (!fromTarget) continue
    const mod = targetModule(fromTarget)
    if (!mod) continue
    if (mod.type !== 'frontend') {
      issues.push({
        severity: 'warning',
        code: 'USECASE_FIRST_STEP_NOT_FROM_FRONTEND',
        message: `Use case '${uc.id}' is triggered by a user actor but its first step originates in module '${mod.id}' (type: ${mod.type}), not a frontend module. If this use case describes a system-side slice of a user action (rather than the canonical UI flow), set perspective: system on the use case to opt out of this rule.`,
        entityRef: `usecase:${uc.id}`,
      })
    }
  }
  return issues
}

export function ruleUseCaseLastStepTerminal(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const uc of space.useCases) {
    const last = uc.steps[uc.steps.length - 1]
    if (!last) continue
    const toTarget = index.get(last.to)
    if (!toTarget) continue
    if (isLastStepTerminal(toTarget, last)) continue
    issues.push({
      severity: 'warning',
      code: 'USECASE_LAST_STEP_NOT_TERMINAL',
      message: `Use case '${uc.id}' last step ends at '${last.to}', which is not a DB write, an external-API boundary, or a frontend surface. Consider adding a terminal step or a response-flow description.`,
      entityRef: `usecase:${uc.id}`,
    })
  }
  return issues
}

/**
 * Separate from the call-stack `isTerminal`: a use case *ends* when control
 * has reached either a persistence terminal (DB/external/queue) OR any
 * frontend surface — client, page, widget. The distinction matters because
 * `client`-type components participate in the call stack during the flow
 * but, as a final step, they represent "response landed in the UI".
 */
function isLastStepTerminal(
  target: NonNullable<ReturnType<RefIndex['get']>>,
  step?: UseCaseStep,
): boolean {
  if (step?.protocol === 'event' || step?.protocol === 'external-api') return true
  if (target.kind === 'table') return true
  if (target.kind === 'module')
    return target.entity.type === 'external' || target.entity.type === 'queue'
  if (target.kind === 'component') {
    if (target.module.type === 'external') return true
    if (target.module.type === 'queue') return true
    if (target.module.type === 'frontend') return true
    if (target.entity.type === 'page' || target.entity.type === 'widget') return true
  }
  return false
}

function isTerminal(
  target: NonNullable<ReturnType<RefIndex['get']>>,
  _index: RefIndex,
  step?: UseCaseStep,
): boolean {
  if (step?.protocol === 'event' || step?.protocol === 'external-api') return true
  if (target.kind === 'table') return true
  if (target.kind === 'module')
    return target.entity.type === 'external' || target.entity.type === 'queue'
  if (target.kind === 'component') {
    // External-module components are always terminal — out of our control,
    // the call is opaque from our side.
    if (target.module.type === 'external') return true
    if (target.module.type === 'queue') return true
    // Frontend pages/widgets are UI leaves — the user sees them and nothing
    // else calls forward from them within a single use case.
    //
    // `client`-type components (axios wrappers, generated SDKs) are
    // intermediaries: they originate HTTP calls AND receive responses, so
    // they have to stay on the call stack as real frames. Treating them as
    // terminals made the call-stack rule blow up on every flow whose first
    // step is `Page → apiClient`.
    if (target.entity.type === 'page' || target.entity.type === 'widget') return true
  }
  return false
}

function targetModule(target: NonNullable<ReturnType<RefIndex['get']>>): Module | undefined {
  if (target.kind === 'module') return target.entity
  if ('module' in target) return target.module
  return undefined
}

// ---------- 3.2 DTO flow consistency ----------

export function ruleDtoFlowViaTypeMismatch(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const uc of space.useCases) {
    for (const { step, scope } of walkAllSteps(uc)) {
      if (!step.via) continue
      const viaTarget = index.get(step.via)
      if (!viaTarget || viaTarget.kind !== 'model') continue
      const toTarget = index.get(step.to)
      const viaName = viaTarget.entity.name
      const viaId = viaTarget.entity.id
      // Real frameworks interleave path/query/header params with the body
      // DTO — Spring's `@PathVariable`s come before `@RequestBody`, Express
      // reads `req.params` before `req.body`, etc. Requiring the DTO to be
      // the FIRST param forces authors to lie about the actual signature.
      // Check any param slot. A `returns` match is also accepted: `via` on
      // a response edge (GET flows) legitimately names the response model
      // rather than a request body.
      const carriesVia = (m: Method): boolean =>
        m.params.some((p) => typeNameMatches(p.type, viaName) || typeNameMatches(p.type, viaId)) ||
        typeNameMatches(m.returns, viaName) ||
        typeNameMatches(m.returns, viaId)
      if (toTarget?.kind === 'method') {
        // Method-level binding is explicit — the author named the exact
        // handler, so a payload mismatch is a broken contract, not a hint.
        if (!carriesVia(toTarget.entity)) {
          issues.push({
            severity: 'error',
            code: 'DTO_FLOW_VIA_TYPE_MISMATCH',
            message: `Use case '${uc.id}' step (${scope}) passes via '${viaName}' to method '${step.to}', but that method neither accepts it as a param nor returns it.`,
            entityRef: `usecase:${uc.id}`,
          })
        }
      } else if (toTarget?.kind === 'component') {
        const methods = toTarget.entity.methods
        if (methods.length === 0) continue
        if (!methods.some(carriesVia)) {
          issues.push({
            severity: 'warning',
            code: 'DTO_FLOW_VIA_TYPE_MISMATCH',
            message: `Use case '${uc.id}' step (${scope}) passes via '${viaName}' to component '${toTarget.entity.name}', but no method on the target accepts or returns that DTO.`,
            entityRef: `usecase:${uc.id}`,
          })
        }
      }
    }
  }
  return issues
}

function typeNameMatches(declaredType: string, candidate: string): boolean {
  // Accept "Foo", "List<Foo>", "Optional<Foo>", "Foo[]", and nested like
  // "Optional<List<Foo>>" — anywhere the candidate name appears as an
  // identifier token. Validator treats field types as strings, so a naive
  // substring/token match is good enough and stable across frameworks.
  if (declaredType === candidate) return true
  const bare = declaredType.replace(/\[\]$/, '')
  if (bare === candidate) return true
  const tokens = declaredType.split(/[<>,\s[\]()]+/).filter(Boolean)
  return tokens.includes(candidate)
}

export function ruleHttpStepTargetController(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  // `http`, `sse`, `websocket`/`ws` all share the same "request-side" target
  // shape: either a `controller` (synchronous request/response), a push-
  // receiver (`consumer`/`subscriber`) for webhooks / SSE clients / queue
  // consumers / MCP listeners, or a `middleware` (auth filter, rate limiter,
  // tracing wrapper, CORS interceptor — sits between wire and controller
  // and can short-circuit).
  const pushReceiverTypes = new Set(['controller', 'consumer', 'subscriber', 'middleware'])
  for (const uc of space.useCases) {
    for (const { step, scope } of walkAllSteps(uc)) {
      if (
        step.protocol === 'http' ||
        step.protocol === 'sse' ||
        step.protocol === 'websocket' ||
        step.protocol === 'ws'
      ) {
        const toTarget = index.get(step.to)
        if (!toTarget || toTarget.kind !== 'component') continue
        if (pushReceiverTypes.has(toTarget.entity.type)) continue
        issues.push({
          severity: 'error',
          code: 'HTTP_STEP_TARGET_NOT_CONTROLLER',
          message: `Use case '${uc.id}' step (${scope}) has protocol '${step.protocol}' but target '${step.to}' is a ${toTarget.entity.type}; expected controller, consumer, subscriber, or middleware.`,
          entityRef: `usecase:${uc.id}`,
        })
      }
      if (step.protocol === 'http-response') {
        const toTarget = index.get(step.to)
        if (!toTarget || toTarget.kind !== 'component') continue
        const mod = targetModule(toTarget)
        if (mod && mod.type === 'frontend') continue
        issues.push({
          severity: 'error',
          code: 'HTTP_STEP_TARGET_NOT_CONTROLLER',
          message: `Use case '${uc.id}' step (${scope}) has protocol 'http-response' but target '${step.to}' is not a frontend component — the response must land in the caller's module.`,
          entityRef: `usecase:${uc.id}`,
        })
      }
    }
  }
  return issues
}

export function ruleSqlStepTargetDatabase(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const uc of space.useCases) {
    for (const { step, scope } of walkAllSteps(uc)) {
      if (step.protocol !== 'sql') continue
      const toTarget = index.get(step.to)
      if (!toTarget) continue
      const mod = targetModule(toTarget)
      if (mod && mod.type === 'database') continue
      issues.push({
        severity: 'error',
        code: 'SQL_STEP_TARGET_NOT_DATABASE',
        message: `Use case '${uc.id}' step (${scope}) has protocol 'sql' but target '${step.to}' is in module type '${mod?.type ?? 'unknown'}', not a database module.`,
        entityRef: `usecase:${uc.id}`,
      })
    }
  }
  return issues
}

// ---------- 3.3 Data flow validation ----------

export function ruleDataFlowSourceFieldExists(space: Space, _index: RefIndex): ValidationIssue[] {
  const si = buildSpaceIndex(space)
  const issues: ValidationIssue[] = []
  for (const uc of space.useCases) {
    for (const df of uc.dataFlow) {
      const parsed = parseDataFlowSource(df.sourceField)
      if (parsed.kind === 'invalid') {
        issues.push({
          severity: 'error',
          code: 'DATAFLOW_SOURCE_FIELD_MISSING',
          message: `Use case '${uc.id}' dataFlow sourceField '${df.sourceField}': ${parsed.reason}.`,
          entityRef: `usecase:${uc.id}`,
        })
        continue
      }
      if (parsed.kind !== 'model') continue
      const candidates = si.modelsByName.get(parsed.type)
      if (!candidates || candidates.length === 0) {
        issues.push({
          severity: 'error',
          code: 'DATAFLOW_SOURCE_FIELD_MISSING',
          message: `Use case '${uc.id}' dataFlow sourceField '${df.sourceField}' references unknown type '${parsed.type}'.`,
          entityRef: `usecase:${uc.id}`,
        })
        continue
      }
      const anyHasField = candidates.some((c) =>
        c.model.fields.some((f) => f.name === parsed.field),
      )
      if (!anyHasField) {
        issues.push({
          severity: 'error',
          code: 'DATAFLOW_SOURCE_FIELD_MISSING',
          message: `Use case '${uc.id}' dataFlow sourceField '${df.sourceField}' — type '${parsed.type}' has no field '${parsed.field}'.`,
          entityRef: `usecase:${uc.id}`,
        })
      }
    }
  }
  return issues
}

export function ruleDataFlowTargetFieldExists(space: Space, _index: RefIndex): ValidationIssue[] {
  const si = buildSpaceIndex(space)
  const issues: ValidationIssue[] = []
  for (const uc of space.useCases) {
    for (const df of uc.dataFlow) {
      const parsed = parseDataFlowTarget(df.targetField)
      if (parsed.kind === 'invalid') {
        issues.push({
          severity: 'error',
          code: 'DATAFLOW_TARGET_FIELD_MISSING',
          message: `Use case '${uc.id}' dataFlow targetField '${df.targetField}': ${parsed.reason}.`,
          entityRef: `usecase:${uc.id}`,
        })
        continue
      }
      if (parsed.kind === 'table') {
        const candidates = resolveTableTargets(si, parsed.type)
        if (!candidates || candidates.length === 0) {
          issues.push({
            severity: 'error',
            code: 'DATAFLOW_TARGET_FIELD_MISSING',
            message: `Use case '${uc.id}' dataFlow targetField '${df.targetField}' references unknown table '${parsed.type}'. targetField table form must be <tableId>.<column> (or an entity model name with persistedAs).`,
            entityRef: `usecase:${uc.id}`,
          })
          continue
        }
        const anyHasColumn = candidates.some((c) =>
          c.table.columns.some((col) => col.name === parsed.field),
        )
        if (!anyHasColumn) {
          issues.push({
            severity: 'error',
            code: 'DATAFLOW_TARGET_FIELD_MISSING',
            message: `Use case '${uc.id}' dataFlow targetField '${df.targetField}' — table '${parsed.type}' has no column '${parsed.field}'.`,
            entityRef: `usecase:${uc.id}`,
          })
        }
        continue
      }
      if (parsed.kind === 'model') {
        const candidates = si.modelsByName.get(parsed.type)
        if (!candidates || candidates.length === 0) {
          issues.push({
            severity: 'error',
            code: 'DATAFLOW_TARGET_FIELD_MISSING',
            message: `Use case '${uc.id}' dataFlow targetField '${df.targetField}' references unknown model '${parsed.type}'.`,
            entityRef: `usecase:${uc.id}`,
          })
          continue
        }
        const anyHasField = candidates.some((c) =>
          c.model.fields.some((f) => f.name === parsed.field),
        )
        if (!anyHasField) {
          issues.push({
            severity: 'error',
            code: 'DATAFLOW_TARGET_FIELD_MISSING',
            message: `Use case '${uc.id}' dataFlow targetField '${df.targetField}' — model '${parsed.type}' has no field '${parsed.field}'.`,
            entityRef: `usecase:${uc.id}`,
          })
        }
      }
      // Format-only prefixes (cli-flag, env-var, file, stream, queue,
      // http-header). Format already validated by parseDataFlowTarget; no
      // further structural lookup is possible without external knowledge of
      // the runtime, so we trust the author here.
    }
  }
  return issues
}

export function ruleDataFlowTypeCompatibility(space: Space, _index: RefIndex): ValidationIssue[] {
  const si = buildSpaceIndex(space)
  const issues: ValidationIssue[] = []
  for (const uc of space.useCases) {
    for (const df of uc.dataFlow) {
      const srcParsed = parseDataFlowSource(df.sourceField)
      const tgtParsed = parseDataFlowTarget(df.targetField)
      // Type compatibility only applies when we can resolve a column type on
      // the target — i.e. table targets. For typed prefixes (cli-flag,
      // env-var, file, stream, queue, http-header, model) we don't have a
      // single canonical type to compare against, so skip silently.
      if (srcParsed.kind !== 'model' || tgtParsed.kind !== 'table') continue
      const srcField = lookupField(si, srcParsed.type, srcParsed.field)
      const tgtCol = lookupColumn(si, tgtParsed.type, tgtParsed.field)
      if (!srcField || !tgtCol) continue
      if (!areTypesForFlowCompatible(srcField.type, tgtCol.sqlType, df.cardinality, si)) {
        issues.push({
          severity: 'warning',
          code: 'DATAFLOW_TYPE_INCOMPATIBLE',
          message: `Use case '${uc.id}' dataFlow ${df.sourceField} → ${df.targetField}: field type '${srcField.type}' seems incompatible with column type '${tgtCol.sqlType}' (cardinality: ${df.cardinality ?? 'one'}).`,
          entityRef: `usecase:${uc.id}`,
        })
      }
    }
  }
  return issues
}

function lookupField(si: SpaceIndex, typeName: string, fieldName: string) {
  const candidates = si.modelsByName.get(typeName)
  if (!candidates) return undefined
  for (const c of candidates) {
    const f = c.model.fields.find((x) => x.name === fieldName)
    if (f) return f
  }
  return undefined
}

function lookupColumn(si: SpaceIndex, tableName: string, colName: string): Column | undefined {
  const candidates = resolveTableTargets(si, tableName)
  if (candidates.length === 0) return undefined
  for (const c of candidates) {
    const col = c.table.columns.find((x) => x.name === colName)
    if (col) return col
  }
  return undefined
}

function resolveTableTargets(si: SpaceIndex, tableOrModelName: string): TableCtx[] {
  const direct = si.tablesByName.get(tableOrModelName)
  if (direct && direct.length > 0) return direct

  const modelCandidates = si.modelsByName.get(tableOrModelName) ?? []
  const out: TableCtx[] = []
  for (const model of modelCandidates) {
    const persistedAs = model.model.persistedAs
    if (!persistedAs) continue
    const table = si.tablesByRef.get(persistedAs)
    if (table && !out.includes(table)) out.push(table)
  }
  return out
}

function areTypesCompatible(fieldType: string, sqlType: string): boolean {
  const ft = parseTypeShape(normalizeFieldType(fieldType))
  const st = parseTypeShape(normalizeSqlType(sqlType))
  if (ft.list !== st.list) return false
  return basePrimitivesMatch(ft.base, st.base)
}

function areTypesForFlowCompatible(
  fieldType: string,
  sqlType: string,
  cardinality: 'one' | 'many' | undefined,
  si?: SpaceIndex,
): boolean {
  const ft = parseTypeShape(normalizeFieldType(fieldType))
  const st = parseTypeShape(normalizeSqlType(sqlType))
  const basesMatch =
    basePrimitivesMatch(ft.base, st.base) ||
    (si ? enumModelMatchesSql(si, ft.base, st.base) : false)
  // Fan-out: list source → scalar column is intentional ("one row per
  // element"). Cardinality `many` opts in; bases still have to match.
  if (cardinality === 'many') {
    return basesMatch
  }
  return ft.list === st.list && basesMatch
}

function enumModelMatchesSql(si: SpaceIndex, fieldBaseType: string, sqlBaseType: string): boolean {
  if (sqlBaseType !== 'enum' && sqlBaseType !== 'string' && sqlBaseType !== 'text') return false
  for (const candidates of si.modelsByName.values()) {
    for (const c of candidates) {
      if (c.model.modelKind !== 'enum') continue
      if (
        c.model.id.toLowerCase() === fieldBaseType ||
        c.model.name.toLowerCase() === fieldBaseType
      ) {
        return true
      }
    }
  }
  return false
}

function basePrimitivesMatch(a: string, b: string): boolean {
  const STRINGS: ReadonlySet<string> = new Set(['string', 'text'])
  const INTS: ReadonlySet<string> = new Set(['int', 'bigint', 'smallint', 'long', 'number'])
  const BOOLS: ReadonlySet<string> = new Set(['boolean', 'bool'])
  const UUIDS: ReadonlySet<string> = new Set(['uuid'])
  const TIMES: ReadonlySet<string> = new Set(['timestamp', 'timestamptz', 'datetime', 'date'])
  const DECIMALS: ReadonlySet<string> = new Set(['decimal', 'numeric', 'float', 'double'])
  const groups: ReadonlyArray<ReadonlySet<string>> = [STRINGS, INTS, BOOLS, UUIDS, TIMES, DECIMALS]
  for (const g of groups) {
    if (g.has(a) && g.has(b)) return true
  }
  return a === b
}

interface TypeShape {
  base: string
  list: boolean
}

/**
 * Recognise `List<X>`, `Array<X>`, `Set<X>`, `Optional<X>` and trailing `[]`
 * on both sides, peeling them to a base + list flag. The previous `\b` regex
 * silently stripped `uuid` off `uuid[]`, making field `uuid[]` normalise to
 * `uuid` while column `uuid[]` stayed as `uuid[]` — a built-in mismatch.
 */
function parseTypeShape(t: string): TypeShape {
  let s = t.trim()
  let list = false
  // Trailing [] — one level (field types rarely nest deeper in our docs).
  if (s.endsWith('[]')) {
    list = true
    s = s.slice(0, -2).trim()
  }
  // Generic wrappers.
  const wrapper = s.match(/^(list|array|set|optional|option|maybe)<(.+)>$/i)
  if (wrapper?.[2]) {
    const inner = wrapper[2].trim()
    if (/^(list|array|set)$/i.test(wrapper[1] ?? '')) list = true
    s = inner
  }
  // Strip parameterised numeric sizes like decimal(19,4) / varchar(255).
  const paren = s.match(/^([a-z_]+)\s*\(/i)
  if (paren?.[1]) s = paren[1]
  return { base: s.toLowerCase(), list }
}

function normalizeFieldType(t: string): string {
  const lower = t.toLowerCase().trim()
  // `integer` → `int` alias kept for backward-compat with spaces authored
  // before this rule existed. Everything else is passed through so
  // parseTypeShape can do its thing.
  return lower.replace(/^integer\b/, 'int')
}

function normalizeSqlType(t: string): string {
  const lower = t.toLowerCase().trim()
  if (lower.startsWith('varchar') || lower.startsWith('char')) return 'string'
  if (lower.startsWith('text')) return 'text'
  return lower
}

export function ruleDataFlowTransformExists(space: Space, _index: RefIndex): ValidationIssue[] {
  const si = buildSpaceIndex(space)
  const issues: ValidationIssue[] = []
  // Page 07 shows the canonical shape "via ComponentName.methodName". We only
  // validate that pattern and leave other `Something.other` fragments alone, so
  // prose like "pizzas.price_cents" or "OrderItem.quantity" inside a transform
  // doesn't trigger false positives.
  const viaRe = /\bvia\s+([A-Z][A-Za-z0-9_]*)\.([a-zA-Z][A-Za-z0-9_]*)/g
  for (const uc of space.useCases) {
    for (const df of uc.dataFlow) {
      if (!df.transform) continue
      for (const m of df.transform.matchAll(viaRe)) {
        const compName = m[1]
        const methodName = m[2]
        if (!compName || !methodName) continue
        const comps = si.componentsByName.get(compName)
        const found = comps?.some((c) =>
          c.component.methods.some((meth) => meth.name === methodName),
        )
        if (!found) {
          issues.push({
            severity: 'warning',
            code: 'DATAFLOW_TRANSFORM_MISSING',
            message: `Use case '${uc.id}' dataFlow transform '${df.transform}' refers to '${compName}.${methodName}' which does not exist.`,
            entityRef: `usecase:${uc.id}`,
          })
        }
      }
    }
  }
  return issues
}

export function ruleDataFlowUnusedDtoField(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const used = collectUsedDtoFields(space, index)
  for (const uc of space.useCases) {
    const viaDtos = new Set<string>()
    for (const { step } of walkAllSteps(uc)) {
      if (!step.via) continue
      const viaTarget = index.get(step.via)
      if (viaTarget && viaTarget.kind === 'model') viaDtos.add(viaTarget.entity.name)
    }
    for (const dtoName of viaDtos) {
      const models = findModelsByName(space, dtoName)
      for (const m of models) {
        for (const f of m.fields) {
          if (f.optional) continue
          const key = `${dtoName}.${f.name}`
          if (!used.has(key)) {
            issues.push({
              severity: 'warning',
              code: 'DATAFLOW_UNUSED_DTO_FIELD',
              message: `Use case '${uc.id}' passes '${dtoName}' but field '${f.name}' is not referenced in any dataFlow entry, method param, or transform.`,
              entityRef: `usecase:${uc.id}`,
            })
          }
        }
      }
    }
  }
  return issues
}

function collectUsedDtoFields(space: Space, index: RefIndex): Set<string> {
  const used = new Set<string>()
  for (const uc of space.useCases) {
    for (const df of uc.dataFlow) {
      const p = parseDataFlowSource(df.sourceField)
      if (p.kind === 'model') used.add(`${p.type}.${p.field}`)
      if (df.transform) {
        const m = df.transform.match(/([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)/g)
        if (m) for (const match of m) used.add(match)
      }
    }
  }
  // Any field of a model named by a method's params OR `returns` counts as
  // "used": request DTO fields are consumed by the handler, response DTO
  // fields by the client on the other side of the wire. Without the returns
  // leg, `via:` pointing at a response model (GET flows) would flag every
  // response field as unused.
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'component') continue
    for (const method of t.entity.methods) {
      const namedTypes = [...method.params.map((p) => p.type), method.returns]
      for (const declared of namedTypes) {
        const models = findModelsByName(space, extractBaseType(declared))
        for (const m of models) {
          for (const f of m.fields) used.add(`${m.name}.${f.name}`)
        }
      }
    }
  }
  return used
}

function extractBaseType(t: string): string {
  const inner = t.match(/^[A-Za-z]+<([A-Za-z0-9_]+)>$/)
  if (inner?.[1]) return inner[1]
  return t
}

function findModelsByName(space: Space, name: string): Model[] {
  const out: Model[] = []
  for (const mod of space.modules) {
    for (const m of mod.models) {
      if (m.name === name || m.id === name) out.push(m)
    }
    for (const d of mod.domains) {
      for (const m of d.models) {
        if (m.name === name || m.id === name) out.push(m)
      }
    }
  }
  return out
}

export function ruleDataFlowUnwrittenRequiredColumn(
  space: Space,
  _index: RefIndex,
): ValidationIssue[] {
  const si = buildSpaceIndex(space)
  const issues: ValidationIssue[] = []
  // Per-usecase: collect tables whose columns are written by this use case's dataFlow.
  // Only `table:` and bare `Table.column` targets count for the "required
  // column written" check — typed prefixes (cli-flag, env-var, …) are never
  // a substitute for a DB write.
  for (const uc of space.useCases) {
    const writesByTable = new Map<string, { table: TableCtx; columns: Set<string> }>()
    for (const df of uc.dataFlow) {
      const p = parseDataFlowTarget(df.targetField)
      if (p.kind !== 'table') continue
      for (const table of resolveTableTargets(si, p.type)) {
        const existing = writesByTable.get(table.ref)
        if (existing) existing.columns.add(p.field)
        else writesByTable.set(table.ref, { table, columns: new Set([p.field]) })
      }
    }
    for (const { table, columns: writtenCols } of writesByTable.values()) {
      for (const col of table.table.columns) {
        if (col.nullable) continue
        if (col.primaryKey) continue
        // Columns with a SQL DEFAULT are written by the database, not by
        // the caller — authors shouldn't need a dataFlow entry for them.
        if (col.default !== undefined) continue
        if (writtenCols.has(col.name)) continue
        issues.push({
          severity: 'error',
          code: 'DATAFLOW_UNWRITTEN_REQUIRED_COLUMN',
          message: `Use case '${uc.id}' writes to table '${table.table.name}' but non-nullable column '${col.name}' is not produced by any dataFlow entry. Add a mapping, set the column's default, or mark it nullable.`,
          entityRef: `usecase:${uc.id}`,
        })
      }
    }
  }
  return issues
}

// ---------- 3.4 Structural hygiene ----------

export function ruleDuplicateIds(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  checkDups(
    space.actors.map((a) => a.id),
    'actor',
    'space',
    issues,
  )
  checkDups(
    space.useCases.map((u) => u.id),
    'usecase',
    'space',
    issues,
  )
  checkDups(
    space.modules.map((m) => m.id),
    'module',
    'space',
    issues,
  )
  for (const mod of space.modules) {
    checkDups(
      mod.domains.map((d) => d.id),
      'domain',
      `module:${mod.id}`,
      issues,
    )
    checkDups(
      mod.components.map((c) => c.id),
      'component',
      `module:${mod.id}`,
      issues,
    )
    checkDups(
      mod.models.map((m) => m.id),
      'model',
      `module:${mod.id}`,
      issues,
    )
    checkDups(
      mod.tables.map((t) => t.id),
      'table',
      `module:${mod.id}`,
      issues,
    )
    for (const d of mod.domains) {
      const dref = `module:${mod.id}/domain:${d.id}`
      checkDups(
        d.components.map((c) => c.id),
        'component',
        dref,
        issues,
      )
      checkDups(
        d.models.map((m) => m.id),
        'model',
        dref,
        issues,
      )
      checkDups(
        d.tables.map((t) => t.id),
        'table',
        dref,
        issues,
      )
    }
  }
  return issues
}

function checkDups(
  ids: readonly string[],
  kind: string,
  scopeLabel: string,
  issues: ValidationIssue[],
): void {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id)
    else seen.add(id)
  }
  for (const id of dupes) {
    issues.push({
      severity: 'error',
      code: 'DUPLICATE_ID',
      message: `Duplicate ${kind} id '${id}' within ${scopeLabel}.`,
      entityRef: `${scopeLabel}`,
    })
  }
}

export function ruleCyclicCalls(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const graph = buildMethodCallGraph(space, index)
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const stack: string[] = []
  const reported = new Set<string>()

  function visit(node: string): void {
    color.set(node, GRAY)
    stack.push(node)
    const neighbours = graph.get(node) ?? []
    for (const n of neighbours) {
      const c = color.get(n) ?? WHITE
      if (c === WHITE) {
        visit(n)
      } else if (c === GRAY) {
        const cycleStart = stack.indexOf(n)
        const cycle = stack.slice(cycleStart).concat(n)
        const key = canonicalCycleKey(cycle)
        if (!reported.has(key)) {
          reported.add(key)
          issues.push({
            severity: 'warning',
            code: 'CYCLIC_CALLS',
            message: `Cyclic method calls detected: ${cycle.join(' → ')}`,
          })
        }
      }
    }
    stack.pop()
    color.set(node, BLACK)
  }

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) visit(node)
  }
  return issues
}

function canonicalCycleKey(cycle: string[]): string {
  // Rotate so the lexicographically smallest element is first; unify direction.
  if (cycle.length === 0) return ''
  const minIdx = cycle.reduce((best, v, i, arr) => ((arr[best] ?? '') < v ? best : i), 0)
  const rotated = cycle.slice(minIdx).concat(cycle.slice(0, minIdx))
  return rotated.join('|')
}

function buildMethodCallGraph(space: Space, index: RefIndex): Map<string, string[]> {
  const g = new Map<string, string[]>()
  const addEdge = (from: string, to: string): void => {
    const list = g.get(from)
    if (list) list.push(to)
    else g.set(from, [to])
  }
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'component') continue
    for (const method of t.entity.methods) {
      const methodRef = `${ref}/method:${method.name}`
      if (!g.has(methodRef)) g.set(methodRef, [])
      for (const call of method.calls) {
        const target = call.target
        const calleeTarget = index.get(target)
        if (!calleeTarget) continue
        addEdge(methodRef, target)
      }
    }
  }
  // Silence unused-binding warning; space is implicitly walked via index.
  void space
  return g
}

export function ruleActorUnused(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const used = new Set<string>()
  for (const uc of space.useCases) used.add(uc.actor)
  for (const actor of space.actors) {
    const ref = `actor:${actor.id}`
    if (!used.has(ref)) {
      issues.push({
        severity: 'warning',
        code: 'ACTOR_UNUSED',
        message: `Actor '${actor.id}' is not referenced by any use case.`,
        entityRef: ref,
      })
    }
  }
  return issues
}

export function ruleComponentUnused(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const referenced = new Set<string>()

  for (const uc of space.useCases) {
    for (const { step } of walkAllSteps(uc)) {
      referenced.add(step.from)
      referenced.add(step.to)
      if (step.via) referenced.add(step.via)
    }
  }
  // `calls` produce method-refs; the component is the prefix up to `/method:`.
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'component') continue
    for (const method of t.entity.methods) {
      for (const call of method.calls) {
        const callee = call.target
        referenced.add(callee)
        const idx = callee.indexOf('/method:')
        if (idx > 0) referenced.add(callee.slice(0, idx))
      }
    }
    // `composes:` declares structural ownership without a call. UI parents
    // count their children as alive even if no method call ever happens
    // between them — `ChatView` mounts `MessageList`, so `MessageList`
    // shouldn't fire COMPONENT_UNUSED just because nothing calls a method
    // on it.
    if (t.entity.composes) {
      for (const child of t.entity.composes) referenced.add(child)
    }
  }

  // v0.5 (B2) — pub/sub edges. A component subscribed to an event that's
  // emitted somewhere in the space is reachable, even if no method call
  // mentions it. This is the COMPONENT_UNUSED escape hatch for
  // event-driven receivers (the WS-dispatcher → modal pattern from
  // production feedback).
  const emittedEvents = new Set<string>()
  for (const { component } of iterateAllComponents(space)) {
    for (const emit of component.emits ?? []) {
      emittedEvents.add(emit.event)
    }
  }
  for (const { component, componentRef } of iterateAllComponents(space)) {
    for (const sub of component.subscribes ?? []) {
      if (emittedEvents.has(sub.event)) {
        referenced.add(componentRef)
        // Don't break — keep scanning so the `for component` loop yields
        // the right set; this is cheap.
      }
    }
  }

  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'component') continue
    if (!referenced.has(ref)) {
      issues.push({
        severity: 'warning',
        code: 'COMPONENT_UNUSED',
        message: `Component '${t.entity.name}' (${ref}) is not referenced by any use case step or method call.`,
        entityRef: ref,
      })
    }
  }
  return issues
}

export function ruleDtoUnused(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const referencedByRef = new Set<string>()
  const referencedByName = new Set<string>()

  // Via a step.via ref.
  for (const uc of space.useCases) {
    for (const { step } of walkAllSteps(uc)) {
      if (step.via) referencedByRef.add(step.via)
    }
  }
  // Mentioned as a method param or return type (by name).
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'component') continue
    for (const method of t.entity.methods) {
      referencedByName.add(extractBaseType(method.returns))
      for (const p of method.params) referencedByName.add(extractBaseType(p.type))
    }
  }
  // Mentioned as another model's field type. Crucial for enums and value
  // objects that are typically referenced from `fields[].type` rather than
  // from a method signature directly.
  for (const mod of space.modules) {
    for (const m of mod.models) {
      for (const f of m.fields) referencedByName.add(extractBaseType(f.type))
    }
    for (const d of mod.domains) {
      for (const m of d.models) {
        for (const f of m.fields) referencedByName.add(extractBaseType(f.type))
      }
    }
  }
  // Mentioned as a dataFlow source type (by name).
  for (const uc of space.useCases) {
    for (const df of uc.dataFlow) {
      const p = parseDataFlowSource(df.sourceField)
      if (p.kind === 'model') referencedByName.add(p.type)
    }
  }

  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'model') continue
    if (referencedByRef.has(ref)) continue
    if (referencedByName.has(t.entity.name) || referencedByName.has(t.entity.id)) continue
    issues.push({
      severity: 'warning',
      code: 'DTO_UNUSED',
      message: `Model '${t.entity.name}' (${ref}) is not referenced by any method signature, step, or dataFlow entry.`,
      entityRef: ref,
    })
  }
  return issues
}

// ---------- 3.5 Cross-module consistency ----------

export function ruleModelFieldMissingColumn(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'model') continue
    const persisted = t.entity.persistedAs
    if (!persisted) continue
    const tgt = index.get(persisted)
    if (!tgt || tgt.kind !== 'table') continue
    for (const f of t.entity.fields) {
      if (f.optional) continue
      // Derived / non-persisted fields (e.g. JPA `@OneToMany` relations,
      // `@Transient` properties) live on the entity but never touch the
      // table. Authors opt out with `persisted: false`.
      if (f.persisted === false) continue
      const snake = camelToSnake(f.name)
      const hasColumn = tgt.entity.columns.some((c) => c.name === f.name || c.name === snake)
      if (!hasColumn) {
        issues.push({
          severity: 'warning',
          code: 'MODEL_FIELD_MISSING_COLUMN',
          message: `Model '${t.entity.name}' is persisted as table '${tgt.entity.name}' but required field '${f.name}' has no matching column (expected '${f.name}' or '${snake}'). Set 'persisted: false' if this field is derived.`,
          entityRef: ref,
        })
      }
    }
  }
  return issues
}

export function ruleFkColumnExists(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    for (const table of mod.tables) {
      checkTableFks(table, mod, undefined, index, issues)
    }
    for (const domain of mod.domains) {
      for (const table of domain.tables) {
        checkTableFks(table, mod, domain.id, index, issues)
      }
    }
  }
  return issues
}

function checkTableFks(
  table: Table,
  module: Module,
  domainId: string | undefined,
  index: RefIndex,
  issues: ValidationIssue[],
): void {
  const selfRef = domainId
    ? `module:${module.id}/domain:${domainId}/table:${table.id}`
    : `module:${module.id}/table:${table.id}`
  for (const col of table.columns) {
    if (!col.foreignKey) continue
    const tgt = index.get(col.foreignKey.table)
    if (!tgt || tgt.kind !== 'table') continue
    const hasColumn = tgt.entity.columns.some((c) => c.name === col.foreignKey?.column)
    if (!hasColumn) {
      issues.push({
        severity: 'error',
        code: 'FK_COLUMN_MISSING',
        message: `Column '${col.name}' on table '${table.name}' foreignKeys to '${col.foreignKey.table}.${col.foreignKey.column}', but that column does not exist on the target table.`,
        entityRef: selfRef,
      })
    }
  }
}

// ---------- 3.6 contract extensions (v0.2) ----------

/**
 * Sanity-check a model's `stateMachine` block:
 *   - the field it points at actually exists on the model,
 *   - every `from` / `to` / `initial` / `terminal` state is in `states`,
 *   - `terminal` states have no outgoing transitions,
 *   - no duplicate states.
 *
 * State machines are authoring-time documentation — when they drift
 * from reality they lie to `pd-implementer`, so drift needs to fail
 * loudly here.
 */
export function ruleStateMachineCoherence(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    for (const model of mod.models) {
      checkModelStateMachine(mod.id, undefined, model, issues)
    }
    for (const dom of mod.domains) {
      for (const model of dom.models) {
        checkModelStateMachine(mod.id, dom.id, model, issues)
      }
    }
    // v0.3 (A2) — standalone state machine files share the same coherence
    // checks. The entity ref points at the state machine itself so issues
    // group cleanly in CLI/UI output. Use `?? []` because hand-crafted
    // test fixtures may not include the v0.3 field; Zod-parsed Spaces
    // always do.
    for (const sm of mod.stateMachines ?? []) {
      checkStandaloneStateMachine(mod.id, sm, issues)
    }
  }
  return issues
}

/**
 * Coherence checks for a standalone state-machine file. Mirrors
 * `checkModelStateMachine` but operates on the file-level shape (no
 * surrounding model). Catches:
 *   - duplicate state names
 *   - initial not in states[]
 *   - terminal[] containing unknown states
 *   - transitions referencing unknown from/to
 *   - transitions originating from terminal states
 *   - exactly one of `on` / `trigger` set per transition
 *   - stateConfig[] referencing unknown state ids
 */
function checkStandaloneStateMachine(
  moduleId: string,
  sm: Space['modules'][number]['stateMachines'][number],
  issues: ValidationIssue[],
): void {
  const ref = `module:${moduleId}/state-machine:${sm.id}`
  const stateSet = new Set(sm.states)
  if (stateSet.size !== sm.states.length) {
    issues.push({
      severity: 'error',
      code: 'STATE_MACHINE_INCOHERENT',
      message: `State machine '${sm.id}' has duplicate state names in states[].`,
      entityRef: ref,
    })
  }
  if (sm.initial !== undefined && !stateSet.has(sm.initial)) {
    issues.push({
      severity: 'error',
      code: 'STATE_MACHINE_INCOHERENT',
      message: `State machine '${sm.id}' initial = '${sm.initial}' is not in states[].`,
      entityRef: ref,
    })
  }
  for (const term of sm.terminal) {
    if (!stateSet.has(term)) {
      issues.push({
        severity: 'error',
        code: 'STATE_MACHINE_INCOHERENT',
        message: `State machine '${sm.id}' terminal contains '${term}' which is not in states[].`,
        entityRef: ref,
      })
    }
  }
  const terminalSet = new Set(sm.terminal)
  for (const t of sm.transitions) {
    if (!stateSet.has(t.from)) {
      issues.push({
        severity: 'error',
        code: 'STATE_MACHINE_INCOHERENT',
        message: `State machine '${sm.id}' transition from '${t.from}' is not a declared state.`,
        entityRef: ref,
      })
    }
    if (terminalSet.has(t.from)) {
      issues.push({
        severity: 'error',
        code: 'STATE_MACHINE_INCOHERENT',
        message: `State machine '${sm.id}' transition originates at terminal state '${t.from}'.`,
        entityRef: ref,
      })
    }
    const tos = Array.isArray(t.to) ? t.to : [t.to]
    for (const to of tos) {
      if (!stateSet.has(to)) {
        issues.push({
          severity: 'error',
          code: 'STATE_MACHINE_INCOHERENT',
          message: `State machine '${sm.id}' transition to '${to}' is not a declared state.`,
          entityRef: ref,
        })
      }
    }
    // `on` and `trigger` are synonyms — exactly one should be set.
    if (t.on && t.trigger) {
      issues.push({
        severity: 'error',
        code: 'STATE_MACHINE_INCOHERENT',
        message: `State machine '${sm.id}' transition ${t.from} → ${Array.isArray(t.to) ? t.to.join('|') : t.to} sets both 'on' and 'trigger'. Use one or the other.`,
        entityRef: ref,
      })
    }
  }
  for (const sc of sm.stateConfig) {
    if (!stateSet.has(sc.id)) {
      issues.push({
        severity: 'error',
        code: 'STATE_MACHINE_INCOHERENT',
        message: `State machine '${sm.id}' stateConfig references unknown state '${sc.id}'.`,
        entityRef: ref,
      })
    }
    if (sc.timeout && !stateSet.has(sc.timeout.transition_to)) {
      issues.push({
        severity: 'error',
        code: 'STATE_MACHINE_INCOHERENT',
        message: `State machine '${sm.id}' state '${sc.id}' timeout.transition_to = '${sc.timeout.transition_to}' is not a declared state.`,
        entityRef: ref,
      })
    }
  }
}

/**
 * STATE_MACHINE_SCENARIO_COVERAGE — non-trivial transitions (those into a
 * terminal state, or transitions with declared post-invariants) should have
 * at least one scenario in scenarios[] so the harness has runtime evidence
 * of the contract. Severity: `info` by default; A5 `--check-state-coverage`
 * escalates to error.
 *
 * Why "non-trivial":
 *   - happy-path transitions (CREATED → SUBMITTED) are usually exercised by
 *     the use-case tests anyway,
 *   - what bites us is the rollback class (CREATING_VM → FAILED) where the
 *     post-condition `provisioning_error != null` must persist.
 *
 * So we only warn when a transition lands in `terminal[]` OR has any
 * `invariants.post[]` — those are the cases the model author flagged as
 * load-bearing.
 */
export function ruleStateMachineScenarioCoverage(
  space: Space,
  _index: RefIndex,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    for (const sm of mod.stateMachines ?? []) {
      const ref = `module:${mod.id}/state-machine:${sm.id}`
      const terminalSet = new Set(sm.terminal)
      const targetedByScenario = new Set<string>()
      for (const s of sm.scenarios) {
        // We don't enforce structure on `given`/`when` beyond presence; the
        // narrative is free-form. Just record that some scenario exists per
        // post-condition assertion shape.
        for (const t of s.then) targetedByScenario.add(t.trim())
      }
      for (const t of sm.transitions) {
        const tos = Array.isArray(t.to) ? t.to : [t.to]
        const landsInTerminal = tos.some((to) => terminalSet.has(to))
        const hasPostInvariants = !!t.invariants?.post && t.invariants.post.length > 0
        if (!landsInTerminal && !hasPostInvariants) continue
        // For transitions with explicit post-invariants, check that each one
        // is referenced by at least one scenario.then[] entry. Imperfect
        // (string-equality, no semantic match) — but catches "wrote an
        // invariant, forgot to assert it" silently.
        const posts = t.invariants?.post ?? []
        const missing = posts.filter((p) => !targetedByScenario.has(p.trim()))
        if (landsInTerminal && sm.scenarios.length === 0) {
          issues.push({
            severity: 'info',
            code: 'STATE_MACHINE_SCENARIO_COVERAGE',
            message: `State machine '${sm.id}' has transitions into terminal states but no scenarios[]. Add at least one scenario to make the contract executable.`,
            entityRef: ref,
          })
          break
        }
        if (missing.length > 0) {
          issues.push({
            severity: 'info',
            code: 'STATE_MACHINE_SCENARIO_COVERAGE',
            message: `State machine '${sm.id}' transition ${t.from} → ${tos.join('|')} declares post-invariants [${missing.join(', ')}] but no scenario.then[] asserts them.`,
            entityRef: ref,
          })
        }
      }
    }
  }
  return issues
}

function checkModelStateMachine(
  moduleId: string,
  domainId: string | undefined,
  model: Model,
  issues: ValidationIssue[],
): void {
  const sm = model.stateMachine
  if (!sm) return
  const ref = domainId
    ? `module:${moduleId}/domain:${domainId}/model:${model.id}`
    : `module:${moduleId}/model:${model.id}`

  // The state field must be one of the model's fields.
  if (!model.fields.some((f) => f.name === sm.field)) {
    issues.push({
      severity: 'error',
      code: 'STATE_MACHINE_INCOHERENT',
      message: `Model '${model.name}' stateMachine.field = '${sm.field}' is not declared on the model.`,
      entityRef: ref,
    })
  }

  const stateSet = new Set(sm.states)
  if (stateSet.size !== sm.states.length) {
    issues.push({
      severity: 'error',
      code: 'STATE_MACHINE_INCOHERENT',
      message: `Model '${model.name}' stateMachine has duplicate state names in states[].`,
      entityRef: ref,
    })
  }
  if (sm.initial !== undefined && !stateSet.has(sm.initial)) {
    issues.push({
      severity: 'error',
      code: 'STATE_MACHINE_INCOHERENT',
      message: `Model '${model.name}' stateMachine.initial = '${sm.initial}' is not in states[].`,
      entityRef: ref,
    })
  }
  for (const term of sm.terminal) {
    if (!stateSet.has(term)) {
      issues.push({
        severity: 'error',
        code: 'STATE_MACHINE_INCOHERENT',
        message: `Model '${model.name}' stateMachine.terminal contains '${term}' which is not in states[].`,
        entityRef: ref,
      })
    }
  }

  const terminalSet = new Set(sm.terminal)
  for (const t of sm.transitions) {
    if (!stateSet.has(t.from)) {
      issues.push({
        severity: 'error',
        code: 'STATE_MACHINE_INCOHERENT',
        message: `Model '${model.name}' transition from '${t.from}' is not a declared state.`,
        entityRef: ref,
      })
    }
    if (terminalSet.has(t.from)) {
      issues.push({
        severity: 'error',
        code: 'STATE_MACHINE_INCOHERENT',
        message: `Model '${model.name}' transition originates at terminal state '${t.from}'.`,
        entityRef: ref,
      })
    }
    const tos = Array.isArray(t.to) ? t.to : [t.to]
    for (const to of tos) {
      if (!stateSet.has(to)) {
        issues.push({
          severity: 'error',
          code: 'STATE_MACHINE_INCOHERENT',
          message: `Model '${model.name}' transition to '${to}' is not a declared state.`,
          entityRef: ref,
        })
      }
    }
  }
}

// ---------- 3.7 Operations: config-map / external-deps / ADR ----------

/**
 * Two config-map entries within the same module must not share a `key`.
 * Cross-module duplicates are fine — each module owns its own config
 * namespace.
 */
export function ruleConfigKeyDuplicate(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    const seen = new Map<string, number>()
    for (const entry of mod.configMap) {
      seen.set(entry.key, (seen.get(entry.key) ?? 0) + 1)
    }
    for (const [key, count] of seen) {
      if (count > 1) {
        issues.push({
          severity: 'error',
          code: 'CONFIG_KEY_DUPLICATE',
          message: `Module '${mod.id}' config-map declares '${key}' ${count} times. Each key must be unique within a module.`,
          entityRef: `module:${mod.id}`,
        })
      }
    }
  }
  return issues
}

/**
 * Every `type: secret` config entry must declare `sourceOfTruth` (where
 * the canonical value lives — vault path, external console, secrets
 * manager arn). Without it the spec is dishonest about where the
 * secret comes from, and a deployer can't follow.
 */
export function ruleConfigSecretSourceResolved(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    for (const entry of mod.configMap) {
      if (entry.type !== 'secret') continue
      const sot = entry.sourceOfTruth?.trim()
      if (!sot || /^(tbd|todo|fixme|\?+)$/i.test(sot)) {
        issues.push({
          severity: 'error',
          code: 'CONFIG_SECRET_SOURCE_UNRESOLVED',
          message: `Module '${mod.id}' config-map secret '${entry.key}' has no concrete sourceOfTruth (got '${sot ?? '<unset>'}'). Set it to the canonical location, e.g. "vault:secret/foo/bar" or "external (Stripe Dashboard)".`,
          entityRef: `module:${mod.id}`,
        })
      }
    }
  }
  return issues
}

/**
 * For every `lifecycle: runtime` entry there must be at least one
 * component (anywhere in the space) whose `methods` mention the
 * config key — that's the "admin UI" the user can use to flip the
 * value at runtime. We check by name search, intentionally loose:
 * the rule is here to flag false advertising, not to enforce a
 * specific binding shape.
 */
export function ruleConfigRuntimeNoAdminUi(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  // Collect all method names + descriptions across every component, once.
  const corpus: string[] = []
  for (const mod of space.modules) {
    visitComponents(mod, (c) => {
      for (const m of c.methods) {
        corpus.push(m.name)
        if (m.description) corpus.push(m.description)
      }
      if (c.description) corpus.push(c.description)
    })
  }
  const haystack = corpus.join('\n')
  for (const mod of space.modules) {
    for (const entry of mod.configMap) {
      if (entry.lifecycle !== 'runtime') continue
      // Match the literal key OR a humanised variant (camelCased / hyphenated).
      const variants = [entry.key, entry.key.toLowerCase(), keyToCamel(entry.key)]
      const found = variants.some((v) => v && haystack.includes(v))
      if (!found) {
        issues.push({
          severity: 'warning',
          code: 'CONFIG_RUNTIME_NO_ADMIN_UI',
          message: `Module '${mod.id}' config-map declares '${entry.key}' as lifecycle: runtime, but no component method or description references it. Either add an admin-UI component that exposes it, or downgrade to lifecycle: startup.`,
          entityRef: `module:${mod.id}`,
        })
      }
    }
  }
  return issues
}

function visitComponents(mod: Module, visit: (c: Component) => void): void {
  for (const c of mod.components) visit(c)
  for (const d of mod.domains) for (const c of d.components) visit(c)
}

function keyToCamel(key: string): string {
  return key
    .toLowerCase()
    .split(/[._-]/)
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('')
}

/**
 * `related: [...]` on a config entry must point to keys that exist —
 * within the same module (bare `KEY`) or in another module via
 * `config-map:<MODULE>/<KEY>`.
 */
export function ruleConfigRelatedBroken(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  // Index every (module, key) so cross-module refs can be resolved.
  const known = new Set<string>()
  for (const mod of space.modules) {
    for (const entry of mod.configMap) known.add(`${mod.id}/${entry.key}`)
  }
  for (const mod of space.modules) {
    for (const entry of mod.configMap) {
      for (const ref of entry.related) {
        const resolved = resolveConfigKeyRef(ref, mod.id)
        if (!resolved) {
          issues.push({
            severity: 'error',
            code: 'CONFIG_RELATED_BROKEN',
            message: `Module '${mod.id}' config '${entry.key}' has related: '${ref}' which is not a valid config key reference. Use 'config-map:<MODULE>/<KEY>' or a bare '<KEY>' for within-module.`,
            entityRef: `module:${mod.id}`,
          })
          continue
        }
        if (!known.has(resolved)) {
          issues.push({
            severity: 'error',
            code: 'CONFIG_RELATED_BROKEN',
            message: `Module '${mod.id}' config '${entry.key}' related ref '${ref}' resolves to '${resolved}' which is not a declared config key.`,
            entityRef: `module:${mod.id}`,
          })
        }
      }
    }
  }
  return issues
}

/**
 * Resolve a config-key ref to a fully-qualified `<MODULE>/<KEY>` form, or
 * `null` when the syntax is malformed. `defaultModule` covers the bare
 * within-module shorthand (`KEY` → `<currentModule>/KEY`).
 */
function resolveConfigKeyRef(raw: string, defaultModule: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const prefixed = trimmed.match(/^config-map:([a-z][a-z0-9-]*)\/(.+)$/)
  if (prefixed?.[1] && prefixed[2]) return `${prefixed[1]}/${prefixed[2]}`
  // Bare key: must look like a config key (no slashes, no spaces).
  if (/^[A-Za-z][A-Za-z0-9._-]*$/.test(trimmed)) return `${defaultModule}/${trimmed}`
  return null
}

/**
 * `usesConfigKey: X` on an external-dep must point to a real config-map
 * entry in the same module (auth secrets are module-local; cross-module
 * sharing would be a smell).
 */
export function ruleExternalDepUsesUnknownConfig(
  space: Space,
  _index: RefIndex,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    const keys = new Set<string>(mod.configMap.map((e) => e.key))
    for (const dep of mod.externalDeps) {
      // Only http-api deps carry `usesConfigKey` + `auth`. Host-installed
      // kinds (host-binary, host-artifact, apt-package) are checked by
      // separate v0.3 rules — they don't reference config-map keys.
      // Legacy hand-crafted Spaces may omit `kind`; treat undefined as
      // http-api so the v0.2 rules keep working unchanged.
      if (dep.kind !== 'http-api' && dep.kind !== undefined) continue
      if (!dep.usesConfigKey) {
        // Required for everything except auth=none and auth=mtls.
        if (dep.auth !== 'none' && dep.auth !== 'mtls') {
          issues.push({
            severity: 'warning',
            code: 'EXTERNAL_DEP_USES_UNKNOWN_CONFIG',
            message: `External dep '${dep.name}' in module '${mod.id}' has auth: ${dep.auth} but does not declare usesConfigKey. The config-map entry that holds the credential should be referenced.`,
            entityRef: `module:${mod.id}`,
          })
        }
        continue
      }
      if (!keys.has(dep.usesConfigKey)) {
        issues.push({
          severity: 'error',
          code: 'EXTERNAL_DEP_USES_UNKNOWN_CONFIG',
          message: `External dep '${dep.name}' in module '${mod.id}' references usesConfigKey '${dep.usesConfigKey}' but no such key exists in the module's config-map.`,
          entityRef: `module:${mod.id}`,
        })
      }
    }
  }
  return issues
}

/**
 * Basic internal consistency for ordered argv contracts: positions are a
 * complete 1-based sequence, required non-empty defaults are not blank,
 * enum defaults are legal, and json-object defaults parse as objects.
 */
export function ruleExternalDepArgContractValid(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    for (const dep of mod.externalDeps) {
      // Only http-api deps carry positionalArgs; host kinds have no exec
      // contract by definition.
      // Legacy hand-crafted Spaces may omit `kind`; treat undefined as
      // http-api so the v0.2 rules keep working unchanged.
      if (dep.kind !== 'http-api' && dep.kind !== undefined) continue
      const contract = dep.positionalArgs
      if (!contract) continue
      const args = contract.args ?? []

      const seen = new Set<number>()
      const positions = args.map((arg) => arg.position).sort((a, b) => a - b)
      for (const position of positions) {
        if (seen.has(position)) {
          issues.push(argIssue(mod, dep, `declares positional arg #${position} more than once.`))
        }
        seen.add(position)
      }
      for (let expected = 1; expected <= positions.length; expected++) {
        if (!seen.has(expected)) {
          issues.push(
            argIssue(
              mod,
              dep,
              `has a gap in positional args: expected arg #${expected} before arg #${positions.length}.`,
            ),
          )
          break
        }
      }

      for (const arg of args) {
        if (
          arg.required !== false &&
          arg.nonempty &&
          hasDefault(arg.defaultValue) &&
          isBlank(arg.defaultValue)
        ) {
          issues.push(
            argIssue(
              mod,
              dep,
              `arg #${arg.position} '${arg.name}' is required nonempty but its defaultValue is empty.`,
            ),
          )
        }
        if (
          arg.enumValues &&
          hasDefault(arg.defaultValue) &&
          !arg.enumValues.includes(String(arg.defaultValue))
        ) {
          issues.push(
            argIssue(
              mod,
              dep,
              `arg #${arg.position} '${arg.name}' defaultValue '${String(arg.defaultValue)}' is not in enumValues [${arg.enumValues.join(', ')}].`,
            ),
          )
        }
        if (/positive[-_\s]*int/i.test(arg.type) && hasDefault(arg.defaultValue)) {
          const n = Number(arg.defaultValue)
          if (!Number.isInteger(n) || n <= 0) {
            issues.push(
              argIssue(
                mod,
                dep,
                `arg #${arg.position} '${arg.name}' defaultValue '${String(arg.defaultValue)}' is not a positive integer.`,
              ),
            )
          }
        }
        if (/json[-_\s]*object/i.test(arg.type) && hasDefault(arg.defaultValue)) {
          const parsed = parseJsonObjectDefault(arg.defaultValue)
          if (!parsed) {
            issues.push(
              argIssue(
                mod,
                dep,
                `arg #${arg.position} '${arg.name}' defaultValue must be a valid JSON object literal.`,
              ),
            )
          }
        }
      }
    }
  }
  return issues
}

function argIssue(mod: Module, dep: ExternalDepEntry, detail: string): ValidationIssue {
  return {
    severity: 'error',
    code: 'EXTERNAL_DEP_ARG_CONTRACT_INVALID',
    message: `External dep '${dep.name}' in module '${mod.id}' ${detail}`,
    entityRef: `module:${mod.id}`,
  }
}

function hasDefault(value: unknown): boolean {
  return value !== undefined
}

function isBlank(value: unknown): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '')
}

function parseJsonObjectDefault(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const parsed: unknown = JSON.parse(value)
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
  } catch {
    return false
  }
}

/**
 * Every ADR id listed in `module.yaml.decisions: [...]` must exist as a
 * file in `decisions/ADR-NNN-*.md`. The ADR-loader populates
 * `space.decisions[]`; we just compare the two.
 */
export function ruleAdrBrokenLink(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const known = new Set(space.decisions.map((d) => d.id))
  for (const mod of space.modules) {
    for (const adr of mod.decisions) {
      if (!known.has(adr)) {
        issues.push({
          severity: 'error',
          code: 'ADR_BROKEN_LINK',
          message: `Module '${mod.id}' references ${adr} but no decisions/${adr}-*.md file exists.`,
          entityRef: `module:${mod.id}`,
        })
      }
    }
  }
  return issues
}

/**
 * Two ADR files declaring the same id are a copy-paste / merge mistake.
 * The loader sorts decisions by id, so we just walk pairs.
 */
export function ruleAdrDuplicateId(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (let i = 1; i < space.decisions.length; i++) {
    const prev = space.decisions[i - 1]
    const curr = space.decisions[i]
    if (prev && curr && prev.id === curr.id) {
      issues.push({
        severity: 'error',
        code: 'ADR_DUPLICATE_ID',
        message: `Two ADR files declare id '${curr.id}': ${prev.path} and ${curr.path}. ADR ids must be unique.`,
        entityRef: `usecase:${curr.id}`,
      })
    }
  }
  return issues
}

/**
 * MCP/tool schemas with a root combinator are accepted by ordinary JSON Schema
 * tooling but silently dropped by Claude Code's tool registry. This rule looks
 * for explicit tool-input schema literals in model/component files.
 */
export function ruleToolSchemaTopLevelCombinator(
  _space: Space,
  _index: RefIndex,
  options?: SemanticPassOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const files = options?.files
  if (!files) return issues

  const emitted = new Set<string>()
  for (const file of files.values()) {
    if (file.role.kind !== 'component' && file.role.kind !== 'model') continue

    for (const candidate of collectToolSchemaCandidates(file)) {
      const combinator = topLevelCombinator(candidate.schema)
      if (!combinator) continue

      const key = `${file.path}:${candidate.line ?? 0}:${candidate.name}:${combinator}`
      if (emitted.has(key)) continue
      emitted.add(key)
      const issue: ValidationIssue = {
        severity: 'warning',
        code: 'TOOL_SCHEMA_TOPLEVEL_COMBINATOR',
        file: file.path,
        message: `Tool input schema '${candidate.name}' declares top-level '${combinator}'. Claude Code drops tools whose root input schema carries oneOf/anyOf/allOf/not; keep the root a plain object and enforce XOR-style invariants server-side.`,
        suggestion:
          'Flatten the tool input schema root to type=object/properties/required, move exactly-one-of validation into handler code, and document the invariant in property descriptions.',
      }
      if (candidate.line !== undefined) issue.line = candidate.line
      issues.push(issue)
    }
  }
  return issues
}

/**
 * ADRs should point at binding YAML, not copy a second literal. Six identical
 * consecutive lines is enough to prove the markdown duplicated model YAML and
 * can drift independently.
 */
export function ruleAdrEmbedsSchemaLiteral(
  _space: Space,
  _index: RefIndex,
  options?: SemanticPassOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const files = options?.files
  if (!files) return issues

  const modelWindows = new Map<string, { file: string; line: number }>()
  for (const file of files.values()) {
    if (file.role.kind !== 'model') continue
    const lines = normalizeLiteralLines(file.source)
    for (let i = 0; i <= lines.length - SCHEMA_LITERAL_DUPLICATE_LINES; i++) {
      const key = literalWindowKey(lines, i)
      if (key && !modelWindows.has(key)) {
        modelWindows.set(key, { file: file.path, line: i + 1 })
      }
    }
  }
  if (modelWindows.size === 0) return issues

  const emitted = new Set<string>()
  for (const file of files.values()) {
    if (file.role.kind !== 'decision') continue
    const blocks = extractFencedCodeBlocks(file.source).filter(
      (block) => block.lang === 'json' || block.lang === 'yaml' || block.lang === 'yml',
    )
    for (const block of blocks) {
      const lines = normalizeLiteralLines(stripCommonIndent(block.content))
      for (let i = 0; i <= lines.length - SCHEMA_LITERAL_DUPLICATE_LINES; i++) {
        const key = literalWindowKey(lines, i)
        const model = key ? modelWindows.get(key) : undefined
        if (!model) continue

        const issueKey = `${file.path}:${block.startLine}:${i}:${model.file}:${model.line}`
        if (emitted.has(issueKey)) break
        emitted.add(issueKey)
        issues.push({
          severity: 'info',
          code: 'ADR_EMBEDS_SCHEMA_LITERAL',
          file: file.path,
          line: block.startLine + 1 + i,
          message: `ADR fenced ${block.lang} block duplicates at least ${SCHEMA_LITERAL_DUPLICATE_LINES} consecutive lines from ${model.file}:${model.line}. Binding literals should live in YAML once; ADRs should reference that path.`,
          suggestion: `Replace the fenced literal with a link/path reference to ${model.file}.`,
        })
        break
      }
    }
  }
  return issues
}

const TOOL_SCHEMA_KEYS = new Set(['inputSchema', 'input_schema'])
const TOP_LEVEL_SCHEMA_COMBINATORS = ['oneOf', 'anyOf', 'allOf', 'not'] as const
const SCHEMA_LITERAL_DUPLICATE_LINES = 6

interface ToolSchemaCandidate {
  name: string
  schema: unknown
  line?: number
}

interface FencedCodeBlock {
  lang: string
  content: string
  startLine: number
  contextBefore: string
}

function collectToolSchemaCandidates(file: LoadedFile): ToolSchemaCandidate[] {
  const out: ToolSchemaCandidate[] = []
  collectInputSchemaObjects(file.data, out)

  for (const block of extractFencedCodeBlocks(file.source)) {
    const parsed = parseLiteralObject(block.content, block.lang)
    if (!isRecord(parsed)) continue

    for (const key of TOOL_SCHEMA_KEYS) {
      if (key in parsed) {
        pushToolSchemaCandidate(out, key, parsed[key], firstCombinatorLine(block))
      }
    }

    if (mentionsInputSchema(block.contextBefore) && looksLikeJsonSchemaRoot(parsed)) {
      pushToolSchemaCandidate(out, 'inputSchema', parsed, firstCombinatorLine(block))
    }
  }

  return out
}

function pushToolSchemaCandidate(
  out: ToolSchemaCandidate[],
  name: string,
  schema: unknown,
  line?: number,
): void {
  const candidate: ToolSchemaCandidate = { name, schema }
  if (line !== undefined) candidate.line = line
  out.push(candidate)
}

function collectInputSchemaObjects(value: unknown, out: ToolSchemaCandidate[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectInputSchemaObjects(item, out)
    return
  }
  if (!isRecord(value)) return

  for (const [key, child] of Object.entries(value)) {
    if (TOOL_SCHEMA_KEYS.has(key)) {
      out.push({ name: key, schema: child })
    }
    collectInputSchemaObjects(child, out)
  }
}

function topLevelCombinator(schema: unknown): (typeof TOP_LEVEL_SCHEMA_COMBINATORS)[number] | null {
  if (!isRecord(schema)) return null
  for (const key of TOP_LEVEL_SCHEMA_COMBINATORS) {
    if (key in schema) return key
  }
  return null
}

function looksLikeJsonSchemaRoot(value: Record<string, unknown>): boolean {
  return (
    typeof value.type === 'string' ||
    'properties' in value ||
    'required' in value ||
    TOP_LEVEL_SCHEMA_COMBINATORS.some((key) => key in value)
  )
}

function parseLiteralObject(content: string, lang: string): unknown {
  const normalized = stripCommonIndent(content)
  try {
    if (lang === 'json') return JSON.parse(normalized)
    if (lang === 'yaml' || lang === 'yml') return parseYamlValue(normalized)
  } catch {
    return null
  }
  return null
}

function extractFencedCodeBlocks(source: string): FencedCodeBlock[] {
  const out: FencedCodeBlock[] = []
  const lines = source.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i]?.match(/^\s*```([A-Za-z0-9_-]+)?\s*$/)
    if (!open) continue

    const lang = (open[1] ?? '').toLowerCase()
    const startLine = i + 1
    const content: string[] = []
    i++
    while (i < lines.length && !/^\s*```\s*$/.test(lines[i] ?? '')) {
      content.push(lines[i] ?? '')
      i++
    }

    out.push({
      lang,
      content: content.join('\n'),
      startLine,
      contextBefore: lines.slice(Math.max(0, startLine - 6), startLine - 1).join('\n'),
    })
  }
  return out
}

function firstCombinatorLine(block: FencedCodeBlock): number | undefined {
  const lines = stripCommonIndent(block.content).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(oneOf|anyOf|allOf|not)\s*:/.test(lines[i] ?? '')) {
      return block.startLine + 1 + i
    }
  }
  return block.startLine + 1
}

function mentionsInputSchema(text: string): boolean {
  return /\binput[_-]?schema\b/i.test(text)
}

function normalizeLiteralLines(source: string): string[] {
  return source.split(/\r?\n/).map((line) => line.trimEnd())
}

function literalWindowKey(lines: readonly string[], start: number): string | null {
  const window = lines.slice(start, start + SCHEMA_LITERAL_DUPLICATE_LINES)
  if (window.length < SCHEMA_LITERAL_DUPLICATE_LINES) return null
  if (window.some((line) => line.trim() === '')) return null
  return window.join('\n')
}

function stripCommonIndent(source: string): string {
  const lines = source.replace(/\t/g, '  ').split(/\r?\n/)
  const nonEmpty = lines.filter((line) => line.trim() !== '')
  const minIndent =
    nonEmpty.length === 0
      ? 0
      : Math.min(...nonEmpty.map((line) => line.match(/^ */)?.[0].length ?? 0))
  return lines
    .map((line) => line.slice(minIndent))
    .join('\n')
    .trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

// Type-level evidence the new types are wired through this module so
// future refactors fail at compile time if ConfigMapEntry/ExternalDepEntry
// drift from this rule set.
type _OperationsTypesUsed = ExternalDepEntry

// ---------- 3.9 Calls/routes contract layer (v0.3 — A1) ----------
//
// Default severity is `warning`. The `--strict-contracts` CLI flag (A5)
// escalates these to `error` without changing the rule logic.

interface CallerContext {
  component: Space['modules'][number]['components'][number]
  componentRef: string
}

function* iterateAllComponents(space: Space): Generator<CallerContext> {
  for (const module of space.modules) {
    for (const component of module.components) {
      yield { component, componentRef: `module:${module.id}/component:${component.id}` }
    }
    for (const domain of module.domains) {
      for (const component of domain.components) {
        yield {
          component,
          componentRef: `module:${module.id}/domain:${domain.id}/component:${component.id}`,
        }
      }
    }
  }
}

interface ResolvedRoute {
  path: string
  method: string
  authHeader?: string
  authEnv?: string
  // Provenance — where this route came from on the callee, used in messages.
  source: 'method' | 'route'
  sourceLabel: string
}

function collectRoutesForComponent(
  component: Space['modules'][number]['components'][number],
): ResolvedRoute[] {
  const routes: ResolvedRoute[] = []
  for (const m of component.methods) {
    if (m.httpMethod && m.httpPath) {
      const entry: ResolvedRoute = {
        path: m.httpPath,
        method: m.httpMethod,
        source: 'method',
        sourceLabel: `method '${m.name}'`,
      }
      if (m.routeAuth?.header) entry.authHeader = m.routeAuth.header
      if (m.routeAuth?.env) entry.authEnv = m.routeAuth.env
      routes.push(entry)
    }
  }
  for (const r of component.routes) {
    const entry: ResolvedRoute = {
      path: r.path,
      method: r.method,
      source: 'route',
      sourceLabel: `route '${r.method} ${r.path}'`,
    }
    if (r.auth?.header) entry.authHeader = r.auth.header
    if (r.auth?.env) entry.authEnv = r.auth.env
    routes.push(entry)
  }
  return routes
}

/**
 * Look up the callee component (or its enclosing component when target is a
 * method ref) given a caller's `call.target`.
 */
function resolveCalleeComponent(
  target: string,
  index: RefIndex,
): { component: Space['modules'][number]['components'][number]; componentRef: string } | null {
  // Strip `/method:<name>` suffix to get the component ref.
  const methodIdx = target.indexOf('/method:')
  const componentRef = methodIdx > 0 ? target.slice(0, methodIdx) : target
  const found = index.get(componentRef)
  if (!found || found.kind !== 'component') return null
  return {
    component: found.entity as Space['modules'][number]['components'][number],
    componentRef,
  }
}

/**
 * `CONTRACT_CALL_CREDENTIAL_MISSING` — caller declares `optional: false`
 * (the default) on a path call but provides no `credential` block. Security
 * smell: silent unauthenticated s2s.
 */
export function ruleContractCallCredentialMissing(
  space: Space,
  _index: RefIndex,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const { component, componentRef: ref } of iterateAllComponents(space)) {
    for (const method of component.methods) {
      for (let i = 0; i < method.calls.length; i++) {
        const call = method.calls[i]
        if (!call) continue
        // Only flag when the caller is making a path-bearing call. A bare
        // ref-only `calls: ["module:foo/component:Bar"]` is the legacy form
        // and is intentionally untouched.
        if (!call.path) continue
        if (call.optional) continue
        if (call.credential && call.credential.type !== 'none') continue
        issues.push({
          severity: 'warning',
          code: 'CONTRACT_CALL_CREDENTIAL_MISSING',
          message: `Method '${method.name}' on ${ref} calls ${call.target} ${call.method ?? ''} ${call.path} without a credential. Either add credential.type or mark optional: true.`,
          entityRef: `${ref}/method:${method.name}`,
        })
      }
    }
  }
  return issues
}

/**
 * `CONTRACT_CALL_PATH_ORPHAN` — caller declares `path` + `method` for a
 * call, but the target component does not expose any matching route (via
 * `method.httpPath`/`httpMethod` or standalone `routes[]`).
 */
export function ruleContractCallPathOrphan(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const { component, componentRef: ref } of iterateAllComponents(space)) {
    for (const method of component.methods) {
      for (let i = 0; i < method.calls.length; i++) {
        const call = method.calls[i]
        if (!call || !call.path || !call.method) continue
        const callee = resolveCalleeComponent(call.target, index)
        if (!callee) continue // REF_BROKEN handles unresolved targets
        const routes = collectRoutesForComponent(callee.component)
        const match = routes.find((r) => r.path === call.path && r.method === call.method)
        if (match) continue
        issues.push({
          severity: 'warning',
          code: 'CONTRACT_CALL_PATH_ORPHAN',
          message: `Method '${method.name}' on ${ref} calls ${call.method} ${call.path} on ${callee.componentRef}, but no matching route is declared on the callee. Either add routes[] / httpPath on the callee or fix the path.`,
          entityRef: `${ref}/method:${method.name}`,
        })
      }
    }
  }
  return issues
}

/**
 * `CONTRACT_CALL_HEADER_MISMATCH` — caller's `credential.header` differs
 * from the matched callee route's `auth.header`. The pair will silently
 * fail at runtime when one side rotates the header name.
 */
export function ruleContractCallHeaderMismatch(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const { component, componentRef: ref } of iterateAllComponents(space)) {
    for (const method of component.methods) {
      for (let i = 0; i < method.calls.length; i++) {
        const call = method.calls[i]
        if (!call || !call.path || !call.method || !call.credential?.header) continue
        const callee = resolveCalleeComponent(call.target, index)
        if (!callee) continue
        const route = collectRoutesForComponent(callee.component).find(
          (r) => r.path === call.path && r.method === call.method,
        )
        if (!route || !route.authHeader) continue
        if (route.authHeader === call.credential.header) continue
        issues.push({
          severity: 'warning',
          code: 'CONTRACT_CALL_HEADER_MISMATCH',
          message:
            `Header mismatch on ${call.method} ${call.path}: caller (${ref}/method:${method.name}) sends '${call.credential.header}'` +
            ` but callee ${callee.componentRef} ${route.sourceLabel} verifies '${route.authHeader}'.`,
          entityRef: `${ref}/method:${method.name}`,
        })
      }
    }
  }
  return issues
}

/**
 * `CONTRACT_CALL_ENV_MISMATCH` — caller's `credential.env` differs from
 * the matched callee route's `auth.env`. When the two read from different
 * config-map keys the shared secret will diverge silently on rotation.
 */
export function ruleContractCallEnvMismatch(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const { component, componentRef: ref } of iterateAllComponents(space)) {
    for (const method of component.methods) {
      for (let i = 0; i < method.calls.length; i++) {
        const call = method.calls[i]
        if (!call || !call.path || !call.method || !call.credential?.env) continue
        const callee = resolveCalleeComponent(call.target, index)
        if (!callee) continue
        const route = collectRoutesForComponent(callee.component).find(
          (r) => r.path === call.path && r.method === call.method,
        )
        if (!route || !route.authEnv) continue
        if (route.authEnv === call.credential.env) continue
        issues.push({
          severity: 'warning',
          code: 'CONTRACT_CALL_ENV_MISMATCH',
          message:
            `Credential env mismatch on ${call.method} ${call.path}: caller (${ref}/method:${method.name}) reads '${call.credential.env}'` +
            ` but callee ${callee.componentRef} ${route.sourceLabel} reads '${route.authEnv}'.`,
          entityRef: `${ref}/method:${method.name}`,
        })
      }
    }
  }
  return issues
}

// ---------- 3.11 Host external dependencies (v0.3 — A3) ----------

/**
 * `HOST_DEP_BINARY_SHA256_MISSING` — a `kind: host-binary` entry with a
 * `github-release` or `url` source SHOULD pin a sha256 so deploy workflows
 * can verify integrity. Severity `warning` (downgrade-able for early specs).
 */
export function ruleHostDepBinarySha256Missing(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    for (const dep of mod.externalDeps) {
      if (dep.kind !== 'host-binary') continue
      if (!dep.source) continue
      if (dep.source.type !== 'github-release' && dep.source.type !== 'url') continue
      if (dep.source.sha256 && dep.source.sha256.trim().length > 0) continue
      issues.push({
        severity: 'warning',
        code: 'HOST_DEP_BINARY_SHA256_MISSING',
        message: `Host-binary '${dep.name}' in module '${mod.id}' fetches from ${dep.source.type} but has no sha256 pin. Add source.sha256 so deploy can verify integrity.`,
        entityRef: `module:${mod.id}`,
      })
    }
  }
  return issues
}

/**
 * `HOST_DEP_ARTIFACT_RECIPE_MISSING` — a `kind: host-artifact` entry with
 * a `build-on-host` source MUST declare both `recipe` and at least one
 * `input_checksums` entry so a rebuild can be triggered when the recipe
 * inputs change. Severity `error`: broken contract.
 */
export function ruleHostDepArtifactRecipeMissing(
  space: Space,
  _index: RefIndex,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    for (const dep of mod.externalDeps) {
      if (dep.kind !== 'host-artifact') continue
      if (!dep.source || dep.source.type !== 'build-on-host') continue
      if (!dep.source.recipe || dep.source.recipe.trim().length === 0) {
        issues.push({
          severity: 'error',
          code: 'HOST_DEP_ARTIFACT_RECIPE_MISSING',
          message: `Host-artifact '${dep.name}' in module '${mod.id}' has source.type: build-on-host but no recipe path. Set source.recipe to the build script.`,
          entityRef: `module:${mod.id}`,
        })
        continue
      }
      if (dep.source.input_checksums.length === 0) {
        issues.push({
          severity: 'warning',
          code: 'HOST_DEP_ARTIFACT_RECIPE_MISSING',
          message: `Host-artifact '${dep.name}' in module '${mod.id}' declares recipe '${dep.source.recipe}' but no input_checksums. Without inputs the build is never invalidated.`,
          entityRef: `module:${mod.id}`,
        })
      }
    }
  }
  return issues
}

/**
 * `HOST_DEP_PREFLIGHT_MISSING` — any host-installed dep should have a
 * `preflight` command so deploy / boot scripts have a concrete probe. The
 * absence of one is what made the firecracker asset gap invisible on
 * prod. Severity `warning` by default (the entity may legitimately be
 * non-prod).
 */
export function ruleHostDepPreflightMissing(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    for (const dep of mod.externalDeps) {
      // http-api (incl. legacy `kind: undefined`) is out of scope here.
      if (dep.kind === 'http-api' || dep.kind === undefined) continue
      if (dep.preflight) continue
      issues.push({
        severity: 'warning',
        code: 'HOST_DEP_PREFLIGHT_MISSING',
        message: `Host dep '${dep.name}' (kind: ${dep.kind}) in module '${mod.id}' has no preflight command. Deploy/boot has no probe to detect a missing asset.`,
        entityRef: `module:${mod.id}`,
      })
    }
  }
  return issues
}

/**
 * `HOST_DEP_PROD_OWNER_MISSING` — a host dep marked `required_in_profiles:
 * [prod]` without `install_owner` has no team accountable for keeping it
 * installed. Severity `warning`. Codex C3 amendment.
 */
export function ruleHostDepProdOwnerMissing(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const mod of space.modules) {
    for (const dep of mod.externalDeps) {
      // http-api (incl. legacy `kind: undefined`) is out of scope here.
      if (dep.kind === 'http-api' || dep.kind === undefined) continue
      if (!dep.required_in_profiles.some((p) => p.toLowerCase() === 'prod')) continue
      if (dep.install_owner && dep.install_owner.trim().length > 0) continue
      issues.push({
        severity: 'warning',
        code: 'HOST_DEP_PROD_OWNER_MISSING',
        message: `Host dep '${dep.name}' in module '${mod.id}' is required_in_profiles: [prod] but has no install_owner. Assign a team accountable for keeping it installed.`,
        entityRef: `module:${mod.id}`,
      })
    }
  }
  return issues
}

// ---------- 3.12 Operations / runbooks (v0.3 — A4) ----------

/**
 * `RUNBOOK_COVERAGE` — every use-case errorFlow whose runbook coverage is
 * load-bearing should have an `operations/runbooks/<id>.md` that lists
 * it in `covers:`. Severity-aware (Codex C4):
 *   - default: `info` (signal, not a gate)
 *   - A5 `--check-runbook-coverage` escalates to `warning`/`error` based
 *     on the matched runbook's `severity` (p0/p1 → error, p2 → warn,
 *     validation-error → silent)
 *
 * The base rule emits `info`-severity entries for every uncovered
 * errorFlow. The flag-driven escalation lives in the CLI (A5).
 */
export function ruleRunbookCoverage(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const runbooks = space.runbooks ?? []
  if (runbooks.length === 0 && space.useCases.length === 0) return issues
  // Build the set of error-flow ids currently covered by some runbook.
  // Runbook `covers[]` entries may be a raw `errorFlow.id` or a fully
  // qualified `usecase:<id>/errorFlow:<id>` ref — accept both.
  const covered = new Set<string>()
  for (const rb of runbooks) {
    for (const c of rb.covers) {
      covered.add(c)
      // Strip the usecase prefix so a bare errorFlow.id is also matched.
      const errIdx = c.indexOf('/errorFlow:')
      if (errIdx > 0) covered.add(c.slice(errIdx + '/errorFlow:'.length))
    }
  }
  for (const uc of space.useCases) {
    for (const ef of uc.errorFlows) {
      const fqRef = `usecase:${uc.id}/errorFlow:${ef.id}`
      if (covered.has(ef.id) || covered.has(fqRef)) continue
      issues.push({
        severity: 'info',
        code: 'RUNBOOK_COVERAGE',
        message: `Use case '${uc.id}' errorFlow '${ef.id}' has no runbook in operations/runbooks/ covering it. Add a runbook with covers: [${ef.id}] or covers: [${fqRef}].`,
        entityRef: `usecase:${uc.id}`,
      })
    }
  }
  return issues
}

/**
 * `RUNBOOK_BROKEN_LINK` — `decisions[]` on a runbook frontmatter references
 * an ADR id that does not exist in `space.decisions`. Mirrors
 * `ADR_BROKEN_LINK` for the decision direction. Severity `error`.
 */
export function ruleRunbookBrokenLink(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const runbooks = space.runbooks ?? []
  if (runbooks.length === 0) return issues
  const adrIds = new Set(space.decisions.map((d) => d.id))
  for (const rb of runbooks) {
    for (const adrId of rb.decisions) {
      if (adrIds.has(adrId)) continue
      issues.push({
        severity: 'error',
        code: 'RUNBOOK_BROKEN_LINK',
        message: `Runbook '${rb.id}' references decision '${adrId}' but no such ADR exists in decisions/.`,
        entityRef: `runbook:${rb.id}`,
      })
    }
  }
  return issues
}

// ---------- 3.13 ADR back-refs from components (v0.5 — B1) ----------
//
// Components carry an optional `decidedBy: [ADR-NNN]` list that anchors
// architectural decisions to a single component (finer-grained than
// `Module.decisions[]`). Two validator rules cover the lifecycle:
//   - broken link (the ADR doesn't exist) → error
//   - superseded link (the ADR is no longer current) → warning
// Production feedback (B1) called out a real failure mode: an ADR gets
// retired, `decidedBy` references silently rot, no validator flags it.

function indexComponentDecidedBy(space: Space): Array<{
  ref: string
  componentName: string
  adrs: ReadonlyArray<string>
}> {
  const out: Array<{ ref: string; componentName: string; adrs: ReadonlyArray<string> }> = []
  for (const { component, componentRef } of iterateAllComponents(space)) {
    const adrs = component.decidedBy ?? []
    if (adrs.length === 0) continue
    out.push({ ref: componentRef, componentName: component.name, adrs })
  }
  return out
}

/**
 * `COMPONENT_DECIDED_BY_INVALID_ADR` — error. The component lists an ADR
 * id that does not match any loaded `space.decisions[]` entry. Same
 * structure as `ADR_BROKEN_LINK` on modules, just at the component layer.
 */
export function ruleComponentDecidedByInvalidAdr(
  space: Space,
  _index: RefIndex,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const known = new Set(space.decisions.map((d) => d.id))
  for (const { ref, componentName, adrs } of indexComponentDecidedBy(space)) {
    for (const adr of adrs) {
      if (known.has(adr)) continue
      issues.push({
        severity: 'error',
        code: 'COMPONENT_DECIDED_BY_INVALID_ADR',
        message: `Component '${componentName}' (${ref}) references ${adr} via decidedBy, but no decisions/${adr}-*.md file exists.`,
        entityRef: ref,
      })
    }
  }
  return issues
}

/**
 * `COMPONENT_DECIDED_BY_SUPERSEDED_ADR` — warning. The ADR exists but its
 * status is `superseded` or `deprecated`. Suggests updating the link to
 * point at the superseder (when `supersededBy` is set). Doesn't fire when
 * status is `proposed` — proposals are legitimately decided-by during
 * design.
 */
export function ruleComponentDecidedBySupersededAdr(
  space: Space,
  _index: RefIndex,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const byId = new Map(space.decisions.map((d) => [d.id, d]))
  for (const { ref, componentName, adrs } of indexComponentDecidedBy(space)) {
    for (const adr of adrs) {
      const dec = byId.get(adr)
      if (!dec) continue // broken-link rule handles this
      if (dec.status !== 'superseded' && dec.status !== 'deprecated') continue
      const suggestion = dec.supersededBy
        ? `Consider replacing ${adr} with ${dec.supersededBy} in decidedBy.`
        : 'Consider removing or updating the decidedBy link.'
      issues.push({
        severity: 'warning',
        code: 'COMPONENT_DECIDED_BY_SUPERSEDED_ADR',
        message: `Component '${componentName}' (${ref}) is decided by ${adr}, but ${adr} is ${dec.status}. ${suggestion}`,
        entityRef: ref,
      })
    }
  }
  return issues
}

// ---------- 3.14 Pub/sub edges (v0.5 — B2) ----------
//
// Two shape rules + two hygiene rules covering the event-driven graph:
//   * EVENT_EMIT_TARGET_NOT_EVENT      — emit.event resolves but isn't an event model. error.
//   * EVENT_SUBSCRIBE_TARGET_NOT_EVENT — same for subscribe.event. error.
//   * EVENT_NO_SUBSCRIBER              — emit declared, nobody listens.   warn.
//   * EVENT_SUBSCRIBE_NO_PUBLISHER     — subscribe declared, no publisher. warn.

interface PubSubEdgeContext {
  componentRef: string
  componentName: string
}

function* iterateEmits(
  space: Space,
): Generator<{ ctx: PubSubEdgeContext; emit: { event: string }; index: number }> {
  for (const { component, componentRef } of iterateAllComponents(space)) {
    const emits = component.emits ?? []
    for (let i = 0; i < emits.length; i++) {
      const emit = emits[i]
      if (!emit) continue
      yield {
        ctx: { componentRef, componentName: component.name },
        emit,
        index: i,
      }
    }
  }
}

function* iterateSubscribes(
  space: Space,
): Generator<{ ctx: PubSubEdgeContext; sub: { event: string }; index: number }> {
  for (const { component, componentRef } of iterateAllComponents(space)) {
    const subs = component.subscribes ?? []
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i]
      if (!sub) continue
      yield {
        ctx: { componentRef, componentName: component.name },
        sub,
        index: i,
      }
    }
  }
}

function resolveModelKind(index: RefIndex, ref: string): string | null {
  const target = index.get(ref)
  if (!target || target.kind !== 'model') return null
  return target.entity.modelKind
}

/**
 * `EVENT_EMIT_TARGET_NOT_EVENT` — error. `emits[].event` resolves to a
 * model whose `modelKind` is not `event`. The schema lets you point at
 * any model ref so existing entity refs don't suddenly fail to parse;
 * this rule catches the semantic mistake at validate time.
 */
export function ruleEventEmitTargetIsEvent(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const { ctx, emit, index: i } of iterateEmits(space)) {
    const kind = resolveModelKind(index, emit.event)
    if (kind === null || kind === 'event') continue
    issues.push({
      severity: 'error',
      code: 'EVENT_EMIT_TARGET_NOT_EVENT',
      message: `Component '${ctx.componentName}' (${ctx.componentRef}) emits[${i}].event '${emit.event}' resolves to a model with modelKind='${kind}', expected 'event'.`,
      entityRef: ctx.componentRef,
    })
  }
  return issues
}

/**
 * `EVENT_SUBSCRIBE_TARGET_NOT_EVENT` — error. Mirror of the emit rule
 * for the receiving end.
 */
export function ruleEventSubscribeTargetIsEvent(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const { ctx, sub, index: i } of iterateSubscribes(space)) {
    const kind = resolveModelKind(index, sub.event)
    if (kind === null || kind === 'event') continue
    issues.push({
      severity: 'error',
      code: 'EVENT_SUBSCRIBE_TARGET_NOT_EVENT',
      message: `Component '${ctx.componentName}' (${ctx.componentRef}) subscribes[${i}].event '${sub.event}' resolves to a model with modelKind='${kind}', expected 'event'.`,
      entityRef: ctx.componentRef,
    })
  }
  return issues
}

/**
 * `EVENT_NO_SUBSCRIBER` — warning. A component declares it emits an
 * event but no subscriber listens. Either delete the emit (dead) or add
 * a subscriber. Hygiene: surfaces published-but-ignored events early so
 * they don't accumulate.
 */
export function ruleEventNoSubscriber(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const subscribedEvents = new Set<string>()
  for (const { sub } of iterateSubscribes(space)) subscribedEvents.add(sub.event)
  for (const { ctx, emit, index: i } of iterateEmits(space)) {
    if (subscribedEvents.has(emit.event)) continue
    issues.push({
      severity: 'warning',
      code: 'EVENT_NO_SUBSCRIBER',
      message: `Component '${ctx.componentName}' (${ctx.componentRef}) emits[${i}].event '${emit.event}' has no subscriber. Add a subscribes entry on the receiver, or drop the emit if it's dead.`,
      entityRef: ctx.componentRef,
    })
  }
  return issues
}

/**
 * `EVENT_SUBSCRIBE_NO_PUBLISHER` — warning. A component declares it
 * subscribes to an event but no component emits it. Catches the
 * symmetric mistake: typo on the event ref, or the publisher was deleted
 * without cleaning up the subscriber.
 */
export function ruleEventSubscribeNoPublisher(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const emittedEvents = new Set<string>()
  for (const { emit } of iterateEmits(space)) emittedEvents.add(emit.event)
  for (const { ctx, sub, index: i } of iterateSubscribes(space)) {
    if (emittedEvents.has(sub.event)) continue
    issues.push({
      severity: 'warning',
      code: 'EVENT_SUBSCRIBE_NO_PUBLISHER',
      message: `Component '${ctx.componentName}' (${ctx.componentRef}) subscribes[${i}].event '${sub.event}' has no publisher. Add an emits entry on the producer, or drop the subscription.`,
      entityRef: ctx.componentRef,
    })
  }
  return issues
}

// ---------- 3.15 Wire capture (v0.5 — B3) ----------
//
// A component that consumes an `http-api` external-dep should declare a
// `wireCapture` artefact. Without it, fixture-based tests can quietly
// diverge from real wire shape and the divergence only surfaces in prod.
// The semantic rule emits `WIRE_CAPTURE_MISSING` as warning; the CLI
// flag `--strict-wire-capture` (see validate.ts) escalates to error.
// File-system checks (path-broken, staleness) live in CLI code since
// the validator runs on the in-memory Space without fs access.

// ---------- 3.16 Table migration parity (v0.5 — B4) ----------
//
// `Table.migrations` is an optional ordered history of DDL changes.
// One rule cross-checks declared add/drop/alter against current columns:
//
//   MIGRATION_COLUMN_INCONSISTENT — declared add/drop doesn't match
//                                    current column list. Error.
//
// Gap-detection in migration ids was scoped out — too noisy across
// teams that squash, rebase, or use date-stamped ids. JSONL-driven
// Java/Go entity drift (the "entity has field that table dropped" pattern)
// needs an extractor protocol decision and lands in v0.6.

function* iterateAllTables(
  space: Space,
): Generator<{ table: Space['modules'][number]['tables'][number]; ref: string }> {
  for (const mod of space.modules) {
    for (const t of mod.tables) {
      yield { table: t, ref: `module:${mod.id}/table:${t.id}` }
    }
    for (const dom of mod.domains) {
      for (const t of dom.tables) {
        yield { table: t, ref: `module:${mod.id}/domain:${dom.id}/table:${t.id}` }
      }
    }
  }
}

/**
 * `MIGRATION_COLUMN_INCONSISTENT` — error. The migration history claims
 * a column was added/dropped, but the current `columns: [...]` snapshot
 * doesn't agree. Catches the V0028-style case where code dropped a
 * column but the spec lagged.
 */
export function ruleMigrationColumnInconsistent(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const { table, ref } of iterateAllTables(space)) {
    const migrations = table.migrations ?? []
    if (migrations.length === 0) continue
    const currentCols = new Set(table.columns.map((c) => c.name))
    // Walk migrations in declared order, simulating the column set.
    // For add-column: column should END UP present.
    // For drop-column: column should END UP absent.
    // For alter-column: column should END UP present (shape may differ).
    // For create: no per-column claim.
    for (const m of migrations) {
      if (m.action === 'create') continue
      for (const col of m.columns) {
        const present = currentCols.has(col)
        if (m.action === 'add-column' && !present) {
          issues.push({
            severity: 'error',
            code: 'MIGRATION_COLUMN_INCONSISTENT',
            message: `Table '${table.name}' (${ref}) migration '${m.id}' (action=${m.action}) declares column '${col}' but it is not present in columns[]. Add it to columns[], or remove the migration entry if it was reverted.`,
            entityRef: ref,
          })
        } else if (m.action === 'drop-column' && present) {
          issues.push({
            severity: 'error',
            code: 'MIGRATION_COLUMN_INCONSISTENT',
            message: `Table '${table.name}' (${ref}) migration '${m.id}' (action=${m.action}) declares column '${col}' as dropped, but it is still present in columns[]. Remove it from columns[], or remove the migration entry if it was reverted.`,
            entityRef: ref,
          })
        } else if (m.action === 'alter-column' && !present) {
          issues.push({
            severity: 'error',
            code: 'MIGRATION_COLUMN_INCONSISTENT',
            message: `Table '${table.name}' (${ref}) migration '${m.id}' (action=${m.action}) declares column '${col}' but it is not present in columns[]. The altered column should still exist post-migration.`,
            entityRef: ref,
          })
        }
      }
    }
  }
  return issues
}

/**
 * `WIRE_CAPTURE_MISSING` — warning. The component is named as
 * `consumer:` on an `http-api` external-dep entry, but has no
 * `wireCapture` field. Suggests pinning the real wire shape.
 */
export function ruleWireCaptureMissing(space: Space, _index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  // Build the set of component refs that consume an `http-api` dep.
  const httpConsumers = new Map<string, string>()
  for (const mod of space.modules) {
    for (const dep of mod.externalDeps ?? []) {
      // Only http-api carries a `consumer` field. Other kinds (host-binary
      // etc.) don't apply — they have `install_owner` instead. The schema
      // guarantees this via discriminated union.
      if (dep.kind !== 'http-api' && dep.kind !== undefined) continue
      // Cast: at this point the discriminated union narrowing has
      // restricted us to http-api shape (or the legacy un-tagged form
      // that the loader normalises to http-api).
      const httpDep = dep as { consumer: string; name: string }
      const ref = httpDep.consumer
      if (!ref) continue
      // Skip module-level refs (`module:X`) — those say "any component
      // in this module reads this", which isn't a single owner we can
      // require wire capture from.
      if (!ref.includes('/component:')) continue
      httpConsumers.set(ref, httpDep.name)
    }
  }
  if (httpConsumers.size === 0) return issues

  for (const { component, componentRef } of iterateAllComponents(space)) {
    const depName = httpConsumers.get(componentRef)
    if (!depName) continue
    if (component.wireCapture) continue
    issues.push({
      severity: 'warning',
      code: 'WIRE_CAPTURE_MISSING',
      message: `Component '${component.name}' (${componentRef}) consumes external-dep '${depName}' but has no wireCapture. Add a wireCapture pointing at a captured-traffic artefact (tcpdump / curl-live / debug-log) so the contract is pinned to real wire shape.`,
      entityRef: componentRef,
    })
  }
  return issues
}

// ---------- 3.17 Type closure + wiring parity (v0.6 — W1) ----------

/**
 * Cross-language primitive / built-in type names (matched lower-cased)
 * that never need to resolve to a model. Deliberately generous — Java time
 * types, SQL-ish scalars, TS builtins — because a missed primitive is a
 * false TYPE_UNRESOLVED error, while an over-broad entry only costs a hole
 * the size of one word.
 */
const PRIMITIVE_TYPE_NAMES: ReadonlySet<string> = new Set([
  'void',
  'null',
  'any',
  'unknown',
  'object',
  'json',
  'jsonb',
  'string',
  'str',
  'text',
  'char',
  'varchar',
  'uuid',
  'guid',
  'id',
  'int',
  'integer',
  'long',
  'short',
  'bigint',
  'smallint',
  'tinyint',
  'number',
  'float',
  'double',
  'decimal',
  'bigdecimal',
  'byte',
  'bytes',
  'binary',
  'blob',
  'bool',
  'boolean',
  'date',
  'time',
  'datetime',
  'date-time',
  'timestamp',
  'instant',
  'duration',
  'period',
  'localdate',
  'localtime',
  'localdatetime',
  'zoneddatetime',
  'offsetdatetime',
  'url',
  'uri',
  'email',
  'map',
  'dict',
  'record',
  'list',
  'set',
  'array',
  'collection',
  'iterable',
  'tuple',
  'stream',
  'file',
  'multipartfile',
])

const TYPE_TOKEN_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/

/**
 * True when `token` is a whitelisted primitive / built-in type name and
 * never needs to resolve to a model. Shared with the CLI (implementation
 * briefs run the same closure over the types they render).
 */
export function isPrimitiveTypeName(token: string): boolean {
  return PRIMITIVE_TYPE_NAMES.has(token.toLowerCase())
}

/** Split on `sep` at angle-bracket depth 0 only (`Map<K, V> | X` safe). */
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '<') depth++
    else if (ch === '>') depth = Math.max(0, depth - 1)
    if (ch === sep && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push(cur)
  return parts
}

/**
 * Decompose a declared type string into the leaf identifiers that must
 * resolve to a primitive or a model. Wrapper names (`List<…>`, `Mono<…>`,
 * any `W<…>`) are NOT checked — only their type arguments — because no
 * whitelist can enumerate every language's container idiom, and a false
 * error on `Page<Order>` would cost more than a missed typo in a wrapper.
 * Constructs the parser doesn't understand (dotted FQNs, quotes, braces)
 * yield no tokens: conservative skip, never a false positive.
 *
 * Exported for the CLI: implementation briefs use the same decomposition
 * to close the type graph they render.
 */
export function typeLeafTokens(declared: string): string[] {
  const out: string[] = []
  const visit = (raw: string): void => {
    let t = raw.trim()
    if (t === '') return
    const unionParts = splitTopLevel(t, '|')
    if (unionParts.length > 1) {
      for (const p of unionParts) visit(p)
      return
    }
    while (t.endsWith('[]')) t = t.slice(0, -2).trimEnd()
    if (t.endsWith('?')) t = t.slice(0, -1).trimEnd()
    const generic = t.match(/^[A-Za-z_][A-Za-z0-9_-]*<(.+)>$/s)
    if (generic?.[1]) {
      for (const arg of splitTopLevel(generic[1], ',')) visit(arg)
      return
    }
    if (TYPE_TOKEN_RE.test(t)) out.push(t)
  }
  visit(declared)
  return out
}

/**
 * `TYPE_UNRESOLVED` — error. Every non-primitive leaf type named by a
 * method param, a method return, or a model field must resolve to a model
 * in this space (by id or name — the same nominal matching `DTO_UNUSED`
 * and the AI export rely on). Without this check a typo'd payload type
 * (`returns: UserDtoo`) validates 0/0 while every downstream consumer —
 * implementation briefs, codegen, an LLM implementer — silently loses the
 * field list behind the name. The nominal counterpart of REF_BROKEN.
 *
 * Two deliberate exemptions:
 *   - Exception names declared in any module's `errorMapping[].exception`
 *     count as known types — error handlers legitimately take them as
 *     params, and the errorMapping IS their contract registry.
 *   - Components and models inside `type: external` modules are skipped
 *     entirely: they describe a vendor's surface you don't implement, and
 *     its payload contract is pinned by `wireCapture`, not by models.
 */
export function ruleTypeUnresolved(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const known = new Set<string>()
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (t?.kind === 'model') {
      known.add(t.entity.id)
      known.add(t.entity.name)
    }
  }
  for (const mod of space.modules) {
    for (const em of mod.errorMapping ?? []) known.add(em.exception)
  }
  const check = (declared: string, where: string, entityRef: string): void => {
    for (const token of typeLeafTokens(declared)) {
      if (PRIMITIVE_TYPE_NAMES.has(token.toLowerCase())) continue
      if (known.has(token)) continue
      const near = closestMatches(token, known, 2)
      issues.push({
        severity: 'error',
        code: 'TYPE_UNRESOLVED',
        message: `${where} names type '${token}'${declared === token ? '' : ` (in '${declared}')`}, which is neither a primitive nor a model in this space.`,
        entityRef,
        suggestion:
          near.length > 0
            ? `Did you mean ${near.map((n) => `'${n}'`).join(' or ')}? Otherwise add the model, or use a primitive type.`
            : 'Add the model, fix the spelling, or use a primitive type.',
      })
    }
  }
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t) continue
    if (t.kind === 'component') {
      if (t.module.type === 'external') continue
      for (const m of t.entity.methods) {
        check(m.returns, `Method '${t.entity.id}.${m.name}' returns`, ref)
        for (const p of m.params) {
          check(p.type, `Method '${t.entity.id}.${m.name}' param '${p.name}'`, ref)
        }
      }
    } else if (t.kind === 'model') {
      if (t.module.type === 'external') continue
      for (const f of t.entity.fields) {
        check(f.type, `Model '${t.entity.id}' field '${f.name}'`, ref)
      }
    }
  }
  return issues
}

/** Normalize a step/call endpoint to its owning component ref, else null. */
function owningComponentRef(ref: string, index: RefIndex): string | null {
  const t = index.get(ref)
  if (!t) return null
  if (t.kind === 'component') return ref
  if (t.kind === 'method') return ref.slice(0, ref.lastIndexOf('/method:'))
  return null
}

interface DeclaredEdge {
  fromRef: string
  toRef: string
  /** `false` for `composes:` containment edges (structural, not calls). */
  viaCalls: boolean
  /** Human handle for messages, e.g. `OrderService.create → module:…`. */
  label: string
}

/**
 * Component-granularity edges declared by the wiring: every
 * `methods[].calls[]` target plus `composes:` containment. Method-level
 * call targets are normalized to their owning component so steps written
 * at component level still match.
 */
function declaredCallEdges(space: Space, index: RefIndex): Map<string, DeclaredEdge> {
  const edges = new Map<string, DeclaredEdge>()
  const add = (edge: DeclaredEdge): void => {
    const key = `${edge.fromRef} -> ${edge.toRef}`
    const existing = edges.get(key)
    // A calls-backed edge outranks a composes-backed duplicate: only
    // calls edges participate in WIRING_CALL_WITHOUT_STEP.
    if (!existing || (!existing.viaCalls && edge.viaCalls)) edges.set(key, edge)
  }
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'component') continue
    for (const m of t.entity.methods) {
      for (const call of m.calls) {
        const toRef = owningComponentRef(call.target, index)
        if (!toRef) continue
        add({
          fromRef: ref,
          toRef,
          viaCalls: true,
          label: `${t.entity.id}.${m.name} → ${call.target}`,
        })
      }
    }
    for (const contained of t.entity.composes ?? []) {
      const toRef = owningComponentRef(contained, index)
      if (!toRef) continue
      add({ fromRef: ref, toRef, viaCalls: false, label: `${t.entity.id} composes ${contained}` })
    }
  }
  return edges
}

/**
 * `WIRING_STEP_WITHOUT_CALL` — warning. A use-case step walks an edge the
 * wiring never declares: for `http` / `internal-call` steps between two
 * components there must be a `methods[].calls[]` (or `composes:`) edge
 * from the from-component to the to-component; for `event` steps the
 * publisher must `emits:` an event model the receiver `subscribes:` to.
 * Steps and calls are two records of the same edge — when they disagree,
 * one of them is lying. Module-level endpoints and actors are skipped
 * (nothing precise to check). `--strict-wiring` escalates to error.
 */
export function ruleWiringStepWithoutCall(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const declared = declaredCallEdges(space, index)
  for (const uc of space.useCases) {
    for (const { step, scope } of walkAllSteps(uc)) {
      if (step.protocol === 'http' || step.protocol === 'internal-call') {
        const fromRef = owningComponentRef(step.from, index)
        const toRef = owningComponentRef(step.to, index)
        if (!fromRef || !toRef || fromRef === toRef) continue
        if (declared.has(`${fromRef} -> ${toRef}`)) continue
        // Error flows legitimately walk a call edge in reverse: an exception
        // or early return propagates callee → caller over the same edge
        // ("UserRepository → UserService: raises ConflictError"). Accept the
        // reverse edge there. Happy paths stay strict — `http-response` is
        // the modelled reverse for http, and a forward internal edge must be
        // a declared call.
        if (scope !== 'happy' && declared.has(`${toRef} -> ${fromRef}`)) continue
        issues.push({
          severity: 'warning',
          code: 'WIRING_STEP_WITHOUT_CALL',
          message: `Use case '${uc.id}' step (${scope}) walks '${step.from}' → '${step.to}' (${step.protocol}), but no method on '${fromRef}' declares a call to '${toRef}'.`,
          entityRef: `usecase:${uc.id}`,
          suggestion: `Declare the edge: add a 'calls:' entry on the calling method of '${fromRef}' (or 'composes:' for structural containment), or fix the step.`,
        })
      } else if (step.protocol === 'event') {
        const fromRef = owningComponentRef(step.from, index)
        const toRef = owningComponentRef(step.to, index)
        if (!fromRef || !toRef) continue
        const from = index.get(fromRef)
        const to = index.get(toRef)
        if (from?.kind !== 'component' || to?.kind !== 'component') continue
        const emitted = new Set(from.entity.emits.map((e) => e.event))
        const connected = to.entity.subscribes.some((s) => emitted.has(s.event))
        if (connected) continue
        issues.push({
          severity: 'warning',
          code: 'WIRING_STEP_WITHOUT_CALL',
          message: `Use case '${uc.id}' step (${scope}) claims '${fromRef}' publishes an event consumed by '${toRef}', but no emits/subscribes pair on the same event model connects them.`,
          entityRef: `usecase:${uc.id}`,
          suggestion: `Declare 'emits:' on the publisher and 'subscribes:' on the receiver pointing at the same event model, or fix the step.`,
        })
      }
    }
  }
  return issues
}

/**
 * `WIRING_CALL_WITHOUT_STEP` — info. A declared call edge is never walked
 * by any use-case step (happy path or error flow, any protocol). Either a
 * scenario is missing or the call is dead wiring. `composes:` edges are
 * exempt — structural containment isn't a scenario edge.
 */
export function ruleWiringCallWithoutStep(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const walked = new Set<string>()
  for (const uc of space.useCases) {
    for (const { step } of walkAllSteps(uc)) {
      const fromRef = owningComponentRef(step.from, index)
      const toRef = owningComponentRef(step.to, index)
      if (fromRef && toRef) walked.add(`${fromRef} -> ${toRef}`)
    }
  }
  for (const [key, edge] of declaredCallEdges(space, index)) {
    if (!edge.viaCalls) continue
    if (walked.has(key)) continue
    issues.push({
      severity: 'info',
      code: 'WIRING_CALL_WITHOUT_STEP',
      message: `Call edge '${edge.label}' is declared in the wiring but never walked by any use-case step. Either a scenario is missing or the call is dead.`,
      entityRef: edge.fromRef,
    })
  }
  return issues
}

/**
 * `STEP_VIA_MISSING` — info. An `http` / `event` step into a concrete
 * component carries no payload model (`via:`). Without a via the edge has
 * no wire contract — briefs and implementers can't know what crosses it.
 * Response-only edges (GET flows) may point `via` at the response model
 * (the via-mismatch rule accepts a returns match); truly payload-less
 * edges can suppress this code on the use case. `--strict-wiring`
 * escalates to error.
 */
export function ruleStepViaMissing(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const uc of space.useCases) {
    for (const { step, scope } of walkAllSteps(uc)) {
      if (step.protocol !== 'http' && step.protocol !== 'event') continue
      if (step.via) continue
      if (!owningComponentRef(step.to, index)) continue
      issues.push({
        severity: 'info',
        code: 'STEP_VIA_MISSING',
        message: `Use case '${uc.id}' step (${scope}) '${step.from}' → '${step.to}' (${step.protocol}) carries no payload model.`,
        entityRef: `usecase:${uc.id}`,
        suggestion: `Set 'via:' to the request DTO / event model (or the response model for response-only edges) so the edge has an explicit contract.`,
      })
    }
  }
  return issues
}

// ---------- 3.18 Error mapping closure (v0.6 — W5) ----------

/**
 * `THROWS_UNMAPPED` — warning. A method that serves an HTTP route
 * (`httpMethod` declared) throws an exception with no row in its module's
 * `errorMapping`. Without the row the wire-level outcome of the failure is
 * undeclared — an implementer can't know what status/code the client sees,
 * and use-case `errorFlows` have nothing concrete to bind to.
 *
 * Scope decisions:
 *   - Only http-reachable methods are checked. Internal methods rethrow
 *     into their callers; the mapping matters where the exception meets
 *     the wire, and demanding a row per internal throw would force every
 *     module to duplicate its callee's registry.
 *   - `client` / `page` / `widget` components are exempt: on the caller
 *     side, `httpMethod`/`httpPath` document the *outgoing* request (the
 *     canonical apiClient idiom), so their throws never serve a route.
 *   - `type: external` modules are exempt (vendor surface — wireCapture
 *     pins that contract, and you don't implement their handlers).
 *   - Matching is verbatim by exception name — the same nominal matching
 *     TYPE_UNRESOLVED applies to types.
 *
 * `--strict-contracts` escalates to error: it's a contract-layer gap, same
 * family as the CONTRACT_CALL_* credential checks.
 */
const HTTP_CALLER_SIDE_TYPES: ReadonlySet<string> = new Set(['client', 'page', 'widget'])

export function ruleThrowsUnmapped(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'component') continue
    if (t.module.type === 'external') continue
    if (HTTP_CALLER_SIDE_TYPES.has(t.entity.type)) continue
    const mapped = new Set((t.module.errorMapping ?? []).map((em) => em.exception))
    for (const m of t.entity.methods) {
      if (!m.httpMethod) continue
      for (const exc of m.throws) {
        if (mapped.has(exc)) continue
        const where = m.httpPath ? `${m.httpMethod} ${m.httpPath}` : m.httpMethod
        issues.push({
          severity: 'warning',
          code: 'THROWS_UNMAPPED',
          message: `Method '${t.entity.id}.${m.name}' (${where}) throws '${exc}', but module '${t.module.id}' has no errorMapping row for it — the wire-level outcome of the failure is undeclared.`,
          entityRef: ref,
          suggestion: `Add '- exception: ${exc}' with an httpStatus to module '${t.module.id}' errorMapping, or remove the throw if it cannot escape this method.`,
        })
      }
    }
  }
  return issues
}

// ---------- 3.19 Event delivery contract (v0.6 — W4) ----------
//
// Event models may declare `delivery` (at-least-once / at-most-once /
// exactly-once) and `orderingKey`; subscriptions may declare `idempotency`.
// Three rules close the contract:
//
//   EVENT_IDEMPOTENCY_MISSING  — warning. at-least-once event + subscriber
//                                without declared idempotency = the classic
//                                double-processing hole.
//   EVENT_KEY_FIELD_UNKNOWN    — error. orderingKey / idempotency.key must
//                                name a real field on the event model.
//   EVENT_DELIVERY_ON_NON_EVENT — error. delivery/orderingKey on a model
//                                that isn't modelKind: event.

/** Resolve a ref to its model entity, or null when it isn't a model. */
function resolveModel(index: RefIndex, ref: string): Model | null {
  const target = index.get(ref)
  if (!target || target.kind !== 'model') return null
  return target.entity
}

/**
 * `EVENT_IDEMPOTENCY_MISSING` — warning. The subscribed event promises
 * `delivery: at-least-once` (redelivery on failure is expected), but the
 * subscription declares no `idempotency`. The implementer has no contract
 * for surviving replay — the top source of double-charges and duplicate
 * side effects in event-driven systems. Events without a declared
 * `delivery` are skipped: the contract isn't stated, so there's nothing
 * to hold the consumer to (declare delivery to arm this rule).
 */
export function ruleEventIdempotencyMissing(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const { component, componentRef } of iterateAllComponents(space)) {
    const subs = component.subscribes ?? []
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i]
      if (!sub || sub.idempotency) continue
      const event = resolveModel(index, sub.event)
      if (event?.delivery !== 'at-least-once') continue
      issues.push({
        severity: 'warning',
        code: 'EVENT_IDEMPOTENCY_MISSING',
        message: `Component '${component.name}' (${componentRef}) subscribes to '${sub.event}' which declares delivery: at-least-once, but the subscription declares no idempotency — redelivery will double-process.`,
        entityRef: componentRef,
        suggestion: `Add 'idempotency: { key: <event field>, strategy: dedupe-store | upsert | natural }' to the subscribes entry, or change the event's delivery if the transport really doesn't redeliver.`,
      })
    }
  }
  return issues
}

/**
 * `EVENT_KEY_FIELD_UNKNOWN` — error. A delivery-contract key names a
 * field that doesn't exist: either the event model's own `orderingKey`,
 * or a subscription's `idempotency.key` checked against the subscribed
 * event model. Same class of breakage as TYPE_UNRESOLVED — a phantom
 * name that every downstream consumer would trust.
 */
export function ruleEventKeyFieldUnknown(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const suggest = (model: Model, key: string): string => {
    const near = closestMatches(key, new Set(model.fields.map((f) => f.name)), 2)
    return near.length > 0
      ? `Did you mean ${near.map((n) => `'${n}'`).join(' or ')}? Otherwise add the field to '${model.id}'.`
      : `Add the field to '${model.id}', or fix the key.`
  }
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'model') continue
    const model = t.entity
    if (model.orderingKey === undefined) continue
    if (model.fields.some((f) => f.name === model.orderingKey)) continue
    issues.push({
      severity: 'error',
      code: 'EVENT_KEY_FIELD_UNKNOWN',
      message: `Model '${model.id}' (${ref}) declares orderingKey '${model.orderingKey}', but has no field with that name.`,
      entityRef: ref,
      suggestion: suggest(model, model.orderingKey),
    })
  }
  for (const { component, componentRef } of iterateAllComponents(space)) {
    const subs = component.subscribes ?? []
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i]
      const key = sub?.idempotency?.key
      if (!sub || key === undefined) continue
      const event = resolveModel(index, sub.event)
      if (!event) continue // REF_BROKEN / TARGET_NOT_EVENT cover bad refs
      if (event.fields.some((f) => f.name === key)) continue
      issues.push({
        severity: 'error',
        code: 'EVENT_KEY_FIELD_UNKNOWN',
        message: `Component '${component.name}' (${componentRef}) subscribes[${i}] declares idempotency.key '${key}', but event model '${sub.event}' has no field with that name.`,
        entityRef: componentRef,
        suggestion: suggest(event, key),
      })
    }
  }
  return issues
}

/**
 * `EVENT_DELIVERY_ON_NON_EVENT` — error. `delivery` / `orderingKey` are
 * transport-contract fields; on a dto/entity/value-object/enum they are
 * dead weight that a reader would trust. (Unlike the legacy `topic`
 * field, which predates this rule and stays silently ignored, the W4
 * fields are validated from birth.)
 */
export function ruleEventDeliveryOnNonEvent(space: Space, index: RefIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const ref of index.refs()) {
    const t = index.get(ref)
    if (!t || t.kind !== 'model') continue
    const model = t.entity
    if (model.modelKind === 'event') continue
    const set: string[] = []
    if (model.delivery !== undefined) set.push('delivery')
    if (model.orderingKey !== undefined) set.push('orderingKey')
    if (set.length === 0) continue
    issues.push({
      severity: 'error',
      code: 'EVENT_DELIVERY_ON_NON_EVENT',
      message: `Model '${model.id}' (${ref}) declares ${set.join(' and ')} but has modelKind='${model.modelKind}' — delivery contracts only apply to event models.`,
      entityRef: ref,
      suggestion: `Change modelKind to 'event' (with a topic:), or remove ${set.join(' / ')}.`,
    })
  }
  return issues
}
