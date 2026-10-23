<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: tui-egui-fixes hold landing: page-1-only client, gallery has_more regression, TUI stale-chat race, unawaited stamp write

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-tooling-improvement
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Branch tui-egui-fixes (8 commits, 52 files, +2768/-363) is commit-factored and its build/CI plumbing is verified green, but 4 BLOCKING findings sit in its core subject matter. Hold landing; fix in-branch in order B4, B2, B3, B1.

B1 BLOCKING: egui client reads only page 1 (oldest 50) of every chat. native/loop-lore-egui/src/app.rs:222-233 fetch_messages uses api::messages_url(chat_id, 1); api.rs:71-77,217-231 parse_messages_page reads only data, never pagination. Server orders oldest-first (read.coverage.test.ts:157-159 newest on LAST page); branch fixed this on the TUI (src/tui/chat/api.ts:147-175 + api-contract test) but left the egui twin broken. Contradicts commit 63a5d8667. Fix: parse pagination.totalPages, re-request last page like the TUI; add vector/contract test. Fixture api.rs:540 encodes phantom top-level total:2 the server never sends (jsonPaginated nests under pagination, responses.ts:85). Acceptance: >50-message chat opens on newest page; contract test pins it.

B2 BLOCKING: gallery has_more permanently false under filters, built on false premise. gallery.rs:123-126 comment claims /dynamic/gallery/search ignores page and hard-caps at GRID_PAGE_SIZE; server honors page on BOTH endpoints via offset (views/search.ts:35,58 and views/gallery.ts:157-164; fa6ec9970 is ancestor). Pre-branch Load more fetched new pages; change removes the capability; CHANGELOG line 69 misstates transient behavior the code does not implement. Fix: restore has_more for filtered pages; correct comment + CHANGELOG; if duplicates were the symptom, dedupe on append by asset id. Acceptance: filtered gallery pages advance; wording corrected.

B3 BLOCKING: TUI loadMessages has no stale-chat guard; branch widened the window. src/tui/chat/api.ts:153-178 reads host.chatId once then two sequential awaits (:157,:169) before host.setMessages (:165,175). Chat switch mid-load (setChatId clears list, chat/index.ts:257-262) repopulates with the previous chat's rows. Pre-existing single-request shape doubled by this branch; egui twin fixed via chat-scoped FetchEvents. Fix: capture requested chat id and re-check host.chatId after each await (or generation counter). Acceptance: rapid chat-switch test shows no cross-chat rows.

B4 BLOCKING: writeEguiStamp fire-and-forget. src/build/egui-artifact.ts:159 Bun.write not awaited, no .catch: (a) process can exit before write lands so next readEguiArtifactState reports no stamp and build:verify exits 1 misleadingly; (b) unhandled rejection on failure. Test :113-117 passes only by racing. Fix: make writeEguiStamp async, await Bun.write; await at scripts/build-egui-wasm.ts:315 and in tests. Acceptance: stamp present when build:egui returns; no unhandled rejection.

Evidence: egui.md; cargo check/test/fmt/clippy green (63 rust tests); scoped bun suites 198 pass.

UNVERIFIED note V2: chats/list.ts:93-114 visibleToViewer mirrors views/chats.ts:30-38 but drops the admin bypass (:27); doc claims parity. Pre-existing. Settles by deciding whether admin htmx/JSON list parity is a real contract; if yes, add bypass + test, else fix the doc comment. Also wasm32 compile UNVERIFIED on this host (no rustup/wasm32 std; check-wasm.ts skip path by design).

Landing recommendation: hold, fix B4, B2, B3, B1 in-branch, re-run scoped suites, then land whole.

Caveats: client/server contract parity; stale-state races on chat switch; partial failure in stamp write must surface, not mislead verify; no auth change.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
