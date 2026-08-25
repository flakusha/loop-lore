# FEAT: transport compression - wire receive-side decompression with limits or remove dead decorator

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Location: src/transport/compression.ts (decompress export, withCompression), src/transport/factory.ts createProtocol.

State: withCompression wraps only send(); decompress() has zero production callers (createProtocol is referenced only by transport tests and upgrade.ts scaffolding; the live server path is Elysia + static-files). The unwired receive side also lacks the zip-bomb guards safeDecompress enforces (raw gunzipSync/brotliDecompressSync/Bun.zstdDecompressSync on peer-supplied bytes).

Decision needed:
a) wire it: negotiation picks algorithm; inbound frames decompressed via a bounded helper (reuse src/utils/safe-buffer/compression.ts safeDecompress semantics - size + ratio caps) before the inner handler
b) remove: delete decompress + withCompression + factory compression plumbing until a consumer exists

Do not ship option (a) without caps - an unbounded gunzip on network input is an OOM DoS.

Acceptance:
- [ ] either wired with tests incl. bomb-payload rejection, or code removed
- [ ] knip clean either way

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
