<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Multi-Image Upload to ComfyUI `/upload/image`

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-reference-set-entity.md`, `TASK-reference-set-alt-text-consistency.md`, `src/generation/providers/comfyui-upload.ts`, `src/generation/providers/comfyui.ts`, `epic-comfyui-plugin.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Extend the ComfyUI upload helper from exactly one image to an ordered list, so
a persisted reference set (`TASK-reference-set-entity.md`) can reach the backend
as N images with one stored filename per position. Phase 0 of
`epic-reference-conditioned-generation` (bound via the **Epic:** header); this
is the transport-adjacent half of the multi-reference request model.

## Context

**Verified ground state:**

- `uploadImageToComfy(baseUrl, timeoutMs, buffer, filename)`
  (`src/generation/providers/comfyui-upload.ts:21-48`) POSTs **exactly one**
  image part — `form.append("image", new Blob(...), filename)` (`:28`) — to
  `${baseUrl}/upload/image` (`:31`) and returns a single stored filename
  (`result.data.name`, `:47`). No multi-reference request shape exists
  anywhere.
- The `ComfyUIClient` already carries an `uploadImage` method
  (`src/generation/providers/comfyui.ts`); the epic's ground-state table
  records the client surface. The helper above is what the client path uses.

**Transport boundary.** `/upload` is machinery owned by
`epic-comfyui-plugin.md` — along with the `WorkflowTemplate` interface, the
registry, and the `client_id` + `/ws` checklist items. This ticket adds **no
endpoint** and changes **no interface**: it extends the existing client helper
beside the existing single-image function, and the transport epic's phase
checklists stay the authoritative state record, unedited.

**Ordering is the contract.** The multi-reference conditioning request model
needs the N filenames **in set position order**; the helper returns an ordered
list and the mapping position → stored filename is preserved exactly. The
per-family templates consume that list; this ticket does not invent any
per-family encoding.

**Verify the wire shape against the live backend before treating it as fact.**
This epic was burned once by unverified claims about a handed-off artifact
(its *Source Artifact* section); the same discipline applies here. If
`/upload/image` rejects repeated image parts, the fallback is N sequential
single-part uploads — functionally identical for the caller — and the ticket
records which shape was delivered.

**Failure atomicity:** one failed upload fails the whole set with the failing
index named. A partial reference set silently submitted is a wrong-image
generation, not a retryable error.

## Acceptance Criteria

- [ ] The helper accepts an ordered list of (buffer, filename) and returns an
      ordered list of stored filenames; the single-image path and its existing
      callers are behaviorally unchanged
- [ ] The multi-part wire shape is verified against a live ComfyUI
      `/upload/image`, **or** the sequential single-part fallback is documented
      as the delivered shape — the ticket states which
- [ ] Position → stored-filename order is preserved end to end (unit test)
- [ ] One failed upload fails the whole set with the failing index named; no
      partial set is submitted
- [ ] No transport endpoint, template-interface change, registry change, or
      `client_id`/`/ws` work; `epic-comfyui-plugin.md` is not edited
