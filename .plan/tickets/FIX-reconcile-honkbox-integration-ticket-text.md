<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FIX: Reconcile honkbox integration ticket text

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-platform-integrations

**Summary:**
Three honkbox integration tickets were closed after their source work landed, but their spec text still claims proposed/blocked state, carries duplicate Summary headers and authoring placeholders, and names code locations that no longer exist. Consequently the Done tickets mislead future readers about what shipped and weaken the audit trail that `.plan/` is meant to provide.

**Scope:**

- `TASK-consume-honkbox-capabilities-contract.md`: remove the duplicate Summary line and the stale BLOCKED note; keep the landed contract facts.
- `TASK-honkbox-provider-wiring-and-gpu-admission-ownership.md`: flip the acceptance line claiming the honkbox smoke is "still proposed" to reflect the shipped smoke.
- `TASK-honkbox-generation-result-delivery-and-asset-ingest.md`: add a Resolved line for git issue `22b5def` (landed with f15b460); drop the stale caveats about GLB MIME (allowed at `packages/web-ui/src/gen/assets/validate.ts:26`, now `assets/service/validate.ts`), `HONKBOX_ASSET_*` env vars (docs corrected), and `images_inputs.rs:81` (parser moved).
- Across the three Done tickets: fill or remove authoring placeholders, keep unchecked acceptance boxes honest (mark complete with evidence where the work did land), and preserve SPDX headers. No source changes.

**Out of scope:** no code, no new tickets on the honkbox side, no reopening closed git issues, no rewrite of Resolved history.

**Acceptance Criteria:**

- [ ] No duplicate Summary header, `(fill in before starting...)`, or stale BLOCKED line remains in the three tickets.
- [ ] Every remaining acceptance checkbox reflects landed reality with a commit/evidence pointer.
- [ ] Delivery ticket carries the `22b5def` resolution note and no dead file/line references.
- [ ] `bunx markdownlint-cli2 ".plan/tickets/*.md"` passes.

**Context:**

Filed from the honkbox 2026-11-20 wave-C closeout; git issue `bab3379`. The
sibling `FEAT-expose-new-honkbox-capability-keys.md` ticket covers genuinely new
server keys and remains separate. This ticket is documentation-only: preserve
the existing Status/Resolved history, correct only statements that are now false
against the landed source.
