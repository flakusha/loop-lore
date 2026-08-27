<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Generation Flow Control — Pause, Throttling & Concurrency

## Status: Proposed

**Priority:** High
**Labels:** generation, pause, rate-limit, concurrency, admin

## Summary

Generation currently has strong cancellation but weak regulation. Users can cancel an
in-flight attempt (`POST /api/generation/cancel` → AbortController abort through the
provider fetch), yet there is no way to *pause* generation as a whole, no bound on how
many generations run concurrently, and rate limiting exists only on auth routes.

## Current State (verified)

| Area | State | Where |
|---|---|---|
| Per-attempt cancel | ✅ complete | `src/generation/cancellation-actions/cancel.ts`, `generation-routes/cancel.ts` |
| Client-disconnect abort | ✅ SSE `cancel()` aborts provider fetch | `generate-route/stream-to-client.ts`, `generation-routes/stream.ts` |
| Per-chat pause | ⚠️ partial — `story_state.isPaused` gates ONLY group-cascade + turn selection; primary `/api/generation/generate` ignores it | `auto-gen/group-cascade.ts:110`, `group-chat/turn-selector.ts:56`, `routes/chats/manage.ts:96` |
| Global pause | ❌ absent | — |
| Generation concurrency control | ❌ absent — unbounded parallel attempts (only per-chat idempotency via `hasInFlightGeneration` + prior-attempt abort) | `cancellation-tracker/lifecycle.ts`, `cancellation-actions/inflight.ts` |
| Rate limiting on generation | ❌ absent — `middleware/rate-limit.ts` used only by auth routes (login/register/demo, per-IP) | `routes/auth/shared.ts` |
| Provider-side throttle | ✅ retry/backoff + circuit breaker honoring Retry-After | `providers/openai-compatible/http.ts`, `providers/circuit-breaker.ts` |
| Config knobs for limits | ❌ none in `generation` schema (only `transport.limits.maxConcurrentStreams`, HTTP/2 framing) | `config/schema/generation.ts`, `config/schema/transport.ts` |
| Admin runtime controls | ❌ system_config KV exists but no pause/limit keys or UI | `admin/config.ts`, `routes/admin/system-config.ts` |

All state is process-local/in-memory; no cross-instance coordination (relevant later for swarm).

## Design Direction

Two distinct concepts, deliberately separated:

1. **Hold (pause)** — refuse to *start* new generations; in-flight ones run to completion.
   Cheap, safe, no stream tearing. Applies at two scopes:
   - per-chat: existing `story_state.isPaused`, extended to gate the primary generate route
     (currently only auto-cascade honors it).
   - global: new `system_config` key checked in `generate-route/handler.ts` pre-check +
     all auto-gen schedulers (cascade, game-master, aux pipeline triggers).
2. **Regulate (rate-limit / concurrency)** — bound throughput rather than stop it:
   - concurrency semaphore on active generations (per-user / per-chat / global tiers),
     built on the existing cancellation-tracker registry;
   - request-rate limits reusing `createRateLimiter` from `middleware/rate-limit.ts`,
     keyed per-user (authenticated) with per-IP fallback, returning 429 + Retry-After;
   - optional token/cost budget per window (later ticket, provider usage stats).

Queuing (holding requests until a slot frees) vs rejecting (429/409 immediately) is a
per-scope policy decision captured in the tickets; default = reject fast with structured
error so the UI can render a disabled state instead of a spinner.

## Tickets

| Ticket | Scope |
|---|---|
| `FEAT-unified-hold-semantics-per-chat-pause-gates-primary-generate` | make `isPaused` a real hold on the primary route; define hold-vs-cancel UX contract |
| `FEAT-global-generation-pause-kill-switch` | global hold via system_config + admin toggle + gates in all generation entry points |
| `FEAT-generation-rate-limiting-and-concurrency-limits` | semaphore + sliding-window limits on generation routes; config schema + env mapping |
| `TASK-admin-generation-controls` | runtime admin surface: global pause toggle, limit adjustment, cancel-all on `/api/generation/active` |

Autonomous actor dispatch (epic-actor-autonomy-story-drive.md) is a governed consumer of these controls: its scheduler honors per-chat + global holds, and its actor-level budget governor stacks on top of the route-level semaphore/limits here — neither layer reimplements the other.
## Non-goals

- Cross-instance/swarm-coordinated limits (defer to `epic-federation-swarm-sync.md`).
- Provider billing/quota accounting beyond what circuit breaker already does.
- Changing SSE transport away from client-disconnect semantics.
