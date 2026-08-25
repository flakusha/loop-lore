<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

[![EN](https://img.shields.io/badge/EN-blue)](../../README.md)
[![中文](https://img.shields.io/badge/中文-blue)](README.zh.md)
[![Español](https://img.shields.io/badge/Español-blue)](README.es.md)
[![日本語](https://img.shields.io/badge/日本語-blue)](README.ja.md)
[![한국어](https://img.shields.io/badge/한국어-blue)](README.ko.md)
[![Русский](https://img.shields.io/badge/Русский-blue)](README.ru.md)
[![Français](https://img.shields.io/badge/Français-blue)](README.fr.md)

# loop-lore

**Chat RPG con LLM y más.**

Inspirado por:

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus)
- [Open WebUI](https://github.com/open-webui/open-webui)

loop-lore reconstruye el núcleo — personajes, chats, lorebooks, LLM
multi-backend — sobre una base sólida:

- **TypeScript + Bun** — sin paso de compilación, runtime rápido
- **Base de datos** — `bun:sqlite` local, PostgreSQL remoto (query builder Kysely)
- **Modo TUI** — interfaz de terminal basada en blessed (sin navegador)
- **Web UI** — htmx + Alpine.js (ligero, sin paso de build)
- **Recursos** — imágenes/audio/video vinculados polimórficamente a cualquier entidad
- **Asistente** — ayuda enfocada al usuario (ideas, sugerencias, solución de problemas)
- **Código limpio** — archivos pequeños, tipos estrictos, sin monolitos de 12K líneas

Las capas del sistema, principios de diseño y decisiones clave se encuentran en
[`docs/spec/architecture.md`](../../docs/spec/architecture.md). La fuente
autoritativa para la estructura del proyecto es `src/` y
[`AGENTS.md`](../../AGENTS.md); los listados de directorios en este README
quedarían obsoletos en pocos días.

---

## Funcionalidades

Leyenda de estado: **MVP** = enviado, **WIP** = en progreso, **Planned** =
definido pero no iniciado. Los enlaces de especificación apuntan a
[`docs/spec/`](../../docs/spec/) y [`docs/frontend/`](../../docs/frontend/); el
progreso de épicas vive en [`.plan/epics-index.md`](../../.plan/epics-index.md)
y el trabajo activo en [`.plan/backlog/open.md`](../../.plan/backlog/open.md).

| Funcionalidad            | Estado     | Referencia                                                                                                |
| ------------------------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| Gestión de personajes    | WIP        | [spec/character-spec](../../docs/spec/character-spec.md), [frontend/characters](../../docs/frontend/characters.md) |
| Motor de chat            | WIP        | [spec/messages](../../docs/spec/messages.md), [frontend/chat](../../docs/frontend/chat/overview.md)        |
| Interfaz TUI chat        | WIP        | [spec/terminal-ui](../../docs/spec/terminal-ui.md), [guide/getting-started](../../docs/guide/getting-started.md) |
| Capa de base de datos    | WIP        | [spec/schema](../../docs/spec/schema.md), [spec/db-versioning](../../docs/spec/db-versioning.md)           |
| Recursos (media)         | WIP        | [spec/assets](../../docs/spec/assets.md), [frontend/gallery](../../docs/frontend/gallery.md)              |
| Chat del asistente       | MVP        | [spec/assistant-commands](../../docs/spec/assistant-commands.md), [frontend/chat/assistant](../../docs/frontend/chat/assistant.md) |
| Generación escenas VN    | WIP        | [spec/visual-novel](../../docs/spec/visual-novel.md), [frontend/chat/visual-novel-mode](../../docs/frontend/chat/visual-novel-mode.md) |
| Avatares emocionales     | WIP        | _spec pendiente — ver `.plan/`_                                                                            |
| Extracción regex         | WIP        | _spec pendiente — ver `src/regex/`_                                                                        |
| Sistemas RPG             | WIP        | [spec/rpg-mechanics](../../docs/spec/rpg-mechanics.md), [spec/achievements](../../docs/spec/achievements.md) |
| Lorebooks / Info mundo   | Planificado | [spec/lore](../../docs/spec/lore.md), [frontend/worlds](../../docs/frontend/worlds.md)                    |
| Web UI                   | WIP        | [frontend/component-architecture](../../docs/frontend/component-architecture.md)                          |
| Sistema de plugins       | WIP        | [spec/plugin-system](../../docs/spec/plugin-system.md)                                                    |
| Criptografía / Cifrado   | WIP        | [spec/crypto](../../docs/spec/crypto.md), [spec/encryption-workflow](../../docs/spec/encryption-workflow.md), [frontend/encryption](../../docs/frontend/encryption.md) |
| Multisesión              | WIP        | [spec/users-sessions](../../docs/spec/users-sessions.md)                                                  |
| i18n                     | WIP        | [frontend/internationalization](../../docs/frontend/internationalization.md), [docs/i18n](../i18n/)        |
| Memoria                  | WIP        | [spec/memory-system](../../docs/spec/memory-system.md), [frontend/chat/memories](../../docs/frontend/chat/memories.md) |
| Telemetría               | WIP        | [spec/observability-telemetry](../../docs/spec/observability-telemetry.md)                                |
| Filtro de profanidad     | WIP        | _spec pendiente — ver `src/profanity/`_                                                                    |
| Verificación de edad     | WIP        | [frontend/age-gate](../../docs/frontend/age-gate.md)                                                      |
| Notificaciones           | WIP        | [frontend/notifications](../../docs/frontend/notifications.md)                                            |

---

## Stack tecnológico

| Capa          | Elección                                                   |
| ------------- | ---------------------------------------------------------- |
| Runtime       | Bun (TS/JS rápido, sin paso de build)                      |
| Lenguaje      | TypeScript 5.4+ (modo estricto)                            |
| Base de datos | `bun:sqlite` → Postgres vía intercambio de dialecto Kysely |
| Query Builder | Kysely (tipo seguro, sin sobrecarga de ORM)                |
| TUI           | blessed + blessed-contrib                                  |
| Web UI        | htmx + Alpine.js                                           |

Las decisiones y compensaciones de arquitectura viven en
[`docs/spec/architecture.md`](../../docs/spec/architecture.md). Las convenciones
de código están en [`.agents/references/`](../../.agents/references/).

---

## Inicio rápido

```bash
# Prerrequisitos: Bun (https://bun.sh)
bun install
cp .env.example .env
bun run db:migrate

# Iniciar servidor web
bun run dev

# Iniciar TUI (terminal separada)
bun run tui

# Ejecutar todas las verificaciones (typecheck + lint + format)
bun run check

# Ejecutar tests
bun test src/
```

Guía completa: [`docs/guide/getting-started.md`](../../docs/guide/getting-started.md).

---

## Documentación

- [`docs/spec/`](../../docs/spec/) — Especificaciones del núcleo (arquitectura,
  personajes, chat, RPG, cifrado, telemetría, …)
- [`docs/frontend/`](../../docs/frontend/) — Especificaciones UX (componentes,
  chat, galería, personajes, …)
- [`docs/guide/`](../../docs/guide/) — Guías de usuario (instalación, primer
  chat, galería, personajes, mundos, personas, ajustes)
- [`docs/reference/`](../../docs/reference/) — Documentos de referencia
  (superficie API)
- [`docs/ideas/`](../../docs/ideas/) — Ideas de diseño y propuestas
- [`docs/meta/`](../../docs/meta/) — Investigación, evaluaciones, revisiones,
  flujo de trabajo
- [`docs/i18n/`](../i18n/) — Traducciones localizadas del README
- [`.plan/`](../../.plan/) — Seguimiento de tareas (fuente de verdad del
  trabajo activo)
- [`.agents/references/`](../../.agents/references/) — Convenciones de código
  (patrones prohibidos, recomendaciones)
- [`AGENTS.md`](../../AGENTS.md) — Instrucciones para agentes y visión general
  del proyecto

---

## Licencia

LGPL-3.0-or-later (código core), MIT (docs), Apache-2.0 OR MIT (plugins)\
Ver [LICENSE](../../LICENSE) y [LICENSES/](../../LICENSES/) para textos
completos.
