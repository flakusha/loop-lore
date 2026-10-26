<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Remote actor discovery (WebFinger resolve, host-meta) absent

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-federation-swarm-sync

## Summary

FEAT-activitypub-federation AC covers only local WebFinger resolvable actors (@world@host); it does not specify resolving remote actors (@remote@host), host-meta, or actor fetch needed for inbound follows. Gap. Fix: add remote-discovery AC using WebFinger and actor document fetch.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 550802a (registry tip: 81ef919d9 Konstantin Fedotov Close issue)

**Status Note:** [2026-10-26 final pass] The defect was verified as ABSENCE, not a broken branch: before this pass `src/routes/federation.ts` published only `/.well-known/nodeinfo` (`:109`), `/nodeinfo/2.1` (`:130`) and `/api/instance-state` (`:155`), and a repo-wide grep for `host-meta`/`webfinger` matched docs only (no code), so this server advertised no WebFinger surface and nothing existed to turn `@alice@remote.example` into an actor document for an inbound follow. Both directions the ticket names are now implemented, with "tolerate an absent host-meta" as the required resolution behaviour: `src/federation/remote-actor.ts:115` `discoverWebFingerEndpoint` treats host-meta as a hint (fetch failure, 404, HTML, or no `lrdd` link → RFC 7033 default template, `src/federation/webfinger.ts:148` `extractLrddTemplate`), and `src/federation/remote-actor.ts:141` `resolveRemoteActor` follows JRD → actor document through `safeFetch` (bounded body/timeout, redirects refused) with `validateFetchUrl` SSRF checks on every hop — including the peer-controlled `lrdd` template it produced — plus an HTTPS-only gate on every hop (`:229`), returning a typed reason instead of throwing; actor-document narrowing (`src/federation/remote-actor-document.ts`) requires absolute `id`/`inbox` plus a known actor `type`, and surfaces `publicKeyPem`/`publicKeyJwk`. Publication side: `GET /.well-known/host-meta` (`src/routes/federation.ts:68`, XRD rendered by `src/federation/webfinger.ts:115`) and `GET /.well-known/webfinger` (`src/routes/federation.ts:86`, resolution in `src/federation/local-webfinger.ts:51`), both gated by `config.federation.enabled` and answering only for characters with `federation_consent = 1` on this origin — foreign host, unknown handle, unpublished character and ambiguous slug all 404, so neither route enumerates accounts. Tests: `src/federation/webfinger.test.ts` (acct parse matrix, XRD link parsing incl. `data-rel` decoy + entity decoding, template application), `src/federation/remote-actor.test.ts` (host-meta 404 / HTML / throw / custom template / SSRF / HTTPS-only / typed failures, plus a real loopback server exercising the default `safeFetch` path: actor fetch, host-meta 404 fallback, 404 actor, refused redirect) and `src/routes/federation-webfinger.test.ts` (gating, JRD shape, slug derivation, consent, ambiguity, foreign actor URI, malformed `/users/%ZZ` → 404 not 500) — `bun test` 45 pass across the three files (98 across the six federation suites); `bunx tsc --noEmit`, scoped `eslint`, `bun scripts/check-file-size.ts` clean. Out of scope and still `FEAT-activitypub-federation`: actor documents at `/users/:id` (no inbox/outbox exist yet), so the WebFinger `self` link identifies the actor URI only.
