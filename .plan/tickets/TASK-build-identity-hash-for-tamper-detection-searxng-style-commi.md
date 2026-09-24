<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Build identity hash for tamper detection (searxng-style commit-pin)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-federation-swarm-sync
**Tags:** federation, tamper-detection, build-hash, integrity

## Summary

Add a compound "build identity hash" — a SHA-256 fingerprint over the running server’s code (git HEAD, source-tree hash, lockfile hash, build manifest) — exposed via the instance-state endpoint and a public `/.well-known/loop-lore/build-id` document. Lets a peer verify that another instance is running unmodified upstream code before federating. Mirrors the searxng commit-pin approach: anyone can recompute the hash from a clean checkout + lockfile + env, and compare.

**Implementation spec:** [`docs/spec/federation-build-identity-hash.md`](../../docs/spec/federation-build-identity-hash.md) — hash composition, endpoint shapes, CI integration, CLI verify script, test plan.

## Summary

`TASK-instance-state-advertisement-endpoint` advertises software name + version, but the version string is a semver that can be edited at build time. There is no way for a peer to verify the *exact bytes* behind that version. A malicious instance can ship `loop-lore 1.2.3` while running patched code; today, peers cannot tell. This ticket closes that gap with a reproducible build hash.

## Context

- `epic-content-hashing-distributed-integrity.md` covers row-level content hashes (DB rows, request envelopes). It does NOT cover source/binary identity — the layer where a malicious server substitutes code.
- `src/routes/federation.ts` already exposes `/api/instance-state` and `/nodeinfo/2.1`; neither includes a build hash.
- SearXNG’s commit-pin (a SHA-256 over `git rev-parse HEAD` + a content manifest) is the reference design.
- Bun ships a single bundled artifact (`src/server/start.ts`); for development runs we hash the source tree, for built artifacts we hash the bundle + manifest.

## Direction

1. Compute the build hash at process start (or first hit of the build-id endpoint, then memoize):
   - `gitHead = exec("git rev-parse HEAD")` (dev runs).
   - `sourceTreeHash = sha256 over tar(source, excluding node_modules, .git, .tmp, dist)` — computed once at endpoint hit; cached on disk in `.tmp/build-id/source.sha256`.
   - `lockfileHash = sha256(package.json + bun.lock + bunfig.toml)`.
   - `manifestHash = sha256(BUILD_MANIFEST)` — a JSON of { bunVersion, platform, arch, buildProfile }.
   - Final: `buildHash = sha256(gitHead || sourceTreeHash || lockfileHash || manifestHash)`.
2. Expose two surfaces:
   - Public: `/.well-known/loop-lore/build-id` returns `{ buildHash, gitHead, builtAt }` — no secrets, no paths.
   - Private (admin): `/api/admin/build-id` returns the full breakdown including source-tree hash + manifest for verification tooling.
3. Include `buildHash` (or its first 16 hex chars) in the instance-state payload so peer gossip carries it without an extra fetch.
4. Provide a `bun run build:verify` script that recomputes the hash from a clean checkout and compares against the served value — used in the E2E suite and by sysadmins.
5. The endpoint is **always on** (not gated by federation opt-in) — tamper detection is a baseline server-self-integrity surface; if the operator wants it private they can put the server behind auth.

## Acceptance Criteria

- [ ] `buildHash` is deterministic across identical builds (same git HEAD, same source, same lockfile → same hash).
- [ ] `/.well-known/loop-lore/build-id` returns the public breakdown.
- [ ] `/api/admin/build-id` returns the full breakdown.
- [ ] Instance-state payload includes `buildHash` (truncated).
- [ ] `bun run build:verify` reproduces the hash from a clean checkout.
- [ ] Tests cover: deterministic hash, git-missing fallback, lockfile-edit changes hash, endpoint shapes.
- [ ] `bun run check` green.

## Dependencies

- `TASK-instance-state-advertisement-endpoint` (instance-state payload).
- `epic-content-hashing-distributed-integrity.md` (sibling epic — distinct layer).

## Out of Scope

- Row-level content hashes (`epic-content-hashing-distributed-integrity.md`).
- Signed builds / reproducible-build attestation (Sigstore, in-toto) — follow-up once this lands.
- Verifying a peer’s hash from a third-party attestation service (separate ticket; this ticket is "self-report + recompute").

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
