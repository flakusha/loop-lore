# Roadmap

Current status of feature areas. Checkmarks = code exists in `src/`.

## ✅ Core Infrastructure (Built)

| Feature                                      | Implementation                                                        |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Database schema (19 tables)                  | `src/db/schema-*.ts`, `migrations/001_init.ts`                        |
| Enums (30+ const+type pairs)                 | `src/db/enums-*.ts`                                                   |
| Kysely init + WAL + FK                       | `src/db/index.ts`                                                     |
| DB migrate runner                            | `src/db/migrate.ts`                                                   |
| Config loader (YAML/TOML/env)                | `src/config/load.ts`                                                  |
| TLS cert auto-generation                     | `src/config/cert.ts`                                                  |
| Auth middleware (Bearer+SHA256)              | `src/middleware/auth.ts`                                              |
| Middleware pipeline (compose, errorBoundary) | `src/middleware/pipeline.ts`                                          |
| Structured logger (levels, rotate, censor)   | `src/logger/*.ts`                                                     |
| Content encoding (gzip/zstd/brotli)          | `src/content/encode.ts`, `compress.ts`                                |
| Content minification                         | `src/content/minify.ts`                                               |
| Transport layer (H1/H2/WS/negotiation)       | `src/transport/*.ts`                                                  |
| HTTP/HTTPS server                            | `src/server.ts`                                                       |
| Stats/age-gate generation controllers        | `src/age-gate/controller.ts`, `src/generation/controller.ts`          |
| CSS themes (12) + app CSS                    | `src/public/css/*.css`                                                |
| Frontend browser lib (crypto/compress)       | `src/frontend/browser.ts`                                             |
| Web UI view templates                        | `src/views/chat.html`, `gallery.html`, `layout.html`, `settings.html` |
| HTTP utils                                   | `src/routes/http-utils.ts`                                            |

## 🏗 Integration Phase (Current Focus)

- CRUD route controllers — chats, messages, characters, users, worlds, assets
- Route router — single dispatch URL→handler (`src/routes/router.ts`)
- View serving — `/views/chat|gallery|characters|settings` endpoints
- Assistant service — rule-based MVP (`src/assistant/service.ts`)
- TUI widgets — chat, input, screen manager (`src/tui/`)
- Web UI ↔ API wiring — htmx swaps end-to-end
- Sample plugins — dice/roll tool as early plugin prototype

## 🎯 Planned Features

### P1: User-Facing Features

- Advanced Memory Systems: long-term character/world memory with retrieval
- Lorebook/World Info: sticky entries, cooldowns, activation conditions
- Character Cards: full V2/V3 PNG and JSON import/export
- Streaming Responses: real-time token streaming with visual feedback
- Multi-modal Support: image/audio/video generation and analysis
- Plugin System: server-side extensions + registry
- Client Extensions: WebUI/TUI plugin architecture
- Conversation Branching: tree navigation for chat history
- Character Relationships: relationship graph and stat tracking
- Co-editing: real-time collaborative chat editing
- Prompt Library: tagged prompt snippets and templates

### P1: Infrastructure

- Asset system service — upload, polymorphic linking, CRUD (`src/assets/`)
- Age gate enforcement — config-driven NSFW prohibition, birth year checks
- Profanity filter — hardcoded list + `filter()` function
- Event Bus: robust pub/sub for loose coupling
- Provider Registry: clean LLM backend abstraction layer
- Agentic Workspace: Worlds→Epics, Locations→Tasks, Characters→Agents

### P2: Advanced AI

- Tool Use Framework, Function Calling, RAG, Model Comparison, Workflow Automation
- Agent Systems, Multi-Agent Collaboration, Structured Output, Prompt Chaining
- Tool Chaining, AutoGPT-like Agents, Conversation Analytics, Content Discovery, Memory Visualizer

### P2: User Experience

- Theming System (structure exists, needs UI), Session Management, Role-Based Access
- Export/Import, Search & Filter, Notifications, i18n, Accessibility, PWA

### P2: Browser Hardening (Response Headers)

Policy engine built and wired (`src/middleware/response-headers.ts`, `ResponseHeaderPolicy`).
Config: `headers` block in `src/config/schema.ts` + `schema-class.ts`. Post-MVP follow-ups:

- Self-host htmx + Alpine (drop CDN hosts from CSP)
- Flip COEP on (`require-corp`) after self-hosting unlocks SharedArrayBuffer etc.
- Early Hints (103) — spike; Bun's fetch has no 103 API
- CSP Report-Only rollout → enforce after clean window
- Confirm `x-on:click="window.fn($el)"` fires in headless browser

### P2: Administrative

- Admin Dashboard, User Management, Backup & Recovery, Audit Logging
- Rate Limiting & Quotas, API Versioning, Health Checks, Billing & Usage Tracking

### P3: Enterprise & Scale

- Database Peripherals (pooling, caching, replicas), Storage Abstraction (local/S3/GCS)
- Observability (OpenTelemetry), Horizontal Scaling (Redis, WebSocket)
- Build System (Bun build, Docker, K8s), Migration Tools (SillyTavern import)
- Webhook System, API-First Design, OAuth/LDAP/SAML/OIDC/SCIM Auth
- Vector DB Options (Chroma, PGVector, Qdrant, Milvus), Model Hub Integration
- Cross-Platform Clients, File System Integrations (Drive, OneDrive, Dropbox)
- Communication Integrations (Slack, Discord, Telegram), CDN, Edge Functions
- Multi-Region Deployments, Prompt Optimization, Fine-tuning Interface
- Synthetic Data Generation, Plugin Marketplace, Template Marketplace, Community Moderation

## Deferred Concepts

Tracked in `backlog.md` (P3 section). Post-MVP: Tool/Function Calling, BYOK, BYOR, 3D World, Cross-Chat Autonomous Messages, Dual Runtime, LLM native providers, Image/Video Generation, Full i18n.

## Dual-Use Architecture

1. **RPG Mode** (default) — Roleplay chat with characters, worlds, story features
2. **Agentic Workspace Mode** — AI-assisted workspaces (agents solve problems, execute code, conduct research)

See `docs/spec/use-case-agentic-workspace.md` for RPG→agentic mapping.

## Long-term Vision

Federated Identity (Web3/DID), P2P modes (offline-first), Marketplace, Analytics Suite, Research tools, Decentralized Storage (IPFS/Filecoin), DAO Governance, AI-Generated Content, XR/VR Integration, Real-time Collaboration, Simulation Sandboxes, Edge Computing, Quantum-Resistant Cryptography, Neuro-Symbolic AI.

## Timeline

See `plan.md` for v0.2 checklist, `backlog.md` for future queue, `open-items.md` for technical debt, `CONTRIBUTING.md` for contribution guidelines.