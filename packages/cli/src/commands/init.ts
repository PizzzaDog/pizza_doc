import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { generateSchemas, schemaRefFor } from '../util/schemas.js'
import { findSpaceRoot } from '../util/space-path.js'
import { writeYamlFile } from '../util/yaml-emit.js'

/**
 * `pd init <space-id> [--multi]`
 *
 * Default (single-space) layout — what 99% of projects want:
 *   <cwd>/.pizza-doc/
 *     space.yaml        (meta.id = <space-id>)
 *     actors/
 *     modules/
 *     use-cases/
 *
 * Multi-space layout (`--multi`, or auto-detected when `spaces/` already
 * exists in cwd) — for repos that host several specs side by side, like
 * Pizza Doc's own dev repo:
 *   <cwd>/spaces/<space-id>/
 *     space.yaml
 *     actors/
 *     modules/
 *     use-cases/
 */
export function cmdInit(args: ParsedArgs): number {
  const id = args.positional[0]
  if (!id) {
    console.error(red('usage: pd init <space-id> [--multi]'))
    return 2
  }
  if (!/^[a-z][a-z0-9-]*$/i.test(id)) {
    console.error(
      red(
        `invalid space id '${id}' — use kebab-case starting with a letter (e.g. my-app, restik, pizza-shop-demo)`,
      ),
    )
    return 2
  }

  const cwd = process.cwd()
  const found = findSpaceRoot()
  const explicitMulti = args.flags.multi === true || args.flags['multi-space'] === true
  // If the user is already in a multi-space monorepo (spaces/ exists), keep
  // extending that layout rather than dropping a `.pizza-doc/` next to it.
  const cwdHasSpacesDir = fs.existsSync(path.join(cwd, 'spaces'))
  const useMulti = explicitMulti || cwdHasSpacesDir

  if (found?.kind === 'space') {
    console.error(
      red(
        `already inside a Pizza Doc space (${path.relative(cwd, found.path) || '.'}) — nothing to init`,
      ),
    )
    return 1
  }

  const root = useMulti && found?.kind === 'monorepo' ? found.path : cwd
  const spaceDir = useMulti ? path.join(root, 'spaces', id) : path.join(root, '.pizza-doc')
  const layoutLabel = useMulti ? `spaces/${id}/` : '.pizza-doc/'

  if (fs.existsSync(spaceDir)) {
    console.error(red(`${layoutLabel} already exists at ${spaceDir}`))
    return 1
  }

  const name = titleCase(id)
  const description =
    (typeof args.flags.description === 'string' && args.flags.description) ||
    `TODO: one-paragraph description of what ${name} is.`

  const space = {
    meta: {
      id,
      name,
      description,
      version: '0.1.0',
      pizzaDocVersion: '0.2.0',
    },
  }

  fs.mkdirSync(path.join(spaceDir, 'actors'), { recursive: true })
  fs.mkdirSync(path.join(spaceDir, 'modules'), { recursive: true })
  fs.mkdirSync(path.join(spaceDir, 'use-cases'), { recursive: true })
  // Drop .gitkeep so empty dirs survive the initial commit.
  fs.writeFileSync(path.join(spaceDir, 'actors', '.gitkeep'), '')
  fs.writeFileSync(path.join(spaceDir, 'modules', '.gitkeep'), '')
  fs.writeFileSync(path.join(spaceDir, 'use-cases', '.gitkeep'), '')

  // Generate JSON schemas alongside the space so editors can validate inline.
  generateSchemas(spaceDir)

  const spaceYamlPath = path.join(spaceDir, 'space.yaml')
  const res = writeYamlFile(spaceYamlPath, space, {
    schemaRef: schemaRefFor(spaceDir, spaceYamlPath, 'space'),
  })
  if (!res.wrote) {
    console.error(red(`failed to write space.yaml: ${res.reason}`))
    return 1
  }

  writeSpaceReadme(spaceDir, id, name)
  const skillReport = copySkills(root)

  const validateTarget = useMulti ? `spaces/${id}` : '.pizza-doc'
  console.log(`${green('✓')} ${bold(layoutLabel)} scaffolded`)
  if (skillReport.source) {
    const skipMsg = skillReport.skipped > 0 ? ` (${skillReport.skipped} already present)` : ''
    console.log(`${green('✓')} ${skillReport.copied} skills installed → .claude/skills/${skipMsg}`)
  } else if (skillReport.reason) {
    console.log(`${yellow('~')} skills not installed: ${skillReport.reason}`)
  }
  console.log(dim('  next:'))
  console.log(`    ${cyan('pd add actor <id>')}`)
  console.log(`    ${cyan('pd add module <id> --type service')}`)
  console.log(`    ${cyan(`pd validate ${validateTarget}`)}`)
  return 0
}

function findSkillsSource(): string | null {
  // Walk up from this CLI file to find skills in the pd installation.
  // In dev-symlink mode, import.meta.url resolves to the realpath inside the
  // pd repo, so the walk-up finds <repo>/.claude/skills/. In the published
  // npm package, the bundled copy lives at <package>/skills/.
  let dir = path.dirname(fileURLToPath(import.meta.url))
  let packagedFallback: string | null = null
  while (true) {
    const repoCandidate = path.join(dir, '.claude', 'skills')
    if (isSkillsDir(repoCandidate)) return repoCandidate

    const packageCandidate = path.join(dir, 'skills')
    if (!packagedFallback && isSkillsDir(packageCandidate)) packagedFallback = packageCandidate

    const parent = path.dirname(dir)
    if (parent === dir) return packagedFallback
    dir = parent
  }
}

function isSkillsDir(candidate: string): boolean {
  return (
    fs.existsSync(candidate) &&
    fs.statSync(candidate).isDirectory() &&
    fs.readdirSync(candidate).some((name) => name.startsWith('pd-'))
  )
}

interface SkillReport {
  copied: number
  skipped: number
  source: string | null
  reason?: string
}

function copySkills(projectRoot: string): SkillReport {
  const source = findSkillsSource()
  if (!source) {
    return { copied: 0, skipped: 0, source: null, reason: 'pd installation skills/ not found' }
  }
  const target = path.join(projectRoot, '.claude', 'skills')
  // If user is initing inside the pd repo itself, source === target — skip.
  if (path.resolve(source) === path.resolve(target)) {
    return {
      copied: 0,
      skipped: 0,
      source: null,
      reason: 'running inside pd repo (source = target)',
    }
  }
  fs.mkdirSync(target, { recursive: true })
  let copied = 0
  let skipped = 0
  for (const name of fs.readdirSync(source)) {
    if (!name.startsWith('pd-')) continue
    const src = path.join(source, name)
    if (!fs.statSync(src).isDirectory()) continue
    const dst = path.join(target, name)
    if (fs.existsSync(dst)) {
      skipped++
      continue
    }
    fs.cpSync(src, dst, { recursive: true })
    copied++
  }
  return { copied, skipped, source }
}

function writeSpaceReadme(spaceDir: string, id: string, name: string): void {
  const content = `# ${name} — Pizza Doc space

This directory is a **Pizza Doc space** — a structured, AI-readable
architecture spec for this project. It's hand-authored YAML, validated
end-to-end (schema + cross-refs + semantics).

If you are an AI agent reading this: there are agent skills at
\`../.claude/skills/pd-*\` covering the common operations on this space.
Read the skill descriptions to find the right one for the task.

## Layout

- \`space.yaml\` — meta (id: \`${id}\`, name, description, version)
- \`actors/\` — people or external systems that initiate use cases
- \`modules/\` — deployable units: frontend, service, database, queue, external
  - \`<module>/components/\` — controllers, services, repositories, pages, jobs
  - \`<module>/models/\` — DTOs, entities, value objects, events
  - \`<module>/tables/\` — DB schema (in \`database\` / \`queue\` modules only)
- \`use-cases/\` — business flows: actor → steps → terminal

## CLI

\`\`\`bash
pd validate           # schema + refs + semantic check
pd coverage           # how complete the spec is
pd orphans            # unused entities
pd endpoints          # HTTP surface from controllers
pd dataflow <Field>   # trace one field across the system
pd export openapi     # OpenAPI 3.1 JSON from controllers
pd --help             # full surface
\`\`\`

## Agent skills (in \`.claude/skills/\` at the repo root)

- **pd-scanner** — existing code → space (document a codebase)
- **pd-author** — design a new space from scratch
- **pd-implementer** — space → code (generate from a use case)
- **pd-drift-auditor** — compare spec to current code, report drift
- **pd-pr-reviewer** — review spec changes on a PR
- **pd-extract-{typescript,python,go,java}** — language-specific extractors
  used by the orchestrators above
`
  fs.writeFileSync(path.join(spaceDir, 'README.md'), content)
}

function titleCase(id: string): string {
  return id
    .split(/[-_]/)
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ')
}
