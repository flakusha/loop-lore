<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-e2ee-crypto-ui: Client-Side E2E — Phase G UI affordances

**Status:** ⬜ Not Started — **blocked on `TASK-encryption-architecture-clarification.md`**
**Priority:** Low
**Effort:** Medium
**Type:** TASK
**Tags:** crypto, e2e, ui
**Epic:** epic-crypto
**Parent:** TASK-asymmetric-key-pairs-followup (umbrella)

## Summary

Surface the E2E (`at-rest`) tier in the UI: per-chat tier selection, key recovery, and LLM-with-E2E consent UX. Blocked until the LLM-with-E2E strategy is settled (deniability + server-mediated generation vs. client-side inference vs. secure-enclave).

## Tasks

- [ ] Per-chat tier dropdown (`none` / `standard` / `at-rest`).
- [ ] Key-recovery flow (social recovery, opt-in escrow, or none — pending architecture decision; see parent's key-recovery open question).
- [ ] LLM-with-E2E consent UX (per-message or per-chat toggle; explicit server decrypt with auditing) — design follows the clarification ticket's outcome.
- [ ] Client-side key management screen (`src/components/settings/key-management.html` per `epic-encryption-workflow.md` §"Phase 2c").

## Out of Scope

- Key management UI beyond the settings screen (per parent: asset encryption E2E and client-side LLM integration are separate work items).

## Dependencies

- Parent hub: `TASK-asymmetric-key-pairs-followup.md`
- **Blocked by:** `TASK-encryption-architecture-clarification.md`.
- Siblings: builds on vocabulary shipped by TASK-e2ee-receiver-wiring; independent of TASK-e2ee-double-ratchet mechanics.
