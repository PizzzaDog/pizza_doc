import { browserFileSystem } from '@/fs/browser-fs'
import {
  BUNDLED_DEMO_ID,
  bundledDemoFileSystem,
  bundledSpaceFileSystem,
  hasBundledDemo,
  hasBundledSpace,
  listBundledSpaces,
} from '@/fs/bundled-spaces'
import { fetchUiSession, serverFileSystem } from '@/fs/server-fs'
import { type FileWatcherHandle, startFileWatcher } from '@/lib/file-watcher'
import {
  clearRootHandle,
  loadLastSpaceId,
  loadRootHandle,
  queryHandlePermission,
  requestHandlePermission,
  saveLastSpaceId,
  saveRootHandle,
} from '@/lib/session-persistence'
import { type Theme, applyThemeToDom, resolveInitialTheme } from '@/lib/theme'
import {
  type Snapshot,
  type UndoStack,
  clearRedo,
  cloneSpace,
  emptyStack,
  pushPast,
  redo as redoStack,
  undo as undoStack,
} from '@/lib/undo-stack'
import { BUILD_VERSION } from '@/lib/version'
import { downloadSpaceAsZip } from '@/lib/zip-export'
import {
  type ChangeSet,
  type FileSystem,
  type LoadedFile,
  type Space,
  type ValidationIssue,
  changeSetOverlayFileSystem,
  exportSpaceForAi,
  listChangeSets,
  loadSpace,
  readChangeSet,
  validate,
} from '@pizza-doc/core'
import { toast } from 'sonner'
import { parseDocument } from 'yaml'
import { create } from 'zustand'

interface DetectedSpace {
  id: string
  handle: FileSystemDirectoryHandle | null
  fs: FileSystem | null
  source: 'browser' | 'server'
}

interface CurrentSpace {
  id: string
  /** `null` when the space was loaded from the bundled demo (read-only).
   * All write paths (saveEntityFile, exports, reload-from-disk) check this
   * and short-circuit with a toast instead of blowing up. */
  handle: FileSystemDirectoryHandle | null
  fs: FileSystem | null
  space: Space
  issues: ValidationIssue[]
  files: Map<string, LoadedFile>
  passes: { schema: boolean; refs: boolean; semantic: boolean }
  counts: SpaceCounts
  loadedAt: number
  /** `true` for the bundled demo; write operations are blocked with a toast. */
  readOnly: boolean
  source: 'browser' | 'server' | 'bundled'
  changeId: string | null
}

interface ChangeSummary {
  id: string
  title: string
  status: ChangeSet['status']
}

export interface SpaceCounts {
  files: number
  modules: number
  actors: number
  components: number
  methods: number
  models: number
  tables: number
  useCases: number
  entities: number
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type InspectorTab = 'details' | 'edit' | 'yaml'

interface SpaceStore {
  root: {
    handle: FileSystemDirectoryHandle | null
    name: string
    source: 'browser' | 'server'
  } | null
  detectedSpaces: DetectedSpace[]
  changes: ChangeSummary[]
  activeChangeId: string | null
  version: string
  current: CurrentSpace | null
  loading: boolean
  error: string | null

  /** Name of the last folder the user picked, restored from IndexedDB at
   * boot. Non-null when a stored handle exists but permission hasn't been
   * re-granted yet — drives the "Reopen <name>" button on Home. */
  pendingRestoreName: string | null

  sidebarCollapsed: boolean
  /**
   * Left sidebar behaviour: `pinned` keeps it docked (the old default),
   * `auto` collapses it and slides a floating overlay out when the cursor
   * hits the viewport's left edge. Persisted to localStorage so dev reloads
   * don't fight the user's preference.
   */
  sidebarMode: 'pinned' | 'auto'
  inspectorCollapsed: boolean
  expandedNodes: Set<string>
  selectedGraphRef: string | null

  /** Which inspector tab is active. Controlled so ⌘+E / ⌘+/ can switch. */
  inspectorTab: InspectorTab

  /** ⌘+K command palette open state. */
  paletteOpen: boolean
  /** `?` help modal open state. */
  helpOpen: boolean
  /** Validation-issues sheet (opened from the top-bar badge) state. */
  issuesOpen: boolean

  /** Runtime theme — not persisted (page 12 forbids localStorage in MVP). */
  theme: Theme

  /** Undo/redo stack keyed on the whole-space snapshot pattern. */
  undoStack: UndoStack
  /** Short-lived status for the "Saved" indicator, per file path. */
  saveStatus: Map<string, SaveStatus>

  pickRoot: () => Promise<void>
  clearRoot: () => void
  /** Try to re-attach to the folder the user picked in a previous session.
   * Silent if the browser remembers the grant; otherwise a one-click prompt. */
  reopenLastRoot: () => Promise<void>
  /** Boot-time: read persisted handle, re-attach silently if the browser
   * still has permission, otherwise expose `pendingRestoreName`. Returns the
   * last space id (if any) so the caller can navigate — we deliberately do
   * NOT auto-load it here, because this runs concurrently with React routing
   * and would otherwise redirect the user after they've already clicked
   * away. */
  restoreSession: () => Promise<string | null>
  /** Load one of the bundled (read-only) spaces by id. */
  loadBundledSpace: (id: string) => Promise<void>
  /** Alias that loads the canonical demo space — kept for the "Open demo"
   * button's existing wiring. */
  loadBundledDemo: () => Promise<void>
  hasBundledDemo: () => boolean
  loadSpace: (id: string) => Promise<void>
  reloadCurrentSpace: () => Promise<void>
  setActiveChangeId: (id: string | null) => Promise<void>
  revalidate: () => void
  clearCurrent: () => void
  setError: (message: string | null) => void

  toggleSidebar: () => void
  /** Flip sidebarMode between `pinned` and `auto`. Drives the pin button. */
  toggleSidebarPin: () => void
  toggleInspector: () => void
  toggleNode: (id: string) => void
  setNodeExpanded: (id: string, expanded: boolean) => void
  setSelectedGraphRef: (ref: string | null) => void
  setInspectorTab: (tab: InspectorTab) => void
  setPaletteOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  setIssuesOpen: (open: boolean) => void

  setTheme: (theme: Theme) => void
  toggleTheme: () => void

  /** Export the whole space as a Markdown document for AI agents. */
  exportSpaceToDisk: () => Promise<{ path: string; content: string } | null>
  /** Bundle the space folder as a ZIP and trigger download. */
  downloadSpaceZip: () => Promise<void>

  saveEntityFile: (path: string, updatedData: unknown) => Promise<void>

  undo: () => Promise<void>
  redo: () => Promise<void>
  canUndo: () => boolean
  canRedo: () => boolean
}

const DEFAULT_EXPANDED: ReadonlySet<string> = new Set([
  'section:useCases',
  'section:actors',
  'section:modules',
])

// File-watcher handle lives outside React. One per loaded space; torn down
// on space change.
let watcherHandle: FileWatcherHandle | null = null

const initialTheme = resolveInitialTheme()
applyThemeToDom(initialTheme)

export const useSpaceStore = create<SpaceStore>((set, get) => ({
  root: null,
  detectedSpaces: [],
  changes: [],
  activeChangeId: null,
  version: BUILD_VERSION,
  current: null,
  loading: false,
  error: null,
  pendingRestoreName: null,
  sidebarCollapsed: false,
  sidebarMode: loadSidebarMode(),
  inspectorCollapsed: false,
  expandedNodes: new Set(DEFAULT_EXPANDED),
  selectedGraphRef: null,
  inspectorTab: 'details',
  paletteOpen: false,
  helpOpen: false,
  issuesOpen: false,
  theme: initialTheme,
  undoStack: emptyStack(),
  saveStatus: new Map(),

  async pickRoot() {
    set({ loading: true, error: null })
    try {
      const handle = await pickDirectory()
      const detected = await detectSpaces(handle)
      set({
        root: { handle, name: handle.name, source: 'browser' },
        detectedSpaces: detected,
        changes: [],
        activeChangeId: null,
        loading: false,
        pendingRestoreName: null,
      })
      void saveRootHandle(handle)
    } catch (err) {
      if (isAbortError(err)) {
        set({ loading: false })
        return
      }
      set({ loading: false, error: formatError(err) })
    }
  },

  async reopenLastRoot() {
    set({ loading: true, error: null })
    try {
      const handle = await loadRootHandle()
      if (!handle) {
        set({ loading: false, pendingRestoreName: null })
        return
      }
      const perm = await requestHandlePermission(handle)
      if (perm !== 'granted') {
        set({ loading: false, error: 'Permission to reopen the folder was denied.' })
        return
      }
      const detected = await detectSpaces(handle)
      const lastId = await loadLastSpaceId()
      set({
        root: { handle, name: handle.name, source: 'browser' },
        detectedSpaces: detected,
        activeChangeId: null,
        loading: false,
        pendingRestoreName: null,
      })
      if (lastId && detected.some((s) => s.id === lastId)) {
        await get().loadSpace(lastId)
      }
    } catch (err) {
      set({ loading: false, error: formatError(err) })
    }
  },

  async restoreSession() {
    try {
      const uiSession = await fetchUiSession()
      if (uiSession) {
        set({ version: uiSession.version || BUILD_VERSION })
        if (uiSession.mode === 'local-space' && uiSession.space) {
          const fs = serverFileSystem()
          set({
            root: { handle: null, name: uiSession.space.name, source: 'server' },
            detectedSpaces: [{ id: uiSession.space.id, handle: null, fs, source: 'server' }],
            activeChangeId: uiSession.changeId,
            pendingRestoreName: null,
          })
          return uiSession.space.id
        }
      }

      const lastId = await loadLastSpaceId()
      const handle = await loadRootHandle()
      if (handle) {
        const perm = await queryHandlePermission(handle)
        if (perm === 'granted') {
          const detected = await detectSpaces(handle)
          set({
            root: { handle, name: handle.name, source: 'browser' },
            detectedSpaces: detected,
            pendingRestoreName: null,
          })
          // Return the last id — the caller (Root.tsx) decides whether to
          // navigate based on current URL. Firing loadSpace here would race
          // with user clicks after the page has already rendered.
          if (lastId && detected.some((s) => s.id === lastId)) return lastId
        } else {
          // Permission is 'prompt' or 'denied' — expose the folder name so
          // Home can render a one-click "Reopen <name>" button.
          set({ pendingRestoreName: handle.name })
        }
      }
      // Also restore if the last space was a bundled one (no handle needed).
      if (lastId && hasBundledSpace(lastId)) return lastId
      return null
    } catch {
      // Storage disabled / private mode — fall back to fresh picker.
      return null
    }
  },

  clearRoot() {
    stopWatcher()
    set({
      root: null,
      detectedSpaces: [],
      changes: [],
      activeChangeId: null,
      current: null,
      error: null,
      undoStack: emptyStack(),
      saveStatus: new Map(),
      pendingRestoreName: null,
    })
    void clearRootHandle()
  },

  hasBundledDemo: () => hasBundledDemo(),

  async loadBundledSpace(id: string) {
    if (!hasBundledSpace(id)) {
      set({ error: `Bundled space '${id}' not found.` })
      return
    }
    set({ loading: true, error: null })
    stopWatcher()
    try {
      const fs = bundledSpaceFileSystem(id)
      const loadResult = await loadSpace(fs, '.', id)
      const validation = validate(loadResult)
      if (!loadResult.space) {
        throw new Error(
          `Failed to load bundled space '${id}': ${
            loadResult.issues[0]?.message ?? 'no space.yaml or fatal schema error'
          }`,
        )
      }
      set({
        // No handle — bundled spaces are in-memory. The picker still
        // remains the path for switching to a real folder.
        root: null,
        detectedSpaces: [],
        changes: [],
        activeChangeId: null,
        current: {
          id,
          handle: null,
          fs: null,
          space: loadResult.space,
          issues: validation.issues,
          files: loadResult.files,
          passes: validation.passes,
          counts: computeCounts(loadResult.space, loadResult.files.size),
          loadedAt: Date.now(),
          readOnly: true,
          source: 'bundled',
          changeId: null,
        },
        undoStack: emptyStack(),
        saveStatus: new Map(),
        loading: false,
      })
      void saveLastSpaceId(id)
    } catch (err) {
      set({ loading: false, error: formatError(err) })
    }
  },

  async loadBundledDemo() {
    if (!hasBundledDemo()) {
      set({ error: 'No bundled demo was shipped with this build.' })
      return
    }
    await get().loadBundledSpace(BUNDLED_DEMO_ID)
  },

  async loadSpace(id) {
    set({ loading: true, error: null })
    stopWatcher()
    try {
      const store = get()
      const target = store.detectedSpaces.find((s) => s.id === id)
      if (!target) throw new Error(`Space '${id}' is not in the detected list.`)
      const baseFs = target.fs ?? (target.handle ? browserFileSystem(target.handle) : null)
      if (!baseFs) throw new Error(`Space '${id}' has no filesystem handle.`)

      const listedChanges = await listChangeSets(baseFs)
      const changes = listedChanges.map(({ change }) => ({
        id: change.id,
        title: change.title,
        status: change.status,
      }))

      let fs: FileSystem = baseFs
      let activeChangeId = store.activeChangeId
      if (activeChangeId) {
        const changeResult = await readChangeSet(baseFs, activeChangeId)
        if (!changeResult.change) {
          activeChangeId = null
        } else {
          fs = changeSetOverlayFileSystem(baseFs, changeResult.change)
        }
      }

      const loadResult = await loadSpace(fs, '.', id)
      const validation = validate(loadResult)
      if (!loadResult.space) {
        throw new Error(
          `Failed to load space '${id}': ${
            loadResult.issues[0]?.message ?? 'no space.yaml or fatal schema error'
          }`,
        )
      }
      const mtimes = new Map<string, number>()
      for (const [path] of loadResult.files) {
        const mt = await fs.mtime(path)
        if (mt !== null) mtimes.set(path, mt)
      }
      set({
        current: {
          id,
          handle: target.handle,
          fs,
          space: loadResult.space,
          issues: validation.issues,
          files: loadResult.files,
          passes: validation.passes,
          counts: computeCounts(loadResult.space, loadResult.files.size),
          loadedAt: Date.now(),
          readOnly: false,
          source: target.source,
          changeId: activeChangeId,
        },
        changes,
        activeChangeId,
        undoStack: emptyStack(),
        saveStatus: new Map(),
        loading: false,
      })
      startWatcher(fs, mtimes)
      void saveLastSpaceId(id)
    } catch (err) {
      set({ loading: false, error: formatError(err) })
    }
  },

  clearCurrent() {
    stopWatcher()
    set({ current: null, activeChangeId: null, undoStack: emptyStack(), saveStatus: new Map() })
    void saveLastSpaceId(null)
  },

  setError(message) {
    set({ error: message })
  },

  toggleSidebarPin() {
    const next = get().sidebarMode === 'pinned' ? 'auto' : 'pinned'
    saveSidebarMode(next)
    set({ sidebarMode: next, sidebarCollapsed: false })
  },

  toggleSidebar() {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
  },

  toggleInspector() {
    set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed }))
  },

  toggleNode(id) {
    const next = new Set(get().expandedNodes)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ expandedNodes: next })
  },

  setNodeExpanded(id, expanded) {
    const current = get().expandedNodes
    if (expanded === current.has(id)) return
    const next = new Set(current)
    if (expanded) next.add(id)
    else next.delete(id)
    set({ expandedNodes: next })
  },

  setSelectedGraphRef(ref) {
    if (ref === get().selectedGraphRef) return
    set({ selectedGraphRef: ref })
  },

  setInspectorTab(tab) {
    if (tab === get().inspectorTab) return
    set({ inspectorTab: tab })
    if (get().inspectorCollapsed) set({ inspectorCollapsed: false })
  },

  setPaletteOpen(open) {
    if (open === get().paletteOpen) return
    set({ paletteOpen: open })
  },

  setHelpOpen(open) {
    if (open === get().helpOpen) return
    set({ helpOpen: open })
  },

  setIssuesOpen(open) {
    if (open === get().issuesOpen) return
    set({ issuesOpen: open })
  },

  setTheme(theme) {
    if (theme === get().theme) return
    applyThemeToDom(theme)
    set({ theme })
  },

  toggleTheme() {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyThemeToDom(next)
    set({ theme: next })
  },

  async reloadCurrentSpace() {
    const state = get()
    if (!state.current) return
    if (state.current.readOnly || !state.current.fs) {
      await state.loadBundledDemo()
      toast('Demo reloaded.', { duration: 1200 })
      return
    }
    await state.loadSpace(state.current.id)
    toast('Reloaded from disk.', { duration: 1200 })
  },

  async setActiveChangeId(id) {
    if (id === get().activeChangeId) return
    set({ activeChangeId: id })
    const current = get().current
    if (!current) return
    await get().loadSpace(current.id)
  },

  revalidate() {
    const state = get()
    if (!state.current) return
    // Cheap: re-run validate() against the already-loaded files. Issues
    // update live but `space` itself doesn't change, so no snapshot.
    const result = validate({
      space: state.current.space,
      files: state.current.files,
      issues: [],
    })
    set({
      current: {
        ...state.current,
        issues: result.issues,
        passes: result.passes,
      },
    })
    toast('Space re-validated.', { duration: 1200 })
  },

  async exportSpaceToDisk() {
    const state = get()
    if (!state.current) return null
    if (state.current.readOnly || !state.current.fs) {
      toast('Bundled demo is read-only', {
        description: 'Pick a local folder to export.',
        duration: 2000,
      })
      return null
    }
    const content = exportSpaceForAi(state.current.space, { issues: state.current.issues })
    const fs = state.current.fs
    const stamp = filenameTimestamp()
    const path = `exports/${stamp}-${state.current.id}.md`
    try {
      await fs.writeFile(path, content)
      const newMtime = (await fs.mtime(path)) ?? Date.now()
      watcherHandle?.markOwnWrite(path, newMtime)
      try {
        await navigator.clipboard.writeText(content)
      } catch {
        // Clipboard may be blocked (focus, permissions) — the toast will
        // still point at the saved file below.
      }
      toast('Export for AI written', {
        description: path,
        duration: 4000,
      })
      return { path, content }
    } catch (err) {
      toast.error('Export failed', { description: formatError(err) })
      return null
    }
  },

  async downloadSpaceZip() {
    const state = get()
    if (!state.current) return
    if (state.current.readOnly || !state.current.fs) {
      toast('Bundled demo is read-only', {
        description: 'Pick a local folder to ZIP.',
        duration: 2000,
      })
      return
    }
    try {
      const fs = state.current.fs
      const paths = [...state.current.files.keys()]
      await downloadSpaceAsZip(fs, state.current.id, paths)
      toast('ZIP download started.', { duration: 1500 })
    } catch (err) {
      toast.error('ZIP export failed', { description: formatError(err) })
    }
  },

  async saveEntityFile(path, updatedData) {
    const { stringify: yamlStringify } = await import('yaml')
    const state = get()
    if (!state.current) return
    if (state.current.readOnly || !state.current.fs) {
      toast('Bundled demo is read-only', {
        description: 'Pick a local folder to edit YAML.',
        duration: 2200,
      })
      return
    }
    const current = state.current
    const prior = current.files.get(path)
    if (!prior) throw new Error(`Unknown file path: ${path}`)

    const newSource = yamlStringify(updatedData, { lineWidth: 0 })

    // Snapshot BEFORE mutation (for undo).
    const snapshot: Snapshot = {
      space: cloneSpace(current.space),
      sourceByPath: sourceMapFromFiles(current.files),
      at: Date.now(),
    }

    setSaveStatus(set, get, path, 'saving')
    const fs = current.fs
    if (!fs) return
    try {
      await fs.writeFile(path, newSource)
      const newMtime = (await fs.mtime(path)) ?? Date.now()
      watcherHandle?.markOwnWrite(path, newMtime)

      // Re-parse the whole space so validation stays honest — cheap for
      // ~60 files and keeps the undo/redo invariant simple.
      const reload = await loadSpace(fs, '.', current.id)
      const revalidation = validate(reload)

      set((s) => ({
        undoStack: pushPast(s.undoStack, snapshot),
        current:
          reload.space !== null
            ? {
                ...current,
                space: reload.space,
                issues: revalidation.issues,
                files: reload.files,
                passes: revalidation.passes,
                counts: computeCounts(reload.space, reload.files.size),
                loadedAt: Date.now(),
                readOnly: false,
              }
            : current,
      }))

      // Refresh mtimes in the watcher.
      for (const [p] of reload.files) {
        const mt = await fs.mtime(p)
        if (mt !== null) watcherHandle?.markOwnWrite(p, mt)
      }

      setSaveStatus(set, get, path, 'saved')
      window.setTimeout(() => setSaveStatus(set, get, path, 'idle'), 1500)
    } catch (err) {
      setSaveStatus(set, get, path, 'error')
      toast.error('Save failed', { description: formatError(err) })
      throw err
    }
  },

  async undo() {
    const state = get()
    if (!state.current) return
    const currentSnapshot: Snapshot = {
      space: cloneSpace(state.current.space),
      sourceByPath: sourceMapFromFiles(state.current.files),
      at: Date.now(),
    }
    const result = undoStack(state.undoStack, currentSnapshot)
    if (!result) return
    await applySnapshot(set, get, result.snapshot)
    set({ undoStack: result.stack })
    toast('Undone', { duration: 800 })
  },

  async redo() {
    const state = get()
    if (!state.current) return
    const currentSnapshot: Snapshot = {
      space: cloneSpace(state.current.space),
      sourceByPath: sourceMapFromFiles(state.current.files),
      at: Date.now(),
    }
    const result = redoStack(state.undoStack, currentSnapshot)
    if (!result) return
    await applySnapshot(set, get, result.snapshot)
    set({ undoStack: result.stack })
    toast('Redone', { duration: 800 })
  },

  canUndo() {
    return get().undoStack.past.length > 0
  },

  canRedo() {
    return get().undoStack.future.length > 0
  },
}))

/** Write snapshot's sources back to disk + reload the space. */
async function applySnapshot(
  set: (
    update: Partial<{ current: CurrentSpace | null; saveStatus: Map<string, SaveStatus> }>,
  ) => void,
  get: () => ReturnType<typeof useSpaceStore.getState>,
  snapshot: Snapshot,
): Promise<void> {
  const state = get()
  if (!state.current) return
  if (state.current.readOnly || !state.current.fs) {
    // Undo/redo on the bundled demo can't write to disk. We could still
    // re-point in-memory state, but that'd desync with the displayed bundle.
    // Punt: tell the user and stop.
    toast('Bundled demo: undo/redo is disabled (read-only)', { duration: 1800 })
    return
  }
  const fs = state.current.fs

  // Write every path whose source differs from what's on disk (via the current
  // in-memory source). The in-memory source lags-behind the target source
  // after an edit, so we write every file the snapshot carries.
  for (const [path, source] of snapshot.sourceByPath) {
    const prior = state.current.files.get(path)
    if (prior?.source === source) continue
    try {
      await fs.writeFile(path, source)
      const mt = await fs.mtime(path)
      if (mt !== null) watcherHandle?.markOwnWrite(path, mt)
    } catch (err) {
      toast.error(`Failed to restore ${path}`, { description: formatError(err) })
    }
  }

  const reload = await loadSpace(fs, '.', state.current.id)
  const revalidation = validate(reload)
  if (!reload.space) return

  set({
    current: {
      ...state.current,
      space: reload.space,
      issues: revalidation.issues,
      files: reload.files,
      passes: revalidation.passes,
      counts: computeCounts(reload.space, reload.files.size),
      loadedAt: Date.now(),
      readOnly: false,
    },
  })
}

function sourceMapFromFiles(files: Map<string, LoadedFile>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [path, file] of files) out.set(path, file.source)
  return out
}

function setSaveStatus(
  set: (update: Partial<{ saveStatus: Map<string, SaveStatus> }>) => void,
  get: () => ReturnType<typeof useSpaceStore.getState>,
  path: string,
  status: SaveStatus,
): void {
  const next = new Map(get().saveStatus)
  if (status === 'idle') next.delete(path)
  else next.set(path, status)
  set({ saveStatus: next })
}

function startWatcher(fs: FileSystem, initial: Map<string, number>): void {
  stopWatcher()
  watcherHandle = startFileWatcher(fs, initial, {
    intervalMs: 2000,
    onChange: async ({ path, source, mtime }) => {
      const state = useSpaceStore.getState()
      if (!state.current) return
      // External change → reload the whole space for consistency, and wipe
      // the redo stack so a stale future can't be re-applied over it.
      const reload = await loadSpace(fs, '.', state.current.id)
      const revalidation = validate(reload)
      if (!reload.space) {
        toast.error(`Failed to reload ${path}`)
        return
      }
      useSpaceStore.setState((s) => ({
        current:
          s.current && reload.space
            ? {
                ...s.current,
                space: reload.space,
                issues: revalidation.issues,
                files: reload.files,
                passes: revalidation.passes,
                counts: computeCounts(reload.space, reload.files.size),
                loadedAt: Date.now(),
                readOnly: false,
              }
            : s.current,
        undoStack: clearRedo(s.undoStack),
      }))
      // Update watcher mtime cache for every path.
      for (const [p] of reload.files) {
        const mt = await fs.mtime(p)
        if (mt !== null) watcherHandle?.markOwnWrite(p, mt)
      }
      toast(`${path} changed on disk, reloaded.`, { duration: 2000 })
      // Touch the mtime+source vars so TypeScript doesn't flag them as unused
      // (we may log them in a future revision).
      void source
      void mtime
    },
  })
}

function stopWatcher(): void {
  watcherHandle?.stop()
  watcherHandle = null
}

async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const pick = (
    window as unknown as {
      showDirectoryPicker: (options?: {
        id?: string
        mode?: 'read' | 'readwrite'
      }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker
  return await pick({ id: 'pizza-doc-spaces', mode: 'readwrite' })
}

async function detectSpaces(root: FileSystemDirectoryHandle): Promise<DetectedSpace[]> {
  const out: DetectedSpace[] = []
  // If the picked directory is itself a space (has a `space.yaml`), treat it
  // as the single detected entry. Saves users from having to remember whether
  // they should pick the space or its parent — both work.
  if (await hasFile(root, 'space.yaml')) {
    out.push({ id: await deriveSpaceId(root), handle: root, fs: null, source: 'browser' })
    return out
  }
  // `.values()` explicitly — `root[@@asyncIterator]` defaults to `.entries()`
  // which yields `[name, handle]` tuples, silently breaking `.kind` checks.
  const iter = (root as unknown as { values(): AsyncIterableIterator<FileSystemHandle> }).values()
  for await (const entry of iter) {
    if (entry.kind !== 'directory') continue
    const dir = entry as FileSystemDirectoryHandle
    if (await hasFile(dir, 'space.yaml')) {
      out.push({ id: await deriveSpaceId(dir), handle: dir, fs: null, source: 'browser' })
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

/**
 * Pick a usable space id for a directory we know contains a `space.yaml`.
 *
 * For multi-space layouts (`spaces/<id>/`) the folder basename IS the id —
 * it has to match `meta.id` per the validator's filename↔id rule, and
 * shows up in URLs and the breadcrumb fine.
 *
 * For the single-space `.pizza-doc/` layout the folder name is a magic
 * marker, not the id. We read `meta.id` from `space.yaml` and use that
 * instead — otherwise the URL becomes `/space/.pizza-doc` (leading dot,
 * router-hostile) and the validator complains that the folder name and
 * meta.id disagree.
 */
async function deriveSpaceId(dir: FileSystemDirectoryHandle): Promise<string> {
  if (dir.name !== '.pizza-doc') return dir.name
  try {
    const fh = await dir.getFileHandle('space.yaml')
    const file = await fh.getFile()
    const text = await file.text()
    // Tiny YAML peek — we only need `meta.id`, not full parsing. The full
    // loader runs later and does the strict validation.
    const match = text.match(/^\s*id:\s*([A-Za-z][A-Za-z0-9_-]*)\s*$/m)
    if (match?.[1]) return match[1]
  } catch {
    // fall through to folder name
  }
  return dir.name
}

async function hasFile(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch {
    return false
  }
}

function computeCounts(space: Space, files: number): SpaceCounts {
  let components = 0
  let methods = 0
  let models = 0
  let tables = 0
  for (const mod of space.modules) {
    components += mod.components.length
    models += mod.models.length
    tables += mod.tables.length
    for (const c of mod.components) methods += c.methods.length
    for (const d of mod.domains) {
      components += d.components.length
      models += d.models.length
      tables += d.tables.length
      for (const c of d.components) methods += c.methods.length
    }
  }
  return {
    files,
    modules: space.modules.length,
    actors: space.actors.length,
    components,
    methods,
    models,
    tables,
    useCases: space.useCases.length,
    entities:
      space.modules.length +
      space.actors.length +
      components +
      models +
      tables +
      space.useCases.length,
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))
}

const SIDEBAR_MODE_KEY = 'pizza-doc.sidebarMode'

function loadSidebarMode(): 'pinned' | 'auto' {
  if (typeof window === 'undefined') return 'pinned'
  try {
    const v = window.localStorage.getItem(SIDEBAR_MODE_KEY)
    if (v === 'auto') return 'auto'
    return 'pinned'
  } catch {
    return 'pinned'
  }
}

function saveSidebarMode(mode: 'pinned' | 'auto'): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SIDEBAR_MODE_KEY, mode)
  } catch {
    // Ignore quota / disabled storage — falls back to in-memory state.
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** Filesystem-safe timestamp for export filenames — YYYYMMDD-HHMMSS. */
function filenameTimestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// Silence unused-binding warnings; re-export the yaml parseDocument shim for
// code that might want to spot-mutate later.
void parseDocument
