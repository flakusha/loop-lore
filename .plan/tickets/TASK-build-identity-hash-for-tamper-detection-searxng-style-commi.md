<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Build identity hash for tamper detection (searxng-style commit-pin)

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-federation-swarm-sync
**Tags:** federation, tamper-detection, build-hash, integrity

**Summary:** Add a compound "build identity hash" — a SHA-256 fingerprint over the running server's code (git HEAD, source-tree hash, lockfile hash, build manifest) — exposed via the instance-state endpoint and a public `/.well-known/loop-lore/build-id` document. Lets a peer verify that another instance is running unmodified upstream code before federating. Mirrors the searxng commit-pin approach: anyone can recompute the hash from a clean checkout + lockfile + env, and compare.

**Context:**

- `epic-content-hashing-distributed-integrity.md` covers row-level content hashes (DB rows, request envelopes). It does NOT cover source/binary identity — the layer where a malicious server substitutes code.
- `TASK-instance-state-advertisement-endpoint` advertises software name + version, but the version string is a semver that can be edited at build time. There is no way for a peer to verify the *exact bytes* behind that version. A malicious instance can ship `loop-lore 1.2.3` while running patched code; today, peers cannot tell. This ticket closes that gap with a reproducible build hash.
- `src/routes/federation.ts` already exposes `/api/instance-state` and `/nodeinfo/2.1`; neither includes a build hash.
- SearXNG's commit-pin (a SHA-256 over `git rev-parse HEAD` + a content manifest) is the reference design.
- Bun ships a single bundled artifact (`src/server/start.ts`); for development runs we hash the source tree, for built artifacts we hash the bundle + manifest.

## Direction

1. Compute the build hash lazily on first hit of the build-id endpoint, then memoize:
   - `gitHead = exec("git rev-parse HEAD")` (dev runs).
   - `sourceTreeHash = sha256 over tar(source, excluding node_modules, .git, .tmp, dist, worktree)`.
   - `lockfileHash = sha256(package.json + bun.lock + bunfig.toml)`.
   - `manifestHash = sha256(BUILD_MANIFEST)` — a JSON of { bunVersion, platform, arch, appName, appVersion, buildProfile }.
   - Final: `buildHash = sha256(gitHead || sourceTreeHash || lockfileHash || manifestHash)`.
   - `buildHashShort = buildHash.slice(0, 16)` for compact inclusion in instance-state.
2. Two surfaces:
   - Public: `/.well-known/loop-lore/build-id` returns `{ buildHash, buildHashShort, gitHead, builtAt }` — no secrets, no paths.
   - Private (admin): `/api/admin/build-id` returns the full breakdown including source-tree hash + lockfile hash + manifest + manifestHash, gated on `admin.system` capability via the canonical `requirePermission` middleware (denials emit audit log).
3. Include `buildHash` (truncated to 16 hex chars) in the instance-state payload so peer gossip carries it without an extra fetch.
4. `projectRoot` defaults to the module's resolved project root via `import.meta.url`, falling back to `process.cwd()`. This makes the buildHash stable regardless of the working directory the server was launched from.
5. Provide a `bun run build:verify` script that recomputes the hash from a clean checkout and compares against the served value — used in the E2E suite and by sysadmins.
6. Both endpoints are **always on** (not gated by federation opt-in) — tamper detection is a baseline server-self-integrity surface; if the operator wants it private they can put the server behind auth.

## Implementation

- `src/build/identity.ts` — `computeBuildIdentity({ projectRoot?, force? })` returns a full `BuildIdentity` breakdown with: buildHash, buildHashShort, gitHead, sourceTreeHash, lockfileHash, manifestHash, builtAt, manifest. Memoized per `projectRoot`; `__resetBuildIdentityForTests()` clears the cache.
- `src/routes/build-id.ts` — Elysia factory exporting both endpoints. Admin endpoint gated by `requirePermission("admin.system")`.
- `src/routes/federation.ts` — instance-state now includes `buildHash` truncated to 16 hex chars.
- `src/app/register-plugins.ts` — wires `buildIdRoutes()` into the public + admin route groups.
- `scripts/build-verify.ts` — CLI mode (`bun run build:verify`) prints the local hash; `--url ORIGIN` mode fetches a peer's `/.well-known/loop-lore/build-id` and compares.

**Acceptance Criteria:**

- [x] `buildHash` is deterministic across identical builds (same git HEAD, same source, same lockfile → same hash).
- [x] `/.well-known/loop-lore/build-id` returns the public breakdown (no secrets, no paths).
- [x] `/api/admin/build-id` returns the full breakdown (gated on admin.system via `requirePermission`, denials emit audit log).
- [x] Instance-state payload includes `buildHash` (truncated to 16 hex chars).
- [x] `bun run build:verify` reproduces the hash from a clean checkout, including from a non-default cwd.
- [x] Tests cover: deterministic hash, source sensitivity, lockfile-edit sensitivity, git-missing fallback, exclusion list, public endpoint shape, admin gating, instance-state integration, admin-denied-403. 14 dedicated unit tests + 1 federation integration test; full pass on `bun test src/build/identity.test.ts src/routes/federation.test.ts --isolate`.
- [x] `bun run typecheck` clean (no TS errors).
- [x] `bun run check:fast` clean (13/13 light gates pass).
- [ ] `bun run check` green on `dev` *(red on this branch due to pre-existing plan-hygiene debt: 299 phantom index entries + orphan refs in `feature-matrix.md` pointing at conceptual labels that have no corresponding ticket files — by-design aggregations, not stranded refs)*. Coverage gate is green for the new modules (identity.ts 100% line / 96% branch, build-id.ts 100% / 100%).

## Dependencies

- `TASK-instance-state-advertisement-endpoint` (instance-state payload).
- `epic-content-hashing-distributed-integrity.md` (sibling epic — distinct layer).

## Out of Scope

- Row-level content hashes (`epic-content-hashing-distributed-integrity.md`).
- Signed builds / reproducible-build attestation (Sigstore, in-toto) — follow-up once this lands.
- Verifying a peer's hash from a third-party attestation service (separate ticket; this ticket is "self-report + recompute").
