import type {
  Actor,
  Component,
  Domain,
  LoadedFile,
  Model,
  Module,
  Space,
  Table,
  UseCase,
} from '@pizza-doc/core'
import {
  toActorFile,
  toComponentFile,
  toDomainFile,
  toModelFile,
  toModuleFile,
  toTableFile,
  toUseCaseFile,
} from './entity-file'
import { ActorForm } from './forms/ActorForm'
import { ComponentForm } from './forms/ComponentForm'
import { DomainForm } from './forms/DomainForm'
import { ModelForm } from './forms/ModelForm'
import { ModuleForm } from './forms/ModuleForm'
import { TableForm } from './forms/TableForm'
import { UseCaseForm } from './forms/UseCaseForm'
import type { ResolvedEntity } from './resolved-entity'

/**
 * Dispatches to the per-kind scalar form and hands back a `save` callback
 * that re-assembles the file-level payload before handing off to the
 * store. Every save shape matches what core's Zod schemas expect — never
 * writes YAML that would fail Pass 1.
 *
 * Nested arrays (methods / fields / columns / steps / dataFlow) are
 * shown read-only in the current scalar editor.
 */
export function EditTab({
  spaceId,
  resolved,
  filePath,
  saveFile,
  readOnly,
}: {
  spaceId: string
  resolved: ResolvedEntity
  filePath: string
  saveFile: (path: string, updatedData: unknown) => Promise<void>
  readOnly: boolean
  // `files` threaded through the container for the domain/module-file merge
  // helpers that reach into adjacent files.
  files: Map<string, LoadedFile>
  space: Space
}) {
  // `resetKey` is the identity we hand react-hook-form so it re-initialises
  // when the selected entity changes.
  const resetKey = `${resolved.kind}:${filePath}`
  void spaceId

  if (readOnly) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-secondary/60 px-3 py-3">
        <p className="text-ui font-medium text-fg-primary">Read-only bundled space</p>
        <p className="mt-1 text-meta text-fg-tertiary">
          Pick a local folder to edit YAML. Bundled spaces are loaded in memory for exploration.
        </p>
      </div>
    )
  }

  if (resolved.kind === 'actor') {
    return (
      <ActorForm
        actor={resolved.entity}
        resetKey={resetKey}
        save={async (next: Actor) => {
          await saveFile(filePath, toActorFile(next))
        }}
      />
    )
  }
  if (resolved.kind === 'module') {
    return (
      <ModuleForm
        module={resolved.entity}
        resetKey={resetKey}
        save={async (next: Module) => {
          await saveFile(filePath, toModuleFile(next))
        }}
      />
    )
  }
  if (resolved.kind === 'domain') {
    return (
      <DomainForm
        domain={resolved.entity}
        resetKey={resetKey}
        save={async (next: Domain) => {
          await saveFile(filePath, toDomainFile(next))
        }}
      />
    )
  }
  if (resolved.kind === 'component') {
    return (
      <ComponentForm
        component={resolved.entity}
        resetKey={resetKey}
        save={async (next: Component) => {
          await saveFile(filePath, toComponentFile(next))
        }}
      />
    )
  }
  if (resolved.kind === 'model') {
    return (
      <ModelForm
        model={resolved.entity}
        resetKey={resetKey}
        save={async (next: Model) => {
          await saveFile(filePath, toModelFile(next))
        }}
      />
    )
  }
  if (resolved.kind === 'table') {
    return (
      <TableForm
        table={resolved.entity}
        resetKey={resetKey}
        save={async (next: Table) => {
          await saveFile(filePath, toTableFile(next))
        }}
      />
    )
  }
  return (
    <UseCaseForm
      useCase={resolved.entity}
      resetKey={resetKey}
      save={async (next: UseCase) => {
        await saveFile(filePath, toUseCaseFile(next))
      }}
    />
  )
}
