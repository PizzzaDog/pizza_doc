// Render the `pd lint --explain` knowledge base (DOCS in
// packages/cli/src/commands/lint.ts) into the Starlight reference page, so
// the site never lags the validator again. Run:
//   pnpm --filter @pizza-doc/cli build
//   node scripts/gen-validation-rules.mjs
// …or `pnpm gen:rules-doc` (does both).
//
// The page is fully generated — hand edits will be overwritten. To change
// a rule's wording, edit its DOCS entry in lint.ts (the same text serves
// `pd lint --explain <CODE>` in the terminal).

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DOCS } from '../packages/cli/dist/commands/lint.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const outFile = path.join(
  here,
  '..',
  'docs/site/src/content/docs/reference/validation-rules.md',
)

/** Display order + human titles for the `pass` buckets used in DOCS. */
const PASS_TITLES = {
  parse: 'Pass 0 — parse level',
  'change-set': 'Change-set layer',
  schema: 'Pass 1 — schema',
  refs: 'Pass 2 — refs',
  semantic: 'Pass 3 — semantic',
}

function passTitle(pass) {
  return PASS_TITLES[pass] ?? `Pass ${pass}`
}

const entries = Object.entries(DOCS)

// Group by pass, preserving first-appearance order (DOCS is authored in
// emission order).
const groups = new Map()
for (const [code, doc] of entries) {
  if (!groups.has(doc.pass)) groups.set(doc.pass, [])
  groups.get(doc.pass).push([code, doc])
}

const lines = []
lines.push('---')
lines.push('title: Validation rules')
lines.push(
  'description: Every code the Pizza Doc validator can emit — generated from the same source as pd lint --explain.',
)
lines.push('---')
lines.push('')
lines.push('<!-- GENERATED FILE — do not edit by hand. -->')
lines.push(
  '<!-- Source: packages/cli/src/commands/lint.ts (DOCS). Regenerate: pnpm gen:rules-doc -->',
)
lines.push('')
lines.push(
  'The validator emits issues with a `code`, a `severity`, a `message`, and'
)
lines.push(
  'optional `file` / `entityRef` / `suggestion` fields. This page is generated'
)
lines.push(
  'from the same knowledge base that powers `pd lint --explain <CODE>` — the'
)
lines.push('terminal version is always available offline.')
lines.push('')
lines.push(
  'Severities shown are the defaults; several warning/info codes escalate to'
)
lines.push(
  'error under the opt-in strict flags (`--strict-contracts`, `--strict-wiring`,'
)
lines.push(
  '`--check-orphan-paths`, `--check-state-coverage`, `--check-runbook-coverage`,'
)
lines.push(
  '`--strict-wire-capture`) — each rule below says so in its “fix” note when it does.'
)
lines.push('')
lines.push(`## Summary (${entries.length} codes)`)
lines.push('')
lines.push('| Code | Severity | Pass |')
lines.push('| --- | --- | --- |')
for (const [code, doc] of entries) {
  lines.push(`| \`${code}\` | ${doc.severity} | ${doc.pass} |`)
}
lines.push('')

for (const [pass, codes] of groups) {
  lines.push(`## ${passTitle(pass)}`)
  lines.push('')
  for (const [code, doc] of codes) {
    lines.push(`### \`${code}\``)
    lines.push('')
    lines.push(`**Severity:** ${doc.severity}`)
    lines.push('')
    lines.push(doc.summary)
    lines.push('')
    if (doc.causes.length > 0) {
      lines.push('Common causes:')
      lines.push('')
      for (const cause of doc.causes) lines.push(`- ${cause}`)
      lines.push('')
    }
    if (doc.example) {
      lines.push('```yaml')
      lines.push(doc.example.trimEnd())
      lines.push('```')
      lines.push('')
    }
    if (doc.fix) {
      lines.push(`**Fix:** ${doc.fix}`)
      lines.push('')
    }
  }
}

lines.push('## Adding a rule')
lines.push('')
lines.push(
  'See [CONTRIBUTING.md → adding a validation rule](https://github.com/pizza-doc/pizza-doc/blob/main/CONTRIBUTING.md#adding-a-validation-rule).'
)
lines.push(
  'Every new code needs a DOCS entry in `packages/cli/src/commands/lint.ts`;'
)
lines.push('this page regenerates from it via `pnpm gen:rules-doc`.')
lines.push('')

fs.writeFileSync(outFile, lines.join('\n'))
console.log(
  `wrote ${path.relative(process.cwd(), outFile)} (${entries.length} codes, ${groups.size} passes)`,
)
