import type { Component } from '@pizza-doc/core'
import { z } from 'zod'
import { FormField, NestedReadonly, SelectField, TextArea, TextField } from './common'
import { useAutosaveForm } from './use-autosave-form'

const ComponentEditSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum([
    'controller',
    'service',
    'repository',
    'infrastructure',
    'page',
    'widget',
    'client',
    'job',
    'consumer',
    'subscriber',
    'middleware',
  ]),
  description: z.string().optional(),
})

type ComponentEditValues = z.infer<typeof ComponentEditSchema>

export function ComponentForm({
  component,
  resetKey,
  save,
}: {
  component: Component
  resetKey: string
  save: (next: Component) => Promise<void>
}) {
  const { form, registerBlur } = useAutosaveForm(
    ComponentEditSchema,
    {
      name: component.name,
      type: component.type,
      description: component.description ?? '',
    },
    resetKey,
    async (values: ComponentEditValues) => {
      const merged: Component = {
        ...component,
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
      <FormField id="component-name" label="name" error={errors.name}>
        <TextField id="component-name" {...registerBlur('name')} invalid={Boolean(errors.name)} />
      </FormField>

      <FormField id="component-type" label="type" error={errors.type}>
        <SelectField id="component-type" {...registerBlur('type')} invalid={Boolean(errors.type)}>
          <option value="controller">controller</option>
          <option value="service">service</option>
          <option value="repository">repository</option>
          <option value="infrastructure">infrastructure</option>
          <option value="page">page</option>
          <option value="widget">widget</option>
          <option value="client">client</option>
          <option value="job">job</option>
        </SelectField>
      </FormField>

      <FormField id="component-description" label="description" error={errors.description}>
        <TextArea
          id="component-description"
          {...registerBlur('description')}
          invalid={Boolean(errors.description)}
        />
      </FormField>

      <NestedReadonly label="methods" count={component.methods.length} />
    </div>
  )
}
