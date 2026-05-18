import { describe, expect, it } from 'vitest'
import {
  ErrorMappingSchema,
  FieldSchema,
  ModelSchema,
  ModuleSchema,
  StateMachineSchema,
  UseCaseRequirementSchema,
  UseCaseSchema,
  ValidationSchema,
} from '../src/schema.js'

/**
 * v0.2 schema extensions — shape-level tests.
 *
 * Each field was added as a backward-compat opt-in: existing space YAMLs
 * without these fields must keep parsing cleanly. These tests lock the
 * shape so the next schema refactor can't silently break authors.
 */

describe('ValidationSchema', () => {
  it('accepts empty (all fields optional)', () => {
    expect(() => ValidationSchema.parse({})).not.toThrow()
  })
  it('accepts a realistic combination', () => {
    const parsed = ValidationSchema.parse({
      format: 'email',
      maxLength: 255,
      description: 'the user login',
    })
    expect(parsed.format).toBe('email')
    expect(parsed.maxLength).toBe(255)
  })
  it('rejects an unknown key under strict', () => {
    expect(() => ValidationSchema.parse({ ghost: true })).toThrow()
  })
  it('accepts enum-style allow-lists', () => {
    const parsed = ValidationSchema.parse({ enumValues: ['a', 'b'] })
    expect(parsed.enumValues).toEqual(['a', 'b'])
  })
})

describe('FieldSchema with validation + sourceRef', () => {
  it('parses a minimal field (back-compat)', () => {
    const parsed = FieldSchema.parse({ name: 'email', type: 'string' })
    expect(parsed.name).toBe('email')
    expect(parsed.validation).toBeUndefined()
  })
  it('parses a field with validation + sourceRef', () => {
    const parsed = FieldSchema.parse({
      name: 'email',
      type: 'string',
      validation: { format: 'email', maxLength: 255 },
      sourceRef: 'apps/backend/src/dto/User.java:14',
    })
    expect(parsed.validation?.format).toBe('email')
    expect(parsed.sourceRef).toBe('apps/backend/src/dto/User.java:14')
  })
})

describe('StateMachineSchema', () => {
  it('parses a valid state machine', () => {
    const parsed = StateMachineSchema.parse({
      field: 'status',
      states: ['A', 'B'],
      transitions: [{ from: 'A', to: 'B' }],
    })
    expect(parsed.states).toEqual(['A', 'B'])
    expect(parsed.terminal).toEqual([])
  })
  it('rejects fewer than 2 states', () => {
    expect(() =>
      StateMachineSchema.parse({ field: 'status', states: ['A'], transitions: [] }),
    ).toThrow()
  })
})

describe('ModelSchema with stateMachine + topic', () => {
  it('parses a model with a stateMachine', () => {
    const parsed = ModelSchema.parse({
      kind: 'model',
      id: 'Order',
      name: 'Order',
      modelKind: 'entity',
      fields: [{ name: 'status', type: 'string' }],
      stateMachine: {
        field: 'status',
        states: ['CREATED', 'DONE'],
        transitions: [{ from: 'CREATED', to: 'DONE' }],
      },
    })
    expect(parsed.stateMachine?.states).toEqual(['CREATED', 'DONE'])
  })
  it('parses an event model with a topic', () => {
    const parsed = ModelSchema.parse({
      kind: 'model',
      id: 'OrderCreated',
      name: 'OrderCreated',
      modelKind: 'event',
      fields: [{ name: 'orderId', type: 'uuid' }],
      topic: 'order-events',
    })
    expect(parsed.topic).toBe('order-events')
  })
})

describe('ModuleSchema with errorMapping', () => {
  it('parses a module with an errorMapping table', () => {
    const parsed = ModuleSchema.parse({
      kind: 'module',
      id: 'backend',
      name: 'Backend',
      type: 'service',
      errorMapping: [
        { exception: 'EntityNotFoundException', httpStatus: 404, code: 'NOT_FOUND' },
        { exception: 'InvalidStateException', httpStatus: 409 },
      ],
    })
    expect(parsed.errorMapping).toHaveLength(2)
    expect(parsed.errorMapping[0]?.code).toBe('NOT_FOUND')
  })
  it('rejects invalid status codes', () => {
    expect(() => ErrorMappingSchema.parse({ exception: 'X', httpStatus: 99 })).toThrow()
  })
})

describe('UseCaseSchema with requires', () => {
  it('parses a use case with requires entries', () => {
    const parsed = UseCaseSchema.parse({
      kind: 'usecase',
      id: 'foo',
      name: 'foo',
      actor: 'actor:user',
      trigger: 'x',
      steps: [{ from: 'module:a/component:B', to: 'module:c/component:D' }],
      requires: [{ role: 'SUPER_ADMIN' }, { tenantRole: 'TENANT_ADMIN', tenantContext: true }],
    })
    expect(parsed.requires).toHaveLength(2)
    expect(parsed.requires[0]?.role).toBe('SUPER_ADMIN')
  })
  it('defaults requires to empty', () => {
    const parsed = UseCaseSchema.parse({
      kind: 'usecase',
      id: 'foo',
      name: 'foo',
      actor: 'actor:user',
      trigger: 'x',
      steps: [{ from: 'module:a/component:B', to: 'module:c/component:D' }],
    })
    expect(parsed.requires).toEqual([])
  })
})

describe('UseCaseRequirementSchema', () => {
  it('accepts empty (fields all optional; useful for free-prose requirements)', () => {
    const parsed = UseCaseRequirementSchema.parse({
      description: 'authenticated; details TBD',
    })
    expect(parsed.description).toBeDefined()
  })
})
