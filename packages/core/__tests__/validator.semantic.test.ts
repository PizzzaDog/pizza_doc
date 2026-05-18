import { describe, expect, it } from 'vitest'
import type { Severity } from '../src/index.js'
import { ALL_SEMANTIC_RULES } from '../src/index.js'
import { hasCode, loadFixture } from './helpers.js'

interface RuleCase {
  code: string
  severity: Severity
}

const CASES: readonly RuleCase[] = [
  // 3.1 coherence
  { code: 'USECASE_NO_STEPS', severity: 'error' },
  { code: 'USECASE_STEP_CHAIN_DISCONTINUITY', severity: 'warning' },
  { code: 'USECASE_FIRST_STEP_NOT_FROM_FRONTEND', severity: 'warning' },
  { code: 'USECASE_LAST_STEP_NOT_TERMINAL', severity: 'warning' },
  // 3.2 DTO flow
  { code: 'DTO_FLOW_VIA_TYPE_MISMATCH', severity: 'warning' },
  { code: 'HTTP_STEP_TARGET_NOT_CONTROLLER', severity: 'error' },
  { code: 'SQL_STEP_TARGET_NOT_DATABASE', severity: 'error' },
  // 3.3 data flow
  { code: 'DATAFLOW_SOURCE_FIELD_MISSING', severity: 'error' },
  { code: 'DATAFLOW_TARGET_FIELD_MISSING', severity: 'error' },
  { code: 'DATAFLOW_TYPE_INCOMPATIBLE', severity: 'warning' },
  { code: 'DATAFLOW_TRANSFORM_MISSING', severity: 'warning' },
  { code: 'DATAFLOW_UNUSED_DTO_FIELD', severity: 'warning' },
  { code: 'DATAFLOW_UNWRITTEN_REQUIRED_COLUMN', severity: 'error' },
  // 3.4 hygiene
  { code: 'DUPLICATE_ID', severity: 'error' },
  { code: 'CYCLIC_CALLS', severity: 'warning' },
  { code: 'ACTOR_UNUSED', severity: 'warning' },
  { code: 'COMPONENT_UNUSED', severity: 'warning' },
  { code: 'DTO_UNUSED', severity: 'warning' },
  // 3.5 cross-module
  { code: 'MODEL_FIELD_MISSING_COLUMN', severity: 'warning' },
  { code: 'FK_COLUMN_MISSING', severity: 'error' },
  // 3.6 contract extensions (v0.2)
  { code: 'STATE_MACHINE_INCOHERENT', severity: 'error' },
]

// v0.3 operations rules don't have fixture-based tests in this file — they
// have their own targeted suite in validator.operations.test.ts that
// builds Spaces in-memory rather than loading invalid/* fixtures. They
// must still be exported from ALL_SEMANTIC_RULES, hence this list.
const FIXTURELESS_RULES = [
  'CONFIG_KEY_DUPLICATE',
  'CONFIG_SECRET_SOURCE_UNRESOLVED',
  'CONFIG_RUNTIME_NO_ADMIN_UI',
  'CONFIG_RELATED_BROKEN',
  'EXTERNAL_DEP_USES_UNKNOWN_CONFIG',
  'EXTERNAL_DEP_ARG_CONTRACT_INVALID',
  'ADR_BROKEN_LINK',
  'ADR_DUPLICATE_ID',
  // 3.9 — A1 calls/routes contract rules. Covered by
  // validator.contracts.test.ts with in-memory Space fixtures.
  'CONTRACT_CALL_CREDENTIAL_MISSING',
  'CONTRACT_CALL_PATH_ORPHAN',
  'CONTRACT_CALL_HEADER_MISMATCH',
  'CONTRACT_CALL_ENV_MISMATCH',
  // 3.10 — A2 state-machine scenario coverage. Covered by
  // validator.state-machines.test.ts with in-memory Space fixtures.
  'STATE_MACHINE_SCENARIO_COVERAGE',
  // 3.11 — A3 host external-deps. Covered by validator.host-deps.test.ts.
  'HOST_DEP_BINARY_SHA256_MISSING',
  'HOST_DEP_ARTIFACT_RECIPE_MISSING',
  'HOST_DEP_PREFLIGHT_MISSING',
  'HOST_DEP_PROD_OWNER_MISSING',
  // 3.12 — A4 operations / runbooks. Covered by validator.runbooks.test.ts.
  'RUNBOOK_COVERAGE',
  'RUNBOOK_BROKEN_LINK',
  // 3.13 — B1 ADR back-refs from components. Covered by
  // validator.decided-by.test.ts with in-memory Space fixtures.
  'COMPONENT_DECIDED_BY_INVALID_ADR',
  'COMPONENT_DECIDED_BY_SUPERSEDED_ADR',
  // 3.14 — B2 pub/sub edges. Covered by validator.pubsub.test.ts.
  'EVENT_EMIT_TARGET_NOT_EVENT',
  'EVENT_SUBSCRIBE_TARGET_NOT_EVENT',
  'EVENT_NO_SUBSCRIBER',
  'EVENT_SUBSCRIBE_NO_PUBLISHER',
  // 3.15 — B3 wire capture. Covered by validator.wire-capture.test.ts +
  // cli __tests__ for the fs-touching path/staleness codes.
  'WIRE_CAPTURE_MISSING',
  // 3.16 — B4 table migration parity. Covered by validator.migration.test.ts.
  'MIGRATION_COLUMN_INCONSISTENT',
] as const

describe('Pass 3 semantic validation', () => {
  it('exposes every rule from ALL_SEMANTIC_RULES', () => {
    expect(ALL_SEMANTIC_RULES).toHaveLength(CASES.length + FIXTURELESS_RULES.length)
    const exported = new Set(ALL_SEMANTIC_RULES.map((r) => r.code))
    for (const c of CASES) {
      expect(exported.has(c.code as never), `rule ${c.code} is exported`).toBe(true)
      const entry = ALL_SEMANTIC_RULES.find((r) => r.code === c.code)
      expect(typeof entry?.run).toBe('function')
    }
    for (const code of FIXTURELESS_RULES) {
      expect(exported.has(code as never), `rule ${code} is exported`).toBe(true)
      const entry = ALL_SEMANTIC_RULES.find((r) => r.code === code)
      expect(typeof entry?.run).toBe('function')
    }
  })

  for (const c of CASES) {
    describe(c.code, () => {
      it(`broken fixture fires ${c.code} with severity=${c.severity}`, async () => {
        const { validation } = await loadFixture('invalid', c.code)
        const issue = validation.issues.find((i) => i.code === c.code)
        if (!issue) {
          const codes = validation.issues.map((i) => i.code)
          throw new Error(
            `Expected ${c.code} in issues for fixture '${c.code}'. Got: ${JSON.stringify(codes)}`,
          )
        }
        expect(issue.severity).toBe(c.severity)
        expect(issue.message.length).toBeGreaterThan(0)
        expect(typeof issue.code).toBe('string')
      })

      it(`fixed fixture does not fire ${c.code}`, async () => {
        const { validation } = await loadFixture('invalid', `${c.code}__fixed`)
        expect(hasCode(validation.issues, c.code), `${c.code} should be gone after fix`).toBe(false)
      })
    })
  }
})
