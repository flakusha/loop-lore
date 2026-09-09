// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { pskCipher, } from "./cipher";
import { createMeshClock, } from "./clock";

const SECRET = "mesh-test-psk";

describe("pskCipher", () => {
  test("seal → open roundtrips bytes, opaque to content", async () => {
    const cipher = pskCipher(SECRET,);
    const ciphertext = await cipher.seal(new TextEncoder().encode("hello mesh",),);
    expect(ciphertext,).not.toContain("hello",);
    expect(new TextDecoder().decode(await cipher.open(ciphertext,),),).toBe("hello mesh",);
  });

  test("wrong secret fails to open", async () => {
    const ciphertext = await pskCipher(SECRET,).seal(new TextEncoder().encode("x",),);
    await expect(pskCipher("wrong-secret",).open(ciphertext,),).rejects.toThrow();
  });
});

describe("createMeshClock", () => {
  test("tick is monotonic within a wall-clock burst", () => {
    const clock = createMeshClock(() => 1_000);
    expect([clock.tick(), clock.tick(), clock.tick(),],).toEqual([1_000, 1_001, 1_002,],);
  });

  test("tick follows the wall clock forward", () => {
    let now = 1_000;
    const clock = createMeshClock(() => now);
    expect(clock.tick(),).toBe(1_000,);
    now = 5_000;
    expect(clock.tick(),).toBe(5_000,);
  });

  test("observe adopts higher remote stamps", () => {
    const clock = createMeshClock(() => 1_000);
    clock.tick();
    clock.observe(9_000,);
    expect(clock.tick(),).toBe(9_001,);
    clock.observe(100,);
    expect(clock.tick(),).toBe(9_002,);
  });
});
