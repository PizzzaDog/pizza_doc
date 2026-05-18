import type { Domain } from '@pizza-doc/core'
import { z } from 'zod'
import { FormField, NestedReadonly, TextArea, TextField } from './common'
import { useAutosaveForm } from './use-autosave-form'

const DomainEditSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

type DomainEditValues = z.infer<typeof DomainEditSchema>

export function DomainForm({
  domain,
  resetKey,
  save,
}: {
  domain: Domain
  resetKey: string
  save: (next: Domain) => Promise<void>
}) {
  const { form, registerBlur } = useAutosaveForm(
    DomainEditSchema,
    {
      name: domain.name,
      description: domain.description ?? '',
    },
    resetKey,
    async (values: DomainEditValues) => {
      const merged: Domain = {
        ...domain,
        name: values.name,
        description: values.description || '',
      }
      await save(merged)
    },
  )

  const errors = form.formState.errors
  const childCount = domain.components.length + domain.models.length + domain.tables.length

  return (
    <div className="flex flex-col gap-3">
      <FormField id="domain-name" label="name" error={errors.name}>
        <TextField id="domain-name" {...registerBlur('name')} invalid={Boolean(errors.name)} />
      </FormField>

      <FormField id="domain-description" label="description" error={errors.description}>
        <TextArea
          id="domain-description"
          {...registerBlur('description')}
          invalid={Boolean(errors.description)}
        />
      </FormField>

      <NestedReadonly label="contents" count={childCount} />
    </div>
  )
}
