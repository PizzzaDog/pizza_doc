import * as nodePath from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = nodePath.dirname(__filename)
const FIXTURE = nodePath.resolve(__dirname, '../../core/__fixtures__/valid/endpoints-shared-path')

// The fixture: modules `backend` and `gateway` both declare GET /api/healthz
// and GET /api/friends (proxy in front of a backend), plus an intentionally
// uncovered shared legacy probe; `backend` also has a subscriber-type WS
// gateway (GET /ws/events, uncovered) and `gateway` a client-type apiClient
// wrapper whose http metadata must never count as an endpoint. Use case
// list-friends covers CoreApi without a verb+path in the description, so its
// keys are covered via the fallback owner match.

let log: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  log.mockRestore()
})

function output(): string {
  return log.mock.calls.map((c) => c.join(' ')).join('\n')
}

describe('pd endpoints — multi-owner rollup', () => {
  it('lists every owner of a verb+path shared across modules', async () => {
    await expect(runCli(['endpoints', FIXTURE])).resolves.toBe(0)

    const out = output()
    expect(out).toContain('5 declared')
    // Both owners of the shared keys, not last-loaded-wins.
    expect(out).toContain('module:backend/component:CoreApi/method:ListFriends')
    expect(out).toContain('module:gateway/component:ProxyApi/method:FriendsList')
    expect(out).toContain('module:backend/component:CoreApi/method:Healthz')
    expect(out).toContain('module:gateway/component:ProxyApi/method:GetHealthz')
  })

  it('covers a shared key when a use case targets the shadowed owner', async () => {
    await runCli(['endpoints', FIXTURE])

    // Under the old single-owner map, gateway's declaration shadowed
    // backend's, so the fallback match on CoreApi missed GET /api/friends
    // and reported it as a false orphan.
    expect(output()).toMatch(/GET {4}\/api\/friends {2}1 usecase/)
  })

  it('counts inbound non-controller types and excludes client http metadata', async () => {
    await runCli(['endpoints', FIXTURE])

    const out = output()
    // subscriber-type WS gateway is a declared endpoint…
    expect(out).toContain('module:backend/component:EventsFeed/method:EventsSocket')
    // …while the client-type wrapper never owns one.
    expect(out).not.toContain('BackendClient')
  })

  it('narrows to one module with --module', async () => {
    await expect(runCli(['endpoints', FIXTURE, '--module', 'gateway'])).resolves.toBe(0)

    const out = output()
    expect(out).toContain('module gateway: 3 of 5 declared')
    expect(out).toContain('module:gateway/component:ProxyApi/method:GetHealthz')
    expect(out).not.toContain('module:backend/component:CoreApi')
    expect(out).not.toContain('/ws/events')
  })

  it('rejects an unknown --module id', async () => {
    await expect(runCli(['endpoints', FIXTURE, '--module', 'nope'])).resolves.toBe(2)

    const out = output()
    expect(out).toContain('unknown module: nope')
    expect(out).toContain('backend')
    expect(out).toContain('gateway')
  })

  it('--orphans reports uncovered keys and exits 1', async () => {
    await expect(runCli(['endpoints', FIXTURE, '--orphans'])).resolves.toBe(1)

    const out = output()
    expect(out).toContain('GET    /ws/events')
    expect(out).toContain('GET    /internal/legacy-probe')
    expect(out).not.toContain('/api/healthz')
    expect(out).not.toContain('/api/friends')
    expect(out).not.toContain('/api/orders')
  })
})

describe('pd orphans — multi-owner endpoints section', () => {
  it('prints every owner of an orphan endpoint', async () => {
    // The whole fixture has orphan components (EventsFeed, BackendClient), so
    // scope to endpoints. The legacy probe is declared by two modules and is
    // explicitly readiness-waived, but remains uncovered in this CLI report.
    await expect(runCli(['orphans', FIXTURE, '--kind', 'endpoints'])).resolves.toBe(1)

    const out = output()
    expect(out).toContain('GET /ws/events')
    expect(out).toContain('module:backend/component:EventsFeed/method:EventsSocket')
    expect(out).toContain('GET /internal/legacy-probe')
    expect(out).toContain('module:backend/component:EventsFeed/method:LegacyProbe')
    expect(out).toContain('module:gateway/component:ProxyApi/method:LegacyProbe')
    expect(out).not.toContain('/api/friends')
  })
})
