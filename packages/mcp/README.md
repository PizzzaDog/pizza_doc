# @pizza-doc/mcp

A [Model Context Protocol](https://modelcontextprotocol.io/) server that
exposes Pizza Doc as **structured tools** for AI agents — so the agent
queries your architecture spec by name, ref, or validation code, and
gets back JSON instead of having to grep coloured shell output.

## Why

Without MCP, every Pizza Doc operation an agent does has to go through
the CLI:

```
agent → bash("pd validate spaces/acme")
       → reads ANSI-tinted text
       → regex-parses error counts and messages
       → guesses which entity is meant
```

That's slow, lossy, and burns a lot of tokens on parsing. With MCP:

```
agent → pd_validate({ spaceDir: "..." })
       → { passes, counts, issues: [...], summary: {...} }
       → calls pd_explain_ref / pd_search next, with values from the JSON
```

Same engine (the `@pizza-doc/core` validator), different surface.

## Tools

### Read

| Tool | Returns |
|---|---|
| `pd_validate(spaceDir?)` | passes, counts, issues, entity summary |
| `pd_search(query, kind?, limit?, spaceDir?)` | ranked entity hits with refs |
| `pd_explain_ref(ref, spaceDir?)` | resolved entity + callers/callees/usage |
| `pd_explain_code(code)` | severity, pass, summary, causes, fix |

### Write (scaffolding)

| Tool | Writes |
|---|---|
| `pd_add_actor(id, type?)` | `actors/<id>.yaml` |
| `pd_add_module(id, type?, techStack?)` | `modules/<id>/module.yaml` (+ subdirs) |
| `pd_add_domain(id, module)` | `modules/<m>/domains/<id>/domain.yaml` |
| `pd_add_component(id, module, domain?, type?)` | `.../components/<id>.yaml` |
| `pd_add_model(id, module, modelKind?, values?)` | `.../models/<id>.yaml` |
| `pd_add_table(id, module, domain?)` | `.../tables/<id>.yaml` |

Every scaffold gets a `# yaml-language-server: $schema=...` pragma so
editors validate inline. Scaffolds refuse to overwrite existing files
unless `force: true` is passed.

## Install (during dev)

The CLI binary is `pd-mcp`. The repo's pizza-doc CLI is symlinked
globally through `/opt/homebrew/bin/pd`; do the same for `pd-mcp`:

```bash
pnpm install
pnpm --filter @pizza-doc/mcp build
ln -sf "$(pwd)/packages/mcp/dist/index.js" /opt/homebrew/bin/pd-mcp
chmod +x packages/mcp/dist/index.js
```

After publishing to npm: `npm i -g @pizza-doc/mcp`.

## Wire into your client

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pizza-doc": {
      "command": "pd-mcp"
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add pizza-doc pd-mcp
```

### Cursor

Settings → MCP → Add Server:

```json
{
  "command": "pd-mcp"
}
```

### Anything that speaks JSON-RPC over stdio

```bash
pd-mcp
```

Sends/receives MCP `ListTools`/`CallTool` messages on stdin/stdout.

## What the agent sees

Once wired up, the model gets a tool list whose descriptions point at the
right next step:

> `pd_validate` — *Run the three-pass Pizza Doc validator (schema, refs,
> semantic) against a space and return all issues as structured JSON.
> Use this before drawing conclusions about whether a spec is correct
> — it is the source of truth, never the prose.*

The descriptions are deliberately verbose: triggering accuracy depends
on them.

## Output shape (example)

```jsonc
// pd_validate result
{
  "spaceDir": "/Users/foo/proj/.pizza-doc",
  "metaId": "acme",
  "files": 27,
  "passes": { "schema": true, "refs": true, "semantic": false },
  "counts": { "errors": 0, "warnings": 3, "infos": 0 },
  "issues": [
    {
      "severity": "warning",
      "code": "USECASE_LAST_STEP_NOT_TERMINAL",
      "message": "Use case 'start-run' last step ends at ...",
      "entityRef": "usecase:start-run"
    }
  ],
  "summary": { "actors": 2, "modules": 4, "components": 11, "models": 8, "tables": 3, "useCases": 5 }
}
```

The agent can then call `pd_explain_ref({ ref: "usecase:start-run" })`
to get the entity body, or `pd_explain_code({ code:
"USECASE_LAST_STEP_NOT_TERMINAL" })` to get the rule's intent.

## What this server is *not*

- Not a UI. Use `pd ui` for the canvas.
- Not a code generator. `pd export ...` (CLI) covers OpenAPI / impl
  briefs; codegen for TS / Go / proto is on the v0.2 roadmap.
- Not a multi-space coordinator. One server, one `cwd` (or one
  `spaceDir` arg per call). Cross-space refs are out of scope until v0.3.
- Not a transport-agnostic library. It runs over stdio. If you need
  HTTP, wrap `buildServer()` with the SDK's HTTP transport — the export
  is intentional.
