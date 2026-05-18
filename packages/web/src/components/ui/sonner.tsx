import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="font-sans"
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-bg-elevated text-fg-primary shadow-popover rounded-md',
          description: 'text-fg-secondary',
          actionButton: 'bg-accent text-accent-fg',
          cancelButton: 'bg-bg-tertiary text-fg-primary',
        },
      }}
      {...props}
    />
  )
}
