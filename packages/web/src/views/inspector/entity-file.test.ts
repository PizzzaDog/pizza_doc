import type { Component, Model, Module, Table, UseCase } from '@pizza-doc/core'
import { describe, expect, it } from 'vitest'
import {
  toComponentFile,
  toModelFile,
  toModuleFile,
  toTableFile,
  toUseCaseFile,
} from './entity-file'

describe('inspector entity file serializers', () => {
  it('preserves module error mappings and decisions while omitting child collections', () => {
    const mod: Module = {
      kind: 'module',
      id: 'api',
      name: 'API',
      type: 'service',
      domains: [],
      components: [],
      models: [],
      tables: [],
      configMap: [],
      externalDeps: [],
      decisions: ['ADR-001'],
      stateMachines: [],
      errorMapping: [
        {
          exception: 'NotFoundException',
          httpStatus: 404,
          code: 'NOT_FOUND',
          description: 'Resource was not found.',
        },
      ],
    }

    expect(toModuleFile(mod)).toEqual({
      kind: 'module',
      id: 'api',
      name: 'API',
      type: 'service',
      decisions: ['ADR-001'],
      errorMapping: [
        {
          exception: 'NotFoundException',
          httpStatus: 404,
          code: 'NOT_FOUND',
          description: 'Resource was not found.',
        },
      ],
    })
  })

  it('preserves component, method, and field contract metadata', () => {
    const component: Component = {
      kind: 'component',
      id: 'UserController',
      name: 'UserController',
      type: 'controller',
      sourceRef: 'src/UserController.ts:4',
      routes: [],
      decidedBy: [],
      emits: [],
      subscribes: [],
      methods: [
        {
          name: 'create',
          params: [
            {
              name: 'request',
              type: 'CreateUserRequest',
              persisted: true,
              cardinality: 'one',
              optional: false,
              validation: { minLength: 1 },
              sourceRef: 'src/CreateUserRequest.ts:1',
            },
          ],
          returns: 'UserDto',
          calls: [],
          throws: [],
          sourceRef: 'src/UserController.ts:12',
        },
      ],
    }

    expect(toComponentFile(component)).toEqual({
      kind: 'component',
      id: 'UserController',
      name: 'UserController',
      type: 'controller',
      sourceRef: 'src/UserController.ts:4',
      methods: [
        {
          name: 'create',
          params: [
            {
              name: 'request',
              type: 'CreateUserRequest',
              validation: { minLength: 1 },
              sourceRef: 'src/CreateUserRequest.ts:1',
            },
          ],
          returns: 'UserDto',
          sourceRef: 'src/UserController.ts:12',
        },
      ],
    })
  })

  it('preserves model state machines, topics, source refs, and non-persisted fields', () => {
    const model: Model = {
      kind: 'model',
      id: 'Order',
      name: 'Order',
      modelKind: 'entity',
      topic: 'orders',
      persistedAs: 'module:db/table:orders',
      sourceRef: 'src/Order.ts',
      fields: [
        { name: 'id', type: 'uuid', optional: false, cardinality: 'one', persisted: true },
        {
          name: 'items',
          type: 'List<OrderItem>',
          optional: false,
          cardinality: 'one',
          persisted: false,
          description: 'JPA relation.',
        },
      ],
      stateMachine: {
        field: 'status',
        states: ['CREATED', 'DONE'],
        initial: 'CREATED',
        terminal: ['DONE'],
        stateConfig: [],
        transitions: [{ from: 'CREATED', to: 'DONE', on: 'complete' }],
        scenarios: [],
      },
    }

    expect(toModelFile(model)).toMatchObject({
      topic: 'orders',
      sourceRef: 'src/Order.ts',
      fields: [
        { name: 'id', type: 'uuid' },
        {
          name: 'items',
          type: 'List<OrderItem>',
          persisted: false,
          description: 'JPA relation.',
        },
      ],
      stateMachine: {
        field: 'status',
        states: ['CREATED', 'DONE'],
        initial: 'CREATED',
        terminal: ['DONE'],
        transitions: [{ from: 'CREATED', to: 'DONE', on: 'complete' }],
      },
    })
  })

  it('preserves table defaults and column source refs', () => {
    const table: Table = {
      kind: 'table',
      id: 'orders',
      name: 'orders',
      sourceRef: 'db/schema.sql:10',
      columns: [
        {
          name: 'created_at',
          sqlType: 'timestamptz',
          primaryKey: false,
          nullable: false,
          unique: false,
          default: 'now()',
          sourceRef: 'db/schema.sql:14',
        },
      ],
      indexes: [],
      migrations: [],
    }

    expect(toTableFile(table)).toMatchObject({
      sourceRef: 'db/schema.sql:10',
      columns: [
        {
          name: 'created_at',
          sqlType: 'timestamptz',
          default: 'now()',
          sourceRef: 'db/schema.sql:14',
        },
      ],
    })
  })

  it('preserves use-case requirements, source refs, and many cardinality', () => {
    const useCase: UseCase = {
      kind: 'usecase',
      id: 'place-order',
      name: 'Place order',
      actor: 'actor:customer',
      trigger: 'Customer checks out.',
      steps: [],
      errorFlows: [],
      invariants: { pre: [], post: [] },
      requires: [{ role: 'USER', tenantContext: true }],
      dataFlow: [
        {
          sourceField: 'CreateOrderRequest.items',
          targetField: 'order_items.quantity',
          cardinality: 'many',
        },
      ],
      sourceRef: 'docs/usecases/place-order.md',
    }

    expect(toUseCaseFile(useCase)).toMatchObject({
      requires: [{ role: 'USER', tenantContext: true }],
      dataFlow: [
        {
          sourceField: 'CreateOrderRequest.items',
          targetField: 'order_items.quantity',
          cardinality: 'many',
        },
      ],
      sourceRef: 'docs/usecases/place-order.md',
    })
  })
})
