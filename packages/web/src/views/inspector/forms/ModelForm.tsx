import type { Model } from '@pizza-doc/core'
import { z } from 'zod'
import { FormField, NestedReadonly, SelectField, TextArea, TextField } from './common'
import { useAutosaveForm } from './use-autosave-form'

const RefPattern = /^(module|usecase|actor):[a-zA-Z0-9_\-/:]+$/

const ModelEditSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  modelKind: z.enum(['dto', 'entity', 'value-object', 'event', 'enum']),
  description: z.string().optional(),
  persistedAs: z
    .string()
    .optional()
    .refine((v: string | undefined) => !v || RefPattern.test(v), {
      message: "Must be a ref like 'module:db/domain:users/table:users' or empty.",
    }),
})

type ModelEditValues = z.infer<typeof ModelEditSchema>

export function ModelForm({
  model,
  resetKey,
  save,
}: {
  model: Model
  resetKey: string
  save: (next: Model) => Promise<void>
}) {
  const { form, registerBlur } = useAutosaveForm(
    ModelEditSchema,
    {
      name: model.name,
      modelKind: model.modelKind,
      description: model.description ?? '',
      persistedAs: model.persistedAs ?? '',
    },
    resetKey,
    async (values: ModelEditValues) => {
      const merged: Model = {
        ...model,
        name: values.name,
        modelKind: values.modelKind,
        description: values.description || '',
        persistedAs: values.persistedAs || '',
      }
      await save(merged)
    },
  )

  const errors = form.formState.errors

  return (
    <div className="flex flex-col gap-3">
      <FormField id="model-name" label="name" error={errors.name}>
        <TextField id="model-name" {...registerBlur('name')} invalid={Boolean(errors.name)} />
      </FormField>

      <FormField id="model-kind" label="modelKind" error={errors.modelKind}>
        <SelectField
          id="model-kind"
          {...registerBlur('modelKind')}
          invalid={Boolean(errors.modelKind)}
        >
          <option value="dto">dto</option>
          <option value="entity">entity</option>
          <option value="value-object">value-object</option>
          <option value="event">event</option>
        </SelectField>
      </FormField>

      <FormField
        id="model-persisted-as"
        label="persistedAs"
        error={errors.persistedAs}
        hint="Ref of the backing table, or empty."
      >
        <TextField
          id="model-persisted-as"
          {...registerBlur('persistedAs')}
          invalid={Boolean(errors.persistedAs)}
          placeholder="module:db/domain:users/table:users"
        />
      </FormField>

      <FormField id="model-description" label="description" error={errors.description}>
        <TextArea
          id="model-description"
          {...registerBlur('description')}
          invalid={Boolean(errors.description)}
        />
      </FormField>

      <NestedReadonly label="fields" count={model.fields.length} />
    </div>
  )
}
