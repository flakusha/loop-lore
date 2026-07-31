# TASK: Crypto Algorithm Factory

**Status:** ■ Not Started
**Priority:** High
**Epic:** epic-crypto
**Parent:** TASK-encryption-architecture-clarification

## Summary

Implement algorithm factory pattern to enable extensible crypto operations. This will allow dynamic algorithm selection at runtime without modifying core crypto code.

## Requirements

1. Create a central algorithm registry
2. Implement factory methods: `createEncryptor(algorithmId)`, `createDecryptor(algorithmId)`
3. Add backward compatibility for AES-256-GCM
4. Support multiple algorithm types (encryption, compression, key derivation)

## Implementation

```typescript
interface AlgorithmFactory {
  register(algorithm: CryptoAlgorithm,): void;
  getAlgorithm(id: string,): CryptoAlgorithm | undefined;
  listAlgorithms(type?: "encryption" | "compression" | "key-derivation",): CryptoAlgorithm[];
  createEncryptor(algorithmId: string, key: CryptoKey,): Encryptor;
  createDecryptor(algorithmId: string, key: CryptoKey,): Decryptor;
}

// Example implementation
const algorithmFactory = new AlgorithmFactory();

class AES256GCM implements CryptoAlgorithm {
  id: "aes-256-gcm";
  type: "encryption";
  keyLength: 32;
  nonceLength: 12;
  encrypt: (data: Uint8Array, key: CryptoKey,) => Promise<Uint8Array>;
  decrypt: (data: Uint8Array, key: CryptoKey,) => Promise<Uint8Array>;
}

algorithmFactory.register(new AES256GCM(),);
```

## Dependencies

- `TASK-crypto-plugin-hooks.md` (for plugin registration)
- `TASK-crypto-config-algorithm.md` (for config integration)

## Files to Modify

- `src/crypto/algorithm-factory.ts`
- `src/crypto/index.ts` (export factory)
- `docs/spec/algorithms.md` (algorithm spec)
