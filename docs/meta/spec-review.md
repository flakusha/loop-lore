# Spec Review — Tier 2 Tracking

## Legend
- ✅ **Reviewed** — final pass done, no gaps
- 🔍 **In review** — currently checking
- ⏳ **Pending** — not yet started
- ❌ **Gaps found** — issues identified, needs fix

---

## Core System

| Doc | Status | Key questions/gaps | Priority |
|-----|--------|-------------------|----------|
| `architecture.md` | ⏳ | System layers, request flow—alignment check | P1 |
| `implementation.md` | ⏳ | Module wiring, dependency graph | P0 |
| `messages.md` | 🔍 | Detail levels, invalid message handling, tree traversal | P0 |
| `actors.md` | ⏳ | Data model, lorebooks, field mapping | P0 |
| `users-sessions.md` | ⏳ | Roles, remote sessions, demo/solo, session expiration | P0 |
| `schema.md` | ✅ | Reviewed, updated with difficulty columns | P0 |
| `api-routes.md` | ✅ | Reviewed, error envelope aligned | P0 |
| `auth-middleware.md` | ✅ | Reviewed | P0 |
| `error-envelope.md` | ✅ | Reviewed | P0 |

## Features (Phase 2-4)

| Doc | Status | Key questions/gaps | Priority |
|-----|--------|-------------------|----------|
| `rpg-mechanics.md` | 🔍 | Difficulty done; stats/combat/dice/equipment pending | P2 |
| `plugin-system.md` | ⏳ | Architecture, lifecycle, security model | P2 |
| `memory-system.md` | ⏳ | Three-tier: episodic, semantic, procedural | P2 |
| `artifacts-system.md` | ⏳ | Code/documents/datasets as assets | P3 |
| `character-setup.md` | ✅ | Reviewed, normalizer pipeline finalized | P0 |
| `assets.md` | ✅ | Reviewed, storage layout finalized | P1 |

## Integrations

| Doc | Status | Key questions/gaps | Priority |
|-----|--------|-------------------|----------|
| `integrations/llm-serving.md` | ⏳ | Provider config, streaming, retries, policy detection | P0 |
| `integrations/image-generation.md` | ⏳ | Image gen pipeline | P3 |

## Ops & UI

| Doc | Status | Key questions/gaps | Priority |
|-----|--------|-------------------|----------|
| `tui.md` | ⏳ | Component hierarchy, keyboard map, data flow | P2 |
| `transport-unified.md` | ⏳ | H1/H2/WS transport, SSE for streaming | P1 |
| `logging.md` | ⏳ | Structured logging, rotation, levels | P2 |
| `testing.md` | ⏳ | Strategy, fixtures, CI pipeline | P2 |
| `build-deploy.md` | ⏳ | Build pipeline, deployment options | P3 |
| `architecture.md` | ⏳ | System layers doc | P1 |
| `use-case-agentic-workspace.md` | ⏳ | Future exploration | P4 |

Total: 22 docs. **6✅ reviewed, 2🔍 in review, 14⏳ pending.**