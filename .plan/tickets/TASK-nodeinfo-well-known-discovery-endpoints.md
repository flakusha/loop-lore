<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NodeInfo and well-known discovery endpoints for federation

**Status:** ✅ Implemented
**Priority:** medium
**Effort:** Medium
**Epic:** epic-federation-swarm-sync.md
**Related:** BUG-remote-actor-discovery-webfinger-resolve-host-meta-absent, TASK-instance-state-advertisement-endpoint

## Summary

Add NodeInfo (`/.well-known/nodeinfo` + `/nodeinfo/2.x`) and host-meta/WebFinger
well-known endpoints so peer instances and the fediverse can discover and describe
this server's software, version, and protocols.

## Context

`BUG-remote-actor-discovery-webfinger-resolve-host-meta-absent` already flags the
missing remote-discovery surface (WebFinger, host-meta). A grep of `src/routes` and
the planned activitypub area returns zero hits for `nodeinfo`, `well-known`,
`host-meta`, `webfinger`. No discovery endpoints exist. This ticket owns the
instance-level discovery surface that mesh/federation peers consume.

## Direction

1. `/.well-known/nodeinfo` → JSON linking to the NodeInfo schema version URL
   (`http://nodeinfo.diaspora.software/ns/schema/2.1`).
2. `/nodeinfo/2.1` → software name (`loop-lore`), version (from a single source of
   truth — package version or build constant), protocols (`activitypub`), and
   `openRegistrations` (false until registration is opened).
3. `.well-known/host-meta` + WebFinger for actor discovery, gated by the existing
   federation opt-in (do not advertise when federation is disabled).
4. Content must not leak instance counts, user identifiers, or internal topology.

## Acceptance Criteria

- [ ] `/.well-known/nodeinfo` and `/nodeinfo/2.1` return valid NodeInfo 2.1 JSON.
- [ ] Version field sourced from a single build/package constant, not duplicated.
- [ ] Endpoints unmounted (or 404) when federation is disabled.
- [ ] No user/actor enumeration leak in the discovery payloads.
- [ ] Tests cover shape + gating.
- [ ] `bun run check` green.
