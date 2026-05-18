import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { hasBundledSpace } from '@/fs/bundled-spaces'
import { cn } from '@/lib/utils'
import { useSpaceStore } from '@/store/space'
import { HelpModal } from '@/views/chrome/HelpModal'
import { TopBar } from '@/views/chrome/TopBar'
import { Inspector } from '@/views/inspector/Inspector'
import { CommandPalette } from '@/views/palette/CommandPalette'
import { Sidebar } from '@/views/sidebar/Sidebar'
import { Outlet, useParams } from '@tanstack/react-router'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImperativePanelHandle } from 'react-resizable-panels'
import { toast } from 'sonner'

/**
 * Layout shell shared by every `/space/$spaceId/*` route. Top bar (chrome +
 * breadcrumbs) sits above a three-column panel group: sidebar (⌘+B), outlet,
 * inspector (⌘+I). Panel state is driven by Zustand so drag + keyboard toggle
 * stay in sync. All global shortcuts — page 06's keyboard map — are wired
 * here so they're active throughout any space route.
 */
export function SpaceLayout() {
  const { spaceId } = useParams({ from: '/space/$spaceId' })
  const detected = useSpaceStore((s) => s.detectedSpaces)
  const current = useSpaceStore((s) => s.current)
  const loading = useSpaceStore((s) => s.loading)
  const loadSpace = useSpaceStore((s) => s.loadSpace)
  const loadBundledSpace = useSpaceStore((s) => s.loadBundledSpace)
  const sidebarCollapsed = useSpaceStore((s) => s.sidebarCollapsed)
  const inspectorCollapsed = useSpaceStore((s) => s.inspectorCollapsed)
  const toggleSidebarPin = useSpaceStore((s) => s.toggleSidebarPin)
  const toggleInspector = useSpaceStore((s) => s.toggleInspector)
  const undo = useSpaceStore((s) => s.undo)
  const redo = useSpaceStore((s) => s.redo)
  const setPaletteOpen = useSpaceStore((s) => s.setPaletteOpen)
  const setHelpOpen = useSpaceStore((s) => s.setHelpOpen)
  const setInspectorTab = useSpaceStore((s) => s.setInspectorTab)
  const setSelectedGraphRef = useSpaceStore((s) => s.setSelectedGraphRef)

  // Load when URL requests a space we haven't loaded yet. Picked folders
  // (in `detected`) win over bundled spaces if both exist under the same id
  // — the user picked that folder explicitly, so their version is canonical.
  useEffect(() => {
    if (current?.id === spaceId) return
    if (loading) return
    if (detected.some((s) => s.id === spaceId)) void loadSpace(spaceId)
    else if (hasBundledSpace(spaceId)) void loadBundledSpace(spaceId)
  }, [current?.id, loading, detected, loadSpace, loadBundledSpace, spaceId])

  // Global shortcuts (page 06):
  //   ⌘+K  command palette    ⌘+B  sidebar       ⌘+I  inspector
  //   ⌘+E  inspector edit     ⌘+/  inspector yaml
  //   ⌘+S  no-op + toast       ⌘+Z  undo / ⌘+⇧+Z  redo
  //   ?    help modal          Esc  close overlay / clear canvas selection
  // Events originating from editable elements skip chrome shortcuts (Monaco
  // handles its own ⌘+S etc.).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const editable = target ? isEditable(target) : false

      if (event.key === 'Escape') {
        // Esc stays active even inside editable areas so it can dismiss
        // selection — but dialogs and inputs will still get the event first.
        setSelectedGraphRef(null)
        return
      }

      if (editable) return

      // `?` — single-key, no modifiers (Shift+/ on US layouts is fine too).
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        setHelpOpen(true)
        return
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) return

      if (!event.shiftKey && event.key === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (!event.shiftKey && event.key === 'b') {
        event.preventDefault()
        // ⌘B now toggles the pin — since auto-mode collapses the sidebar
        // off-screen, "show/hide" is the same as "pin/unpin".
        toggleSidebarPin()
        return
      }
      if (!event.shiftKey && event.key === 'i') {
        event.preventDefault()
        toggleInspector()
        return
      }
      if (!event.shiftKey && event.key === 'e') {
        event.preventDefault()
        setInspectorTab('edit')
        return
      }
      if (!event.shiftKey && event.key === '/') {
        event.preventDefault()
        setInspectorTab('yaml')
        return
      }
      if (!event.shiftKey && event.key === 's') {
        event.preventDefault()
        toast('Pizza Doc saves automatically.', { duration: 1400 })
        return
      }
      if (!event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault()
        void undo()
        return
      }
      if (event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault()
        void redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    toggleSidebarPin,
    toggleInspector,
    undo,
    redo,
    setPaletteOpen,
    setHelpOpen,
    setInspectorTab,
    setSelectedGraphRef,
  ])

  const sidebarPanelRef = useRef<ImperativePanelHandle>(null)
  const inspectorPanelRef = useRef<ImperativePanelHandle>(null)

  useEffect(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    if (sidebarCollapsed && !panel.isCollapsed()) panel.collapse()
    else if (!sidebarCollapsed && panel.isCollapsed()) panel.expand()
  }, [sidebarCollapsed])

  useEffect(() => {
    const panel = inspectorPanelRef.current
    if (!panel) return
    if (inspectorCollapsed && !panel.isCollapsed()) panel.collapse()
    else if (!inspectorCollapsed && panel.isCollapsed()) panel.expand()
  }, [inspectorCollapsed])

  const sidebarMode = useSpaceStore((s) => s.sidebarMode)
  const pinned = sidebarMode === 'pinned'

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg-primary">
      <TopBar spaceId={spaceId} />
      <div className="relative min-h-0 flex-1 overflow-hidden bg-bg-primary">
        {pinned ? (
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="pizza-doc-layout"
            className="border-t border-white/[0.02]"
          >
            <ResizablePanel
              ref={sidebarPanelRef}
              defaultSize={20}
              minSize={14}
              maxSize={34}
              collapsible
              collapsedSize={0}
              onCollapse={() => useSpaceStore.setState({ sidebarCollapsed: true })}
              onExpand={() => useSpaceStore.setState({ sidebarCollapsed: false })}
              className="min-w-0 bg-bg-secondary/80"
            >
              <Sidebar spaceId={spaceId} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={56} className="min-w-0">
              <Outlet />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              ref={inspectorPanelRef}
              defaultSize={24}
              minSize={16}
              maxSize={40}
              collapsible
              collapsedSize={0}
              onCollapse={() => useSpaceStore.setState({ inspectorCollapsed: true })}
              onExpand={() => useSpaceStore.setState({ inspectorCollapsed: false })}
              className="min-w-0 bg-bg-secondary/80"
            >
              <Inspector />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <>
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="pizza-doc-layout-auto"
              key="auto"
              className="border-t border-white/[0.02]"
            >
              <ResizablePanel defaultSize={76} className="min-w-0">
                <Outlet />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel
                ref={inspectorPanelRef}
                defaultSize={24}
                minSize={16}
                maxSize={40}
                collapsible
                collapsedSize={0}
                onCollapse={() => useSpaceStore.setState({ inspectorCollapsed: true })}
                onExpand={() => useSpaceStore.setState({ inspectorCollapsed: false })}
                className="min-w-0 bg-bg-secondary/80"
              >
                <Inspector />
              </ResizablePanel>
            </ResizablePanelGroup>

            <FloatingSidebar spaceId={spaceId} />
          </>
        )}

        <InspectorToggle collapsed={inspectorCollapsed} onToggle={toggleInspector} />
      </div>
      <HelpModal />
      <CommandPalette spaceId={spaceId} />
    </div>
  )
}

/**
 * Floating button at the bottom-right that collapses / expands the inspector.
 * Fixed to the viewport corner — always reachable, regardless of inspector
 * width or mode. Icon direction mirrors the action ("panel-right-close"
 * means "click to close").
 */
function InspectorToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={!collapsed}
          aria-label={collapsed ? 'Show inspector' : 'Hide inspector'}
          className="absolute bottom-4 right-4 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-secondary/90 text-fg-secondary shadow-popover backdrop-blur-md transition-all duration-160 hover:border-accent/40 hover:bg-bg-tertiary hover:text-fg-primary"
        >
          {collapsed ? (
            <PanelRightOpen className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <PanelRightClose className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{collapsed ? 'Show inspector (⌘I)' : 'Hide inspector (⌘I)'}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Auto-hide sidebar: invisible 8px hot-zone at the viewport's left edge.
 * When the cursor crosses it the sidebar slides in as a floating overlay
 * (absolute, shadowed) — it doesn't reflow the canvas underneath.
 * Leaving the sidebar with the cursor schedules a 300ms hide so the user
 * can sweep past without losing it; re-entering cancels the close.
 */
function FloatingSidebar({ spaceId }: { spaceId: string }) {
  const [open, setOpen] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const cancelClose = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelClose()
    timeoutRef.current = window.setTimeout(() => setOpen(false), 300)
  }, [cancelClose])

  const openNow = useCallback(() => {
    cancelClose()
    setOpen(true)
  }, [cancelClose])

  useEffect(() => () => cancelClose(), [cancelClose])

  return (
    <>
      {/* 8px hover strip flush to the viewport's left edge. Transparent,
          pointer-events-only. */}
      <div className="absolute inset-y-0 left-0 z-20 w-2" onMouseEnter={openNow} aria-hidden />
      <aside
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        className={cn(
          'absolute inset-y-0 left-2 z-30 my-2 w-[270px] overflow-hidden rounded-xl border border-border bg-bg-secondary/95 shadow-popover backdrop-blur-xl transition-transform duration-160',
          open ? 'translate-x-0' : '-translate-x-full pointer-events-none',
        )}
        aria-hidden={!open}
      >
        <Sidebar spaceId={spaceId} />
      </aside>
    </>
  )
}

function isEditable(el: HTMLElement): boolean {
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  // Monaco renders a `<textarea class="inputarea">` inside a contenteditable
  // container — belt-and-braces check.
  return Boolean(el.closest('.monaco-editor'))
}
