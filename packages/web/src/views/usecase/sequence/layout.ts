/**
 * Layout engine for the sequence-view canvas. Pure function, no DOM.
 * Given a {@link LevelView} from `@pizza-doc/core` plus a viewport width,
 * produces a {@link LayoutGeometry} the SVG renderer consumes verbatim.
 *
 * Grid guarantees no overlap by construction:
 *   - one column per participant, width clamped to a legible range;
 *   - one row per message, fixed height;
 *   - cross-view refs (`gutter:<ref>`) resolve to the left/right gutter x.
 *
 * Activation bars per participant are derived from a second pass over
 * messages that simulates the call stack — when a participant is on the
 * stack, its lifeline renders a thin vertical band.
 */

import type { LevelView, Message, Participant } from '@pizza-doc/core'

// ---------- Config ----------

export interface LayoutConfig {
  /** Minimum column width in px. Applies after label measurement. */
  minColumnWidth?: number
  /** Hard cap on column width; long labels wrap or truncate in the renderer. */
  maxColumnWidth?: number
  /** Horizontal gap between adjacent column edges. */
  columnGap?: number
  /** Vertical space per message row. */
  rowHeight?: number
  /** Vertical space reserved for participant header boxes. */
  headerHeight?: number
  /** Canvas padding (px). */
  paddingX?: number
  paddingY?: number
  /** Width of the ingress/egress gutter on each side. */
  gutterWidth?: number
  /** Average character width in pixels for the participant label font (mono-11-ish). */
  charWidth?: number
}

const DEFAULTS: Required<LayoutConfig> = {
  minColumnWidth: 148,
  maxColumnWidth: 260,
  columnGap: 48,
  rowHeight: 56,
  headerHeight: 60,
  paddingX: 32,
  paddingY: 22,
  gutterWidth: 96,
  charWidth: 7.6,
}

// ---------- Output ----------

export interface LayoutGeometry {
  width: number
  height: number
  headerTop: number
  headerBottom: number
  messagesTop: number
  messagesBottom: number
  columns: ColumnLayout[]
  rows: RowLayout[]
  /** `participantId` → column. */
  byParticipantId: Map<string, ColumnLayout>
  /** Left gutter center x (for `gutter:*` senders). */
  leftGutterX: number
  /** Right gutter center x (for `gutter:*` targets). */
  rightGutterX: number
}

export interface ColumnLayout {
  participantId: string
  index: number
  /** x of the lifeline — the column's visual centre. */
  centerX: number
  /** Left / right edge of the participant box. */
  left: number
  right: number
  width: number
  /** Active `(y1, y2)` bands on the lifeline; inclusive of header bottom. */
  activationBands: ActivationBand[]
}

export interface ActivationBand {
  y1: number
  y2: number
}

export interface RowLayout {
  /** Index in `level.messages`. */
  messageIndex: number
  y: number
  fromX: number
  toX: number
  fromParticipantId: string
  toParticipantId: string
  /** `true` when the sender is a `gutter:*` id (enters from a neighbour view). */
  isIngress: boolean
  /** `true` when the target is a `gutter:*` id (exits to a neighbour view). */
  isEgress: boolean
  /** `true` when the arrow starts and ends on the same column (recursion at L3). */
  isSelfArc: boolean
}

// ---------- Entry point ----------

export function layoutSequence(
  level: LevelView,
  viewportWidth = 0,
  config: LayoutConfig = {},
): LayoutGeometry {
  const cfg: Required<LayoutConfig> = { ...DEFAULTS, ...config }

  const { columns, byParticipantId, contentWidth } = layOutColumns(level.participants, cfg)

  // Content-driven width: gutters + padding + columns. When a viewport width
  // is supplied (legacy callers without pan/zoom), floor to it so the SVG
  // fills the visible area. Pan/zoom callers pass 0 and let the wrapper
  // handle overflow — the SVG then sizes to its content only.
  const requiredWidth = contentWidth + cfg.gutterWidth * 2 + cfg.paddingX * 2
  const width = Math.max(requiredWidth, viewportWidth)

  // Shift every column right by the left gutter + padding so x=0 is the
  // SVG edge, not the first column edge.
  const leftOffset = cfg.paddingX + cfg.gutterWidth
  for (const col of columns) {
    col.centerX += leftOffset
    col.left += leftOffset
    col.right += leftOffset
  }

  const leftGutterX = cfg.paddingX + cfg.gutterWidth / 2
  const rightGutterX = width - cfg.paddingX - cfg.gutterWidth / 2

  const headerTop = cfg.paddingY
  const headerBottom = headerTop + cfg.headerHeight
  const messagesTop = headerBottom

  const rows = layOutRows(
    level.messages,
    byParticipantId,
    messagesTop,
    cfg.rowHeight,
    leftGutterX,
    rightGutterX,
  )

  const messagesBottom = messagesTop + rows.length * cfg.rowHeight
  const height = messagesBottom + cfg.paddingY

  // Activation bands — second pass. Uses call/return/async kinds from the
  // model (already computed by the stack simulator in core).
  computeActivationBands(level, byParticipantId, rows, messagesBottom)

  return {
    width,
    height,
    headerTop,
    headerBottom,
    messagesTop,
    messagesBottom,
    columns,
    rows,
    byParticipantId,
    leftGutterX,
    rightGutterX,
  }
}

// ---------- Columns ----------

function layOutColumns(
  participants: readonly Participant[],
  cfg: Required<LayoutConfig>,
): {
  columns: ColumnLayout[]
  byParticipantId: Map<string, ColumnLayout>
  contentWidth: number
} {
  const columns: ColumnLayout[] = []
  const byParticipantId = new Map<string, ColumnLayout>()

  let cursor = 0
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i]
    if (!p) continue
    const width = clamp(
      estimateLabelWidth(p.label, cfg.charWidth),
      cfg.minColumnWidth,
      cfg.maxColumnWidth,
    )
    const left = cursor
    const right = left + width
    const centerX = left + width / 2
    const col: ColumnLayout = {
      participantId: p.id,
      index: i,
      centerX,
      left,
      right,
      width,
      activationBands: [],
    }
    columns.push(col)
    byParticipantId.set(p.id, col)
    cursor = right + cfg.columnGap
  }

  // contentWidth is cursor minus the trailing gap we added after the last col.
  const contentWidth = Math.max(0, cursor - cfg.columnGap)
  return { columns, byParticipantId, contentWidth }
}

function estimateLabelWidth(label: string, charWidth: number): number {
  // Add padding for the box chrome (border + internal margin).
  return label.length * charWidth + 48
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

// ---------- Rows ----------

function layOutRows(
  messages: readonly Message[],
  byParticipantId: Map<string, ColumnLayout>,
  messagesTop: number,
  rowHeight: number,
  leftGutterX: number,
  rightGutterX: number,
): RowLayout[] {
  const rows: RowLayout[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg) continue
    const fromIsGutter = msg.from.startsWith('gutter:')
    const toIsGutter = msg.to.startsWith('gutter:')
    const fromCol = fromIsGutter ? null : byParticipantId.get(msg.from)
    const toCol = toIsGutter ? null : byParticipantId.get(msg.to)

    const fromX = fromCol?.centerX ?? leftGutterX
    const toX = toCol?.centerX ?? rightGutterX

    rows.push({
      messageIndex: i,
      y: messagesTop + rowHeight * (i + 0.5),
      fromX,
      toX,
      fromParticipantId: msg.from,
      toParticipantId: msg.to,
      isIngress: fromIsGutter,
      isEgress: toIsGutter,
      isSelfArc: !fromIsGutter && !toIsGutter && msg.from === msg.to,
    })
  }
  return rows
}

// ---------- Activation bands ----------

/**
 * Derive activation bands per column by replaying `kind` transitions over
 * the message list. A `call` to a participant pushes it onto a stack; a
 * `return` to a participant pops the entry above it. `async` doesn't push.
 *
 * We don't rely on the core's stack simulation output here — that was for
 * the model. The renderer only needs to know "which y-ranges is this
 * lifeline active for". Re-simulating is cheap and keeps the layout pass
 * self-contained.
 */
function computeActivationBands(
  level: LevelView,
  byParticipantId: Map<string, ColumnLayout>,
  rows: readonly RowLayout[],
  floor: number,
): void {
  // Active band starts: map participant id → y where its most recent
  // activation began. When it deactivates, we emit a band and clear.
  const openStart = new Map<string, number>()

  function open(participantId: string, y: number): void {
    if (openStart.has(participantId)) return
    openStart.set(participantId, y)
  }

  function close(participantId: string, y: number): void {
    const started = openStart.get(participantId)
    if (started === undefined) return
    const col = byParticipantId.get(participantId)
    if (col) col.activationBands.push({ y1: started, y2: y })
    openStart.delete(participantId)
  }

  for (let i = 0; i < level.messages.length; i++) {
    const msg = level.messages[i]
    const row = rows[i]
    if (!msg || !row) continue
    if (msg.kind === 'call') {
      // Opens activation on the target at this row's y (arrow lands here).
      open(msg.to, row.y)
    } else if (msg.kind === 'return') {
      // Closes activation on the sender at this row's y (returning "up").
      close(msg.from, row.y)
    }
    // async — no stack change.
  }

  // Close everything still open at floor (messages bottom).
  for (const [id] of openStart) {
    close(id, floor)
  }
}
