<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: SNI multi-certificate serving for multiple domains

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-certificate-and-tls-management.md

## Summary

Bun.serve supports serving multiple TLS certificates via SNI (Server Name Indication) by passing arrays of `{ key, cert, serverName }` to `tls`. No ticket exists for multi-domain deployments. Elysia has a known limitation (GitHub issue #1333) — it only uses the first cert pair, so this ticket must work at the Bun.serve level.

## Current state

- `src/server/start.ts` passes single `{ key, cert }` pair
- Bun supports `tls: [{ key, cert, serverName: 'a.com' }, { key, cert, serverName: 'b.com' }]`
- Elysia issue #1333: forced to use Bun.serve directly for multi-cert, breaks Elysia-specific features
- No config surface for multiple certificates

## Direction

1. Add `tls.certificates` config array: `[{ key, cert, serverName }]` as alternative to single `tls.{key,cert}`
2. When `certificates` array is provided, pass it directly to `Bun.serve({ tls: certificates })`
3. Fallback: if no SNI match, use first certificate in array
4. Config validation: each entry must have key+cert; serverName optional for first (default)
5. Document Elysia limitation: multi-cert requires Bun.serve-level handling, Elysia plugins may not work

## Acceptance criteria

- [ ] Multiple certificates configurable via `tls.certificates` array
- [ ] SNI selects correct certificate per hostname
- [ ] Fallback to first cert when no SNI match
- [ ] Config validation rejects entries missing key/cert
- [ ] Test: TLS connection to domain A serves cert A; domain B serves cert B

