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

El estado de las funcionalidades vive en
[`.plan/epics-index.md`](../../.plan/epics-index.md) y el trabajo activo en
[`.plan/backlog/open.md`](../../.plan/backlog/open.md) — los estados no se
duplican aquí.

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

- [`docs/README.md`](../../docs/README.md) — Centro de documentación
  (filosofía, estado RPG, índice completo)
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
