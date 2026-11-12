<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: style picker UI for smart-regen

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/components/chat/message-list.html

**What**: Hamburger/context menu only offers plain Regenerate — add dropdown/submenu.

**Fix**: Add a style dropdown/submenu that exposes VALID_REGEN_STYLES for smart-regen.

**Source**: FEAT-014 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated — the picker remains self-describing in-UI with vocabulary parity pinned by the component test (original scope), and the TUI surface is now documented in docs/spec/terminal-ui.md ("Regenerate with style" bullet: completion-strip usage hint + typed `/regen <action>` / `/rewrite --style`, overlay picker deliberately not ported).

## Implementation note (scripting-lite lane, 2026-11-12)

Component: `src/frontend/alpine/chat-style-picker.ts` (merged into the chatState registry via `chat/bootstrap.ts`, lifecycle reset added). State slice typed in `src/frontend/alpine/chat-types/style-picker-state.ts`; `ChatCoreGenerationState.regenerateVariant` now types the optional `style` param the implementation already forwarded.

Vocabulary (mirrors the backend, pinned by `chat-style-picker.test.ts`):
- `REGEN_STYLES` = the `src/generation/smart-regen.ts` `VALID_REGEN_STYLES` keys (shorter/longer/funnier/darker/formal/casual) → `regenerateVariant(messageId, style)` → POST `/api/v1/generation/regenerate` with the style hint (the existing BE seam).
- `REWRITE_STYLES` = the `/rewrite` valve default + `rewriteText` local-heuristic styles (clear/concise/dramatic/formal) → stages `/rewrite --style <style>` in the composer via `$refs.messageInput`, the same select-flow as the command palette (the command targets the last assistant message on send).

htmx surface (`src/components/chat/message-list.html`): a `▾` caret next to the Detailed-mode ♻ button, a "Regenerate with style…" item in the compact hamburger and the right-click context menu (all `data-testid`-tagged), plus the fixed-position `data-testid="style-picker"` dropdown with Regenerate and Rewrite sections. Positioning anchors on the opener's rect and falls back to the message bubble when the opener already left the layout (closing menu items). Focus returns to the opener on close (the reaction-picker a11y pattern). No CSS-in-JS — one `.style-picker` block in `src/public/css/app.css` reusing the dropdown-base tokens.

i18n: 13 new `chats.*` keys (regenWithStyle, stylePickerTitle, regenStyleHeading, rewriteStyleHeading, styleShorter/Longer/Funnier/Darker/Formal/Casual/Clear/Concise/Dramatic) added to ALL 10 locale files (en ar de es fr ja ko pt ru zh); the component test asserts every label key resolves in every locale file.

Tests: `src/frontend/alpine/chat-style-picker.test.ts` — vocabulary parity with the BE catalog, all-locale label-key coverage, opener/bubble positioning + clamping, focus-preserving close, style→regenerate wiring, composer staging.

Not done here (kept out of scope): `/rewrite --apply` is not surfaced (text-command only, as today). Wave-4 (scripting-lite lane) closed the other two gaps: the TUI now exposes regenerate-with-style through the completion strip's usage hint plus typed `/regen <action>` / `/rewrite --style` (see docs/spec/terminal-ui.md), and the backend `GET /api/commands` descriptor advertises valve vocabularies (typed `valves` summary per command).
