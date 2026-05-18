import type { Space } from '@pizza-doc/core'
import { bold, cyan, dim, green, red, yellow } from './colors.js'
import { allComponents, allModels, allTables } from './space-walk.js'

export function printSpaceDiff(oldSpace: Space, newSpace: Space, label: string): void {
  console.log(`${bold(cyan(`diff: ${label}`))}  ${dim(newSpace.meta.id)}`)

  diffSet(
    'components',
    setOf([...allComponents(oldSpace)].map((c) => c.ref)),
    setOf([...allComponents(newSpace)].map((c) => c.ref)),
  )
  diffSet(
    'models',
    setOf([...allModels(oldSpace)].map((m) => m.ref)),
    setOf([...allModels(newSpace)].map((m) => m.ref)),
  )
  diffSet(
    'tables',
    setOf([...allTables(oldSpace)].map((t) => t.ref)),
    setOf([...allTables(newSpace)].map((t) => t.ref)),
  )
  diffSet(
    'use cases',
    setOf(oldSpace.useCases.map((u) => `usecase:${u.id}`)),
    setOf(newSpace.useCases.map((u) => `usecase:${u.id}`)),
  )

  const oldModelFields = indexModelFields(oldSpace)
  const newModelFields = indexModelFields(newSpace)
  for (const [ref, newFields] of newModelFields) {
    const oldFields = oldModelFields.get(ref)
    if (!oldFields) continue
    const added = [...newFields].filter((f) => !oldFields.has(f))
    const removed = [...oldFields].filter((f) => !newFields.has(f))
    if (added.length === 0 && removed.length === 0) continue
    console.log(`\n  ${bold(ref)}`)
    for (const f of added) console.log(`    ${green('+')} ${f}`)
    for (const f of removed) console.log(`    ${red('-')} ${f}  ${yellow('(breaking)')}`)
  }
}

function setOf<T>(xs: T[]): Set<T> {
  return new Set(xs)
}

function diffSet(label: string, oldSet: Set<string>, newSet: Set<string>): void {
  const added = [...newSet].filter((x) => !oldSet.has(x)).sort()
  const removed = [...oldSet].filter((x) => !newSet.has(x)).sort()
  if (added.length === 0 && removed.length === 0) return
  console.log(`\n  ${bold(label)}`)
  for (const r of added) console.log(`    ${green('+')} ${r}`)
  for (const r of removed) console.log(`    ${red('-')} ${r}`)
}

function indexModelFields(space: Space): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const { model, ref } of allModels(space)) {
    out.set(ref, new Set(model.fields.map((f) => f.name)))
  }
  return out
}
