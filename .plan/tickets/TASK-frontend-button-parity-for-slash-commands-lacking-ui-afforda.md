<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Frontend-button parity for slash commands lacking UI affordances

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Frontend-button parity for slash commands lacking UI affordances.

PARITY BAR
A command has frontend parity only when a user-facing button/menu affordance performs the same action as the command. The command palette and toolbar buttons that merely pre-fill `/cmd ` into the message input (src/frontend/alpine/command-buttons.ts:106-111) are typing aids, NOT parity. Handlers in src/frontend/alpine/chat-actions/dispatch.ts are server→FE action sinks; they count only when a user-facing control initiates the flow.

WEB GAPS (ordered by value; file:line = command registration/semantics)

Group 0 — Entity copy/adapt (handlers already exist, only initiating buttons missing)

- /clone src/assistant/commands/clone.ts:24
- /duplicate src/assistant/commands/duplicate.ts:47
- /adapt src/assistant/commands/adapt.ts:219
  The confirm handlers exist (src/frontend/alpine/chat-actions/entity-copy.ts:28,57) but are only server→FE sinks for the commands' own responses — no markup invokes them. Add per-entity Duplicate/Adapt buttons that drive the existing handlers.

Group 1 — GM / generation authoring

- /create src/assistant/commands/create.ts:250 (toolbar pre-fill only)
- /modify src/assistant/commands/modify.ts:298 (no UI)
- /review src/assistant/commands/review.ts:26 (pre-fill only)
- /narrate src/assistant/commands/narrate.ts:10 (pre-fill only)

Group 2 — RPG table

- /roll src/assistant/commands/dice.ts:162, /dice dice.ts:171 (pre-fill only)
- /stats src/assistant/commands/stats.ts:22 (pre-fill only)
- /detail src/assistant/commands/detail.ts:10 (pre-fill only)
- /context src/assistant/commands/context.ts:10 (pre-fill only)

Group 3 — RAG / knowledge

- /rag-search src/assistant/commands/rag.ts:68
- /rag-ask src/assistant/commands/rag.ts:106
- /rag-preview src/assistant/commands/rag-preview.ts:79
- /rag-decompose src/assistant/commands/rag-decompose.ts:117
  No UI at all; the memory panel is a different subsystem.

Group 4 — Harness / workflow

- /workflow src/assistant/commands/workflow.ts:219 (admin-workflows is the ComfyUI library, not chat workflow runs)
- /orchestrate, /workflowz, /omp src/assistant/commands/harness-verbs.ts:152 (no UI)

Group 5 — Agency

- /agency src/assistant/commands/agency.ts:41 — story-points chip (src/components/chat/story-points-chip.html) is read-only; earn/spend/cap have no UI.

Group 6 — Import & misc

- /import src/assistant/commands/import.ts:66 — the settings.html:425 "Import Chats" button has NO click handler (quick win: wire it).
- /add src/assistant/commands/import.ts:157 (no UI)
- /ooc src/assistant/commands/ooc.ts:10 — inject-ooc action has no FE handler
- /help src/assistant/commands/help.ts:6 (low value — palette already aids discovery)
- /debug src/assistant/commands/debug.ts:11 — toggleDebugView() exists (src/frontend/alpine/chat-settings.ts:72) but no markup invokes it
- /image image.ts:47, /music music.ts:15, /video video.ts:12, /sfx + /sound sfx.ts:36,41 — toolbar pre-fill only; music/video/sfx are available:false stubs (lowest value)

EGUI (umbrella)
The egui/WASM frontend (native/loop-lore-egui) has ZERO chat-action buttons: app.rs:573,630,652,764,956 (Upload/Attach/Load more/Back to htmx/Send) are the only five. Every registered command is therefore an egui gap. Recommended slice: mirror web Groups 0–2 first. Note: /split and /reunite egui parity is separately tracked (see exclusions).

EXCLUSIONS

- /split and /reunite — already covered by tickets 4e332d2 (web) and 1f54432 (egui).
- ~20 commands already at web parity (verified): battle suite (/attack /heal /battle — frontend/battle/), GM guidance suite (/guide /scene /constraint /target /priority /skip — command-buttons.ts:82 + _gm-guidance-body.html), entity/item/location/world CRUD + access, assets/gallery, /link, /regen, /caption, /summarize, /translate, /improve, /analyze, /impersonate, /quest.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
