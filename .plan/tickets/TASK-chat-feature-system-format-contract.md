<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: System Format Contract — Validity of Format Requests in Prompts

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Ticket
**Tags:** chat, feature, format-contract, prompts, validation
**Epic:** epic-chat-product-features

## Summary

Make output-format requests a **declared, validated contract** instead of scattered prompt strings. A chat declares the format(s) its generation must produce (message body per `formatting_mode`, carriage TOML per `epic-hidden-carriage-context`, extraction tags per the regex pipeline); prompt assembly injects exactly the declared format instructions; and LLM output is validated against the declaration before it reaches storage or rendering — invalid or conflicting format requests are rejected at assembly time, and off-format output is healed or normalized, never silently rendered wrong.

## Acceptance Criteria

- [ ] Format declaration is a single per-chat structure consumed by prompt assembly, validation, and the frontend renderer — no second hand-written copy of format instructions
- [ ] Conflicting format requests (e.g. persona/prompt_override demanding markdown in a `plain`-mode chat) are detected at assembly and resolved by declared precedence (chat mode > persona > template), with the resolution logged
- [ ] Message bodies are checked against the declared mode before persistence: markdown-mode output containing raw HTML triggers sanitize-or-strip; roleplay-mode output is asterisk-normalized; plain-mode output has markup inert
- [ ] Structured payloads (carriage TOML, extraction tags) reuse the heal → revalidate → size-cap → approve/cancel pipeline from `TASK-structured-llm-output-healing-utils` — no separate validation path
- [ ] Off-format but parseable output is normalized with a recorded correction event; unparseable output follows the existing cancel-and-surface path, never partial injection
- [ ] Validation failures are observable (structured log + dev-visible surface), not silent

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `TASK-chat-feature-message-formatting-modes` — the body-format half of the contract
- `epic-hidden-carriage-context` — TOML carriage shape + healing utils precedent
- `TASK-structured-llm-output-healing-utils` — heal/revalidate pipeline to reuse
- `TASK-chat-feature-settings-templates-compat-matrix` — template-level format declarations

## Files

- `src/generation/` — prompt assembly + output validation gate
- `src/utils/structured-output.ts` (per `epic-hidden-carriage-context`) — healing utils
- `src/chat/types/config.ts` — format declaration field

## Research Inputs

- RisuAI regex/trigger scripts: declared pre/post-send transforms with explicit in/out rules (deepwiki kwaroran/RisuAI, 2026-09-11)

## Open Questions

- Is precedence chat-mode-wins, or should gm override the mode for one-off formatted outputs?
- Do validation corrections feed back into prompt instructions (auto-repair prompting)?
