<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Effect v4 Adoption Evaluation

**Overview:** (see sections below)


**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** effect, typescript, fp, typed-errors, retry, concurrency, dependency-injection, observability, evaluation

## Summary

Evaluate — with measurements, not enthusiasm — whether loop-lore should adopt
the [Effect](https://effect.website/docs/v4/onboarding) TypeScript library, and
adopt it **only per-surface** where a spike proves it is a net win.

This is an **evaluation epic, not a migration epic.** It ships four bounded
spikes and one decision ticket. The "no" outcome is a complete, valid, and
fully-recorded outcome that closes the epic.

## Why this epic exists

Effect's pitch is that a program's failure modes, dependencies, and lifecycle
should be visible to the compiler. loop-lore already hand-rolls a large part
of that promise:

- exponential backoff + jitter in the provider HTTP path
- a circuit breaker + provider failover
- a concurrency semaphore
- a structured logger with child loggers and bindings
- a config schema with env overrides and secret redaction
- ad-hoc `try/finally` resource cleanup
- `{ ok: false, error }` discriminated unions

So the adoption question is *not* "do we want typed errors" — the answer is
mostly already yes, in the local idiom. The question is narrow: **does Effect
replace something we currently pay for, at a cost we can afford?** Three
specific costs are on the table: duplicated retry policy, the manual wiring
bag, and the absence of request/operation spans.

## Critical constraint: v4 is not released

Verified against the npm registry (2026-09-26):

| Fact | Value |
| ---- | ----- |
| `latest` dist-tag | `3.22.2` |
| v4 line dist-tag | `rc` → `4.0.0-rc.117` |
| v4 beta dist-tag | `4.0.0-beta.107` |
| v4 package shape | ESM-only (`"type": "module"`, no `engines` field declared) |
| v4 ecosystem modules | exported under `./unstable/*` (`unstable/sql`, `unstable/schema`, `unstable/http`, `unstable/cluster`, `unstable/ai`, …) |

**Consequence:** the v4 line we would be adopting is a release candidate whose
ecosystem surface is still explicitly unstable. Any adoption decision must
account for churn, and must never gate a load-bearing path (validation, HTTP,
DB access, config) on an RC dependency. This constraint is the reason the
compatibility spike is a hard gate and runs first.

## Pillar-by-pillar assessment (verified 2026-09-26)

Effect's onboarding page advertises ten out-of-the-box capabilities. Assessed
against what loop-lore actually ships:

| Effect pillar | loop-lore today | Verdict |
| ------------- | ---------------- | ------- |
| Typed errors | Ad-hoc `{ ok: false, error }` unions, scoped to a few modules (e.g. `src/generation/image-engine/types.ts`, `src/chat/service/ownership.ts:141`) | **Low value.** The shape exists; Effect would add ceremony, not capability. |
| Retries & scheduling | Hand-rolled in **four** places: `src/generation/providers/circuit-breaker.ts`, `src/generation/providers/call-with-failover.ts`, per-provider backoff in `src/generation/providers/anthropic/http.ts`, `src/chat/proactive/timing.ts:59` | **Real duplication.** The only pillar where hand-rolling is clearly costing us. Spike it. |
| Structured concurrency | `src/llm/concurrency-limiter.ts` (async semaphore) | **Worth a spike.** The semaphore is ~125 lines; scoped interruption is genuinely absent. |
| Resource safety | Ad-hoc `try/finally` (e.g. `src/async/offload.ts`) | **Low-medium.** Improvement is real but bounded and rarely reached. |
| Dependency injection | `RegisterPluginsOpts` (`src/app/register-plugins.ts:110-115`) — a 3-field bag `{ database, config, asyncStore }` threaded into ~100 route factories and registered onto `Elysia<any>` | **Real, but contested.** The `any` escape hatch and the route-chain type-instantiation blowout are the actual symptoms; Effect `Layer` must beat Elysia's own plugin model to be worth it. Spike it. |
| Observability (spans) | `src/logger` with `child()` + bindings; `/metrics` Prometheus exposition in `src/routes/metrics.ts`; **no span concept anywhere in `src/`** | **Genuinely missing — but Effect is probably the wrong fix.** The cheap answer is the OpenTelemetry API composed onto the existing logger, and that evaluation already exists (see *Related*, not duplicated here). |
| Streaming | — | **Skip.** No proven need. |
| Schema validation | Elysia `t` (TypeBox) in `src/validation/schemas.ts`, plus Kysely-generated DB schemas | **Never.** TypeBox is load-bearing for Elysia request validation; swapping it is a rewrite with no offsetting gain. |
| Configuration | `ConfigSchema` + `applyEnvironmentOverrides` (`src/config/load/env.ts`) + secret redaction (`src/admin/config-keys.ts`) | **Skip.** Already done, and it is a domain-specific schema, not an env reader. |
| HTTP / framework | Elysia | **Never.** Elysia is the framework. |

**Net read:** two of ten pillars justify a spike (retries, concurrency), one is
genuinely missing but has a cheaper fix (spans), two are structurally off-limits
(schema, HTTP), and the rest are already covered. Effect is a plausible
**per-surface library**, not a plausible framework for this codebase.

## Scope

- Four bounded spikes (compatibility, retry parity, scoped concurrency, DI wiring)
- One go/no-go decision ticket with measured numbers
- An explicit, recorded position on every pillar above, including the four skipped ones

## Non-goals

- **No rewrite.** loop-lore does not migrate to Effect as its application framework.
- **No replacement of Elysia, TypeBox, Kysely, or `src/logger`.**
- **No new runtime dependency until the compatibility spike passes.** Spikes run in a throwaway `.tmp/` harness or a scratch branch; nothing lands in `package.json` until a "go" is recorded.
- **No duplication of the OpenTelemetry evaluation** — see *Related epics and tickets*.

## Design

### Spike shape

Every spike follows the same shape so results are comparable:

1. Pick **one** real call path, not a toy.
2. Build the Effect version beside the current version in `.tmp/` (scratch, never committed).
3. Measure: net LOC delta, wall-clock latency on the happy path, and behaviour parity on the failure path.
4. Record the numbers in the epic's *Spike Results* table. No number, no adoption.

### Decision gate

The decision ticket takes each pillar and records exactly one of:

- `ADOPT` — Effect is a measured net win on that surface; a follow-up epic scopes the migration.
- `ADOPT-SUBSET` — a single operator (e.g. `Schedule`) is worth importing without the Effect type.
- `REJECT` — Effect loses to the status quo or to a cheaper alternative; record which one shipped instead.

The default expectation, recorded up front, is **mostly reject**. The spikes exist
to overturn that expectation with evidence, not to confirm it.

## Spikes and gate order

```mermaid
flowchart TD
  s1["S1 — Bun/ESM/typecheck compatibility<br/>(HARD GATE)"] --> s2["S2 — retry/Schedule parity"]
  s1 --> s3["S3 — scoped concurrency + interruption"]
  s1 --> s4["S4 — DI wiring vs handleOpts bag"]
  s2 --> d["S5 — go/no-go decision"]
  s3 --> d
  s4 --> d
  s1 -->|"FAIL: epic closes 'no adoption'"| stop["Spikes 2-4 do not run"]
```

S1 is a hard gate: if `effect` cannot install, import, and typecheck under Bun +
tsgo strict without regressing a `bun run check` gate, the epic closes as
"no adoption" and S2–S4 never run.

## Tasks

- [ ] S1 — Bun/ESM/typecheck compatibility spike (hard gate)
- [ ] S2 — retry/Schedule parity spike on the provider call path
- [ ] S3 — scoped concurrency and interruption spike
- [ ] S4 — DI wiring spike versus the `handleOpts` bag
- [ ] S5 — go/no-go adoption decision

## Spike Results

Empty until the spikes run. Populate with measured numbers, not adjectives.

| Spike | Metric | Current | With Effect | Delta | Verdict |
| ----- | ------ | ------- | ----------- | ----- | ------- |
| S1 | typecheck + gate pass | — | — | — | — |
| S2 | LOC, happy-path latency, failover parity | — | — | — | — |
| S3 | LOC, cleanup correctness under interruption | — | — | — | — |
| S4 | LOC, `app:any` escapes removed, typecheck depth | — | — | — | — |

## Dependencies

- Independent of every other epic; shares no schema, no migration, no route surface.
- Read-only inputs: `src/generation/providers/*`, `src/llm/concurrency-limiter.ts`, `src/app/register-plugins.ts`, `src/logger/*`.
- The tracing gap is deliberately **not** addressed here — see *Related epics and tickets*.

## Related epics and tickets

| Item | Relationship |
| ---- | ------------ |
| `TASK-evaluate-elysia-opentelemetry.md` | Covers the tracing gap with the cheaper OTel answer. **Not duplicated by this epic.** |
| `TASK-evaluate-elysiajs-opentelemetry-versus-custom-telemetry-modu.md` | Same. Both are thin placeholders that predate this epic; S5 should fold their outcome in rather than re-run it. |
| `epic-observability-telemetry.md`, `epic-api-telemetry.md` | Own the observability surface; this epic only notes that spans are missing. |
| `BUG-v1-route-chain-exceeds-ts-instantiation-depth.md` | Closed by a workaround (split the `.use()` chain). S4 tests whether a service layer removes the underlying cause. |
| `epic-error-envelope.md`, `epic-logging.md` | Adjacent error/logging surfaces; this epic proposes no change to them. |
| `epic-concurrency-runtime-benchmarks.md` | S3's benchmark harness may already exist there — reuse it rather than building a second one. |

## Files

- `.plan/tickets/TASK-effect-v4-bun-esm-typecheck-compatibility-spike.md`
- `.plan/tickets/TASK-effect-v4-retry-schedule-parity-spike-on-the-provider-call-p.md`
- `.plan/tickets/TASK-effect-v4-scoped-concurrency-and-interruption-spike.md`
- `.plan/tickets/TASK-effect-v4-di-wiring-spike-versus-the-handleopts-bag.md`
- `.plan/tickets/TASK-effect-v4-go-no-go-adoption-decision.md`

(No `src/` files. An evaluation epic ships no code.)

## Notes

- Adopting an RC dependency is the single biggest risk in this epic. S1 exists
  specifically to price that risk before anything else is measured.
- The v4 docs themselves advocate the Effect LSP plugin on `tsgo` for agentic
  workflows. That is a separate, independently-evaluable question and is
  **not** part of this epic.
- If the decision is "no", the correct outcome is: record it, keep the numbers,
  and close. Do not leave a half-migrated codebase as a legacy.
