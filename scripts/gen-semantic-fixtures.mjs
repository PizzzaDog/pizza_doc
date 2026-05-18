// One-shot generator for semantic-rule fixture pairs (Phase 3).
// Writes broken + fixed variants under packages/core/__fixtures__/invalid/.
// Not checked into CI; run once, commit generated YAML, keep script as reference.

import { mkdirSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../packages/core/__fixtures__/invalid')

/**
 * @param {string} fixtureId the fixture folder name (also space meta.id)
 * @param {Record<string, string>} files path → content
 */
function writeFixture(fixtureId, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(ROOT, fixtureId, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  console.log(`  wrote ${fixtureId} (${Object.keys(files).length} files)`)
}

const SYS = `kind: actor\nid: sys\nname: System\ntype: system\n`
const UI_MOD = `kind: module\nid: ui\nname: UI\ntype: frontend\n`
const HOME = `kind: component\nid: Home\nname: Home\ntype: page\n`
const API_MOD = `kind: module\nid: api\nname: API\ntype: service\n`
const DB_MOD = `kind: module\nid: db\nname: DB\ntype: database\n`

function space(id, description) {
  return `meta:\n  id: ${id}\n  name: ${description}\n`
}

// ----------------------------------------------------------------------------
// Rule 9: DATAFLOW_TARGET_FIELD_MISSING
// ----------------------------------------------------------------------------

function dataflowBaseFiles() {
  return {
    'actors/sys.yaml': SYS,
    'modules/ui/module.yaml': UI_MOD,
    'modules/ui/components/Home.yaml': HOME,
    'modules/api/module.yaml': API_MOD,
    'modules/api/models/Foo.yaml': `kind: model\nid: Foo\nname: Foo\nmodelKind: dto\nfields:\n  - name: x\n    type: string\n`,
    'modules/db/module.yaml': DB_MOD,
    'modules/db/tables/records.yaml': `kind: table\nid: records\nname: records\ncolumns:\n  - name: id\n    sqlType: uuid\n    primaryKey: true\n  - name: x\n    sqlType: varchar(255)\n`,
  }
}

function dataflowUseCase(dataFlowYaml) {
  return `kind: usecase\nid: uc\nname: dataflow use case\nactor: actor:sys\ntrigger: cron\nsteps:\n  - from: module:ui/component:Home\n    to: module:db/table:records\n    protocol: sql\n${dataFlowYaml}\n`
}

writeFixture('DATAFLOW_TARGET_FIELD_MISSING', {
  'space.yaml': space('DATAFLOW_TARGET_FIELD_MISSING', 'dataFlow target column does not exist'),
  ...dataflowBaseFiles(),
  'use-cases/uc.yaml': dataflowUseCase(
    `dataFlow:\n  - sourceField: Foo.x\n    targetField: records.ghost\n`,
  ),
})
writeFixture('DATAFLOW_TARGET_FIELD_MISSING__fixed', {
  'space.yaml': space('DATAFLOW_TARGET_FIELD_MISSING__fixed', 'Fixed — targetField exists'),
  ...dataflowBaseFiles(),
  'use-cases/uc.yaml': dataflowUseCase(
    `dataFlow:\n  - sourceField: Foo.x\n    targetField: records.x\n`,
  ),
})

// ----------------------------------------------------------------------------
// Rule 10: DATAFLOW_TYPE_INCOMPATIBLE
// int (source) → varchar (target)
// ----------------------------------------------------------------------------

function dataflowTypeBase(fieldType, sqlType) {
  return {
    'actors/sys.yaml': SYS,
    'modules/ui/module.yaml': UI_MOD,
    'modules/ui/components/Home.yaml': HOME,
    'modules/api/module.yaml': API_MOD,
    'modules/api/models/Foo.yaml': `kind: model\nid: Foo\nname: Foo\nmodelKind: dto\nfields:\n  - name: count\n    type: ${fieldType}\n`,
    'modules/db/module.yaml': DB_MOD,
    'modules/db/tables/records.yaml': `kind: table\nid: records\nname: records\ncolumns:\n  - name: id\n    sqlType: uuid\n    primaryKey: true\n  - name: count\n    sqlType: ${sqlType}\n`,
  }
}

writeFixture('DATAFLOW_TYPE_INCOMPATIBLE', {
  'space.yaml': space('DATAFLOW_TYPE_INCOMPATIBLE', 'int field mapped to varchar column'),
  ...dataflowTypeBase('int', 'varchar(255)'),
  'use-cases/uc.yaml': dataflowUseCase(
    `dataFlow:\n  - sourceField: Foo.count\n    targetField: records.count\n`,
  ),
})
writeFixture('DATAFLOW_TYPE_INCOMPATIBLE__fixed', {
  'space.yaml': space('DATAFLOW_TYPE_INCOMPATIBLE__fixed', 'Fixed — types compatible'),
  ...dataflowTypeBase('int', 'int'),
  'use-cases/uc.yaml': dataflowUseCase(
    `dataFlow:\n  - sourceField: Foo.count\n    targetField: records.count\n`,
  ),
})

// ----------------------------------------------------------------------------
// Rule 11: DATAFLOW_TRANSFORM_MISSING
// ----------------------------------------------------------------------------

function dataflowTransformBase(extraComponent) {
  return {
    'actors/sys.yaml': SYS,
    'modules/ui/module.yaml': UI_MOD,
    'modules/ui/components/Home.yaml': HOME,
    'modules/api/module.yaml': API_MOD,
    'modules/api/models/Foo.yaml': `kind: model\nid: Foo\nname: Foo\nmodelKind: dto\nfields:\n  - name: x\n    type: string\n`,
    ...(extraComponent ? { 'modules/api/components/Hasher.yaml': extraComponent } : {}),
    'modules/db/module.yaml': DB_MOD,
    'modules/db/tables/records.yaml': `kind: table\nid: records\nname: records\ncolumns:\n  - name: id\n    sqlType: uuid\n    primaryKey: true\n  - name: x\n    sqlType: varchar(255)\n`,
  }
}

writeFixture('DATAFLOW_TRANSFORM_MISSING', {
  'space.yaml': space('DATAFLOW_TRANSFORM_MISSING', 'transform references a non-existent method'),
  ...dataflowTransformBase(null),
  'use-cases/uc.yaml': dataflowUseCase(
    `dataFlow:\n  - sourceField: Foo.x\n    targetField: records.x\n    transform: via Ghost.transformIt\n`,
  ),
})
writeFixture('DATAFLOW_TRANSFORM_MISSING__fixed', {
  'space.yaml': space(
    'DATAFLOW_TRANSFORM_MISSING__fixed',
    'Fixed — transform refers to real method',
  ),
  ...dataflowTransformBase(
    `kind: component\nid: Hasher\nname: Hasher\ntype: infrastructure\nmethods:\n  - name: hash\n    params:\n      - name: input\n        type: string\n    returns: string\n`,
  ),
  'use-cases/uc.yaml': dataflowUseCase(
    `dataFlow:\n  - sourceField: Foo.x\n    targetField: records.x\n    transform: via Hasher.hash\n`,
  ),
})

// ----------------------------------------------------------------------------
// Rule 12: DATAFLOW_UNUSED_DTO_FIELD
// ----------------------------------------------------------------------------

function unusedDtoBase(fooFields) {
  return {
    'actors/sys.yaml': SYS,
    'modules/ui/module.yaml': UI_MOD,
    'modules/ui/components/Home.yaml': HOME,
    'modules/api/module.yaml': API_MOD,
    'modules/api/models/Foo.yaml': `kind: model\nid: Foo\nname: Foo\nmodelKind: dto\nfields:\n${fooFields}`,
    'modules/api/components/Receiver.yaml': `kind: component\nid: Receiver\nname: Receiver\ntype: service\n`,
    'modules/db/module.yaml': DB_MOD,
    'modules/db/tables/records.yaml': `kind: table\nid: records\nname: records\ncolumns:\n  - name: id\n    sqlType: uuid\n    primaryKey: true\n  - name: x\n    sqlType: varchar(255)\n`,
  }
}

function unusedDtoUseCase(fields) {
  const dataFlowLines = fields
    .map((f) => `  - sourceField: Foo.${f}\n    targetField: records.x\n`)
    .join('')
  return `kind: usecase\nid: uc\nname: uses Foo via\nactor: actor:sys\ntrigger: cron\nsteps:\n  - from: module:ui/component:Home\n    to: module:api/component:Receiver\n    via: module:api/model:Foo\n  - from: module:api/component:Receiver\n    to: module:db/table:records\n    protocol: sql\ndataFlow:\n${dataFlowLines}`
}

writeFixture('DATAFLOW_UNUSED_DTO_FIELD', {
  'space.yaml': space(
    'DATAFLOW_UNUSED_DTO_FIELD',
    'DTO has a required field that never reaches a column',
  ),
  ...unusedDtoBase(`  - name: x\n    type: string\n  - name: ghost\n    type: string\n`),
  'use-cases/uc.yaml': unusedDtoUseCase(['x']),
})
writeFixture('DATAFLOW_UNUSED_DTO_FIELD__fixed', {
  'space.yaml': space('DATAFLOW_UNUSED_DTO_FIELD__fixed', 'Fixed — ghost field removed'),
  ...unusedDtoBase(`  - name: x\n    type: string\n`),
  'use-cases/uc.yaml': unusedDtoUseCase(['x']),
})

// ----------------------------------------------------------------------------
// Rule 13: DATAFLOW_UNWRITTEN_REQUIRED_COLUMN
// Non-nullable, non-PK column that no dataFlow writes to.
// ----------------------------------------------------------------------------

function unwrittenBase(tableCols) {
  return {
    'actors/sys.yaml': SYS,
    'modules/ui/module.yaml': UI_MOD,
    'modules/ui/components/Home.yaml': HOME,
    'modules/api/module.yaml': API_MOD,
    'modules/api/models/Foo.yaml': `kind: model\nid: Foo\nname: Foo\nmodelKind: dto\nfields:\n  - name: email\n    type: string\n  - name: passwordHash\n    type: string\n`,
    'modules/db/module.yaml': DB_MOD,
    'modules/db/tables/users.yaml': `kind: table\nid: users\nname: users\ncolumns:\n${tableCols}`,
  }
}

writeFixture('DATAFLOW_UNWRITTEN_REQUIRED_COLUMN', {
  'space.yaml': space(
    'DATAFLOW_UNWRITTEN_REQUIRED_COLUMN',
    'non-nullable column is not produced by dataFlow',
  ),
  ...unwrittenBase(
    `  - name: id\n    sqlType: uuid\n    primaryKey: true\n  - name: email\n    sqlType: varchar(255)\n  - name: password_hash\n    sqlType: varchar(255)\n`,
  ),
  'use-cases/uc.yaml': `kind: usecase\nid: uc\nname: writes only email\nactor: actor:sys\ntrigger: cron\nsteps:\n  - from: module:ui/component:Home\n    to: module:db/table:users\n    protocol: sql\ndataFlow:\n  - sourceField: Foo.email\n    targetField: users.email\n`,
})
writeFixture('DATAFLOW_UNWRITTEN_REQUIRED_COLUMN__fixed', {
  'space.yaml': space('DATAFLOW_UNWRITTEN_REQUIRED_COLUMN__fixed', 'Fixed — both columns written'),
  ...unwrittenBase(
    `  - name: id\n    sqlType: uuid\n    primaryKey: true\n  - name: email\n    sqlType: varchar(255)\n  - name: password_hash\n    sqlType: varchar(255)\n`,
  ),
  'use-cases/uc.yaml': `kind: usecase\nid: uc\nname: writes both columns\nactor: actor:sys\ntrigger: cron\nsteps:\n  - from: module:ui/component:Home\n    to: module:db/table:users\n    protocol: sql\ndataFlow:\n  - sourceField: Foo.email\n    targetField: users.email\n  - sourceField: Foo.passwordHash\n    targetField: users.password_hash\n`,
})

// ----------------------------------------------------------------------------
// Rule 14: DUPLICATE_ID — two component files with the same id in one scope.
// Uses the .yaml + .yml extension trick.
// ----------------------------------------------------------------------------

writeFixture('DUPLICATE_ID', {
  'space.yaml': space('DUPLICATE_ID', 'two components with the same id in the same scope'),
  'modules/api/module.yaml': API_MOD,
  'modules/api/components/Dup.yaml': `kind: component\nid: Dup\nname: Dup\ntype: service\n`,
  'modules/api/components/Dup.yml': `kind: component\nid: Dup\nname: Dup (duplicate)\ntype: service\n`,
})
writeFixture('DUPLICATE_ID__fixed', {
  'space.yaml': space('DUPLICATE_ID__fixed', 'Fixed — only one component with that id'),
  'modules/api/module.yaml': API_MOD,
  'modules/api/components/Dup.yaml': `kind: component\nid: Dup\nname: Dup\ntype: service\n`,
})

// ----------------------------------------------------------------------------
// Rule 15: CYCLIC_CALLS
// ----------------------------------------------------------------------------

writeFixture('CYCLIC_CALLS', {
  'space.yaml': space('CYCLIC_CALLS', 'A.foo and B.bar call each other'),
  'modules/api/module.yaml': API_MOD,
  'modules/api/components/A.yaml': `kind: component\nid: A\nname: A\ntype: service\nmethods:\n  - name: foo\n    returns: void\n    calls:\n      - module:api/component:B/method:bar\n`,
  'modules/api/components/B.yaml': `kind: component\nid: B\nname: B\ntype: service\nmethods:\n  - name: bar\n    returns: void\n    calls:\n      - module:api/component:A/method:foo\n`,
})
writeFixture('CYCLIC_CALLS__fixed', {
  'space.yaml': space('CYCLIC_CALLS__fixed', 'Fixed — cycle broken'),
  'modules/api/module.yaml': API_MOD,
  'modules/api/components/A.yaml': `kind: component\nid: A\nname: A\ntype: service\nmethods:\n  - name: foo\n    returns: void\n    calls:\n      - module:api/component:B/method:bar\n`,
  'modules/api/components/B.yaml': `kind: component\nid: B\nname: B\ntype: service\nmethods:\n  - name: bar\n    returns: void\n`,
})

// ----------------------------------------------------------------------------
// Rule 16: ACTOR_UNUSED
// ----------------------------------------------------------------------------

const simpleUc = `kind: usecase\nid: uc\nname: simple\nactor: actor:used\ntrigger: cron\nsteps:\n  - from: module:ui/component:Home\n    to: module:ui/component:Home\n`

writeFixture('ACTOR_UNUSED', {
  'space.yaml': space('ACTOR_UNUSED', 'an actor is declared but no use case references it'),
  'actors/used.yaml': `kind: actor\nid: used\nname: Used\ntype: system\n`,
  'actors/unused.yaml': `kind: actor\nid: unused\nname: Unused\ntype: system\n`,
  'modules/ui/module.yaml': UI_MOD,
  'modules/ui/components/Home.yaml': HOME,
  'use-cases/uc.yaml': simpleUc,
})
writeFixture('ACTOR_UNUSED__fixed', {
  'space.yaml': space('ACTOR_UNUSED__fixed', 'Fixed — only actors that are used'),
  'actors/used.yaml': `kind: actor\nid: used\nname: Used\ntype: system\n`,
  'modules/ui/module.yaml': UI_MOD,
  'modules/ui/components/Home.yaml': HOME,
  'use-cases/uc.yaml': simpleUc,
})

// ----------------------------------------------------------------------------
// Rule 17: COMPONENT_UNUSED
// ----------------------------------------------------------------------------

const componentUcBody = `kind: usecase\nid: uc\nname: only uses Used\nactor: actor:sys\ntrigger: cron\nsteps:\n  - from: module:api/component:Used\n    to: module:api/component:Used\n`

writeFixture('COMPONENT_UNUSED', {
  'space.yaml': space('COMPONENT_UNUSED', 'a component is declared but never referenced'),
  'actors/sys.yaml': SYS,
  'modules/api/module.yaml': API_MOD,
  'modules/api/components/Used.yaml': `kind: component\nid: Used\nname: Used\ntype: page\n`,
  'modules/api/components/Unused.yaml': `kind: component\nid: Unused\nname: Unused\ntype: service\n`,
  'modules/ui/module.yaml': UI_MOD,
  'modules/ui/components/Home.yaml': HOME,
  'use-cases/uc.yaml': `kind: usecase\nid: uc\nname: only uses Used\nactor: actor:sys\ntrigger: cron\nsteps:\n  - from: module:ui/component:Home\n    to: module:api/component:Used\n  - from: module:api/component:Used\n    to: module:ui/component:Home\n`,
})
writeFixture('COMPONENT_UNUSED__fixed', {
  'space.yaml': space('COMPONENT_UNUSED__fixed', 'Fixed — unused component removed'),
  'actors/sys.yaml': SYS,
  'modules/api/module.yaml': API_MOD,
  'modules/api/components/Used.yaml': `kind: component\nid: Used\nname: Used\ntype: page\n`,
  'modules/ui/module.yaml': UI_MOD,
  'modules/ui/components/Home.yaml': HOME,
  'use-cases/uc.yaml': `kind: usecase\nid: uc\nname: only uses Used\nactor: actor:sys\ntrigger: cron\nsteps:\n  - from: module:ui/component:Home\n    to: module:api/component:Used\n  - from: module:api/component:Used\n    to: module:ui/component:Home\n`,
})

// ----------------------------------------------------------------------------
// Rule 18: DTO_UNUSED
// ----------------------------------------------------------------------------

const dtoUsedUc = `kind: usecase\nid: uc\nname: uses UsedDto\nactor: actor:sys\ntrigger: cron\nsteps:\n  - from: module:ui/component:Home\n    to: module:api/component:Receiver\n    via: module:api/model:UsedDto\n  - from: module:api/component:Receiver\n    to: module:ui/component:Home\n`

writeFixture('DTO_UNUSED', {
  'space.yaml': space('DTO_UNUSED', 'a model is declared but nobody references it'),
  'actors/sys.yaml': SYS,
  'modules/ui/module.yaml': UI_MOD,
  'modules/ui/components/Home.yaml': HOME,
  'modules/api/module.yaml': API_MOD,
  'modules/api/models/UsedDto.yaml': `kind: model\nid: UsedDto\nname: UsedDto\nmodelKind: dto\nfields:\n  - name: x\n    type: string\n    optional: true\n`,
  'modules/api/models/UnusedDto.yaml': `kind: model\nid: UnusedDto\nname: UnusedDto\nmodelKind: dto\nfields:\n  - name: y\n    type: string\n    optional: true\n`,
  'modules/api/components/Receiver.yaml': `kind: component\nid: Receiver\nname: Receiver\ntype: service\nmethods:\n  - name: accept\n    params:\n      - name: input\n        type: UsedDto\n    returns: void\n`,
  'use-cases/uc.yaml': dtoUsedUc,
})
writeFixture('DTO_UNUSED__fixed', {
  'space.yaml': space('DTO_UNUSED__fixed', 'Fixed — unused model removed'),
  'actors/sys.yaml': SYS,
  'modules/ui/module.yaml': UI_MOD,
  'modules/ui/components/Home.yaml': HOME,
  'modules/api/module.yaml': API_MOD,
  'modules/api/models/UsedDto.yaml': `kind: model\nid: UsedDto\nname: UsedDto\nmodelKind: dto\nfields:\n  - name: x\n    type: string\n    optional: true\n`,
  'modules/api/components/Receiver.yaml': `kind: component\nid: Receiver\nname: Receiver\ntype: service\nmethods:\n  - name: accept\n    params:\n      - name: input\n        type: UsedDto\n    returns: void\n`,
  'use-cases/uc.yaml': dtoUsedUc,
})

// ----------------------------------------------------------------------------
// Rule 19: MODEL_FIELD_MISSING_COLUMN
// ----------------------------------------------------------------------------

function modelFieldBase(modelFields) {
  return {
    'actors/sys.yaml': SYS,
    'modules/ui/module.yaml': UI_MOD,
    'modules/ui/components/Home.yaml': HOME,
    'modules/api/module.yaml': API_MOD,
    'modules/api/models/User.yaml': `kind: model\nid: User\nname: User\nmodelKind: entity\npersistedAs: module:db/domain:users/table:users\nfields:\n${modelFields}`,
    'modules/api/components/UserRepo.yaml': `kind: component\nid: UserRepo\nname: UserRepo\ntype: repository\nmethods:\n  - name: save\n    params:\n      - name: u\n        type: User\n    returns: void\n`,
    'modules/db/module.yaml': DB_MOD,
    'modules/db/domains/users/domain.yaml': `id: users\nname: Users\n`,
    'modules/db/domains/users/tables/users.yaml': `kind: table\nid: users\nname: users\ncolumns:\n  - name: id\n    sqlType: uuid\n    primaryKey: true\n  - name: email\n    sqlType: varchar(255)\n`,
    'use-cases/uc.yaml': `kind: usecase\nid: uc\nname: writes a user\nactor: actor:sys\ntrigger: cron\nsteps:\n  - from: module:ui/component:Home\n    to: module:api/component:UserRepo\n  - from: module:api/component:UserRepo\n    to: module:db/domain:users/table:users\n    protocol: sql\n`,
  }
}

writeFixture('MODEL_FIELD_MISSING_COLUMN', {
  'space.yaml': space('MODEL_FIELD_MISSING_COLUMN', 'required model field has no matching column'),
  ...modelFieldBase(
    `  - name: id\n    type: uuid\n  - name: email\n    type: string\n  - name: ghost\n    type: string\n`,
  ),
})
writeFixture('MODEL_FIELD_MISSING_COLUMN__fixed', {
  'space.yaml': space(
    'MODEL_FIELD_MISSING_COLUMN__fixed',
    'Fixed — all required fields map to columns',
  ),
  ...modelFieldBase(`  - name: id\n    type: uuid\n  - name: email\n    type: string\n`),
})

// ----------------------------------------------------------------------------
// Rule 20: FK_COLUMN_MISSING
// ----------------------------------------------------------------------------

function fkBase(fkColumn) {
  return {
    'modules/db/module.yaml': DB_MOD,
    'modules/db/tables/users.yaml': `kind: table\nid: users\nname: users\ncolumns:\n  - name: id\n    sqlType: uuid\n    primaryKey: true\n`,
    'modules/db/tables/sessions.yaml': `kind: table\nid: sessions\nname: sessions\ncolumns:\n  - name: id\n    sqlType: uuid\n    primaryKey: true\n  - name: user_id\n    sqlType: uuid\n    foreignKey:\n      table: module:db/table:users\n      column: ${fkColumn}\n`,
  }
}

writeFixture('FK_COLUMN_MISSING', {
  'space.yaml': space('FK_COLUMN_MISSING', 'foreignKey references a non-existent column'),
  ...fkBase('ghost'),
})
writeFixture('FK_COLUMN_MISSING__fixed', {
  'space.yaml': space('FK_COLUMN_MISSING__fixed', 'Fixed — foreignKey column exists'),
  ...fkBase('id'),
})

console.log('Done.')
