<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Open — Untriaged Tickets & Issues (2026-08-25)

> **Purpose:** landing zone for git issues that exist but have no index entry / epic
> linkage yet. Created during the 2026-08-25 backlog reconciliation after
> `bun run plan:sync` reported these 16 open git issues with no index entry.
> Triage = link each issue to its epic/ticket (then `plan:sync --fix`), close as dup,
> or promote into a priority tier.

## Security-hardening wave (2026-08-25 review — see `security-review-2026-08-25.md`)

| # | Git issue | Topic | Suggested home |
| - | --------- | ----- | -------------- |
| 1 | `a877274` BUG-auth-rate-limiter-tests-seed-per-ip-buckets-via-getclientip | Rate-limiter tests depend on `getClientIp` XFF spoofing | `security-review-2026-08-25.md` §MEDIUM (XFF trust) + rate-limit review |
| 2 | `8d307ae` BUG-getclientip-is-untestable-without-a-live-bun-server-ip-sourcing | `getClientIp` untestable without live server | same as #1 (fix together) |
| 3 | `adff874` TASK-browser-tests-weak-interaction-coverage-in-existing-flows | Browser e2e coverage gaps | `priority-release-010.md` § Hardening |
| 4 | `30d0e69` TASK-browser-test-fixture-no-mock-llm-provider-stale-frontend-bui | Stale frontend build in browser fixture | same as #3 |
| 5 | `1a3a97a` BUG-sse-streams-leak-string-error-internals-to-clients | SSE error leaks internals | chat pipeline hardening; overlaps `d14fd85` per security doc dedup notes |
| 6 | `5842782` TASK-logging-hardening-minors-injection-rotation-races-sink-path | Logger injection/rotation races | logger hardening cluster (P6 candidate) |
| 7 | `a06b99e` BUG-telemetry-stores-raw-client-body-real-user-chat-session-ids | Telemetry PII (raw bodies, session ids) | `security-review-2026-08-25.md` + privacy hardening |
| 8 | `b23b7fb` BUG-logger-censor-depth-cutoff-returns-subtree-untouched-nested | Censor depth cutoff bug | same cluster as #6 |
| 9 | `b465b08` BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san | ReDoS in HTML sanitizer | sanitizer hardening; HIGH-adjacent |
| 10 | `94f9a36` TASK-nsfw-override-authz-scope-route-lacks-chat-membership-check | NSFW override route authz gap | NSFW gate cluster below + `epic-nsfw-moderation.md` |
| 11 | `da08f1b` BUG-nsfw-gate-fail-open-db-error-and-missing-prefs-default-to-al | NSFW gate fails open on DB error | NSFW gate cluster |
| 12 | `f89168b` BUG-group-chat-nsfw-weakest-link-violated-enforcement-hardcodes | Group-chat NSFW weakest-link violated | NSFW gate cluster |
| 13 | `4f8aeb2` BUG-nsfw-consent-auto-granted-in-memory-for-any-logged-in-user | NSFW consent auto-granted in memory | NSFW gate cluster |
| 14 | `9575d31` BUG-lognsfwevent-has-zero-callers-no-nsfw-gate-decision-ever-aud | `logNsfwEvent` zero callers — no audit trail | NSFW gate cluster |
| 15 | `ccb8879` BUG-nsfw-gate-ordering-inverted-moderation-hooks-run-after-llm-g | Moderation hooks run AFTER LLM generation | NSFW gate cluster — ordering fix likely highest-value of the wave |
| 16 | `eafe79f` TASK-regex-pipeline-hardening-sweep-input-caps-lastindex-hazards | Regex pipeline lastIndex/caps hazards | regex hardening; relates to quick-wins item 4 (`transforms.ts`) |

## Federation / decentralization wave (concurrent, also unlinked)

A second unlinked batch (13 git issues: ActivityPub actor signing/rotation,
WebFinger discovery, federated delete/GDPR, CRDT conflict policy, delivery
reliability queue, signal-bridge activation, Radicle integration AC, leader/swarm
arbitration, in-process federation test fixtures) surfaced in the same sync window.
These belong to the decentralization epic family (`epics/` — social hub /
decentralization deferred cluster) and should get their own epic linkage before any
of that work starts.

**Cluster summary:** NSFW gate correctness/ordering (#10–15) is one coherent fix
batch → suggest an `epic-nsfw-gate-correctness.md` or fold into
`epic-nsfw-moderation.md` § Integration Points. Logging/telemetry/sanitizer/regex
(#6–9, 16) form a second input-hardening batch. Browser-test items (#3–4) belong to
release hardening. Rate-limit/IP items (#1–2) pair with the MEDIUM XFF finding.

## Known index defect (from latest `plan:sync`)

- 🔴 **Hash mismatch:** `TASK-CONSOLIDATE-UNSAFE-DATE-BUFFER-JSON-USAGE-INTO-SHARED-UTILS`
  index hash `7118f58` points at unrelated git issue — RESOLVED 2026-08-25: index now links ad8bb7e
  "FEAT-unified-date-representation-util…" — re-link via `plan:sync --fix` or manual
  `git_issue` field edit before trusting that ticket's status.
