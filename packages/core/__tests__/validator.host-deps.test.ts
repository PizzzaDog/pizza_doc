/**
 * Host external-deps (v0.3 — A3) tests.
 *
 * Covers:
 *   - Legacy http-api entries without `kind` parse cleanly (backward compat).
 *   - host-binary, host-artifact, apt-package shapes parse with v0.3 fields.
 *   - 4 host-dep validator rules:
 *       · HOST_DEP_BINARY_SHA256_MISSING
 *       · HOST_DEP_ARTIFACT_RECIPE_MISSING
 *       · HOST_DEP_PREFLIGHT_MISSING
 *       · HOST_DEP_PROD_OWNER_MISSING
 */
import { describe, expect, it } from 'vitest'
import { buildRefIndex, validateSemanticPass } from '../src/index.js'
import type { ExternalDepEntry, Module, Space } from '../src/index.js'
import { ExternalDepEntrySchema } from '../src/schema.js'

describe('A3 — external-dep schema parsing', () => {
  it('legacy http-api entry without `kind` parses as kind: http-api', () => {
    const parsed = ExternalDepEntrySchema.parse({
      name: 'openrouter-api',
      direction: 'outbound',
      protocol: 'https',
      endpoint: 'https://openrouter.ai/api',
      consumer: 'module:api',
      auth: 'bearer',
      usesConfigKey: 'OPENROUTER_API_KEY',
    })
    expect(parsed.kind).toBe('http-api')
    if (parsed.kind === 'http-api') {
      expect(parsed.usesConfigKey).toBe('OPENROUTER_API_KEY')
    }
  })

  it('host-binary parses with source + preflight + lifecycle', () => {
    const parsed = ExternalDepEntrySchema.parse({
      kind: 'host-binary',
      name: 'firecracker-kernel',
      install_path: '/opt/acme/firecracker/vmlinux',
      install_owner: 'acme-infra',
      required_in_profiles: ['prod'],
      lifecycle: 'bootstrap',
      source: {
        type: 'github-release',
        repo: 'firecracker-microvm/firecracker-ci',
        asset: 'vmlinux-5.10.225',
        sha256: 'abc123def456',
      },
      preflight: {
        command: 'test -f /opt/acme/firecracker/vmlinux',
        expected: 'exit_code_0',
      },
    })
    expect(parsed.kind).toBe('host-binary')
  })

  it('host-artifact parses with build-on-host source + input checksums', () => {
    const parsed = ExternalDepEntrySchema.parse({
      kind: 'host-artifact',
      name: 'golden-rootfs',
      install_path: '/opt/acme/firecracker/golden.ext4',
      install_owner: 'acme-infra',
      required_in_profiles: ['prod'],
      lifecycle: 'deploy',
      source: {
        type: 'build-on-host',
        recipe: 'scripts/build-golden.sh',
        input_checksums: ['scripts/build-golden.sh', 'scripts/skel/*'],
      },
      preflight: {
        command: 'test -s /opt/acme/firecracker/golden.ext4',
        expected: 'exit_code_0',
      },
    })
    expect(parsed.kind).toBe('host-artifact')
  })

  it('apt-package parses with used_by_scripts', () => {
    const parsed = ExternalDepEntrySchema.parse({
      kind: 'apt-package',
      name: 'e2tools',
      install_owner: 'acme-devops',
      required_in_profiles: ['prod'],
      lifecycle: 'bootstrap',
      used_by_scripts: ['scripts/provisioning/vm-provision.sh'],
      preflight: { command: 'command -v e2cp', expected: 'exit_code_0' },
    })
    expect(parsed.kind).toBe('apt-package')
    if (parsed.kind === 'apt-package') {
      expect(parsed.manager).toBe('apt')
      expect(parsed.used_by_scripts).toContain('scripts/provisioning/vm-provision.sh')
    }
  })
})

function spaceWith(dep: ExternalDepEntry): Space {
  const mod: Module = {
    kind: 'module',
    id: 'infra',
    name: 'Infra',
    type: 'service',
    domains: [],
    components: [],
    models: [],
    tables: [],
    errorMapping: [],
    configMap: [],
    externalDeps: [dep],
    decisions: [],
    stateMachines: [],
  }
  return {
    meta: { id: 'host-deps', name: 'Host Deps', version: '0.1.0', pizzaDocVersion: '0.3.0' },
    actors: [],
    modules: [mod],
    useCases: [],
    decisions: [],
  }
}

describe('A3 — host-dep validator rules', () => {
  it('HOST_DEP_BINARY_SHA256_MISSING fires on github-release without sha256', () => {
    const space = spaceWith({
      kind: 'host-binary',
      name: 'firecracker',
      install_path: '/usr/bin/firecracker',
      required_in_profiles: [],
      source: { type: 'github-release', repo: 'fc/fc', asset: 'fc' },
      preflight: { command: 'command -v firecracker', expected: 'exit_code_0' },
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.some((i) => i.code === 'HOST_DEP_BINARY_SHA256_MISSING')).toBe(true)
  })

  it('HOST_DEP_BINARY_SHA256_MISSING quiet when sha256 set', () => {
    const space = spaceWith({
      kind: 'host-binary',
      name: 'firecracker',
      install_path: '/usr/bin/firecracker',
      required_in_profiles: [],
      source: { type: 'github-release', repo: 'fc/fc', asset: 'fc', sha256: 'deadbeef' },
      preflight: { command: 'true', expected: 'exit_code_0' },
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.some((i) => i.code === 'HOST_DEP_BINARY_SHA256_MISSING')).toBe(false)
  })

  it('HOST_DEP_ARTIFACT_RECIPE_MISSING fires when build-on-host has no input_checksums', () => {
    const space = spaceWith({
      kind: 'host-artifact',
      name: 'rootfs',
      install_path: '/var/rootfs.img',
      required_in_profiles: [],
      source: { type: 'build-on-host', recipe: 'scripts/build.sh', input_checksums: [] },
      preflight: { command: 'true', expected: 'exit_code_0' },
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.some((i) => i.code === 'HOST_DEP_ARTIFACT_RECIPE_MISSING')).toBe(true)
  })

  it('HOST_DEP_PREFLIGHT_MISSING fires when host-dep has no preflight', () => {
    const space = spaceWith({
      kind: 'apt-package',
      name: 'jq',
      required_in_profiles: [],
      used_by_scripts: [],
      manager: 'apt',
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.some((i) => i.code === 'HOST_DEP_PREFLIGHT_MISSING')).toBe(true)
  })

  it('HOST_DEP_PROD_OWNER_MISSING fires for prod-required dep without install_owner', () => {
    const space = spaceWith({
      kind: 'host-binary',
      name: 'firecracker',
      install_path: '/usr/bin/firecracker',
      required_in_profiles: ['prod'],
      // no install_owner
      source: { type: 'url', url: 'https://example.com/fc', sha256: 'abc' },
      preflight: { command: 'true', expected: 'exit_code_0' },
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.some((i) => i.code === 'HOST_DEP_PROD_OWNER_MISSING')).toBe(true)
  })

  it('HOST_DEP_PROD_OWNER_MISSING quiet for non-prod dep without owner', () => {
    const space = spaceWith({
      kind: 'apt-package',
      name: 'jq',
      required_in_profiles: ['local'],
      used_by_scripts: [],
      manager: 'apt',
      preflight: { command: 'command -v jq', expected: 'exit_code_0' },
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.some((i) => i.code === 'HOST_DEP_PROD_OWNER_MISSING')).toBe(false)
  })

  it('http-api deps are ignored by host-dep rules', () => {
    const space = spaceWith({
      kind: 'http-api',
      name: 'openrouter',
      direction: 'outbound',
      protocol: 'https',
      endpoint: 'https://openrouter.ai',
      consumer: 'module:infra',
      auth: 'bearer',
      usesConfigKey: 'OR_KEY',
      defaultSources: [],
    } as ExternalDepEntry)
    const issues = validateSemanticPass(space, buildRefIndex(space))
    const hostCodes = issues.filter((i) => i.code.startsWith('HOST_DEP_'))
    expect(hostCodes).toEqual([])
  })
})
