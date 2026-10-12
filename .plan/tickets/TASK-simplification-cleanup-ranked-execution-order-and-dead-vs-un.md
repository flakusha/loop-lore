<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Simplification cleanup ranked execution order and dead-vs-unwired decisions

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Tags:** dead-code

**Summary:**

Consolidated tracking ticket for the simplification-audit cleanup. It carries the **ranked execution
order** and the **DEAD vs UNWIRED** distinction that the per-area audit findings could not express, because
those findings lived only in `.tmp/simplification/` (gitignored, deleted by any cleanup) while the per-area
tickets pointed at them as their evidence base.

This ticket does **not** replace the per-area tickets below — it orders them and records which claims
survived adversarial re-derivation. Work still lands on the per-area tickets.

## Where the evidence lives now

The findings docs stay in `.tmp/simplification/` and are **scratch**: `platform.md`, `rpg.md`, `routes.md`,
`frontend.md`, `generation.md`, `characters-assets.md`, `baseline.md`, `verification.md`, plus
`targets.md` (the ranked list). They are deleted before merge per the `.tmp/` rule in AGENTS.md.

So do not treat them as durable. Every claim was re-derived with a command named in this ticket or in the
per-area ticket. **No count in this ticket or in any per-area ticket is authoritative** — recompute with
`bun run dead:code:src` (unused files) or `wc -l` (sizes) before cutting anything, per the no-volatile-metrics
rule in AGENTS.md.

## Claim reconciliation — what survived

Re-derived independently on `dev` after the follow-up audits. Full ledger in
the audit's ranked `targets.md` (scratch, not on disk); the two corrections that would actively mislead an implementer are
recorded inline in `platform.md`:

- **`src/transport/` dead-list** — reachability CONFIRMED (nothing imports the handler half), but the
  "low-risk delete" framing is REFUTED. `TASK-transport-layer-expansion` is **In Progress / "Built"** and
  `epic-transport-expansion.md` tracks `src/transport/{http1,h2,ws,negotiation,upgrade,compression,factory,index}.ts`
  as **✅ Built** deliverables. Five further epics name `src/transport/ws.ts` as a load-bearing dependency
  (`epic-embeddable-backend`, `epic-embeddable-engine-game-frontend`, `epic-game-frontend-scenes`,
  `epic-game-engine-sdks`, `epic-desktop-app`). Deleting the tree is therefore a **product decision that
  contradicts open planning**, not mechanical cleanup — same shape as the crypto cluster.
  Two live survivors must never be swept: `negotiation-parsers.ts` (`src/middleware/dynamic-response.ts:36`)
  and `peer-table.ts` (`src/federation/gossip.ts:20`).

- **`src/config/schema-class/` "safe standalone delete"** — REFUTED. The re-export shim layer is only
  *partly* mechanical. Measured on `dev`: of the section-level files, 19 are pure `../sections/*` re-exports
  but `federation.ts`, `frontend.ts`, `hooks.ts`, `idempotency.ts`, `observability.ts` and `seeding.ts`
  declare their own defaults (`seeding.ts` holds a literal `SEEDING_DEFAULTS`), and in `json-schema/`
  21 files are one-line `X = XMeta` aliases while `federation.ts`, `frontend.ts`, `hooks.ts`,
  `idempotency.ts`, `observability.ts`, `seeding.ts` and `templates.ts` carry real schema content.
  Deleting the directory wholesale destroys live schema. Fold only the true re-exports into `index.ts`.
  Re-derive the split with the `grep -L 'from "../sections/'` / `grep -L '= \w*Meta;$'` probes above
  rather than trusting any file count.

- **`src/rpg/integration-registry/`** — CONFIRMED dead; only non-import references are a prose comment and a
  coverage-baseline index list.

- **Locale `harness.*`** — CONFIRMED excluded from any orphan-key deletion; bidirectional parity test.
- **Crypto keep-list** — the original claim was WRONG and is CORRECTED in `platform.md`. Only
  `server-registry.ts` is production-live. `key-pairs.ts` / `ratchet.ts` are imported only by
  `src/frontend/e2e/**`, which is itself unwired and unbundled, so they are not production-live; and
  `TASK-e2ee-double-ratchet` is OPEN, making the cluster contested future work rather than settled dead code.

- **`src/config/schema/`** — CORRECTED. The claim that `sections/` is unconditionally the single source of
  truth is only true for the ALIAS files: `sections/**` imports concrete interfaces back **out** of
  `schema/**`. The layer must be inverted, then deleted — not deleted outright.

- **"src/ knip blind spot"** — WITHDRAWN; it never existed as described.
- **"67 fuzz modules reachable only from generated tests"** — REFUTED; exactly one generated fuzz test exists.
- **`bun run plan:validate` fails** — REFUTED as stale; the gate passes. Run it rather than trusting the
  recorded failure.

## DEAD vs UNWIRED — the distinction that matters

- **DEAD** — unreachable from every production root **and** no test depends on it. Delete.
- **UNWIRED** — complete, tested, coherent, but nothing in production reaches it. **A product decision:**
  wire it or kill it. Deleting unwired code that an open ticket asks for destroys work-in-progress; keeping
  it costs maintenance and misleads readers about what the product does.

Ranked DEAD targets, highest risk-adjusted value first:

1. `src/rpg/integration-registry/` — delete (low)
2. `src/regex/index.ts` + its exclusive modules — delete (low-med)
3. `src/transport/` protocol-handler half, minus the two live survivors — CONTESTED, not low-risk.
   See the transport correction under Claim reconciliation before touching it.
4. Dead `src/rpg/` and `src/regex/` re-export barrels, incl. root `src/rpg/index.ts` — delete (low)
5. `src/rpg/reputation.ts` + `src/rpg/chemistry.ts` — delete (low)
6. `src/crypto/activitypub-keys.ts` — delete (low)
7. Test-only-but-production-unreachable service/util modules — delete (low)
8. Dead route/validation modules and helpers, incl. 7 unreferenced `characters/errors.ts` classes — delete (low).
   Ownership note: the three zero-importer types (`PaginatedResponse<T>`, `RouteHandler`,
   `DeprecationHeadersOptions`) are scoped by `TASK-shrink-unreferenced-types-and-helpers-in-routes-validation`,
   NOT by the routes deletion ticket; `withUserAuth` and `getHttpStatusFromErrorCode` are `shrink:` items in
   `TASK-simplification-sweep-micro-cleanups-and-single-implementatio`. Do not double-scope them.
9. Dead `src/i18n/index.ts` + `src/config/sections/index.ts` barrels — delete (low)
10. Four dead `src/frontend/alpine/` modules (`chat-movement`, `keynav-help`, `locale-picker`,
    `mobile-composer`) — delete (low). The same-named HTML partials are separate, live markup — keep those.

11. Go-era `src/views/partials/` templates, orphan `load-more.html`, dead CSS blocks — delete (low)
12. Orphaned locale keys across all locale files — delete (med); one commit across every locale file, and
    leave `harness.*` alone

13. Unreferenced generation/story/assistant/chat code — delete (low)

UNWIRED targets, each needing a named owner before any code moves:

- `src/crypto/e2e/` DH-ratchet + E2E-session cluster — owner: epic-`crypto` jointly with
  `TASK-e2ee-double-ratchet`. If it stays unwired the repo reads as "E2E is implemented" to anyone auditing
  the crypto surface, and the code looks like progress on a ticket nobody is scheduling.

- `src/frontend/e2e/**` — owner: frontend/e2e. Its roundtrip test passes against code no browser session can
  reach, reading as E2E coverage that does not exist.

- `config.transport` write-only keys — owner: platform. Operators can set protocol flags and see them
  serialized back with no effect.

- `src/config/schema/` mirror — owner: platform. **Invert then delete**, in two revertable steps.
- `src/config/schema-class/` shims — owner: platform. Only the **true re-exports** fold into `index.ts`;
  `seeding.ts`, `frontend.ts`, `hooks.ts`, `federation.ts`, `idempotency.ts`, `observability.ts` and
  `templates.ts` carry real defaults/schema and must survive. See the refutation above.

- `src/transport/` protocol-handler half — owner: platform, jointly with `epic-transport-expansion` and
  `TASK-transport-layer-expansion` (In Progress). If it stays unwired the repo advertises an HTTP/2 +
  WebSocket + negotiation stack that no request ever traverses, and `epic-transport-expansion.md` will
  keep reporting those handlers as shipped. Either wire it behind `Bun.serve`, or close the epic before
  deleting — not both half-done.
- `src/assistant/prompt/sections/nsfw-context.ts` — owner: assistant/NSFW. The absence may itself be the bug.
- `src/plugins/bundles.ts` character requirements — owner: plugins. Declared-but-unenforced; the frontend
  keeps a drifting literal copy.

- `src/generation/image-edit-service/**` vs `src/image-edit/**` — owner: image-edit. Two parallel
  implementations, neither obviously live.

- Obsolete pre-`alpine-init` frontend roots (`app.ts`, `vendor.ts`, `touch.ts`) — delete, but confirm no
  `<script src=...>` template reference first; that is the one evidence class the scan does not cover.

## Sequencing

Each wave is independently revertable and each wave's gates can run without waiting on the next. Do not
start a wave until the previous one has merged and `bun run check` is green on `dev`.

- **Wave 1 — free deletions, zero decisions.** DEAD 1–2 and 4–13 (skip DEAD 3, the contested transport tree)
  plus the dead config emitters. One commit per subsystem so a bad revert touches one area. The
  `schema-class` shims are NOT in this wave — they are an UNWIRED owner decision (only the true
  re-exports are mechanical, and picking which files is the decision).

- **Wave 2 — template/locale/CSS.** DEAD 10–12. The locale cut must be one commit touching every locale
  file; a partial commit fails the `harness.*` parity test.

- **Wave 3 — the config layer.** The `schema/` invert-then-delete, the write-only keys, the dead emitters.
  Step (a) move the interfaces and repoint `sections → schema`; step (b) delete the mirror and repoint the
  `Config` importers via a path-preserving re-export. Step (a) is behaviour-neutral and revertable alone.

- **Wave 4 — image probing + shrink sweep.** Behaviour-preserving; run last so the noise floor is low.
- **Wave 5 — owner decisions.** The UNWIRED list. The crypto and frontend-e2e decisions are coupled —
  settle them once. `epic-transport-expansion` is a third coupled decision: it gates DEAD 3.

Cross-cutting, any time: flip `dead - code (src files)` from advisory to blocking once the enumerated files
are actually gone, so the backlog cannot silently regrow.

## Per-area tickets this orders

`TASK-delete-dead-rpg-regex-battle-plugins-subtrees-and-shim-barre` ·
`TASK-delete-dead-src-transport-protocol-handler-tree-and-write-on` ·
`TASK-delete-duplicate-config-schema-shim-layers-dead-config-emitt` ·
`TASK-delete-orphaned-locale-keys-across-all-10-locale-files-leave` ·
`TASK-delete-unreachable-view-partials-orphan-partial-and-dead-css` ·
`TASK-delete-unreferenced-generation-story-assistant-and-chat-code` ·
`TASK-delete-unreferenced-platform-service-util-modules-dead-barre` ·
`TASK-delete-unreferenced-route-validation-modules-dead-helpers-an` ·
`TASK-delete-unwired-dh-ratchet-e2e-subtree-in-src-crypto-e2e-and-` ·
`TASK-replace-hand-rolled-image-header-probing-in-src-assets-with-` ·
`TASK-shrink-unreferenced-types-and-helpers-in-routes-validation` ·
`TASK-simplification-sweep-micro-cleanups-and-single-implementatio` ·
`TASK-triage-knip-src-findings`

Also filed by the same audit and landing in the same territory: `BUG-kysely-any-type-safety-gaps-in-db-layer`,
`BUG-notification-sse-tick-swallows-errors-silently`, `TASK-unify-safe-json-import-convention`,
`TASK-services-actor-items-ts-vs-services-actor-items-name-collisi`.

## Acceptance Criteria

- [ ] The DEAD targets are deleted, in wave order, each with its coverage-baseline entries removed in the
      same change.

- [ ] Every UNWIRED target has a recorded owner decision (wire or kill) on both this ticket and the
      per-area ticket — no silent drift.

- [ ] `dead - code (src files)` is flipped to blocking, or an explicit decision not to.
- [ ] `bun run plan:validate` is green and `bun run check` passes on `dev`.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
