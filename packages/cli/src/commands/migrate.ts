import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { generateSchemas } from '../util/schemas.js'
import { resolveSpaceDir } from '../util/space-path.js'

/**
 * `pd migrate <from-to> [path]`
 *
 * One-shot migration helper. Currently a single migration target is
 * supported: `v0.2-to-v0.3`. The migration is conservative — it never
 * rewrites existing user-authored YAML; it only:
 *
 *   1. Backs the current `.pizza-doc/` (or `spaces/<id>/`) into a
 *      sibling `.pizza-doc-pre-v0.3-backup/` directory so anything we
 *      *do* touch can be restored.
 *   2. Regenerates `<space>/schemas/` so editors pick up the new
 *      `config-map.json` / `external-deps.json` / `adr-frontmatter.json`
 *      pragmas without the user thinking about it.
 *   3. Audits any `decisions/ADR-NNN-*.md` files the user may have
 *      hand-authored before v0.3 — verifies frontmatter shape, reports
 *      mismatches, but does NOT modify them.
 *   4. Stamps `meta.pizzaDocVersion` to `0.3.0` in `space.yaml` if
 *      currently `0.2.0` (or earlier). Idempotent.
 *   5. Prints a hand-off summary listing what the user still needs to
 *      fill in (config-map.yaml / external-deps.yaml per service).
 *
 * The migration deliberately stops short of *generating* config-map or
 * external-deps content — that's domain-specific and best left to the
 * agent + user pair to author after they read the migration summary.
 */
export async function cmdMigrate(args: ParsedArgs): Promise<number> {
  const target = args.positional[0]
  if (!target) {
    console.error(red('usage: pd migrate <v0.2-to-v0.3> [path]'))
    return 2
  }
  if (target !== 'v0.2-to-v0.3') {
    console.error(red(`unknown migration target: ${target}`))
    console.error(dim('  known: v0.2-to-v0.3'))
    return 2
  }

  let spaceDir: string
  try {
    spaceDir = resolveSpaceDir(args.positional[1])
  } catch (err) {
    console.error(red((err as Error).message))
    return 1
  }

  console.log(`${bold(cyan('pd migrate v0.2 → v0.3'))}  ${dim(spaceDir)}`)
  console.log('')

  // 1. Backup ----------------------------------------------------------
  const parent = path.dirname(spaceDir)
  const folderName = path.basename(spaceDir)
  const backupName = `${folderName}-pre-v0.3-backup`
  const backupPath = path.join(parent, backupName)
  if (fs.existsSync(backupPath)) {
    console.log(
      `${yellow('~')} backup ${dim(`(${path.relative(process.cwd(), backupPath)})`)} already exists; skipping copy. Delete it first if you want a fresh backup.`,
    )
  } else {
    fs.cpSync(spaceDir, backupPath, { recursive: true })
    console.log(`${green('✓')} backup written → ${dim(path.relative(process.cwd(), backupPath))}`)
  }

  // 2. Regenerate JSON schemas ----------------------------------------
  const { written } = generateSchemas(spaceDir)
  console.log(`${green('✓')} ${written} JSON schemas regenerated → ${dim('schemas/')}`)

  // 3. Audit existing ADRs --------------------------------------------
  const decisionsDir = path.join(spaceDir, 'decisions')
  let adrCount = 0
  let adrIssues = 0
  if (fs.existsSync(decisionsDir)) {
    for (const f of fs.readdirSync(decisionsDir)) {
      if (!f.endsWith('.md')) continue
      adrCount++
      const filenameMatch = f.match(/^(ADR-[0-9]{3,})-[A-Za-z0-9_-]+\.md$/)
      const fullPath = path.join(decisionsDir, f)
      const source = fs.readFileSync(fullPath, 'utf8')
      if (!filenameMatch) {
        console.log(
          `${yellow('~')} ADR file ${dim(f)} does not match \`ADR-NNN-<slug>.md\` — rename or it will be skipped by the loader.`,
        )
        adrIssues++
        continue
      }
      const fmMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
      if (!fmMatch) {
        console.log(
          `${yellow('~')} ADR ${dim(f)} has no YAML frontmatter block — add a \`---\`-fenced header with at least \`id:\` and \`status:\`.`,
        )
        adrIssues++
        continue
      }
      const fmRaw = fmMatch[1] ?? ''
      const idLine = fmRaw.match(/^\s*id:\s*([A-Za-z0-9_-]+)/m)?.[1]
      const expectedId = filenameMatch[1]
      if (!idLine || idLine !== expectedId) {
        console.log(
          `${yellow('~')} ADR ${dim(f)} frontmatter id (\`${idLine ?? '<unset>'}\`) does not match filename id (\`${expectedId}\`).`,
        )
        adrIssues++
      }
    }
  }
  if (adrCount === 0) {
    console.log(
      `${dim('·')} no ADR files in ${dim('decisions/')} — that's fine; create them as ${dim('decisions/ADR-NNN-<slug>.md')} when you start recording decisions.`,
    )
  } else {
    const verdict =
      adrIssues === 0
        ? green(`${adrCount} ADR file(s) clean`)
        : yellow(`${adrCount} ADR file(s), ${adrIssues} issue(s) flagged above`)
    console.log(`${green('✓')} ADR audit: ${verdict}`)
  }

  // 4. Stamp pizzaDocVersion ------------------------------------------
  const spaceYamlPath = path.join(spaceDir, 'space.yaml')
  if (fs.existsSync(spaceYamlPath)) {
    const original = fs.readFileSync(spaceYamlPath, 'utf8')
    const stamped = stampPizzaDocVersion(original, '0.3.0')
    if (stamped !== original) {
      fs.writeFileSync(spaceYamlPath, stamped)
      console.log(`${green('✓')} ${dim('space.yaml')} pizzaDocVersion → 0.3.0`)
    } else {
      console.log(
        `${dim('·')} ${dim('space.yaml')} pizzaDocVersion already at 0.3.0 (or higher) — no change`,
      )
    }
  } else {
    console.log(`${yellow('~')} no space.yaml at ${dim(spaceDir)} — skipping version stamp`)
  }

  // 5. Hand-off summary ----------------------------------------------
  console.log('')
  console.log(bold('Next steps (manual):'))
  console.log(dim('  · For each service module, populate two new files:'))
  console.log(
    `    ${cyan('modules/<id>/config-map.yaml')}     — env vars, secrets, runtime config knobs`,
  )
  console.log(
    `    ${cyan('modules/<id>/external-deps.yaml')}  — outbound deps (HTTP / DB / queue / SDK)`,
  )
  console.log(dim('  · The fastest way: hand the agent this prompt:'))
  console.log(
    dim(
      '      Use the v0.3 operations evidence section in .claude/skills/pd-extract-<lang>/SKILL.md.\n' +
        '      Walk every @Value / os.Getenv / process.env / os.environ in the source and fill\n' +
        '      modules/<id>/config-map.yaml. Walk every WebClient / http.Client / fetch / SDK\n' +
        '      constructor and fill modules/<id>/external-deps.yaml. Then run pd validate.',
    ),
  )
  console.log(
    `  · Validate: ${cyan('pd validate')}   ${dim('— expect new errors for unresolved sourceOfTruth / missing usesConfigKey')}`,
  )
  console.log(`  · Operations summary: ${cyan('pd export operations --out OPERATIONS.md')}`)
  console.log(
    `  · CI drift gate: ${cyan('pd drift --from-jsonl <code-snapshot>.jsonl')}   ${dim('— catches new keys/endpoints in code that the spec missed')}`,
  )
  console.log('')
  console.log(
    `${green('migration complete.')}  Backup retained at ${dim(path.relative(process.cwd(), backupPath))}.`,
  )
  return 0
}

/**
 * Bump `meta.pizzaDocVersion` in space.yaml to `target` if currently
 * lower. Idempotent. We do a string-level edit (rather than parse → emit)
 * to preserve every formatting choice the author made — comments,
 * indentation, key order, trailing whitespace.
 */
function stampPizzaDocVersion(source: string, target: string): string {
  const re = /(^|\n)(\s*)pizzaDocVersion:\s*['"]?([^'"\n]+)['"]?/
  const match = source.match(re)
  if (!match) return source
  const current = match[3]?.trim()
  if (!current) return source
  if (compareSemver(current, target) >= 0) return source
  return source.replace(re, `$1$2pizzaDocVersion: ${target}`)
}

function compareSemver(a: string, b: string): number {
  const ap = a.split('.').map((s) => Number.parseInt(s, 10) || 0)
  const bp = b.split('.').map((s) => Number.parseInt(s, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const ai = ap[i] ?? 0
    const bi = bp[i] ?? 0
    if (ai !== bi) return ai < bi ? -1 : 1
  }
  return 0
}
