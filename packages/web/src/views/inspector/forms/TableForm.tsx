import type { Table } from '@pizza-doc/core'
import { z } from 'zod'
import { FormField, NestedReadonly, TextArea, TextField } from './common'
import { useAutosaveForm } from './use-autosave-form'

const TableEditSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

type TableEditValues = z.infer<typeof TableEditSchema>

export function TableForm({
  table,
  resetKey,
  save,
}: {
  table: Table
  resetKey: string
  save: (next: Table) => Promise<void>
}) {
  const { form, registerBlur } = useAutosaveForm(
    TableEditSchema,
    {
      name: table.name,
      description: table.description ?? '',
    },
    resetKey,
    async (values: TableEditValues) => {
      const merged: Table = {
        ...table,
        name: values.name,
        description: values.description || '',
      }
      await save(merged)
    },
  )

  const errors = form.formState.errors

  return (
    <div className="flex flex-col gap-3">
      <FormField id="table-name" label="name" error={errors.name}>
        <TextField id="table-name" {...registerBlur('name')} invalid={Boolean(errors.name)} />
      </FormField>

      <FormField id="table-description" label="description" error={errors.description}>
        <TextArea
          id="table-description"
          {...registerBlur('description')}
          invalid={Boolean(errors.description)}
        />
      </FormField>

      <NestedReadonly label="columns" count={table.columns.length} />
      <NestedReadonly label="indexes" count={table.indexes.length} />
    </div>
  )
}
