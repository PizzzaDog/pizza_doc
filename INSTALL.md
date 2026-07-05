# Установка Pizza Doc и оцифровка проекта

Этот документ читают двое:

- **Человек** — следуй разделам 0 → 6 по порядку.
- **AI-агент** (Claude / Cursor / Codex) — раздел 4 содержит готовый промпт для тебя; всё остальное — контекст, который должен увидеть пользователь до того как тебя попросят делать что-то.

Цель: за 30–60 минут от пустого терминала прийти к рабочей `.pizza-doc/` спеке твоего проекта, сгенерированной из его кода.

## Что такое Pizza Doc

Инструмент для превращения существующего кода в **архитектурную спеку** (структурированный YAML, валидируемый end-to-end) и обратно. На выходе — папка `.pizza-doc/` в корне твоего проекта с описанием actors / modules / components / models / tables / use-cases. Спека — first-class артефакт: коммитится в git, читается как код-ревью, экспортируется в TypeScript/Go/OpenAPI.

Эта инсталляция — два бинарника и один веб-интерфейс:

- `pd` — CLI (валидация, экспорт, скаффолды)
- `pd-mcp` — MCP-сервер, по которому AI-агент работает со спекой как со структурированным API
- `pd ui` — статический веб-интерфейс для визуального обзора (опционально)

## 0. Прерыквизиты

Проверь что всё установлено:

```bash
node -v       # >= 20
pnpm -v       # >= 10  (если нет: corepack enable && corepack prepare pnpm@10 --activate)
git --version
```

Браузер: Chrome / Edge / Brave / Arc (Firefox и Safari не поддерживают File System Access API, нужный для `pd ui`).

AI-клиент с MCP — один из:

- **Claude Code CLI** (`claude` команда установлена)
- **Claude Desktop** (приложение)
- **Cursor** (IDE)

Если ни одного — установи Claude Desktop, это самый прямой путь.

## 1. Установить Pizza Doc

```bash
cd ~                                                      # или куда удобно
git clone https://github.com/PizzzaDog/pizza_doc.git
cd pizza_doc
pnpm install                                              # ~30 сек
pnpm build                                                # ~20 сек, собирает core + cli + mcp + web
```

Ожидаемый результат: команды `pnpm build` завершилась без ошибок, в `packages/cli/dist/index.js`, `packages/mcp/dist/index.js`, `packages/web/dist/index.html` появились файлы.

Сделать `pd` и `pd-mcp` глобально доступными через симлинк:

**macOS Apple Silicon:**

```bash
ln -sf "$(pwd)/packages/cli/dist/index.js" /opt/homebrew/bin/pd
ln -sf "$(pwd)/packages/mcp/dist/index.js" /opt/homebrew/bin/pd-mcp
chmod +x packages/cli/dist/index.js packages/mcp/dist/index.js
```

**macOS Intel или Linux:**

```bash
sudo ln -sf "$(pwd)/packages/cli/dist/index.js" /usr/local/bin/pd
sudo ln -sf "$(pwd)/packages/mcp/dist/index.js" /usr/local/bin/pd-mcp
chmod +x packages/cli/dist/index.js packages/mcp/dist/index.js
```

Проверка:

```bash
pd --help        # должен показать список команд: init, validate, export, ui, ...
pd-mcp           # запустит MCP-сервер на stdio (Ctrl+C чтобы выйти)
```

> **Важно:** симлинки указывают на `dist/` внутри клонированного `pizza_doc/`. Если переместишь или удалишь эту папку — `pd` перестанет работать. Не двигать.

## 2. Подключить Pizza Doc к AI-клиенту через MCP

Это то, благодаря чему агент будет работать со спекой через структурированный JSON, а не парсить bash-вывод.

### Вариант A — Claude Code CLI

Из любой директории:

```bash
claude mcp add pizza-doc pd-mcp
```

Проверка: запусти `claude` → набери `/mcp` → в списке должен быть `pizza-doc` со статусом connected.

### Вариант B — Claude Desktop

Открой / создай файл:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Добавь (или слей с существующим):

```json
{
  "mcpServers": {
    "pizza-doc": {
      "command": "pd-mcp"
    }
  }
}
```

Полный рестарт Claude Desktop (Cmd+Q, открыть заново). Иконка молнии в чате должна показать `pizza-doc` с 10 инструментами.

### Вариант C — Cursor

Settings → MCP → Add New MCP Server:

```json
{
  "name": "pizza-doc",
  "command": "pd-mcp"
}
```

Проверка: в чате Cursor у агента должны появиться tools начинающиеся с `pd_`.

## 3. Создать спейс в своём проекте

Перейди в корень проекта, который хочешь документировать, и инициализируй:

```bash
cd /path/to/your-project
pd init {project-name}
```

`{project-name}` — короткий kebab-case идентификатор (`my-app`, `payment-service`, `crm-backend`). Не критично, но используется в URL-ах UI и метаданных спеки.

Что появилось:

```
your-project/
├── .pizza-doc/                  ← спека (handcrafted, коммитится в git)
│   ├── README.md                ← описание для людей и AI
│   ├── space.yaml               ← meta (id, name, description)
│   ├── schemas/                 ← JSON-схемы для inline-валидации в IDE
│   │   ├── space.json
│   │   ├── component.json
│   │   └── ...
│   ├── actors/                  ← кто инициирует use-кейсы
│   ├── modules/                 ← деплоебельные единицы (frontend / service / db / queue / external)
│   └── use-cases/               ← бизнес-флоу
└── .claude/skills/              ← AI-скиллы (Pizza Doc копирует автоматически)
    ├── pd-scanner/              ← оркестратор: код → спейс
    ├── pd-author/               ← оркестратор: проектирование с нуля
    ├── pd-implementer/          ← оркестратор: спейс → код
    ├── pd-drift-auditor/        ← compare spec ↔ code
    ├── pd-pr-reviewer/          ← review спека-changes
    └── pd-extract-{lang}/       ← extractors для TS/Python/Go/Java
```

> **Важно:** `.pizza-doc/` НЕ должна попасть в `.gitignore`. Это первоклассный source artifact, должен коммититься.

Ничего пока не валидируй — спейс пустой. Дальше его будет заполнять агент.

## 4. Сгенерировать спеку из кода

> **Этот раздел — промпт для AI-агента.** Если ты человек, открой Claude Code / Desktop / Cursor В КОРНЕ ПРОЕКТА (тот же `your-project/`, в котором запускал `pd init`) и скопируй блок ниже как первое сообщение агенту:

```
Я хочу превратить этот код в Pizza Doc спеку под .pizza-doc/.

Контекст:
- Pizza Doc уже инициализирован: ./.pizza-doc/ существует с пустым space.yaml
  и подкаталогами actors/, modules/, use-cases/.
- Скиллы лежат в ./.claude/skills/. Главные:
  • pd-scanner — оркестратор код→спейс (читай его SKILL.md первым)
  • pd-extract-{lang}/ — language-specific экстракторы (один из них тебе понадобится)
- Через MCP у тебя должны быть инструменты pd_validate, pd_search, pd_explain_ref,
  pd_explain_code, pd_add_actor / _module / _domain / _component / _model / _table.
  Если их нет — попроси меня перезапустить клиент с включённым pizza-doc MCP-сервером.

Алгоритм:
1. Прочитай ./.pizza-doc/README.md — он описывает структуру спейса.
2. Прочитай ./.claude/skills/pd-scanner/SKILL.md и его frontmatter.
3. Определи язык/фреймворк проекта (по package.json / pyproject.toml / go.mod /
   pom.xml / build.gradle.kts). Дёрни соответствующий ./.claude/skills/pd-extract-{lang}/SKILL.md.
4. Следуй порядку извлечения, описанному в скилле:
   tables (если есть DB) → models → components → use-кейсы.
5. После каждого слоя вызывай pd_validate (через MCP) и чини ошибки прежде чем
   двигаться дальше. SCHEMA_* и REF_* — блокеры; warnings можно отложить.
6. Use-кейсы оставь напоследок — они самое творческое; сначала прогенери черновики,
   затем покажи мне на ревью.

Терминальное состояние: pd_validate возвращает schema=ok refs=ok semantic=ok
(допустимы warnings, но не errors), и в спеке покрыты основные actors / modules /
components / models / tables / use-cases. После — скажи мне сколько сущностей
получилось и какие use-кейсы стоит проревьюить вручную.

Если на каком-то шаге упрёшься в ограничение фреймворка (напр. unmapped type,
неизвестный паттерн) — не выдумывай, спроси меня. Лучше иметь меньше но честный
спейс, чем больше но с фабрикованными сущностями.

Поехали.
```

Агент пойдёт по этому промпту:

1. Прочитает README в спейсе и оркестратор-скилл `pd-scanner`
2. Определит язык, дёрнет нужный extractor (например `pd-extract-typescript` для NestJS / React / Prisma)
3. Сгенерирует JSONL → импортирует через `pd_import` или CLI
4. Будет итерироваться через `pd_validate` пока не зайдёт в зелёное состояние

Время — от 5 минут на маленький модуль до часа+ на большой монорепо. Токены зависят от объёма кода (агент читает каждый файл).

## 5. Просмотреть результат визуально

```bash
pd ui                                # serves http://127.0.0.1:5173
```

В браузере жми **Pick a folder** и выбери:
- **корень проекта** (`your-project/`) — UI найдёт `.pizza-doc/` автоматически и покажет спейс под именем `{project-name}`
- ИЛИ прямо `.pizza-doc/` — тоже работает

Браузер запросит permission на запись — дай **Allow on every visit** (иначе UI не сможет править YAML).

Что увидишь:
- Слева сайдбар с actors / modules / components / models / tables / use-cases
- В центре — диаграмма выбранной сущности
- Сверху — badge статуса валидации (зелёный = ok, красный = errors)
- ⌘K — палитра поиска

## 6. Дальше — итерация

Спека после автогена обычно нуждается в ручной полировке. Типичные действия:

```bash
# Полная валидация с детальным выводом
pd validate --verbose

# Что именно неиспользовано (orphans)
pd orphans

# Покрытие — сколько сущностей задокументировано
pd coverage

# Объяснение конкретного предупреждения
pd lint --explain USECASE_LAST_STEP_NOT_TERMINAL

# Найти где пишется конкретное поле
pd dataflow Order.status

# Сравнить с предыдущей версией спеки в git
pd diff HEAD~5

# Кодоген (если хочешь использовать спеку как source of truth для типов)
pd export typescript-types --out src/generated/types.ts
pd export go-types --package contract --out internal/contract/types.go
pd export openapi --out openapi.json
```

Use-кейсы — самое слабое место автогена, потому что им нужен контекст бизнес-намерений. Их разумно либо переписать вручную, либо продиктовать агенту в стиле "когда пользователь делает X, в системе должно произойти Y, Z, W".

## 7. Если что-то ломается

| Симптом | Что делать |
|---|---|
| `pd: command not found` | Симлинк не создался или PATH не подхватил. Проверь `ls -la /opt/homebrew/bin/pd` (или `/usr/local/bin/pd`). Заодно `echo $PATH` — там должна быть эта папка. |
| `pd --help` молчит, exit 0 | Был баг при ранней установке. Гарантия: пересобери `pnpm --filter @pizza-doc/cli build` и попробуй снова. |
| `pd init` падает с filename mismatch | Внутри `.pizza-doc/` уже есть space.yaml с другим id. Удали и запусти заново: `rm -rf .pizza-doc && pd init {id}`. |
| Агент в Claude Code не видит MCP-инструменты | Проверь `claude mcp list` — там должен быть `pizza-doc` со статусом connected. Если нет — `claude mcp add pizza-doc pd-mcp` и `claude mcp remove pizza-doc` перед этим, если был кривой конфиг. |
| `pd ui` виснет на "Loading ..." | Hard-refresh браузера (Cmd+Shift+R). Если повторяется — открой DevTools (F12) → Console, скинь ошибки. |
| `pd validate` вылетает с node ESM error | Скорее всего рассинхрон версий core/cli. `pnpm -r build` пересобирает всё. |
| Symlink перестал работать после переименования папки | Перенакатить симлинки командами из раздела 1. |

## 8. Обновление Pizza Doc когда что-то починят

Если ты получаешь патч в виде новой версии репо:

```bash
cd ~/pizza_doc
git pull        # или распаковать новый bundle/tar поверх
pnpm install    # подхватит новые deps если они есть
pnpm build      # пересоберёт dist
# Глобальный `pd` подхватит изменения автоматически — симлинк указывает на dist
```

В существующих проектах с уже сгенерированной спекой:

```bash
cd /path/to/your-project
# Скиллы могли обновиться — перекопировать вручную
rm -rf .claude/skills/pd-* && cp -r ~/pizza_doc/.claude/skills/pd-* .claude/skills/
# Перегенерировать JSON-схемы (новые поля?)
pd schemas regen                   # перегенерирует .pizza-doc/schemas/*.json из текущих Zod-схем
```

## 9. Куда писать про баги

Pizza Doc сейчас на версии `0.6.0` <!-- pd:version --> — мы активно обкатываем формат. Если упёрся в ограничение схемы, нашёл false positive валидатора, или хочешь новую категорию — кидай конкретный кейс (минимальный YAML + что ожидал) автору, он подкрутит и пришлёт обновление.

Самые недо-покрытые сценарии прямо сейчас:
- Транзакционные границы в use-кейсах (нет first-class конструкции)
- RBAC на методах (нельзя выразить `requires: role:ADMIN`)
- Versioning схем (`v1` / `v2` модели бок о бок)
- Cross-space refs (когда у одной кодобазы несколько спейсов)

Эти на v0.3 roadmap, но если упрёшься раньше — скажи.
