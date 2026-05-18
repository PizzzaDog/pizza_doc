import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { router } from '@/router'
import { useSpaceStore } from '@/store/space'
import { Outlet } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

/**
 * Top-level layout.
 *
 * This is also the single place we kick off session restore: on first mount we ask
 * the store to re-attach to the last-opened folder, and — only if the user
 * is still on `/` when the async restore resolves — forward them to the
 * space they were viewing last time. Checking the URL avoids the classic
 * race where the user has already clicked into another space by the time
 * the IDB read finishes.
 */
export function Root() {
  const restoreSession = useSpaceStore((s) => s.restoreSession)
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    void restoreSession().then((lastId) => {
      if (!lastId) return
      if (router.state.location.pathname !== '/') return
      void router.navigate({ to: '/space/$spaceId', params: { spaceId: lastId } })
    })
  }, [restoreSession])

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full w-full flex-col bg-bg-primary text-fg-primary">
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <Toaster />
      </div>
    </TooltipProvider>
  )
}
