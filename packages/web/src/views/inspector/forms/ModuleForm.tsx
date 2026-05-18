import type { Module } from '@pizza-doc/core'
import { z } from 'zod'
import { FormField, NestedReadonly, SelectField, TextArea, TextField } from './common'
import { useAutosaveForm } from './use-autosave-form'

const ModuleEditSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['frontend', 'service', 'database', 'queue', 'external']),
  techStack: z.string().optional(),
  description: z.string().optional(),
})

type ModuleEditValues = z.infer<typeof ModuleEditSchema>

export function ModuleForm({
  module: mod,
  resetKey,
  save,
}: {
  module: Module
  resetKey: string
  save: (next: Module) => Promise<void>
}) {
  const { form, registerBlur } = useAutosaveForm(
    ModuleEditSchema,
    {
      name: mod.name,
      type: mod.type,
      techStack: mod.techStack ?? '',
      description: mod.description ?? '',
    },
    resetKey,
    async (values: ModuleEditValues) => {
      const merged: Module = {
        ...mod,
        name: values.name,
        type: values.type,
        techStack: values.techStack || '',
        description: values.description || '',
      }
      await save(merged)
    },
  )

  const errors = form.formState.errors
  const childCount =
    mod.components.length + mod.models.length + mod.tables.length + mod.domains.length

  return (
    <div className="flex flex-col gap-3">
      <FormField id="module-name" label="name" error={errors.name}>
        <TextField id="module-name" {...registerBlur('name')} invalid={Boolean(errors.name)} />
      </FormField>

      <FormField id="module-type" label="type" error={errors.type}>
        <SelectField id="module-type" {...registerBlur('type')} invalid={Boolean(errors.type)}>
          <option value="frontend">frontend</option>
          <option value="service">service</option>
          <option value="database">database</option>
          <option value="queue">queue</option>
          <option value="external">external</option>
        </SelectField>
      </FormField>

      <FormField id="module-techstack" label="techStack" error={errors.techStack}>
        <TextField
          id="module-techstack"
          {...registerBlur('techStack')}
          invalid={Boolean(errors.techStack)}
          placeholder="e.g. React 19 + TypeScript"
        />
      </FormField>

      <FormField id="module-description" label="description" error={errors.description}>
        <TextArea
          id="module-description"
          {...registerBlur('description')}
          invalid={Boolean(errors.description)}
        />
      </FormField>

      <NestedReadonly label="contents" count={childCount} />
    </div>
  )
}
