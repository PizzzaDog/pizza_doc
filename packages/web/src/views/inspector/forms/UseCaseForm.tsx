import type { UseCase } from '@pizza-doc/core'
import { z } from 'zod'
import { FormField, NestedReadonly, TextArea, TextField } from './common'
import { useAutosaveForm } from './use-autosave-form'

const RefPattern = /^(module|usecase|actor):[a-zA-Z0-9_\-/:]+$/

const UseCaseEditSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  actor: z
    .string()
    .min(1, 'Actor ref is required')
    .regex(RefPattern, 'Must start with actor:/module:/usecase:'),
  trigger: z.string().min(1, 'Trigger is required'),
  description: z.string().optional(),
})

type UseCaseEditValues = z.infer<typeof UseCaseEditSchema>

export function UseCaseForm({
  useCase,
  resetKey,
  save,
}: {
  useCase: UseCase
  resetKey: string
  save: (next: UseCase) => Promise<void>
}) {
  const { form, registerBlur } = useAutosaveForm(
    UseCaseEditSchema,
    {
      name: useCase.name,
      actor: useCase.actor,
      trigger: useCase.trigger,
      description: useCase.description ?? '',
    },
    resetKey,
    async (values: UseCaseEditValues) => {
      const merged: UseCase = {
        ...useCase,
        name: values.name,
        actor: values.actor,
        trigger: values.trigger,
        description: values.description || '',
      }
      await save(merged)
    },
  )

  const errors = form.formState.errors

  return (
    <div className="flex flex-col gap-3">
      <FormField id="usecase-name" label="name" error={errors.name}>
        <TextField id="usecase-name" {...registerBlur('name')} invalid={Boolean(errors.name)} />
      </FormField>

      <FormField
        id="usecase-actor"
        label="actor"
        error={errors.actor}
        hint="Ref of the initiating actor (actor:id)."
      >
        <TextField
          id="usecase-actor"
          {...registerBlur('actor')}
          invalid={Boolean(errors.actor)}
          placeholder="actor:customer"
        />
      </FormField>

      <FormField id="usecase-trigger" label="trigger" error={errors.trigger}>
        <TextArea
          id="usecase-trigger"
          {...registerBlur('trigger')}
          invalid={Boolean(errors.trigger)}
        />
      </FormField>

      <FormField id="usecase-description" label="description" error={errors.description}>
        <TextArea
          id="usecase-description"
          {...registerBlur('description')}
          invalid={Boolean(errors.description)}
        />
      </FormField>

      <NestedReadonly label="steps" count={useCase.steps.length} />
      <NestedReadonly label="errorFlows" count={useCase.errorFlows.length} />
      <NestedReadonly label="dataFlow" count={useCase.dataFlow.length} />
    </div>
  )
}
