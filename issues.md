1. Дока не догенерена. Саммари:

Причина — я выбрал быстрый путь скаффолдинга через MCP-тулы (pd_add_table, pd_add_component и т.д.). Они по дизайну создают только заглушку — структурный «скелет» (id + базовые поля), а наполнение оставляют следующему шагу.
В Pizza Doc для полноценной генерации есть отдельный пайплайн: skill pd-extract-typescript сканирует исходники (@Entity, @Column, @Controller, методы сервисов) и выдаёт JSONL, который затем импортируется через pd import. Этот шаг я пропустил — наполнил только то, что знал из README/AGENTS.md (use-cases, описания компонентов), а колонки таблиц, поля DTO/entity моделей и method-level вызовы между компонентами остались пустыми.

### AI GENERATED SUMMARY ###

Pizza Doc — выявленные проблемы
Список того, что мешало в этой сессии. Каждый пункт: симптом → причина → предложение.

1. pd_add_table создаёт пустую заглушку без явного предупреждения
   Симптом: все 7 таблиц получили одну колонку id uuid PK — выглядело как «дока сгенерилась», но половины данных нет.
   Причина: скаффолдер by design кладёт placeholder, рассчитывая что агент дозаполнит. Но это нигде явно не сигналится — нет ни warning'а в выводе, ни TODO-маркера в yaml.
   Решение: при scaffold добавлять явный # TODO: fill columns маркер в yaml + warning в CLI output: ⚠ scaffolded with placeholder column — run 'pd add table --from-sql' or edit manually. Альтернатива: ввести валидаторное правило TABLE_HAS_ONLY_PLACEHOLDER_PK (info severity).
2. pd import пишет в spaces/<id>/ даже для single-space layout
   Симптом: инициализировал через pd init (создал .pizza-doc/), но pd import пишет в spaces/iam-service/ относительно cwd. Пришлось импортировать в /tmp и руками копировать.
   Причина: pd import всегда предполагает multi-space layout, не смотрит на наличие .pizza-doc/space.yaml рядом.
   Решение: определить layout по cwd: если есть .pizza-doc/space.yaml или текущая папка — space-dir, писать в неё; multi-space только если spaces/<id>/space.yaml существует. Дополнительно — флаг --space-dir <path> для override.
3. _placement.spaceId обязателен даже в single-space
   Симптом: убрал spaceId из JSONL — could not resolve path for entry kind=table.
   Причина: отсутствие fallback-логики "если single-space, использовать единственный".
   Решение: делать spaceId опциональным; разрешать конфликт по найденному space.yaml.
4. MCP-тулы падают с криптичной ошибкой при отсутствующем space
   Симптом: первый вызов pd_add_actor вернул no space.yaml at /Users/.../.pizza-doc без подсказки.
   Причина: тула не выполняет init и не подсказывает решение.
   Решение: в текст ошибки добавить → run 'pd init <id>' first or set spaceDir param. Опция: автоинициализация при первом pd_add_* если space нет (с подтверждением).
5. Use-case'ы нельзя импортировать через pd import
   Симптом: компоненты/модели/таблицы импортируются JSONL'ом, а каждый use-case писал руками через Write.
   Причина: pd import поддерживает только entity kinds (table/component/model). Use-case как kind отсутствует в pipeline'е.
   Решение: добавить kind: usecase в JSONL-схему импорта. Это разблокирует генерацию use-case'ов из тестов / OpenAPI / Avro.
6. pd import --force перезаписывает entity целиком вместо merge
   Симптом: чтобы добавить methods: в существующий компонент, пришлось в JSONL дублировать description:/type:/sourceRef:. Если забыть — теряются.
   Причина: import — replace, а не merge.
   Решение: ввести --merge режим: replace только указанные поля (methods, description), сохранить остальное. Default оставить replace.
7. to: принимает method-level ref, но валидатор не считает это «использованием компонента»
   Симптом: to: module:.../component:X/method:Y — валиден по схеме, но COMPONENT_UNUSED всё равно срабатывает на X.
   Причина: проверка делает exact-string-match по component-ref, не понимая, что method-ref содержит component-ref как префикс.
   Решение: при проверке COMPONENT_UNUSED парсить ref и принимать любой ref, начинающийся с component-path.
8. USECASE_LAST_STEP_NOT_TERMINAL не признаёт queue-модули terminal'ом
   Симптом: шаг ... → module:kafka/component:KafkaBroker с protocol external-api всё равно warning. Пришлось suppress.
   Причина: правило hardcoded на типы external + sql + frontend; queue не в списке.
   Решение: добавить queue к terminal types, либо смотреть на protocol (external-api/event → terminal), а не на module type.
9. kind: spawn не размыкает chain-continuity
   Симптом: в create-organisation шаг с kind: spawn к Temporal — валидатор всё равно требует continuity для следующего шага из контроллера. Пришлось разделить на два use-case'а.
   Причина: spawn-семантика прописана в схеме, но не учитывается chain-проверкой.
   Решение: после kind: spawn валидатор должен сбрасывать «текущий стек» и принимать любой следующий шаг из исходного caller-frame'а.
10. DataFlow требует Type.field form для всего, но не моделирует path/query params
    Симптом: users.organisation_id приходит из URL :organisationId, но sourceField: требует existing model. Нет «типа» для path-params.
    Причина: схема dataFlow рассчитана на DTO→table mapping, не учитывает URL/header/query/const источники.
    Решение: разрешить prefix'ы path:, query:, header:, const: без проверки на model. Например: sourceField: path.organisationId.
11. DATAFLOW_TARGET_FIELD хочет table-id, а targetField синтаксически выглядит как Type.field
    Симптом: написал User.first_name (entity model name) — error references unknown table 'User'.
    Причина: правило молча требует именно table-id, но schema этого не объясняет, и наименование совпадает с sourceField'ом (Type.field), что путает.
    Решение: в сообщении об ошибке явно говорить: «targetField must be <tableId>.<column> (use the table id, not the entity model name)»; в идеале — принимать оба, разрешать через persistedAs mapping.
12. DATAFLOW_TYPE_INCOMPATIBLE ругается на enum vs enum
    Симптом: field type TenantType (enum-модель) vs column type enum — warning «incompatible».
    Причина: валидатор сравнивает строки типов, не разворачивает enum-модель.
    Решение: если field type — id существующей modelKind: enum модели, а column type == enum, считать совместимым.
13. snake_case-конвертер ломается на цифрах внутри имени
    Симптом: organisation1Id (camelCase) → ожидал organisation_1_id (с подчёркиванием перед цифрой), но конвертер ищет organisation1_id. Пришлось переименовать колонку в таблице.
    Причина: регулярка для camel→snake не вставляет underscore между letter и digit.
    Решение: документировать правило явно, или поправить конвертер (organisation1Id → organisation_1_id), плюс валидатор должен пробовать обе формы.
14. Внешние модули без компонентов не считаются «external-API boundary»
    Симптом: to: module:keycloak (модуль без компонентов) — не terminal. Пришлось добавлять KeycloakAdminAPI компонент-фасад.
    Причина: требование «to.component != null» для terminal-проверки.
    Решение: для модулей type: external принимать bare module ref как terminal. Альтернатива: автогенерировать unnamed-component при создании external module.
15. Component без methods: не может быть target'ом calls: другого метода
    Симптом: KeycloakAdminAPI не имел методов → REF_WRONG_KIND: expected method but ... is a component.
    Причина: правило calls[i] требует method-level ref.
    Решение: разрешить component-level ref в calls (с предупреждением, что метод не указан) — для случаев, когда метод неизвестен/не релевантен.
16. UI работает только в Chrome (File System Access API)
    Симптом: UI требует Chrome — Firefox/Safari не открывают папку.
    Причина: опора на browser-only API.
    Решение: добавить fallback-mode «server-side reading» — pd ui читает файлы локально и стримит через WebSocket/SSE. UI остаётся web-приложением, но не зависит от FS Access API.
17. Сообщение COMPONENT_UNUSED не различает «реально orphan» и «есть, но без use-case'а»
    Симптом: для startup/scheduler компонентов (SeederService, KafkaAdminService) COMPONENT_UNUSED срабатывает одинаково с настоящими orphan'ами.
    Причина: одно правило на все случаи.
    Решение: разнести: COMPONENT_NO_USECASE (info) для not-yet-modeled vs COMPONENT_UNREACHABLE (warning) для реально не вызываемых ниоткуда. Или ввести expectsUseCase: false на компонент-уровне.
