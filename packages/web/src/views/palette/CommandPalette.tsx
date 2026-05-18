import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { encodeRefForRoute } from '@/lib/entity-ref'
import { useSpaceStore } from '@/store/space'
import type { RefTarget, Space } from '@pizza-doc/core'
import { buildRefIndex } from '@pizza-doc/core'
import { useNavigate } from '@tanstack/react-router'
import {
  Box,
  Boxes,
  Database,
  Download,
  FileDown,
  Folder,
  LayoutList,
  Package,
  RefreshCcw,
  ShieldCheck,
  User,
  Workflow,
} from 'lucide-react'
import { useMemo } from 'react'

type NavAction = { kind: 'entity'; refPath: string } | { kind: 'usecase'; useCaseId: string }

interface PaletteEntityRow {
  ref: string
  kind: RefTarget['kind']
  name: string
  description?: string
  breadcrumb: string
  /** Value cmdk uses for fuzzy scoring — concatenation of everything searchable. */
  searchValue: string
  navigate: NavAction
}

/**
 * ⌘+K command palette. Fuzzy search across every entity in the current space
 * (name + ref + description) plus a fixed set of actions. Selecting an entity
 * navigates; actions invoke the matching store method.
 */
export function CommandPalette({ spaceId }: { spaceId: string }) {
  const open = useSpaceStore((s) => s.paletteOpen)
  const setOpen = useSpaceStore((s) => s.setPaletteOpen)
  const current = useSpaceStore((s) => s.current)
  const exportToDisk = useSpaceStore((s) => s.exportSpaceToDisk)
  const downloadZip = useSpaceStore((s) => s.downloadSpaceZip)
  const reload = useSpaceStore((s) => s.reloadCurrentSpace)
  const revalidate = useSpaceStore((s) => s.revalidate)
  const navigate = useNavigate()

  const rows = useMemo<PaletteEntityRow[]>(() => {
    if (!current) return []
    return buildEntityRows(current.space)
  }, [current])

  function handleNavigate(row: PaletteEntityRow): void {
    setOpen(false)
    if (row.navigate.kind === 'usecase') {
      void navigate({
        to: '/space/$spaceId/usecase/$useCaseId',
        params: { spaceId, useCaseId: row.navigate.useCaseId },
      })
    } else {
      void navigate({
        to: '/space/$spaceId/entity/$refPath',
        params: { spaceId, refPath: row.navigate.refPath },
      })
    }
  }

  function close(): void {
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search entities or run an action…" autoFocus />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            value="action validate space"
            onSelect={() => {
              close()
              revalidate()
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-fg-tertiary" strokeWidth={1.5} />
            Validate space
          </CommandItem>
          <CommandItem
            value="action export for ai markdown"
            onSelect={() => {
              close()
              void exportToDisk()
            }}
          >
            <FileDown className="h-3.5 w-3.5 text-fg-tertiary" strokeWidth={1.5} />
            Export for AI
          </CommandItem>
          <CommandItem
            value="action export zip download"
            onSelect={() => {
              close()
              void downloadZip()
            }}
          >
            <Download className="h-3.5 w-3.5 text-fg-tertiary" strokeWidth={1.5} />
            Export as ZIP
          </CommandItem>
          <CommandItem
            value="action reload refresh from disk"
            onSelect={() => {
              close()
              void reload()
            }}
          >
            <RefreshCcw className="h-3.5 w-3.5 text-fg-tertiary" strokeWidth={1.5} />
            Reload from disk
          </CommandItem>
        </CommandGroup>

        {rows.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Entities">
              {rows.map((row) => (
                <CommandItem
                  key={row.ref}
                  value={row.searchValue}
                  onSelect={() => handleNavigate(row)}
                >
                  <KindIcon kind={row.kind} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-fg-primary">{row.name}</span>
                    <span className="truncate font-mono text-[10px] text-fg-tertiary">
                      {row.breadcrumb}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-sm border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-tertiary">
                    {row.kind}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}

function KindIcon({ kind }: { kind: RefTarget['kind'] }) {
  const common = 'h-3.5 w-3.5 text-fg-tertiary'
  switch (kind) {
    case 'actor':
      return <User className={common} strokeWidth={1.5} />
    case 'usecase':
      return <Workflow className={common} strokeWidth={1.5} />
    case 'module':
      return <Package className={common} strokeWidth={1.5} />
    case 'domain':
      return <Folder className={common} strokeWidth={1.5} />
    case 'component':
      return <Box className={common} strokeWidth={1.5} />
    case 'method':
      return <LayoutList className={common} strokeWidth={1.5} />
    case 'model':
      return <Boxes className={common} strokeWidth={1.5} />
    case 'table':
      return <Database className={common} strokeWidth={1.5} />
  }
}

function buildEntityRows(space: Space): PaletteEntityRow[] {
  const index = buildRefIndex(space)
  const rows: PaletteEntityRow[] = []
  for (const ref of index.refs()) {
    const target = index.get(ref)
    if (!target) continue
    // Skip methods: canvas focuses on components/models/tables, and method
    // refs bloat the palette with noise. They remain reachable via their
    // parent component.
    if (target.kind === 'method') continue
    const row = toRow(ref, target)
    rows.push(row)
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

function toRow(ref: string, target: RefTarget): PaletteEntityRow {
  const name = entityName(target)
  const description = entityDescription(target)
  const breadcrumb = breadcrumbFor(target, ref)
  const row: PaletteEntityRow = {
    ref,
    kind: target.kind,
    name,
    breadcrumb,
    searchValue: `${name} ${ref} ${description ?? ''} ${breadcrumb}`.toLowerCase(),
    navigate:
      target.kind === 'usecase'
        ? { kind: 'usecase', useCaseId: target.entity.id }
        : { kind: 'entity', refPath: encodeRefForRoute(ref) },
  }
  if (description) row.description = description
  return row
}

function entityName(target: RefTarget): string {
  // All entity schemas require `name`; the fallback is defensive only.
  return target.entity.name
}

function entityDescription(target: RefTarget): string | undefined {
  if (target.kind === 'method') return target.entity.description
  const entity = target.entity as { description?: string }
  return entity.description
}

function breadcrumbFor(target: RefTarget, ref: string): string {
  switch (target.kind) {
    case 'actor':
      return 'actor'
    case 'usecase':
      return 'use case'
    case 'module':
      return target.entity.id
    case 'domain':
      return `${target.module.id} / ${target.entity.id}`
    case 'component':
    case 'model':
    case 'table':
      return target.domain
        ? `${target.module.id} / ${target.domain.id} / ${target.entity.id}`
        : `${target.module.id} / ${target.entity.id}`
    case 'method':
      // Methods are filtered out, but keep the branch exhaustive.
      return ref
  }
}
