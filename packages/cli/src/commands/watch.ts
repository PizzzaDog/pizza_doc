import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { resolveSpaceDir } from '../util/space-path.js'
import { cmdValidate } from './validate.js'

/**
 * `pd watch [spaces/<id>]`
 *
 * Runs `pd validate` on boot, then rewatches the space directory and
 * re-validates on every change (debounced 150ms). Intended for the
 * second terminal while authoring YAML by hand.
 *
 * Node's `fs.watch(recursive)` is flaky on Linux; we fall back to a
 * polling walker if the recursive watcher refuses to fire. 600ms poll
 * is imperceptible for a human reading validator output.
 */
export async function cmdWatch(args: ParsedArgs): Promise<number> {
  const dir = resolveSpaceDir(args.positional[0])
  const rel = path.relative(process.cwd(), dir)
  console.log(`${bold(cyan('watching'))} ${rel}`)
  await runOnce(args)
  let timer: NodeJS.Timeout | null = null
  const debounced = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      console.log(`\n${dim('---')} ${new Date().toLocaleTimeString()}`)
      runOnce(args).catch((err) => console.error(red(String(err))))
    }, 150)
  }
  try {
    fs.watch(dir, { recursive: true }, (_type, filename) => {
      if (filename && !/\.(ya?ml)$/.test(filename)) return
      debounced()
    })
  } catch {
    // recursive watcher unsupported; fall back to polling.
    const seen = new Map<string, number>()
    const poll = (): void => {
      walkYaml(dir, (p) => {
        const mt = fs.statSync(p).mtimeMs
        if (seen.get(p) !== mt) {
          seen.set(p, mt)
          if (seen.size > 1) debounced() // skip the initial bulk read
        }
      })
      setTimeout(poll, 600)
    }
    poll()
    console.log(dim(`  (polling fallback — platform doesn't support recursive fs.watch)`))
  }
  // Keep the process alive.
  return new Promise<number>(() => {
    void yellow // keep import
  })
}

async function runOnce(args: ParsedArgs): Promise<void> {
  await cmdValidate(args).then((code) => {
    if (code === 0) console.log(green('✓ clean'))
  })
}

function walkYaml(dir: string, visit: (p: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkYaml(full, visit)
    else if (/\.(ya?ml)$/.test(entry.name)) visit(full)
  }
}
