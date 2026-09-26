<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-cross-mech-g46: Interrupt semantics — stream abort, truncate-to-last-observed, never-bill-undelivered

**Status:** open
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** Define and ship the interrupt semantics for in-flight generations. Stop → story truncates at last seen line; pending jobs (TTS, image, side-effects) cancelled end-to-end; billing hooks respect delivery (never bill undelivered tokens or uncompleted side-effects). Touches Transport/Streaming × Queued Side-Effects.
**Context:** `matrix-cross-mechanics.md` G46 is 🟡 Medium (from the second emergent sweep 2026-08-31). Matrix says: "Stop → story truncates at last seen line, pending jobs cancelled end-to-end, billing hooks respect delivery." Inspiration: DreamRunner/Neta Studio interrupt handling. Stream abort already exists at a low level; the truncate, cancel-everything, never-bill behaviour is unspecified.

## Current state

- `src/transport/stream/` has an abort signal; downstream consumers don't always honour it.
- Queued TTS and image jobs run to completion regardless of chat abort.
- Billing counts tokens delivered + queued, not delivered-only.
- Story narrative keeps the full assistant output even when the user stopped at line N — no truncation back to "last seen".

**Acceptance Criteria:**

- [ ] Abort signal cascades to TTS, image, and any queued side-effect; jobs cancel within one polling tick.
- [ ] On abort, the story truncates at the user's last-observed line; subsequent assistant tokens are not persisted.
- [ ] Billing hook accepts `delivered_tokens` (not raw token count); undelivered tokens never billed.
- [ ] Tests in `src/transport/interrupt.test.ts` cover cascade, truncation, and the billing contract.
- [ ] `bun run check` green.

**Tags:** interrupt, abort, billing, streaming, truncation, side-effects
**Related:** src/transport/stream/, src/billing/, src/tts/, src/assets/, .plan/matrix-cross-mechanics.md (G46 row), epic-transport-layer-expansion.md

git issue: 97535c1
