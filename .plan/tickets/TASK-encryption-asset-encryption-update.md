<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Update Asset Encryption for Algorithm Extensibility

**Status:** ■ Not Started
**Priority:** Medium
**Epic:** epic-crypto
**Parent:** TASK-encryption-asset-encryption.md

## Summary

Update asset encryption to use the new algorithm factory pattern. This will allow configurable encryption algorithms for asset storage instead of hardcoded AES-256-GCM.

## Requirements

1. Refactor `encryptAssetBlob` to accept algorithm parameter
2. Refactor `decryptAssetBlob` to accept algorithm parameter
3. Use algorithm factory for instantiation
4. Add algorithm selection to asset metadata
5. Maintain backward compatibility with existing encrypted assets

## Implementation

```typescript
// src/crypto/asset-encryption.ts
interface AssetEncryptionOptions {
  algorithm?: string; // e.g., "aes-256-gcm", "chacha20-poly1305"
  keyId: string;
  tier: string;
}

export async function encryptAssetBlob(
  plaintext: Buffer,
  chatKey: ChatKey,
  options: AssetEncryptionOptions,
): Promise<AssetEncryptionResult> {
  const algorithm = algorithmFactory.getAlgorithm(options.algorithm || "aes-256-gcm",);
  if (!algorithm) {
    throw new Error(`Unknown encryption algorithm: ${options.algorithm}`,);
  }
  // Use algorithm.encrypt() instead of hardcoded AES-GCM
}
```

## Dependencies

- `TASK-crypto-algorithm-factory.md`
- `TASK-encryption-asset-encryption.md` (existing)

## Files to Modify

- `src/crypto/asset-encryption.ts`
- `src/assets/service.ts`
- `src/db/schema-content.ts` (if needed)
