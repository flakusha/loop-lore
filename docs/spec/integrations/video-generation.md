<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Video Generation: ComfyUI Dispatch Gate

`POST /api/v1/generation/video` generates one clip via a configured ComfyUI
video workflow. Submit is async: the route stores a `pending` job and returns
`202 + jobId` immediately; the background continuation renders, persists the
clip, and marks the job `done`/`failed`. Poll via
`handleVideoGenerationStatus` (foreign jobs 404, never 403, so job ids are not
oracle-probeable). The in-memory job store is bounded
(`VIDEO_JOB_STORE_MAX = 500` in `src/generation/video-jobs.ts`): past the cap,
settled jobs evict oldest-first — a pending job is never evicted to make room
unless every entry is still pending. Restart clears the store (durable state
is out of scope).

## Local vs external providers: `localBox`

A video provider is **local** when it shares a GPU with this box (local
llama.cpp + ComfyUI on one weak GPU). Mark it with `localBox` on
`VideoProviderConfig`:

```yaml
generation:
  providers:
    video:
      - name: comfy-video-local
        baseUrl: http://localhost:8188
        apiFamily: comfyui
        workflow: txt2video
        localBox: weak-box-1
```

- `localBox` present → the render serializes with other renders for the same
  box (one running render per box; different boxes run concurrently).
- `localBox` absent → the provider is **external** and bypasses the gate with
  zero added latency.

Default is external: existing configs without `localBox` behave exactly as
before. This is an explicit operator declaration, never a `baseUrl` heuristic
(a LAN-addressed ComfyUI on the same box and a localhost ComfyUI with its own
GPU mis-classify in both directions under a heuristic). The gate key IS the
`localBox` string, used consistently by the gate, the pre-dispatch hook, and
the `boxKey` log fields.

## The dispatch gate (`src/generation/video-dispatch-gate.ts`)

A per-key promise-chain FIFO in front of the render: each waiter appends to
the box's tail promise; admission order is submission order. Before handing
the box to the next render, the gate runs the single named pre-dispatch hook
`runVideoPreDispatchHook(boxKey)` — the sibling precise-unload ticket owns the
unload semantics and registers via `setVideoPreDispatchHook`; the default is a
no-op, a hook failure only logs (the render still proceeds), and the hook
receives the box key only (no caller-supplied model id, so no request can
steer it at another user's model).

## Timeouts: queue-wait ceiling vs render deadline

Two separate budgets:

- `generationTimeoutMs` (computed at submit time, `max()` over providers, stored on the job as `deadline` = submit time + timeout) budgets the
  **render itself**: it starts running at admission, so a render resolving past its job deadline polls
  `failed/504` and a late continuation marks `failed/504`.
- `VIDEO_QUEUE_WAIT_MS` (5 minutes) budgets the **wait for a box slot**: it applies at admission only — a
  waiter still queued past the ceiling fails the job `failed/429` without
  running. Queue-wait is NOT part of `generationTimeoutMs` — the
  deadline runs from submit (it covers the queued wait plus the render),
  while the ceiling caps the queue portion alone.

## Authorization

Authorization stays at the submit route (401 without a user, 403 for a
foreign chat via `checkChatAccess`); the gate is internal and only settles
jobs that already passed those checks. The queued job keeps its submitter
`ownerId`; the poll route still 404s foreign jobs.

## Provider health

The gate does **not** consult `src/admin/provider-health.ts`: health is a
per-LLM-registry scan and video providers are not in that registry, so a
health check here would always read "unknown". Render failure already
 surfaces per-candidate via engine failover (timeout → 504, failure → 502).

## References

- Gate: `src/generation/video-dispatch-gate.ts`
- Call site: `runVideoRender` in `src/generation/video-gen-route.ts`
- Store: `src/generation/video-jobs.ts`
- Engine: `src/generation/video-engine.ts`
- Config: `VideoProviderConfig` in `packages/core/src/config/schema/providers.ts`
