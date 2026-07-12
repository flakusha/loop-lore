# Roadmap

Current status of feature areas with implementation progress. Checkmarks =
code exists in `src/`. Target boxes = planned.

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

Bridge between existing backend and user-facing UIs.

- [ ] **CRUD route controllers** — chats, messages, characters, users, worlds, assets
- [ ] **Route router** — single dispatch URL→handler in `src/routes/router.ts`
- [ ] **View serving** — `/views/chat|gallery|characters|settings` endpoints
- [ ] **Assistant service** — rule-based MVP (`src/assistant/service.ts`)
- [ ] **TUI chat widget** — `src/tui/chat.ts` (List + Textbox)
- [ ] **TUI input widget** — `src/tui/input.ts`
- [ ] **TUI screen manager** — expand `src/tui/app.ts` with layout
- [ ] **Web UI ↔ API wiring** — htmx swaps working end-to-end
- [x] **Sample plugins** — dice/roll tool as early plugin prototype

## 🎯 Planned Features (Priority Order)

### P1: User-Facing Features

- [ ] **Advanced Memory Systems**: Long-term character/world memory with retrieval
- [ ] **Lorebook/World Info**: Sticky entries, cooldowns, activation conditions
- [ ] **Character Cards**: Full V2/V3 PNG and JSON import/export
- [ ] **Streaming Responses**: Real-time token streaming with visual feedback
- [ ] **Multi-modal Support**: Image/audio/video generation and analysis
- [ ] **Plugin System**: Server-side extensions + registry
  - Sample plugins (dice, roll, simple tools) buildable early
  - Full UI/registry wiring deferred
- [ ] **Client Extensions**: WebUI/TUI plugin architecture
- [ ] **Conversation Branching**: Tree navigation for chat history
- [ ] **Character Relationships**: Relationship graph and stat tracking
- [ ] **Co-editing**: Real-time collaborative chat editing
- [ ] **Prompt Library**: Tagged prompt snippets and templates

### P1: Infrastructure

- [ ] **Asset system service** — upload, polymorphic linking, CRUD (`src/assets/`)
- [ ] **Age gate enforcement** — config-driven NSFW prohibition, birth year checks
- [ ] **Profanity filter** — hardcoded list + `filter()` function
- [ ] **Event Bus**: Robust pub/sub for loose coupling
- [ ] **Provider Registry**: Clean LLM backend abstraction layer
- [ ] **Agentic Workspace**: Worlds→Epics, Locations→Tasks, Characters→Agents

### P2: Advanced AI

- [ ] **Tool Use Framework**: Standardized AI tool interface
- [ ] **Function Calling**: Structured API for AI functions
- [ ] **Retrieval Augmented Generation (RAG)**: Document ingestion + semantic search
- [ ] **Model Comparison**: Side-by-side testing with evaluation
- [ ] **Workflow Automation**: Prompt chains for complex tasks
- [ ] **Agent Systems**: Specialized AI roles (researcher, coder, analyst)
- [ ] **Multi-Agent Collaboration**: Multiple agents on complex tasks
- [ ] **Structured Output**: JSON/YAML enforcement from LLMs
- [ ] **Prompt Chaining**: Reusable templates for complex reasoning
- [ ] **Tool Chaining**: Dynamic tool output→input chaining
- [ ] **AutoGPT-like Agents**: Autonomous self-directing agents
- [ ] **Conversation Analytics**: Token/timing/sentiment dashboards
- [ ] **Content Discovery**: Recommendation engine and similar content finder
- [ ] **Memory Visualizer**: Timeline/graph view of memory entries

### P2: User Experience

- [ ] **Theming System**: Customizable UI themes (structure exists, needs UI)
- [ ] **Session Management**: Multiple concurrent sessions per user
- [ ] **Role-Based Access**: Admin/user/guest with granular permissions
- [ ] **Export/Import**: Chat/character/world backup and migration
- [ ] **Search & Filter**: Full-text search across messages, characters, lore
- [ ] **Notifications**: Configurable alerts for events and mentions
- [ ] **Internationalization**: Full i18n (see `docs/frontend/internationalization.md`)
- [ ] **Accessibility**: Screen reader, keyboard nav, ARIA
  - [ ] **Progressive Web App (PWA)**: Offline, installability, push

### P2: Browser Hardening (FExBE Response Headers)

Response-header policy engine is **built and wired** (`src/middleware/response-headers.ts`,
class `ResponseHeaderPolicy`, applied to every response in `src/server.ts` fetchHandler).
Config: `headers` block in `src/config/schema.ts` + `schema-class.ts`. Covers security,
isolation (COOP/COEP off by default), perf, and observability; CSP enforces with inline
`onclick=` handlers migrated to Alpine `x-on:click` (no `'unsafe-hashes'`; `style-src` uses
`'unsafe-inline'` because `'unsafe-hashes'` never covered inline `style="..."` and there are
hundreds). Follow-ups below are post-MVP — recorded here so they don't need re-research:

- [ ] **Self-host htmx + Alpine** — `src/views/layout.html` and `index.html` load them from
      `unpkg`/`jsdelivr`; drop those hosts from `csp.scriptSrc` to tighten. Currently required.
- [ ] **Flip COEP on** (`headers.crossOriginEmbedderPolicy: "require-corp"`) — only after
      self-hosting above; COEP breaks cross-origin CDN scripts. Unlocks cross-origin isolation
      (SharedArrayBuffer, WebGPU, wasm threads) for future browser-side AI / llama.cpp wasm.
- [ ] **Early Hints (103)** — `headers.earlyHints.enabled` flag exists but is a **spike**; Bun's
      `fetch` handler has no first-class 103 API. `Link: preload` header already covers the win.
- [ ] **CSP Report-Only rollout** — `csp.reportOnly: true` emits
      `Content-Security-Policy-Report-Only` (observe violations via `reportingEndpoints`/`nel`);
      flip to enforcing after a clean window.
- [ ] **Browser/e2e confirmation** that `x-on:click="window.fn($el|$event)"` actually fires —
      handlers are `globalThis`-attached in `src/frontend/ui.ts:130-138` and loader globals
      (`src/frontend/loaders.d.ts`); no headless browser run yet to visually confirm.

### P2: Administrative

- [ ] **Admin Dashboard**: System metrics, usage stats, performance monitoring
- [ ] **User Management**: Registration, profiles, preferences, activity
- [ ] **Backup & Recovery**: Automated schedules, point-in-time recovery
- [ ] **Audit Logging**: Comprehensive activity logs
- [ ] **Rate Limiting & Quotas**: Per-user/resource controls
- [ ] **API Versioning**: Stable contracts with versioned endpoints
- [ ] **Health Checks**: Service monitoring, auto-recovery
- [ ] **Billing & Usage Tracking**: Metered usage for cloud

### P3: Enterprise & Scale

- [ ] **Database Peripherals**: Connection pooling, query caching, read replicas
- [ ] **Storage Abstraction**: Pluggable backends (local/S3/GCS)
- [ ] **Observability**: OpenTelemetry metrics, tracing, logging
- [ ] **Horizontal Scaling**: Redis sessions, WebSocket support
- [ ] **Build System**: Bun build, Docker, Kubernetes manifests
- [ ] **Migration Tools**: Import/export from SillyTavern, others
- [ ] **Webhook System**: Outgoing integrations
- [ ] **API-First Design**: Complete RESTful API + WebSocket
- [ ] **Authentication Providers**: OAuth, LDAP, SAML/OIDC, SCIM
- [ ] **Vector Database Options**: Chroma, PGVector, Qdrant, Milvus
- [ ] **Model Hub Integration**: Hugging Face and similar
- [ ] **Cross-Platform Clients**: Mobile and desktop native
- [ ] **File System Integrations**: Google Drive, OneDrive, Dropbox
- [ ] **Communication Integrations**: Slack, Discord, Telegram
- [ ] **CDN Integration**: Content delivery network for assets
- [ ] **Edge Functions**: Serverless function support
- [ ] **Multi-Region Deployments**: Geographic distribution
- [ ] **Prompt Optimization**: AI-suggested prompt improvements
- [ ] **Fine-tuning Interface**: Model training UI
- [ ] **Synthetic Data Generation**: Training data creation tools
- [ ] **Plugin Marketplace**: Community plugins with ratings
- [ ] **Template Marketplace**: Shared templates and prompts
- [ ] **Community Moderation**: Content moderation tools

## Deferred Concepts

Tracked in [`docs/meta/backlog.md`](backlog.md) (P3 section). These are
**planned but post-MVP**: Tool/Function Calling, BYOK, BYOR, 3D World,
Cross-Chat Autonomous Messages, Dual Runtime, LLM native providers,
Image/Video Generation, Full i18n implementation.

---

## Dual-Use Architecture: RPG + Agentic Workspace

loop-lore as **dual-mode application**:

1. **RPG Mode** (default) — Roleplay chat with characters, worlds, story features
2. **Agentic Workspace Mode** — AI-assisted workspaces (agents solve problems,
   execute code, conduct research)

See `docs/spec/use-case-agentic-workspace.md` for RPG→agentic mapping
(Worlds→Epics, Locations→Tasks, Characters→Agents).

## Long-term Vision

- Federated Identity (Web3/DID)
- Peer-to-Peer modes (offline-first, sync-when-available)
- Marketplace for characters, lorebooks, plugins
- Analytics suite
- Research tools (academic collaboration, experiment tracking)
- Decentralized Storage (IPFS/Filecoin)
- DAO Governance (token-weighted voting)
- AI-Generated Content (procedural worlds, characters, quests)
- XR/VR Integration (immersive roleplay + workspaces)
- Real-time Collaboration (Google Docs-style)
- Simulation Sandboxes (isolated agent/code testing)
- Edge Computing (low-latency deployments)
- Quantum-Resistant Cryptography
- Neuro-Symbolic AI

## Timeline

Roadmap subject to change based on community feedback, contributor availability,
and evolving priorities. Features may be reprioritized, combined, or split.

See `docs/meta/plan.md` for the concrete v0.2 implementation checklist.
See `docs/meta/backlog.md` for future feature queue.
See `docs/meta/open-items.md` for technical debt and bugs.
See `CONTRIBUTING.md` for contribution guidelines.
