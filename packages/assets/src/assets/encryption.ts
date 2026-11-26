// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The single "is this asset encrypted?" predicate for the asset codebase.
 *
 * An asset is encrypted when its tier is not `public` AND it carries an
 * `encrypted_key_id` (the `chat_keys.id` the blob was encrypted under).
 * Both halves are needed: a non-public tier without a key id was never
 * actually encrypted, and a key id on a public row is meaningless.
 *
 * Every site that branches on encryption (raw serve, download, preview
 * guard, thumbnail generation) reads it from here so the branches cannot
 * drift apart.
 */

/** The two asset columns the encryption predicate reads. */
export interface EncryptedAssetFields {
  encryption_tier: string;
  encrypted_key_id: string | null;
}

/**
 * Whether an asset row describes an encrypted asset.
 * @param asset - The asset's encryption columns.
 * @returns True when the asset blob is encrypted.
 */
export function isEncryptedAsset(asset: EncryptedAssetFields,): boolean {
  return asset.encryption_tier !== "public" && Boolean(asset.encrypted_key_id,);
}
