<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# loop-lore

[![EN](https://img.shields.io/badge/EN-blue)](../../README.md)
[![中文](https://img.shields.io/badge/中文-blue)](README.zh.md)
[![Español](https://img.shields.io/badge/Español-blue)](README.es.md)

**Chat RPG con LLM y más.**

Inspirado por:

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus)
- [Open WebUI](https://github.com/open-webui/open-webui)

loop-lore reconstruye el núcleo — personajes, chats, lorebooks, LLM multi-backend
— sobre una arquitectura sólida:

- **TypeScript + Bun** — sin paso de compilación, runtime rápido
- **Base de datos** — `bun:sqlite` local, PostgreSQL remoto (query builder Kysely)
- **Modo TUI** — interfaz de terminal basada en blessed (sin navegador)
- **Web UI** — htmx + Alpine.js (ligero, sin paso de build)
- **Recursos** — imágenes/audio/video vinculados polimórficamente a cualquier entidad
- **Asistente** — ayuda enfocada al usuario (ideas, sugerencias, solución de problemas)
- **Código limpio** — archivos pequeños, tipos estrictos, sin monolitos de 12K líneas

---

## Funcionalidades

| Funcionalidad          | Estado      | Notas                                                      |
| ---------------------- | ----------- | ---------------------------------------------------------- |
| Gestión de personajes  | Planificado | Import/export de tarjetas PNG (V2/V3), JSON                |
| Motor de chat          | WIP         | LLM multi-backend, streaming, swipe                        |
| Interfaz TUI chat      | WIP         | Basada en blessed, navegación por teclado                  |
| Capa de base de datos  | WIP         | bun:sqlite + Kysely (tipo seguro, dialecto intercambiable) |
| Recursos (media)       | Planificado | Imágenes/audio/video, vinculación polimórfica              |
| Chat del asistente     | MVP         | Basado en reglas, sugerencias contextuales                 |
| Lorebooks / Info mundo | Planificado | Entradas sticky/cooldown/delay                             |
| Web UI                 | Planificado | htmx + Alpine.js                                           |
| Sistema de plugins     | Planificado | Plugins servidor + extensiones cliente                     |

---

## Arquitectura

```
src/
├── server.ts          Punto de entrada HTTP de Bun
├── db/                Inicialización Kysely + tipos schema
│   ├── schema.ts      Definiciones de tipos de tabla
│   ├── migrations/    Archivos de migración Kysely
│   └── index.ts       Init Kysely + exports (bun:sqlite / dialecto postgres)
├── routes/            Endpoints REST API
├── assets/            Servicio + controlador de recursos (reemplaza galería)
├── assistant/         Servicio + controlador del asistente
├── tui/               UI de terminal (blessed)
└── ...
```

**Decisiones clave:**

- Query builder Kysely — tipo seguro, dialecto intercambiable (bun:sqlite ↔ postgres),
  sin sobrecarga de ORM
- Sin módulos dios-objeto — cada archivo <200 líneas preferido
- Bus de eventos para comunicación entre módulos (aprendido del sistema de eventos
  de SillyTavern)
- Registro de proveedores para backends LLM

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
```

---

## Documentación

- `docs/implementation.md` — Detalles técnicos completos, referencia API, variables de entorno
- `docs/schema.md` — Schema de base de datos y migraciones
- `docs/assets.md` — Sistema de recursos (reemplaza galería)
- `docs/tui.md` — Arquitectura TUI y atajos de teclado
- `docs/architecture.md` — Capas del sistema y flujo de peticiones
- `docs/frontend.md` — Frontend htmx + Alpine.js
- `docs/users-sessions.md` — Roles de usuario y gestión de sesiones
- `docs/messages.md` — Sistema de mensajes y niveles de detalle
- `docs/build-deploy.md` — Build y despliegue
- `.plan/implementation-plan.md` — Funcionalidades futuras y mejoras

---

## Licencia

LGPL-3.0-or-later (código core), MIT (docs), Apache-2.0 OR MIT (plugins)\
Ver [LICENSE](../../LICENSE) y [LICENSES/](../../LICENSES/) para textos completos.
