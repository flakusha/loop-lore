# loop-lore Documentation

## Overview

Reimplementation of SillyTavern with enhanced features:

- TUI mode
- Database support (local and remote)
- Gallery feature (chat/character/location/profile)
- Enhanced assistant chat (user assistance focused)
- User management & multi-session support
- Message persistence & reliability

## Specification Documents

| Document                                        | Topics                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| [`docs/architecture.md`](./architecture.md)     | System layers, request flow, asset serving, multi-process design        |
| [`docs/frontend.md`](./frontend.md)             | htmx + Alpine.js, prebuilt HTML, static assets, TUI parity              |
| [`docs/users-sessions.md`](./users-sessions.md) | User roles, remote sessions, demo/solo mode, HTTPS                      |
| [`docs/messages.md`](./messages.md)             | Message persistence, detail levels, invalid message handling            |
| [`docs/build-deploy.md`](./build-deploy.md)     | Minimum-build setup, build pipeline, distributed deployment             |
| [`docs/implementation.md`](./implementation.md) | Tech stack, DB approach, assistant, TUI internals (legacy gallery refs) |
| [`docs/schema.md`](./schema.md)                 | Full DB schema: users, sessions, chats, messages, assets, worlds        |
| [`docs/assets.md`](./assets.md)                 | Asset system replacing gallery — images/audio/video, upload, linking    |
| [`docs/tui.md`](./tui.md)                       | TUI components, data flow, keyboard shortcuts                           |
| [`docs/testing.md`](./testing.md)               | Testing strategy, tools, coverage goals, and best practices             |

## Features

### TUI Mode

- Terminal User Interface using `blessed` and `blessed-contrib`
- Chat interface with message history
- Integrated gallery view for media browsing
- Keyboard navigation for seamless interaction
- Detailed implementation: [`docs/tui.md`](./tui.md)

### Database Support

- SQLite for local development (starter option)
- Abstracted database layer for easy migration to PostgreSQL/MySQL
- Schema includes: chats, characters, messages, gallery items, users, sessions
- Migration system using Kysely Migrator
- Details: [`docs/implementation.md`](./implementation.md) → Database Layer

### Asset System (Replaces Gallery)

- Universal media store: images (JPEG, PNG, WebP, AVIF), audio (OGG, Opus, MP3, FLAC), video (WebM, MP4)
- Polymorphic linking — assets link to any entity (chat, character, world, user, message)
- Upload pipeline with auto-compression (WebP, thumbnail)
- REST API endpoints for CRUD + linking
- Details: [`docs/assets.md`](./assets.md)

### Enhanced Assistant Chat

- Assistant focused on user assistance (ideas, suggestions, troubleshooting)
- Rule-based MVP with context awareness
- REST API endpoint for assistant queries
- Integrated with TUI chat interface
- Details: [`docs/implementation.md`](./implementation.md) → Enhanced Assistant Chat

### User Management & Sessions

- Multi-role user system (admin, user, viewer, solo)
- Simultaneous remote sessions per user
- Local demo/solo mode with zero config
- HTTPS support for local and remote
- Details: [`docs/users-sessions.md`](./users-sessions.md)

### Message Integrity

- Messages survive crashes, disconnects, machine failure
- Write-ahead persistence with transaction safety
- Basic vs expanded detail levels (gameplay immersion vs dev stats)
- Invalid messages user-hideable, never silently dropped
- Group chat: human messages omit LLM metrics
- Details: [`docs/messages.md`](./messages.md)

### Frontend Architecture

- htmx for AJAX partial updates
- Alpine.js for client-side state/interactivity
- Prebuilt, pre-compressed HTML and static assets
- Same server serves both web and TUI clients
- Details: [`docs/frontend.md`](./frontend.md)

## Architecture Overview

See [`docs/architecture.md`](./architecture.md) for system architecture including:

- Technology stack (Bun, TypeScript, htmx, Alpine.js)
- Database: `bun:sqlite` + Kysely (type-safe queries, dialect-swappable)
- API structure
- TUI implementation
- Asset system and assistant

## Build & Deployment

See [`docs/build-deploy.md`](./build-deploy.md) for:

- Quick start (one command, zero config)
- Build pipeline and asset pre-compression
- Single binary, Docker, and reverse-proxy deployment options
- Docker Compose template for production

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

See the [build and deployment guide](./build-deploy.md) for detailed setup instructions.

## License

This project is licensed under the LGPL-3.0-or-later License (core code).  
Documentation is MIT. See [LICENSES/](../LICENSES/) for full texts.