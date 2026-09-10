<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Open — Untriaged Tickets & Issues (2026-09-10)

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

## Known index defects

∅ none — the 2026-08-25 hash mismatch on
`TASK-CONSOLIDATE-UNSAFE-DATE-BUFFER-JSON-USAGE-INTO-SHARED-UTILS` was fixed (index
links `ad8bb7e`) and `bun run plan:sync` is green.

---

## 2026-09-10 re-triage

> `bun run plan:sync` is green except advisory orphans (recompute at triage time
> rather than trusting this snapshot). The Aug-25 waves above are linked reference —
> closed items moved to `open-closed.md` / `open-inflight.md` (§ 2026-09-03 sections).

### Current advisory orphans

- `e12566a` BUG-idempotency-table-backend — table backend became the default during
  Bucket A; verify the ticket still reproduces, else close. Suggested home: middleware
  hardening or close.
- `dd6158e` TASK-unified — placeholder scope; scope it to a real deliverable or close.

### New clusters (open issues)

- **Mesh/federation interconnect** — `6bf6ddc` peer-config, `e23054f` instance-state
  advertisement, `2e34de8` observability config, `7c8cf4b` liveness/readiness,
  `8f695c2` prometheus metrics, `d6d3793` nodeinfo/well-known, `271e08d` SPKI pin
  verification, `035958e` DEK re-wrap, `41f4f83` content-clearance gate. Suggested home:
  mesh/federation epic family; schedule after encrypted-sharing lands (in flight —
  see `open-inflight.md`).
- **VN sprite staging** — `e99e21e` mood/action-driven staging, `5cf8b16` center/face
  anchor, `ea6d881` alpha matting, `2fba05b` speaker highlight, `9da9517`
  multi-character ordering, `9cac2d4` per-chat roster. Suggested home: P2-A VN follow-ups.
- **RPG mechanics opt-in** — `e98ab7f` per-mechanic config, `f2b98e3` gate chat commands
  behind world opt-in, `f26f456` /check breakdown, `6629f0d` actor-resolved checks,
  `d5506a5` unify roll RNG, `c29e560` level-up flow, `a8442ec` pure ability checks,
  `83e9718` world ruleset templates, `4c37f99` timed conditions, `baf7d71`
  history-committing chats, `1dd08b9` ruleset enforcement. Suggested home: P6 waves;
  land opt-in gating first (safety-relevant).
- **Coverage waivers + frontend batches** — `be72331` sub-floor waiver, `b4789c2` raise
  below-floor modules, `78c179f` alpine admin/npc/settings clusters, `55f201f` VN
  pages/new-chat/quests/worlds. Suggested home: release-010 hardening.
- **Item-generation discoverability** — `0d771c9` subcommand docs, `0f840fd`
  describe-preview-confirm UI, `b95bbff` review parity, `219124a` shared draft store.
  Suggested home: P2-C assistant tooling.
- **Workflow/GM routing** — `7637627` persist run sessions, `83622b7` strip mention
  prefix, `f4fd21e` assistant-GM handoff, `becc58b` shadow-note steering, `30803ca`
  reuse WorkflowRunner. Suggested home: P2-C/P2-D.
- **NSFW consent-surface follow-ups** — `d7c0253` consent gate wiring, `e0d7c5c`
  seduction preconditions, `e8f7a75` /api/nsfw authz. Overlap with landed wiring —
  verify each still reproduces before scheduling.
- **Misc** — `89f26c8` demo-login e2e order dependence, `2d1a281` migration-parts never
  apply (pairs with `open-debt.md` migration hygiene), `9b837f9` RAG captcha resilience,
  `c667507` ticket-epic-link backfill, `c622d40` capability disclosure, `1bedeb1`
  assistant lorebook tools.

### Further steps (proposed order)

1. Triage the advisory orphans (link or close).
2. Verify NSFW follow-ups against landed wiring; close what is fixed.
3. Land mesh-sharing remainder, then schedule the interconnect batch.
4. Below-floor modules per waiver tickets; then frontend batches.
5. RPG opt-in gating before new mechanics.
6. Item-gen discoverability + workflow batches per P2-C/D capacity.
7. Human triage: 2FA/channel provisioning scheduling, A9 tag + push.
