import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { type DefaultValues, type FieldValues, type Path, useForm } from 'react-hook-form'
import type { z } from 'zod'

/**
 * Shared hook that powers every entity edit form.
 *
 *   - `schema` — Zod schema covering the editable scalar fields
 *   - `defaults` — computed from the current entity; re-initialises the
 *     form when the caller's `resetKey` changes (selected entity switched)
 *   - `save(values)` — receives the validated form values; caller merges
 *     with the untouched fields and writes via the store
 *
 * Returns a `registerBlur` helper — use it instead of `register(name)` so
 * the field triggers autosave on blur only when the value changed AND the
 * form is currently valid.
 */
export function useAutosaveForm<TSchema extends z.ZodType<FieldValues, z.ZodTypeDef, FieldValues>>(
  schema: TSchema,
  defaults: DefaultValues<z.infer<TSchema>>,
  resetKey: string,
  save: (values: z.infer<TSchema>) => Promise<void> | void,
) {
  type Values = z.infer<TSchema>
  const form = useForm<Values>({
    // zodResolver's type bound expects the internal ZodType shape that
    // includes ~standard/~validate methods. Runtime behaviour is
    // unchanged — react-hook-form hands the values to the resolver which
    // passes them straight to Zod.
    // biome-ignore lint/suspicious/noExplicitAny: zodResolver generic mismatch; see above.
    resolver: zodResolver(schema as unknown as any) as never,
    defaultValues: defaults,
    mode: 'onBlur',
  })

  // Re-initialise when the caller's reset key changes (selected entity).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `defaults` is a fresh object every render; `resetKey` is the selection identity.
  React.useEffect(() => {
    form.reset(defaults)
  }, [resetKey])

  async function commitField(field: Path<Values>): Promise<void> {
    const ok = await form.trigger(field)
    if (!ok) return
    const dirtyFields = form.formState.dirtyFields as Record<string, unknown>
    if (!dirtyFields[field as string]) return
    await save(form.getValues())
    // Keep current values but clear the dirty flag so we don't re-save
    // the same thing on a second blur.
    form.reset(form.getValues(), {
      keepValues: true,
      keepDirty: false,
      keepErrors: true,
      keepIsSubmitted: false,
      keepTouched: true,
      keepIsValid: true,
      keepSubmitCount: true,
    })
  }

  function registerBlur(field: Path<Values>) {
    const reg = form.register(field)
    return {
      ...reg,
      onBlur: async (event: React.FocusEvent) => {
        await reg.onBlur(event)
        await commitField(field)
      },
    }
  }

  return { form, registerBlur, commitField }
}
