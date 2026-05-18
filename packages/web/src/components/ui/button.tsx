import { cn } from '@/lib/utils'
import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

// Page 11 overrides from default shadcn Button:
//   - base weight is 450 (Linear-like), not medium
//   - sm is tighter (h-7, px-2.5)
//   - `ghost-subtle` variant keeps layout stable on hover and only tints text/icon
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-transparent text-ui font-[450] transition-colors duration-120 ease-standard focus-visible:outline-none focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
        secondary: 'bg-bg-tertiary text-fg-primary hover:bg-bg-elevated',
        outline: 'border-border bg-transparent text-fg-primary hover:bg-bg-tertiary',
        ghost: 'text-fg-primary hover:bg-bg-tertiary',
        'ghost-subtle':
          'text-fg-secondary hover:text-fg-primary [&_svg]:text-fg-tertiary hover:[&_svg]:text-fg-primary',
        destructive: 'bg-error text-white hover:brightness-110',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2.5 text-[12px]',
        lg: 'h-9 px-4 text-content',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
