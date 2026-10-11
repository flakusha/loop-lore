<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: feat(webhooks): webhook delivery-status console with retry

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Derived-feature proposal F03 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-communications-integrations.md` (Not Started) + `epic-federation-swarm-sync.md` (Done; `038_mesh_outbox.ts` retry queue) + `epic-frontend-admin.md` (Done) + T17 (bridge/secrets wiring, `not_configured` vs `unknown_adapter` vs `rate_limited` codes, injectable limiter).

Derivation: `ingestWebhook` already returns a typed discriminated result (`dispatched | not_configured | unknown_adapter | rate_limited | invalid_signature`) and the federation outbox already implements sender-side retry with backoff. T17 makes the codes truthful (configured-vs-unknown distinguishable). A delivery-status console is the read-model joining the two: per-adapter delivery ledger + retry, mirroring the mesh outbox pattern for the webhook path.

Draft epic sketch / acceptance:

- Persist per-delivery outcome rows (adapter, code, dispatched flag, latency) beside the existing `telemetry_events` analytics.
- Admin UI lists recent deliveries filterable by adapter and outcome code, with manual retry for failed rows.
- Unconfigured adapters show a setup hint (which secret/bridge seam is missing) instead of a bare 404.
- Rate-limited deliveries surface `retryAfterSec` and auto-schedule retry via the cron scheduler.
- A test pins the full matrix: 503-not-configured vs 404-unknown vs 429 vs 200-dispatched.

Priority: high — the integrations surface is dead until wired (T17); the console is what makes "wired" observable and debuggable.

Blocked-by: T17.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). High-priority composition group F01-F05.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
