<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# loop-lore

[![EN](https://img.shields.io/badge/EN-blue)](../../README.md)
[![中文](https://img.shields.io/badge/中文-blue)](README.zh.md)
[![Español](https://img.shields.io/badge/Español-blue)](README.es.md)
[![日本語](https://img.shields.io/badge/日本語-blue)](README.ja.md)
[![한국어](https://img.shields.io/badge/한국어-blue)](README.ko.md)
[![Русский](https://img.shields.io/badge/Русский-blue)](README.ru.md)
[![Français](https://img.shields.io/badge/Français-blue)](README.fr.md)

**LLM RPG-чат и не только.**

Вдохновлено:

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus)
- [Open WebUI](https://github.com/open-webui/open-webui)

loop-lore перестраивает ядро — персонажей, чаты, лорбуки, мульти-бэкенд LLM —
на здоровой основе:

- **TypeScript + Bun** — без шага компиляции, быстрый рантайм
- **База данных** — `bun:sqlite` локально, PostgreSQL удалённо
  (конструктор запросов Kysely)
- **TUI-режим** — терминальный интерфейс на blessed (браузер не нужен)
- **Web UI** — htmx + Alpine.js (лёгкий, без шага сборки)
- **Ассеты** — изображения/аудио/видео полиморфно связаны с любой сущностью
- **Ассистент** — помощь пользователю (идеи, предложения, устранение неполадок)
- **Чистый код** — маленькие файлы, строгая типизация, без монолитов на 12K строк

Слои системы, принципы проектирования и ключевые решения описаны в
[`docs/spec/architecture.md`](../../docs/spec/architecture.md). Авторитетным
источником структуры проекта являются `src/` и [`AGENTS.md`](../../AGENTS.md)
— перечни каталогов в этом README устаревают за несколько дней.

---

## Возможности

Легенда статусов: **MVP** = выпущено, **WIP** = в работе, **Planned** = в плане,
но не начато. Ссылки на спецификации ведут в [`docs/spec/`](../../docs/spec/) и
[`docs/frontend/`](../../docs/frontend/); прогресс по эпикам — в
[`.plan/epics-index.md`](../../.plan/epics-index.md), активная работа — в
[`.plan/backlog/open.md`](../../.plan/backlog/open.md).

| Возможность                  | Статус    | Ссылка                                                                                                                  |
| ---------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| Управление персонажами       | WIP       | [spec/character-spec](../../docs/spec/character-spec.md), [frontend/characters](../../docs/frontend/characters.md)     |
| Чат-движок                   | WIP       | [spec/messages](../../docs/spec/messages.md), [frontend/chat](../../docs/frontend/chat/overview.md)                    |
| TUI-интерфейс чата           | WIP       | [spec/terminal-ui](../../docs/spec/terminal-ui.md), [guide/getting-started](../../docs/guide/getting-started.md)       |
| Уровень базы данных          | WIP       | [spec/schema](../../docs/spec/schema.md), [spec/db-versioning](../../docs/spec/db-versioning.md)                        |
| Ассеты (медиа)               | WIP       | [spec/assets](../../docs/spec/assets.md), [frontend/gallery](../../docs/frontend/gallery.md)                           |
| Чат-ассистент                | MVP       | [spec/assistant-commands](../../docs/spec/assistant-commands.md), [frontend/chat/assistant](../../docs/frontend/chat/assistant.md) |
| Генерация VN-сцен            | WIP       | [spec/visual-novel](../../docs/spec/visual-novel.md), [frontend/chat/visual-novel-mode](../../docs/frontend/chat/visual-novel-mode.md) |
| Эмоциональные аватары        | WIP       | _спецификация в разработке — см. `.plan/`_                                                                                |
| Регулярные выражения         | WIP       | _спецификация в разработке — см. `src/regex/`_                                                                            |
| RPG-системы                  | WIP       | [spec/rpg-mechanics](../../docs/spec/rpg-mechanics.md), [spec/achievements](../../docs/spec/achievements.md)           |
| Лорбуки / информация о мире  | Planned   | [spec/lore](../../docs/spec/lore.md), [frontend/worlds](../../docs/frontend/worlds.md)                                  |
| Web UI                       | WIP       | [frontend/component-architecture](../../docs/frontend/component-architecture.md)                                      |
| Система плагинов             | WIP       | [spec/plugin-system](../../docs/spec/plugin-system.md)                                                                  |
| Криптография / шифрование    | WIP       | [spec/crypto](../../docs/spec/crypto.md), [spec/encryption-workflow](../../docs/spec/encryption-workflow.md), [frontend/encryption](../../docs/frontend/encryption.md) |
| Мульти-сессии                | WIP       | [spec/users-sessions](../../docs/spec/users-sessions.md)                                                                |
| i18n                         | WIP       | [frontend/internationalization](../../docs/frontend/internationalization.md), [docs/i18n](../i18n/)                    |
| Память                       | WIP       | [spec/memory-system](../../docs/spec/memory-system.md), [frontend/chat/memories](../../docs/frontend/chat/memories.md) |
| Телеметрия                   | WIP       | [spec/observability-telemetry](../../docs/spec/observability-telemetry.md)                                              |
| Фильтр нецензурной лексики   | WIP       | _спецификация в разработке — см. `src/profanity/`_                                                                      |
| Возрастной гейт              | WIP       | [frontend/age-gate](../../docs/frontend/age-gate.md)                                                                    |
| Уведомления                  | WIP       | [frontend/notifications](../../docs/frontend/notifications.md)                                                          |

---

## Технологический стек

| Слой           | Выбор                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| Рантайм        | Bun (быстрый TS/JS, без шага сборки)                                                |
| Язык           | TypeScript 5.4+ (строгий режим)                                                      |
| База данных    | `bun:sqlite` → Postgres через смену диалекта Kysely                                 |
| Конструктор запросов | Kysely (типобезопасно, без накладных расходов ORM)                            |
| TUI            | blessed + blessed-contrib                                                           |
| Web UI         | htmx + Alpine.js                                                                    |

Архитектурные решения и компромиссы описаны в
[`docs/spec/architecture.md`](../../docs/spec/architecture.md). Соглашения по
коду — в [`.agents/references/`](../../.agents/references/).

---

## Быстрый старт

```bash
# Предварительные требования: Bun (https://bun.sh)
bun install
cp .env.example .env
bun run db:migrate

# Запустить веб-сервер
bun run dev

# Запустить TUI (в отдельном терминале)
bun run tui

# Запустить все проверки (typecheck + lint + format)
bun run check

# Запустить тесты
bun test src/
```

Полное руководство: [`docs/guide/getting-started.md`](../../docs/guide/getting-started.md).

---

## Документация

- [`docs/spec/`](../../docs/spec/) — Основные спецификации (архитектура,
  персонажи, чат, RPG, шифрование, телеметрия, …)
- [`docs/frontend/`](../../docs/frontend/) — UX-спецификации (компоненты,
  чат, галерея, персонажи, …)
- [`docs/guide/`](../../docs/guide/) — Руководства пользователя
  (установка, первый чат, галерея, персонажи, миры, персоны, настройки)
- [`docs/reference/`](../../docs/reference/) — Справочная документация
  (API-поверхность)
- [`docs/ideas/`](../../docs/ideas/) — Идеи и предложения по дизайну
- [`docs/meta/`](../../docs/meta/) — Исследования, оценки, обзоры,
  рабочий процесс
- [`docs/i18n/`](../i18n/) — Локализованные переводы README
- [`.plan/`](../../.plan/) — Отслеживание задач (авторитетный источник
  активной работы)
- [`.agents/references/`](../../.agents/references/) — Соглашения по коду
  (запрещённые паттерны, рекомендации)
- [`AGENTS.md`](../../AGENTS.md) — Инструкции для агентов и обзор проекта

---

## Лицензия

LGPL-3.0-or-later (основной код), MIT (документация),
Apache-2.0 OR MIT (плагины)\
Полные тексты см. в [LICENSE](../../LICENSE) и [LICENSES/](../../LICENSES/).
