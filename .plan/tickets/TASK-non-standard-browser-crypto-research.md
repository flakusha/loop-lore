<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Non-Standard Browser Crypto Research (Umbrella)

**Status:** 🟡 In Progress — split into 2 child tickets
**Priority:** Medium
**Effort:** Med
**Epic:** epic-non-standard-browser-crypto

## Goal

Research JS and WASM-compiled crypto libraries for browser-side encryption
beyond the WebCrypto API, and design data-consistency hashing for encrypted
storage. Recommend an integration path and a concrete hashing/schema migration.

## Status

- **Library / algorithm / benchmark / bundle / CSP research**: ⬜ Not Started — see `TASK-crypto-library-research.md`
- **Content hash consistency (hashing migration + schema)**: ⬜ Not Started — see `TASK-content-hash-consistency.md`

## Children

- `TASK-crypto-library-research.md` — library evaluation, algorithm comparison, benchmarks, bundle-size analysis, CSP impact, integration/fallback-chain design
- `TASK-content-hash-consistency.md` — required-hashing migration + schema changes (independent of research; research only informs integration design)

## Shared Context

Current browser crypto (`src/frontend/browser-crypto.ts`) uses only the
WebCrypto API (AES-256-GCM). Limitations: no ChaCha20-Poly1305, no Argon2id,
no post-quantum algorithms, limited key-derivation options.

`browser-crypto.ts` exports `browserEncryptContent`, `browserDecryptContent`,
`browserImportKey`, `browserExportKey`, `browserGenerateKey`. The proposed
`CryptoProvider` abstraction chains providers as: libsodium (WASM, best
algorithms) → noble (pure JS) → WebCrypto (native, limited).

## Risk

Low — research only, no production code changes (until the migration ticket
lands concrete schema/code work).

## Timebox

2-3 days for research + benchmarks.
