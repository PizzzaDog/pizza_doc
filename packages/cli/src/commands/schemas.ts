import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red } from '../util/colors.js'
import { generateSchemas } from '../util/schemas.js'
import { findSpaceRoot } from '../util/space-path.js'

/**
 * `pd schemas regen [<dir>]`
 *
 * Refresh the per-space `schemas/*.json` files from the current Zod source.
 * Useful after upgrading the `pd` binary: an existing space keeps its YAML
 * but the IDE language-server is reading stale schemas from before the
 * upgrade. Drop-in replacement for the old "delete schemas/ and re-init in
 * a temp dir" workaround.
 */
export function cmdSchemas(args: ParsedArgs): number {
  const sub = args.positional[0]
  if (!sub) {
    console.error(red('usage: pd schemas regen [<dir>]'))
    return 2
  }
  if (sub !== 'regen') {
    console.error(red(`unknown subcommand: pd schemas ${sub}`))
    console.error(dim('  available: regen'))
    return 2
  }

  const explicitDir = args.positional[1]
  const spaceDir = resolveSpaceDir(explicitDir)
  if (!spaceDir) {
    console.error(red('no Pizza Doc space found — pass <dir> or run from inside a space'))
    return 1
  }

  if (!fs.existsSync(path.join(spaceDir, 'space.yaml'))) {
    console.error(red(`not a Pizza Doc space: ${spaceDir} (no space.yaml)`))
    return 1
  }

  const { written, outDir } = generateSchemas(spaceDir)
  const rel = path.relative(process.cwd(), outDir) || outDir
  console.log(`${green('✓')} ${bold(`${written} schema files`)} written → ${cyan(rel)}`)
  console.log(dim('  IDE pragmas in YAML files already point here — no further wiring needed.'))
  return 0
}

function resolveSpaceDir(explicit: string | undefined): string | null {
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit)
  }
  const found = findSpaceRoot()
  if (found?.kind === 'space') return found.path
  return null
}
