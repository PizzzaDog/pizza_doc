export type Severity = 'error' | 'warning' | 'info'

export type ValidationCode =
  // Pass 0 (parse-level)
  | 'YAML_PARSE_ERROR'
  | 'FILE_UNRECOGNIZED'
  // Change-set overlay metadata
  | 'CHANGE_NOT_FOUND'
  | 'CHANGE_SCHEMA_INVALID'
  | 'CHANGE_FILENAME_ID_MISMATCH'
  | 'CHANGE_DELETE_PATH_INVALID'
  // Pass 1 (Zod + filename/id)
  | 'SCHEMA_UNKNOWN_FIELD'
  | 'SCHEMA_MISSING_REQUIRED'
  | 'SCHEMA_WRONG_TYPE'
  | 'SCHEMA_INVALID_VALUE'
  | 'SCHEMA_INVALID_ID'
  | 'SCHEMA_INVALID_REF_PATTERN'
  | 'SCHEMA_UNKNOWN_MODULE_TYPE'
  | 'SCHEMA_UNKNOWN_MODEL_KIND'
  | 'SCHEMA_UNKNOWN_COMPONENT_TYPE'
  | 'SCHEMA_FILENAME_ID_MISMATCH'
  // Pass 2 (reference resolution)
  | 'REF_BROKEN'
  | 'REF_WRONG_KIND'
  // Pass 3 (semantic) — 3.1 use case coherence
  | 'USECASE_NO_STEPS'
  | 'USECASE_STEP_CHAIN_DISCONTINUITY'
  | 'USECASE_FIRST_STEP_NOT_FROM_FRONTEND'
  | 'USECASE_LAST_STEP_NOT_TERMINAL'
  // 3.2 DTO flow consistency
  | 'DTO_FLOW_VIA_TYPE_MISMATCH'
  | 'HTTP_STEP_TARGET_NOT_CONTROLLER'
  | 'SQL_STEP_TARGET_NOT_DATABASE'
  // 3.3 data flow
  | 'DATAFLOW_SOURCE_FIELD_MISSING'
  | 'DATAFLOW_TARGET_FIELD_MISSING'
  | 'DATAFLOW_TYPE_INCOMPATIBLE'
  | 'DATAFLOW_TRANSFORM_MISSING'
  | 'DATAFLOW_UNUSED_DTO_FIELD'
  | 'DATAFLOW_UNWRITTEN_REQUIRED_COLUMN'
  // 3.4 structural hygiene
  | 'DUPLICATE_ID'
  | 'CYCLIC_CALLS'
  | 'ACTOR_UNUSED'
  | 'COMPONENT_UNUSED'
  | 'DTO_UNUSED'
  // 3.5 cross-module consistency
  | 'MODEL_FIELD_MISSING_COLUMN'
  | 'FK_COLUMN_MISSING'
  // 3.6 contract extensions (v0.2)
  | 'STATE_MACHINE_INCOHERENT'
  // 3.7 operations (v0.3 — config-map / external-deps / ADR)
  | 'CONFIG_KEY_DUPLICATE'
  | 'CONFIG_SECRET_SOURCE_UNRESOLVED'
  | 'CONFIG_RUNTIME_NO_ADMIN_UI'
  | 'CONFIG_RELATED_BROKEN'
  | 'EXTERNAL_DEP_USES_UNKNOWN_CONFIG'
  | 'EXTERNAL_DEP_ARG_CONTRACT_INVALID'
  | 'ADR_BROKEN_LINK'
  | 'ADR_DUPLICATE_ID'
  | 'TOOL_SCHEMA_TOPLEVEL_COMBINATOR'
  | 'ADR_EMBEDS_SCHEMA_LITERAL'
  // 3.8 drift (v0.3 — code↔spec coverage; only emitted by `pd drift --from-jsonl`)
  | 'CONFIG_REF_NOT_IN_SPEC'
  | 'EXTERNAL_CALL_NOT_IN_SPEC'
  // 3.9 calls/routes contract layer (v0.3 — A1)
  // Defaults are `warning`; `--strict-contracts` (A5) escalates to `error`.
  | 'CONTRACT_CALL_CREDENTIAL_MISSING'
  | 'CONTRACT_CALL_PATH_ORPHAN'
  | 'CONTRACT_CALL_HEADER_MISMATCH'
  | 'CONTRACT_CALL_ENV_MISMATCH'
  // 3.10 state machines (v0.3 — A2). Coherence is `error` (broken spec),
  // scenario coverage is `info` by default; A5 flag `--check-state-coverage`
  // escalates coverage to error.
  | 'STATE_MACHINE_SCENARIO_COVERAGE'
  // 3.11 host external dependencies (v0.3 — A3). Severities range from
  // warn (recommendation) to error (broken spec).
  | 'HOST_DEP_BINARY_SHA256_MISSING'
  | 'HOST_DEP_ARTIFACT_RECIPE_MISSING'
  | 'HOST_DEP_PREFLIGHT_MISSING'
  | 'HOST_DEP_PROD_OWNER_MISSING'
  // 3.12 operations / runbooks (v0.3 — A4). Info by default; A5 flag
  // `--check-runbook-coverage` escalates to error on p0/p1 severity.
  | 'RUNBOOK_COVERAGE'
  | 'RUNBOOK_BROKEN_LINK'
  // 3.13 ADR back-refs from components (v0.5 — B1)
  | 'COMPONENT_DECIDED_BY_INVALID_ADR'
  | 'COMPONENT_DECIDED_BY_SUPERSEDED_ADR'
  // 3.14 pub/sub edges (v0.5 — B2)
  | 'EVENT_EMIT_TARGET_NOT_EVENT'
  | 'EVENT_SUBSCRIBE_TARGET_NOT_EVENT'
  | 'EVENT_NO_SUBSCRIBER'
  | 'EVENT_SUBSCRIBE_NO_PUBLISHER'
  // 3.15 wire capture for external integrations (v0.5 — B3)
  // Defaults are non-error; `--strict-wire-capture` escalates _MISSING to
  // error. The `_PATH_BROKEN` / `_STALE` codes are emitted by the CLI
  // post-validate (filesystem-touching) rather than by semantic.ts.
  | 'WIRE_CAPTURE_MISSING'
  | 'WIRE_CAPTURE_PATH_BROKEN'
  | 'WIRE_CAPTURE_STALE'
  // 3.16 table migration parity (v0.5 — B4)
  | 'MIGRATION_COLUMN_INCONSISTENT'

export interface ValidationIssue {
  severity: Severity
  code: ValidationCode
  message: string
  file?: string
  line?: number
  column?: number
  entityRef?: string
  path?: ReadonlyArray<string | number>
  suggestion?: string
  docsUrl?: string
}

export interface ValidationResult {
  issues: ValidationIssue[]
  passes: {
    schema: boolean
    refs: boolean
    semantic: boolean
  }
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  for (const issue of issues) if (issue.severity === 'error') return true
  return false
}
