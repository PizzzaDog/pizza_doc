import { cn } from '@/lib/utils'
import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'

// Page 11: h-5 (not h-6); mono + uppercase for type badges.
const badgeVariants = cva(
  'inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-mono uppercase tracking-wide',
  {
    variants: {
      variant: {
        default: 'border-border bg-bg-tertiary text-fg-secondary',
        accent: 'border-transparent bg-accent-muted text-accent',
        success: 'border-transparent bg-success/10 text-success',
        warning: 'border-transparent bg-warning/10 text-warning',
        error: 'border-transparent bg-error/10 text-error',
        ghost: 'border-transparent text-fg-tertiary',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
