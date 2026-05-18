---
title: Pizza Doc
description: File-based architecture-as-code for systems that are too big to hold in your head but too small to deserve a wiki.
template: splash
hero:
  title: Architecture as code, actually.
  tagline: |
    Describe your system as YAML. Validate the graph. Render it live. Export it for AI agents. Local-first, no backend, no lock-in.
  actions:
    - text: Get started
      link: /guides/getting-started/
      icon: right-arrow
      variant: primary
    - text: View on GitHub
      link: https://github.com/pizza-doc/pizza-doc
      icon: external
---

## What Pizza Doc is

A small, opinionated framework for describing a software system as a set of
YAML files — actors, modules, components, models, tables, and use cases —
and getting something useful back out:

- a **strict validator** that catches broken refs, type-incompatible data
  flow, unused DTOs, cyclic calls, and 20+ other common drift patterns;
- a **live web UI** that renders each use case as an interactive diagram
  and lets you edit entities in a Zod-typed form;
- an **AI-friendly export** — one flat Markdown file with angle-bracketed
  refs, designed to paste into an LLM context without overflow.

The whole thing runs locally against your filesystem through the
browser's File System Access API. No database, no SaaS, no account.

## Why it exists

Architecture documents rot. Diagrams diverge from code. AI agents dropped
into a new codebase spend half their context rediscovering the module
boundaries that were already decided last quarter.

Pizza Doc bets that if the source of truth for *shape* lives in the repo
as diffable YAML, every downstream tool — the UI, the AI export, a CI
check, a future MCP server — can rebuild from it on demand.

## Three commands to try it

```bash
pnpm install
pnpm build
pnpm --filter @pizza-doc/web dev
```

Open the URL Vite prints, pick the `spaces/` folder in this repo, and load
`pizza-shop-demo`. Everything is keyboard-first — press `?` for the cheat
sheet.

## Next steps

- [Getting started](/guides/getting-started/) — install, run, load the
  demo.
- [Your first space](/guides/your-first-space/) — hand-author a space
  from scratch.
- [Spaces and entities](/concepts/spaces-and-entities/) — the mental
  model.
- [Validation rules](/reference/validation-rules/) — every code the
  validator can emit.
