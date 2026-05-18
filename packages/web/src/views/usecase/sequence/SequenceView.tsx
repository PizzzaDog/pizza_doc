import { cn } from '@/lib/utils'
import type { LevelView, Message, Participant } from '@pizza-doc/core'
import type { ColumnLayout, LayoutGeometry, RowLayout } from './layout'

/**
 * Stateless SVG renderer for one sequence-view level. Takes the level's data
 * + the precomputed geometry + selection state, emits an `<svg>` with:
 *   - participant header boxes at the top
 *   - vertical lifelines (dashed) per participant
 *   - one message row per arrow
 *
 * Click / hover / drill-in are delegated to the parent via callbacks. The
 * component knows nothing about the store; the stateful wrapper
 * owns selection and dispatches.
 */
export interface SequenceViewProps {
  level: LevelView
  geometry: LayoutGeometry
  selectedMessageIndex?: number | null
  onMessageClick?: ((messageIndex: number) => void) | undefined
  onMessageHover?:
    | ((messageIndex: number | null, event: React.MouseEvent<SVGElement> | null) => void)
    | undefined
  onParticipantDrillIn?: ((participantId: string) => void) | undefined
  className?: string
}

export function SequenceView({
  level,
  geometry,
  selectedMessageIndex,
  onMessageClick,
  onMessageHover,
  onParticipantDrillIn,
  className,
}: SequenceViewProps) {
  return (
    <svg
      width={geometry.width}
      height={geometry.height}
      className={cn('block text-fg-primary', className)}
      role="img"
      aria-label="Sequence diagram"
      xmlns="http://www.w3.org/2000/svg"
    >
      <Defs />

      {/* Lifelines first — so activation bands + arrows paint over them. */}
      {geometry.columns.map((col) => {
        const p = level.participants.find((x) => x.id === col.participantId)
        return (
          <Lifeline
            key={`life-${col.participantId}`}
            col={col}
            tier={p?.tier}
            y1={geometry.headerBottom}
            y2={geometry.messagesBottom}
          />
        )
      })}

      {/* Activation bands. */}
      {geometry.columns.flatMap((col) =>
        col.activationBands.map((band, i) => {
          const p = level.participants.find((x) => x.id === col.participantId)
          const tint = tierCssColor(p?.tier) ?? 'var(--fg-tertiary)'
          return (
            <rect
              key={`band-${col.participantId}-${i}`}
              x={col.centerX - 3.5}
              y={band.y1}
              width={7}
              height={Math.max(2, band.y2 - band.y1)}
              className="seq-activation-band"
              rx={3.5}
              style={{ fill: tint }}
            />
          )
        }),
      )}

      {/* Message arrows. */}
      {geometry.rows.map((row) => {
        const message = level.messages[row.messageIndex]
        if (!message) return null
        return (
          <MessageRow
            key={`msg-${row.messageIndex}`}
            row={row}
            message={message}
            selected={selectedMessageIndex === row.messageIndex}
            onClick={onMessageClick}
            onHover={onMessageHover}
          />
        )
      })}

      {/* Participant headers last so they sit above arrow endpoints. */}
      {level.participants.map((p) => {
        const col = geometry.byParticipantId.get(p.id)
        if (!col) return null
        return (
          <ParticipantHeader
            key={`head-${p.id}`}
            participant={p}
            col={col}
            y={geometry.headerTop}
            height={geometry.headerBottom - geometry.headerTop}
            onDrillIn={onParticipantDrillIn}
          />
        )
      })}
    </svg>
  )
}

// ---------- Defs (arrow heads) ----------

function Defs() {
  return (
    <defs>
      <marker
        id="seq-arrow-call"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" className="fill-fg-primary" />
      </marker>
      <marker
        id="seq-arrow-return"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" className="fill-fg-tertiary" />
      </marker>
      <marker
        id="seq-arrow-async"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10" className="fill-none stroke-fg-primary" strokeWidth={1.2} />
      </marker>
      <marker
        id="seq-arrow-selected"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" className="fill-accent" />
      </marker>
    </defs>
  )
}

// ---------- Lifeline ----------

function Lifeline({
  col,
  tier,
  y1,
  y2,
}: {
  col: ColumnLayout
  tier: Participant['tier']
  y1: number
  y2: number
}) {
  const tint = tierCssColor(tier)
  return (
    <line
      x1={col.centerX}
      y1={y1}
      x2={col.centerX}
      y2={y2}
      strokeWidth={2}
      strokeDasharray="5 6"
      strokeLinecap="round"
      style={{
        stroke: tint ?? 'var(--border-subtle)',
        strokeOpacity: tint ? 0.58 : 0.95,
      }}
    />
  )
}

// ---------- Participant header ----------

/**
 * Return the CSS variable that tints a participant by its tier. Modules,
 * components, tables and methods all expose `tier` on the core
 * {@link Participant} — inherited from their owning module — so drill-in
 * levels keep the tier colour coding visible.
 */
function tierCssColor(tier: Participant['tier']): string | null {
  if (!tier || tier === 'queue') return null
  return `var(--kind-${tier})`
}

function ParticipantHeader({
  participant,
  col,
  y,
  height,
  onDrillIn,
}: {
  participant: Participant
  col: ColumnLayout
  y: number
  height: number
  onDrillIn?: ((participantId: string) => void) | undefined
}) {
  const isInteractive = participant.hasDeeper && onDrillIn !== undefined
  const tint = tierCssColor(participant.tier)

  const maxChars = Math.max(8, Math.floor((col.width - 28) / 7.2))
  const label =
    participant.label.length > maxChars
      ? `${participant.label.slice(0, maxChars - 1)}…`
      : participant.label

  function handleActivate() {
    if (isInteractive) onDrillIn?.(participant.id)
  }

  function handleKey(event: React.KeyboardEvent) {
    if (!isInteractive) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleActivate()
    }
  }

  return (
    <g
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={
        isInteractive
          ? `Drill into ${participant.label}`
          : `${participant.kind} ${participant.label}`
      }
      onClick={handleActivate}
      onKeyDown={handleKey}
      data-interactive
      className={cn(
        'outline-none',
        isInteractive && 'cursor-pointer',
        'focus-visible:[&>rect]:stroke-accent',
      )}
    >
      <rect
        x={col.left}
        y={y}
        width={col.width}
        height={height - 12}
        rx={5}
        className={cn(
          'fill-bg-secondary stroke-border transition-colors duration-120',
          isInteractive && 'hover:stroke-fg-tertiary',
        )}
        strokeWidth={1.2}
      />
      {tint ? (
        <line
          x1={col.left + 12}
          x2={col.right - 12}
          y1={y}
          y2={y}
          stroke={tint}
          strokeOpacity={0.8}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ) : null}
      <text
        x={col.centerX}
        y={y + (height - 12) / 2 + 4}
        textAnchor="middle"
        className="fill-fg-primary font-mono text-[13px] font-[450]"
      >
        {label}
      </text>
      {participant.hasDeeper ? (
        <text
          x={col.right - 13}
          y={y + (height - 12) / 2 + 4}
          textAnchor="middle"
          className="fill-fg-muted font-mono text-[12px]"
        >
          ›
        </text>
      ) : null}
      <title>
        {participant.kind}: {participant.label}
        {participant.hasDeeper ? ' · click to drill in' : ''}
      </title>
    </g>
  )
}

// ---------- Message row ----------

function MessageRow({
  row,
  message,
  selected,
  onClick,
  onHover,
}: {
  row: RowLayout
  message: Message
  selected: boolean
  onClick?: ((messageIndex: number) => void) | undefined
  onHover?:
    | ((messageIndex: number | null, event: React.MouseEvent<SVGElement> | null) => void)
    | undefined
}) {
  const stroke = message.kind === 'return' ? 'stroke-fg-tertiary' : 'stroke-fg-primary'
  const strokeWidth = 1.5
  const dashArray = message.kind === 'return' ? '5 4' : undefined
  const markerId =
    selected && message.kind !== 'return'
      ? 'url(#seq-arrow-selected)'
      : message.kind === 'return'
        ? 'url(#seq-arrow-return)'
        : message.kind === 'async'
          ? 'url(#seq-arrow-async)'
          : 'url(#seq-arrow-call)'

  const arrowBody = row.isSelfArc ? (
    <SelfArc row={row} stroke={stroke} strokeWidth={strokeWidth} marker={markerId} />
  ) : (
    <line
      x1={row.fromX}
      y1={row.y}
      x2={row.toX}
      y2={row.y}
      className={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dashArray}
      markerEnd={markerId}
    />
  )

  const ariaLabel = buildAriaLabel(message, row)
  const label = messageLabel(message)
  const labelBox = labelBackgroundBox(label, (row.fromX + row.toX) / 2, row.y - 12)
  const hitBox = arrowHitBox(row, labelBox)

  return (
    <g
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick ? () => onClick(row.messageIndex) : undefined}
      onKeyDown={(e) => {
        if (!onClick) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(row.messageIndex)
        }
      }}
      onMouseEnter={onHover ? (e) => onHover(row.messageIndex, e) : undefined}
      onMouseMove={onHover ? (e) => onHover(row.messageIndex, e) : undefined}
      onMouseLeave={onHover ? () => onHover(null, null) : undefined}
      data-interactive
      className={cn('outline-none', onClick && 'cursor-pointer')}
    >
      {/* Hover target — local band around the arrow, not the full canvas row. */}
      <rect
        x={hitBox.x}
        y={hitBox.y}
        width={hitBox.width}
        height={hitBox.height}
        rx={6}
        className={cn('seq-arrow-hit-bg', selected ? 'is-selected' : 'is-idle')}
      />

      {arrowBody}

      <rect
        x={labelBox.x}
        y={labelBox.y}
        width={labelBox.width}
        height={labelBox.height}
        rx={3}
        className="seq-message-label-bg"
      />
      <text
        x={labelBox.centerX}
        y={labelBox.baselineY}
        textAnchor="middle"
        className={cn(
          'pointer-events-none font-mono text-[12px]',
          message.kind === 'return' ? 'fill-fg-tertiary' : 'fill-fg-primary',
        )}
      >
        {label}
      </text>

      {selected && message.protocol ? (
        <text
          x={(row.fromX + row.toX) / 2}
          y={row.y + 17}
          textAnchor="middle"
          className="pointer-events-none fill-fg-tertiary font-mono text-[9px] uppercase tracking-wider"
        >
          {message.protocol}
          {message.viaDtoRef ? (
            <>
              <tspan className="fill-fg-muted"> · </tspan>
              <tspan className="fill-accent font-[600]">{shortenDtoRef(message.viaDtoRef)}</tspan>
            </>
          ) : null}
        </text>
      ) : null}
    </g>
  )
}

// ---------- Subcomponents ----------

function SelfArc({
  row,
  stroke,
  strokeWidth,
  marker,
}: {
  row: RowLayout
  stroke: string
  strokeWidth: number
  marker: string
}) {
  // Quarter-arc to the right of the lifeline and back. Height = rowHeight/2.
  const x = row.fromX
  const r = 18
  const d = `M ${x},${row.y - r / 2} q ${r * 2},0 0,${r} q -${r * 2},0 -${r},-${r / 2}`
  return <path d={d} fill="none" className={stroke} strokeWidth={strokeWidth} markerEnd={marker} />
}

// ---------- Label helpers ----------

function shortenDtoRef(ref: string): string {
  const model = ref.split('/').pop() ?? ref
  return model.replace(/^model:/, '')
}

function labelBackgroundBox(label: string, centerX: number, baselineY: number) {
  const textWidth = label.length * 7.4
  const width = Math.max(34, textWidth + 14)
  const height = 19
  return {
    x: centerX - width / 2,
    y: baselineY - 14,
    width,
    height,
    centerX,
    baselineY,
  }
}

function arrowHitBox(row: RowLayout, labelBox: ReturnType<typeof labelBackgroundBox>) {
  if (row.isSelfArc) {
    return {
      x: row.fromX - 8,
      y: row.y - 24,
      width: Math.max(64, labelBox.width + 24),
      height: 48,
    }
  }

  const minX = Math.min(row.fromX, row.toX)
  const maxX = Math.max(row.fromX, row.toX)
  return {
    x: minX - 8,
    y: row.y - 22,
    width: Math.max(48, maxX - minX + 16),
    height: 44,
  }
}

function buildAriaLabel(message: Message, row: RowLayout): string {
  const parts: string[] = []
  if (typeof message.stepIndex === 'number') parts.push(`Step ${message.stepIndex}`)
  parts.push(message.kind === 'return' ? 'returns' : message.kind === 'async' ? 'sends' : 'calls')
  parts.push(`from ${shortLabelFromId(row.fromParticipantId)}`)
  parts.push(`to ${shortLabelFromId(row.toParticipantId)}`)
  if (message.protocol) parts.push(`via ${message.protocol}`)
  if (message.inferred) parts.push('(inferred)')
  return parts.join(' ')
}

function shortLabelFromId(id: string): string {
  const tail = id.split('/').pop() ?? id
  return tail.replace(/^gutter:/, '').replace(/^[a-z]+:/, '')
}

function messageLabel(message: Message): string {
  if (message.kind === 'return') return 'return'
  if (message.protocol === 'sql') return sqlLabel(message.description)
  if (message.protocol === 'http' || message.protocol === 'external-api') {
    return httpLabel(message.description) ?? fallbackPayloadLabel(message)
  }
  if (message.description) return actionLabel(message.description)
  return fallbackPayloadLabel(message)
}

function fallbackPayloadLabel(message: Message): string {
  if (message.viaDtoRef) return shortenDtoRef(message.viaDtoRef)
  if (message.protocol) return protocolLabel(message.protocol)
  return 'call'
}

function actionLabel(value: string): string {
  const text = compactLabel(value)
  const exception = text.match(/^(.+?) throws ([A-Za-z][A-Za-z0-9_]*Exception)\b/)
  if (exception?.[2]) return exception[2].replace(/Exception$/, '')

  const afterSuccess = text.match(/^After a successful charge, persist the order/i)
  if (afterSuccess) return 'Persist order'

  const charge = text.match(/^Charge the computed total/i)
  if (charge) return 'Charge total'

  const availability = text.match(/confirm availability/i)
  if (availability) return 'Check availability'

  const propagate = text.match(/^Propagates? to the controller/i)
  if (propagate) return 'Return error'

  return truncateLabel(text)
}

function httpLabel(value: string | undefined): string | null {
  if (!value) return null
  const text = compactLabel(value)
  const match = text.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+([^\s.,]+)/i)
  if (!match?.[1] || !match[2]) return null
  return `${match[1].toUpperCase()} ${match[2]}`
}

function sqlLabel(value: string | undefined): string {
  if (!value) return 'SQL'
  const text = compactLabel(value)

  const select = text.match(/\bSELECT\b[\s\S]*?\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/i)
  if (select?.[1]) return `SELECT ${select[1]}`

  const insert = text.match(/\bINSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)/i)
  if (insert?.[1]) return `INSERT ${insert[1]}`

  const update = text.match(/\bUPDATE\s+([A-Za-z_][A-Za-z0-9_]*)/i)
  if (update?.[1]) return `UPDATE ${update[1]}`

  const deleteFrom = text.match(/\bDELETE\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)/i)
  if (deleteFrom?.[1]) return `DELETE ${deleteFrom[1]}`

  return 'SQL'
}

function compactLabel(value: string): string {
  return value.trim().replace(/\.$/, '').replace(/\s+/g, ' ')
}

function truncateLabel(value: string): string {
  if (value.length <= 30) return value
  return `${value.slice(0, 29).trimEnd()}…`
}

function protocolLabel(protocol: NonNullable<Message['protocol']>): string {
  switch (protocol) {
    case 'http':
      return 'HTTP'
    case 'http-response':
      return 'response'
    case 'sse':
      return 'SSE'
    case 'websocket':
    case 'ws':
      return 'WebSocket'
    case 'internal-call':
      return 'call'
    case 'sql':
      return 'SQL'
    case 'event':
      return 'event'
    case 'external-api':
      return 'external API'
  }
}
