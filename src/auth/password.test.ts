// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  hashPassword,
  PASSWORD_HASH_ALGORITHM,
  PASSWORD_HASH_MEMORY_COST,
  PASSWORD_HASH_TIME_COST,
  verifyPassword,
} from "./password";

const PINNED_PREFIX =
  `$${PASSWORD_HASH_ALGORITHM}$v=19$m=${PASSWORD_HASH_MEMORY_COST},t=${PASSWORD_HASH_TIME_COST},p=1$`;

describe("password hashing", () => {
  test("hashPassword pins the argon2id algorithm and parameters", async () => {
    const hash = await hashPassword("correct horse battery staple",);
    expect(hash.startsWith(PINNED_PREFIX,),).toBe(true,);
    expect(await verifyPassword("correct horse battery staple", hash,),).toBe(true,);
  });

  test("a hash written with the pre-pin default still verifies", async () => {
    // Rows created before the pin used Bun's default (argon2id, m=65536, t=2),
    // so pinning the algorithm must not lock those users out.
    const legacy = await Bun.password.hash("legacy-secret",);
    expect(legacy.startsWith(PINNED_PREFIX,),).toBe(true,);
    expect(await verifyPassword("legacy-secret", legacy,),).toBe(true,);
  });

  test("a wrong password does not verify", async () => {
    const hash = await hashPassword("right-secret",);
    expect(await verifyPassword("wrong-secret", hash,),).toBe(false,);
  });

  test("a hash written with another algorithm still verifies", async () => {
    // Rows an older install carries (bcrypt) must keep working: the pin
    // applies to hashing, not to verifying what already exists.
    const bcrypt = await Bun.password.hash("other-secret", "bcrypt",);
    expect(bcrypt.startsWith("$2",),).toBe(true,);
    expect(await verifyPassword("other-secret", bcrypt,),).toBe(true,);
    expect(await verifyPassword("wrong-secret", bcrypt,),).toBe(false,);
  });
});
