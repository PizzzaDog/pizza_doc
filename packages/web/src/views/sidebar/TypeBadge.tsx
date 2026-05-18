import type { Module } from '@pizza-doc/core'
import { Cloud, Database, type LucideIcon, Monitor, RadioTower, Server } from 'lucide-react'

const LABEL_BY_TYPE: Record<Module['type'], string> = {
  frontend: 'fe',
  service: 'be',
  database: 'db',
  queue: 'mq',
  external: 'ext',
}

const NAME_BY_TYPE: Record<Module['type'], string> = {
  frontend: 'frontend',
  service: 'backend',
  database: 'database',
  queue: 'queue',
  external: 'external',
}

const ICON_BY_TYPE: Record<Module['type'], LucideIcon> = {
  frontend: Monitor,
  service: Server,
  database: Database,
  queue: RadioTower,
  external: Cloud,
}

/**
 * Mono-uppercase module-type tag like `[fe]` from the page-11 mock.
 * Deliberately a <span> — it sits inside buttons already, so it must not
 * introduce a nested <button>.
 */
export function TypeBadge({ type }: { type: Module['type'] }) {
  return (
    <span
      aria-label={`type: ${type}`}
      className="ml-1 inline-flex h-5 shrink-0 items-center rounded px-1 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary ring-1 ring-border-subtle"
    >
      [{LABEL_BY_TYPE[type]}]
    </span>
  )
}

export function ModuleKindIcon({ type }: { type: Module['type'] }) {
  const Icon = ICON_BY_TYPE[type]
  return (
    <span
      aria-label={`type: ${NAME_BY_TYPE[type]}`}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-current/35 bg-current/15"
      style={{
        color: `var(--kind-${kindToken(type)})`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)',
      }}
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
    </span>
  )
}

export function ModuleKindPill({ type }: { type: Module['type'] }) {
  return (
    <span
      aria-label={`touches ${NAME_BY_TYPE[type]}`}
      title={NAME_BY_TYPE[type]}
      className="inline-flex h-4 min-w-5 items-center justify-center rounded border border-current/25 bg-current/10 px-1 font-mono text-[9px] uppercase leading-none"
      style={{ color: `var(--kind-${kindToken(type)})` }}
    >
      {LABEL_BY_TYPE[type]}
    </span>
  )
}

function kindToken(type: Module['type']): string {
  return type === 'service' ? 'backend' : type
}
