# loop-lore Documentation

## Overview

Reimplementation of SillyTavern with enhanced features:

- TUI mode
- Database support (local and remote)
- Asset system (images/audio/video, replacing old gallery)
- Character system with JSON card import/export
- RPG mechanics: **❌ Not implemented** (no dice engine, no stats/combat/XP/loot)
- Enhanced assistant chat (user assistance focused)
- User management & multi-session support
- Message persistence & reliability

## Document Structure

```
docs/
├── spec/                    Core technical specs (25 files)
│   └── integrations/        External tool integration specs
├── spec-planned/            Planned features, roadmaps, ideas
│   ├── features/            Feature specs (28 files)
│   ├── roadmaps/            Implementation roadmaps (3 files)
│   └── ideas/               Creative/UX ideas (9 files)
├── frontend/                Frontend UX specifications
│   └── chat/                Chat system UX specs
├── guide/                   User-facing how-to guides
├── reference/               API reference
├── meta/                    Project planning, reviews, analysis, research
│   ├── reviews/             Architecture & integration reviews
│   ├── analysis/            Migration & refactoring analysis
│   ├── assessments/         Feature evaluation & recommendations
│   ├── research/            Research docs (use cases, RPG mechanics)
│   └── code-practices-improvements/  Coding standards improvement plans
└── public/                  Static assets (SVGs, images)
```

---

## Core Specifications (`spec/`)

Authoritative technical specs for implemented systems. These are the primary reference for code changes.

### Architecture & Core

| Document                                                                     | Topics                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`spec/architecture.md`](./spec/architecture.md)                             | System layers, request flow, asset serving              |
| [`spec/implementation.md`](./spec/implementation.md)                         | Tech stack, DB approach, assistant, TUI internals       |
| [`spec/build-deploy.md`](./spec/build-deploy.md)                             | Build pipeline, deployment options                      |
| [`spec/platform-support.md`](./spec/platform-support.md)                     | Windows, Android, cross-platform compatibility          |
| [`spec/schema.md`](./spec/schema.md)                                         | Full DB schema: all tables, enums, relationships        |
| [`spec/messages.md`](./spec/messages.md)                                     | Message persistence, detail levels, tree model          |
| [`spec/users-sessions.md`](./spec/users-sessions.md)                         | User roles, sessions, demo/solo mode                    |
| [`spec/access-model-clarification.md`](./spec/access-model-clarification.md) | Gallery access model: auth, ownership, public endpoints |

### Characters, RPG & Memory

| Document                                               | Topics                                                   |
| ------------------------------------------------------ | -------------------------------------------------------- |
| [`spec/actors.md`](./spec/actors.md)                   | Actor data model: cards, memories, lorebooks, inventory  |
| [`spec/character-setup.md`](./spec/character-setup.md) | Character & persona system: import/export, impersonation |
| [`spec/rpg-mechanics.md`](./spec/rpg-mechanics.md)     | Stats, combat, equipment, dice, skills, XP, loot         |
| [`spec/memory-system.md`](./spec/memory-system.md)     | Three-tier memory: episodic, semantic, procedural        |
| [`spec/personas.md`](./spec/personas.md)               | Persona CRUD, switching, defaults                        |

### Assets & Storage

| Document                                                   | Topics                                               |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| [`spec/assets.md`](./spec/assets.md)                       | Asset system: images/audio/video, upload, linking    |
| [`spec/artifacts-system.md`](./spec/artifacts-system.md)   | Code, documents, datasets as assets                  |
| [`spec/archival-workflow.md`](./spec/archival-workflow.md) | Message archival: states, transitions, restore/purge |

### Security & Infrastructure

| Document                                                       | Topics                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| [`spec/crypto.md`](./spec/crypto.md)                           | Encryption: actor keys, chat keys, BYOK, SMK             |
| [`spec/encryption-workflow.md`](./spec/encryption-workflow.md) | Key hierarchy, encryption/decryption pipeline            |
| [`spec/auth-middleware.md`](./spec/auth-middleware.md)         | Token flow, session model, role guard, rate limiting     |
| [`spec/error-envelope.md`](./spec/error-envelope.md)           | Standard error envelope: codes, shapes, patterns         |
| [`spec/logging.md`](./spec/logging.md)                         | Structured logging, PII censor, transports               |
| [`spec/content-compression.md`](./spec/content-compression.md) | Encoding: gzip/zstd/brotli, minification, hash injection |

### Interfaces & APIs

| Document                                                     | Topics                                           |
| ------------------------------------------------------------ | ------------------------------------------------ |
| [`spec/tui.md`](./spec/tui.md)                               | Blessed TUI: components, keyboard map, data flow |
| [`spec/plugin-system.md`](./spec/plugin-system.md)           | Plugin architecture: types, lifecycle, security  |
| [`spec/api-routes.md`](./spec/api-routes.md)                 | REST API contract: all endpoints, conventions    |
| [`spec/assistant-commands.md`](./spec/assistant-commands.md) | Assistant command parser and command spec        |

### Integrations (`spec/integrations/`)

| Document                                                                           | Topics                                         |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`spec/integrations/llm-serving.md`](./spec/integrations/llm-serving.md)           | LLM provider serving (OpenAI-compatible, etc.) |
| [`spec/integrations/image-generation.md`](./spec/integrations/image-generation.md) | Image generation integration                   |

---

## Planned Features & Roadmaps (`spec-planned/`)

Future features, exploration docs, and implementation roadmaps. Not yet implemented.

### Roadmaps (`spec-planned/roadmaps/`)

| Document                                                                                                       | Topics                              |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| [`spec-planned/roadmaps/rpg-implementation-roadmap.md`](./spec-planned/roadmaps/rpg-implementation-roadmap.md) | RPG mechanics implementation phases |
| [`spec-planned/roadmaps/implementation-approaches.md`](./spec-planned/roadmaps/implementation-approaches.md)   | Technical approach comparison       |
| [`spec-planned/roadmaps/implementation-samples.md`](./spec-planned/roadmaps/implementation-samples.md)         | Code samples and patterns           |

### Features (`spec-planned/features/`)

| Document                                                                                                       | Topics                                         |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`spec-planned/features/creative-studio.md`](./spec-planned/features/creative-studio.md)                       | Creative tools and studio features             |
| [`spec-planned/features/cross-device-sync.md`](./spec-planned/features/cross-device-sync.md)                   | Cross-device state synchronization             |
| [`spec-planned/features/auto-translation.md`](./spec-planned/features/auto-translation.md)                     | Auto-translation system                        |
| [`spec-planned/features/notifications-expansion.md`](./spec-planned/features/notifications-expansion.md)       | Extended notification system with noise levels |
| [`spec-planned/features/filtering-pagination.md`](./spec-planned/features/filtering-pagination.md)             | Combined filter and pagination improvements    |
| [`spec-planned/features/procedural-assets.md`](./spec-planned/features/procedural-assets.md)                   | Procedurally generated assets                  |
| [`spec-planned/features/plot-autopilot.md`](./spec-planned/features/plot-autopilot.md)                         | Automated plot progression                     |
| [`spec-planned/features/shared-worlds.md`](./spec-planned/features/shared-worlds.md)                           | Multi-user shared worlds                       |
| [`spec-planned/features/memory-visualization.md`](./spec-planned/features/memory-visualization.md)             | Memory visualization UI                        |
| [`spec-planned/features/mobile-native-ux.md`](./spec-planned/features/mobile-native-ux.md)                     | Mobile/native UX patterns                      |
| [`spec-planned/features/multimodal-input.md`](./spec-planned/features/multimodal-input.md)                     | Multimodal input (voice, image, etc.)          |
| [`spec-planned/features/device-tier-gating.md`](./spec-planned/features/device-tier-gating.md)                 | Feature gating by device capability            |
| [`spec-planned/features/lore-consistency-checker.md`](./spec-planned/features/lore-consistency-checker.md)     | Lore/world consistency validation              |
| [`spec-planned/features/offline-world-events.md`](./spec-planned/features/offline-world-events.md)             | Offline world event system                     |
| [`spec-planned/features/personas.md`](./spec-planned/features/personas.md)                                     | Persona features                               |
| [`spec-planned/features/regex-output-transforms.md`](./spec-planned/features/regex-output-transforms.md)       | Regex-based output transforms                  |
| [`spec-planned/features/prompt-injection.md`](./spec-planned/features/prompt-injection.md)                     | Prompt injection defense                       |
| [`spec-planned/features/provider-system.md`](./spec-planned/features/provider-system.md)                       | LLM provider abstraction                       |
| [`spec-planned/features/testing.md`](./spec-planned/features/testing.md)                                       | Testing strategy and goals                     |
| [`spec-planned/features/transport-unified.md`](./spec-planned/features/transport-unified.md)                   | HTTP/WS/WebTransport abstraction               |
| [`spec-planned/features/frontend-extensions.md`](./spec-planned/features/frontend-extensions.md)               | Frontend extension points                      |
| [`spec-planned/features/use-case-agentic-workspace.md`](./spec-planned/features/use-case-agentic-workspace.md) | Agentic workspace use case                     |
| [`spec-planned/features/assets-attribution.md`](./spec-planned/features/assets-attribution.md)                 | License/attribution for assets                 |
| [`spec-planned/features/admin-statistics.md`](./spec-planned/features/admin-statistics.md)                     | Admin statistics dashboard                     |
| [`spec-planned/features/ci-maintenance.md`](./spec-planned/features/ci-maintenance.md)                         | CI maintenance automation                      |
| [`spec-planned/features/e2e-benchmarks.md`](./spec-planned/features/e2e-benchmarks.md)                         | E2E performance benchmarks                     |
| [`spec-planned/features/edge-cases.md`](./spec-planned/features/edge-cases.md)                                 | Edge case handling                             |
| [`spec-planned/features/i18n-implementation.md`](./spec-planned/features/i18n-implementation.md)               | i18n implementation details                    |

### Ideas (`spec-planned/ideas/`)

Creative and UX exploration docs, sourced from competitor analysis.

| Document                                                                                         | Topics                                 |
| ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| [`spec-planned/ideas/index.md`](./spec-planned/ideas/index.md)                                   | Master index: 34 ideas across 8 themes |
| [`spec-planned/ideas/authoring-creation.md`](./spec-planned/ideas/authoring-creation.md)         | Authoring & creation tools             |
| [`spec-planned/ideas/immersion-presentation.md`](./spec-planned/ideas/immersion-presentation.md) | Immersion & presentation               |
| [`spec-planned/ideas/memory-continuity.md`](./spec-planned/ideas/memory-continuity.md)           | Memory & continuity systems            |
| [`spec-planned/ideas/platform-reach.md`](./spec-planned/ideas/platform-reach.md)                 | Platform reach & accessibility         |
| [`spec-planned/ideas/prompt-output-control.md`](./spec-planned/ideas/prompt-output-control.md)   | Prompt & output control                |
| [`spec-planned/ideas/social-multiplayer.md`](./spec-planned/ideas/social-multiplayer.md)         | Social & multiplayer                   |
| [`spec-planned/ideas/worlds-3d-navigation.md`](./spec-planned/ideas/worlds-3d-navigation.md)     | 3D world navigation                    |
| [`spec-planned/ideas/analytics-meta.md`](./spec-planned/ideas/analytics-meta.md)                 | Analytics & meta features              |

---

## Frontend UX (`frontend/`)

Detailed UX specifications for the htmx + Alpine.js web UI.

| Document                                                                     | Topics                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| [`frontend/overview.md`](./frontend/overview.md)                             | Design principles, CSS tokens, architecture |
| [`frontend/routing.md`](./frontend/routing.md)                               | URL scheme, navigation, htmx history        |
| [`frontend/data-states.md`](./frontend/data-states.md)                       | Entity state machines, cascade rules        |
| [`frontend/characters.md`](./frontend/characters.md)                         | Character list grid, create/edit form       |
| [`frontend/gallery.md`](./frontend/gallery.md)                               | Asset gallery, preview, upload              |
| [`frontend/worlds.md`](./frontend/worlds.md)                                 | World entity: list, detail, create/edit     |
| [`frontend/login.md`](./frontend/login.md)                                   | Login page, auth card, demo mode            |
| [`frontend/settings.md`](./frontend/settings.md)                             | Settings sections                           |
| [`frontend/admin.md`](./frontend/admin.md)                                   | Admin panel                                 |
| [`frontend/encryption.md`](./frontend/encryption.md)                         | User secret keys, AES-256-GCM               |
| [`frontend/age-gate.md`](./frontend/age-gate.md)                             | Age verification page                       |
| [`frontend/component-architecture.md`](./frontend/component-architecture.md) | HTMX/Alpine.js boundaries                   |
| [`frontend/headers-management.md`](./frontend/headers-management.md)         | Response headers                            |
| [`frontend/internationalization.md`](./frontend/internationalization.md)     | UI translation, LLM language                |
| [`frontend/components.md`](./frontend/components.md)                         | Shared components                           |
| [`frontend/notifications.md`](./frontend/notifications.md)                   | Notification system                         |

### Chat UX (`frontend/chat/`)

| Document                                                                     | Topics                                          |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| [`frontend/chat/overview.md`](./frontend/chat/overview.md)                   | Chat types, data model, message tree            |
| [`frontend/chat/layout.md`](./frontend/chat/layout.md)                       | Sidebar, centered width, responsive             |
| [`frontend/chat/messages.md`](./frontend/chat/messages.md)                   | Message bubbles, markdown, media, detail levels |
| [`frontend/chat/message-actions.md`](./frontend/chat/message-actions.md)     | Toolbars, shortcuts, threading, reactions       |
| [`frontend/chat/generation.md`](./frontend/chat/generation.md)               | Streaming, error handling, retries              |
| [`frontend/chat/archiving.md`](./frontend/chat/archiving.md)                 | Cascade deletion, restore, purge                |
| [`frontend/chat/input.md`](./frontend/chat/input.md)                         | Text input, media attach, LLM selector          |
| [`frontend/chat/memories.md`](./frontend/chat/memories.md)                   | Character/assistant memories                    |
| [`frontend/chat/commands-and-misc.md`](./frontend/chat/commands-and-misc.md) | Keyboard shortcuts, image pipeline              |
| [`frontend/chat/multi-llm-story.md`](./frontend/chat/multi-llm-story.md)     | Multi-LLM story: GM, turn-taking, quests        |
| [`frontend/chat/assistant.md`](./frontend/chat/assistant.md)                 | Assistant as GM/Moderator                       |
| [`frontend/chat/export.md`](./frontend/chat/export.md)                       | Export formats, public sharing                  |
| [`frontend/chat/group-chat.md`](./frontend/chat/group-chat.md)               | Multi-participant chat                          |
| [`frontend/chat/prompt-creation.md`](./frontend/chat/prompt-creation.md)     | Prompt templates, variable injection            |

---

## Guides (`guide/`)

| Document                                                 | Topics                                   |
| -------------------------------------------------------- | ---------------------------------------- |
| [`guide/getting-started.md`](./guide/getting-started.md) | Quick start                              |
| [`guide/installation.md`](./guide/installation.md)       | Prerequisites, setup                     |
| [`guide/characters.md`](./guide/characters.md)           | Creating, importing, managing characters |

---

## Reference (`reference/`)

| Document                                 | Topics             |
| ---------------------------------------- | ------------------ |
| [`reference/api.md`](./reference/api.md) | REST API reference |

---

## Meta (`meta/`)

Project planning, reviews, analysis, and research.

| Document                                     | Topics                       |
| -------------------------------------------- | ---------------------------- |
| [`meta/plan.md`](./meta/plan.md)             | MVP implementation checklist |
| [`meta/backlog.md`](./meta/backlog.md)       | Future feature queue         |
| [`meta/open-items.md`](./meta/open-items.md) | Technical debt & bugs        |
| [`meta/roadmap.md`](./meta/roadmap.md)       | Long-term feature roadmap    |

### Reviews (`meta/reviews/`)

| Document                                                                                       | Topics                             |
| ---------------------------------------------------------------------------------------------- | ---------------------------------- |
| [`meta/reviews/alpine-htmx-integration.md`](./meta/reviews/alpine-htmx-integration.md)         | Alpine + htmx integration patterns |
| [`meta/reviews/alpine-htmx-e2e-feasibility.md`](./meta/reviews/alpine-htmx-e2e-feasibility.md) | E2E testing feasibility            |
| [`meta/reviews/review-rounds.md`](./meta/reviews/review-rounds.md)                             | Review session history             |
| [`meta/reviews/fe-be-compatibility.md`](./meta/reviews/fe-be-compatibility.md)                 | Frontend/backend compatibility     |

### Analysis (`meta/analysis/`)

| Document                                                                                   | Topics                      |
| ------------------------------------------------------------------------------------------ | --------------------------- |
| [`meta/analysis/string-to-enum-migration.md`](./meta/analysis/string-to-enum-migration.md) | String-to-enum DB migration |

### Assessments (`meta/assessments/`)

| Document                                                                             | Topics                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------- |
| [`meta/assessments/index.md`](./meta/assessments/index.md)                           | Feature assessment overview              |
| [`meta/assessments/feature-analysis.md`](./meta/assessments/feature-analysis.md)     | 34 ideas evaluated by business relevance |
| [`meta/assessments/platform-fit.md`](./meta/assessments/platform-fit.md)             | Platform fit assessment                  |
| [`meta/assessments/business-scenarios.md`](./meta/assessments/business-scenarios.md) | Business scenario analysis               |
| [`meta/assessments/recommendations.md`](./meta/assessments/recommendations.md)       | Implementation recommendations           |

### Research (`meta/research/`)

| Document                                                                                             | Topics                                 |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`meta/research/use-cases.md`](./meta/research/use-cases.md)                                         | Use case analysis                      |
| [`meta/research/rpg-mechanics-flexible-system.md`](./meta/research/rpg-mechanics-flexible-system.md) | RPG mechanics flexible system research |
| [`meta/research/rpg-systems-comparison.md`](./meta/research/rpg-systems-comparison.md)               | RPG systems comparison                 |
| [`meta/research/flexible-rpg-patterns.md`](./meta/research/flexible-rpg-patterns.md)                 | Flexible RPG patterns                  |

### Code Practices (`meta/code-practices-improvements/`)

| Document                                                                                                                                             | Topics                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| [`meta/code-practices-improvements/README.md`](./meta/code-practices-improvements/README.md)                                                         | Coding standards improvement overview |
| [`meta/code-practices-improvements/01-strict-typing.md`](./meta/code-practices-improvements/01-strict-typing.md)                                     | Strict typing improvements            |
| [`meta/code-practices-improvements/02-eslint-and-static-analysis.md`](./meta/code-practices-improvements/02-eslint-and-static-analysis.md)           | ESLint and static analysis            |
| [`meta/code-practices-improvements/03-extensibility-code-patterns.md`](./meta/code-practices-improvements/03-extensibility-code-patterns.md)         | Extensibility patterns                |
| [`meta/code-practices-improvements/04-code-organization-and-splitting.md`](./meta/code-practices-improvements/04-code-organization-and-splitting.md) | Code organization                     |
| [`meta/code-practices-improvements/05-testing-e2e-multiple-db.md`](./meta/code-practices-improvements/05-testing-e2e-multiple-db.md)                 | E2E testing, multiple DB              |
| [`meta/code-practices-improvements/06-schemas-and-openapi.md`](./meta/code-practices-improvements/06-schemas-and-openapi.md)                         | Schemas and OpenAPI                   |
| [`meta/code-practices-improvements/07-alternative-frontend-support.md`](./meta/code-practices-improvements/07-alternative-frontend-support.md)       | Alternative frontend support          |
| [`meta/code-practices-improvements/08-plugins-hooks-integration.md`](./meta/code-practices-improvements/08-plugins-hooks-integration.md)             | Plugins and hooks integration         |

---

## Documentation Hosting

This documentation is written in Markdown and can be served from the `/docs/` route. To disable:

1. Set environment variable `DOCS_ENABLED=false`
2. Or set `docs.enabled: false` in the configuration file
3. Individual sections can be hidden per config

## Getting Started

See the [build and deployment guide](./spec/build-deploy.md) for detailed setup instructions.

## License

This project is licensed under the LGPL-3.0-or-later License (core code).
Documentation is MIT. See [LICENSES/](../LICENSES/) for full texts.
