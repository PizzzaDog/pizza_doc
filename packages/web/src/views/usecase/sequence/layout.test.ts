import type { LevelView, Message, Participant } from '@pizza-doc/core'
import { describe, expect, it } from 'vitest'
import { layoutSequence } from './layout'

// ---------- Helpers ----------

function p(id: string, label = id, kind: Participant['kind'] = 'module'): Participant {
  return { id, label, kind, hasDeeper: false, ref: id }
}

function msg(partial: Partial<Message> & Pick<Message, 'from' | 'to'>): Message {
  return { kind: 'call', ...partial }
}

function view(participants: Participant[], messages: Message[]): LevelView {
  return { participants, messages }
}

// ---------- Columns ----------

describe('layoutSequence — columns', () => {
  it('creates one column per participant in order', () => {
    const level = view([p('actor:u'), p('module:web'), p('module:api')], [])
    const geom = layoutSequence(level, 1200)
    expect(geom.columns.map((c) => c.participantId)).toEqual([
      'actor:u',
      'module:web',
      'module:api',
    ])
  })

  it('centerX is strictly increasing', () => {
    const level = view([p('a'), p('b'), p('c'), p('d')], [])
    const geom = layoutSequence(level, 2000)
    const xs = geom.columns.map((c) => c.centerX)
    for (let i = 1; i < xs.length; i++) {
      const prev = xs[i - 1]
      const cur = xs[i]
      expect(cur).toBeDefined()
      expect(prev).toBeDefined()
      if (cur !== undefined && prev !== undefined) expect(cur).toBeGreaterThan(prev)
    }
  })

  it('columns never overlap', () => {
    const level = view([p('web-frontend-long'), p('api-server'), p('postgres-db'), p('stripe')], [])
    const geom = layoutSequence(level, 2000)
    for (let i = 1; i < geom.columns.length; i++) {
      const prev = geom.columns[i - 1]
      const cur = geom.columns[i]
      if (!prev || !cur) continue
      expect(cur.left).toBeGreaterThan(prev.right)
    }
  })

  it('clamps column width to [minColumnWidth, maxColumnWidth]', () => {
    const level = view(
      [
        p('a', 'x'),
        p('b', 'A super duper unreasonably long participant label that should truncate'),
      ],
      [],
    )
    const geom = layoutSequence(level, 2000, { minColumnWidth: 100, maxColumnWidth: 220 })
    for (const col of geom.columns) {
      expect(col.width).toBeGreaterThanOrEqual(100)
      expect(col.width).toBeLessThanOrEqual(220)
    }
  })

  it('every participant is reachable via byParticipantId', () => {
    const ids = ['one', 'two', 'three', 'four']
    const level = view(
      ids.map((id) => p(id)),
      [],
    )
    const geom = layoutSequence(level, 800)
    for (const id of ids) expect(geom.byParticipantId.has(id)).toBe(true)
  })
})

// ---------- Viewport sizing ----------

describe('layoutSequence — viewport sizing', () => {
  it('never renders below the viewport width', () => {
    const level = view([p('a'), p('b')], [])
    const geom = layoutSequence(level, 1440)
    expect(geom.width).toBeGreaterThanOrEqual(1440)
  })

  it('extends past the viewport when content is wider', () => {
    const participants: Participant[] = Array.from({ length: 12 }, (_, i) => p(`m${i}`))
    const level = view(participants, [])
    const geom = layoutSequence(level, 600)
    expect(geom.width).toBeGreaterThan(600)
  })
})

// ---------- Rows ----------

describe('layoutSequence — rows', () => {
  it('produces one row per message in order', () => {
    const level = view(
      [p('a'), p('b')],
      [msg({ from: 'a', to: 'b' }), msg({ from: 'b', to: 'a', kind: 'return' })],
    )
    const geom = layoutSequence(level, 1200)
    expect(geom.rows).toHaveLength(2)
    expect(geom.rows.map((r) => r.messageIndex)).toEqual([0, 1])
  })

  it('y increases monotonically across rows', () => {
    const level = view(
      [p('a'), p('b')],
      Array.from({ length: 5 }, (_, i) =>
        msg({ from: i % 2 === 0 ? 'a' : 'b', to: i % 2 === 0 ? 'b' : 'a' }),
      ),
    )
    const geom = layoutSequence(level, 1200)
    for (let i = 1; i < geom.rows.length; i++) {
      const prev = geom.rows[i - 1]
      const cur = geom.rows[i]
      if (!prev || !cur) continue
      expect(cur.y).toBeGreaterThan(prev.y)
    }
  })

  it('first row sits below the header band and last above messagesBottom', () => {
    const level = view(
      [p('a'), p('b')],
      [msg({ from: 'a', to: 'b' }), msg({ from: 'b', to: 'a', kind: 'return' })],
    )
    const geom = layoutSequence(level, 1200)
    const first = geom.rows[0]
    const last = geom.rows[geom.rows.length - 1]
    expect(first?.y).toBeGreaterThan(geom.headerBottom)
    expect(last?.y).toBeLessThan(geom.messagesBottom)
  })

  it('routes ingress refs to the left gutter x', () => {
    const level = view([p('a'), p('b')], [msg({ from: 'gutter:module:web', to: 'a' })])
    const geom = layoutSequence(level, 1200)
    const row = geom.rows[0]
    expect(row?.isIngress).toBe(true)
    expect(row?.fromX).toBe(geom.leftGutterX)
  })

  it('routes egress refs to the right gutter x', () => {
    const level = view([p('a'), p('b')], [msg({ from: 'b', to: 'gutter:module:postgres' })])
    const geom = layoutSequence(level, 1200)
    const row = geom.rows[0]
    expect(row?.isEgress).toBe(true)
    expect(row?.toX).toBe(geom.rightGutterX)
  })

  it('flags self-arcs when from == to', () => {
    const level = view([p('svc')], [msg({ from: 'svc', to: 'svc' })])
    const geom = layoutSequence(level, 1200)
    expect(geom.rows[0]?.isSelfArc).toBe(true)
  })
})

// ---------- Activation bands ----------

describe('layoutSequence — activation bands', () => {
  it('opens a band on the target at call time and closes at return', () => {
    const level = view(
      [p('a'), p('b')],
      [
        msg({ from: 'a', to: 'b' }), // call opens b
        msg({ from: 'b', to: 'a', kind: 'return' }), // return closes b
      ],
    )
    const geom = layoutSequence(level, 1200)
    const b = geom.byParticipantId.get('b')
    expect(b).toBeDefined()
    expect(b?.activationBands).toHaveLength(1)
    const band = b?.activationBands[0]
    expect(band).toBeDefined()
    if (band) {
      expect(band.y1).toBe(geom.rows[0]?.y)
      expect(band.y2).toBe(geom.rows[1]?.y)
      expect(band.y2).toBeGreaterThan(band.y1)
    }
  })

  it('drains open bands at messagesBottom if the flow never closed them', () => {
    const level = view([p('a'), p('b')], [msg({ from: 'a', to: 'b' })])
    const geom = layoutSequence(level, 1200)
    const b = geom.byParticipantId.get('b')
    const band = b?.activationBands[0]
    expect(band?.y2).toBe(geom.messagesBottom)
  })

  it('does not open a band for async calls', () => {
    const level = view([p('a'), p('b')], [msg({ from: 'a', to: 'b', kind: 'async' })])
    const geom = layoutSequence(level, 1200)
    const b = geom.byParticipantId.get('b')
    expect(b?.activationBands).toHaveLength(0)
  })
})

// ---------- Edge cases ----------

describe('layoutSequence — edge cases', () => {
  it('handles empty participants + empty messages without crashing', () => {
    const geom = layoutSequence(view([], []), 1200)
    expect(geom.columns).toHaveLength(0)
    expect(geom.rows).toHaveLength(0)
    expect(geom.width).toBe(1200)
  })

  it('messages referencing unknown participants fall back to gutter x', () => {
    const level = view([p('a')], [msg({ from: 'nonexistent', to: 'a' })])
    const geom = layoutSequence(level, 1200)
    const row = geom.rows[0]
    expect(row).toBeDefined()
    // unknown sender ends up on the left gutter since fromIsGutter is false
    // but byParticipantId.get returns undefined → fallback to leftGutterX.
    expect(row?.fromX).toBe(geom.leftGutterX)
    expect(row?.isIngress).toBe(false)
  })
})
