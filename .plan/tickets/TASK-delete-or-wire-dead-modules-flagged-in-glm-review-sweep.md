<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Delete or wire dead modules flagged in the GLM review sweep

**Summary:** None
**Context:** `bun run dead:code:src` (knip `--no-gitignore --include files`) reported 66 unreferenced `src/` modules. 57 `src/` modules deleted across the branch (54 in `9f695c00b` plus 3 in the earlier sweep commits `71dd11b74` / `71e9782c8` / `a96cc0e17` — matches `git diff --name-status dev...HEAD -- src | grep -c '^D'` = 57), plus one dead export removed from a live file; 2 were real wiring bugs and are wired; 2 are genuine knip false positives and are gaged; 8 are unwired-but-owned by another workstream/epic and are recorded in `knip.json` with the owning ticket named. The gate now exits 0 and has been flipped from advisory to blocking.
**Acceptance Criteria:** None
**Status:** In Progress
**Status Note:** [2026-10-29 review-residue verification] The `knip.json` rationale is corrected: it now states that `src/frontend/alpine/mobile-composer.ts` is NOT wired — no partial includes `src/components/chat/mobile-composer.html` and `mobileComposer` is never published on `globalThis`, so including that partial today throws `ReferenceError` — and names `WIRE-frontend-mobile-sticky-bottom-composer` (git issue `5aea351`) as the owner of the wiring work, which is NOT this ticket's scope. (The false "already has a live HTML partial binding" wording was already dropped from `knip.json` by `967748eb2`; this pass completes the rationale.) Scope re-verified against dev: the 57 swept `src/` deletions are all gone from dev (0 of 57 paths still present), the 2 real wiring bugs are wired (`config:generate-domain-schemas` and `smoke:app` in `package.json:131,133`), and the 2 false positives are gaged (`src/build/copy-icons.ts`, `src/build/compress.ts` in the `knip.json` `ignore` list). Still missing for this ticket: of the 8 skipped modules only 6 are still in `knip.json` — `src/frontend/alpine/chat-creation/variants.ts` was deleted and `src/frontend/alpine/keynav-help.ts` was wired by a11y-keynav-phase3, both outside this ticket — and 3 of the remaining records name no owning ticket: `src/assistant/prompt/sections/nsfw-context.ts` (attributed to the `wire-deadcode` worktree) and the contested pair `src/transport/index.ts` + `src/transport/test/harness.ts` (attributed to `epic-transport-expansion.md`). Naming an owning ticket for those three is what is left. Git issue `a7dbf02` stays open, matching this `In Progress` status.
**Priority:** Medium
**Effort:** Medium

## Context

`knip.json` `project` covers `src/**/*.ts`, but `src/.gitignore` is a blanket `.`, so a gitignore-respecting knip run resolves zero src files. `bun run dead:code:src` runs `knip --no-gitignore --include files` to lift that layer and report unused *modules* (not unused exports — that bulk sweep has its own ticket).

The sweep started from 66 unused files. The earlier session's list was stale: some of those files had already been deleted on this branch, so knip was re-run against the live tree before every decision.

### Decision table

**DELETED — genuinely dead (no importer anywhere in src/, scripts/, tests/, plugins/):**

| Group | Files |
|---|---|
| Empty barrels (zero inbound imports; the service modules they re-exported stay live) | `src/{admin,auth,autonomy,characters/exporters,characters/normalizers,cron/dag,generation/lora,generation/tools,i18n,image-edit,image-edit/providers,inference,regex,rpg,rpg/blog,rpg/body-systems,rpg/location-nsfw,rpg/seduction,turning,users,worlds}/index.ts`, `src/characters/index.ts`, `src/frontend/vn/templates/index.ts` |
| RPG sub-service barrels whose members were themselves unreferenced | `src/rpg/{encounters,fantasies,intimacy,seduction}/index.ts` and `src/rpg/{encounters,fantasies,intimacy,mood,nsfw-skills,quests,seduction}.ts` |
| Personality-service leaf modules (only re-exported by `personality-service/index.ts`, also deleted) | `src/characters/services/personality-service/{index,integrity,modifiers,resolve}.ts` |
| Other dead service modules | `src/characters/services/{relationships,skills,traits}-service-bridge.ts`, `src/users/capabilities.ts` |
| Autonomy cluster — `autonomy` is not in the root `Config` interface, so the whole subtree has no reader | `src/config/{schema-class,schema-class/json-schema,schema}/autonomy.ts`, `src/config/sections/autonomy.ts` |
| Image-edit command parser cluster (nothing consumes the parsed commands) | `src/generation/image-edit-commands/{index,parser,templates,types}.ts` |
| Frontend Alpine modules with no partial and no owner ticket | `src/frontend/alpine/{chat-movement,locale-picker,transports/server}.ts` |
| One-shot config migration tool whose callers are gone; never added to `scripts` (unlike the four sibling generators, which are) | `src/config/migrate-config.ts` |
| Pure re-export shim of a live module | `src/story/turn-strategies.ts` |
| Unmounted route module | `src/routes/rpg/handler.ts` |
| Unused generation state store | `src/routes/generation/comparison-store.ts` |
| Unregistered prompt section (absent from the prompt registry) | `src/assistant/prompt/sections/character-traits.ts` |

Additionally `src/chat/folders.ts` keeps its live `formatFolderTree` export but loses the never-imported `writeFolderSource` hatch.

`src/config/sections/{capabilities,compatibility}.ts` were also on the knip list but are already gone on dev — not part of this sweep.

**WIRED — implemented but never called, a real gap:**

| File | Fix |
|---|---|
| `src/config/generate-domain-schemas.ts` | Its output `schemas/config/*.schema.json` is committed and documented in `docs/spec/config-file-separation.md`; the four sibling generators (`generate-schema`, `-toml-schema`, `-env-schema`, `-character-schema`) all have package.json scripts. This one alone was missing → added `config:generate-domain-schemas`. |
| `src/scripts/smoke-app.ts` | `docs/giwt-scripts-map.md` documents it as a retained hand-run smoke CLI; two BUG tickets reference `bun run smoke-app`. Added `smoke:app`. |

**FALSE POSITIVE — gaged in `knip.json` `ignore` with a reason comment:**

| File | Why knip can't see it |
|---|---|
| `src/build/copy-icons.ts`, `src/build/compress.ts` | Spawned as shell strings inside a Bun `$` template by `scripts/build-frontend.mjs`; knip cannot follow a subprocess invocation. |

**SKIPPED — unwired but owned elsewhere, recorded in `knip.json` `ignore` with the owner named (not deleted):**

| File | Owner |
|---|---|
| `src/assistant/prompt/sections/nsfw-context.ts`, `src/frontend/alpine/chat-creation/variants.ts` | `wire-deadcode` worktree — actively wiring these |
| `src/crypto/activitypub-keys.ts` | Prerequisite for `FEAT-activitypub-federation`; `BUG-activitypub-actor-keys-table-and-src-crypto-activitypub-keys` says keep until the table lands |
| `src/frontend/touch.ts` | `WIRE-frontend-touch-swipe-gestures` (Not Started) |
| `src/frontend/alpine/keynav-help.ts`, `src/frontend/alpine/mobile-composer.ts` | `WIRE-frontend-keyboard-help-overlay`, `WIRE-frontend-mobile-sticky-bottom-composer`. These modules are NOT wired: `src/frontend/alpine/mobile-composer.ts` only exports `mobileComposer()` and is never published on `globalThis`, and there is no include site for `src/components/chat/mobile-composer.html` — including that partial today throws `ReferenceError` (the only Alpine component published on `globalThis` is `globalThis.chatState`, `src/frontend/alpine/chat/index.ts:29`). The wiring work (include the partial + publish the component) is tracked by `WIRE-frontend-mobile-sticky-bottom-composer`; this ticket only owns the `knip.json:156-158` rationale, which must say the module is unwired rather than claiming a live `x-data="mobileComposer()"` binding. |
| `src/transport/index.ts`, `src/transport/test/harness.ts` | Contested — `epic-transport-expansion.md` lists both as Built deliverables |

### Test impact

**No test file was deleted by this sweep** — verified: `git diff --name-status dev -- '*.test.ts'` shows no `D` rows on this branch. The modules removed here never had tests in the first place.

- `src/routes/rpg/handler.test.ts` was never tracked on any branch (`git log --all --diff-filter=A` returns nothing); the unmounted handler shipped untested.
- `src/chat/folders.ts` keeps its full live surface (`resetOrganizationStores`, `createFolder`, `listFolders`, `tagChat`, `untagChat`, `listChatTags`) and `src/chat/folders.test.ts` is unmodified — its two describe blocks (`createFolder`, `tagChat / untagChat`) cover exports that still exist.

The dead `writeFolderSource` export had no test to remove. `src/characters/services/personality-service/utility-scorer.ts` survives its siblings' deletion: it is imported by the live `src/services/agency/quality-metrics.ts`, and `utility-scorer.test.ts` still covers it.

## Acceptance Criteria

- [x] knip re-run against the live tree; every remaining finding triaged DELETE / WIRE / FP / owned-elsewhere
- [x] `knip.json:156-158` rationale corrected: it must state that `src/frontend/alpine/mobile-composer.ts` is NOT wired (no include site for `src/components/chat/mobile-composer.html`, `mobileComposer` never published on `globalThis`) and name `WIRE-frontend-mobile-sticky-bottom-composer` as the owner of the wiring work. The claim that it "already has a live HTML partial binding `x-data=\"mobileComposer()\"`" must be removed.
- [x] `bun run dead:code:src` exits 0 (was exit 1 with 66 unused files)
- [x] `dead - code (src files)` flipped from `ADVISORY_GATES` to blocking in `scripts/check/parallel/gate-table.mjs`; the flip condition the table documented is now met
- [x] `scripts/check/test-gaps-baseline.json` pruned: 25 baseline rows dropped, each naming a file this sweep deleted; no row remains for a nonexistent file
- [x] No test coverage left pointing at deleted code
- [x] Sibling branches (`wire-deadcode`, `options-object-params-return-type-exemption`) not collided with
- [x] Documentation updated

### Stale references closed after deletion

A post-sweep audit found documentation still pointing at deleted modules. None were runtime imports, so nothing was broken — the comments and examples just named dead paths:

- `src/autonomy/governor/README.md` and `src/autonomy/scheduler/README.md` imported from `"../autonomy"`, the deleted `src/autonomy/index.ts` barrel. Both classes are still live (`AutonomyGovernor` from `governor/index.ts:55`, `AutonomyScheduler` from `scheduler/index.ts:47`), so the examples were repointed at `"./index"` rather than deleted. That matches how live code already imports them (`src/autonomy/dispatch/bdi-dispatch.ts:32`, `src/cron/jobs.ts:183`).
- `src/regex/image-edit.ts` carried a comment crediting extraction from `image-edit-commands.ts`. The whole `src/generation/image-edit-commands/` tree is gone, so naming it kept a dead path alive; the comment now states what the module is instead of where it came from.

### Deletion count — reconciled against an audit reporting 56

An independent audit counted 56 deleted files; the ticket says 57. **57 is correct**, and stable across every command variant tried:

| Command | Result |
|---|---|
| `git diff --name-status dev...HEAD -- src \| grep -c '^D'` | 57 |
| `git diff --name-status dev...HEAD \| grep -c '^D'` (all paths, not just src) | 57 |
| `git diff --name-only --diff-filter=D dev...HEAD -- src \| wc -l` | 57 |
| `git diff --name-status "$(git merge-base HEAD dev)" HEAD -- src \| grep -c '^D'` | 57 |
| `git diff --name-status dev..HEAD -- src \| grep -c '^D'` (two-dot) | 59 |

57 = 54 deleted in `9f695c00b` + 3 in the earlier sweep commits (`71dd11b74`, `71e9782c8`, `a96cc0e17`). Ruled out as causes of an off-by-one: no file in the 57 is also deleted by dev (that would double-count), and the count reads 57 at every commit from `9f695c00b` onward, so it is not a stale-snapshot artifact. Note the two-dot form gives **59**, not 56 — it additionally counts two `hashed-assets` files that dev added and this branch predates. A 56 appears to have dropped one entry from the list rather than used a different filter; the full 57-path enumeration is `git diff --name-status dev...HEAD -- src | grep '^D' | cut -f2`.

### Doc import paths — one more, and a proposal (not built)

`src/rpg/npc-navigation/tick-driver/README.md:26` also imported from a nonexistent path (`"../rpg/npc-navigation"`). `runNpcMovementTick` is real and live (`npc-navigation/tick-driver.ts:104`, imported by `autonomy/scheduler/targets.ts:17`), so the example now reads `"./tick-driver"`, matching the live importer.

Proposal, offered rather than enforced — the HTTP API surface is already generated (`@elysia/openapi` -> spec -> `docs/reference/api.md`) and reconciled by the blocking `api - doc drift` gate. **Module READMEs have no equivalent.** Measured after this sweep's fixes: 8 markdown files carry relative `from "..."` examples; 1 of those (the tick-driver README, now fixed) pointed at a path that does not resolve. `scripts/check-md-links.ts` explicitly strips fenced code blocks (line 91), so it cannot catch this class by design.

Option A — extend `check-md-links.ts` to resolve relative `from "..."` specifiers inside fenced ts blocks in `src/**/*.md` only, and skip `docs/spec/**` (those are illustrative pseudo-paths — 11 of the 12 unresolved examples live there and are written as design sketches, not copy-pasteable code). That keeps the check honest instead of red on day one. Roughly 30 lines, rides the existing gate.

Option B — generate the import line. Not recommended: the examples are usage sketches whose value is the call shape, and a generator would emit imports nobody wrote.

Prerequisite for A: none — it needs no doc comments, only path resolution, so it will not yield hollow output. The larger prerequisite applies to generated *API* docs, which this repo already has and does not need.

## Follow-ups found while verifying the wirings

Both wired scripts were executed, not just added:

- **`config:generate-domain-schemas` dirties the tree.** It exits 0 but rewrites 14 files in `schemas/` (+252/-164): the committed output is stale relative to the source schema modules (`$schema` http→https, plus `jwtSecret` / `csrfSecret` and other fields that exist in config but not in the committed JSON). The sibling `config:generate-schema` is fresh, so this is a one-off, not a repo convention. Nothing in `scripts/check/` asserts freshness for these. **Decision needed: regenerate and commit the schemas, or leave the generator unwired.** Wiring a script whose output does not match what is committed hands the next runner a permanent diff. Not fixed here — regenerating 14 committed schema files is a product-schema change, not a dead-code change.
- **`smoke:app` exits 1 without a configured environment** (`NSFW_FLAG_REPORTER_HASH_SECRET ... is required in production`, from `src/config/load/pii-safety.ts:59`). Expected for a one-shot smoke run against a real config; `configs/*.example.toml` provide the template. Not a defect, recorded so the exit status is not mistaken for a broken wire.

## Verification

Run from `tree/deadcode-delete`:

| Command | Result |
|---|---|
| `bun run dead:code:src` | exit 0 |
| `bun run typecheck` | exit 0 |
| `bun run typecheck:bun` | exit 0 |
| `bun run typecheck:frontend` | exit 0 |
| `bun run lint:eslint` | exit 0 |
| `bun run test:unit` | exit 0 |

`bun run test:gaps` fails with 7 new gaps (seed/identity, template-expansion/run, content/hash-injection). **Pre-existing and unrelated**: reproduced identically on a pristine stash of this branch's HEAD before any change, and fixed on dev by `4e00315be test: close coverage gaps for seed-identity and template-expansion`. None of those three source files are touched by this branch.
