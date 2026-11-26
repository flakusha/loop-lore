<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Honeypot operations

Everything here is opt-in. The decoy listener is a standalone process and is
never autostarted with the app; local classification only writes advisory
rows, and mesh intel never blocks or delists on its own.

## Kill switches

| Surface | Off switch | Default |
| --- | --- | --- |
| Decoy process | do not start `src/honeypot/cli.ts` | not running |
| Local classification | `HONEYPOT_CLASSIFICATION=0` | on when started |
| Mesh intel | `HONEYPOT_MESH_INTEL=0` | on when the federation surface mounts |
| Tarpit delays | `HONEYPOT_TARPIT_MS=0` | 0 (off) |

`HONEYPOT_HOST`, `HONEYPOT_PORT`, and `HONEYPOT_CONFIG` select the bind and
the optional TOML deny rules. The listener defaults to loopback.

## Public exposure preflight

Binding the decoy to a non-loopback host requires `auth.required=true` in the
real app config; otherwise the fake admin pages are indistinguishable from an
unauthenticated real app. The CLI refuses a public bind with a clear error and
exit code 2. Keep the decoy on a dedicated port, never behind the app's real
tls/auth surface.

## Mesh intel and provenance

`/api/mesh/intel/push` and `/api/mesh/intel/pull` are PSK-authenticated and
trusted-peer gated, with a bounded `mesh-intel` rate policy. Records carry a
`sourcePeer` that must equal the authenticated origin; a peer cannot attribute
intel to another peer.

The shared mesh PSK authenticates the mesh, **not an individual member**. A
valid proof means "a trusted mesh member sent this", never "this specific
peer authored it". Treat every feed as advisory, require operator review
before any manual block, and never use these rows as evidence of a compromise.
Per-peer cryptographic attribution needs ed25519/RFC 9421 signing and is not
implemented here.

The decoy's `robots.txt` points crawlers at inert fixtures. Its
`/report-security` page accepts no input: reports must travel out of band and
white-hat status needs human confirmation. No decoy credential is accepted by
any real service.
