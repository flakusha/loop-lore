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
| 11 | User + admin panels, settings, fine-tuning              | 🟡 partial             | admin user mgmt ✅; fine-tuning UI + provider health ✅ (B10, 2026-08-20)                                                                                |
| 12 | (Side panels) without leaving chat                      | 🟡 partial             | chat-settings modal ✅; **in-chat asset preview + linkage ✅** (`FEAT-in-chat-asset-preview-linkage-side-panel`, issue `fef7e3b` closed 2026-08-19) — gallery-sidebar + media-preview-modal + `pendingAssets`→message attachments |
| 13 | Chat settings menus — templates, tuning                 | 🟡 partial             | setup-template selector ✅; prompt-template registry `src/prompts/registry.ts` ✅ (2026-08-12); detailed tuning frontend open                |
| 14 | Character/world/location flows                          | ✅ complete           | char import (PNG/YAML/TOML/JSON/CHARX) ✅; char export (PNG/JSON/YAML/TOML) ✅; world import bundle ✅; world export (`worlds/:id/export`) ✅; location creation inline in `world-detail.html` ✅; location export bundled in world export ✅ (code-verified 2026-08-20) |
| 15 | LLM support (chat/captioning/intent/embeddings)         | 🟢 chat/caption/intent | providers ✅ (openai-compat + Anthropic + Ollama native 2026-08-17); `classifyIntent` wired; embeddings greenfield                                                                                 |
| 16 | Assistant creative tooling                              | 🟡 partial             | command buttons + parser ✅; **tool-call UI ✅ (2026-08-12)**; creation wizards + tiered `/commands` ✅ (C3, 2026-08-18)                                                     |
| 17 | Frontend fully wired                                    | 🟡 ongoing             | menus/modals/side-menus/docs — docs reconciliation **merged 2026-08-14** (`docs-reconcile`); md links ✅ fixed 2026-08-14 (`md:links` green)                            |
| 18 | **Command palette FE not wired to BE** (WIRE)           | ✅ Done                | `WIRE-assistant-command-palette-stale-static-list.md` — verified in-ticket (registry endpoint + palette hydration); index backfilled |
| 19 | **Creation wizard cross-talk** (BUG)                    | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-characters-creation-wizard-wizardid-unused.md` — `confirmWizard` ignores `wizardId`. Effort: Small |
| 20 | **Chat batch export N+1** (BUG)                         | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-chat-batch-export-n-plus-one.md` — sequential per-message queries. Effort: Small |
| 21 | **Mention error silent swallow** (BUG)                  | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-chat-mention-silent-error-swall.md` — persist/notify failures swallowed. Effort: Small |
| 22 | **Quiet hours boundary off-by-one** (BUG)               | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-chat-quiet-hours-boundary.md` — proactive timing edge case. Effort: Trivial |
| 23 | **Gallery onclick ReferenceError** (BUG)                | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-gallery-openAssetPreview-context-safety.md` — context safety when not top-level. Effort: Small |
| 24 | **Gallery uploads sequential** (PERF)                   | 🟡 new                 | `PERF-gallery-uploadChatAssets-sequential.md` — parallelize uploads. Effort: Small |
| —  | IO: import/export (characters/worlds/locations/stories) | ✅ shipped             | char import (PNG/YAML/TOML/JSON/CHARX) ✅; char export (PNG/JSON/YAML/TOML) ✅; world import bundle ✅; world/loc/story export ✅; bulk ZIP export ✅ (code-verified 2026-08-20) |
| —  | Stop generation (chat/VN)                               | 🟢 shipped             | chat abort/cancel + VN in-scene stop overlay (2026-08-06)                                                                                   |
| —  | Notifications + center                                  | 🟢 shipped             | SSE + unread badge + center UI + per-type mute (2026-08-06)                                                                                 |
| —  | Filtering & search                                      | 🟡 partial             | chat room filters + message search ✅; world/location search pending                                                                        |
| —  | Memory injection (high priority)                        | 🟢 per-viewer ✅       | `memorySection` 1024-token budget (2026-08-01); cross-actor test shipped                                                                    |
| —  | Template injection (high priority)                      | 🟢 shipped             | `LLM_PROMPT_DEFAULTS` + `resolveSystemPrompt`; registry impl `src/prompts/registry.ts` ✅ (2026-08-12); UX pending (P4)                     |

### Chat Variants Taxonomy cluster (filed 2026-09-11)

> Taxonomy-only epic — no schema migration. Twelve canonical chat variants map onto the existing `(chat_type, chat_mode, chat_purpose)` triple plus the auxiliary `max_turns`, `auto_advance`, `gm_config`, `talkativity`, `prompt_override` columns. Authority for "chat admin" = global admin OR creator OR owning gm.
> Spec: `../epics/epic-chat-variants-taxonomy.md`. Status: 🟡 Design — taxonomy agreed; column mapping established; per-variant implementation open.

| Variant | Tickets | chat_type | chat_mode | chat_purpose | Where / next |
| --- | --- | --- | --- | --- | --- |
| 1. assistant chat | `TASK-chat-variant-assistant.md` | `direct` | `story` | `assistant` | User ↔ assistant; one user, one assistant; entry-point = Assistant tab |
| 2. assistant group chat | `TASK-chat-variant-assistant-group.md` | `group` | `story` | `assistant` | Multi-user collaborative prompt; `talkativity = 4` |
| 3. user chat (1×1) | `TASK-chat-variant-user-1x1.md` | `direct` | `story` | `social` | Encrypted, two-user |
| 4. user group chat | `TASK-chat-variant-user-group.md` | `group` | `story` | `social` | Classical encrypted group, public + private variants |
| 5. user group + admin/mod | `TASK-chat-variant-user-group-admin.md` | `group` | `story` | `social` | Social group with admin/mod scope; `gm_config.moderation` block |
| 6. llm-only chat | `TASK-chat-variant-llm-only.md` | `direct` | `battle` | `validation` | No humans; LLM ↔ LLM validation harness; `auto_advance = 1` |
| 7. llm-only group chat | `TASK-chat-variant-llm-only-group.md` | `group` | `battle` | `validation` | Multi-LLM sandboxes, tracking, prompt fuzzing |
| 8. llm-only group + gm | `TASK-chat-variant-llm-only-group-gm.md` | `group` | `story` | `guided` | GM-driven narrative; gm is an LLM (or LLM+user) |
| 9. chat with character | `TASK-chat-variant-character.md` | `direct` | `story` | `roleplay` | User + one LLM character; entry-point = Characters tab |
| 10. group chat (multi-character) | `TASK-chat-variant-character-group.md` | `group` | `story` | `roleplay` | Multi-user + multi-character; `gm_config.cast` block |
| 11. rpg chat | `TASK-chat-variant-rpg.md` | `direct` | `story` | `rpg` | Attached to a world, in a location, rules enforced |
| 12. rpg group chat | `TASK-chat-variant-rpg-group.md` | `group` | `battle` | `rpg` | Multi-user party, turn rules, world+location binding |

**Cross-cutting** (Medium — opened if/when needed): frontend variant picker (entry-point branches); create-chat payload validator per variant (guard at `routes/chats/create`); migration of legacy chats into the taxonomy.

### Chat Product Features cluster (filed 2026-09-11)

> Cross-cutting product feature coverage for the chat surface. 15 tickets span rich-message controls, encryption reliability, GM annotations, context/memory/event propagation, turn/talkativity, moderation, ownership transfer, location transition with party handoff, archive + search filtering, intro-based entity generation, pre-send buffer, RPG rules, settings templates + compat matrix, RPG location uniqueness, RPG chronological/tree nav. Items 14 & 15 (RPG-gated) require `epic-rpg-wiring-phase3` and `TASK-rpg-gate-chat-commands-behind-world-opt-in`.
> Spec: `../epics/epic-chat-product-features.md`. Status: 🟡 Not Started.

#### P0-P2 visibility (app-critical — promoted to `priority-p0-p2.md`)

- [ ] `TASK-chat-feature-encryption-key-rotation.md` (High / High) — effective & reliable encryption + membership-triggered deterministic key rotation; idempotent across concurrent events; in-flight sends must observe post-rotation key. **Joined `priority-p0-p2.md` P0 row 2026-09-11**.
- [ ] `TASK-chat-feature-ownership-transfer.md` (High / Medium) — owner can hand chat to another participant; mod/GM grants re-evaluated; audit handover; `confirm: true` on backend. **Joined `priority-p0-p2.md` P0 row 2026-09-11**.

#### P3-P5 remainder

| # | Cluster | Tickets | Effort | Where / next |
|---|---------|---------|--------|--------------|
| 1 | Component & Message UX | `TASK-chat-feature-component-buttons.md` | Medium | message actions + asset picker host (`src/components/chat/`, `src/group-chat/mention-parser.ts`) |
| 2 | Crypto Reliability (extra) | (rotation covered above) | — | `src/crypto/key-rotation/re-encrypt.ts` rollback path; `src/middleware/idempotency.ts` overlap-debounce |
| 3 | GM Annotations | `TASK-chat-feature-notes-shadow-carriage.md` | Low | `src/chat/proactive/{types,db-helpers}.ts`, `src/chat/service/{carry-history,party-narration}.ts` |
| 4 | Context / Memory / Event Propagation | `TASK-chat-feature-context-memory-events.md` | Medium | `src/chat/{context-window,context-stats,random-events}.ts`, `src/memory/injection/*`, `src/rag/search/orchestrator.ts` |
| 5 | Turn & Talkativity | `TASK-chat-feature-turn-talkativity-skip.md` | Medium | `src/turning/turn-manager/{selection,participants}.ts`, `src/turning/turn-strategies.ts` |
| 6 | Moderation | `TASK-chat-feature-moderation.md` | High | `src/chat/moderation.ts`, `src/middleware/nsfw-gate/{access,consent,logging}.ts`, `src/profanity/service.ts` |
| 7 | Ownership Transfer (extra) | (transfer covered above) | — | `src/chat/ownership.ts`, `src/chat/service/{chats,write}.ts` |
| 8 | Location Transition & Party Handoff | `TASK-chat-feature-location-transition-transfer.md` | Medium | `src/chat/transitions.ts`, `src/chat/service/{transitions,carry-location,party,party-narration,location-events}.ts` |
| 9 | Archive / Deletion / Search Filtering | `TASK-chat-feature-archive-deletion-search.md` | Low | `src/chat/service/visibility.ts`, `src/chat/service/crud/`, `src/rag/search/quarantine.ts` |
| 10 | Intro-Based Generation & Backpropagation | `TASK-chat-feature-introduction-generation-propagation.md` | High | `src/generation/auto-gen/{classify-intent,resolve-known-names}.ts`, `src/chat/hallucination-guard/detect.ts`, `src/memory/extraction.ts` |
| 11 | Entry Field Pre-Send Buffer | `TASK-chat-feature-entry-field-pre-send.md` | Low | `src/components/chat/`, `src/group-chat/mention-parser.ts`, `src/turning/turn-manager/state.ts` |
| 12 | RPG Rule System | `TASK-chat-feature-rpg-rule-system.md` | Low | `src/chat/service/party-narration.ts`, `src/generation/prompt-templates/{profiles,templates}.ts` |
| 13 | Settings Templates & Compat Matrix | `TASK-chat-feature-settings-templates-compat-matrix.md` | Medium | `src/chat/{setup-templates.test.ts,service/templates.ts,service/template-crud.ts,service/template-defaults.ts,service/vn-choices.ts,types/config.ts}` |
| 14 | RPG Location Uniqueness *(RPG-mode gated)* | `TASK-chat-feature-rpg-location-uniqueness.md` | Low | gated by `TASK-rpg-gate-chat-commands-behind-world-opt-in`; `src/chat/npc-movement/index.ts`, `src/chat/service/party.ts` |
| 15 | RPG Chronological / Tree Navigation *(RPG-mode gated)* | `TASK-chat-feature-rpg-chronological-navigation.md` | Low | gated by `epic-rpg-wiring-phase3`; `src/chat/service/{split,split-utils}.ts`, `src/chat/service/carry-history.ts`, `src/chat/transitions.ts` |

> Triage status (2026-09-11): all 15 tickets filed with realistic `src/` paths + acceptance criteria + open questions. **Triage pending** — see `open-untriaged.md`.

## P4 — Core Experience (open remainder of P3 rows)

- [x] Memory + template injection UX — memory selection / pin UI ✅ shipped (verified 2026-08-16); per-chat prompt override ✅ shipped 2026-08-16 (`prompt_override`, migration 044)
- [x] Character/world/location flows — multi-format import, creation + settings menus ✅ (code-verified 2026-08-20; C4 closed in open-inflight.md)
- [x] Assistant tooling — creation wizards + `/commands` tiered access ✅ (C3, 2026-08-18); tool-call display ✅ 2026-08-12 (P3 #16 / P2-C)
- [x] LLM providers — Anthropic + Ollama native ✅ 2026-08-17 (`chat-matrix-ui-remainder`); ~Bedrock deferred (SigV4 scope)~ (P3 #15)
- [x] Assets — signed URLs (compression flow ✅ 2026-08-12) (P3 #10) — ✅ DONE (C6, `6b4e1ab4`)
- [x] Fine-tuning experience — provider health panel + fine-tuning UI ✅ (B10, 2026-08-20) (P3 #11)
- [x] NSFW — character 5-tier rating runtime enforcement ✅ (code-verified 2026-08-20; C2 closed in open-inflight.md)
- [ ] Chat UI — group chat matrix UI, unified GM↔assistant view (GM panels ✅ + quest log ✅ 2026-08-12; participant panel ✅ 2026-08-14; **turn-order indicator + side-channels ✅ 2026-08-16**; unified GM↔assistant view ✅ (E1, 2026-08-20); remainder = C7 Phases 3–4 + G2 branching UI) (P2-B/P2-D)
- [x] **Lorebook activation conditions** (`FEAT-055`) — regex keys, AND/OR key_groups, scan_depth, activation_chance, priority weighting — shipped 2026-08-21 via `lore-activation.ts` + `lore.ts` + migration `050_lorebook_activation.ts`; tests green ✅
- [ ] **Prompt library expanded — generation templates** (`FEAT-065` + sub-tickets) — image/audio/video prompt templates with parameter substitution, persistence, and per-provider adapters. Sub-systems: (`FEAT-065-sub-image`), (`FEAT-065-sub-audio`), (`FEAT-065-sub-video`), (`FEAT-065-sub-llm`). Spec: `FEAT-065-template-system.md`. |
- [ ] **Model capability registry** (`FEAT-067`) — per-model metadata (context length, function calling support, vision, pricing) auto-detected + editable. |
- [ ] **Resource Provision** — external compute/inference provisioning, encrypted credential supply (`src/crypto/byok.ts`), browser backup opt-in with SHA-256 hashing, per-resource quota enforcement, hash-based reconciliation/recovery. 12 tasks. Spec: `epic-resource-provision.md`.
- [ ] **Assistant Entity Access & Manipulation** — assistant access to RAG documents, assets, worlds, locations, characters, items, inventory; addition, modification, duplication, adaptation. 12 tasks. Spec: `epic-assistant-entity-access.md`. | proposal
- [x] **Token budget advisor** (`FEAT-068`) — ✅ done (real-time context-window usage meter + trim suggestions). |
- [ ] **Conversation branching** (`FEAT-045`, `FEAT-046`, `FEAT-047`) — branching data model (tree-structured chat with fork points), branch navigation API, and branch UI controls (fork/resume/compare). Builds on existing chat tree with `parent_id`. |
- [ ] **Emotion-avatar pipeline completion** — binding render path (persist→read→per-message resolve), regeneration control (subset/slot re-roll + durable jobs), context transforms + in-browser cropper — design: `matrix-emotion-avatar-assets.md` AV1–AV3, `epic-emotion-avatar-message-binding.md` +2 | proposal (docs on `plan-emotion-avatar-epics`)
- [x] **VN mode settings exposure/access** (`open-vn-settings-bugs.md`) — 7 interlocking bugs: visualNovel type mismatch (API Boolean vs DB Number), mode locked once chat has messages (in `KEY_MECHANIC_PARAMS`), redundant state (chats.visual_novel + gm_config.visualNovel), settings save blocks gmConfig for online chats, no Master/GM role restriction on settings change, 5 missing VN fields (imageScaling, autoAdvanceDelay, etc.), umbrella task `66c4c3d`. Umbrella ticket: `TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings` (HIGH) — ✅ Resolved 2026-09-05 (`1b9b0cdf`, `5266f2cb`, `e14d3aaa`, `a16490a7`; cluster file updated) |
- [ ] **Avatar alpha + VN sprite layering** — provider transparency capability, async matting fallback, `has_alpha` render branch, VN compositor layer — `epic-avatar-alpha-vn-layering.md` | proposal
- [ ] **Wardrobe/loadout avatar variants** — outfit axis × emotion, context-bound selection ladder, outfit-scoped regen — extends `TASK-character-multi-avatar`; `epic-wardrobe-avatar-variants.md` | proposal → ticket-backed (see `tickets/TASK-wardrobe-schema-wardrobe-items-actor-wardrobe-avatar-outfit-.md`, `TASK-wardrobe-selection-algorithm-v2-outfit-emotion-resolution-la.md`, `TASK-wardrobe-outfit-scoped-avatar-generation-batch-single.md`, `TASK-wardrobe-routes-validation-crud-outfit-override-endpoints.md`, `TASK-wardrobe-frontend-manager-on-character-sheet-outfit-switcher.md`, `TASK-wardrobe-story-gm-integration-outfit-change-events.md`, `TASK-wardrobe-tests-fallback-ladder-override-precedence-outfit-sc.md`, `TASK-wardrobe-deferred-equipped-items-outfit-auto-mapping-flag-ga.md`); config-schema `loadouts[]`/`outfits[]` shipped on `CharacterTemplate` + `configs/templates/character.example.{yaml,toml}` + `avatar.example.{yaml,toml}`
- [ ] **Asset platform capabilities B1–B5** — BLAKE3 dedup + renditions + EXIF strip; optimistic upload/albums/shared-media; GC + soft-delete + storage budget; caption/alt/pHash/backlinks (RAG feed); deterministic ops (assistant feed) — `epic-asset-platform-capabilities.md`; suggested order B1→B3→B2→B4→B5 | proposal
- [ ] **2FA channel provisioning** — verified-factor login/unlock across messenger (Matrix + bridges), e-mail, OIDC; factor state machine, unlock ladder, anti-takeover cooling-off — design: `epic-auth-channel-provisioning.md` F1–F10 + `matrix-authentication-channels.md` AC1–AC12; reopens the 2026-08-05 MFA deferral for planning | proposal (docs on `plan-2fa-channel-integrations`); security-relevant — human triage may promote above P4
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
- [ ] **Build integrity cluster** (`open-build-integrity.md`) — 3 untracked tsc errors (unused import in `routes/commands/index.ts`, undefined `chatSectionsRoutes` in `register-plugins.ts`, missing `CompleteGenerationOpts` in `post-store.test.ts`) + `plan:sync --fix` orphan-issue bug. Typecheck green on dev — verify the tsc trio + `plan:sync` orphan fix landed, then close. Still gating the tag.
