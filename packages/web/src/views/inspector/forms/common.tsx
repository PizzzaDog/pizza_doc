import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import * as React from 'react'
import type { FieldError } from 'react-hook-form'

/**
 * Shared form-field wrapper used by every entity form. Shows label + input
 * + inline error. The input is controlled via react-hook-form's register
 * plus an onBlur that the parent form uses to autosave.
 */
export interface FormFieldProps {
  id: string
  label: string
  hint?: string | undefined
  error?: FieldError | undefined
  children: React.ReactNode
}

export function FormField({ id, label, hint, error, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[10px] font-mono uppercase tracking-wide text-fg-tertiary"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-meta text-error" role="alert">
          {error.message ?? 'Invalid value.'}
        </p>
      ) : hint ? (
        <p className="text-meta text-fg-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * Text input with the page-11 sizing inherited from shadcn's Input.
 */
export const TextField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ invalid, className, ...props }, ref) => (
  <Input
    ref={ref}
    className={cn(invalid && 'border-error focus-visible:!ring-[color:var(--error)]', className)}
    {...props}
  />
))
TextField.displayName = 'TextField'

/**
 * Multi-line text for descriptions. Keeps the page-11 h-min-ish sizing.
 */
export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ invalid, className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-ui text-fg-primary placeholder:text-fg-tertiary',
      'transition-shadow duration-120 ease-standard',
      'focus-visible:outline-none focus-visible:ring-focus focus-visible:border-transparent',
      'disabled:cursor-not-allowed disabled:opacity-50',
      invalid && 'border-error',
      className,
    )}
    {...props}
  />
))
TextArea.displayName = 'TextArea'

/**
 * Simple styled <select> for enum fields (kept native so keyboard nav works
 * without extra ARIA plumbing).
 */
export const SelectField = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ invalid, className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-8 w-full rounded-md border border-border bg-bg-secondary px-3 text-ui text-fg-primary',
      'transition-shadow duration-120 ease-standard',
      'focus-visible:outline-none focus-visible:ring-focus focus-visible:border-transparent',
      'disabled:cursor-not-allowed disabled:opacity-50',
      invalid && 'border-error',
      className,
    )}
    {...props}
  >
    {children}
  </select>
))
SelectField.displayName = 'SelectField'

/**
 * Read-only section wrapper shown inside the Edit tab for nested fields
 * (methods / fields / columns / steps / dataFlow).
 */
export function NestedReadonly({
  label,
  count,
  hint,
}: {
  label: string
  count: number
  hint?: string
}) {
  return (
    <div className="rounded-md border border-dashed border-border-subtle bg-bg-secondary/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
          {label}
        </span>
        <span className="font-mono text-meta text-fg-secondary">{count} items</span>
      </div>
      <p className="mt-0.5 text-meta text-fg-tertiary">
        {hint ??
          'Nested editing is not wired in the app yet. Edit the YAML file on disk and reload.'}
      </p>
    </div>
  )
}
