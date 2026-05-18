import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, magenta, red } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'

/**
 * `pd dataflow <Model.field>` — trace a specific field through every use
 * case's dataFlow: shows which use cases carry it, through which DTO/column
 * hops, and where it finally lands.
 *
 * This is the command that proves "I can tell what happens to user.email
 * from the moment the form is submitted" without reading source code.
 */
export async function cmdDataflow(args: ParsedArgs): Promise<number> {
  const needle = args.positional[0]
  if (!needle || !/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(needle)) {
    console.error(red('usage: pd dataflow <Model.field>  (e.g. CreateUserRequest.email)'))
    return 2
  }
  const [sourceType, sourceField] = needle.split('.') as [string, string]
  const { space } = await loadSpaceForCli(resolveSpaceDir(args.positional[1]))

  console.log(`${bold(cyan(`dataflow: ${needle}`))}`)

  let hits = 0
  // Forward trace — where does this field go?
  for (const uc of space.useCases) {
    const ucHits: string[] = []
    const seen = new Set<string>()
    const visit = (cursor: { type: string; field: string }, depth: number): void => {
      if (seen.has(`${cursor.type}.${cursor.field}`)) return
      seen.add(`${cursor.type}.${cursor.field}`)
      for (const df of uc.dataFlow) {
        const src = splitField(df.sourceField)
        if (!src) continue
        if (src.type === cursor.type && src.field === cursor.field) {
          const tgt = splitField(df.targetField)
          if (!tgt) continue
          const arrow = df.cardinality === 'many' ? '⇉' : '→'
          ucHits.push(
            `${'  '.repeat(depth)}${magenta(df.sourceField)} ${arrow} ${cyan(df.targetField)}${df.transform ? dim(` [${df.transform}]`) : ''}`,
          )
          // Continue tracing — maybe the target is itself a Model.field that
          // appears as a source elsewhere in the same use case.
          visit(tgt, depth + 1)
        }
      }
    }
    visit({ type: sourceType, field: sourceField }, 0)
    if (ucHits.length > 0) {
      hits++
      console.log(`\n  ${bold(`usecase:${uc.id}`)} ${dim(`(${ucHits.length} hops)`)}`)
      for (const line of ucHits) console.log(`    ${line}`)
    }
  }

  if (hits === 0) {
    console.log(dim(`  no use case mentions ${needle} as a dataFlow source.`))
    return 1
  }
  return 0
}

function splitField(s: string): { type: string; field: string } | null {
  const m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(.+)$/)
  if (!m) return null
  const [, type, field] = m
  if (!type || !field) return null
  return { type, field }
}
