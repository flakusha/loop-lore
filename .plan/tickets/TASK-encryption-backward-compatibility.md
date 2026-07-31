# TASK: Crypto Backward Compatibility

**Status:** ■ Not Started
**Priority:** Medium
**Epic:** epic-crypto
**Parent:** TASK-crypto-config-algorithm.md

## Summary

Implement backward compatibility checks and graceful fallbacks for algorithm selection. Ensure existing encrypted assets and messages remain accessible when new algorithms are introduced.

## Requirements

1. Add algorithm validation on registration (key sizes, nonce sizes)
2. Implement graceful fallback to default algorithm when requested algorithm not found
3. Add versioning to encrypted payloads for algorithm identification
4. Update decryption logic to handle legacy algorithm formats
5. Add migration path for algorithm deprecation

## Implementation

```typescript
// Algorithm validation
interface CryptoAlgorithm {
  id: string;
  type: "encryption" | "compression" | "key-derivation";
  keyLength: number;    // Must be 16, 24, or 32 for AES variants
  nonceLength: number;  // Must be 12 for AES-GCM
  validate(): boolean;  // Self-validation
}

// Payload versioning
interface EncryptedPayloadV1 {
  enc: string;
  nonce: string;
  algo: string;         // Algorithm ID
  version: 1;
  comp: boolean;
  compAlgo?: string;
  key_id: string;
}

// Decryption with fallback
export async function decryptThenDecompress(
  storedContent: string,
  chatKey: CryptoKey,
  fallbackAlgorithm: string = "aes-256-gcm"
): Promise<string> {
  const payload = parsePayload(storedContent);
  const algorithm = algorithmFactory.getAlgorithm(payload.algo) || 
                   algorithmFactory.getAlgorithm(fallbackAlgorithm);
  
  if (!algorithm) {
    throw new Error(`No valid algorithm found for ${payload.algo}`);
  }
  // Proceed with decryption
}
```

## Dependencies

- `TASK-crypto-algorithm-factory.md`
- `TASK-crypto-plugin-hooks.md`
- `TASK-crypto-config-algorithm.md`

## Files to Modify

- `src/crypto/algorithm-factory.ts`
- `src/crypto/pipeline.ts`
- `src/crypto/asset-encryption.ts`
- `src/db/schema-content.ts` (for version field if needed)