// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The pinned password hashing algorithm. Bun's `Bun.password.hash` default
 * is argon2id with the same cost parameters, so rows written before the pin
 * keep verifying while the algorithm no longer depends on the runtime
 * default (TASK-auth-hardening-xff-trust-session-cap-algo-pin-derive-short-c).
 */
export const PASSWORD_HASH_ALGORITHM = "argon2id";

/** Memory cost (KiB) of the pinned argon2id parameters. */
export const PASSWORD_HASH_MEMORY_COST = 65536;

/** Time cost (iterations) of the pinned argon2id parameters. */
export const PASSWORD_HASH_TIME_COST = 2;

/**
 * @param password
 * @returns The password hash, using the pinned algorithm and parameters.
 */
export async function hashPassword(password: string,): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: PASSWORD_HASH_ALGORITHM,
    memoryCost: PASSWORD_HASH_MEMORY_COST,
    timeCost: PASSWORD_HASH_TIME_COST,
  },);
}

/**
 * @param password
 * @param hash
 * @returns Whether the password matches the stored hash.
 */
export async function verifyPassword(password: string, hash: string,): Promise<boolean> {
  return Bun.password.verify(password, hash, PASSWORD_HASH_ALGORITHM,);
}
