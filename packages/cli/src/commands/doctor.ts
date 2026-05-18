import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { loadSpace } from '@pizza-doc/core'
import type { Space } from '@pizza-doc/core'
import { nodeFileSystem } from '@pizza-doc/core/node-io'

import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { expectedSpaceId, resolveSpaceDir } from '../util/space-path.js'

/**
 * `pd doctor [<dir>] [--fix-ci]`
 *
 * Quality-of-life advisory command. Walks a checklist that catches the
 * "we didn't know about the flag / wasn't in git / no CI integration"
 * class of bugs production feedback flagged. Doesn't modify state by
 * default — surfaces issues + a one-line `pd ...` suggestion for each.
 *
 * With `--fix-ci`, scaffolds `.github/workflows/pd-validate.yml` if
 * absent. Other fixes are advisory (would require schema rewrites).
 *
 * Exit codes:
 *   0 — all checks pass or only info-level hints
 *   1 — at least one check failed (e.g. .pizza-doc not in git)
 */
export async function cmdDoctor(args: ParsedArgs): Promise<number> {
  const dir = resolveSpaceDir(args.positional[0])
  const fix = args.flags['fix-ci'] === true

  console.log(bold(cyan('pd doctor')) + dim(`  ${dir}`))
  console.log('')

  let failed = false
  const checks: DoctorCheck[] = []

  // 1. Git repo presence.
  checks.push(checkGitRepo(dir))

  // Load the space to do content-aware checks. If it fails to load,
  // we still want git/CI checks to surface — don't bail.
  let space: Space | null = null
  try {
    const fs = nodeFileSystem(dir)
    const loaded = await loadSpace(fs, '.', expectedSpaceId(dir))
    space = loaded.space ?? null
  } catch {
    checks.push({
      status: 'warn',
      title: 'Space loads cleanly',
      detail:
        'pd validate failed to load the space. Fix that first; doctor needs a parseable space for most checks.',
    })
  }

  if (space) {
    // 2. implementationLanguage matches an available extractor skill.
    checks.push(checkImplementationLanguage(space))
    // 3. Suggest validate flags based on space contents.
    checks.push(...suggestFlags(space))
  }

  // 4. CI workflow file presence.
  checks.push(checkCiWorkflow(dir, fix))

  for (const c of checks) {
    printCheck(c)
    if (c.status === 'fail') failed = true
  }

  console.log('')
  if (failed) {
    console.log(red('one or more checks failed.'))
    return 1
  }
  console.log(green('all checks passed.'))
  return 0
}

// ---------- check shapes ----------

interface DoctorCheck {
  status: 'ok' | 'warn' | 'fail' | 'info'
  title: string
  detail?: string
  suggest?: string
}

function printCheck(c: DoctorCheck): void {
  const badge =
    c.status === 'ok'
      ? green('  ok  ')
      : c.status === 'warn'
        ? yellow(' warn ')
        : c.status === 'info'
          ? dim(' info ')
          : red(' fail ')
  console.log(`${badge} ${c.title}`)
  if (c.detail) console.log(`         ${dim(c.detail)}`)
  if (c.suggest) console.log(`         ${cyan('→')} ${c.suggest}`)
}

// ---------- individual checks ----------

function checkGitRepo(dir: string): DoctorCheck {
  try {
    const top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!top) {
      return {
        status: 'fail',
        title: '.pizza-doc / spaces dir is inside a git repository',
        detail:
          'No git toplevel detected. Pizza Doc spec should be version-controlled alongside the code.',
        suggest: `cd ${dir} && git init`,
      }
    }
    const rel = relative(top, dir)
    return {
      status: 'ok',
      title: '.pizza-doc / spaces dir is inside a git repository',
      detail: `git toplevel: ${top}${rel ? ` (space at ${rel})` : ''}`,
    }
  } catch {
    return {
      status: 'fail',
      title: '.pizza-doc / spaces dir is inside a git repository',
      detail: 'git rev-parse failed. Either git is not installed or this directory is not a repo.',
      suggest: `cd ${dir} && git init`,
    }
  }
}

const KNOWN_LANGUAGES = new Set([
  'java',
  'kotlin',
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'csharp',
  'ruby',
  'swift',
])
const EXTRACTOR_LANGUAGES = new Set(['java', 'kotlin', 'typescript', 'javascript', 'python', 'go'])

function checkImplementationLanguage(space: Space): DoctorCheck {
  const lang = space.meta.implementationLanguage
  if (!lang) {
    return {
      status: 'info',
      title: 'meta.implementationLanguage set',
      detail:
        'Unset. `pd-extract-*` skills will ask before running. Set it once in space.yaml to skip the prompt.',
    }
  }
  const norm = lang.toLowerCase()
  if (!KNOWN_LANGUAGES.has(norm)) {
    return {
      status: 'warn',
      title: 'meta.implementationLanguage matches a known language',
      detail: `Value '${lang}' isn't in the canonical list. Skills match case-insensitively — typo?`,
      suggest:
        'Canonical values: java, kotlin, typescript, javascript, python, go, rust, csharp, ruby, swift.',
    }
  }
  if (!EXTRACTOR_LANGUAGES.has(norm)) {
    return {
      status: 'info',
      title: 'meta.implementationLanguage has a pd-extract-* skill',
      detail: `Language '${lang}' is recognised but no extractor skill ships for it yet. pd-implementer works; pd-scanner / drift won't.`,
    }
  }
  return {
    status: 'ok',
    title: 'meta.implementationLanguage has a pd-extract-* skill',
    detail: `pd-extract-${norm} will be used by pd-scanner / pd-drift-auditor.`,
  }
}

function suggestFlags(space: Space): DoctorCheck[] {
  const out: DoctorCheck[] = []

  // Strict contracts: any module declares calls with credentials OR any
  // http-api external-dep is declared. Then `--strict-contracts` is a
  // meaningful CI gate.
  let hasContractSurface = false
  let hasHttpApiDep = false
  let hasStateMachine = false
  const hasRunbook = (space.runbooks ?? []).length > 0
  let hasHostBinary = false

  for (const mod of space.modules) {
    for (const dep of mod.externalDeps ?? []) {
      if (dep.kind === 'http-api' || dep.kind === undefined) hasHttpApiDep = true
      if (dep.kind === 'host-binary') hasHostBinary = true
    }
    for (const comp of mod.components) {
      for (const m of comp.methods) {
        for (const c of m.calls) {
          if (typeof c === 'object' && c.credential) hasContractSurface = true
        }
      }
    }
    if ((mod.stateMachines ?? []).length > 0) hasStateMachine = true
    for (const model of mod.models) {
      if (model.stateMachine) hasStateMachine = true
    }
  }

  if (hasContractSurface || hasHttpApiDep) {
    out.push({
      status: 'info',
      title: '--strict-contracts is enabled in CI',
      detail: hasContractSurface
        ? 'You have method.calls[] entries with credential metadata; --strict-contracts gates caller/callee parity.'
        : 'You declare http-api external-deps; --strict-contracts ensures the usesConfigKey is real.',
      suggest: 'pd validate --strict-contracts',
    })
  }

  if (hasHttpApiDep) {
    out.push({
      status: 'info',
      title: '--strict-wire-capture is enabled in CI',
      detail:
        'External http-api integrations should have captured-traffic fixtures pinned in the spec (wireCapture).',
      suggest: 'pd validate --strict-wire-capture',
    })
  }

  if (hasStateMachine) {
    out.push({
      status: 'info',
      title: '--check-state-coverage is enabled in CI',
      detail:
        'State machines without scenario tests can drift silently. Escalate the info-level coverage rule.',
      suggest: 'pd validate --check-state-coverage',
    })
  }

  if (hasRunbook) {
    out.push({
      status: 'info',
      title: '--check-runbook-coverage is enabled in CI',
      detail: 'Severity-aware: errorFlows matched to p0/p1 runbooks gate the build.',
      suggest: 'pd validate --check-runbook-coverage',
    })
  }

  if (hasHostBinary) {
    out.push({
      status: 'info',
      title: 'pd drift --from-jsonl includes host-binary paths',
      detail: 'host-binary deps benefit from drift-checking deployed paths against the spec.',
      suggest: 'pd drift --from-jsonl <extract.jsonl> --fail-on-error',
    })
  }

  return out
}

function checkCiWorkflow(dir: string, fix: boolean): DoctorCheck {
  // Walk up from the space dir to find a git root, then look for
  // .github/workflows/pd-validate.yml.
  let root: string
  try {
    root = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return {
      status: 'info',
      title: 'CI workflow scaffolded (.github/workflows/pd-validate.yml)',
      detail: 'Skipped — not inside a git repo.',
    }
  }
  if (!root) {
    return {
      status: 'info',
      title: 'CI workflow scaffolded (.github/workflows/pd-validate.yml)',
      detail: 'Skipped — git toplevel not found.',
    }
  }

  const wfPath = join(root, '.github', 'workflows', 'pd-validate.yml')
  if (existsSync(wfPath)) {
    return {
      status: 'ok',
      title: 'CI workflow scaffolded (.github/workflows/pd-validate.yml)',
      detail: relative(root, wfPath),
    }
  }

  if (fix) {
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
    writeFileSync(wfPath, CI_WORKFLOW_TEMPLATE, 'utf8')
    return {
      status: 'ok',
      title: 'CI workflow scaffolded (.github/workflows/pd-validate.yml)',
      detail: `Wrote ${relative(root, wfPath)}`,
    }
  }

  return {
    status: 'info',
    title: 'CI workflow scaffolded (.github/workflows/pd-validate.yml)',
    detail: 'Not present. Re-run with --fix-ci to scaffold a baseline workflow.',
    suggest: 'pd doctor --fix-ci',
  }
}

const CI_WORKFLOW_TEMPLATE = `name: pd-validate

on:
  pull_request:
  push:
    branches: [main, master]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      # Plain validate. Layer strict flags as your spec matures.
      - run: pnpm pd validate
      # Recommended once your spec uses the matching features:
      # - run: pnpm pd validate --strict-contracts --check-orphan-paths --check-state-coverage --check-runbook-coverage --strict-wire-capture
      # - run: pnpm pd drift --from-jsonl extract.jsonl --fail-on-error
`
