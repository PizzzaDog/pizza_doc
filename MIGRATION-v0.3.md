# Migrating to Pizza Doc v0.3

v0.3 adds an **operations layer** to the spec: every module declares the
configuration knobs it reads from outside, the external systems it talks
to, and the ADRs that govern its design. The validator checks the
operations layer for the same kind of structural integrity it already
checks for entities.

This guide walks an existing v0.2 space (`pizzaDocVersion: 0.2.0` in
`space.yaml`) to v0.3.

## TL;DR — the fast path

```bash
cd /path/to/your-project
pd migrate v0.2-to-v0.3
```

That command:

1. Backs the current spec into a sibling `*-pre-v0.3-backup/` folder.
2. Regenerates `<space>/schemas/` so editors pick up the new
   `config-map.json` / `external-deps.json` / `adr-frontmatter.json`
   pragmas.
3. Audits any ADR markdown files you already have under `decisions/`,
   reports issues without modifying them.
4. Stamps `meta.pizzaDocVersion` to `0.3.0`.
5. Prints a hand-off summary with the next manual steps.

After that, the spec is _structurally_ at v0.3. The operations
content — `config-map.yaml` and `external-deps.yaml` per module — is
manual to fill in (or AI-assisted; the prompt is below). The validator
will be silent until the new files appear; nothing breaks.

## What `pd migrate` does NOT do

- It never rewrites your authored YAML (modules / actors / use-cases).
- It does not generate config-map / external-deps content from your
  source code. That step is best done by the agent reading
  `pd-extract-<lang>` skills (see [Hand-off prompt](#hand-off-prompt-for-the-agent) below).
- It does not migrate to a new directory layout. v0.3 is a strict
  superset of v0.2 on disk: same files, same paths, plus optional
  additions. You can roll forward, see the new validator output, and
  roll back at any point by restoring the backup.

## What's new in the spec

### `modules/<id>/config-map.yaml`

Top-level YAML list. One entry per env var / property the module reads
from outside itself. Every entry declares:

```yaml
- key: STRIPE_API_KEY
  type: secret           # secret | non-secret
  lifecycle: startup     # build | startup | runtime
  mutability: rotatable  # immortal | rotatable | hot-reload
  consumer:
    component: module:backend/component:PaymentService
    callsite: '@Value("${stripe.api-key}")'   # human-readable, optional
  description: Stripe REST credential.
  related: []            # cross-pairs, e.g. config-map:frontend/VITE_X
  sourceOfTruth: 'vault:secret/acme/stripe/api-key'  # required for secrets
```

Validator rules that fire here:

| Code | When |
|---|---|
| `CONFIG_KEY_DUPLICATE` | Same `key` declared twice in the same module |
| `CONFIG_SECRET_SOURCE_UNRESOLVED` | `type: secret` without a real `sourceOfTruth` (rejects `tbd` / `todo` / empty) |
| `CONFIG_RUNTIME_NO_ADMIN_UI` | `lifecycle: runtime` but no component method/description references the key |
| `CONFIG_RELATED_BROKEN` | `related: [X]` points at a non-existent key |

### `modules/<id>/external-deps.yaml`

Top-level YAML list. One entry per outbound (or inbound webhook) wire to
something outside the application boundary. Internal in-cluster service-
to-service calls are NOT external — those are use-case steps.

```yaml
- name: openrouter
  direction: outbound        # outbound | inbound | bidirectional
  protocol: https            # free-form: https / tcp / grpc / kafka / postgres / ...
  endpoint: api.openrouter.ai
  purpose: LLM completions passthrough
  consumer: module:llm-proxy/component:AnthropicForwarder
  auth: bearer               # none | bearer | api-key | basic | mtls | oauth2 | aws-signature | custom
  usesConfigKey: OPENROUTER_API_KEY
  failureMode: 'circuit break, return 503 to caller'
```

Validator rules:

| Code | When |
|---|---|
| `EXTERNAL_DEP_USES_UNKNOWN_CONFIG` | `usesConfigKey: X` points at a key not in this module's config-map; OR `auth: bearer/api-key/basic/oauth2/aws-signature/custom` without `usesConfigKey` at all |

### `decisions/ADR-NNN-<slug>.md`

Top-level under the space. Markdown with a YAML frontmatter block.
Frontmatter is parsed eagerly; the body stays on disk and is loaded only
when an export needs it (`pd export operations --include-decisions`).

```markdown
---
id: ADR-001
title: 'Runtime: pick Stripe over Adyen'
status: accepted    # proposed | accepted | deprecated | superseded
date: 2026-04-12
decider: lovedeathrobotz
supersedes: []
supersededBy: null
---

# Context

Need a payment gateway with bearer auth.

# Decision

Stripe.

# Consequences

...
```

In `module.yaml` you list ADRs that affect the module:

```yaml
kind: module
id: backend
name: Backend
type: service
techStack: Spring Boot
decisions: [ADR-001, ADR-007]
```

Validator rules:

| Code | When |
|---|---|
| `ADR_BROKEN_LINK` | Module references `ADR-NNN` but no `decisions/ADR-NNN-*.md` file exists |
| `ADR_DUPLICATE_ID` | Two ADR files declare the same id in their frontmatter |

### Drift detection (Phase 3)

`pd drift --from-jsonl <code-snapshot>` now also reports:

| Code | When |
|---|---|
| `CONFIG_REF_NOT_IN_SPEC` | Code reads a config key the module's config-map does not declare |
| `EXTERNAL_CALL_NOT_IN_SPEC` | Code makes an outbound call to an endpoint the module's external-deps does not declare |

Both rules require the JSONL to contain `kind: config-ref` and
`kind: external-call` entries with a `_placement.module` value. The
extract-skills (`pd-extract-typescript` / `python` / `go` / `java`) all
emit these in v0.3 — they're a separate section of each SKILL.md,
unchanged for entity emission.

## Hand-off prompt for the agent

After `pd migrate` finishes, paste this into your AI agent (the one in
the repo's project, with `pd-mcp` connected):

```
Migrate this Pizza Doc spec to v0.3 by populating the operations layer.

Context:
- pd migrate v0.2-to-v0.3 has already run; backup is in *-pre-v0.3-backup/.
- Schemas and pragmas are regenerated; pizzaDocVersion is 0.3.0.
- I now need modules/<id>/config-map.yaml and modules/<id>/external-deps.yaml
  for every service module that reads config or talks to external systems.

Algorithm:
1. Read .claude/skills/pd-extract-<lang>/SKILL.md for the project's
   primary language. Look at the "v0.3 operations evidence" section.
2. For each service module, walk the source for the patterns listed:
   @Value, os.Getenv, process.env, os.environ — config-refs.
   WebClient / http.Client / fetch / SDK constructors — external-calls.
3. For each config-ref, write an entry in modules/<id>/config-map.yaml
   with type, lifecycle, mutability filled in. For secrets, set
   sourceOfTruth to the real store path (ask me if unsure).
4. For each external-call, write an entry in modules/<id>/external-deps.yaml
   with auth scheme and usesConfigKey pointing at the credential.
5. Run pd validate after every module — fix CONFIG_SECRET_SOURCE_UNRESOLVED
   and EXTERNAL_DEP_USES_UNKNOWN_CONFIG before moving on.

Terminal state: pd validate is green except possibly
CONFIG_RUNTIME_NO_ADMIN_UI warnings (those need an admin component
or a lifecycle downgrade — show me the list and I'll decide).

For ADRs: I'll feed you the existing decision history one at a time.
Don't fabricate any.
```

## Roll-back

If anything goes sideways:

```bash
rm -rf .pizza-doc
mv .pizza-doc-pre-v0.3-backup .pizza-doc
```

The backup is a verbatim recursive copy. Restoring it puts you back on
v0.2, and the v0.2-shaped CLI continues to work (the v0.3 codes are
extensions, not replacements).

## What if I already wrote v0.3 features by hand?

`pd migrate` is idempotent. Running it on a space that already has
`config-map.yaml` files, `decisions/` populated, and
`pizzaDocVersion: 0.3.0` is harmless — backup is taken, schemas
regenerated, ADRs audited, version stamp is a no-op. Nothing of yours
gets overwritten.

## Future migrations

This is the second migration helper Pizza Doc has shipped. The pattern
is stable: `pd migrate <from-to> [<dir>]`, backup-first, no implicit
overwrites. v0.4 (cross-space refs / versioned contracts) will land
under the same command shape.
