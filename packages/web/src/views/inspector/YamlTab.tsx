import { ScrollArea } from '@/components/ui/scroll-area'
import Editor from '@monaco-editor/react'
import { FileWarning } from 'lucide-react'

/**
 * Read-only YAML viewer via the @monaco-editor/react loader.
 */
export function YamlTab({ path, source }: { path: string | null; source: string | null }) {
  if (!path || source === null) {
    return (
      <div className="flex h-full items-center justify-center text-fg-tertiary">
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <FileWarning className="h-4 w-4" strokeWidth={1.5} />
          <p className="text-ui">No file attached to this entity.</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5">
        <span className="truncate font-mono text-meta text-fg-tertiary" title={path}>
          {path}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          theme="vs-dark"
          language="yaml"
          value={source}
          path={path}
          options={{
            readOnly: true,
            domReadOnly: true,
            fontSize: 12,
            minimap: { enabled: false },
            lineNumbersMinChars: 3,
            scrollBeyondLastLine: false,
            fontFamily: 'JetBrains Mono, Geist Mono, ui-monospace, monospace',
            renderLineHighlight: 'none',
            padding: { top: 8, bottom: 8 },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: { vertical: 'visible', horizontal: 'auto' },
          }}
        />
      </div>
    </div>
  )
}
