<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Open — Untriaged Tickets & Issues (2026-09-11 — chat-epic filings + Sep-10 re-triage)

> **Purpose:** landing zone for git issues that exist but have no index entry / epic
> linkage yet (advisory orphans reported by `bun run plan:sync`; recompute the
> current set at triage time rather than trusting a captured count).
> Triage = link each issue to its epic/ticket (then `plan:sync --fix`), close as dup,
> or promote into a priority tier.

## Security-hardening wave (2026-08-25 review — see `security-review-2026-08-25.md`)

| Git issue | Topic | Suggested home |
| --------- | ----- | -------------- |
| `5842782` TASK-logging-hardening-minors-injection-rotation-races-sink-path | Logger injection/rotation races | logger hardening cluster (P6 candidate) |
| `a06b99e` BUG-telemetry-stores-raw-client-body-real-user-chat-session-ids | Telemetry PII (raw bodies, session ids) | `security-review-2026-08-25.md` + privacy hardening |
| `b23b7fb` BUG-logger-censor-depth-cutoff-returns-subtree-untouched-nested | Censor depth cutoff bug | same cluster as logging hardening |
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

### Chat Variants Taxonomy + Chat Product Features wave (filed 2026-09-11 — **NEW**)

Two new epics with 27 tickets filed together on 2026-09-11 awaiting triage. Tickets live on disk; epic spec + ticket files are linked but no git issues exist yet (and `plan:sync` is not required — these are intentional new filings, not orphans). Both cluster tables are already surfaced in `priority-p3-p5.md`:

- **`epic-chat-variants-taxonomy.md`** — taxonomy-only epic, 12 variants, **no schema migration**. Maps `(chat_type, chat_mode, chat_purpose)` onto existing columns (`max_turns`, `auto_advance`, `gm_config`, `talkativity`, `prompt_override`). Authority for "chat admin" = global admin OR creator OR owning gm. Status: 🟡 Design — taxonomy agreed; column mapping established; per-variant implementation open.
  - 12 variant tickets: `TASK-chat-variant-{assistant,assistant-group,user-1x1,user-group,user-group-admin,llm-only,llm-only-group,llm-only-group-gm,character,character-group,rpg,rpg-group}.md`
  - **Suggested home:** `priority-p3-p5.md` Chat Variants Taxonomy cluster (already inserted 2026-09-11). Schedule cross-cutting (frontend variant picker, payload validator, legacy backfill) once any single variant ships.
- **`epic-chat-product-features.md`** — cross-cutting product feature coverage, 15 tickets. Status: 🟡 Not Started.
  - **P0-P2 promoted** (already inserted into `priority-p0-p2.md` 2026-09-11): `TASK-chat-feature-encryption-key-rotation.md` (app-critical — broken encryption blocks all private chats) and `TASK-chat-feature-ownership-transfer.md` (user-flagged new requirement).
  - **P3-P5 remainder** (already in `priority-p3-p5.md` Chat Product Features cluster): component-buttons (Medium), notes-shadow-carriage (Low), context-memory-events (Medium), turn-talkativity-skip (Medium), moderation (High), location-transition-transfer (Medium), archive-deletion-search (Low), introduction-generation-propagation (High), entry-field-pre-send (Low), rpg-rule-system (Low), settings-templates-compat-matrix (Medium), rpg-location-uniqueness (Low, RPG-gated), rpg-chronological-navigation (Low, RPG-gated).
  - **Suggested home:** `priority-p3-p5.md` Chat Product Features cluster + `priority-p0-p2.md` P0 table for encryption/ownership. Schedule order: encryption-key-rotation → ownership-transfer → moderation → introduction-generation → remaining in epic's published effort ranking.

**Triage status (2026-09-11):** all 27 tickets filed with realistic `src/` paths, acceptance criteria, related tickets. **Triage pending** — link to git issues when created, then `plan:sync --fix` to backfill the index.

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
  seduction preconditions, `e8f7a75` /api/nsfw authz. **CLOSED 2026-09-09** — all three
  resolved by the `nsfw-consent-gate-wiring` commit set; ticket statuses are Done and git
  issues closed. No remaining open work.
- **Misc** — `89f26c8` demo-login e2e order dependence, `2d1a281` migration-parts never
  apply (pairs with `open-debt.md` migration hygiene), `9b837f9` RAG captcha resilience,
  `c667507` ticket-epic-link backfill, `c622d40` capability disclosure, `1bedeb1`
  assistant lorebook tools.

### Further steps (proposed order)

1. Triage the remaining advisory orphans (link or close).
2. Schedule the mesh/federation interconnect batch (content-sharing landed).
3. Below-floor modules per waiver tickets; then frontend batches.
4. RPG opt-in gating before new mechanics.
5. Item-gen discoverability + workflow batches per P2-C/D capacity.
6. Human triage: 2FA/channel provisioning scheduling, A9 tag + push.

---

## 2026-09-25 epic linkage review

This review covers the open/in-progress entries in the current advisory queue, not
completed historical tickets. The queue is intentionally not bulk-linked: a
missing `Epic` field is a bookkeeping defect only when the ticket has one clear
owner; cross-cutting and blocked work should keep its dependency visible.

### High-confidence attachments applied

| Git issue | Ticket | Epic | Basis |
| --- | --- | --- | --- |
| `1bedeb1` | `TASK-assistant-lorebook-tools` | `epic-assistant-entity-access` | Assistant read/write operations on world and actor lore; the ticket names the same feature area. |
| `c622d40` | `TASK-capability-disclosure-lore-ceiling` | `epic-lore-knowledge` | The ticket explicitly binds lore disclosure tiers to the lore knowledge system. |
| `eafe79f` | `TASK-regex-pipeline-hardening-sweep-input-caps-lastindex-hazards-` | `epic-code-quality` | Shared regex performance/state hazards are code-quality hardening; security follow-up remains explicit in the ticket. |

### Source already declares an epic; index advisory remains

These files already carry an `**Epic:**` field, so they need index-regeneration
follow-up rather than another editorial change:

- `78c179f` and `55f201f` → `epic-testing-qa`
- `0d771c9`, `0f840fd`, and `b95bbff` → `epic-entity-generation-workflows`
- `219124a` → `epic-conversation-branching`
- `be72331` and `b4789c2` → `epic-testing-qa`

The current `plan:sync:fix` pass updates status links but does not backfill these
body-level fields into `tickets/index.json`; do not hand-edit the generated index.

### Existing epic homes; no new epic needed

- The RPG opt-in cluster (`e98ab7f`, `f2b98e3`, `f26f456`, `6629f0d`,
  `d5506a5`, `c29e560`, `a8442ec`, `83e9718`, `4c37f99`, `baf7d71`,
  `1dd08b9`) belongs under existing `epic-mechanics-governance.md`, with the
  parent `epic-rpg-mechanics.md`; do not create `epic-rpg-mechanics-governance.md`.
- Workflow/GM routing (`7637627`, `83622b7`, `f4fd21e`, `becc58b`, `30803ca`)
  belongs to existing `epic-workflow-engine.md` plus `epic-assistant-gm-flows.md`.
  The workflow engine already owns runner/session persistence; GM handoff and
  shadow-note steering stay with the assistant/GM epic.
- The mesh/federation interconnect entries already have explicit homes:
  `epic-federation-swarm-sync.md` for fediverse/swarm plumbing,
  `epic-mesh-federation-content-sharing.md` for encrypted sharing/quota, and
  `epic-certificate-and-tls-management.md` for peer TLS pinning. No duplicate
  epic is justified.
- `81b59cf` is a member of `epic-federation-swarm-sync.md`, but the epic marks
  G17 blocked by G15 (flat blog comments). Leave it unlinked until G15 closes;
  this is a dependency hold, not an epic gap.

### Hold or close

- `e12566a` — reproduce before linking; the backlog says the table backend is
  now the default, so close if the defect no longer exists.
- `dd6158e` — close the placeholder-scope ticket; it is not an initiative.
- `c667507` — keep unlinked as one-off bookkeeping, then close after the
  backfill/index cleanup is complete.

### Remaining legacy unbound sweep

The remaining unbound history spans old completed work and live items whose
index metadata is stale. Do not apply a keyword-only bulk link. Triage by domain:

- auth/security → `epic-auth-access`, `epic-security-sandboxing`, `epic-crypto`,
  `epic-api-validation-guardrails`;
- chat/assistant/workflow → `epic-chat-product-features`,
  `epic-chat-context-optimization`, `epic-assistant-gm-flows`,
  `epic-assistant-entity-access`, `epic-workflow-engine`;
- RPG → `epic-rpg-mechanics`, `epic-mechanics-governance`,
  `epic-rpg-progression`, `epic-battle-action-systems`;
- frontend/QA → `epic-frontend-component-architecture`,
  `epic-frontend-backend-integration`, `epic-frontend-admin`,
  `epic-testing-qa`;
- media/assets → `epic-assets-media-pipeline`, `epic-frontend-gallery`,
  `epic-video-generation`, `epic-ambient-music-sfx`;
- RAG/providers → `epic-rag-document-processing`, `epic-rag-ingestion`,
  `epic-rag-retrieval`, `epic-rag-context-sources`,
  `epic-provider-plugin-ecosystem`;
- plan/tooling → `epic-code-quality`, `epic-testing-qa`,
  `epic-unified-spec-framework`.

### Next triage order

1. Close or reproduce `e12566a` and `dd6158e`; do not attach them speculatively.
2. Regenerate/verify the index from ticket metadata without overwriting its
   generated shape.
3. Sweep the remaining unbound open items by domain, attaching only where the
   ticket scope names one existing epic.
4. Create a new epic only when a cluster has repeated tickets, one owner, and no
   existing epic boundary; the current review found no such missing initiative.
