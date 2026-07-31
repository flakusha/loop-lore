# TASK: Crypto Plugin Hooks

**Status:** ■ Not Started
**Priority:** High
**Epic:** epic-crypto
**Parent:** TASK-crypto-algorithm-factory.md

## Summary

Add crypto plugin hooks to enable runtime algorithm registration. This allows plugins to register new encryption/compression algorithms dynamically.

## Requirements

1. Add `onCryptoAlgorithmRegister` hook to plugin system
2. Create hook registration point in crypto module
3. Implement hook execution flow for algorithm registration
4. Support plugin-based algorithm discovery

## Implementation

```typescript
// Plugin system extension
interface CryptoPlugin extends Plugin {
  hooks: {
    'onCryptoAlgorithmRegister'?: (algorithm: CryptoAlgorithm) => void;
  };
}

function registerCryptoAlgorithm(algorithm: CryptoAlgorithm): void {
  // Trigger hook for registered plugins
  plugins.forEach(plugin => {
    if (plugin.hooks['onCryptoAlgorithmRegister']) {
      plugin.hooks['onCryptoAlgorithmRegister'](algorithm);
    }
  });
}
```

## Dependencies

- `TASK-crypto-algorithm-factory.md`
- `TASK-crypto-config-algorithm.md`

## Files to Modify

- `src/plugins/hooks.ts`
- `src/crypto/algorithm-factory.ts` (integration)
- `docs/spec/plugin-hooks.md` (documentation)