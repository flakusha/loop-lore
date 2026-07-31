# TASK: Crypto Algorithm Tests

**Status:** ■ Not Started
**Priority:** Medium
**Epic:** epic-crypto
**Parent:** TASK-encryption-backward-compatibility.md

## Summary

Create comprehensive tests for algorithm extensibility. This includes unit tests for new algorithm implementations, integration tests for the full pipeline, and tests for algorithm switching scenarios.

## Requirements

1. Unit tests for algorithm factory registration and retrieval
2. Integration tests for full encrypt/decrypt pipeline with multiple algorithms
3. Tests for algorithm switching via configuration
4. Tests for plugin-based algorithm registration
5. Backward compatibility tests for legacy payloads
6. Performance benchmarks for different algorithms

## Test Scenarios

```typescript
// Test algorithm factory
describe("AlgorithmFactory", () => {
  test("registers and retrieves AES-256-GCM", () => {
    const factory = new AlgorithmFactory();
    factory.register(aes256gcmAlgorithm,);
    expect(factory.getAlgorithm("aes-256-gcm",),).toBeDefined();
  });

  test("falls back to default algorithm", () => {
    const factory = new AlgorithmFactory();
    factory.register(aes256gcmAlgorithm,);
    expect(factory.getAlgorithm("unknown-algo",),).toBeUndefined();
    expect(factory.getAlgorithm("aes-256-gcm",),).toBeDefined();
  });
});

// Test pipeline with different algorithms
describe("Pipeline with Algorithm Switching", () => {
  test("encrypts and decrypts with AES-256-GCM", async () => {
    const plaintext = "test message";
    const key = await generateKey("aes-256-gcm",);
    const encrypted = await compressThenEncrypt(plaintext, key, "key-id", { algorithm: "aes-256-gcm", },);
    const decrypted = await decryptThenDecompress(encrypted, key,);
    expect(decrypted,).toBe(plaintext,);
  });

  test("handles algorithm not found gracefully", async () => {
    const plaintext = "test message";
    const key = await generateKey("aes-256-gcm",);
    await expect(compressThenEncrypt(plaintext, key, "key-id", { algorithm: "unknown", },),)
      .rejects.toThrow("Unknown encryption algorithm",);
  });
});

// Test plugin registration
describe("Plugin Algorithm Registration", () => {
  test("registers algorithm via plugin hook", async () => {
    const plugin = createMockPlugin({
      hooks: { "onCryptoAlgorithmRegister": (algo,) => algorithmFactory.register(algo,), },
    },);
    await pluginManager.enablePlugin(plugin.id,);
    expect(algorithmFactory.getAlgorithm("chacha20-poly1305",),).toBeDefined();
  });
});
```

## Dependencies

- All previous crypto extensibility tasks

## Files to Create

- `src/crypto/algorithm-factory.test.ts`
- `src/crypto/pipeline-algorithm.test.ts`
- `src/crypto/asset-encryption-algorithm.test.ts`
- `src/plugins/crypto-hooks.test.ts`
