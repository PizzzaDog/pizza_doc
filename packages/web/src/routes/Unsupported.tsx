import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function Unsupported() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Browser not supported yet</CardTitle>
          <CardDescription>
            Pizza Doc v1 requires the File System Access API, which is only available in
            Chromium-based browsers (Chrome, Edge, Arc, Brave, Opera). The Tauri desktop wrapper —
            which will remove this constraint — is on the v0.2+ roadmap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-meta text-fg-tertiary">
            If you're in Chrome and still see this screen, you're probably in an incognito or
            restricted context where the API is disabled. Open the app in a normal window.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
