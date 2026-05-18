import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSpaceStore } from '@/store/space'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const theme = useSpaceStore((s) => s.theme)
  const toggle = useSpaceStore((s) => s.toggleTheme)
  const isDark = theme === 'dark'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          onClick={toggle}
          variant="ghost-subtle"
          size="icon"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDark ? (
            <Moon className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <Sun className="h-4 w-4" strokeWidth={1.5} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isDark ? 'Dark theme' : 'Light theme'}</TooltipContent>
    </Tooltip>
  )
}
