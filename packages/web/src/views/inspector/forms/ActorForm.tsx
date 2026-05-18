import type { Actor } from '@pizza-doc/core'
import { z } from 'zod'
import { FormField, SelectField, TextArea, TextField } from './common'
import { useAutosaveForm } from './use-autosave-form'

const ActorEditSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['user', 'system', 'scheduler']),
  description: z.string().optional(),
})

type ActorEditValues = z.infer<typeof ActorEditSchema>

export function ActorForm({
  actor,
  resetKey,
  save,
}: {
  actor: Actor
  resetKey: string
  save: (next: Actor) => Promise<void>
}) {
  const { form, registerBlur } = useAutosaveForm(
    ActorEditSchema,
    {
      name: actor.name,
      type: actor.type,
      description: actor.description ?? '',
    },
    resetKey,
    async (values: ActorEditValues) => {
      const merged: Actor = {
        ...actor,
        name: values.name,
        type: values.type,
        description: values.description || '',
      }
      await save(merged)
    },
  )

  const errors = form.formState.errors

  return (
    <div className="flex flex-col gap-3">
      <FormField id="actor-name" label="name" error={errors.name}>
        <TextField id="actor-name" {...registerBlur('name')} invalid={Boolean(errors.name)} />
      </FormField>

      <FormField id="actor-type" label="type" error={errors.type}>
        <SelectField id="actor-type" {...registerBlur('type')} invalid={Boolean(errors.type)}>
          <option value="user">user</option>
          <option value="system">system</option>
          <option value="scheduler">scheduler</option>
        </SelectField>
      </FormField>

      <FormField id="actor-description" label="description" error={errors.description}>
        <TextArea
          id="actor-description"
          {...registerBlur('description')}
          invalid={Boolean(errors.description)}
          placeholder="Optional — who is this actor, what triggers them?"
        />
      </FormField>
    </div>
  )
}
