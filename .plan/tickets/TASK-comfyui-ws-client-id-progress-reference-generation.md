<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI client_id + /ws progress for reference generation

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-reference-conditioned-generation
**Related:** `epic-comfyui-plugin.md`, `TASK-comfyui-first-class-client-id-websocket-progress-in-comfyuic.md`, `TASK-2026-openwebui-comfyui-websocket-progress.md`, `TASK-comfyui-ws-progress-streaming.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Reference-generation progress is a **known blocker**, not a nice-to-have. This
ticket states the single ordering constraint that unblocks every reference-edit and
comparison-run ticket, and the epic item it implements.

## Context

`epic-comfyui-plugin.md` carries two open items that are one item:

- **Phase 0**: "Add optional `client_id` to `ComfyUIClient.submitWorkflow` body
  (prereq for `/ws` progress + multi-client scoping)."
- **Phase 4**: "**WebSocket** progress streaming (`/ws`) using `client_id`".

Verified state: `ComfyUIClient` (`src/generation/providers/comfyui.ts`) has
`submitWorkflow` (POST `/prompt`, body `{ prompt }` — no `client_id`),
`pollResult`, `waitForFiles`, `waitForCompletion`, `cancelExecution`, `getNodeInfo`,
`downloadImage`, `downloadFile`, `runWorkflow`, `runWorkflowFiles`, `uploadImage`.
**No `/ws` client exists.** Progress callbacks (`onProgress`) exist only at the
image-edit provider layer; the client itself has no channel.

**`client_id` is a hard prerequisite, not a nicety.** ComfyUI scopes `/ws`
execution events to a `client_id` supplied at submit. Submit without one and the
server has no way to route progress back to the caller, so `/ws` cannot be
subscribed to at all. Independent confirmation from outside the repo: the Python
sidecar's own client posts `{prompt, client_id, extra_data:{extra_pnginfo:{workflow}}}`
to `/prompt` (`web/stills.mjs:174-175`) — a working integration, written by
someone else, sending the field loop-lore omits.

Without it, every reference edit is a spinner. Qwen is recorded as ">20GB real
usage, slow" and H3 stills is a multi-minute multi-node graph. A comparison run is
N models at once. This is the difference between an interactive feature and a
batch job that may as well be a cron entry.

### Do not duplicate the existing tickets

Three tickets already cover overlapping ground and own the implementation:

- `TASK-comfyui-first-class-client-id-websocket-progress-in-comfyuic.md` — the
  `client_id` body field + `subscribeProgress` + sentinel fallback + per-call
  threading. **This is the ticket that implements the epic Phase 0 item.**
- `TASK-2026-openwebui-comfyui-websocket-progress.md` — WS subscription in the
  image-engine, `image-progress` SSE events, completion sentinel, HTTP-poll
  fallback.
- `TASK-comfyui-ws-progress-streaming.md` — the same thing from the provider/UI
  angle (frontend fan-out, gallery progress).

This ticket therefore does **not** re-implement any of them. Its scope is the
narrow part none of the three covers: **the reference-generation and comparison
callers**, which submit multiple graphs per user action and therefore need
explicit `client_id` lifecycle and per-prompt attribution that a single-generation
consumer never had to think about.

Do not edit `epic-comfyui-plugin.md`'s phase checklists from here — they are the
authoritative state record for the transport epic and other work touches them.

## Acceptance Criteria

- [ ] The three existing tickets above are cross-referenced under Context
      ("Do not duplicate the existing tickets") and none of their acceptance
      criteria are re-stated as new work
- [ ] This ticket's own scope is: per-call `client_id` minting for **multi-graph**
      runs (a comparison run submits N graphs), one subscription that attributes
      events to the right `prompt_id` within a shared `client_id`
- [ ] Progress from N concurrent reference generations does not interleave into one
      stream; each run's events are separable by `prompt_id`
- [ ] Every reference-edit path (image-engine and image-edit provider) emits
      progress; a failure to open `/ws` falls back to the existing
      `waitForFiles` poll with no behaviour regression for the caller
- [ ] Verification against a real ComfyUI that a submit **without** `client_id`
      yields no scannable progress events, recorded in the ticket
- [ ] Test: two concurrent prompts on one client produce independently attributable
      event streams; a WS handshake failure falls back to polling
- [ ] `bun run check` green
