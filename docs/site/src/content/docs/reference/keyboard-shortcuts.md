---
title: Keyboard shortcuts
description: Every chord the web UI listens for.
---

The UI is keyboard-first. Press `?` anywhere (outside a text input) to
see the live cheat sheet.

## Global

| Keys | Action |
| --- | --- |
| ⌘K | Open command palette |
| ⌘B | Toggle sidebar |
| ⌘I | Toggle inspector |
| ⌘E | Open inspector **Edit** tab (expands panel if collapsed) |
| ⌘/ | Open inspector **YAML** tab (expands panel if collapsed) |
| ⌘S | Toast "Pizza Doc saves automatically" — Monaco still captures ⌘S inside the YAML tab |
| ⌘Z | Undo last edit (capped at 50) |
| ⌘⇧Z | Redo |
| ? | Open help modal |
| Esc | Close overlay / clear canvas selection |

## Canvas

| Keys | Action |
| --- | --- |
| 1–9 | Jump to step N of the current use case |
| F | Fit view |
| ⌘scroll | Zoom (scroll alone pans) |
| Esc | Deselect |

## Sidebar

| Keys | Action |
| --- | --- |
| ↑ / ↓ | Move focus |
| ← / → | Collapse / expand (or move to parent) |
| Enter | Activate (navigate or toggle) |
| Space | Toggle expand, or activate leaf |
| Home / End | First / last item |

## Inspector edit form

- **Enter** in a single-line field — commits the field and moves focus
  forward. The autosave runs on blur-after-valid.
- **Tab** — next field. **Shift+Tab** — previous.
- **Esc** — revert field to last-saved value.

## Rules for chord handling

- Any chord originating inside an editable element (input, textarea,
  Monaco, contentEditable) is ignored at the global level so typing
  isn't disrupted. `Esc` is the exception — it's always forwarded, so
  it can close dialogs.
- Modifiers: ⌘ on macOS, Ctrl on other OSes. Alt is never a modifier.
- The palette (⌘K) and help modal (?) are mutually exclusive overlays —
  opening one closes the other via standard Radix modal behaviour.
