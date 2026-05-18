import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSpaceStore } from '@/store/space'
import { useParams } from '@tanstack/react-router'
import * as React from 'react'
import { DetailsTab } from './DetailsTab'
import { EditTab } from './EditTab'
import { NoSelection } from './NoSelection'
import { SaveIndicator } from './SaveIndicator'
import { YamlTab } from './YamlTab'
import { fileForRef, resolveEntityForInspector } from './resolved-entity'
import { useSelectedEntityRef } from './use-selected-entity-ref'

/**
 * Right-hand inspector panel. Reads the selection from the store + router,
 * resolves to an entity in the current space, and presents Details / Edit /
 * YAML tabs. Autosave runs through the store's `saveEntityFile`, which
 * snapshots the space for undo, writes, and re-validates.
 */
export function Inspector() {
  const current = useSpaceStore((s) => s.current)
  const saveStatus = useSpaceStore((s) => s.saveStatus)
  const saveEntityFile = useSpaceStore((s) => s.saveEntityFile)
  const inspectorTab = useSpaceStore((s) => s.inspectorTab)
  const setInspectorTab = useSpaceStore((s) => s.setInspectorTab)
  const ref = useSelectedEntityRef()

  // spaceId is read from the route so links inside the inspector navigate
  // back to the current space. The inspector lives inside the SpaceLayout
  // route, so this param always exists.
  const { spaceId } = useParams({ from: '/space/$spaceId' })

  const resolved = React.useMemo(() => {
    if (!current || !ref) return null
    return resolveEntityForInspector(current.space, ref)
  }, [current, ref])

  const fileLookup = React.useMemo(() => {
    if (!current || !ref) return null
    return fileForRef(current.files, ref)
  }, [current, ref])

  if (!current) return null
  if (!ref || !resolved) return <NoSelection />

  const status = fileLookup ? (saveStatus.get(fileLookup.path) ?? 'idle') : 'idle'

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-secondary">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-content font-[450] tracking-tight text-fg-primary">
              {'name' in resolved.entity ? resolved.entity.name : ref}
            </p>
            <p className="truncate font-mono text-meta text-fg-tertiary" title={ref}>
              {ref}
            </p>
          </div>
          <SaveIndicator status={status} />
        </div>
      </header>

      <Tabs
        value={inspectorTab}
        onValueChange={(v) => setInspectorTab(v as typeof inspectorTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border-subtle px-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="details" className="min-h-0 flex-1 overflow-auto">
          <DetailsTab spaceId={spaceId} resolved={resolved} />
        </TabsContent>
        <TabsContent value="edit" className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {fileLookup ? (
            <EditTab
              spaceId={spaceId}
              resolved={resolved}
              filePath={fileLookup.path}
              saveFile={saveEntityFile}
              readOnly={current.readOnly}
              files={current.files}
              space={current.space}
            />
          ) : (
            <p className="text-ui text-fg-tertiary">
              No file path for this ref — editing is unavailable.
            </p>
          )}
        </TabsContent>
        <TabsContent value="yaml" className="min-h-0 flex-1">
          <YamlTab path={fileLookup?.path ?? null} source={fileLookup?.file.source ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
