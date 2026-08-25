<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## P3 — Core Foundation (0.1.0 value tiers)

> **0.1.0 scope = highest-value features.** P3→P5 follow this list; non-value work sits
> in P6+ (`../open-inflight.md`) unless it blocks these tiers. "P4/P5" workstreams below carry the
> **open remainder** of each P3 row (the status column is the summary; the P4/P5 sections
> list what still needs doing to close the row).
>
> **2026-08-21 reconcile additions** — 7 P3 tickets from Scout Batch C added below as rows 18-24.

| #  | Value feature                                           | Status                 | Where / next                                                                                                                                |
:| -- | ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | User registration                                       | 🟢 complete            | `POST /api/auth/register` ✅ + `/register` page ✅ (2026-08-12)                                                                             |
| 2  | User authentication                                     | 🟡 partial             | login/logout/demo-login/`/me` ✅; `/api/sessions` pending; MFA deferred P6+                                                                 |
| 3  | Correct access (chats/assets/worlds/locations)          | 🟢 core                | actor ownership; 401 guards unified; message/reaction checks ✅; **world/location access enforced ✅ (2026-08-12)**                          |
| 4  | Encryption + compression flow                           | ✅ wired               | browser AES-256-GCM; `pipeline.ts` messages + asset encrypt/decrypt; per-chat key + 🔒 badge (2026-08-06)                                   |
| 5  | Chats — all 9 types                                     | 🟡 P2-B                | autorenaming/sections/invites/filters/message-search/transfer ✅                                                                            |
| 6  | NSFW features, prompting, opt-in, sfw/nsfw caps         | 🟢 complete            | runtime config + enforcement ✅; audit-log UI + consent display ✅ (2026-08-06); character 5-tier rating UI open                            |
| 7  | Metadata extraction + captioning                        | 🟢 done                | regex pipeline + caption-route                                                                                                              |
| 8  | i18n                                                    | 🟢 done                | `ctx.t` + locales ✅; frontend strings + locale switcher ✅ (2026-08-06)                                                                    |
| 9  | Visual novel mode                                       | ✅ complete            | `src/frontend/vn/` + `src/story/`; gallery-in-scene inheritance open                                                                        |
| 10 | Gallery + (image) asset preview                         | ✅ complete          | `gallery.ts` + `assetRoutes` ✅; signed URLs ✅ (C6, `6b4e1ab4`) — download/copy/preview via HMAC-SHA256 signed URLs |
| 11 | User + admin panels, settings, fine-tuning              | 🟡 partial             | admin user mgmt ✅; fine-tuning UI / provider health pending                                                                                |
| 12 | (Side panels) without leaving chat                      | 🟡 partial             | chat-settings modal ✅; **in-chat asset preview + linkage ✅** (`FEAT-in-chat-asset-preview-linkage-side-panel`, issue `fef7e3b` closed 2026-08-19) — gallery-sidebar + media-preview-modal + `pendingAssets`→message attachments |
| 13 | Chat settings menus — templates, tuning                 | 🟡 partial             | setup-template selector ✅; prompt-template registry `src/prompts/registry.ts` ✅ (2026-08-12); detailed tuning frontend open                |
| 14 | Character/world/location flows                          | ✅ complete           | char import (PNG/YAML/TOML/JSON/CHARX) ✅; char export (PNG/JSON/YAML/TOML) ✅; world import bundle ✅; world export (`worlds/:id/export`) ✅; location creation inline in `world-detail.html` ✅; location export bundled in world export ✅ (code-verified 2026-08-20) |
| 15 | LLM support (chat/captioning/intent/embeddings)         | 🟢 chat/caption/intent | providers ✅ (openai-compat + Anthropic + Ollama native 2026-08-17); `classifyIntent` wired; embeddings greenfield                                                                                 |
| 16 | Assistant creative tooling                              | 🟡 partial             | command buttons + parser ✅; **tool-call UI ✅ (2026-08-12)**; creation wizards pending                                                     |
| 17 | Frontend fully wired                                    | 🟡 ongoing             | menus/modals/side-menus/docs — docs reconciliation **merged 2026-08-14** (`docs-reconcile`); 17 broken internal md links open (see `../open-inflight.md`)                            |
| 18 | **Command palette FE not wired to BE** (WIRE)           | 🟡 new                 | `WIRE-assistant-command-palette-stale-static-list.md` — FE list hardcoded, drifts from BE registry. Effort: Medium |
| 19 | **Creation wizard cross-talk** (BUG)                    | 🟡 new                 | `BUG-characters-creation-wizard-wizardid-unused.md` — `confirmWizard` ignores `wizardId`. Effort: Small |
| 20 | **Chat batch export N+1** (BUG)                         | 🟡 new                 | `BUG-chat-batch-export-n-plus-one.md` — sequential per-message queries. Effort: Small |
| 21 | **Mention error silent swallow** (BUG)                  | 🟡 new                 | `BUG-chat-mention-silent-error-swall.md` — persist/notify failures swallowed. Effort: Small |
| 22 | **Quiet hours boundary off-by-one** (BUG)               | 🟡 new                 | `BUG-chat-quiet-hours-boundary.md` — proactive timing edge case. Effort: Trivial |
| 23 | **Gallery onclick ReferenceError** (BUG)                | 🟡 new                 | `BUG-gallery-openAssetPreview-context-safety.md` — context safety when not top-level. Effort: Small |
| 24 | **Gallery uploads sequential** (PERF)                   | 🟡 new                 | `PERF-gallery-uploadChatAssets-sequential.md` — parallelize uploads. Effort: Small |
| —  | IO: import/export (characters/worlds/locations/stories) | ✅ shipped             | char import (PNG/YAML/TOML/JSON/CHARX) ✅; char export (PNG/JSON/YAML/TOML) ✅; world import bundle ✅; world/loc/story export ✅; bulk ZIP export ✅ (code-verified 2026-08-20) |
| —  | Stop generation (chat/VN)                               | 🟢 shipped             | chat abort/cancel + VN in-scene stop overlay (2026-08-06)                                                                                   |
| —  | Notifications + center                                  | 🟢 shipped             | SSE + unread badge + center UI + per-type mute (2026-08-06)                                                                                 |
| —  | Filtering & search                                      | 🟡 partial             | chat room filters + message search ✅; world/location search pending                                                                        |
| —  | Memory injection (high priority)                        | 🟢 per-viewer ✅       | `memorySection` 1024-token budget (2026-08-01); cross-actor test shipped                                                                    |
| —  | Template injection (high priority)                      | 🟢 shipped             | `LLM_PROMPT_DEFAULTS` + `resolveSystemPrompt`; registry impl `src/prompts/registry.ts` ✅ (2026-08-12); UX pending (P4)                     |

## P4 — Core Experience (open remainder of P3 rows)

- [ ] Memory + template injection UX — memory selection UI (mid-chat, pinning); **template injection UX partial** (read-only prompt preview in chat settings modal 2026-08-14; open: inline override per-chat)
- [x] Character/world/location flows — multi-format import, creation + settings menus ✅ (code-verified 2026-08-20; C4 closed in open-inflight.md)
- [ ] Assistant tooling — creation wizards, `/commands` tiered access (tool-call display ✅ 2026-08-12) (P3 #16 / P2-C)
- [x] LLM providers — Anthropic + Ollama native ✅ 2026-08-17 (`chat-matrix-ui-remainder`); ~Bedrock deferred (SigV4 scope)~ (P3 #15)
- [x] Assets — signed URLs (compression flow ✅ 2026-08-12) (P3 #10) — ✅ DONE (C6, `6b4e1ab4`)
- [ ] Fine-tuning experience — provider health panel; fine-tuning UI for chat/persona/character (P3 #11)
- [x] NSFW — character 5-tier rating runtime enforcement ✅ (code-verified 2026-08-20; C2 closed in open-inflight.md)
- [ ] Chat UI — group chat matrix UI, unified GM↔assistant view (GM panels ✅ + quest log ✅ 2026-08-12; participant panel ✅ 2026-08-14; **turn-order indicator + side-channels ✅ 2026-08-16**; unified GM↔assistant view = E1) (P2-B/P2-D)
- [x] **Lorebook activation conditions** (`FEAT-055`) — regex keys, AND/OR key_groups, scan_depth, activation_chance, priority weighting — shipped 2026-08-21 via `lore-activation.ts` + `lore.ts` + migration `050_lorebook_activation.ts`; tests green ✅
- [ ] **Prompt library expanded — generation templates** (`FEAT-065` + sub-tickets) — image/audio/video prompt templates with parameter substitution, persistence, and per-provider adapters. Sub-systems: (`FEAT-065-sub-image`), (`FEAT-065-sub-audio`), (`FEAT-065-sub-video`), (`FEAT-065-sub-llm`). Spec: `FEAT-065-template-system.md`. |
- [ ] **Model capability registry** (`FEAT-067`) — per-model metadata (context length, function calling support, vision, pricing) auto-detected + editable. |
- [ ] **Token budget advisor** (`FEAT-068`) — real-time context-window usage meter + warnings when approaching limit, suggest which sections to trim. |
- [ ] **Conversation branching** (`FEAT-045`, `FEAT-046`, `FEAT-047`) — branching data model (tree-structured chat with fork points), branch navigation API, and branch UI controls (fork/resume/compare). Builds on existing chat tree with `parent_id`. |
- [ ] **E2E auth flows** (`TEST-e2e-auth-flows-missing`) — no e2e spec covers login/logout/token expiry |
- [ ] **E2E NSFW moderation** (`TEST-e2e-nsfw-moderation-routes-missing`) — no e2e spec covers nsfw admin routes |
- [ ] **E2E users/personas** (`TEST-e2e-users-personas-routes-missing`) — no e2e spec covers `/api/users/*` or `/api/personas/*` |

## P5 — Wiring, Search & Polish (release-scoped)

- [x] IO (export/import) ✅; Stop generation ✅; Notification center ✅; chat message search ✅; swipe-variant ✅ (implemented + tested); GM role runtime effect ✅ (committed on `dev`)
- [ ] Frontend wiring — all menus/modals/side-menus/documentation linkage; in-chat asset preview + linkage; message actions UI (see P4/P2 tiers); **assistant panel ✅ 2026-08-19** (dedicated sidebar `assistant-toggle`, D1 in `../open-inflight.md`)
- [ ] **Implemented → wired** — LoRA routes ✅ wired (`register-plugins.ts:182`, `49ee5c1a`, 2026-08-18); SSE refactor ✅ (merged `082c20cf`, row W4 resolved in `../open-inflight.md`); remaining RPG services → `epic-rpg-wiring-phase3.md`; ~~dead `detectIntent`~~ ✅ removed (see `../open-inflight.md`)
- [ ] **Conversation analytics dashboard** (`FEAT-059`) — message counts, token usage over time, conversation length histograms, role distribution visualization. |
- [ ] **Model comparison A/B** (`FEAT-060`) — side-by-side comparison of model responses (multishot), quality rating, exportable comparison reports. |
- [ ] **Generation quality metrics** (`FEAT-062`) — per-generation scoring (latency, token efficiency, repetition rate) with trend charts. |
- [ ] **Lore-consistency checker** (`FEAT-066`) — AI-powered consistency validation across character descriptions, world lore, and memory entries. |
- [ ] **Memory access audit log** (`FEAT-075`) — who-pinned-what, decay timeline, source attribution — audit trail for memory operations. |
- [ ] **API versioning** (`FEAT-035`–`FEAT-044`) — version prefix routing, response envelope version, legacy redirect, deprecation headers, OpenAPI generation, schema versioning table, migration reconciliation, content versioning framework, migration testing + docs. (deferred from P6 — API governance epic; wire when API consumers stabilize) |
- [ ] **Unit test coverage** — 8 tickets from reconcile review:
  - `TEST-admin-seeddefaults-silent-duplicate-skip-untested` — seedDefaults idempotency
  - `TEST-characters-charx-roundtrip-untested` — charx extract→create round-trip
  - `TEST-gallery-frontend-utils-untested` — gallery chat-utils unit tests
  - `TEST-gallery-upload-dropzone-untested` — initDropZone + file validation
  - `TEST-npc-navigation-processMovementTick-untested` — NPC nav service
  - `TEST-nsfw-getflagqueue-status-filter-untested` — NSFW flag queue filter
  - `TEST-profanity-containsprofanity-edge-cases-untested` — profanity edge cases
  - `WIRE-extras-impersonateactorid-schema-validation` — verify ChatImpersonateBody schema |
