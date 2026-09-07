---
'@pizza-doc/core': minor
'@pizza-doc/cli': minor
'@pizza-doc/mcp': minor
---

Preserve every inbound endpoint owner for shared method/path pairs and add module-scoped endpoint reports.

- The endpoint index is `METHOD /path → owners[]` (was last-loaded-wins), shared by readiness, use-case coverage, `pd endpoints` / `orphans` and `pd drift`; a shared key stays enforceable while any owner lacks a `readiness.orphan` reason.
- `INBOUND_HTTP_COMPONENT_TYPES` (`controller`, `consumer`, `subscriber`, `middleware`) is exported from core as the single source of truth for endpoint ownership; `client` / `page` / `widget` http metadata is the apiClient idiom and never counts.
- `pd endpoints --module <id>` narrows the report to one module's owners.
- `pd drift` compares endpoints per (verb+path, owner module): a route served by two modules never reports false drift for the shadowed owner, and a genuinely missing owner is still reported. `--json` endpoint entries are `{ key, module }` objects instead of bare `METHOD /path` strings.
