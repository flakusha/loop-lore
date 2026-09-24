---
hash: compress-negotiate-fallback

git issue: 996cae7


**Summary:** negotiate() falls back to CompressionAlgorithm.None when client requests supported algorithm that is not in serverCaps.compression list.
**Context:** src/transport/negotiation.ts:80-83 — break instead of return means if zstd not in serverCaps, we fall through to gzip, not None.
**Acceptance Criteria:** (none)

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: negotiate() falls back to CompressionAlgorithm.None when client requests an algorithm the server supports but the serverCaps order does not match

**Status:** done
**Reason:** Accept-Encoding is the client's preference list; servers pick from the intersection, honoring client-preferred ordering — this is the standard per RFC 7231. Server-first iteration reverses client priority and would violate RFC. The None fallback when no intersection exists is also RFC-correct (treats as "no acceptable encoding, send uncompressed"). The scout's "server metadata will lie" claim is wrong: the server compresses with the negotiated (intersection) value — both ends agree. No defect.
**Priority:** n/a  **Effort:** n/a

## Summary

`src/transport/negotiation.ts:79-84` iterates over the client's `Accept-Encoding` list and picks the **first** algorithm that appears in `serverCaps.compression`:

```ts
for (const candidate of acceptEncoding) {
  if (serverCaps.compression.includes(candidate,)) {
    compression = candidate;
    break;
  }
}
```

`serverCaps.compression` is ordered `[Zstd, Brotli, Gzip]` (DEFAULT_CAPABILITIES). The bug: if the client sends `Accept-Encoding: gzip, br, zstd` (gzip preferred) but `serverCaps.compression = [zstd, br, gzip]` (server prefers zstd), the loop picks `gzip` (first match) — correct behavior.

However, if the client sends `Accept-Encoding: gzip` and `serverCaps.compression = [zstd, br]` (gzip not in server list), the loop never matches and `compression` remains `CompressionAlgorithm.None`. This is correct — no fallback to an unrequested algorithm.

The actual bug is more subtle: the loop should apply **server preference ordering** (pick the server's highest-priority algorithm that the client also accepts), but it applies **client preference ordering** (pick the client's first acceptable algorithm). This is a semantic mismatch: if the client sends `Accept-Encoding: gzip, zstd` and the server's `serverCaps.compression = [zstd, br, gzip]`, the server will advertise zstd in its response metadata but the negotiated algorithm will be `gzip` (client-first).

In `withCompression.connect()`, the metadata will contain `compression: algorithm` set to the negotiated value, which is the client's preferred algorithm rather than the server's preferred algorithm. If the server then compresses with a different algorithm than the metadata indicates, the peer will decompress with the wrong algorithm.

## Defect Summary

`src/transport/negotiation.ts:79-84`: the compression selection loop picks the client's most-preferred algorithm that the server also supports, rather than the server's most-preferred algorithm that the client also supports. The server's `serverCaps.compression` order is authoritative for which algorithm is used; the client order should only filter which server algorithms are available.

## Fix Outline

Reverse the iteration: iterate over `serverCaps.compression` (server preference order) and check whether each appears in `acceptEncoding` (client accepted):

```ts
for (const candidate of serverCaps.compression) {
  if (acceptEncoding.includes(candidate,)) {
    compression = candidate;
    break;
  }
}
```

## Existing-Ticket-Check-Result

No prior BUG ticket found for `negotiate compression fallback`. grep over `.plan/tickets/` for `compression.*first|compress.*algorithm|CompressionAlgorithm\.None` returned no BUG-* matches for this specific negotiation semantic. Not a duplicate.
