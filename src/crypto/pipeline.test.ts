// hint: Structural and logic conflict. Both design and behavior differ.
describe("error paths", () => {
  test("decrypt with wrong key throws", async () => {
    const wrongKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256, }, true, [
      "encrypt",
      "decrypt",
    ],);
    const encrypted = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    await expect(decryptThenDecompress(encrypted, wrongKey,),).rejects.toThrow("Decryption failed",);
  });

  test("malformed JSON payload throws", async () => {
    await expect(decryptThenDecompress("not-json", cryptoKey,),).rejects.toThrow("Malformed encrypted payload",);
  });

  test("payload missing required fields throws", async () => {
    await expect(decryptThenDecompress(JSON.stringify({},), cryptoKey,),).rejects.toThrow(
      "missing required fields",
    );
  });

  test("payload with missing enc field throws", async () => {
    await expect(
      decryptThenDecompress(JSON.stringify({ nonce: "aaa", algo: "aes-256-gcm", },), cryptoKey,),
    ).rejects.toThrow("missing required fields",);
  });

  test("payload with unknown algo field throws (downgrade detection)", async () => {
    const encrypted = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    const payload = JSON.parse(encrypted,) as {
      enc: string;
      nonce: string;
      algo: string;
      comp: boolean;
      compAlgo?: string;
      key_id: string;
    };
    payload.algo = "aes-128-cbc";
    await expect(decryptThenDecompress(JSON.stringify(payload,), cryptoKey,),).rejects.toThrow(
      "Unsupported encryption algorithm",
    );
  });

  test("tampered ciphertext (flip last byte) throws", async () => {
    const encrypted = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    const payload = JSON.parse(encrypted,) as {
      enc: string;
      nonce: string;
      algo: string;
      comp: boolean;
      compAlgo?: string;
      key_id: string;
    };
    // Tamper: flip last base64 char
    const lastChar = payload.enc[payload.enc.length - 1];
    const flipped = lastChar === "A" ? "B" : "A";
    payload.enc = payload.enc.slice(0, -1,) + flipped;
    await expect(decryptThenDecompress(JSON.stringify(payload,), cryptoKey,),).rejects.toThrow();
  });

  test("tampered nonce throws", async () => {
    const encrypted = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    const payload = JSON.parse(encrypted,) as {
      enc: string;
      nonce: string;
      algo: string;
      comp: boolean;
      compAlgo?: string;
      key_id: string;
    };
    payload.nonce = payload.nonce.slice(0, -2,) + "AA";
    await expect(decryptThenDecompress(JSON.stringify(payload,), cryptoKey,),).rejects.toThrow();
  });
});
