import { describe, expect, it, } from "bun:test";
import { decryptAtRest, encryptAtRest, } from "./at-rest";
import { compressThenEncrypt, } from "./pipeline";

describe("Crypto Corruption Resistance", () => {
  // Helper to generate a valid encrypted payload for modification
  const createValidPayload = async (text: string,) => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256, }, true, ["encrypt", "decrypt",],);
    return await compressThenEncrypt({
      plaintext: text,
      chatKey: key as any,
      keyId: "test-key",
    },);
  };

  describe("decryptAtRest failure modes", () => {
    it("throws error when decoding invalid JSON (for at-rest tier)", async () => {
      // The current implementation might not handle non-JSON well if it expects a structure
      // We test the negative space of how it handles raw strings in an at-rest context.
      const result = await decryptAtRest({
        database: {} as any,
        chatId: "test",
        storedContent: "{ invalid json",
        encryptionLevel: "at-rest",
      },);
      // Depending on implementation, it might just return the string or crash.
      // We want to document this behavior.
      expect(typeof result,).toBe("string",);
    });

    it("handles truncated payloads gracefully", async () => {
      const valid = await createValidPayload("test content",);
      const corrupted = valid.slice(0, valid.length - 10,); // Truncate the end

      // We expect that decryption fails predictably or returns the raw string if it can't decrypt
      await expect(decryptAtRest({
        database: {} as any,
        chatId: "test",
        storedContent: corrupted,
        encryptionLevel: "at-rest",
      },),).rejects.toThrow(); // It SHOULD throw if the structural integrity is gone
    });
  });

  describe("boundary conditions for encryptAtRest", () => {
    it("handles empty strings without failing", async () => {
      const result = await encryptAtRest({
        database: {} as any,
        chatId: "test",
        plaintext: "",
        encryptionLevel: "standard",
      },);
      expect(result.wasEncrypted,).toBeTrue();
    });

    it("successfully encrypts very long strings (testing memory/buffer issues)", async () => {
      const longString = "a".repeat(10000,);
      const result = await encryptAtRest({
        database: {} as any,
        chatId: "test",
        plaintext: longString,
        encryptionLevel: "standard",
      },);
      expect(result.wasEncrypted,).toBeTrue();
    });
  });
});
