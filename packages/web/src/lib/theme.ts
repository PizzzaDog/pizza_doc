export type Theme = 'dark' | 'light'

/**
 * Read the initial theme from the media query. Page 12 forbids localStorage
 * for MVP, so preference is NOT persisted — it resets to system on reload.
 * Sync the `<html>` class so CSS vars pick up the right palette before the
 * first React render.
 */
export function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  return prefersDark ? 'dark' : 'light'
}

export function applyThemeToDom(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme)
}
