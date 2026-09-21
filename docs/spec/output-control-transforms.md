<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Output Control & Transforms Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

Output control and transforms operate on raw LLM outputs before they reach the user. Pipeline lives across `src/regex/` (extraction), `src/content/` (compression / encoding), and `src/prompts/` (prompt assembly + healing).

## Scope

- **Regex extraction:** `src/regex/` provides HTML sanitization, intent classification, narrative extraction, hallucination guards, dice rolls.
- **Smart-regen:** `src/rpg/service/dice-roll.ts` + output control decide when to regenerate vs accept.
- **Prompt library:** `src/prompts/` is the registry of reusable prompt templates.
- **Auto-translation:** planned via `src/i18n/` post-processing.

## Technical Design

- **Pipeline:** LLM output → content decompression → regex extraction → smart-regen decision → translation (planned) → user.
- **Compression:** `src/content/compress.ts` round-trips gzip / zstd / brotli; the chat system transparently handles encoding.
- **Sanitization:** `src/regex/html-sanitize.ts` runs DOMPurify on outputs flagged as HTML.

## Integration Points

- `src/regex/` — extraction pipeline
- `src/content/compress.ts` — encoding
- `src/prompts/` — prompt library
- `src/rpg/service/dice-roll.ts` — smart-regen trigger

## Related Epics

- `.plan/epics/epic-output-control-transforms.md`

Regex extraction has no dedicated epic — its home is this spec and
`docs/spec/regex-extraction.md`.
