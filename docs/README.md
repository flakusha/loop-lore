# loop-lore Documentation

## Overview

Reimplementation of SillyTavern with enhanced features:

- TUI mode
- Database support (local and remote)
- Asset system (images/audio/video, replacing old gallery)
- Character & persona system with multi-format import/export
- RPG mechanics: stats, combat, equipment, dice, skills, XP
- Enhanced assistant chat (user assistance focused)
- User management & multi-session support
- Message persistence & reliability

## Document Structure

```
docs/
├── spec/                          Technical specifications
│   ├── integrations/              External tool integrations
├── frontend/                      Frontend UX specifications
│   └── chat/                      Chat system UX specs
├── guide/                         User-facing how-to guides
├── reference/                     API reference
├── meta/                          Project planning & reviews
│   └── reviews/                   Code review documents
└── .vitepress/                    VitePress site config
```

## Specification Documents

### Architecture & Core

| Document                                             | Topics                                            |
| ---------------------------------------------------- | ------------------------------------------------- |
| [`spec/architecture.md`](./spec/architecture.md)     | System layers, request flow, asset serving        |
| [`spec/implementation.md`](./spec/implementation.md) | Tech stack, DB approach, assistant, TUI internals |
| [`spec/build-deploy.md`](./spec/build-deploy.md)     | Build pipeline, deployment options                |
| [`spec/schema.md`](./spec/schema.md)                 | Full DB schema: all tables, enums, relationships  |
| [`spec/messages.md`](./spec/messages.md)             | Message persistence, detail levels, tree model    |
| [`spec/users-sessions.md`](./spec/users-sessions.md) | User roles, sessions, demo/solo mode              |

### Characters & RPG

| Document                                               | Topics                                                   |
| ------------------------------------------------------ | -------------------------------------------------------- |
| [`spec/actors.md`](./spec/actors.md)                   | Actor data model: cards, memories, lorebooks, inventory  |
| [`spec/character-setup.md`](./spec/character-setup.md) | Character & persona system: import/export, impersonation |
| [`spec/rpg-mechanics.md`](./spec/rpg-mechanics.md)     | Stats, combat, equipment, dice, skills, XP, loot         |
| [`spec/memory-system.md`](./spec/memory-system.md)     | Three-tier memory: episodic, semantic, procedural        |

### Assets & Infrastructure

| Document                                                     | Topics                                            |
| ------------------------------------------------------------ | ------------------------------------------------- |
| [`spec/assets.md`](./spec/assets.md)                         | Asset system: images/audio/video, upload, linking |
| [`spec/assets-attribution.md`](./spec/assets-attribution.md) | License/attribution for assets                    |
| [`spec/plugin-system.md`](./spec/plugin-system.md)           | Plugin architecture: types, lifecycle, security   |
| [`spec/artifacts-system.md`](./spec/artifacts-system.md)     | Code, documents, datasets as assets               |
| [`spec/logging.md`](./spec/logging.md)                       | Structured logging, PII censor, transports        |
| [`spec/testing.md`](./spec/testing.md)                       | Testing strategy, tools, coverage goals           |

### Interfaces & Integrations

| Document                                                                                   | Topics                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| [`spec/tui.md`](./spec/tui.md)                                                             | Blessed TUI: components, keyboard map, data flow |
| [`spec/transport-unified.md`](./spec/transport-unified.md)                                 | HTTP/WS/WebTransport abstraction                 |
| [`spec/integrations/llama-cpp.md`](./spec/integrations/llama-cpp.md)                       | llama.cpp local inference                        |
| [`spec/integrations/stable-diffusion-cpp.md`](./spec/integrations/stable-diffusion-cpp.md) | stable-diffusion.cpp local image gen             |

### Frontend UX

| Document                                                                 | Topics                                      |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| [`frontend/overview.md`](./frontend/overview.md)                         | Design principles, CSS tokens, architecture |
| [`frontend/routing.md`](./frontend/routing.md)                           | URL scheme, navigation, htmx history        |
| [`frontend/characters.md`](./frontend/characters.md)                     | Character list grid, create/edit form       |
| [`frontend/chat/overview.md`](./frontend/chat/overview.md)               | Chat types, data model, message tree        |
| [`frontend/chat/messages.md`](./frontend/chat/messages.md)               | Markdown render, bubbles, swipe, scroll     |
| [`frontend/chat/generation.md`](./frontend/chat/generation.md)           | Streaming, error handling, retries          |
| [`frontend/chat/multi-llm-story.md`](./frontend/chat/multi-llm-story.md) | Multi-LLM story: GM, turn-taking, quests    |
| [full list →](./frontend/)                                               | All frontend UX specs                       |

### Guides

| Document                                                 | Topics                                   |
| -------------------------------------------------------- | ---------------------------------------- |
| [`guide/getting-started.md`](./guide/getting-started.md) | Quick start                              |
| [`guide/installation.md`](./guide/installation.md)       | Prerequisites, setup                     |
| [`guide/characters.md`](./guide/characters.md)           | Creating, importing, managing characters |

### Reference & Planning

| Document                                                     | Topics                       |
| ------------------------------------------------------------ | ---------------------------- |
| [`reference/api.md`](./reference/api.md)                     | REST API reference           |
| [`meta/plan.md`](./meta/plan.md)                             | MVP implementation checklist |
| [`meta/roadmap.md`](./meta/roadmap.md)                       | Long-term feature roadmap    |
| [`meta/migration-strategy.md`](./meta/migration-strategy.md) | DB migration refactor plan   |

## Documentation Hosting

This documentation is written in Markdown and can be served from the `/docs/` route. To disable:

1. Set environment variable `DOCS_ENABLED=false`
2. Or set `docs.enabled: false` in the configuration file
3. Individual sections can be hidden per config

## Getting Started

```bash
git clone <repository-url>
cd loop-lore
bun install
bun run dev
```

See the [build and deployment guide](./spec/build-deploy.md) for detailed setup instructions.

## License

This project is licensed under the LGPL-3.0-or-later License (core code).  
Documentation is MIT. See [LICENSES/](../LICENSES/) for full texts.
