# TASK: Crypto Configuration Algorithm

**Status:** ■ Not Started
**Priority:** Medium
**Epic:** epic-crypto
**Parent:** TASK-crypto-plugin-hooks.md

## Summary

Add configuration fields for algorithm selection in system settings. This will allow users and admins to choose encryption/compression algorithms dynamically.

## Requirements

1. Add `encryption.algorithm` and `compression.algorithm` config fields
2. Implement config-driven algorithm selection
3. Add default fallback algorithm
4. Support multiple algorithm types

## Implementation

```typescript
// In config.ts
interface CryptoConfig {
  encryption: {
    algorithm: string;
    default: "aes-256-gcm";
  };
  compression: {
    algorithm: string;
    default: "gzip";
  };
}

// Usage
const config = loadConfig();
const encryptionAlgorithm = config.encryption.algorithm || config.encryption.default;

// In crypto/algorithm-factory.ts
function getAlgorithmFromConfig(algorithmName: string): CryptoAlgorithm | null {
  const factory = algorithmFactory;
  return factory.getAlgorithm(algorithmName) || factory.getAlgorithm(config.encryption.default);
}
```

## Dependencies

- `TASK-crypto-algorithm-factory.md`
- `TASK-crypto-plugin-hooks.md`

## Files to Modify

- `src/config/sections/encryption.ts`
- `src/config/sections/compression.ts`
- `src/crypto/algorithm-factory.ts`
- `docs/config/algorithm-config.md`