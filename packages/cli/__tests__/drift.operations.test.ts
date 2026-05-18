import { describe, expect, it } from 'vitest'
import { computeConfigRefDrift, computeExternalCallDrift } from '../src/commands/drift.js'

/**
 * v0.3 ops drift unit tests. Both functions are pure — they take a
 * trimmed Space-shape and a list of JSONL `_placement`-tagged entries
 * and return aggregated drift records. We exercise:
 *   1. happy path — code refs that match the spec are NOT in the report
 *   2. missing — refs the spec doesn't declare ARE in the report
 *   3. fuzzy endpoint match — substring-equivalent endpoints don't drift
 *   4. aggregation — N call-sites for the same key produce ONE entry
 *   5. cross-module isolation — a key declared in module A doesn't
 *      cover code that reads it in module B
 */

const space = {
  modules: [
    {
      id: 'backend',
      configMap: [{ key: 'STRIPE_API_KEY' }, { key: 'DB_URL' }],
      externalDeps: [{ endpoint: 'api.stripe.com' }, { endpoint: ':5432' }],
    },
    {
      id: 'frontend',
      configMap: [{ key: 'VITE_GOOGLE_CLIENT_ID' }],
      externalDeps: [],
    },
  ],
}

describe('computeConfigRefDrift', () => {
  it('returns empty when every code-side key is declared in its module', () => {
    const drift = computeConfigRefDrift(space, [
      {
        kind: 'config-ref',
        key: 'STRIPE_API_KEY',
        _placement: { module: 'backend', file: 'PaymentService.java', line: 42 },
      },
      {
        kind: 'config-ref',
        key: 'VITE_GOOGLE_CLIENT_ID',
        _placement: { module: 'frontend', file: 'auth.ts', line: 12 },
      },
    ])
    expect(drift).toEqual([])
  })

  it('flags keys the spec does not declare', () => {
    const drift = computeConfigRefDrift(space, [
      {
        kind: 'config-ref',
        key: 'OPENROUTER_API_KEY',
        _placement: { module: 'backend', file: 'LlmProxy.java', line: 7 },
      },
    ])
    expect(drift).toHaveLength(1)
    expect(drift[0]?.module).toBe('backend')
    expect(drift[0]?.key).toBe('OPENROUTER_API_KEY')
    expect(drift[0]?.callsites).toEqual([{ file: 'LlmProxy.java', line: 7 }])
  })

  it('aggregates many call-sites for the same key into one entry', () => {
    const drift = computeConfigRefDrift(space, [
      {
        kind: 'config-ref',
        key: 'OPENROUTER_API_KEY',
        _placement: { module: 'backend', file: 'A.java', line: 1 },
      },
      {
        kind: 'config-ref',
        key: 'OPENROUTER_API_KEY',
        _placement: { module: 'backend', file: 'B.java', line: 2 },
      },
      {
        kind: 'config-ref',
        key: 'OPENROUTER_API_KEY',
        _placement: { module: 'backend', file: 'C.java', line: 3 },
      },
    ])
    expect(drift).toHaveLength(1)
    expect(drift[0]?.callsites).toHaveLength(3)
  })

  it('keeps modules isolated (frontend key read from backend = drift)', () => {
    const drift = computeConfigRefDrift(space, [
      {
        kind: 'config-ref',
        key: 'VITE_GOOGLE_CLIENT_ID',
        _placement: { module: 'backend', file: 'auth.java', line: 1 },
      },
    ])
    expect(drift).toHaveLength(1)
    expect(drift[0]?.module).toBe('backend')
  })

  it('skips entries without _placement.module or key (silent contract)', () => {
    const drift = computeConfigRefDrift(space, [
      // No module — agent placement bug. Drop silently rather than
      // crashing the whole report.
      { kind: 'config-ref', key: 'X' },
      // No key — same.
      { kind: 'config-ref', _placement: { module: 'backend' } },
      // Wrong kind — ignored entirely.
      { kind: 'model', id: 'NotARef' },
    ])
    expect(drift).toEqual([])
  })
})

describe('computeExternalCallDrift', () => {
  it('returns empty when code endpoint substring-matches a spec endpoint', () => {
    const drift = computeExternalCallDrift(space, [
      {
        kind: 'external-call',
        // Code calls the full URL; spec only knows the host. Substring
        // match passes — would be silly to require exact equality.
        endpoint: 'https://api.stripe.com/v1/charges',
        protocol: 'https',
        _placement: { module: 'backend', file: 'StripeClient.java', line: 18 },
      },
    ])
    expect(drift).toEqual([])
  })

  it('passes when the spec endpoint is broader than the code endpoint', () => {
    const drift = computeExternalCallDrift(space, [
      {
        kind: 'external-call',
        endpoint: ':5432',
        _placement: { module: 'backend' },
      },
    ])
    expect(drift).toEqual([])
  })

  it('flags an endpoint with no spec entry', () => {
    const drift = computeExternalCallDrift(space, [
      {
        kind: 'external-call',
        endpoint: 'api.openrouter.ai',
        protocol: 'https',
        _placement: { module: 'backend', file: 'LlmProxy.java', line: 7 },
      },
    ])
    expect(drift).toHaveLength(1)
    expect(drift[0]?.endpoint).toBe('api.openrouter.ai')
    expect(drift[0]?.protocol).toBe('https')
  })

  it('aggregates call-sites by (module, endpoint)', () => {
    const drift = computeExternalCallDrift(space, [
      {
        kind: 'external-call',
        endpoint: 'api.openrouter.ai',
        _placement: { module: 'backend', file: 'A.java', line: 1 },
      },
      {
        kind: 'external-call',
        endpoint: 'api.openrouter.ai',
        _placement: { module: 'backend', file: 'B.java', line: 2 },
      },
    ])
    expect(drift).toHaveLength(1)
    expect(drift[0]?.callsites).toHaveLength(2)
  })

  it('case-insensitive substring match (URL host casing varies in code)', () => {
    const drift = computeExternalCallDrift(space, [
      {
        kind: 'external-call',
        endpoint: 'API.STRIPE.COM',
        _placement: { module: 'backend' },
      },
    ])
    expect(drift).toEqual([])
  })
})
