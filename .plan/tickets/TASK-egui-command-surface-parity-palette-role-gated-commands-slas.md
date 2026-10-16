<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui command surface parity: palette, role-gated commands, slash dispatch

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend

**Summary:**

Bring the egui client's command surface to htmx/Alpine parity.

Today (htmx): the composer toolbar renders 18 command buttons (12 all-user +
6 GM-gated) in src/frontend/alpine/command-buttons.ts; `guide`/`scene` open the
GM Guidance panel, `impersonate`/`char` call chat.impersonate(), every other
command inserts `/<cmd>` into #message-input and focuses it. Slash parsing and
the `/` command palette live in src/frontend/alpine/chat-slash.ts and
src/frontend/alpine/chat-actions/command-palette.ts; role filtering reads
$store.ui.userRole.

egui target: a command palette overlay (fuzzy filter, arrow/Enter/Tab/Escape),
the same role gating driven by the JSON view-model's userRole, and the same
three invocation outcomes routed through the JSON client (GM-guidance panel
state, impersonate call, composer insert + POST). Reference implementations:
egui_demo_lib widget/modal demos (https://docs.rs/egui_demo_lib/latest/egui_demo_lib/)
and the egui examples index (https://github.com/emilk/egui/tree/master/examples).

**Context:**

Parity target #4 of the egui roadmap in `epic-experimental-egui-frontend.md`
(2026-10-16). The htmx toolbar and the Alpine palette are two clients over one
server-side command list; the egui client must be a third, not a fourth list.
Constraint from the decision update: the command list and its role gate arrive
as JSON (a view-model field), never as scraped fragments. Alternative considered
— hard-coding the command list in Rust — is rejected: it drifts the moment a
command is added server-side, and the contract test below exists to catch
exactly that.

**Acceptance Criteria:**

- [ ] Palette opens on `/`, filters the same command list the htmx toolbar
      shows, and honours the GM-only set via the view-model role
- [ ] Each command reproduces the htmx outcome: panel open, impersonate, or
      composer insert + send through the same POST /api/chats/:chatId/messages
      path
- [ ] Keyboard flow (arrow/Enter/Tab/Escape) matches the Alpine palette
- [ ] Contract test pins the command list (names + role gate) against the
      view-model so a server-side rename fails the egui client
- [ ] Tests passing; parity notes added to the epic roadmap row
