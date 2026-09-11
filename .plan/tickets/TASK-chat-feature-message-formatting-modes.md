<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message Formatting Modes — Markdown, Plain, Roleplay Asterisk

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, feature, markdown, rendering, formatting, roleplay
**Epic:** epic-chat-product-features

## Summary

Per-chat **formatting mode** governing how message bodies render: (a) `markdown` — sanitized markdown subset (emphasis, lists, code blocks, links); (b) `plain` — no markup interpretation, verbatim text; (c) `roleplay` — prose-first formatting where `*action*` / `*narration*` spans render as italics and dialogue stays plain, the convention used across RP platforms (SillyTavern precedent; the existing `src/regex/narrative.ts` asterisk parsing is the extraction-side counterpart). Today rendering is implicit and inconsistent: system messages are italic-only, markdown support is undeclared, and the asterisk path has a known greedy-regex perf bug (`TASK-regex-safety-xml-utils-tag-unescaped-narrative-greedy`).

## Acceptance Criteria

- [ ] `formatting_mode ∈ {markdown, plain, roleplay}` is a per-chat setting with per-variant defaults (assistant → markdown; user/social → plain; character/RP → roleplay)
- [ ] Markdown mode renders a sanitized subset only; raw HTML never executes (sanitizer precedent: `TASK-frontend-sanitize-fallbacks-inject-raw-html-when-lib-missing`)
- [ ] Roleplay mode converts `*...*` to italics in display only — the stored message text is never mutated; asterisk spans inside code blocks or URLs are left alone
- [ ] Plain mode renders the body verbatim with no markup interpretation of any kind
- [ ] Renderer operates on display only; extraction/regex pipeline and export paths consume the raw stored text
- [ ] Formatting mode participates in the chat settings compatibility matrix (`TASK-chat-feature-settings-templates-compat-matrix`)
- [ ] The greedy-asterisk superlinear path is fixed (lazy match) as part of this ticket or its dependency

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `TASK-regex-safety-xml-utils-tag-unescaped-narrative-greedy` — asterisk regex perf fix
- `TASK-text-effects-overlays` — CSS effects compose on top of the rendered body
- `TASK-visual-novel-mode` — VN rendering consumes the same mode-resolved body
- `TASK-chat-feature-settings-templates-compat-matrix` — mode as matrix axis
- `TASK-chat-feature-system-format-contract` — generation side of the same contract

## Files

- `src/components/chat/` — mode-aware message renderer
- `src/regex/` — narrative/asterisk span extraction
- `src/chat/types/config.ts` — mode field

## Research Inputs

- SillyTavern regex display-scripts: display-side transformation, stored text untouched (deepwiki kwaroran/RisuAI + SillyTavern, 2026-09-11)

## Open Questions

- Should roleplay mode also support quoted-dialogue highlighting?
- Per-message format override (e.g. assistant sends a code block in roleplay chat) — auto-detect or explicit?
