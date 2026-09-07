# @pizza-doc/mcp

## 0.7.0

### Minor Changes

- 3bbccd0: Preserve every inbound endpoint owner for shared method/path pairs and add module-scoped endpoint reports.

  - The endpoint index is `METHOD /path → owners[]` (was last-loaded-wins), shared by readiness, use-case coverage, `pd endpoints` / `orphans` and `pd drift`; a shared key stays enforceable while any owner lacks a `readiness.orphan` reason.
  - `INBOUND_HTTP_COMPONENT_TYPES` (`controller`, `consumer`, `subscriber`, `middleware`) is exported from core as the single source of truth for endpoint ownership; `client` / `page` / `widget` http metadata is the apiClient idiom and never counts.
  - `pd endpoints --module <id>` narrows the report to one module's owners.
  - `pd drift` compares endpoints per (verb+path, owner module): a route served by two modules never reports false drift for the shadowed owner, and a genuinely missing owner is still reported. `--json` endpoint entries are `{ key, module }` objects instead of bare `METHOD /path` strings.

### Patch Changes

- Updated dependencies [3bbccd0]
  - @pizza-doc/core@0.7.0

## 0.5.1

### Patch Changes

- `SERVER_VERSION` now reads from `packages/mcp/package.json` via
  `createRequire`, mirroring the `CLI_VERSION` helper. The hardcoded
  `'0.2.0'` literal that survived three releases is gone, and the
  version source-of-truth test asserts MCP parity with the CLI manifest.
- Updated dependencies
  - @pizza-doc/core@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies
  - @pizza-doc/core@0.5.0

## 0.4.0

### Minor Changes

- `pd_search`, `pd_explain`, and similar tools now accept the v0.3 (A1) object form of `Method.calls[]` (`{target, ...}`) alongside legacy ref strings, so existing JSONL snapshots and spaces keep working without code changes on the agent side.
- `pd_operations` MCP tool emits only `http-api` external-deps for now; host-installed kinds (host-binary / host-artifact / apt-package, A3) are intentionally elided pending a dedicated `pd_operations_host_deps` tool. Existing consumers keep working unchanged.

### Patch Changes

- Updated dependencies
  - @pizza-doc/core@0.4.0

## 0.3.0

### Minor Changes

- Improve reverse code-scan imports, validator affordances, and scaffold warnings for production code snapshots.
- Add a production readiness profile that turns spec coverage, operational proof, error-mapping evidence, and optional drift checks into a release gate separate from default validation.

### Patch Changes

- Updated dependencies
  - @pizza-doc/core@0.3.0
