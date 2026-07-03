// Render `pd --help` into docs/site …/reference/cli.md so the site's
// command list can never lag the CLI. Run:
//   pnpm --filter @pizza-doc/cli build
//   node scripts/gen-cli-doc.mjs
// …or `pnpm gen:cli-doc` (does both).
//
// The help block is generated; the intro prose around it is authored HERE
// (edit this script, not the output file).

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.join(here, '..', 'packages/cli/dist/index.js')
const outFile = path.join(here, '..', 'docs/site/src/content/docs/reference/cli.md')

const help = execFileSync('node', [cli, '--help'], { encoding: 'utf8' })
  // Strip ANSI color codes — the terminal styling means nothing in markdown.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are control chars by definition
  .replace(/\[[0-9;]*m/g, '')
  .trimEnd()

const page = `---
title: CLI commands
description: Every pd command — generated from the CLI's own --help output.
---

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Source: pd --help via scripts/gen-cli-doc.mjs. Regenerate: pnpm gen:cli-doc -->

\`pd\` (alias \`pizza-doc\`) is the command-line interface. Run any command
with no arguments from inside a space — \`findSpaceRoot\` walks up from the
current directory looking for \`space.yaml\`, then \`.pizza-doc/space.yaml\`,
then \`spaces/\`.

## The doc-first loop

Design-first work runs through four commands:

1. **\`pd validate\`** — the structural gate. 0 errors means every ref
   resolves, every type closes, wiring and steps agree. The footer reminds
   you this is *internal* consistency only.
2. **\`pd handoff <usecase>\`** — the per-use-case implementer gate: space
   errors, brief type closure, step↔call parity, payload models, error
   mapping, and event idempotency — scoped so a neighbour mid-design
   doesn't block. Exit 0 ⇒ safe to hand off.
3. **\`pd export implementation-brief <usecase>\`** — the self-contained
   artefact for the implementing agent: contracts, models, tables, config,
   wire captures, ADR bodies.
4. **\`pd export ai\`** — the whole space, full fidelity, for
   reason-about-everything sessions.

## The code-sync loop

Documenting or auditing an existing codebase:

1. A \`pd-extract-<lang>\` skill emits JSONL (components/models/tables with
   required \`sourceRef\`).
2. **\`pd import --from-jsonl\`** writes the YAML (it refuses to fork a
   renamed symbol into a duplicate entity).
3. **\`pd drift --from-jsonl [--json]\`** diffs code against spec — renames
   pair by sourceRef file instead of reporting add+delete.
4. **\`pd anchors\`** — deterministic sourceRef→file resolution, no LLM;
   belongs in default CI (\`pd doctor --fix-ci\` scaffolds it).

## Command reference

\`\`\`
${help}
\`\`\`

This block is regenerated from \`pd --help\` (\`pnpm gen:cli-doc\`), so the
terminal is always the live source.
`

fs.writeFileSync(outFile, page)
console.log(`wrote ${path.relative(process.cwd(), outFile)} (${help.split('\n').length} help lines)`)
