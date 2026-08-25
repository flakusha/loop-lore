<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Open — Untriaged Tickets & Issues (2026-08-25)

> **Purpose:** landing zone for git issues that exist but have no index entry / epic
> linkage yet (advisory orphans reported by `bun run plan:sync`; recompute the
> current set at triage time rather than trusting a captured count).
> Triage = link each issue to its epic/ticket (then `plan:sync --fix`), close as dup,
> or promote into a priority tier.

## Security-hardening wave (2026-08-25 review — see `security-review-2026-08-25.md`)

| Git issue | Topic | Suggested home |
| --------- | ----- | -------------- |
| `a877274` BUG-auth-rate-limiter-tests-seed-per-ip-buckets-via-getclientip | Rate-limiter tests depend on `getClientIp` XFF spoofing | `security-review-2026-08-25.md` §MEDIUM (XFF trust) + rate-limit review |
| `8d307ae` BUG-getclientip-is-untestable-without-a-live-bun-server-ip-sourcing | `getClientIp` untestable without live server | same as above (fix together) |
| `adff874` TASK-browser-tests-weak-interaction-coverage-in-existing-flows | Browser e2e coverage gaps | `priority-release-010.md` § Hardening |
| `30d0e69` TASK-browser-test-fixture-no-mock-llm-provider-stale-frontend-bui | Stale frontend build in browser fixture | same as above |
| `1a3a97a` BUG-sse-streams-leak-string-error-internals-to-clients | SSE error leaks internals | chat pipeline hardening; overlaps `d14fd85` per security doc dedup notes |
| `5842782` TASK-logging-hardening-minors-injection-rotation-races-sink-path | Logger injection/rotation races | logger hardening cluster (P6 candidate) |
| `02a9092` BUG-raw-buffer-from-alloc-inconsistent-with-safe-buffer-65-sites | Raw buffer from alloc vs safeBuffer inconsistency | input-hardening batch |
| `2984874` BUG-raw-json-parse-outside-safe-json-3-sites | Raw `JSON.parse` outside safeJson | input-hardening batch |
| `a06b99e` BUG-telemetry-stores-raw-client-body-real-user-chat-session-ids | Telemetry PII (raw bodies, session ids) | `security-review-2026-08-25.md` + privacy hardening |
| `b23b7fb` BUG-logger-censor-depth-cutoff-returns-subtree-untouched-nested | Censor depth cutoff bug | same cluster as logging hardening |
| `b465b08` BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san | ReDoS in HTML sanitizer | sanitizer hardening; HIGH-adjacent |
| `94f9a36` TASK-nsfw-override-authz-scope-route-lacks-chat-membership-check | NSFW override route authz gap | NSFW gate cluster below + `epic-nsfw-moderation.md` |
| `da08f1b` BUG-nsfw-gate-fail-open-db-error-and-missing-prefs-default-to-al | NSFW gate fails open on DB error | NSFW gate cluster |
| `f89168b` BUG-group-chat-nsfw-weakest-link-violated-enforcement-hardcodes | Group-chat NSFW weakest-link violated | NSFW gate cluster |
| `4f8aeb2` BUG-nsfw-consent-auto-granted-in-memory-for-any-logged-in-user | NSFW consent auto-granted in memory | NSFW gate cluster |
| `9575d31` BUG-lognsfwevent-has-zero-callers-no-nsfw-gate-decision-ever-aud | `logNsfwEvent` zero callers — no audit trail | NSFW gate cluster |
| `ccb8879` BUG-nsfw-gate-ordering-inverted-moderation-hooks-run-after-llm-g | Moderation hooks run AFTER LLM generation | NSFW gate cluster — ordering fix likely highest-value of the wave; promote into `epic-nsfw-moderation.md` § Integration Points first |
| `eafe79f` TASK-regex-pipeline-hardening-sweep-input-caps-lastindex-hazards | Regex pipeline lastIndex/caps hazards | regex hardening; relates to quick-wins item 4 (`transforms.ts`) |

## Date-handling correctness cluster (pairs with linked date-utils ticket)

The index already links `TASK-CONSOLIDATE-UNSAFE-DATE-BUFFER-JSON-USAGE-INTO-SHARED-UTILS`
to git issue `ad8bb7e` (unified date representation util). These open issues form the
surrounding date-handling correctness batch and should be triaged against that util work:

- `65c87b5` BUG-date-parse-results-unchecked-for-nan — unchecked `Date.parse` results
- `e72f484` BUG-untrusted-new-date-parse-without-invalid-date-guard — unguarded `new Date(parse(...))`
- `0c43ca5` BUG-server-view-date-display-ignores-user-timezone-locale — server-side display ignores user timezone/locale

## Federation / decentralization wave (concurrent, also unlinked)

An unlinked decentralization batch belongs to the decentralization epic family
(`epics/` — social hub / decentralization deferred cluster) and should get its own
epic linkage before any of that work starts. Beyond the generic items (ActivityPub
actor signing/rotation, WebFinger discovery, federated delete/GDPR, CRDT conflict
policy, delivery reliability queue, signal-bridge activation, Radicle integration AC,
leader/swarm arbitration, in-process federation test fixtures), these concrete open
issues surfaced in the same sync window:

- `81b59cf` BUG-activitypub-federation-does-not-leverage-the-blog-system-lem — ActivityPub should reuse the blog system (Lemmy/Mastodon primitive)
- `69d45a5` BUG-blog-comments-lack-threading-parent-comment-id-blocking-lem — comment threading blocks Lemmy/Mastodon/Reddit parity
- `476e62b` BUG-chat-im-adapter-abstraction-duplicated-protocoladapter-vs-so — ProtocolAdapter vs SocialAdapter duplication, no code path
- `27cc7ab` BUG-irc-integration-unscoped-as-group-chat-only-in-social-hub-ad — IRC integration scoped as group-chat-only in social-hub adapter list

**Cluster summary:** NSFW gate correctness/ordering is one coherent fix batch →
suggest an `epic-nsfw-gate-correctness.md` or fold into
`epic-nsfw-moderation.md` § Integration Points. Logging/telemetry/sanitizer/regex +
raw-buffer/raw-json items form a second input-hardening batch. Browser-test items
belong to release hardening. Rate-limit/IP items pair with the MEDIUM XFF finding.

## Known index defects

∅ none — the 2026-08-25 hash mismatch on
`TASK-CONSOLIDATE-UNSAFE-DATE-BUFFER-JSON-USAGE-INTO-SHARED-UTILS` was fixed (index
links `ad8bb7e`) and `bun run plan:sync` is green.

