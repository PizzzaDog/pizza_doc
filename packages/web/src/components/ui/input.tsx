import { cn } from '@/lib/utils'
import * as React from 'react'

// Page 11: h-8 (not h-10); focus uses inset ring, not a moving border.
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-8 w-full rounded-md border border-border bg-bg-secondary px-3 text-ui text-fg-primary placeholder:text-fg-tertiary',
      'transition-shadow duration-120 ease-standard',
      'focus-visible:outline-none focus-visible:ring-focus focus-visible:border-transparent',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'
