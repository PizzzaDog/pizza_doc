#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { cmdAdd } from './commands/add.js'
import { cmdAnchors } from './commands/anchors.js'
import { cmdChange } from './commands/change.js'
import { cmdCoverage } from './commands/coverage.js'
import { cmdDataflow } from './commands/dataflow.js'
import { cmdDiff } from './commands/diff.js'
import { cmdDoctor } from './commands/doctor.js'
import { cmdDrift } from './commands/drift.js'
import { cmdEndpoints } from './commands/endpoints.js'
import { cmdExplain } from './commands/explain.js'
import { cmdExport } from './commands/export.js'
import { cmdImport } from './commands/import.js'
import { cmdInit } from './commands/init.js'
import { cmdLint } from './commands/lint.js'
import { cmdMigrate } from './commands/migrate.js'
import { cmdOrphans } from './commands/orphans.js'
import { cmdPortFromLegacy } from './commands/port-from-legacy.js'
import { cmdReadiness } from './commands/readiness.js'
import { cmdSchemas } from './commands/schemas.js'
import { cmdStats } from './commands/stats.js'
import { cmdUi } from './commands/ui.js'
import { cmdValidate } from './commands/validate.js'
import { cmdWatch } from './commands/watch.js'
import { parseArgs } from './util/args.js'
import { bold, cyan, dim, red } from './util/colors.js'
import { CLI_VERSION } from './util/version.js'

export { CLI_VERSION }

interface CliIo {
  stdout(message: string): void
  stderr(message: string): void
}

const defaultIo: CliIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
}

/**
 * `pd` / `pizza-doc` CLI entrypoint. Router only — every subcommand is a
 * separate module. Exit code propagates from the command so CI / shells
 * can chain on it.
 */
export async function runCli(argv = process.argv.slice(2), io: CliIo = defaultIo): Promise<number> {
  const [cmd, ...rest] = argv
  const parsed = parseArgs(rest)

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    printHelp(io)
    return 0
  }
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    io.stdout(`pizza-doc ${CLI_VERSION}`)
    return 0
  }

  try {
    switch (cmd) {
      case 'init':
        return cmdInit(parsed)
      case 'add':
        return cmdAdd(parsed)
      case 'anchors':
        return await cmdAnchors(parsed)
      case 'change':
        return await cmdChange(parsed)
      case 'import':
        return await cmdImport(parsed)
      case 'validate':
        return await cmdValidate(parsed)
      case 'readiness':
        return await cmdReadiness(parsed)
      case 'coverage':
        return await cmdCoverage(parsed)
      case 'orphans':
        return await cmdOrphans(parsed)
      case 'dataflow':
        return await cmdDataflow(parsed)
      case 'endpoints':
        return await cmdEndpoints(parsed)
      case 'diff':
        return await cmdDiff(parsed)
      case 'drift':
        return await cmdDrift(parsed)
      case 'doctor':
        return await cmdDoctor(parsed)
      case 'export':
        return await cmdExport(parsed)
      case 'watch':
        return await cmdWatch(parsed)
      case 'explain':
        return await cmdExplain(parsed)
      case 'stats':
        return await cmdStats(parsed)
      case 'lint':
        return cmdLint(parsed)
      case 'ui':
        return await cmdUi(parsed)
      case 'migrate':
        return await cmdMigrate(parsed)
      case 'port-from-legacy':
        return cmdPortFromLegacy(parsed)
      case 'schemas':
        return cmdSchemas(parsed)
      default:
        io.stderr(red(`unknown command: ${cmd}`))
        printHelp(io)
        return 2
    }
  } catch (err) {
    io.stderr(red(err instanceof Error ? err.message : String(err)))
    return 1
  }
}

export function printHelp(io: CliIo = defaultIo): void {
  io.stdout(`${bold(cyan('pizza-doc'))} — file-based architecture-as-code CLI

${bold('usage:')}
  pd <command> [args] [flags]

${bold('scaffolding:')}
  ${cyan('init')}          <space-id> [--multi]        create a new space
                                default: .pizza-doc/ in cwd
                                --multi: spaces/<id>/ (multi-space monorepo)
  ${cyan('add actor')}     <id> [--type user|system|scheduler]
  ${cyan('add module')}    <id> [--type service|frontend|database|queue|external]
  ${cyan('add domain')}    <id> --module <id>
  ${cyan('add component')} <id> --module <id> [--domain <id>] [--type ...]
  ${cyan('add model')}     <id> --module <id> [--domain <id>] [--kind dto|entity|...]
  ${cyan('add table')}     <id> --module <id> [--domain <id>]
                                [--from-sql <file>]

${bold('bulk import:')}
  ${cyan('import')}        --from-jsonl <file> [--dry-run] [--force|--merge]
                                [--space-dir <dir>]
                                language-agnostic stream of entity
                                declarations; see pd-extract-<lang> skills

${bold('quality gates:')}
  ${cyan('validate')}      [<dir>] [--change <id>] [--strict-warnings] [--verbose]
                                v0.3 opt-in contract flags (A5):
                                  --strict-contracts        caller/callee credential parity → error
                                  --check-orphan-paths      caller path ↔ callee route → error
                                  --check-state-coverage    state machine scenarios → error
                                  --check-runbook-coverage  errorFlow → runbook (severity-aware)
  ${cyan('readiness')}     [<dir>] [--profile production] [--min-endpoints 100] ...
                                [--drift-from-jsonl <file>]
                                [--check-anchors] [--require-anchors] [--code-root <dir>]
                                [--module-root <id>=<dir>]...
                                  opt-in anchor gate: every sourceRef resolves to a real file
  ${cyan('coverage')}      [<dir>] [--min-components 80] ...
  ${cyan('orphans')}       [<dir>] [--kind components|models|tables|endpoints]
  ${cyan('endpoints')}     [<dir>] [--orphans]
  ${cyan('dataflow')}      <Model.field> [<dir>]
  ${cyan('diff')}          <git-ref> [<dir>]
  ${cyan('diff')}          --change <id> [<dir>]
  ${cyan('drift')}         --from-jsonl <code-extract.jsonl> [<dir>]
  ${cyan('anchors')}       [<dir>] [--code-root <dir>] [--module-root <id>=<dir>]...
                                [--require-all] [--json]
                                deterministic spec↔code check: every sourceRef
                                resolves to a real file (no LLM, CI-friendly).
                                --module-root maps a module to its own repo
                                (tried first, falls back to --code-root)
  ${cyan('doctor')}        [<dir>] [--fix-ci]
                                advisory checklist: git presence, language hint,
                                flag suggestions, CI workflow scaffold

${bold('spec changes:')}
  ${cyan('change init')}   <id> --title "..."             create .pizza-doc/changes/<id>/
  ${cyan('change list')}   [<dir>]                        list overlay change-sets
  ${cyan('change show')}   <id> [<dir>]                   show metadata + overlay files
  ${cyan('change diff')}   <id> [<dir>]                   baseline vs merged overlay
  ${cyan('change status')} <id> <status> [<dir>]          update workflow status
  ${cyan('change adopt')}  <id> [<dir>]                   validate and apply overlay to baseline
  ${cyan('change reject')} <id> [<dir>]                   mark rejected

${bold('exploration / export:')}
  ${cyan('explain')}       <ref> [<dir>]                   one-shot entity walk
  ${cyan('lint')}          [--explain <CODE>]              list / explain validation codes
  ${cyan('stats')}         [<dir>]                         project-wide snapshot
  ${cyan('ui')}            [--port <n>] [--change <id>] [--global] [--no-open]
                                serve the web app; cwd .pizza-doc opens automatically
  ${cyan('watch')}         [<dir>]                         live revalidate
  ${cyan('export')}        openapi [--out <file>]          OpenAPI 3.1 JSON
  ${cyan('export')}        implementation-brief <ucid> [--out <file>]
                                self-contained markdown for LLM implementer
  ${cyan('export')}        typescript-types [--out <file>] DTOs/enums as TS interfaces + unions
  ${cyan('export')}        go-types [--package <name>] [--out <file>]
                                DTOs/enums as Go structs + typed string consts
  ${cyan('export')}        go-interfaces [--package <name>] [--out <file>]
                                components-with-methods as Go interfaces
  ${cyan('export')}        operations [--module <id>] [--include-decisions] [--out <file>]
                                config-map + external-deps + ADR index per module (markdown)

${bold('migration:')}
  ${cyan('migrate')}       v0.2-to-v0.3 [<dir>]            backup + regen schemas + audit ADRs + stamp version
  ${cyan('schemas regen')} [<dir>]                         refresh .pizza-doc/schemas/*.json from current Zod
                                run after upgrading the pd binary
  ${cyan('port-from-legacy')} <archive-path> [--output <file>]
                                scaffold a port-audit.md classification table
                                for a legacy-archive/ directory (KEEP/ADAPT/REPLACE/DROP)

${dim('  <dir> is the space directory: .pizza-doc (single-space) or')}
${dim('  spaces/<id> (multi-space). Auto-detected from cwd when omitted.')}

${bold('global flags:')}
  --space <id>     target space in multi-space monorepos (auto-detected from cwd)
  --multi          (init only) use legacy spaces/<id>/ layout
  --force          overwrite existing files
  --help           print this help

${dim('docs: https://github.com/PizzzaDog/pizza_doc')}`)
}

function isCliEntrypoint(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url
  } catch {
    return false
  }
}

if (isCliEntrypoint()) {
  runCli().then((code) => process.exit(code))
}
