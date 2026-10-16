<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui emoji shortcode support: registry parity, autocomplete, bubble render

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend

**Summary:**

Port the `:shortcode:` emoji pipeline into the egui client at parity with
htmx/Alpine.

Today (htmx): one registry is the single source of truth —
src/frontend/alpine/chat-utils/emoji.ts (EMOJI_SHORTCODES). renderShortcodes
(emoji.ts:64-75) rewrites :name: tokens with regex :([a-z0-9_+-]+):/g, exempts
code spans, and guards with Object.hasOwn. The autocomplete slice
(src/frontend/alpine/emoji-autocomplete.ts) matches a trailing :query token and
offers arrow/Enter/Tab/Escape insertion; the picker
(src/frontend/alpine/emoji-picker.ts) shares the registry. Chat bubbles render
through renderShortcodes at src/frontend/alpine/chat-utils/render.ts:25. The
server keeps a no-JS fallback: src/routes/shortcode-emoji.ts re-exports the same
registry and is used by src/routes/views/chat-render.ts:125 (chat list preview)
and src/routes/chat-export/format.ts:7 (export).

egui target: load the SAME registry over JSON (one endpoint, one payload),
render :name: in message text with an emoji-capable font, autocomplete popup
over the composer, and identical token/code-span rules. Shared conformance:
parity test vectors check [Registry parity, Token regex, Code-span exemption,
Export fallback].

**Context:**

Parity target #3 of the egui roadmap in `epic-experimental-egui-frontend.md`
(2026-10-16). The htmx client already keeps exactly one registry
(`src/frontend/alpine/chat-utils/emoji.ts`) with the server re-exporting it for
the no-JS path (`src/routes/shortcode-emoji.ts`), so the emoji set is already a
server-owned asset. The egui client must consume that same asset — a Rust copy
of the map would be the one place a fork can start. Alternative considered:
browser-side rendering only (draw the shortcode text and let the host page
substitute) — rejected, the egui canvas owns its own text layout, so
substitution has to happen inside the Rust renderer against the server
registry.

**Acceptance Criteria:**

- [ ] The egui client renders the same output as the htmx client for a vector
      set of messages (plain text, `:name:` tokens, adjacent tokens, malformed
      colons, code-span-exempt text)
- [ ] Autocomplete in egui matches the Alpine candidate set and ordering for
      the same prefix, with the same insert behaviour
- [ ] The registry is fetched as JSON from the server (no second Rust copy), so
      an added shortcode lands in htmx and egui on the same deploy
- [ ] Conformance vectors live in ONE shared place and both clients run them
- [ ] Tests passing (Rust unit test over the vectors + the existing htmx suites
      stay green)
