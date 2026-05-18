import { loadAndValidate } from '../util/space.js'
import type { ToolDef } from './types.js'

interface ModuleOperationsInput {
  module: string
  spaceDir?: string
}

interface ModuleOperationsOutput {
  found: boolean
  module?: {
    id: string
    name: string
    type: string
    techStack?: string
    description?: string
  }
  configMap: Array<{
    key: string
    type: string
    lifecycle: string
    mutability: string
    consumer: { component: string; callsite?: string }
    description?: string
    related: string[]
    sourceOfTruth?: string
    defaultValue?: string
    defaultSources?: Array<{
      source?: string | undefined
      value: string
      sourceRef: string
      description?: string | undefined
    }>
  }>
  externalDeps: Array<{
    name: string
    direction: string
    protocol: string
    endpoint: string
    purpose?: string
    consumer: string
    auth: string
    usesConfigKey?: string
    failureMode?: string
    preflightCheck?: { sourceRef: string; description?: string | undefined }
    driftProbe?: { sourceRef: string; description?: string | undefined }
    positionalArgs?: {
      name?: string | undefined
      contractTest?: { sourceRef: string; description?: string | undefined } | undefined
      acceptanceCriteria: string[]
      args: Array<{
        position: number
        name: string
        type: string
        required: boolean
        nonempty: boolean
        secret: boolean
        defaultValue?: string | number | boolean | null | undefined
        enumValues?: string[] | undefined
        description?: string | undefined
      }>
    }
  }>
  decisions: Array<{ id: string; title: string; status: string; date?: string }>
  reason?: string
}

export const moduleOperationsTool: ToolDef<ModuleOperationsInput, ModuleOperationsOutput> = {
  name: 'pd_module_operations',
  description:
    'Return the operational facts about one module: configuration knobs (env vars / secrets / runtime flags), outbound external dependencies (with auth + failure modes), and the ADR ids that touch this module. Use this when the agent needs the deployment-readiness picture for a service without loading the whole space.',
  inputSchema: {
    type: 'object',
    properties: {
      module: { type: 'string', description: 'Module id, e.g. backend, vm-agent.' },
      spaceDir: { type: 'string' },
    },
    required: ['module'],
    additionalProperties: false,
  },
  async handler(input) {
    const { space } = await loadAndValidate(input.spaceDir)
    const mod = space.modules.find((m) => m.id === input.module)
    if (!mod) {
      return {
        found: false,
        configMap: [],
        externalDeps: [],
        decisions: [],
        reason: `module '${input.module}' not found in space '${space.meta.id}'`,
      }
    }
    // Resolve ADR ids on the module to full AdrRef metadata from the
    // space-level decisions index. Broken links are silently skipped
    // here — the validator's ADR_BROKEN_LINK rule already flags them.
    const decisions = mod.decisions.flatMap((id) => {
      const adr = space.decisions.find((d) => d.id === id)
      if (!adr) return []
      const out: { id: string; title: string; status: string; date?: string } = {
        id: adr.id,
        title: adr.title,
        status: adr.status,
      }
      if (adr.date) out.date = adr.date
      return [out]
    })
    const out: ModuleOperationsOutput = {
      found: true,
      module: {
        id: mod.id,
        name: mod.name,
        type: mod.type,
        ...(mod.techStack ? { techStack: mod.techStack } : {}),
        ...(mod.description ? { description: mod.description } : {}),
      },
      configMap: mod.configMap.map((c) => {
        const entry: ModuleOperationsOutput['configMap'][number] = {
          key: c.key,
          type: c.type,
          lifecycle: c.lifecycle,
          mutability: c.mutability,
          consumer: { component: c.consumer.component },
          related: c.related,
        }
        if (c.consumer.callsite) entry.consumer.callsite = c.consumer.callsite
        if (c.description) entry.description = c.description
        if (c.sourceOfTruth) entry.sourceOfTruth = c.sourceOfTruth
        if (c.defaultValue !== undefined) entry.defaultValue = c.defaultValue
        if (c.defaultSources.length > 0) entry.defaultSources = c.defaultSources
        return entry
      }),
      // v0.3 (A3): only http-api deps fit the historical externalDeps shape
      // exposed by this MCP tool. Host-installed kinds (host-binary,
      // host-artifact, apt-package) are intentionally elided here pending a
      // dedicated `pd_operations_host_deps` MCP tool. Existing consumers
      // keep working without code changes.
      externalDeps: mod.externalDeps
        .filter(
          (d): d is Extract<typeof d, { auth: unknown }> =>
            d.kind === 'http-api' || d.kind === undefined,
        )
        .map((d) => {
          const entry: ModuleOperationsOutput['externalDeps'][number] = {
            name: d.name,
            direction: d.direction,
            protocol: d.protocol,
            endpoint: d.endpoint,
            consumer: d.consumer,
            auth: d.auth,
          }
          if (d.purpose) entry.purpose = d.purpose
          if (d.usesConfigKey) entry.usesConfigKey = d.usesConfigKey
          if (d.failureMode) entry.failureMode = d.failureMode
          if (d.preflightCheck) entry.preflightCheck = d.preflightCheck
          if (d.driftProbe) entry.driftProbe = d.driftProbe
          if (d.positionalArgs) entry.positionalArgs = d.positionalArgs
          return entry
        }),
      decisions,
    }
    return out
  },
}
